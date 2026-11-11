import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LEVELS } from './songs.js';
import { Music } from './audio.js';

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const MAX_LOCKS = 8, MAX_FORM = 4, CYCLES = 5, AVATAR_Z = -10, ENEMY_Z = -38;

// ───────────────────────── renderer ─────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.6, 0.22);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function glowTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const dotTex = glowTexture((g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
});
const lockTex = glowTexture((g) => {
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.translate(64, 64);
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(26, 52); g.lineTo(52, 52); g.lineTo(52, 26);
    g.stroke();
  }
});

// ───────────────────────── world ─────────────────────────
const world = { group: null, rings: [], props: [], grids: [], dust: null, speed: 46, mats: null, pal: null };
const SPAN = 330;

const gridVert = /* glsl */ `
  uniform float uOff, uAmp;
  varying vec3 vW; varying float vD;
  float h(vec2 p){ return sin(p.x*.045)*cos(p.y*.038) + .5*sin(p.x*.12+p.y*.1) + .25*sin(p.y*.31-p.x*.2); }
  void main(){
    vec3 p = position;
    vec2 w = vec2(p.x, p.z - uOff);
    float valley = smoothstep(8., 60., abs(p.x));
    p.y += uAmp * (h(w) + 1.6*valley) * valley;
    vW = vec3(w.x, p.y, w.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    vD = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const gridFrag = /* glsl */ `
  uniform vec3 uA, uC, uBg, uFog; uniform float uBeat, uPulse;
  varying vec3 vW; varying float vD;
  void main(){
    vec2 g = vW.xz / 6.;
    vec2 f = abs(fract(g - .5) - .5) / fwidth(g);
    float line = 1. - min(min(f.x, f.y), 1.);
    vec3 col = mix(uC, uA, smoothstep(-.2, 1., vW.y * .07));
    float pulse = exp(-abs(vD - uPulse * 300.) * .05);
    vec3 c = uBg * .7 + col * line * (.5 + .5 * uBeat + 1.6 * pulse);
    gl_FragColor = vec4(mix(c, uFog, smoothstep(30., 300., vD)), 1.);
  }`;
const skyFrag = /* glsl */ `
  uniform vec3 uBg, uFog, uSun; uniform float uBeat; varying vec3 vP;
  void main(){
    vec3 d = normalize(vP);
    float hgt = abs(d.y);
    vec3 c = mix(uFog, uBg, smoothstep(0., .55, hgt));
    float s = max(dot(d, normalize(vec3(0., .1, -1.))), 0.);
    c += uSun * (pow(s, 60.) * .22 + pow(s, 1500.) * (1.1 + uBeat * .5));
    gl_FragColor = vec4(c, 1.);
  }`;

function makeGrid(pal, y, amp, flip) {
  const geo = new THREE.PlaneGeometry(620, 620, 150, 150).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: gridVert, fragmentShader: gridFrag, side: THREE.DoubleSide,
    uniforms: {
      uOff: { value: 0 }, uAmp: { value: amp }, uBeat: { value: 0 }, uPulse: { value: 0 },
      uA: { value: new THREE.Color(pal.a) }, uC: { value: new THREE.Color(pal.c) },
      uBg: { value: new THREE.Color(pal.bg) }, uFog: { value: world.fogC },
    },
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, y, -250);
  if (flip) m.scale.y = -1;
  return m;
}

// wireframe solid: dark occluding fill + glowing edges
function wire(geo, lineMat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, world.mats.fill));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), lineMat));
  return g;
}

const PROPS = {
  hollow() { // great trees
    const g = new THREE.Group(), h = rand(34, 70), r = rand(1.5, 3.5);
    const trunk = wire(new THREE.CylinderGeometry(r * 0.6, r, h, 6), world.mats.c);
    trunk.position.y = h / 2;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const leaf = wire(new THREE.IcosahedronGeometry(rand(6, 12), 0), i ? world.mats.a : world.mats.b);
      leaf.position.set(rand(-6, 6), h * rand(0.6, 1.05), rand(-6, 6));
      g.add(leaf);
    }
    g.userData.y = -14;
    return g;
  },
  sanctum() { // drowned colonnade
    const g = new THREE.Group(), h = 44;
    const col = wire(new THREE.CylinderGeometry(2.2, 2.2, h, 8), world.mats.c);
    g.add(col);
    for (const y of [-h / 2, h / 2, rand(-8, 8)]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.25, 6, 16), world.mats.aSolid);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      g.add(band);
    }
    g.userData.y = 2;
    return g;
  },
  citadel() { // basalt spires
    const g = new THREE.Group(), h = rand(20, 80);
    const spire = wire(new THREE.ConeGeometry(rand(4, 9), h, 4), world.mats.c);
    spire.position.y = h / 2;
    spire.rotation.y = rand(0, 3);
    g.add(spire);
    if (Math.random() < 0.5) {
      const ember = wire(new THREE.BoxGeometry(4, 4, 4), world.mats.b);
      ember.position.y = h + 8;
      ember.userData.spin = 1;
      g.add(ember);
    }
    g.userData.y = -16;
    return g;
  },
  spire() { // drifting crystal isles
    const g = new THREE.Group(), s = rand(4, 13);
    const isle = wire(new THREE.OctahedronGeometry(s, 0), world.mats.c);
    isle.scale.y = 1.7;
    g.add(isle);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(s * 1.6, 0.15, 4, 40), world.mats.aSolid);
    halo.rotation.x = rand(1, 2);
    halo.userData.spin = 1;
    g.add(halo);
    g.userData.y = rand(-34, 30);
    return g;
  },
};
const SETUP = {
  hollow: { sides: 6, ground: [-14, 3], dustV: [0.6, 0.4], props: 34 },
  sanctum: { sides: 48, ground: [-20, 2.5], ceil: [24, 2], dustV: [0.2, 3.5], props: 30 },
  citadel: { sides: 4, ground: [-16, 5], dustV: [0.4, 5], props: 34 },
  spire: { sides: 5, ground: [-46, 7], dustV: [0, 0], props: 30, fast: 1.5 },
};

function placeProp(p, z) {
  const side = Math.random() < 0.5 ? -1 : 1;
  p.position.set(side * rand(26, 95), p.userData.y, z);
}

function buildWorld(level) {
  if (world.group) {
    scene.remove(world.group);
    world.group.traverse((o) => { o.geometry?.dispose(); });
  }
  const pal = (world.pal = level.palette), cfg = SETUP[level.id];
  const g = (world.group = new THREE.Group());
  scene.add(g);
  scene.background = new THREE.Color(pal.bg);
  world.fogC = new THREE.Color(pal.fog).multiplyScalar(0.5);
  scene.fog = new THREE.Fog(world.fogC, 40, 300);
  const line = (c, o = 1) => new THREE.LineBasicMaterial({ color: c, transparent: o < 1, opacity: o });
  world.mats = {
    fill: new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.bg).multiplyScalar(0.8), polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
    a: line(pal.a), b: line(pal.b), c: line(pal.c),
    aSolid: new THREE.MeshBasicMaterial({ color: pal.a }),
  };
  document.documentElement.style.setProperty('--a', hex(pal.a));
  document.documentElement.style.setProperty('--b', hex(pal.b));
  $('#cursor').style.color = hex(pal.b);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: skyFrag,
    uniforms: { uBg: { value: new THREE.Color(pal.bg) }, uFog: { value: world.fogC },
      uSun: { value: new THREE.Color(pal.b) }, uBeat: { value: 0 } },
  }));
  world.sky = sky;
  g.add(sky);

  world.grids = [makeGrid(pal, cfg.ground[0], cfg.ground[1], false)];
  if (cfg.ceil) world.grids.push(makeGrid(pal, cfg.ceil[0], cfg.ceil[1], true));
  world.grids.forEach((m) => g.add(m));

  // gates the flight path threads through
  world.rings = [];
  const pts = [];
  for (let i = 0; i <= cfg.sides; i++) {
    const a = (i / cfg.sides) * Math.PI * 2 + Math.PI / 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 19, Math.sin(a) * 19, 0));
  }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(pts);
  for (let i = 0; i < 12; i++) {
    const r = new THREE.Line(ringGeo, line(i % 3 ? pal.a : pal.b, 0.8));
    r.position.z = -i * (SPAN / 12);
    r.userData.dir = i % 2 ? 1 : -1;
    world.rings.push(r);
    g.add(r);
  }

  world.props = [];
  for (let i = 0; i < cfg.props; i++) {
    const p = PROPS[level.id]();
    placeProp(p, -(i / cfg.props) * SPAN);
    world.props.push(p);
    g.add(p);
  }

  // drifting motes: fireflies, bubbles, embers, stars
  const N = 1600, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rand(-90, 90); pos[i * 3 + 1] = rand(-45, 45); pos[i * 3 + 2] = rand(-SPAN, 10);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  world.dust = new THREE.Points(dg, new THREE.PointsMaterial({
    map: dotTex, color: pal.b, size: 1.1, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  world.dust.userData = { v: cfg.dustV, fast: cfg.fast || 0.5 };
  g.add(world.dust);
}

function updateWorld(dt, t, beat, phase) {
  const sp = world.speed * dt;
  for (const m of world.grids) {
    const u = m.material.uniforms;
    u.uOff.value += sp;
    u.uBeat.value = beat;
    u.uPulse.value = phase;
  }
  world.sky.material.uniforms.uBeat.value = beat;
  for (const r of world.rings) {
    r.position.z += sp;
    if (r.position.z > 12) r.position.z -= SPAN;
    r.rotation.z += dt * 0.12 * r.userData.dir;
    r.scale.setScalar(1 + beat * 0.05);
  }
  for (const p of world.props) {
    p.position.z += sp;
    if (p.position.z > 30) placeProp(p, p.position.z - SPAN);
    for (const c of p.children) if (c.userData.spin) { c.rotation.y += dt; c.rotation.z += dt * 0.6; }
  }
  const d = world.dust, a = d.geometry.attributes.position, arr = a.array, { v, fast } = d.userData;
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] += Math.sin(t + i) * v[0] * dt * 3;
    arr[i + 1] += v[1] * dt;
    arr[i + 2] += sp * fast;
    if (arr[i + 1] > 45) arr[i + 1] -= 90;
    if (arr[i + 2] > 10) arr[i + 2] -= SPAN;
  }
  a.needsUpdate = true;
  d.material.opacity = 0.6 + beat * 0.4;
}

// ───────────────────────── particles ─────────────────────────
const PN = 5000;
const P = {
  pos: new Float32Array(PN * 3), vel: new Float32Array(PN * 3), col: new Float32Array(PN * 3),
  life: new Float32Array(PN), decay: new Float32Array(PN), head: 0,
};
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(P.col, 3));
pGeo.setAttribute('aLife', new THREE.BufferAttribute(P.life, 1));
const particles = new THREE.Points(pGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTex: { value: dotTex }, uScale: { value: 1 } },
  vertexShader: `attribute float aLife; attribute vec3 color; varying vec3 vC; varying float vL; uniform float uScale;
    void main(){ vC = color; vL = aLife; vec4 mv = modelViewMatrix*vec4(position,1.);
      gl_PointSize = aLife > 0. ? uScale * (.4 + aLife) * 60. / -mv.z : 0.; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vL;
    void main(){ gl_FragColor = vec4(vC, 1.) * texture2D(uTex, gl_PointCoord) * min(vL * 2., 1.); }`,
}));
particles.frustumCulled = false;
scene.add(particles);
const tmpC = new THREE.Color();
function emit(p, color, n, speed, life = 1) {
  tmpC.set(color);
  for (let k = 0; k < n; k++) {
    const i = P.head = (P.head + 1) % PN, j = i * 3;
    const th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1)), s = speed * rand(0.2, 1);
    P.pos[j] = p.x; P.pos[j + 1] = p.y; P.pos[j + 2] = p.z;
    P.vel[j] = Math.sin(ph) * Math.cos(th) * s; P.vel[j + 1] = Math.sin(ph) * Math.sin(th) * s; P.vel[j + 2] = Math.cos(ph) * s;
    P.col[j] = tmpC.r; P.col[j + 1] = tmpC.g; P.col[j + 2] = tmpC.b;
    P.life[i] = 1; P.decay[i] = 1 / (life * rand(0.6, 1.2));
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PN; i++) {
    if (P.life[i] <= 0) continue;
    const j = i * 3;
    P.life[i] -= P.decay[i] * dt;
    P.pos[j] += P.vel[j] * dt; P.pos[j + 1] += P.vel[j + 1] * dt; P.pos[j + 2] += P.vel[j + 2] * dt + world.speed * 0.25 * dt;
    const k = 1 - 1.5 * dt;
    P.vel[j] *= k; P.vel[j + 1] *= k; P.vel[j + 2] *= k;
  }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = pGeo.attributes.aLife.needsUpdate = true;
  particles.material.uniforms.uScale.value = renderer.getPixelRatio() * innerHeight / 700;
}

// ───────────────────────── avatar: a kite-winged song spirit ─────────────────────────
const avatar = new THREE.Group();
avatar.position.set(0, -1, AVATAR_Z);
scene.add(avatar);
const avMat = new THREE.LineBasicMaterial({ color: 0xffffff });
const avCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
avCore.scale.z = 2.2;
avatar.add(avCore);
const wings = [-1, 1].map((s) => {
  const g = new THREE.BufferGeometry().setFromPoints([
    [0, 0, -0.6], [s * 1.9, 0.5, 0.5], [s * 1.1, 0, 1.3], [0, 0, 0.5], [0, 0, -0.6], [s * 1.1, 0, 1.3],
  ].map((p) => new THREE.Vector3(...p)));
  const w = new THREE.Line(g, avMat);
  avatar.add(w);
  return w;
});
const halos = [];
for (let i = 0; i < MAX_FORM; i++) {
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.85 + i * 0.3, 0.012, 4, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  halos.push(h);
  avatar.add(h);
}
const TAIL = 18, tailPts = Array.from({ length: TAIL }, () => new THREE.Vector3(0, -1, AVATAR_Z));
const tail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tailPts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
tail.frustumCulled = false;
scene.add(tail);

function updateAvatar(dt, t, beat) {
  const tx = input.x * 9, ty = input.y * 5 - 1;
  const k = 1 - Math.exp(-dt * 7);
  avatar.position.x += (tx - avatar.position.x) * k;
  avatar.position.y += (ty - avatar.position.y) * k;
  avatar.rotation.z = (avatar.position.x - tx) * 0.12;
  avatar.rotation.x = (ty - avatar.position.y) * 0.1;
  const flap = 0.25 + Math.sin(t * 7) * 0.35 + beat * 0.3;
  wings[0].rotation.z = -flap;
  wings[1].rotation.z = flap;
  halos.forEach((h, i) => {
    h.visible = i < G.form;
    h.material.color.set(world.pal.a);
    h.rotation.x = t * (0.7 + i * 0.3) + i;
    h.rotation.y = t * (0.5 + i * 0.2);
  });
  avatar.scale.setScalar(1 + beat * 0.12);
  avatar.visible = G.blink <= 0 || Math.floor(t * 20) % 2 === 0;
  for (let i = TAIL - 1; i > 0; i--) {
    tailPts[i].copy(tailPts[i - 1]);
    tailPts[i].z += dt * 22;
  }
  tailPts[0].copy(avatar.position);
  tail.geometry.setFromPoints(tailPts);
  if (Math.random() < 0.5) emit(avatar.position, world.pal.a, 1, 1.5, 0.5);
}

// ───────────────────────── enemies ─────────────────────────
const enemyRoot = new THREE.Group();
scene.add(enemyRoot);
const GEO = {
  wisp: new THREE.IcosahedronGeometry(1.25, 0),
  sentinel: new THREE.OctahedronGeometry(1.9, 0),
  drifter: new THREE.TorusKnotGeometry(1.3, 0.38, 40, 5),
  spark: new THREE.IcosahedronGeometry(0.55, 0),
  node: new THREE.DodecahedronGeometry(2.1, 0),
  ring: new THREE.TorusGeometry(2.9, 0.08, 4, 32),
  core: [
    new THREE.TorusKnotGeometry(5, 1.3, 90, 8, 2, 3),
    new THREE.IcosahedronGeometry(6.5, 1),
    new THREE.DodecahedronGeometry(6.5, 0),
    new THREE.OctahedronGeometry(7, 2),
  ],
};
const TYPES = {
  wisp: { hp: 1, r: 1.4, score: 100 },
  sentinel: { hp: 2, r: 2.2, score: 250 },
  drifter: { hp: 3, r: 2.0, score: 400 },
  spark: { hp: 1, r: 1.0, score: 50 },
  node: { hp: 2, r: 2.4, score: 300 },
  core: { hp: 40, r: 7, score: 5000 },
};

function enemyMesh(type) {
  const c = world.pal.enemy, g = new THREE.Group();
  const wf = (geo, col, o = 1) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: o }));
  if (type === 'spark') {
    g.add(new THREE.Mesh(GEO.spark, new THREE.MeshBasicMaterial({ color: 0xffffff })));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: c, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(5);
    g.add(s);
  } else if (type === 'core') {
    g.add(wf(GEO.core[G.levelIdx], c));
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  } else {
    g.add(wf(GEO[type], c));
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    if (type === 'sentinel') g.add(wf(GEO.ring, world.pal.b, 0.9));
  }
  return g;
}

// path(e, age) writes e.mesh.position; negative age = not yet arrived
function spawn(type, path, opts = {}) {
  const T = TYPES[type];
  const e = {
    type, path, hp: opts.hp ?? T.hp, max: opts.hp ?? T.hp, r: T.r, score: T.score, age: -(opts.delay || 0),
    life: opts.life ?? 9, locks: 0, flying: 0, alive: true, lockable: true, fire: opts.fire || 0, nextFire: 0,
    punch: 0, mesh: enemyMesh(type), spin: rand(0.6, 1.6),
  };
  e.mesh.visible = false;
  enemyRoot.add(e.mesh);
  G.enemies.push(e);
  return e;
}
function removeEnemy(e) {
  e.alive = false;
  enemyRoot.remove(e.mesh);
  e.mesh.traverse((o) => o.material?.dispose());
}

function fireSpark(from) {
  const p0 = from.mesh.position.clone();
  const dur = Math.max(2.2, 3.6 - G.levelIdx * 0.3);
  emit(p0, world.pal.enemy, 10, 8, 0.4);
  spawn('spark', (e, a) => {
    const k = a / dur;
    e.mesh.position.lerpVectors(p0, avatar.position, k * k * 0.4 + k * 0.6);
    if (k >= 1 && e.alive) { removeEnemy(e); hurt(); }
  }, { life: dur + 1 });
}

const F = { // formations
  arc(dir, n, y0 = rand(-3, 7)) {
    for (let i = 0; i < n; i++) spawn('wisp', (e, a) => {
      e.mesh.position.set(dir * (-36 + a * 11), y0 + Math.sin(a * 1.6 + i * 0.5) * 4, ENEMY_Z + Math.sin(a * 0.8) * 6);
    }, { delay: i * 0.28, life: 6.6 });
  },
  ring(n, cx = rand(-10, 10), cy = rand(0, 6)) {
    for (let i = 0; i < n; i++) spawn('wisp', (e, a) => {
      const ang = (i / n) * Math.PI * 2 + a * 0.9, inn = Math.min(1, a / 1.6), out = Math.max(0, a - 7.5);
      const z = ENEMY_Z - 140 * (1 - inn) * (1 - inn) - out * out * 30;
      e.mesh.position.set(cx + Math.cos(ang) * 7, cy + Math.sin(ang) * 7 + out * out * 8, z);
    }, { life: 9.5 });
  },
  sentinels(n) {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 11 + rand(-2, 2), y = rand(-2, 9);
      spawn('sentinel', (e, a) => {
        const inn = Math.min(1, a / 1.2), out = Math.max(0, a - 10);
        e.mesh.position.set(x, y + Math.sin(a * 1.3 + i) * 1.2 + out * out * 14, ENEMY_Z - 2 - 90 * (1 - inn) * (1 - inn));
      }, { delay: i * 0.3, life: 12, fire: Math.max(4, 8 - G.levelIdx) });
    }
  },
  swoop(n) {
    const ph = rand(0, 6);
    for (let i = 0; i < n; i++) spawn('drifter', (e, a) => {
      const inn = Math.min(1, a / 1.5), out = Math.max(0, a - 9);
      e.mesh.position.set(Math.sin(a * 0.8 + ph + i * 2) * 15, 3 + Math.sin(a * 1.6 + ph + i) * 6 + out * out * 12, ENEMY_Z + 2 - 120 * (1 - inn) * (1 - inn));
    }, { delay: i * 0.6, life: 11, fire: G.levelIdx > 0 ? 8 : 0 });
  },
};

// one entry per 2 bars; five 8-bar cycles, then the warden
const WAVES = [
  ['', 'arcL', 'arcR', 'ring'],
  ['arcL arcR', 'sent2', 'ring', 'swoop'],
  ['sent3', 'arcL ring', 'swoop', 'sent2 arcR'],
  ['ring ring', 'sent3 arcL', 'swoop2', 'arcL arcR sent2'],
  ['sent4', 'ring swoop', 'arcL arcR ring', 'sent3 swoop2'],
];
function runWave(slot) {
  const cycle = Math.floor(slot / 4), lv = G.levelIdx;
  music.intensity = Math.min(4, cycle + 1);
  if (cycle >= CYCLES) { if (!G.boss) spawnBoss(); return; }
  for (const w of WAVES[cycle][slot % 4].split(' ')) {
    if (w === 'arcL') F.arc(1, 5 + lv);
    else if (w === 'arcR') F.arc(-1, 5 + lv);
    else if (w === 'ring') F.ring(6 + lv);
    else if (w === 'swoop') F.swoop(1 + (lv > 1));
    else if (w === 'swoop2') F.swoop(2 + (lv > 1));
    else if (w.startsWith('sent')) F.sentinels(+w[4] + (lv > 2));
  }
}

function spawnBoss() {
  const lv = G.levelIdx, hp = 32 + lv * 10;
  const core = spawn('core', (e, a) => {
    const inn = Math.min(1, a / 3);
    e.mesh.position.set(Math.sin(a * 0.4) * 9, 3 + Math.sin(a * 0.7) * 3, -50 - 220 * (1 - inn) * (1 - inn));
  }, { hp, life: 1e9 });
  core.spin = 0.35;
  G.boss = { core, nodes: [], respawn: 0, turn: 0, nextFire: music.beats() + 8 };
  spawnNodes();
  $('#boss').classList.add('on');
  showCard('The Warden wakes', LEVELS[lv].name);
}
function spawnNodes() {
  const b = G.boss, n = 5 + Math.min(3, G.levelIdx);
  b.nodes = [];
  for (let i = 0; i < n; i++) {
    b.nodes.push(spawn('node', (e, a) => {
      const ang = (i / n) * Math.PI * 2 + a * 0.6, rad = 11 + Math.sin(a * 0.9 + i) * 2.5;
      e.mesh.position.copy(b.core.mesh.position);
      e.mesh.position.x += Math.cos(ang) * rad;
      e.mesh.position.y += Math.sin(ang) * rad * 0.75;
      e.mesh.position.z += 3 + Math.sin(ang * 2) * 2;
    }, { life: 1e9 }));
  }
}
function updateBoss(dt, beats) {
  const b = G.boss;
  if (!b || !b.core.alive) return;
  const live = b.nodes.filter((n) => n.alive);
  b.core.lockable = live.length === 0;
  b.core.mesh.children[1].scale.setScalar(b.core.lockable ? 1 + music.pulse() * 0.5 : 0.35);
  if (!live.length) {
    b.respawn += dt;
    if (b.respawn > 9) { b.respawn = 0; spawnNodes(); }
  }
  if (beats >= b.nextFire && b.core.age > 3) {
    b.nextFire = Math.floor(beats) + (live.length ? Math.max(1, 2.5 - G.levelIdx * 0.4) : 2);
    fireSpark(live.length ? live[b.turn++ % live.length] : b.core);
  }
  $('#boss div div').style.width = (100 * b.core.hp / b.core.max) + '%';
}

const v3 = new THREE.Vector3();
function updateEnemies(dt, t, beats, beat) {
  const W = innerWidth, H = innerHeight, focal = H / 2 / Math.tan((camera.fov * Math.PI) / 360);
  for (const e of G.enemies) {
    if (!e.alive) continue;
    e.age += dt;
    if (e.age < 0) continue;
    if (e.age > e.life && !e.locks && !e.flying) { removeEnemy(e); continue; }
    e.path(e, e.age);
    if (!e.alive) continue;
    e.mesh.visible = true;
    e.mesh.rotation.x += dt * e.spin;
    e.mesh.rotation.y += dt * e.spin * 1.3;
    e.punch = Math.max(0, e.punch - dt * 5);
    e.mesh.scale.setScalar(Math.min(1, e.age * 3 + 0.2) * (1 + e.punch * 0.5 + beat * 0.1));
    if (e.fire && e.age > 1.5) {
      if (!e.nextFire) e.nextFire = Math.ceil(beats) + rand(0, e.fire) | 0;
      else if (beats >= e.nextFire && e.age < e.life - 1) { e.nextFire += e.fire; fireSpark(e); }
    }
    // screen position for lock-on
    v3.copy(e.mesh.position).project(camera);
    e.sx = (v3.x * 0.5 + 0.5) * W;
    e.sy = (-v3.y * 0.5 + 0.5) * H;
    const dist = camera.position.distanceTo(e.mesh.position);
    e.sr = (e.r * focal) / dist + 26;
    e.onScreen = v3.z < 1 && dist < 110;
  }
  if (G.enemies.length > 80) G.enemies = G.enemies.filter((e) => e.alive);
}

// ───────────────────────── lock-on and volleys ─────────────────────────
const lockSprites = [];
for (let i = 0; i < 24; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex, color: 0xffffff, depthTest: false, transparent: true }));
  s.visible = false;
  s.renderOrder = 10;
  scene.add(s);
  lockSprites.push(s);
}
const shots = [];
const shotGeo = new THREE.OctahedronGeometry(0.35);

function updateLocks(dt, t) {
  G.lockCd -= dt;
  if (input.hold && G.lockCd <= 0 && G.locks.length < MAX_LOCKS) {
    const cx = (input.x * 0.5 + 0.5) * innerWidth, cy = (-input.y * 0.5 + 0.5) * innerHeight;
    let best = null, bd = 1e9;
    for (const e of G.enemies) {
      if (!e.alive || e.age < 0 || !e.onScreen || !e.lockable || e.locks + e.flying >= e.hp) continue;
      const d = Math.hypot(e.sx - cx, e.sy - cy) - e.sr;
      if (d < 0 && d < bd) { bd = d; best = e; }
    }
    if (best) {
      best.locks++;
      G.locks.push(best);
      G.lockCd = best.locks > 1 ? 0.11 : 0.05;
      music.lockTick(G.locks.length - 1);
    }
  }
  let k = 0;
  const seen = new Set();
  for (const e of G.enemies) {
    if (!e.alive || !e.locks || seen.has(e) || k >= lockSprites.length) continue;
    seen.add(e);
    const s = lockSprites[k++];
    s.visible = true;
    s.position.copy(e.mesh.position);
    s.scale.setScalar(e.r * 2.6 * (1 + 0.12 * e.locks + Math.sin(t * 10) * 0.05));
    s.material.rotation = t * 1.5;
    s.material.color.set(world.pal.b);
  }
  for (; k < lockSprites.length; k++) lockSprites[k].visible = false;
  $('#cursor span').textContent = G.locks.length ? (G.locks.length === MAX_LOCKS ? 'MAX' : G.locks.length) : '';
}

function release() {
  const n = G.locks.length;
  if (!n) return;
  const first = music.grid(0.14), now = music.ctx.currentTime;
  G.locks.forEach((e, i) => {
    const at = first + i * music.step;
    e.locks--;
    e.flying++;
    const kill = e.hp - e.flying <= 0;
    music.hitAt(at, i, kill);
    const mesh = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    scene.add(mesh);
    const side = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), 0).normalize().multiplyScalar(rand(8, 16));
    shots.push({ e, mesh, t: 0, dur: at - now, p0: avatar.position.clone(), side, mult: n, last: new THREE.Vector3() });
  });
  G.locks = [];
  emit(avatar.position, world.pal.b, 14, 10, 0.4);
}

const mid = new THREE.Vector3();
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.t += dt;
    const k = Math.min(1, s.t / s.dur), target = s.e.mesh.position;
    mid.lerpVectors(s.p0, target, 0.4).add(s.side);
    const a = (1 - k) * (1 - k), b = 2 * k * (1 - k), c = k * k;
    s.mesh.position.set(a * s.p0.x + b * mid.x + c * target.x, a * s.p0.y + b * mid.y + c * target.y, a * s.p0.z + b * mid.z + c * target.z);
    emit(s.mesh.position, world.pal.b, 2, 0.8, 0.35);
    if (k >= 1) {
      scene.remove(s.mesh);
      shots.splice(i, 1);
      strike(s.e, s.mult);
    }
  }
}

function strike(e, mult) {
  e.flying--;
  if (!e.alive) return;
  e.hp--;
  e.punch = 1;
  G.score += 10 * mult;
  emit(e.mesh.position, 0xffffff, 8, 10, 0.3);
  if (e.hp > 0) return;
  const pos = e.mesh.position.clone(), big = e.type === 'core';
  G.score += e.score * mult;
  emit(pos, world.pal.enemy, big ? 500 : 50, big ? 60 : 22, big ? 2.4 : 0.9);
  emit(pos, world.pal.b, big ? 300 : 20, big ? 40 : 12, big ? 2 : 0.7);
  G.shake = Math.max(G.shake, big ? 1.5 : 0.25);
  removeEnemy(e);
  if (big) return levelClear();
  if (e.type !== 'spark' && ++G.energy >= 8) {
    G.energy = 0;
    if (G.form < MAX_FORM) { G.form++; music.chime(true); emit(avatar.position, 0xffffff, 60, 14, 0.8); }
    else G.score += 1000;
  }
}

function hurt() {
  if (G.blink > 0 || G.state !== 'play') return;
  G.form--;
  G.blink = 1.4;
  G.shake = 1;
  G.flash = 1;
  music.thud();
  emit(avatar.position, 0xff4040, 60, 16, 0.8);
  if (G.form < 0) gameOver();
}

// ───────────────────────── game flow ─────────────────────────
const music = { ctx: null }; // replaced by a real Music on first user gesture
let audio = null;
const input = { x: 0, y: 0, hold: false };
const G = {
  state: 'menu', levelIdx: 0, choir: false, score: 0, form: 2, energy: 0, enemies: [], locks: [], lockCd: 0,
  boss: null, slot: 0, blink: 0, shake: 0, flash: 0, cardT: 0,
};
window.__game = { G, input, release, hurt, toBoss() { G.slot = 1e9; runWave(CYCLES * 4); } }; // handy for debugging

function showCard(title, sub, sec = 4) {
  $('#card h2').textContent = title;
  $('#card p').textContent = sub;
  $('#card').classList.add('on');
  G.cardT = sec;
}
function clearField() {
  G.enemies.forEach((e) => e.alive && removeEnemy(e));
  G.enemies = [];
  G.locks = [];
  shots.forEach((s) => scene.remove(s.mesh));
  shots.length = 0;
  G.boss = null;
  $('#boss').classList.remove('on');
}
function modeLabel() {
  $('#mode').innerHTML = G.choir ? 'Choir · Chimera voice' : 'Instrumental';
}

async function startLevel(i) {
  if (!audio) {
    audio = new Music();
    Object.setPrototypeOf(music, Music.prototype);
    Object.assign(music, audio);
  }
  await music.ctx.resume();
  const level = LEVELS[i];
  G.levelIdx = i;
  clearField();
  buildWorld(level);
  if (G.choir) {
    showCard('Gathering the choir', '…', 30);
    document.body.classList.add('playing');
    if (!(await music.loadVocals(level))) G.choir = false;
  }
  G.slot = 0;
  G.energy = 0;
  G.blink = 0;
  G.form = Math.max(G.form, 2);
  G.state = 'play';
  $('#realm span').textContent = `Realm ${i + 1} · ${level.name}`;
  $('#realm i').textContent = level.tagline;
  modeLabel();
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('on');
  document.body.classList.add('playing');
  music.start(level, G.choir);
  showCard(level.name, level.tagline, 5);
}

function endScreen(title, sub, next) {
  document.body.classList.remove('playing');
  $('#endTitle').textContent = title;
  $('#endSub').textContent = sub;
  $('#again').textContent = next.label;
  $('#again').onclick = next.fn;
  $('#end').classList.add('on');
}
function levelClear() {
  G.state = 'clear';
  music.finale();
  G.enemies.forEach((e) => { if (e.alive) { emit(e.mesh.position, world.pal.enemy, 30, 18); removeEnemy(e); } });
  $('#boss').classList.remove('on');
  showCard('Realm restored', LEVELS[G.levelIdx].name, 5);
  const last = G.levelIdx === LEVELS.length - 1;
  setTimeout(() => {
    if (G.state !== 'clear') return;
    if (last) endScreen('The song is whole', `Final resonance ${G.score.toLocaleString()}`, { label: 'Play again', fn: toMenu });
    else startLevel(G.levelIdx + 1);
  }, 6500);
}
function gameOver() {
  G.state = 'dead';
  music.stop(1.5);
  emit(avatar.position, 0xffffff, 200, 30, 1.5);
  setTimeout(() => endScreen('The song fades', `Resonance ${G.score.toLocaleString()}`, {
    label: 'Try again', fn: () => { G.score = 0; G.form = 2; startLevel(G.levelIdx); },
  }), 1800);
}
function toMenu() {
  music.stop?.(0.5);
  clearField();
  G.state = 'menu';
  G.score = 0;
  G.form = 2;
  document.body.classList.remove('playing');
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('on');
  $('#menu').classList.add('on');
}
function pause(on) {
  if (on && G.state === 'play') {
    G.state = 'paused';
    music.ctx.suspend();
    document.body.classList.remove('playing');
    $('#pause').classList.add('on');
  } else if (!on && G.state === 'paused') {
    G.state = 'play';
    music.ctx.resume();
    document.body.classList.add('playing');
    $('#pause').classList.remove('on');
  }
}

// ───────────────────────── input and menu ─────────────────────────
const canvas = $('#gl');
function aim(ev) {
  input.x = (ev.clientX / innerWidth) * 2 - 1;
  input.y = -(ev.clientY / innerHeight) * 2 + 1;
  $('#cursor').style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
}
function hold(on) {
  if (G.state !== 'play') on = false;
  if (input.hold && !on && G.state === 'play') release();
  input.hold = on;
  $('#cursor').classList.toggle('hold', on);
}
addEventListener('pointermove', aim);
canvas.addEventListener('pointerdown', (ev) => { aim(ev); hold(true); });
addEventListener('pointerup', () => hold(false));
addEventListener('pointercancel', () => hold(false));
addEventListener('contextmenu', (ev) => ev.preventDefault());
addEventListener('keydown', (ev) => {
  if (ev.code === 'Space' && !ev.repeat) { hold(true); ev.preventDefault(); }
  if (ev.code === 'Escape') pause(G.state === 'play');
  if (ev.code === 'KeyV' && G.state === 'play') {
    G.choir = !G.choir;
    const apply = () => { music.choir = G.choir; modeLabel(); };
    if (G.choir) music.loadVocals(LEVELS[G.levelIdx]).then((ok) => { G.choir = ok; apply(); });
    else apply();
  }
});
addEventListener('keyup', (ev) => { if (ev.code === 'Space') hold(false); });
addEventListener('blur', () => pause(true));

let pick = 0;
LEVELS.forEach((l, i) => {
  const b = document.createElement('button');
  b.innerHTML = `${l.name}<small>${l.bpm} bpm</small>`;
  b.classList.toggle('sel', i === 0);
  b.onclick = () => {
    pick = i;
    document.querySelectorAll('#realms button').forEach((x, j) => x.classList.toggle('sel', j === i));
    buildWorld(l);
  };
  $('#realms').appendChild(b);
});
document.querySelectorAll('#modes button').forEach((b) => {
  b.onclick = () => {
    G.choir = b.dataset.choir === '1';
    document.querySelectorAll('#modes button').forEach((x) => x.classList.toggle('sel', x === b));
  };
});
$('#go').onclick = () => startLevel(pick);
$('#resume').onclick = () => pause(false);
$('#quit').onclick = () => { music.ctx.resume(); toMenu(); };
for (let i = 0; i <= MAX_FORM; i++) $('#pips').appendChild(document.createElement('span'));

// ───────────────────────── main loop ─────────────────────────
buildWorld(LEVELS[0]);
let last = performance.now(), time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.state === 'paused') return;
  time += dt;
  const live = music.running;
  const beats = live ? music.beats() : time * 1.6;
  const beat = live ? music.pulse() : Math.pow(1 - (beats % 1), 4) * 0.5;
  const phase = ((beats % 4) + 4) % 4 / 4;

  updateWorld(dt, time, beat, phase);
  if (G.state === 'play' && beats >= 0) {
    while (G.slot <= Math.floor(beats / 8)) runWave(G.slot++);
    updateBoss(dt, beats);
  }
  const active = G.state === 'play' || G.state === 'clear';
  if (active) {
    updateEnemies(dt, time, beats, beat);
    updateLocks(dt, time);
    updateShots(dt);
  }
  avatar.visible = tail.visible = active;
  if (active) updateAvatar(dt, time, beat);
  updateParticles(dt);

  // camera drift, shake, post
  G.shake = Math.max(0, G.shake - dt * 2.5);
  G.blink -= dt;
  const sway = G.state === 'menu' ? 1 : 0;
  camera.position.set(
    input.x * 1.6 + Math.sin(time * 0.3) * 3 * sway + (Math.random() - 0.5) * G.shake,
    input.y * 0.9 + Math.cos(time * 0.23) * 1.5 * sway + (Math.random() - 0.5) * G.shake, 0);
  camera.lookAt(input.x * 2, input.y * 1.2, -60);
  camera.rotation.z = -input.x * 0.04;
  bloom.strength = 0.6 + beat * 0.35;

  // hud
  if (G.flash > 0) { G.flash = Math.max(0, G.flash - dt * 2); $('#flash').style.opacity = G.flash * 0.7; }
  if (G.cardT > 0 && (G.cardT -= dt) <= 0) $('#card').classList.remove('on');
  if (active) {
    $('#score b').textContent = G.score.toLocaleString();
    $('#progress div').style.width = Math.min(100, (beats / (CYCLES * 32)) * 100) + '%';
    $('#energy div').style.width = (G.energy / 8) * 100 + '%';
    document.querySelectorAll('#pips span').forEach((p, i) => p.classList.toggle('on', i <= G.form));
  }
  composer.render();
}
requestAnimationFrame(frame);
