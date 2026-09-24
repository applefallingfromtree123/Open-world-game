// ============================================================
//  NEON//VOID 3D 렌더러 (Three.js)
//  - 게임 판정은 은하 평면(2D) 위에서 서버가 수행, 화면은 완전한 3D
//  - 플로팅 오리진: 카메라 대상(내 함선)을 원점으로 두고 모든 물체를 상대 좌표로 배치
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G, serverTime } from './state.js';
import { SHIPS, NPCS, WEAPONS, ITEMS, secColor } from '../shared/data.js';
import { bodyPos, mulberry32 } from '../shared/physics.js';
import { SHAPES } from './shapes.js';

let renderer, scene, camera, composer, bloomPass, overlay, octx;
let W = 0, H = 0, DPR = 1;
const O = { x: 0, y: 0 };            // 플로팅 오리진 (월드 2D 좌표)
const V = new THREE.Vector3();
const dummy = new THREE.Object3D();
const UP = new THREE.Vector3(0, 1, 0);

// 월드 (x, y, 높이 h) → three 좌표 (x, h, y) 상대값
const setPos = (obj, x, y, h = 0) => obj.position.set(x - O.x, h, y - O.y);

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export const screenSize = () => ({ W, H });

// ------------------------------------------------------------
//  공용 텍스처
// ------------------------------------------------------------
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let GLOW = null;
const spriteMats = new Map();
function glowMat(color, opacity = 1) {
  const k = color + opacity;
  if (!spriteMats.has(k)) spriteMats.set(k, new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  return spriteMats.get(k);
}

// ------------------------------------------------------------
//  초기화
// ------------------------------------------------------------
let sky, skyMat, starPts, grid, starLight;
export function initRender(canvas) {
  GLOW = GLOW || glowTexture();
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x04010c);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 5, 4e6);
  scene.add(camera);
  overlay = document.getElementById('overlay');
  octx = overlay.getContext('2d');

  scene.add(new THREE.AmbientLight(0x6a6a9a, 0.6));
  scene.add(new THREE.HemisphereLight(0x7a5cff, 0x00303a, 0.6));
  starLight = new THREE.PointLight(0xffffff, 2.2, 0, 0);
  scene.add(starLight);
  const fill = new THREE.DirectionalLight(0xff6ad5, 0.35); fill.position.set(-1, 0.4, 1); scene.add(fill);

  setupSky();
  setupGrid();
  setupDynamic();

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.5, 0.42);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  if (!renderer) return;
  DPR = Math.min(window.devicePixelRatio || 1, G.settings.quality === 'low' ? 1 : 1.75);
  W = window.innerWidth; H = window.innerHeight;
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);
  bloomPass.resolution.set(W / 2, H / 2);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  overlay.width = Math.round(W * DPR); overlay.height = Math.round(H * DPR);
  overlay.style.width = W + 'px'; overlay.style.height = H + 'px';
}

// ------------------------------------------------------------
//  하늘: 절차적 성운 셰이더 + 별
// ------------------------------------------------------------
function setupSky() {
  skyMat = new THREE.ShaderMaterial({
    uniforms: { c1: { value: new THREE.Color('#ff2bd6') }, c2: { value: new THREE.Color('#00f0ff') }, seed: { value: 1.0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 c1; uniform vec3 c2; uniform float seed;
      float h(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float band = exp(-pow(d.y*2.2, 2.0));
        float f = fbm(d*3.0 + seed);
        float g = fbm(d*6.0 - seed*1.7);
        float neb = smoothstep(0.35, 0.85, f) * (0.35 + band*0.65);
        vec3 col = vec3(0.012,0.004,0.035);
        col += c1 * neb * 0.28;
        col += c2 * smoothstep(0.5, 0.9, g) * band * 0.16;
        col += vec3(0.25,0.1,0.4) * pow(band, 6.0) * 0.12;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  sky = new THREE.Mesh(new THREE.SphereGeometry(1.5e6, 48, 24), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  const N = 7000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const rnd = mulberry32(99);
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
    const y = rnd() < 0.55 ? u * 0.25 : u;   // 은하 평면 근처에 별을 더 많이
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * r * 1.2e6, y * 1.2e6, Math.sin(th) * r * 1.2e6], i * 3);
    const k = rnd();
    const c = k > 0.93 ? [1, 0.45, 0.95] : k > 0.85 ? [0.45, 0.95, 1] : [0.85, 0.88, 1];
    const b = 0.35 + rnd() * 0.65;
    col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  starPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  starPts.renderOrder = -9; starPts.frustumCulled = false;
  scene.add(starPts);
}

function setupGrid() {
  grid = new THREE.GridHelper(24000, 48, 0xff2bd6, 0xff2bd6);
  grid.material.transparent = true; grid.material.opacity = 0.07; grid.material.depthWrite = false;
  scene.add(grid);
}

// ------------------------------------------------------------
//  세계 구축 (성계 · 행성 · 스테이션 · 소행성대 · 비콘)
// ------------------------------------------------------------
const sysObjs = [];
const astIndex = [];   // 소행성 id -> 인스턴스 정보
let builtWorld = null;

function buildWorld() {
  builtWorld = G.world;
  for (const s of G.world.systems) {
    const grp = new THREE.Group();
    scene.add(grp);
    const starCol = new THREE.Color(s.starColor);
    const star = new THREE.Mesh(new THREE.SphereGeometry(s.starR, 48, 24), new THREE.MeshBasicMaterial({ color: starCol.clone().lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(1.6) }));
    const corona = new THREE.Sprite(glowMat(s.starColor, 0.7)); corona.scale.setScalar(s.starR * 4.5);
    const halo = new THREE.Sprite(glowMat(s.starColor, 0.18).clone()); halo.scale.setScalar(s.starR * 9);
    grp.add(star, corona, halo);
    const far = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: s.starColor, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, transparent: true }));
    far.scale.setScalar(0.05);
    scene.add(far);
    const o = { s, grp, star, corona, halo, far, planets: [], stations: [], belts: [], beacon: null };
    for (const pid of s.planets) o.planets.push({ p: G.bodies[pid], mesh: null });
    for (const sid of s.stations) { const g = makeStation(G.bodies[sid]); grp.add(g); o.stations.push({ st: G.bodies[sid], g }); }
    for (const bid of s.belts) o.belts.push(makeBelt(G.beltById[bid], grp));
    if (s.beacon) { o.beacon = makeBeacon(G.beaconById[s.beacon]); grp.add(o.beacon.g); }
    sysObjs.push(o);
  }
}

// ---- 행성 ----
function planetTexture(p) {
  const w = 512, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = w; e.height = h;
  const ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, w, h);
  const rnd = mulberry32(Math.floor(p.orbitR));
  x.fillStyle = p.c2; x.fillRect(0, 0, w, h);
  if (p.kind === 'gas') {
    for (let yy = 0; yy < h; yy++) {
      const v = Math.sin(yy * 0.09 + Math.sin(yy * 0.021) * 4) * 0.5 + 0.5;
      x.fillStyle = hexA(p.c1, v * 0.8); x.fillRect(0, yy, w, 1);
    }
    for (let i = 0; i < 6; i++) { x.fillStyle = hexA('#ffffff', 0.15); x.beginPath(); x.ellipse(rnd() * w, rnd() * h, 30 + rnd() * 40, 8 + rnd() * 10, 0, 0, Math.PI * 2); x.fill(); }
  } else {
    const n = p.kind === 'dead' ? 260 : 420;
    for (let i = 0; i < n; i++) {
      const r = 4 + rnd() * 36;
      x.fillStyle = hexA(p.c1, 0.08 + rnd() * 0.3);
      const px = rnd() * w, py = h * 0.08 + rnd() * h * 0.84, sx = 1 + rnd(), rot = rnd() * 3;
      x.beginPath(); x.ellipse(px, py, r * sx, r, rot, 0, Math.PI * 2); x.fill();
      if (px < r * 2) { x.beginPath(); x.ellipse(px + w, py, r * sx, r, rot, 0, Math.PI * 2); x.fill(); }
    }
    if (p.kind === 'ice' || p.kind === 'ocean') { x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(0, 0, w, h * 0.07); x.fillRect(0, h * 0.93, w, h * 0.07); }
    if (p.kind === 'lava') {
      ex.strokeStyle = '#ff5a00'; ex.lineWidth = 2;
      for (let i = 0; i < 60; i++) { ex.beginPath(); let px = rnd() * w, py = rnd() * h; ex.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (rnd() - 0.5) * 50; py += (rnd() - 0.5) * 30; ex.lineTo(px, py); } ex.stroke(); }
    }
    if (p.kind === 'dead') for (let i = 0; i < 80; i++) { x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; x.beginPath(); x.arc(rnd() * w, rnd() * h, 2 + rnd() * 10, 0, Math.PI * 2); x.stroke(); }
  }
  if (p.kind === 'city' || p.kind === 'ocean' || p.kind === 'desert') {
    const lights = p.kind === 'city' ? 2500 : 250;
    for (let i = 0; i < lights; i++) {
      const cx = rnd() * w, cy = h * 0.15 + rnd() * h * 0.7;
      ex.fillStyle = rnd() < 0.7 ? '#ffd24a' : (rnd() < 0.5 ? '#ff2bd6' : '#00f0ff');
      ex.fillRect(cx, cy, 1.5, 1.5);
    }
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping;
  const em = new THREE.CanvasTexture(e); em.colorSpace = THREE.SRGBColorSpace; em.wrapS = THREE.RepeatWrapping;
  return { map, em };
}

