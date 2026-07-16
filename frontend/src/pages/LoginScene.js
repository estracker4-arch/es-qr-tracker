import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/*
 * The login film, in glass and steel.
 * Two physically-lit solar panels close over the frame like hangar doors.
 * Scroll parts them; a bloomed sun burns through; dust hangs in the shaft;
 * the floor mirrors all of it. One t drives the choreography.
 */

const VOID = 0x08090B;
const SOL = 0xF85A28;

const smooth = f => f * f * (3 - 2 * f);
const clamp01 = v => Math.min(1, Math.max(0, v));

// ---- procedural monocrystalline cell face --------------------------------
function makeCellTexture() {
  const W = 1024, H = 1408;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // black backsheet
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, W, H);

  const cols = 6, rows = 10, gap = 7, m = 18;
  const cw = (W - m * 2 - gap * (cols - 1)) / cols;
  const ch = (H - m * 2 - gap * (rows - 1)) / rows;
  const cham = Math.min(cw, ch) * 0.14; // mono-cell chamfered corners

  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const x = m + q * (cw + gap);
      const y = m + r * (ch + gap);
      const v = 26 + Math.random() * 14;

      g.beginPath();
      g.moveTo(x + cham, y);
      g.lineTo(x + cw - cham, y);
      g.lineTo(x + cw, y + cham);
      g.lineTo(x + cw, y + ch - cham);
      g.lineTo(x + cw - cham, y + ch);
      g.lineTo(x + cham, y + ch);
      g.lineTo(x, y + ch - cham);
      g.lineTo(x, y + cham);
      g.closePath();

      const gr = g.createLinearGradient(x, y, x + cw, y + ch);
      gr.addColorStop(0, `rgb(${v + 10},${v + 20},${v + 44})`);
      gr.addColorStop(0.5, `rgb(${v},${v + 12},${v + 32})`);
      gr.addColorStop(1, `rgb(${v + 5},${v + 15},${v + 38})`);
      g.fillStyle = gr;
      g.fill();

      // crystalline sparkle
      g.save();
      g.clip();
      for (let s = 0; s < 26; s++) {
        const a = 0.03 + Math.random() * 0.07;
        g.fillStyle = `rgba(140,170,220,${a})`;
        g.fillRect(x + Math.random() * cw, y + Math.random() * ch, 1.6, 1.6);
      }
      // busbars
      g.strokeStyle = 'rgba(216,224,238,0.55)';
      g.lineWidth = 1.6;
      for (let b = 1; b <= 3; b++) {
        const bx = x + (cw * b) / 4;
        g.beginPath(); g.moveTo(bx, y); g.lineTo(bx, y + ch); g.stroke();
      }
      // finger lines, faint
      g.strokeStyle = 'rgba(190,205,228,0.08)';
      g.lineWidth = 0.6;
      for (let f = 1; f < 14; f++) {
        const fy = y + (ch * f) / 14;
        g.beginPath(); g.moveTo(x, fy); g.lineTo(x + cw, fy); g.stroke();
      }
      g.restore();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---- dawn sky plate -------------------------------------------------------
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  // near-void sky: a thin warm horizon breath, nothing more
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#08090B');
  grad.addColorStop(0.52, '#0a0c11');
  grad.addColorStop(0.66, '#16100c');
  grad.addColorStop(0.74, '#241309');
  grad.addColorStop(0.8, '#120b07');
  grad.addColorStop(1, '#08090B');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSunSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  // warm ember core: no white anywhere near the eye
  const grad = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,178,110,0.95)');
  grad.addColorStop(0.2, 'rgba(255,122,61,0.85)');
  grad.addColorStop(0.5, 'rgba(198,63,23,0.4)');
  grad.addColorStop(1, 'rgba(198,63,23,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
}

