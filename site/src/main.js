import '@fontsource/archivo-black/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';

/*
 * Boot. Two prints of the same film:
 *  - webgl: the scroll-driven day (scroll position = time of day)
 *  - static: eight stills, same lines, for reduced-motion and no-WebGL
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// twelve rays for the fixed wordmark ring
const raysG = document.querySelector('.mark-rays');
const rayEls = [];
for (let i = 0; i < 12; i++) {
  const a = (i * 30 * Math.PI) / 180;
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', Math.sin(a) * 42); l.setAttribute('y1', -Math.cos(a) * 42);
  l.setAttribute('x2', Math.sin(a) * 55); l.setAttribute('y2', -Math.cos(a) * 55);
  l.setAttribute('opacity', i === 0 ? 1 : 0.15);
  raysG.appendChild(l);
  rayEls.push(l);
}

if (reduced || !webglOK()) {
  document.body.classList.add('static');
} else {
  document.body.classList.add('webgl');
  boot();
}

async function boot() {
  await document.fonts.ready; // headline planes are canvas-drawn Archivo Black

  const { initScene } = await import('./scene.js');

  const mobile = window.innerWidth < 820 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const quality = mobile
    ? { rows: 12, mods: 128, shadow: 1024 }
    : { rows: 32, mods: 320, shadow: 2048 };

  const canvas = document.getElementById('scene');
  const world = initScene(canvas, quality);

  const ovAct0 = document.getElementById('act0');
  const ovAct6 = document.getElementById('act6');
  const frames = [...ovAct6.querySelectorAll('.frame')];
  const ovAct7 = document.getElementById('act7data');
  const ovAct8 = document.getElementById('act8');
  const oclip = document.getElementById('oclip-rect');

  // damped scroll: user distance is real; motion has inertia; never hijacked
  let target = 0, t = 0, raf = null, idle = false;

  const readScroll = () => {
    const max = document.body.scrollHeight - window.innerHeight;
    target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (idle) { idle = false; raf = requestAnimationFrame(frame); }
  };
  window.addEventListener('scroll', readScroll, { passive: true });

  const clamp01 = v => Math.min(1, Math.max(0, v));
  const win = (v, a, b, e = 0.02) => clamp01(Math.min((v - a) / e, (b - v) / e, 1));

  function overlays(v) {
    // ring: solid half sweeps across from the terminator
    oclip.setAttribute('width', (v * 68).toFixed(2));
    for (let i = 0; i < 12; i++) {
      rayEls[i].setAttribute('opacity', (0.15 + 0.85 * clamp01(v * 12 - i)).toFixed(2));
    }

    // Act 0: hold in the void, release as first light arrives
    const a0 = v < 0.02 ? 1 : clamp01((0.075 - v) / 0.055);
    ovAct0.style.opacity = a0;

    // Act 6: paper world, three locked-off frames, hard machine cuts
    const inSix = v >= 0.72 && v < 0.85;
    ovAct6.style.opacity = inSix ? 1 : 0;
    if (inSix) {
      const f = Math.min(2, Math.floor(((v - 0.72) / 0.13) * 3));
      frames.forEach((el, i) => el.classList.toggle('on', i === f));
    }

    // Act 7: the numbers that matter
    ovAct7.style.opacity = win(v, 0.86, 0.945, 0.03);

    // Act 8: the day closes where it began
    const a8 = clamp01((v - 0.955) / 0.03);
    ovAct8.style.opacity = a8;
    ovAct8.style.pointerEvents = a8 > 0.5 ? 'auto' : 'none';
  }

  function frame() {
    const d = target - t;
    t += d * 0.08;
    if (Math.abs(d) < 0.00005) { t = target; }
    world.update(t);
    overlays(t);
    if (t === target) { idle = true; raf = null; return; }
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { world.resize(); readScroll(); if (idle) { idle = false; frame(); } });

  // keyboard: acts traversable; wheel stays free
  const ACTS = [0, 0.08, 0.18, 0.30, 0.45, 0.58, 0.72, 0.85, 0.955];
  window.addEventListener('keydown', e => {
    if (!['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const max = document.body.scrollHeight - window.innerHeight;
    const cur = target;
    let next = cur;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    else if (e.key === 'PageDown' || e.key === 'ArrowDown') next = ACTS.find(a => a > cur + 0.005) ?? 1;
    else next = [...ACTS].reverse().find(a => a < cur - 0.005) ?? 0;
    window.scrollTo({ top: next * max, behavior: 'auto' });
  });

  readScroll();
  frame();
}