const atmoMatCache = new Map();
function atmoMat(color) {
  if (!atmoMatCache.has(color)) atmoMatCache.set(color, new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(c * f * 1.6, f); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  return atmoMatCache.get(color);
}

function makePlanet(p) {
  const g = new THREE.Group();
  const { map, em } = planetTexture(p);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.r, 64, 32), new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.85, metalness: 0.05 }));
  mesh.rotation.z = 0.3;
  g.add(mesh);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.08, 48, 24), atmoMat(p.c1)));
  if (p.ring) {
    const rc = document.createElement('canvas'); rc.width = 256; rc.height = 4;
    const rx = rc.getContext('2d');
    for (let i = 0; i < 256; i++) { rx.fillStyle = hexA(p.c1, (Math.sin(i * 0.3) * 0.5 + 0.5) * 0.55 * (i > 20 ? 1 : i / 20)); rx.fillRect(i, 0, 1, 4); }
    const tex = new THREE.CanvasTexture(rc); tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.RingGeometry(p.r * 1.45, p.r * 2.4, 96, 1);
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - p.r * 1.45) / (p.r * 0.95), 0.5); }
    const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2 + 0.35; ring.rotation.y = 0.2;
    g.add(ring);
  }
  g.userData.spin = mesh;
  return g;
}

// ---- 스테이션 ----
const neonMats = new Map();
function neonMat(color, k = 1.6) {
  const key = color + k;
  if (!neonMats.has(key)) neonMats.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
  return neonMats.get(key);
}
const hullMat = new THREE.MeshStandardMaterial({ color: 0x1b1433, metalness: 0.75, roughness: 0.35 });
function makeStation(st) {
  const g = new THREE.Group();
  const S = 230;
  const rot = new THREE.Group(); g.add(rot);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(S, S * 0.07, 12, 64), hullMat); ring.rotation.x = Math.PI / 2; rot.add(ring);
  const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(S, S * 0.02, 6, 96), neonMat(st.color, 2)); ringGlow.rotation.x = Math.PI / 2; ringGlow.position.y = S * 0.06; rot.add(ringGlow);
  const ringGlow2 = ringGlow.clone(); ringGlow2.position.y = -S * 0.06; rot.add(ringGlow2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(S * 0.7, S * 0.04, S * 0.06), hullMat);
    sp.position.set(Math.cos(a) * S * 0.62, 0, Math.sin(a) * S * 0.62); sp.rotation.y = -a; rot.add(sp);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(S * 0.18, S * 0.14, S * 0.14), hullMat);
    pod.position.set(Math.cos(a) * S, 0, Math.sin(a) * S); pod.rotation.y = -a; rot.add(pod);
    const win = new THREE.Mesh(new THREE.BoxGeometry(S * 0.19, S * 0.03, S * 0.1), neonMat(i % 2 ? st.color : '#ffe600', 1.8));
    win.position.copy(pod.position); win.rotation.y = -a; rot.add(win);
  }
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(S * 0.32, S * 0.38, S * 0.55, 6), hullMat));
  const hubRing = new THREE.Mesh(new THREE.TorusGeometry(S * 0.36, S * 0.02, 6, 6), neonMat(st.color, 2)); hubRing.rotation.x = Math.PI / 2; g.add(hubRing);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(S * 0.03, S * 0.08, S * 1.4, 6), hullMat));
  const tip = new THREE.Sprite(glowMat('#ff2255', 1)); tip.scale.setScalar(S * 0.5); tip.position.y = S * 0.72; g.add(tip);
  const tip2 = new THREE.Sprite(glowMat('#ff2255', 1)); tip2.scale.setScalar(S * 0.5); tip2.position.y = -S * 0.72; g.add(tip2);
  const halo = new THREE.Sprite(glowMat(st.color, 0.12)); halo.scale.setScalar(S * 2.6); g.add(halo);
  const dock = new THREE.Mesh(new THREE.RingGeometry(695, 705, 96), new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  dock.rotation.x = -Math.PI / 2; g.add(dock);
  g.userData = { rot, tips: [tip, tip2] };
  return g;
}

// ---- 소행성대 ----
const rockGeos = [];
function rockGeo(k) {
  if (rockGeos[k]) return rockGeos[k];
  const g = new THREE.IcosahedronGeometry(1, 1);
  const rnd = mulberry32(k * 77 + 3);
  const pos = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.7 + rnd() * 0.45);
    const f = seen.get(key);
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.8, pos.getZ(i) * f);
  }
  g.computeVertexNormals();
  rockGeos[k] = g;
  return g;
}
const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a94b0, roughness: 0.92, metalness: 0.25, flatShading: true });
const crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8) });
export const astHeight = (a) => ((a[5] % 1000) / 1000 - 0.5) * 520;