// warm graphite environment for reflections — replaces the white studio
// env map that was flaring the glass
function makeEnvTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#11141a');    // dark zenith
  grad.addColorStop(0.55, '#181c24');
  grad.addColorStop(0.72, '#241608'); // ember band at the horizon, faint
  grad.addColorStop(0.8, '#4a2410');
  grad.addColorStop(0.86, '#1a100a');
  grad.addColorStop(1, '#0a0c10');    // ground
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// vertical god-ray sheet standing in the opened gap
function makeShaftTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 210, 10, 128, 210, 260);
  grad.addColorStop(0, 'rgba(255,140,80,0.5)');
  grad.addColorStop(0.4, 'rgba(228,96,44,0.18)');
  grad.addColorStop(1, 'rgba(198,63,23,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- one panel: frame, glass, cells, backsheet ------------------------------
function buildPanel(cellTex, side) {
  const W = 6.2, H = 8.6, T = 0.16;
  const group = new THREE.Group();

  const alu = new THREE.MeshStandardMaterial({ color: 0x9096a0, metalness: 0.88, roughness: 0.34 });
  const bar = (w, h, d, x, y) => {
    const mBar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), alu);
    mBar.position.set(x, y, 0);
    group.add(mBar);
  };
  bar(W, 0.12, T, 0, H / 2 - 0.06);
  bar(W, 0.12, T, 0, -H / 2 + 0.06);
  bar(0.12, H - 0.24, T, -W / 2 + 0.06, 0);
  bar(0.12, H - 0.24, T, W / 2 - 0.06, 0);

  // cells behind the glass
  const cells = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.2, H - 0.2),
    new THREE.MeshStandardMaterial({ map: cellTex, roughness: 0.6, metalness: 0.35 })
  );
  cells.position.z = 0.02;
  group.add(cells);

  // glass: clearcoat catches the environment as the door swings
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.16, H - 0.16),
    new THREE.MeshPhysicalMaterial({
      color: 0x0a0f18,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 0.9,
      clearcoatRoughness: 0.16,
      envMapIntensity: 0.7,
    })
  );
  glass.position.z = 0.075;
  group.add(glass);

  // backsheet
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.1, H - 0.1),
    new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.9 })
  );
  back.rotation.y = Math.PI;
  back.position.z = -0.04;
  group.add(back);

  group.userData.side = side;
  return group;
}

