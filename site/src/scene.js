import * as THREE from 'three';
import { sample, sampleCamera, kelvinToRGB, actWindow } from './timeline.js';

/*
 * The world: arid ground, a survey, a tracker array built from real members.
 * Everything below is driven by one t through update(t).
 * Orange exists here only as light: the directional sun, its disc, the rim
 * on steel, the survey laser dots. No orange surface paint.
 */

const SOL = new THREE.Color('#F85A28');
const VOID = new THREE.Color('#08090B');
const DUSK = new THREE.Color('#101725');
const STEEL_100 = new THREE.Color('#D9DDE2');

export function initScene(canvas, quality) {
  const ROWS = quality.rows;            // 32 desktop / 12 mobile
  const MODS_PER_ROW = quality.mods;    // 320 desktop / 128 mobile
  const MODULE_LEN = 2.1;               // along the torque tube (z)
  const MODULE_W = 1.15;
  const PITCH = 7.0;                    // row pitch (x)
  const TUBE_Y = 2.2;
  const ROW_LEN = MODS_PER_ROW * MODULE_LEN;
  const X0 = -((ROWS - 1) * PITCH) / 2;
  const Z0 = -ROW_LEN / 2;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = VOID.clone();
  scene.fog = new THREE.FogExp2(VOID.clone(), 0.02);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1200);

  // ---- lights -------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffffff, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0x8a97a8, 0x1a1712, 0.0);
  scene.add(hemi);

  // ---- ground -------------------------------------------------------------
  const gGeo = new THREE.PlaneGeometry(1600, 1600, 96, 96);
  {
    const pos = gGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const inField = Math.abs(x) < ROWS * PITCH * 0.7 && Math.abs(y) < ROW_LEN * 0.6;
      const h = inField ? 0 : (Math.sin(x * 0.011) * Math.cos(y * 0.013) * 3 + Math.sin(x * 0.031 + 2) * 1.2);
      pos.setZ(i, h);
    }
    gGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(
    gGeo,
    new THREE.MeshStandardMaterial({ color: 0x4b4741, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- galvanised steel material -------------------------------------------
  // spangle: procedural normal-ish roughness variation via small canvas
  const spangle = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 420; i++) {
      const v = 108 + Math.floor(Math.random() * 40);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 0, 7);
      g.fill();
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  })();

  const steel = new THREE.MeshStandardMaterial({
    color: 0x8a9099,
    roughness: 0.55,
    metalness: 0.85,
    roughnessMap: spangle,
  });

  // ---- the array: posts, torque tubes, modules (instanced) -----------------
  const postGeo = new THREE.BoxGeometry(0.16, TUBE_Y + 1.4, 0.16);
  const POSTS_PER_ROW = Math.floor(ROW_LEN / 14) + 1;
  const posts = new THREE.InstancedMesh(postGeo, steel, ROWS * POSTS_PER_ROW);
  posts.castShadow = posts.receiveShadow = true;
  scene.add(posts);

  const tubeGeo = new THREE.BoxGeometry(0.15, 0.15, ROW_LEN);
  const tubes = new THREE.InstancedMesh(tubeGeo, steel, ROWS);
  tubes.castShadow = true;
  scene.add(tubes);

  const modGeo = new THREE.BoxGeometry(MODULE_W, 0.045, MODULE_LEN - 0.08);
  const modMat = new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.32, metalness: 0.6 });
  const modules = new THREE.InstancedMesh(modGeo, modMat, ROWS * MODS_PER_ROW);
  modules.castShadow = true;
  modules.receiveShadow = true;
  scene.add(modules);

  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3(1, 1, 1);
  const ZAXIS = new THREE.Vector3(0, 0, 1);

  const hash = i => {
    const s = Math.sin(i * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };

  // Build progress: posts rise (act 3 first half), tubes land (second half),
  // modules populate row by row (act 4). Tracker angle applies from act 4 on.
  function layout(t, trackerAngle) {
    const rise = actWindow(t, 0.30, 0.45, 0.001) ? Math.min(1, Math.max(0, (t - 0.30) / 0.15)) : (t > 0.45 ? 1 : 0);
    const popRows = t <= 0.45 ? 0 : t >= 0.58 ? ROWS : ((t - 0.45) / 0.13) * ROWS;

    let pi = 0;
    for (let r = 0; r < ROWS; r++) {
      const x = X0 + r * PITCH;
      for (let p = 0; p < POSTS_PER_ROW; p++) {
        const local = Math.min(1, Math.max(0, rise * 2.4 - hash(r * 131 + p) * 1.2));
        const y = -(TUBE_Y + 1.4) / 2 + local * (TUBE_Y + 1.4) * 0.5 + local * ((TUBE_Y + 1.4) / 2) - (1 - local) * 0.01;
        P.set(x, (TUBE_Y + 1.4) / 2 - (1 - local) * (TUBE_Y + 1.4), Z0 + p * 14);
        M.compose(P, Q.identity(), S.set(1, 1, 1));
        posts.setMatrixAt(pi++, M);
      }
      // tube: drops from above in the second half of act 3
      const tl = Math.min(1, Math.max(0, rise * 2 - 0.9 - hash(r) * 0.3));
      P.set(x, TUBE_Y + (1 - tl) * 6, 0);
      M.compose(P, Q.identity(), S.set(1, 1, 1));
      tubes.setMatrixAt(r, M);
    }
    posts.instanceMatrix.needsUpdate = true;
    tubes.instanceMatrix.needsUpdate = true;

    let mi = 0;
    for (let r = 0; r < ROWS; r++) {
      const x = X0 + r * PITCH;
      const rowOn = Math.min(1, Math.max(0, popRows - r));
      Q.setFromAxisAngle(ZAXIS, trackerAngle * (rowOn > 0 ? 1 : 0));
      for (let m = 0; m < MODS_PER_ROW; m++) {
        const on = rowOn >= 1 ? 1 : rowOn > (m / MODS_PER_ROW) ? 1 : 0;
        P.set(x, TUBE_Y + 0.12, Z0 + m * MODULE_LEN + MODULE_LEN / 2);
        M.compose(P, Q, S.set(on, on, on));
        modules.setMatrixAt(mi++, M);
      }
    }
    modules.instanceMatrix.needsUpdate = true;
  }

  // ---- survey (act 2): stakes, string-lines, laser pile dots ---------------
  const survey = new THREE.Group();
  scene.add(survey);
  {
    const stakeGeo = new THREE.BoxGeometry(0.05, 0.7, 0.05);
    const stakeMat = new THREE.MeshStandardMaterial({ color: 0xb9a27a, roughness: 0.9 });
    const stringMat = new THREE.LineBasicMaterial({ color: 0xd9dde2, transparent: true, opacity: 0.8 });
    for (const r of [0, 1, 2]) {
      const x = X0 + r * PITCH;
      for (const zf of [0, 0.25, 0.5, 0.75, 1]) {
        const st = new THREE.Mesh(stakeGeo, stakeMat);
        st.position.set(x, 0.35, Z0 + zf * ROW_LEN * 0.4);
        st.castShadow = true;
        survey.add(st);
      }
      const pts = [new THREE.Vector3(x, 0.62, Z0), new THREE.Vector3(x, 0.55, Z0 + ROW_LEN * 0.4)];
      survey.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), stringMat));
    }
    // laser dots on pile points of the first row
    const dotGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: SOL });
    for (let p = 0; p < 14; p++) {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.position.set(X0, 0.03, Z0 + p * 14);
      survey.add(d);
    }
  }

  // measurement grid, brief and factual
  const grid = new THREE.GridHelper(ROWS * PITCH, ROWS, SOL, SOL);
  grid.material.transparent = true;
  grid.material.opacity = 0;
  grid.position.y = 0.02;
  scene.add(grid);

  // ---- the sun disc (visible acts 5-7 only) --------------------------------
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 48),
    new THREE.MeshBasicMaterial({ color: SOL, transparent: true, opacity: 0, fog: false })
  );
  scene.add(disc);

  // ---- type in the scene: lit, shadow-casting headline planes --------------
  function makeLine(text, widthM, opts = {}) {
    const c = document.createElement('canvas');
    const W = 2048, H = 256;
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.font = `900 ${opts.px || 118}px 'Archivo Black', sans-serif`;
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(text, W / 2, H / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.08,
      roughness: 0.5,
      metalness: 0.35,
      color: STEEL_100,
      emissive: STEEL_100,
      emissiveIntensity: 0.06,  // legibility floor at night edges
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, widthM * (H / W)), mat);
    mesh.castShadow = true;
    mesh.material.opacity = 0;
    scene.add(mesh);
    return mesh;
  }

  const lines = [
    { m: makeLine('Before the light arrives, the steel is already true.', 46, { px: 96 }), a: 0.09, b: 0.175, pos: [22, 3.4, 2], ry: -0.28 },
    { m: makeLine('A plant begins as coordinates.', 30), a: 0.19, b: 0.29, pos: [10, 2.6, 4], ry: -0.35 },
    { m: makeLine("We build the part you'll never see again.", 40, { px: 100 }), a: 0.315, b: 0.44, pos: [16, 3.6, -4], ry: -0.5 },
    { m: makeLine('Ten thousand modules. One tolerance.', 60), a: 0.465, b: 0.575, pos: [18, 9, -16], ry: -0.35 },
    { m: makeLine('Twenty-five years of following the sun.', 80), a: 0.585, b: 0.715, pos: [18, 14, -34], ry: -0.3 },
    { m: makeLine('The sun sets. Nothing moves.', 42), a: 0.855, b: 0.945, pos: [20, 4.2, 0], ry: -0.32 },
  ];
  for (const L of lines) {
    L.m.position.set(...L.pos);
    L.m.rotation.y = L.ry;
  }

  // ---- per-frame update -----------------------------------------------------
  const skyDay = new THREE.Color(0x9fb2c4);
  const tmpC = new THREE.Color();
  let lastLayoutT = -1;

  function update(t) {
    const s = sample(t);

    // sun + colour temperature
    const [r, g, b] = kelvinToRGB(s.kelvin);
    sun.color.setRGB(r, g, b);
    sun.intensity = Math.max(0, Math.sin(Math.max(0, s.el))) * 3.4 + (s.el > 0 ? 0.25 : 0);
    sun.position.set(s.sun.x * 300, Math.max(2, s.sun.y * 300), s.sun.z * 300);
    hemi.intensity = 0.08 + s.day * 0.5;

    // sky: void -> tinted day -> dusk -> void
    tmpC.copy(skyDay).multiplyScalar(s.day).multiply(new THREE.Color(r, g, b));
    const duskMix = actWindow(t, 0.85, 1.0, 0.05);
    tmpC.lerp(DUSK, duskMix * 0.8);
    if (s.day <= 0.001) tmpC.copy(t > 0.9 ? DUSK : VOID).lerp(VOID, t > 0.97 ? 1 : 0);
    scene.background.copy(tmpC);
    scene.fog.color.copy(tmpC);
    scene.fog.density = s.fog;

    // shadow camera follows the camera target
    const cam = sampleCamera(t);
    camera.position.set(...cam.pos);
    camera.lookAt(...cam.look);
    sun.target.position.set(cam.look[0], 0, cam.look[2]);

    // survey + grid visibility
    const sv = actWindow(t, 0.18, 0.30);
    survey.visible = sv > 0;
    survey.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = sv; } });
    grid.material.opacity = sv * 0.16;
    grid.visible = sv > 0;

    // sun disc: only once the array is complete
    const discOn = actWindow(t, 0.50, 0.95, 0.04) * Math.max(0, Math.min(1, s.el * 4));
    disc.material.opacity = discOn;
    disc.visible = discOn > 0.01;
    disc.position.set(s.sun.x * 620, s.sun.y * 620, s.sun.z * 620);
    disc.lookAt(camera.position);

    // headline planes
    for (const L of lines) {
      const o = actWindow(t, L.a, L.b, 0.025);
      L.m.material.opacity = o;
      L.m.visible = o > 0.01;
    }

    // the array itself (skip matrix work when t hasn't moved)
    if (Math.abs(t - lastLayoutT) > 0.0004) {
      layout(t, s.tracker);
      lastLayoutT = t;
    }

    renderer.render(scene, camera);
    return s;
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  layout(0, -55 * Math.PI / 180);
  resize();

  return { update, resize, renderer };
}