function makeBelt(belt, parent) {
  const list = G.asteroids.filter((a) => a && Math.hypot(a[1] - belt.x, a[2] - belt.y) <= belt.r + 10);
  const g = new THREE.Group();
  parent.add(g);
  const groups = [[], [], []];
  list.forEach((a) => groups[a[5] % 3].push(a));
  const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1), crystalMat, Math.max(1, list.length * 2));
  const base = new THREE.Color('#1c1830');
  let ci = 0;
  groups.forEach((arr, k) => {
    if (!arr.length) return;
    const im = new THREE.InstancedMesh(rockGeo(k), rockMat, arr.length);
    arr.forEach((a, i) => {
      const [id, x, y, r, ore, seed] = a;
      const rnd = mulberry32(seed + 11);
      const hh = astHeight(a);
      dummy.position.set(x - belt.x, hh, y - belt.y);
      dummy.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      const oc = new THREE.Color(ITEMS[ore].color);
      const tint = base.clone().lerp(oc, 0.22);
      im.setColorAt(i, tint);
      const crys = [];
      for (let c = 0; c < 2; c++) {
        const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5).normalize().multiplyScalar(r * 0.78);
        dummy.position.set(x - belt.x + d.x, hh + d.y, y - belt.y + d.z);
        dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        dummy.scale.set(r * 0.13, r * 0.32, r * 0.13);
        dummy.updateMatrix();
        crystals.setMatrixAt(ci, dummy.matrix);
        crystals.setColorAt(ci, oc);
        crys.push({ i: ci, m: dummy.matrix.clone() });
        ci++;
      }
      astIndex[id] = { im, i, crys, crystals, base: tint };
    });
    im.instanceColor.needsUpdate = true;
    g.add(im);
  });
  crystals.count = ci;
  g.add(crystals);
  return { belt, g };
}

let prevDep = new Set();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const DEP_COL = new THREE.Color('#0d0b14');
function syncDepleted() {
  const cur = G.dep;
  const changed = [];
  for (const id of cur) if (!prevDep.has(id)) changed.push([id, true]);
  for (const id of prevDep) if (!cur.has(id)) changed.push([id, false]);
  if (!changed.length) return;
  for (const [id, dep] of changed) {
    const e = astIndex[id]; if (!e) continue;
    e.im.setColorAt(e.i, dep ? DEP_COL : e.base); e.im.instanceColor.needsUpdate = true;
    for (const c of e.crys) e.crystals.setMatrixAt(c.i, dep ? ZERO : c.m);
    e.crystals.instanceMatrix.needsUpdate = true;
  }
  prevDep = new Set(cur);
}

// ---- 주권 비콘 ----
function makeBeacon(b) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(25, 60, 520, 6), hullMat));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(90), neonMat('#ffffff', 1.6)); core.position.y = 380; g.add(core);
  const glow = new THREE.Sprite(glowMat('#ffffff', 0.8)); glow.scale.setScalar(700); glow.position.y = 380; g.add(glow);
  const zone = new THREE.Mesh(new THREE.RingGeometry(1780, 1800, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  zone.rotation.x = -Math.PI / 2; g.add(zone);
  const prog = new THREE.Mesh(new THREE.RingGeometry(1810, 1860, 128, 1, 0, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthWrite: false }));
  prog.rotation.x = -Math.PI / 2; g.add(prog);
  return { b, g, core, glow, zone, prog, lastProg: -1 };
}

// ------------------------------------------------------------
//  함선 3D 모델 (2D 윤곽을 돌출 + 네온 엣지)
// ------------------------------------------------------------
const shipGeoCache = new Map();
function shipGeometry(shape) {
  if (shipGeoCache.has(shape)) return shipGeoCache.get(shape);
  const pts = SHAPES[shape] || SHAPES.shuttle;
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
  geo.translate(0, 0, -0.06);
  geo.rotateX(Math.PI / 2);   // 윤곽 y → 좌우(z), 두께 → 위아래(y)
  const top = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * 0.55 + 0.1, y * 0.35))), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 2 });
  top.rotateX(Math.PI / 2); top.translate(0, 0.16, 0);
  const res = { geo, edges: new THREE.EdgesGeometry(geo, 25), top, topEdges: new THREE.EdgesGeometry(top, 25) };
  shipGeoCache.set(shape, res);
  return res;
}
const edgeMats = new Map();
function edgeMat(color) {
  if (!edgeMats.has(color)) edgeMats.set(color, new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8) }));
  return edgeMats.get(color);
}
const shipBodyMat = new THREE.MeshStandardMaterial({ color: 0x1d1636, metalness: 0.8, roughness: 0.32 });
const shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });

function makeShip(shape, color, radius, parent = scene) {
  const R = radius * 1.35;
  const { geo, edges, top, topEdges } = shipGeometry(shape);
  const root = new THREE.Group();
  const bank = new THREE.Group(); root.add(bank);
  const body = new THREE.Mesh(geo, shipBodyMat); body.scale.setScalar(R); bank.add(body);
  const line = new THREE.LineSegments(edges, edgeMat(color)); line.scale.setScalar(R); bank.add(line);
  const topM = new THREE.Mesh(top, shipBodyMat); topM.scale.setScalar(R); bank.add(topM);
  const topL = new THREE.LineSegments(topEdges, edgeMat(color)); topL.scale.setScalar(R); bank.add(topL);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), neonMat(color, 2.2)); cockpit.scale.set(R * 1.4, R * 0.6, R * 0.9); cockpit.position.set(R * 0.35, R * 0.2, 0); bank.add(cockpit);
  const engine = new THREE.Sprite(glowMat(color, 1)); engine.position.set(-R * 0.62, 0, 0); bank.add(engine);
  const engineCore = new THREE.Sprite(glowMat('#ffffff', 1)); engineCore.position.set(-R * 0.6, 0, 0); bank.add(engineCore);
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 1.35, 2), shieldMat.clone()); shield.visible = false; root.add(shield);
  const warpRing = new THREE.Mesh(new THREE.TorusGeometry(R * 1.8, R * 0.06, 6, 48), neonMat('#ffe600', 2)); warpRing.rotation.x = Math.PI / 2; warpRing.visible = false; root.add(warpRing);
  root.rotation.order = 'YXZ';
  root.userData = { bank, engine, engineCore, shield, warpRing, line, topL, color, R, prevA: 0, bankV: 0 };
  if (parent) parent.add(root);
  return root;
}
function setShipColor(obj, color) {
  const u = obj.userData;
  if (u.color === color) return;
  u.color = color;
  u.line.material = edgeMat(color); u.topL.material = edgeMat(color); u.engine.material = glowMat(color, 1);
}
function updateShipObj(obj, x, y, a, thrust, hitT, sh, flags, t, dt, idSeed) {
  const u = obj.userData;
  setPos(obj, x, y, Math.sin(t * 1.3 + idSeed) * 4);
  obj.rotation.y = -a;
  // 선회 시 기울기(뱅킹)
  let da = a - u.prevA; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
  u.prevA = a;
  const target = Math.max(-0.7, Math.min(0.7, (da / Math.max(dt, 0.001)) * 0.28));
  u.bankV += (target - u.bankV) * Math.min(1, dt * 6);
  u.bank.rotation.x = u.bankV;
  const fl = thrust * (0.85 + Math.random() * 0.3);
  u.engine.scale.setScalar(u.R * (0.6 + fl * 1.5));
  u.engine.position.x = -u.R * (0.62 + fl * 0.25);
  u.engineCore.scale.setScalar(u.R * (0.3 + fl * 0.6));
  const since = t - (hitT || -9);
  u.shield.material.opacity = since < 0.35 && sh > 0 ? (1 - since / 0.35) * 0.5 : 0;
  u.shield.visible = u.shield.material.opacity > 0;
  u.shield.rotation.y = t;
  u.warpRing.visible = !!(flags & 2);
  if (u.warpRing.visible) { u.warpRing.scale.setScalar(1 + Math.sin(t * 20) * 0.08); u.warpRing.rotation.z = t * 3; }
}

