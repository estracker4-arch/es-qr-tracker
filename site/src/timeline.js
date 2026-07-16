/*
 * The spine. Scroll position is the time of day.
 * One normalised t (0..1) drives sun azimuth/elevation, colour temperature,
 * tracker angle, ring fill, fog, and camera. All piecewise-linear.
 * The tracker gets NO easing anywhere. Machines don't ease.
 */

// keyframes: [t, azimuthDeg, elevationDeg, kelvin, trackerDeg]
const KEYS = [
  [0.00,  68, -8, 1800, -55],
  [0.08,  72, -2, 2000, -55],
  [0.18,  80,  8, 2400, -55],
  [0.30,  95, 22, 3200, -50],
  [0.45, 122, 42, 4300, -28],
  [0.50, 180, 62, 5800,   0],
  [0.58, 208, 54, 5400,  14],
  [0.72, 240, 33, 4400,  38],
  [0.85, 263, 11, 2900,  52],
  [0.95, 276, -3, 2200,  55],
  [1.00, 285, -8, 1900,  55],
];

function seg(t) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t <= KEYS[i + 1][0]) {
      const a = KEYS[i], b = KEYS[i + 1];
      const f = (t - a[0]) / (b[0] - a[0] || 1);
      return { a, b, f };
    }
  }
  const last = KEYS[KEYS.length - 1];
  return { a: last, b: last, f: 0 };
}

const lerp = (a, b, f) => a + (b - a) * f;

// Approximate blackbody kelvin -> normalised RGB.
export function kelvinToRGB(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = v => Math.min(255, Math.max(0, v)) / 255;
  return [c(r), c(g), c(b)];
}

export function sample(t) {
  const { a, b, f } = seg(t);
  const az = lerp(a[1], b[1], f) * Math.PI / 180;
  const el = lerp(a[2], b[2], f) * Math.PI / 180;
  const kelvin = lerp(a[3], b[3], f);
  const tracker = lerp(a[4], b[4], f) * Math.PI / 180;

  // sun direction (y up; azimuth measured from north = -Z, clockwise east)
  const sun = {
    x: Math.cos(el) * Math.sin(az),
    y: Math.sin(el),
    z: -Math.cos(el) * Math.cos(az),
  };

  // daylight factor 0..1 (drives ambient / sky)
  const day = Math.max(0, Math.min(1, (el + 0.05) / 0.6));

  // fog peaks pre-dawn and dusk
  const fog = 0.012 + 0.02 * (1 - day);

  return { t, az, el, kelvin, tracker, sun, day, fog, ring: t };
}

// Camera spline keys: [t, x, y, z, lookX, lookY, lookZ]
// Worm height through Acts 0-3; first lift at Act 4; locked aerial for Act 5;
// settles back to ground at dusk; Act 8 returns to the Act-0 frame.
const CAM = [
  [0.00, -14, 0.4, 26,   40, 2.0, -10],
  [0.08, -14, 0.4, 26,   40, 2.0, -10],
  [0.18, -10, 0.6, 20,   40, 1.6,  -6],
  [0.30,  -6, 0.9, 12,   30, 2.2,  -4],
  [0.45,   2, 1.2,  4,   26, 3.0,   0],
  [0.58,  10, 12.0, 30,  30, 0.0, -20],
  [0.72,  16, 18.0, 42,  30, 0.0, -30],
  [0.85,   6, 2.0, 30,   40, 3.0, -10],
  [0.95,  -4, 1.0, 28,   40, 2.4, -10],
  [1.00, -14, 0.4, 26,   40, 2.0, -10],
];

export function sampleCamera(t) {
  let i = 0;
  while (i < CAM.length - 2 && t > CAM[i + 1][0]) i++;
  const a = CAM[i], b = CAM[i + 1];
  const f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0] || 1)));
  // smoothstep on the camera only (the camera is cinema; the tracker is a machine)
  const s = f * f * (3 - 2 * f);
  return {
    pos:  [lerp(a[1], b[1], s), lerp(a[2], b[2], s), lerp(a[3], b[3], s)],
    look: [lerp(a[4], b[4], s), lerp(a[5], b[5], s), lerp(a[6], b[6], s)],
  };
}

// act window helper: 1 inside [start,end] with soft edges
export function actWindow(t, start, end, edge = 0.02) {
  if (t < start - edge || t > end + edge) return 0;
  if (t < start) return (t - (start - edge)) / edge;
  if (t > end) return ((end + edge) - t) / edge;
  return 1;
}