export function initLoginScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VOID);
  scene.fog = new THREE.FogExp2(VOID, 0.016);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(0, 0.2, 6.6);

  // warm graphite environment for PBR reflections — no white light anywhere
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = makeEnvTexture();
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
  envTex.dispose();

  // sky + sun
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 150),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), fog: false })
  );
  sky.position.set(0, 4, -80);
  scene.add(sky);

  const sun = makeSunSprite();
  sun.position.set(0, 1.4, -46);
  sun.scale.setScalar(0.1);
  scene.add(sun);

  const sunLight = new THREE.DirectionalLight(0xff9a5c, 0);
  sunLight.position.set(0, 3, -30);
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x27303e, 0x0a0806, 0.5));
  const rim = new THREE.DirectionalLight(0xff7a3d, 0.25);
  rim.position.set(6, 4, 8);
  scene.add(rim);

  // cool front fill so the cells read as panels, not black slabs
  const fill = new THREE.DirectionalLight(0x9db2cc, 0.85);
  fill.position.set(-3, 2.5, 10);
  scene.add(fill);

  // light leaking through the closed seam — the film's first frame
  const seam = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 7.4),
    new THREE.MeshBasicMaterial({
      color: 0xff8c50,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  seam.position.set(0, 0, -0.3);
  scene.add(seam);

  // god-ray sheet standing in the opened gap
  const shaft = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 15),
    new THREE.MeshBasicMaterial({
      map: makeShaftTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  shaft.position.set(0, 0.6, -7);
  scene.add(shaft);

  // the doors
  const cellTex = makeCellTexture();
  const left = buildPanel(cellTex, -1);
  const right = buildPanel(cellTex, 1);
  const HALF_W = 3.1; // half of one panel's width
  let coverS = 1;     // scale factor so the closed doors always cover the frame
  left.position.x = -HALF_W;
  right.position.x = HALF_W;
  scene.add(left, right);

  // mirror floor (desktop only — renders the scene twice)
  const wantMirror = window.innerWidth >= 900;
  let floor;
  if (wantMirror) {
    floor = new Reflector(new THREE.PlaneGeometry(120, 80), {
      textureWidth: 1024,
      textureHeight: 1024,
      color: 0x0e1116,
      clipBias: 0.003,
    });
  } else {
    floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 80),
      new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.35, metalness: 0.6 })
    );
  }
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.6;
  scene.add(floor);

  // haze over the mirror so it reads as polished concrete, not water
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 80),
    new THREE.MeshBasicMaterial({ color: VOID, transparent: true, opacity: 0.58 })
  );
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = -3.59;
  scene.add(haze);

  // pre-dawn stars — fade as the sun takes the sky
  const STARS = 520;
  const starGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const az = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI * 0.42 + 0.06;
      const r = 160 + Math.random() * 30;
      pos[i * 3] = Math.cos(el) * Math.sin(az) * r;
      pos[i * 3 + 1] = Math.sin(el) * r * 0.6 + 2;
      pos[i * 3 + 2] = -Math.abs(Math.cos(el) * Math.cos(az)) * r - 30;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xaab4c4,
    size: 0.5,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: false,
    depthWrite: false,
    fog: false,
  }));
  scene.add(stars);

  // light path: the sun's glint running across the polished floor
  const glintTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, 'rgba(255,140,80,0)');
    grad.addColorStop(0.35, 'rgba(255,140,80,0.5)');
    grad.addColorStop(0.75, 'rgba(228,96,44,0.12)');
    grad.addColorStop(1, 'rgba(228,96,44,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const glint = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 58),
    new THREE.MeshBasicMaterial({
      map: glintTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glint.rotation.x = -Math.PI / 2;
  glint.position.set(0, -3.57, -16);
  scene.add(glint);

  // a hairline horizon to ground the frame
  const horizon = new THREE.Mesh(
    new THREE.BoxGeometry(400, 0.05, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x2a313c })
  );
  horizon.position.set(0, -3.55, -75);
  scene.add(horizon);

  // dust in the light shaft
  const DUST = window.innerWidth >= 900 ? 420 : 160;
  const dustGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = -3 + Math.random() * 8;
      pos[i * 3 + 2] = -24 + Math.random() * 26;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffb08a,
    size: 0.045,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  scene.add(dust);

  // bloom — the sun burns
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.85, 0.82);
  composer.addPass(bloom);

  const clock = new THREE.Clock();

  function update(t, mx = 0, my = 0) {
    const el = clock.getElapsedTime();
    const part = smooth(clamp01(t / 0.5));

    // doors: an unlock jolt, then the left leads and the right answers
    const jolt = t < 0.1 ? Math.sin(Math.min(t * 22, Math.PI)) * 0.05 : 0;
    const pL = smooth(clamp01(t / 0.5));
    const pR = smooth(clamp01((t - 0.025) / 0.5));
    left.position.x = (-HALF_W - jolt - pL * 10.8) * coverS;
    right.position.x = (HALF_W + jolt + pR * 10.8) * coverS;
    left.rotation.y = pL * 0.62;
    right.rotation.y = -pR * 0.62;
    // idle breath before the story starts
    const breathe = (1 - part) * Math.sin(el * 0.7) * 0.012;
    left.position.z = right.position.z = breathe;

    // sun wakes as the doors part — a small, intense ember, not a wash
    sun.scale.setScalar(0.1 + part * 7.5);
    sun.material.opacity = 0.1 + part * 0.8;
    sunLight.intensity = part * 1.5;
    bloom.strength = 0.22 + part * 0.5;

    // seam light: burns hardest just before the doors open, dies as the gap widens
    seam.material.opacity = Math.max(0, Math.sin(Math.min(part * 3.2, Math.PI))) * 0.55 * (part < 0.02 ? part * 30 : 1);
    seam.scale.x = 1 + part * 12;

    // a breath of god ray in the gap, retires for the sign-in card
    shaft.material.opacity = part * 0.16 * (1 - clamp01((t - 0.72) / 0.22) * 0.7);

    // dust hangs in the opened shaft
    dust.material.opacity = part * 0.35;
    dust.rotation.y = el * 0.016;
    dust.position.y = Math.sin(el * 0.18) * 0.15;

    // stars surrender to the sun; the floor takes its glint
    stars.material.opacity = (1 - part) * 0.7;
    glint.material.opacity = part * 0.28;

    // camera: dolly through the gap, settle for the card; pointer parallax
    const dolly = smooth(clamp01((t - 0.1) / 0.6));
    camera.position.z = 6.6 - dolly * 2.3;
    camera.position.x += ((mx * 0.5) - camera.position.x) * 0.06;
    camera.position.y += ((0.2 + my * 0.3) - camera.position.y) * 0.06;
    camera.lookAt(0, 0.5, -12);
    // a breath of roll mid-reveal + parallax lean — handheld, alive
    camera.rotation.z = Math.sin(part * Math.PI) * 0.01 - mx * 0.004;

    composer.render();
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // scale the closed doors so they always seal the frame, any aspect
    const dist = 6.6; // camera z at t=0, panels at z~0
    const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visW = visH * camera.aspect;
    coverS = Math.max(visW / (HALF_W * 4 * 0.96), visH / 8.2, 1);
    left.scale.setScalar(coverS);
    right.scale.setScalar(coverS);
  }

  function dispose() {
    renderer.dispose();
    pmrem.dispose();
    composer.dispose();
    cellTex.dispose();
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => {
          if (mm.map) mm.map.dispose();
          mm.dispose();
        });
      }
    });
  }

  resize();
  return { update, resize, dispose };
}