// ------------------------------------------------------------
//  동적 이펙트: 투사체 · 파티클 · 링 · 섬광 · 빔 · 워프 · 조준선
// ------------------------------------------------------------
let shotMesh;
const MAX_SHOTS = 2500;
let partPts, partGeo, partPos, partCol, partSize, partAlpha;
const MAX_PARTS = 4000;
const ringPool = [], flashPool = [], beamPool = [];
let flashes = [];
let streaks, streakPos;
const streakPts = [];
let aimLine;

function setupDynamic() {
  const shotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  shotMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shotMat, MAX_SHOTS);
  shotMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHOTS * 3), 3);
  shotMesh.count = 0; shotMesh.frustumCulled = false;
  scene.add(shotMesh);

  partGeo = new THREE.BufferGeometry();
  partPos = new Float32Array(MAX_PARTS * 3); partCol = new Float32Array(MAX_PARTS * 3);
  partSize = new Float32Array(MAX_PARTS); partAlpha = new Float32Array(MAX_PARTS);
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3).setUsage(THREE.DynamicDrawUsage));
  partGeo.setAttribute('pcolor', new THREE.BufferAttribute(partCol, 3).setUsage(THREE.DynamicDrawUsage));
  partGeo.setAttribute('psize', new THREE.BufferAttribute(partSize, 1).setUsage(THREE.DynamicDrawUsage));
  partGeo.setAttribute('palpha', new THREE.BufferAttribute(partAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const pm = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 500 } },
    vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float scale; varying vec3 vC; varying float vA;
      void main(){ vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = clamp(psize * scale / -mv.z, 1.5, 256.0); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC*1.8*a, a*vA); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  partPts = new THREE.Points(partGeo, pm); partPts.frustumCulled = false;
  scene.add(partPts);

  const sN = 260;
  streakPos = new Float32Array(sN * 6);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(streakPos, 3).setUsage(THREE.DynamicDrawUsage));
  streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 1.8, 2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  streaks.frustumCulled = false;
  scene.add(streaks);
  for (let i = 0; i < sN; i++) streakPts.push({ x: 0, y: 0, h: 0, live: false });

  const ag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]);
  aimLine = new THREE.Line(ag, new THREE.LineDashedMaterial({ color: 0x00f0ff, dashSize: 18, gapSize: 22, transparent: true, opacity: 0.35 }));
  aimLine.frustumCulled = false;
  scene.add(aimLine);
}

function pooled(pool, make) {
  for (const o of pool) if (!o.visible) { o.visible = true; return o; }
  const o = make(); pool.push(o); scene.add(o); return o;
}
function hideAll(pool) { for (const o of pool) o.visible = false; }

const ringGeo = new THREE.RingGeometry(0.92, 1, 64);
function ringMesh() { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; return m; }
function flashSprite() { return new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); }
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
function beamMesh() { return new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); }
const vA = new THREE.Vector3(), vB = new THREE.Vector3();
function placeBeam(m, ax, ay, ah, bx, by, bh, w, color) {
  vA.set(ax - O.x, ah, ay - O.y); vB.set(bx - O.x, bh, by - O.y);
  vB.sub(vA);
  const L = vB.length();
  m.position.copy(vA).addScaledVector(vB, 0.5);
  m.quaternion.setFromUnitVectors(UP, vB.normalize());
  m.scale.set(w, L, w);
  m.material.color.copy(color);
}

// 이상 신호 · 전리품
const anomObjs = new Map(), lootObjs = new Map();
const ANOM_COL = { wreck: '#9affff', cache: '#ff4df0', relic: '#c070ff' };
function makeAnomaly(type) {
  const g = new THREE.Group();
  const c = ANOM_COL[type];
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(70, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.8), wireframe: true }));
  g.add(core);
  g.add(new THREE.Mesh(new THREE.OctahedronGeometry(35, 0), neonMat(c, 1.2)));
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(120, 3, 6, 48), neonMat(c, 1.6)); g.add(r1);
  const r2 = r1.clone(); g.add(r2);
  const glow = new THREE.Sprite(glowMat(c, 0.7)); glow.scale.setScalar(500); g.add(glow);
  if (type === 'wreck') {
    const sg = shipGeometry('hauler');
    const hull = new THREE.Mesh(sg.geo, shipBodyMat); hull.scale.setScalar(90); hull.rotation.set(0.6, 1, 0.9); hull.position.set(0, -60, 120); g.add(hull);
    const hl = new THREE.LineSegments(sg.edges, edgeMat('#555577')); hl.scale.setScalar(90); hl.rotation.copy(hull.rotation); hl.position.copy(hull.position); g.add(hl);
  }
  g.userData = { core, r1, r2 };
  scene.add(g);
  return g;
}
const lootGeo = new THREE.BoxGeometry(18, 18, 18);
const lootEdges = new THREE.EdgesGeometry(lootGeo);
function makeLoot(item) {
  const g = new THREE.Group();
  const c = ITEMS[item]?.color || '#ffffff';
  g.add(new THREE.Mesh(lootGeo, shipBodyMat));
  g.add(new THREE.LineSegments(lootEdges, edgeMat(c)));
  const glow = new THREE.Sprite(glowMat(c, 0.8)); glow.scale.setScalar(90); g.add(glow);
  scene.add(g);
  return g;
}

// ------------------------------------------------------------
//  파티클 API (main.js에서 사용)
// ------------------------------------------------------------
const colCache = new Map();
function col(c) { if (!colCache.has(c)) colCache.set(c, new THREE.Color(c)); return colCache.get(c); }
export function spawnParticle(x, y, vx, vy, life, color, size, h = 0, vh = 0) {
  if (G.particles.length >= (G.settings.quality === 'low' ? 1200 : MAX_PARTS)) return;
  G.particles.push({ x, y, h, vx, vy, vh, life, max: life, c: col(color), size: size * 3 });
}
export function explosion(x, y, r) {
  const n = Math.min(160, 40 + r * 2.5);
  const cols = ['#ffffff', '#ffe600', '#ff8a00', '#ff2bd6', '#00f0ff'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * 2, s = Math.random() * (160 + r * 14);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + Math.random() * 1.3, cols[i % cols.length], 2 + Math.random() * 4, 0, e * s * 0.8);
  }
  G.rings.push({ x, y, r: r * 0.5, max: r * 7 + 160, life: 0.8, t: 0, color: '#ff8a00' });
  flashes.push({ x, y, size: r * 14 + 200, life: 0.45, t: 0 });
}
export function sparks(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 280;
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.3, color, 2, 0, (Math.random() - 0.5) * 200);
  }
  flashes.push({ x, y, size: 90, life: 0.12, t: 0, color });
}

// ------------------------------------------------------------
//  카메라 · 조준
// ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitV = new THREE.Vector3(), ndc = new THREE.Vector2();
// 마우스 → 은하 평면상의 월드 좌표
export function screenToWorld(px, py) {
  if (!camera || !W) return { x: G.self.x, y: G.self.y };
  ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(plane, hitV)) {
    const d = raycaster.ray.direction; return { x: O.x + d.x * 1e5, y: O.y + d.z * 1e5 };
  }
  return { x: hitV.x + O.x, y: hitV.z + O.y };
}
export function aimAt(px, py) {
  const w = screenToWorld(px, py);
  return Math.atan2(w.y - G.self.y, w.x - G.self.x);
}

function placeCamera(dt) {
  const c = G.cam;
  const warp = G.self.warp === 2;
  c.dist += ((c.userDist * (warp ? 2.2 : 1)) - c.dist) * Math.min(1, dt * 3);
  const fov = warp ? 80 : 60;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 2.5); camera.updateProjectionMatrix(); }
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  let sx = 0, sy = 0, sz = 0;
  if (c.shake > 0) { const k = c.shake * c.dist / 900; sx = (Math.random() - 0.5) * k; sy = (Math.random() - 0.5) * k; sz = (Math.random() - 0.5) * k; c.shake = Math.max(0, c.shake - dt * 40); }
  camera.position.set(Math.cos(c.yaw) * cp * c.dist + sx, sp * c.dist + sy, Math.sin(c.yaw) * cp * c.dist + sz);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
}

// ------------------------------------------------------------
//  오버레이 (라벨 · 체력바 · 화면 밖 표시기)
// ------------------------------------------------------------
function proj(x, y, h = 0) {
  V.set(x - O.x, h, y - O.y).project(camera);
  if (V.z > 1 || V.z < -1) return null;
  return { x: (V.x + 1) / 2 * W, y: (1 - V.y) / 2 * H };
}
function label(text, x, y, color, size = 12, bold = false) {
  if (x < -200 || x > W + 200 || y < -50 || y > H + 50) return;
  octx.font = `${bold ? 700 : 500} ${size}px 'Noto Sans KR', sans-serif`;
  octx.textAlign = 'center';
  octx.fillStyle = 'rgba(0,0,0,0.65)'; octx.fillText(text, x + 1, y + 1);
  octx.fillStyle = color; octx.fillText(text, x, y);
}
const fmtD = (d) => d >= 1000 ? (d / 1000).toFixed(d > 100000 ? 0 : 1) + 'km' : Math.round(d) + 'm';

function edgeMarker(x, y, color, text, t) {
  V.set(x - O.x, 0, y - O.y).project(camera);
  let nx = V.x, ny = V.y;
  const behind = V.z > 1;
  if (behind) { nx = -nx; ny = -ny; }
  const m = 0.93;
  if (!behind && Math.abs(nx) < m && Math.abs(ny) < m) return;
  const a = Math.atan2(-ny, nx);
  const s = Math.min(m / Math.abs(nx || 1e-6), m / Math.abs(ny || 1e-6));
  const px = (nx * s + 1) / 2 * W, py = (1 - ny * s) / 2 * H;
  octx.save(); octx.translate(px, py); octx.rotate(a);
  octx.fillStyle = color; octx.globalAlpha = 0.75 + Math.sin(t * 5) * 0.25;
  octx.beginPath(); octx.moveTo(12, 0); octx.lineTo(-6, 8); octx.lineTo(-6, -8); octx.closePath(); octx.fill();
  octx.restore();
  if (text) label(text, px - Math.cos(a) * 40, py - Math.sin(a) * 24, color, 11, true);
}

function shipInfo(type) {
  if (type.startsWith('npc:')) { const n = NPCS[type.slice(4)]; return { spec: n, shape: n.shape, color: n.color, npc: true }; }
  const s = SHIPS[type]; return { spec: s, shape: s.shape, color: s.color, npc: false };
}

// ------------------------------------------------------------
//  메인 렌더
// ------------------------------------------------------------
const shipObjs = new Map();
let selfObj = null, selfType = null;
const WHITE = new THREE.Color('#ffffff');

export function render(dt, t) {
  if (!renderer) return;
  if (G.world && builtWorld !== G.world) buildWorld();
  O.x = G.cam.x; O.y = G.cam.y;
  placeCamera(dt);
  sky.position.copy(camera.position); starPts.position.copy(camera.position);
  octx.setTransform(DPR, 0, 0, DPR, 0, 0);
  octx.clearRect(0, 0, W, H);
  if (G.world && G.loggedIn) {
    const T = serverTime();
    updateWorld(T, t, dt);
    updateDynamic(T, t, dt);
  }
  partPts.material.uniforms.scale.value = (H * DPR) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  if (G.settings.quality === 'low') renderer.render(scene, camera);
  else composer.render(dt);
}

function updateWorld(T, t, dt) {
  // 가장 가까운 항성 → 조명 · 성운 색
  let near = null, nd = Infinity;
  for (const o of sysObjs) { const d = Math.hypot(o.s.x - O.x, o.s.y - O.y); if (d < nd) { nd = d; near = o; } }
  if (near) {
    setPos(starLight, near.s.x, near.s.y, 0);
    starLight.color.set(near.s.starColor).lerp(WHITE, 0.5);
    skyMat.uniforms.c1.value.lerp(col(near.s.nebula), Math.min(1, dt * 0.5));
    skyMat.uniforms.seed.value = parseInt(near.s.id.slice(1), 10) * 3.1;
  }
  grid.visible = G.cam.dist < 9000 && !!G.me && !G.me.dock;
  const gs = 500;
  grid.position.set(Math.round(O.x / gs) * gs - O.x, -30, Math.round(O.y / gs) * gs - O.y);

  for (const o of sysObjs) {
    const s = o.s;
    const d = Math.hypot(s.x - O.x, s.y - O.y);
    const detailed = d < 260000;
    o.grp.visible = detailed;
    o.far.visible = d > 60000;
    if (o.far.visible) {
      setPos(o.far, s.x, s.y, 0);
      o.far.material.opacity = Math.min(1, (d - 60000) / 60000);
      const p = proj(s.x, s.y, 0);
      if (p) {
        const known = G.acct?.discovered?.includes(s.id);
        label(known ? s.name : '??? 미탐사 성계', p.x, p.y - 14, known ? '#ffffff' : '#8890aa', 12, true);
        label(`${fmtD(d)} · 보안 ${s.sec.toFixed(1)}`, p.x, p.y + 20, secColor(s.sec), 10);
      }
    }
    if (!detailed) continue;
    setPos(o.star, s.x, s.y, 0); o.corona.position.copy(o.star.position); o.halo.position.copy(o.star.position);
    o.corona.scale.setScalar(s.starR * (4.5 + Math.sin(t * 0.8) * 0.2));
    // 빌보드 광륜 안에 카메라가 들어가면 화면 전체가 번지므로 거리 기반으로 페이드
    const camD = Math.hypot(d, G.cam.dist);
    o.halo.material.opacity = Math.max(0, Math.min(0.18, (camD - s.starR * 5) / (s.starR * 20)));
    o.halo.visible = o.halo.material.opacity > 0.005;
    o.star.rotation.y = t * 0.02;
    for (const pl of o.planets) {
      const pos = bodyPos(pl.p, G.bodies, T);
      const pd = Math.hypot(pos.x - O.x, pos.y - O.y);
      if (!pl.mesh && pd < 180000) { pl.mesh = makePlanet(pl.p); o.grp.add(pl.mesh); }
      if (!pl.mesh) continue;
      setPos(pl.mesh, pos.x, pos.y, 0);
      pl.mesh.userData.spin.rotation.y = T * 0.01;
      if (pd < 90000) { const p = proj(pos.x, pos.y, -pl.p.r * 1.1); if (p) label(pl.p.name, p.x, p.y + 14, 'rgba(200,220,255,0.7)', 12); }
    }
    for (const so of o.stations) {
      const pos = bodyPos(so.st, G.bodies, T);
      setPos(so.g, pos.x, pos.y, 0);
      so.g.userData.rot.rotation.y = t * 0.12;
      const blink = Math.sin(t * 3) > 0;
      so.g.userData.tips.forEach((tp) => (tp.visible = blink));
      const sd = Math.hypot(pos.x - O.x, pos.y - O.y);
      if (sd < 70000) { const p = proj(pos.x, pos.y, -260); if (p) { label(`◆ ${so.st.name}`, p.x, p.y + 14, so.st.color, 13, true); if (sd > 3000) label(fmtD(sd), p.x, p.y + 30, 'rgba(255,255,255,0.55)', 10); } }
    }
    for (const b of o.belts) b.g.position.set(b.belt.x - O.x, 0, b.belt.y - O.y);
    if (o.beacon) {
      const bo = o.beacon, b = bo.b;
      setPos(bo.g, b.x, b.y, 0);
      const sv = G.info.sov[b.id] || {};
      const owner = sv.owner && G.info.clans[sv.owner];
      const c = owner ? owner.color : '#ffffff';
      bo.core.material = neonMat(c, 1.6); bo.glow.material = glowMat(c, 0.8); bo.zone.material.color.set(c);
      bo.core.rotation.y = t; bo.core.position.y = 380 + Math.sin(t * 2) * 20;
      const prog = Math.round(sv.prog || 0);
      if (prog !== bo.lastProg) {
        bo.lastProg = prog;
        bo.prog.geometry.dispose();
        bo.prog.geometry = new THREE.RingGeometry(1810, 1870, 128, 1, Math.PI / 2, Math.max(0.001, (prog / 100) * Math.PI * 2));
      }
      bo.prog.material.color.set(sv.cap ? (G.info.clans[sv.cap]?.color || '#ffffff') : c);
      const bd = Math.hypot(b.x - O.x, b.y - O.y);
      if (bd < 60000) { const p = proj(b.x, b.y, 520); if (p) label(`⚑ ${b.name}${sv.owner ? ` [${sv.owner}]` : ' (무주지)'}${prog && prog < 100 ? ` ${prog}%` : ''}`, p.x, p.y - 10, c, 13, true); }
    }
  }
  syncDepleted();
}

const tmpC = new THREE.Color();
function updateDynamic(T, t, dt) {
  const me = G.me;
  const myClan = G.acct?.clan;
  // --- 다른 함선 ---
  for (const [id, obj] of shipObjs) if (!G.ships.has(id)) { scene.remove(obj); shipObjs.delete(id); }
  hideAll(beamPool);
  for (const e of G.ships.values()) {
    const info = shipInfo(e.type);
    let obj = shipObjs.get(e.id);
    if (!obj || obj.userData.type !== e.type) { if (obj) scene.remove(obj); obj = makeShip(info.shape, info.color, info.spec.radius); obj.userData.type = e.type; shipObjs.set(e.id, obj); }
    let color = info.color;
    if (!info.npc) { if (e.flags & 16) color = '#ff2255'; else if (myClan && e.tag === myClan) color = '#2cff9a'; }
    setShipColor(obj, color);
    const thrust = (e.flags & 1) ? 2.5 : (e.flags & 8) ? 1 : 0.15;
    updateShipObj(obj, e.dx, e.dy, e.da, thrust + ((e.flags & 4) ? 0.8 : 0), e.hitT, e.sh, e.flags, t, dt, e.id.length * 1.7);
    if (e.mine >= 0 && G.asteroids[e.mine]) drawBeam(e.dx, e.dy, e.da, G.asteroids[e.mine], t);
    if (G.settings.quality !== 'low' && (e.flags & 9)) trail(e.dx, e.dy, e.da, info.color, info.spec.radius, (e.flags & 1) ? 2 : 1);
    if (G.settings.names) {
      const p = proj(e.dx, e.dy, info.spec.radius * 2.2 + 20);
      if (p) {
        const nm = info.npc ? info.spec.name : `${e.tag ? `[${e.tag}] ` : ''}${e.name}`;
        label(nm + ((e.flags & 16) ? ' ☠' : ''), p.x, p.y - 12, info.npc ? '#ff5577' : color, 12, !info.npc);
        const bw = 46;
        octx.fillStyle = 'rgba(0,0,0,0.6)'; octx.fillRect(p.x - bw / 2, p.y - 6, bw, 6);
        if (info.spec.shield) { octx.fillStyle = '#00f0ff'; octx.fillRect(p.x - bw / 2, p.y - 6, bw * e.sh / 100, 2); }
        octx.fillStyle = e.hp > 35 ? '#ffb000' : '#ff2255'; octx.fillRect(p.x - bw / 2, p.y - 3, bw * e.hp / 100, 2);
        if (e.flags & 32) label('⚠ 조준됨', p.x, p.y + 60, '#ff2255', 10, true);
      }
    }
  }
  // --- 내 함선 ---
  const showSelf = me && !me.dock && !me.dead;
  if (showSelf) {
    const spec = SHIPS[me.type];
    if (!selfObj || selfType !== me.type) { if (selfObj) scene.remove(selfObj); selfObj = makeShip(spec.shape, spec.color, spec.radius); selfType = me.type; }
    selfObj.visible = true;
    const k = G.input.keys | (me.ap ? me.ak : 0);
    const thrust = G.self.warp === 2 ? 2.8 : (k & 1) ? 1 + (me.boost ? 0.9 : 0) : (k & 14) ? 0.45 : 0.15;
    updateShipObj(selfObj, G.self.x, G.self.y, G.self.a, thrust, G.selfHitT, me.s, me.w === 1 ? 2 : 0, t, dt, 0);
    if (me.mine >= 0 && G.asteroids[me.mine]) drawBeam(G.self.x, G.self.y, G.self.a, G.asteroids[me.mine], t);
    if (G.settings.quality !== 'low' && thrust > 0.3) trail(G.self.x, G.self.y, G.self.a, spec.color, spec.radius, G.self.warp === 2 ? 2 : thrust);
    aimLine.visible = !me.ap && G.self.warp === 0;
    if (aimLine.visible) {
      const L = 700, arr = aimLine.geometry.attributes.position.array;
      const c = Math.cos(G.self.a), s = Math.sin(G.self.a);
      arr[0] = c * spec.radius * 2; arr[1] = 0; arr[2] = s * spec.radius * 2;
      arr[3] = c * L; arr[4] = 0; arr[5] = s * L;
      aimLine.geometry.attributes.position.needsUpdate = true;
      aimLine.computeLineDistances();
      setPos(aimLine, G.self.x, G.self.y, 0);
    }
  } else { if (selfObj) selfObj.visible = false; aimLine.visible = false; }

  // --- 투사체 ---
  let n = 0;
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.life -= dt;
    if (s.life <= 0) { G.shots.splice(i, 1); continue; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (n >= MAX_SHOTS) continue;
    const w = WEAPONS[s.w];
    const sp = Math.hypot(s.vx, s.vy);
    const len = Math.max(20, sp * (s.w.includes('rail') ? 0.06 : 0.028));
    const ang = Math.atan2(s.vy, s.vx);
    dummy.position.set(s.x - Math.cos(ang) * len / 2 - O.x, 0, s.y - Math.sin(ang) * len / 2 - O.y);
    dummy.rotation.set(0, -ang, 0);
    dummy.scale.set(len, w.size * 1.6, w.size * 1.6);
    dummy.updateMatrix();
    shotMesh.setMatrixAt(n, dummy.matrix);
    shotMesh.setColorAt(n, tmpC.set(w.color));
    n++;
  }
  for (const m of G.missiles.values()) {
    m.dx += (m.x - m.dx) * 0.3 + m.vx * dt; m.dy += (m.y - m.dy) * 0.3 + m.vy * dt;
    const a = Math.atan2(m.vy, m.vx);
    if (n < MAX_SHOTS) {
      dummy.position.set(m.dx - O.x, 0, m.dy - O.y); dummy.rotation.set(0, -a, 0); dummy.scale.set(26, 7, 7); dummy.updateMatrix();
      shotMesh.setMatrixAt(n, dummy.matrix); shotMesh.setColorAt(n, tmpC.set('#ff8a00')); n++;
    }
    spawnParticle(m.dx - Math.cos(a) * 14, m.dy - Math.sin(a) * 14, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.6, '#ff8a00', 3);
  }
  shotMesh.count = n;
  shotMesh.instanceMatrix.needsUpdate = true;
  shotMesh.instanceColor.needsUpdate = true;

  // --- 전리품 ---
  for (const [id, o] of lootObjs) if (!G.loots.has(id)) { scene.remove(o); lootObjs.delete(id); }
  for (const [id, l] of G.loots) {
    let o = lootObjs.get(id);
    if (!o) { o = makeLoot(l.item); lootObjs.set(id, o); }
    setPos(o, l.x, l.y, Math.sin(t * 2 + l.x) * 10);
    o.rotation.set(t * 1.3, t * 1.7, 0);
    if (Math.hypot(l.x - G.self.x, l.y - G.self.y) < 1500) { const p = proj(l.x, l.y, 30); if (p) label(ITEMS[l.item]?.name || '', p.x, p.y - 6, ITEMS[l.item]?.color || '#fff', 10); }
  }
  // --- 이상 신호 ---
  for (const [id, o] of anomObjs) if (!G.anomalies.has(id)) { scene.remove(o); anomObjs.delete(id); }
  for (const an of G.anomalies.values()) {
    let o = anomObjs.get(an.id);
    if (!o) { o = makeAnomaly(an.type); anomObjs.set(an.id, o); }
    setPos(o, an.x, an.y, 60);
    o.userData.core.rotation.set(t * 0.7, t, 0);
    o.userData.r1.rotation.set(t * 0.9, 0, t * 0.4);
    o.userData.r2.rotation.set(0, t * 0.6, t * 1.1);
    const p = proj(an.x, an.y, 260);
    if (p) label(`✦ ${an.name}`, p.x, p.y, ANOM_COL[an.type], 12, true);
  }

  // --- 링 · 섬광 ---
  hideAll(ringPool);
  for (let i = G.rings.length - 1; i >= 0; i--) {
    const r = G.rings[i];
    r.t += dt;
    if (r.t >= r.life) { G.rings.splice(i, 1); continue; }
    const k = r.t / r.life;
    const m = pooled(ringPool, ringMesh);
    setPos(m, r.x, r.y, 0);
    m.scale.setScalar(r.r + (r.max - r.r) * k);
    m.material.color.set(r.color).multiplyScalar(1.8 * (1 - k));
  }
  hideAll(flashPool);
  flashes = flashes.filter((f) => (f.t += dt) < f.life);
  for (const f of flashes) {
    const s = pooled(flashPool, flashSprite);
    setPos(s, f.x, f.y, 0);
    const k = f.t / f.life;
    s.scale.setScalar(f.size * (0.6 + k * 0.6));
    s.material.color.set(f.color || '#ffd9a0');
    s.material.opacity = 1 - k;
  }

  // --- 파티클 ---
  const P = G.particles;
  let pn = 0;
  const damp = Math.pow(0.98, dt * 60);
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.life -= dt;
    if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt;
    p.vx *= damp; p.vy *= damp; p.vh *= damp;
    if (pn >= MAX_PARTS) continue;
    partPos[pn * 3] = p.x - O.x; partPos[pn * 3 + 1] = p.h; partPos[pn * 3 + 2] = p.y - O.y;
    partCol[pn * 3] = p.c.r; partCol[pn * 3 + 1] = p.c.g; partCol[pn * 3 + 2] = p.c.b;
    partSize[pn] = p.size; partAlpha[pn] = p.life / p.max;
    pn++;
  }
  partGeo.setDrawRange(0, pn);
  for (const k of ['position', 'pcolor', 'psize', 'palpha']) partGeo.attributes[k].needsUpdate = true;

  // --- 워프 스트릭 ---
  const warping = G.self.warp === 2 && showSelf;
  const sm = streaks.material;
  sm.opacity += ((warping ? 0.8 : 0) - sm.opacity) * Math.min(1, dt * 4);
  streaks.visible = sm.opacity > 0.02;
  if (streaks.visible) {
    const vx = G.self.vx, vy = G.self.vy, sp = Math.hypot(vx, vy) || 1;
    const dx = vx / sp, dy = vy / sp, len = Math.min(1600, sp * 0.12);
    streakPts.forEach((s, i) => {
      const rx = s.x - O.x, ry = s.y - O.y;
      if (!s.live || rx * rx + ry * ry > 9000 * 9000 || rx * dx + ry * dy < -3500) {
        const fwd = -1500 + Math.random() * 7000, side = (Math.random() - 0.5) * 12000;
        s.x = O.x + dx * fwd - dy * side; s.y = O.y + dy * fwd + dx * side; s.h = (Math.random() - 0.5) * 3000; s.live = true;
      }
      const o = i * 6;
      streakPos[o] = s.x - O.x; streakPos[o + 1] = s.h; streakPos[o + 2] = s.y - O.y;
      streakPos[o + 3] = s.x - dx * len - O.x; streakPos[o + 4] = s.h; streakPos[o + 5] = s.y - dy * len - O.y;
    });
    streaks.geometry.attributes.position.needsUpdate = true;
  }

  // --- 화면 밖 표시기 ---
  if (me && !me.dock) {
    if (me.ap) {
      let x = me.ap.x, y = me.ap.y;
      if (me.ap.kind === 'station' || me.ap.kind === 'planet') { const p = bodyPos(G.bodies[me.ap.id], G.bodies, T); x = p.x; y = p.y; }
      const d = Math.hypot(x - G.self.x, y - G.self.y);
      edgeMarker(x, y, '#ffe600', `${me.ap.name} ${fmtD(d)}`, t);
      const p = proj(x, y, 0);
      if (p) { octx.strokeStyle = '#ffe600'; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(p.x, p.y, 14 + Math.sin(t * 4) * 3, 0, Math.PI * 2); octx.stroke(); }
    }
    for (const e of G.ships.values()) if (e.flags & 32) edgeMarker(e.dx, e.dy, '#ff2255', '', t);
    for (const an of G.anomalies.values()) edgeMarker(an.x, an.y, '#c070ff', '', t);
  }
}

const beamCol = new THREE.Color(), CORE = new THREE.Color(2.5, 2.5, 2.5);
function drawBeam(x, y, a, ast, t) {
  const [, ax, ay, ar, ore] = ast;
  const c = ITEMS[ore].color;
  const ah = astHeight(ast);
  const g = Math.atan2(y - ay, x - ax);
  const tx = ax + Math.cos(g) * ar * 0.6 + Math.sin(t * 13) * ar * 0.12, ty = ay + Math.sin(g) * ar * 0.6 + Math.cos(t * 11) * ar * 0.12;
  const sx = x + Math.cos(a) * 14, sy = y + Math.sin(a) * 14;
  placeBeam(pooled(beamPool, beamMesh), sx, sy, 0, tx, ty, ah * 0.6, 5 + Math.sin(t * 30) * 1.5, beamCol.set(c).multiplyScalar(1.4));
  placeBeam(pooled(beamPool, beamMesh), sx, sy, 0, tx, ty, ah * 0.6, 1.5, CORE);
  if (Math.random() < 0.6) spawnParticle(tx, ty, (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 220, 0.5, c, 2.5, ah * 0.6, (Math.random() - 0.5) * 220);
}
function trail(x, y, a, color, r, k) {
  const bx = x - Math.cos(a) * r * 0.9, by = y - Math.sin(a) * r * 0.9;
  spawnParticle(bx, by, -Math.cos(a) * 70 + (Math.random() - 0.5) * 30, -Math.sin(a) * 70 + (Math.random() - 0.5) * 30, 0.45 + k * 0.25, color, 2.2 + k, 0, (Math.random() - 0.5) * 20);
}

// ------------------------------------------------------------
//  조선소 미리보기 (3D 모델 스냅샷)
// ------------------------------------------------------------
let pvR = null, pvScene, pvCam;
export function shipPreview(canvas, type) {
  const s = SHIPS[type];
  GLOW = GLOW || glowTexture();
  if (!pvR) {
    pvR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    pvR.setSize(280, 110); pvR.outputColorSpace = THREE.SRGBColorSpace;
    pvScene = new THREE.Scene();
    pvScene.add(new THREE.AmbientLight(0x8888bb, 1.2));
    const dl = new THREE.DirectionalLight(0xffffff, 2.5); dl.position.set(1, 2, 1.5); pvScene.add(dl);
    const pl = new THREE.DirectionalLight(0xff2bd6, 1.2); pl.position.set(-2, 0.5, -1); pvScene.add(pl);
    pvCam = new THREE.PerspectiveCamera(35, 280 / 110, 0.1, 100);
  }
  const g = makeShip(s.shape, s.color, 1, pvScene);
  const u = g.userData;
  u.engine.scale.setScalar(0.9); u.engineCore.scale.setScalar(0.4); u.engine.position.x = -1.1;
  g.rotation.y = 0.5; u.bank.rotation.x = -0.35;
  pvCam.position.set(0, 3.4, 2.6); pvCam.lookAt(0, 0, 0);
  pvR.render(pvScene, pvCam);
  pvScene.remove(g);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.drawImage(pvR.domElement, 0, 0, canvas.width, canvas.height);
}

// ------------------------------------------------------------
//  타이틀 화면 (3D 신스웨이브)
// ------------------------------------------------------------
export function titleBackground(canvas) {
  GLOW = GLOW || glowTexture();
  let r;
  try { r = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch { return () => {}; }
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.fog = new THREE.Fog(0x05010f, 400, 2600);
  sc.background = new THREE.Color(0x05010f);
  const cam = new THREE.PerspectiveCamera(65, 1, 1, 6000);
  cam.position.set(0, 60, 400);
  const gridT = new THREE.GridHelper(6000, 120, 0xff2bd6, 0xff2bd6);
  gridT.material.transparent = true; gridT.material.opacity = 0.7;
  sc.add(gridT);
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(1800, 3000, 30, 50);
    const rnd = mulberry32(side + 5);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) * side; const edge = Math.max(0, (x + 900) / 1800); pos.setZ(i, Math.pow(edge, 1.8) * (60 + rnd() * 320)); }
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x7a2bff, wireframe: true, transparent: true, opacity: 0.5 }));
    m.rotation.x = -Math.PI / 2; m.position.set(side * 1500, 0, -1200);
    sc.add(m);
  }
  const sc2 = document.createElement('canvas'); sc2.width = sc2.height = 512;
  const x = sc2.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#ffe600'); gr.addColorStop(0.55, '#ff5ab4'); gr.addColorStop(1, '#ff2bd6');
  x.fillStyle = gr; x.beginPath(); x.arc(256, 256, 250, 0, Math.PI * 2); x.fill();
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) x.fillRect(0, 290 + i * 26, 512, 4 + i * 1.8);
  const sunTex = new THREE.CanvasTexture(sc2); sunTex.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false }));
  sun.position.set(0, 330, -2400); sc.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xff2bd6, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, fog: false }));
  sunGlow.scale.setScalar(2600); sunGlow.position.set(0, 330, -2450); sc.add(sunGlow);
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) sp.set([(Math.random() - 0.5) * 8000, 200 + Math.random() * 2500, -2500 - Math.random() * 500], i * 3);
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sc.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfe8ff, size: 2, sizeAttenuation: false, fog: false })));
  sc.add(new THREE.AmbientLight(0x9988ff, 1.4));
  const dl = new THREE.DirectionalLight(0xff66cc, 2); dl.position.set(0, 1, -1); sc.add(dl);
  const flyers = ['katana', 'razor', 'mule', 'ronin', 'phantom', 'leviathan'].map((tp, i) => {
    const s = SHIPS[tp];
    const g = makeShip(s.shape, s.color, s.radius, sc);
    return { g, x: (i - 2.5) * 220, y: 90 + (i % 3) * 60, z: -300 - i * 300, v: 180 + Math.random() * 160 };
  });
  let run = true, last = performance.now();
  const fit = () => { const w = innerWidth, h = innerHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  fit(); addEventListener('resize', fit);
  function loop(now) {
    if (!run) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    gridT.position.z = (t * 160) % 50;
    for (const f of flyers) {
      f.z -= f.v * dt;
      if (f.z < -2600) f.z = 500;
      f.g.position.set(f.x + Math.sin(t * 0.7 + f.v) * 40, f.y + Math.sin(t + f.v) * 12, f.z);
      f.g.rotation.y = Math.PI / 2;
      f.g.userData.bank.rotation.x = Math.sin(t * 0.7 + f.v) * 0.35;
      f.g.userData.engine.scale.setScalar(f.g.userData.R * (1.6 + Math.random() * 0.5));
      f.g.userData.engineCore.scale.setScalar(f.g.userData.R * 0.8);
    }
    cam.position.x = Math.sin(t * 0.15) * 60;
    cam.lookAt(0, 80, -1000);
    r.render(sc, cam);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return () => { run = false; removeEventListener('resize', fit); r.dispose(); canvas.remove(); };
}
