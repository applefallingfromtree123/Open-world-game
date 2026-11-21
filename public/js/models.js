// ============================================================
//  절차적 3D 모델 — 함선 · 스테이션 · 행성 · 항성 · 소행성 · 화물
// ============================================================
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LD, E } from './engine.js';
import { NOISE } from './glsl.js';
import { mulberry32, fbm3, rng } from './util.js';

// ------------------------------------------------------------
//  텍스처 (캔버스 생성)
// ------------------------------------------------------------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TEX = {};
function panelTex() {
  if (TEX.panel) return TEX.panel;
  const rnd = mulberry32(42);
  TEX.panel = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#d6d6d6'; x.fillRect(0, 0, w, h);
    // 미세 얼룩
    for (let i = 0; i < 2600; i++) {
      const v = 190 + rnd() * 50 | 0;
      x.fillStyle = `rgba(${v},${v},${v},0.25)`;
      x.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 14, 2 + rnd() * 14);
    }
    // 패널 분할
    const split = (x0, y0, ww, hh, d) => {
      if (d > 4 || (d > 1 && rnd() < 0.25) || ww < 60 || hh < 60) {
        const sh = 205 + rnd() * 35 | 0;
        x.fillStyle = `rgb(${sh},${sh},${sh})`; x.fillRect(x0 + 2, y0 + 2, ww - 4, hh - 4);
        x.strokeStyle = 'rgba(30,30,30,0.85)'; x.lineWidth = 2.2; x.strokeRect(x0 + 1, y0 + 1, ww - 2, hh - 2);
        x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1; x.strokeRect(x0 + 3, y0 + 3, ww - 6, hh - 6);
        // 리벳
        if (rnd() < 0.5) {
          x.fillStyle = 'rgba(60,60,60,0.7)';
          for (let k = 8; k < ww - 6; k += 14) { x.fillRect(x0 + k, y0 + 6, 2.5, 2.5); x.fillRect(x0 + k, y0 + hh - 8, 2.5, 2.5); }
        }
        if (rnd() < 0.08) { // 경고 줄무늬
          x.save(); x.beginPath(); x.rect(x0 + 6, y0 + 6, ww - 12, Math.min(22, hh - 12)); x.clip();
          for (let k = -30; k < ww; k += 16) { x.fillStyle = 'rgba(40,40,40,0.6)'; x.beginPath(); x.moveTo(x0 + k, y0); x.lineTo(x0 + k + 8, y0); x.lineTo(x0 + k + 30, y0 + 30); x.lineTo(x0 + k + 22, y0 + 30); x.fill(); }
          x.restore();
        }
        if (rnd() < 0.1) { x.fillStyle = 'rgba(40,40,40,0.55)'; x.font = 'bold 14px monospace'; x.fillText(['SD-' + (rnd() * 99 | 0), 'NO STEP', '▲ FWD', 'O2', 'HV'][rnd() * 5 | 0], x0 + 8, y0 + hh - 10); }
        return;
      }
      if (ww > hh ? rnd() < 0.8 : rnd() < 0.2) { const s = ww * (0.3 + rnd() * 0.4); split(x0, y0, s, hh, d + 1); split(x0 + s, y0, ww - s, hh, d + 1); }
      else { const s = hh * (0.3 + rnd() * 0.4); split(x0, y0, ww, s, d + 1); split(x0, y0 + s, ww, hh - s, d + 1); }
    };
    split(0, 0, w, h, 0);
    // 그을음
    for (let i = 0; i < 40; i++) {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 60 + rnd() * 120);
      g.addColorStop(0, 'rgba(60,55,50,0.18)'); g.addColorStop(1, 'rgba(60,55,50,0)');
      x.save(); x.translate(rnd() * w, rnd() * h); x.scale(1, 0.4 + rnd()); x.fillStyle = g; x.fillRect(-200, -200, 400, 400); x.restore();
    }
  });
  return TEX.panel;
}
function roughTex() {
  if (TEX.rough) return TEX.rough;
  const rnd = mulberry32(7);
  TEX.rough = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { const v = 100 + rnd() * 110 | 0; x.fillStyle = `rgba(${v},${v},${v},0.3)`; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 20, 1 + rnd() * 6); }
  }, false);
  return TEX.rough;
}
export function glowTex() {
  if (TEX.glow) return TEX.glow;
  TEX.glow = canvasTex(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  });
  return TEX.glow;
}
function windowTex() {
  if (TEX.win) return TEX.win;
  const rnd = mulberry32(99);
  TEX.win = canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    for (let row = 0; row < 6; row++) for (let i = 0; i < 64; i++) {
      if (rnd() < 0.45) continue;
      const c = rnd() < 0.8 ? `rgba(255,${200 + rnd() * 50 | 0},${140 + rnd() * 60 | 0},${0.5 + rnd() * 0.5})` : 'rgba(140,220,255,0.9)';
      x.fillStyle = c; x.fillRect(i * 8 + 1, 10 + row * 19, 5, 8);
    }
  });
  return TEX.win;
}
function solarTex() {
  if (TEX.solar) return TEX.solar;
  TEX.solar = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#0b1a3a'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#7a8aa8'; x.lineWidth = 1.5;
    for (let i = 0; i <= w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    x.fillStyle = 'rgba(80,120,220,0.25)';
    for (let i = 0; i < w; i += 32) for (let j = 0; j < h; j += 32) if ((i + j) % 64 === 0) x.fillRect(i + 2, j + 2, 28, 28);
  });
  return TEX.solar;
}
function rockTex() {
  if (TEX.rock) return TEX.rock;
  const rnd = mulberry32(5);
  TEX.rock = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#7a756f'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 70 + rnd() * 120 | 0;
      x.fillStyle = `rgba(${v},${v - 4},${v - 8},${0.15 + rnd() * 0.3})`;
      const s = 1 + Math.pow(rnd(), 3) * 30;
      x.beginPath(); x.arc(rnd() * w, rnd() * h, s, 0, 7); x.fill();
    }
    for (let i = 0; i < 60; i++) { // 크레이터
      const cx = rnd() * w, cy = rnd() * h, r = 4 + rnd() * 26;
      x.strokeStyle = 'rgba(40,38,35,0.5)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, r, 0.3, 3.6); x.stroke();
      x.strokeStyle = 'rgba(200,195,185,0.3)'; x.beginPath(); x.arc(cx, cy, r, 3.6, 6.6); x.stroke();
    }
  });
  return TEX.rock;
}

// ------------------------------------------------------------
//  재질 캐시
// ------------------------------------------------------------
const MATS = new Map();
function mat(key) {
  if (MATS.has(key)) return MATS.get(key);
  let m;
  const [kind, color] = key.split('|');
  if (kind === 'paint') m = new THREE.MeshPhysicalMaterial({ color, map: panelTex(), roughnessMap: roughTex(), metalness: 0.35, roughness: 0.62, clearcoat: 0.45, clearcoatRoughness: 0.32 });
  else if (kind === 'dark') m = new THREE.MeshStandardMaterial({ color: color || '#33373e', map: panelTex(), metalness: 0.75, roughness: 0.5 });
  else if (kind === 'metal') m = new THREE.MeshStandardMaterial({ color: color || '#9aa1aa', metalness: 0.95, roughness: 0.28 });
  else if (kind === 'glass') m = new THREE.MeshPhysicalMaterial({ color: '#0a1620', metalness: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, emissive: '#0b2a38', emissiveIntensity: 0.6, envMapIntensity: 2.2 });
  else if (kind === 'glow') m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6), toneMapped: true });
  else if (kind === 'lit') m = new THREE.MeshStandardMaterial({ color: '#1a1a1a', emissive: color, emissiveIntensity: 2.2, roughness: 0.6 });
  else if (kind === 'solar') m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: solarTex(), metalness: 0.6, roughness: 0.25 });
  else if (kind === 'rock') m = new THREE.MeshStandardMaterial({ color: '#8a827a', map: rockTex(), roughness: 0.95, metalness: 0.05 });
  else if (kind === 'burnt') m = new THREE.MeshStandardMaterial({ color: '#2a2622', map: panelTex(), metalness: 0.4, roughness: 0.9 });
  MATS.set(key, m);
  return m;
}

// ------------------------------------------------------------
//  지오메트리 도우미
// ------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function prep(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e);
  _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  g.applyMatrix4(_m);
  return g;
}
function mirrorX(g) {
  g = g.clone();
  g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  // 감기 순서 뒤집기 (비인덱스)
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name]; if (!a) continue;
    const n = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t; }
  }
  return g;
}
function boxUV(g, scale) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u * scale, v * scale);
  }
  uv.needsUpdate = true;
}
// 회전체 (노즈→꼬리, z축 방향). prof: [[반지름, z], ...]
function lathe(prof, seg = 24, sx = 1, sy = 1, phi = 0) {
  const pts = prof.map(([r, z]) => new THREE.Vector2(Math.max(0.0001, r), z)).reverse();
  const g = new THREE.LatheGeometry(pts, seg, phi);
  g.rotateX(Math.PI / 2);
  g.scale(sx, sy, 1);
  return g;
}
// 날개 판 (xz 평면 윤곽, 두께 y)
function plate(pts, thick, bevel = 0.3) {
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const b = thick * bevel;
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(thick - b * 2) / 2, 0);
  return g;
}
const rbox = (w, h, d, r = 0.15) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
const cyl = (r1, r2, len, seg = 20, open = false) => { const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open); g.rotateX(Math.PI / 2); return g; };
const sph = (r, ws = 24, hs = 16) => new THREE.SphereGeometry(r, ws, hs);

// ------------------------------------------------------------
//  함선 빌더
// ------------------------------------------------------------
class Builder {
  constructor(paint, accent) {
    this.paint = paint; this.accent = accent;
    this.parts = new Map();
    this.engines = []; this.guns = []; this.lights = []; this.cockpit = new THREE.Vector3(0, 1, 2); this.radius = 10;
  }
  key(k) {
    if (k === 'p') return 'paint|' + this.paint;
    if (k === 'a') return 'paint|' + this.accent;
    if (k === 'd') return 'dark|';
    if (k === 'm') return 'metal|';
    if (k === 'g') return 'glass|';
    return k;
  }
  add(k, g, p, r, s, mirror = false) {
    g = prep(xf(g.index ? g.clone() : g, p, r, s));
    const key = this.key(k);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    if (mirror) this.parts.get(key).push(mirrorX(g));
    return this;
  }
  m(k, g, p, r, s) { return this.add(k, g, p, r, s, true); }
  engine(x, y, z, r, len = r * 2.4, color = '#6fd6ff', mirror = false) {
    const xs = mirror ? [x, -x] : [x];
    for (const xx of xs) {
      this.add('d', cyl(r * 1.15, r * 1.05, len, 24), [xx, y, z + len / 2]);
      this.add('m', new THREE.TorusGeometry(r * 1.02, r * 0.14, 10, 28), [xx, y, z]);
      this.add('d', cyl(r * 0.92, r * 0.6, r * 0.9, 20, true), [xx, y, z + r * 0.35]);
      this.add('glow|' + color, new THREE.CircleGeometry(r * 0.78, 24), [xx, y, z + r * 0.55], [0, Math.PI, 0]);
      this.engines.push({ pos: new THREE.Vector3(xx, y, z), r, color });
    }
    return this;
  }
  gun(x, y, z, len = 1.6, r = 0.1, mirror = true) {
    const xs = mirror ? [x, -x] : [x];
    for (const xx of xs) {
      this.add('d', rbox(r * 5, r * 4, len * 0.5, r), [xx, y, z]);
      this.add('m', cyl(r, r, len, 10), [xx, y, z + len * 0.5]);
      this.add('d', cyl(r * 1.5, r * 1.5, len * 0.12, 10), [xx, y, z + len * 0.95]);
      this.guns.push(new THREE.Vector3(xx, y, z + len));
    }
    return this;
  }
  turret(x, y, z, s = 1, barrels = 2, mirror = false) {
    const xs = mirror ? [x, -x] : [x];
    for (const xx of xs) {
      this.add('d', cyl(1.3 * s, 1.5 * s, 0.6 * s, 20), [xx, y, z], [-Math.PI / 2, 0, 0]);
      this.add('a', sph(1.1 * s, 20, 10, 0), [xx, y + 0.3 * s, z], [0, 0, 0], [1, 0.55, 1.15]);
      for (let b = 0; b < barrels; b++) {
        const bx = xx + (barrels === 1 ? 0 : (b - (barrels - 1) / 2) * 0.55 * s);
        this.add('m', cyl(0.13 * s, 0.13 * s, 3.4 * s, 10), [bx, y + 0.45 * s, z + 2.2 * s]);
        this.add('d', cyl(0.2 * s, 0.2 * s, 0.5 * s, 10), [bx, y + 0.45 * s, z + 3.7 * s]);
        this.guns.push(new THREE.Vector3(bx, y + 0.45 * s, z + 3.9 * s));
      }
    }
    return this;
  }
  light(x, y, z, color, blink = 0, size = 1) { this.lights.push({ pos: new THREE.Vector3(x, y, z), color, blink, size }); return this; }

  build(uvScale = 0.25) {
    const group = new THREE.Group();
    let maxR = 0;
    for (const [key, list] of this.parts) {
      const g = mergeGeometries(list, false);
      boxUV(g, uvScale);
      g.computeBoundingSphere();
      maxR = Math.max(maxR, g.boundingSphere.center.length() + g.boundingSphere.radius);
      const mesh = new THREE.Mesh(g, mat(key));
      const glow = key.startsWith('glow') || key.startsWith('lit');
      mesh.castShadow = !glow; mesh.receiveShadow = !glow;
      group.add(mesh);
    }
    group.userData = { engines: this.engines, guns: this.guns, lights: this.lights, cockpit: this.cockpit, radius: maxR };
    return group;
  }
}

// ------------------------------------------------------------
//  함선 디자인 (전방 +Z)
// ------------------------------------------------------------
const DESIGNS = {
  sparrow(b) {
    b.add('p', lathe([[0.05, 6.8], [0.55, 6.1], [1.0, 4.9], [1.32, 3], [1.45, 0.2], [1.42, -3], [1.2, -5.2], [1.0, -6.1]], 28, 1.1, 0.78));
    b.add('g', sph(1, 24, 14), [0, 0.72, 2.7], [0, 0, 0], [0.72, 0.62, 1.9]);
    b.add('d', rbox(0.3, 0.25, 3.6, 0.1), [0, 1.08, -1.2]);
    b.add('a', rbox(0.6, 0.12, 5.5, 0.05), [0, 0.9, 1.5]).add('d', rbox(1.6, 0.5, 2.0, 0.2), [0, -1.05, -1.5]);
    b.m('p', plate([[1.0, 1.4], [6.0, -2.4], [6.4, -3.6], [5.8, -3.9], [1.0, -4.3]], 0.38), [0, -0.25, 0]);
    b.m('a', plate([[4.6, -1.7], [6.0, -2.4], [6.4, -3.6], [5.8, -3.9], [4.6, -3.6]], 0.42), [0, -0.25, 0]);
    b.m('a', rbox(0.34, 0.5, 2.6, 0.12), [6.15, -0.25, -2.9]);
    b.m('p', plate([[0, 0], [1.8, -1.9], [1.8, -2.8], [0, -2.4]], 0.22), [0.75, 0.55, -2.6], [0, 0, 1.15]);
    b.m('d', rbox(0.7, 0.55, 1.8, 0.2), [1.38, -0.2, 0.9]);
    b.m('d', rbox(1.4, 0.18, 0.6, 0.06), [2.2, -0.1, -0.2]);
    b.engine(0.95, -0.12, -6.3, 0.5, 2.4, '#7fd4ff', true);
    b.gun(2.7, -0.5, -0.2, 1.7, 0.09);
    b.light(6.35, -0.25, -3.3, '#ff3040').light(-6.35, -0.25, -3.3, '#30ff60').light(0, 1.25, -5.4, '#ffffff', 1.1);
    b.cockpit.set(0, 1.1, 2.9);
  },
  kestrel(b) {
    b.add('p', lathe([[0.03, 7.3], [0.38, 6.4], [0.8, 4.5], [1.05, 2], [1.1, -1], [1.28, -4], [1.32, -6], [1.15, -6.8]], 28, 1, 0.85));
    b.add('g', sph(1, 24, 14), [0, 0.62, 2.5], [0, 0, 0], [0.6, 0.52, 1.8]);
    b.add('a', rbox(0.25, 0.1, 8, 0.04), [0, 1.0, -1.5]);
    b.m('p', plate([[0.9, -3.6], [5.6, -1.2], [5.8, -0.3], [5.2, -0.2], [0.9, -1.0]], 0.26), [0, 0, 0], [0, 0, -0.07]);
    b.m('a', plate([[4.2, -1.6], [5.6, -1.2], [5.8, -0.3], [5.2, -0.2], [4.2, -0.6]], 0.3), [0, 0, 0], [0, 0, -0.07]);
    b.m('p', plate([[0.7, 3.3], [2.3, 2.4], [2.3, 1.95], [0.7, 2.2]], 0.15), [0, 0.1, 0]);
    b.add('a', plate([[0, 0], [0, -2.4], [2.3, -3.4], [2.5, -2.7]], 0.2), [0, 0.85, -3.2], [0, 0, Math.PI / 2]);
    b.m('d', rbox(0.55, 0.45, 2.6, 0.18), [1.05, -0.2, -2.4]);
    b.engine(0, 0, -6.5, 0.95, 2.2, '#9fe8ff');
    b.engine(1.55, -0.1, -4.6, 0.36, 1.8, '#9fe8ff', true);
    b.gun(5.45, -0.05, -0.8, 1.6, 0.08);
    b.gun(0.75, -0.6, 3.0, 1.4, 0.07, false);
    b.light(5.85, 0, -0.6, '#ff3040').light(-5.85, 0, -0.6, '#30ff60').light(0, 2.6, -5.9, '#ffffff', 0.9);
    b.cockpit.set(0, 0.95, 2.7);
  },
  prospector(b) {
    b.add('p', rbox(5.2, 3.6, 12, 0.7), [0, 0, -1]);
    b.add('a', rbox(3.4, 2.4, 4.4, 0.6), [0, 0.8, 6.4]);
    b.add('g', rbox(2.7, 1.1, 1.5, 0.35), [0, 1.35, 8.1], [-0.35, 0, 0]);
    b.add('d', rbox(2.2, 1.6, 2.0, 0.3), [0, -0.9, 6.0]);
    b.m('d', cyl(0.32, 0.32, 5.4, 12), [1.6, -1.3, 7.3]);
    b.m('m', cyl(0.75, 0.45, 1.2, 16), [1.6, -1.3, 10.2]);
    b.m('glow|#ff5a2a', new THREE.CircleGeometry(0.35, 16), [1.6, -1.3, 10.82]);
    b.m('a', rbox(1.7, 2.8, 8.4, 0.35), [3.5, -0.2, -2]);
    b.m('d', rbox(1.8, 0.25, 8.6, 0.1), [3.5, 1.25, -2]);
    b.m('d', rbox(0.12, 1.3, 4.2, 0.05), [1.2, 2.45, -3]);
    b.m('d', rbox(0.12, 1.1, 3.6, 0.05), [0.6, 2.35, -3.2]);
    b.m('d', rbox(0.5, 1.6, 0.5, 0.1), [2.0, -2.4, 2.5]).m('d', rbox(0.5, 1.6, 0.5, 0.1), [2.0, -2.4, -4.5]);
    b.add('d', rbox(3.8, 3.0, 2.2, 0.4), [0, 0, -7.6]);
    b.engine(1.25, 0.85, -8.6, 0.68, 2.0, '#ffb35a', true);
    b.engine(1.25, -0.85, -8.6, 0.68, 2.0, '#ffb35a', true);
    b.gun(0, 2.2, 3.5, 1.6, 0.11, false);
    b.light(4.4, 1.3, -6, '#ff3040').light(-4.4, 1.3, -6, '#30ff60').light(0, 1.9, -7, '#ffaa22', 0.7).light(0, -2.0, 6.5, '#ffffff', 0, 1.4);
    b.cockpit.set(0, 1.5, 7.6);
  },
  atlas(b) {
    b.add('p', lathe([[0.05, 17.2], [1.4, 16.6], [2.4, 15.2], [2.9, 13], [2.9, 10.5], [2.4, 9.8]], 28, 1.15, 0.92));
    b.add('g', rbox(3.6, 1.1, 1.8, 0.4), [0, 1.35, 15.0], [-0.35, 0, 0]);
    b.add('d', rbox(2.2, 2.2, 3.4, 0.4), [0, 0, 8.6]);
    b.add('m', rbox(1.5, 1.5, 24, 0.2), [0, 0, -2.6]);
    const cc = ['#b33a2e', '#2e6eb3', '#d98c1a', '#3a8a4a', b.accent];
    for (let i = 0; i < 5; i++) {
      const z = 6.5 - i * 4.7;
      for (const [x, y] of [[1.95, 1.3], [1.95, -1.3]]) {
        const col = cc[(i * 3 + (y > 0 ? 1 : 0)) % cc.length];
        b.m('paint|' + col, rbox(2.5, 2.5, 4.3, 0.12), [x, y, z]);
      }
      b.add('d', rbox(6.6, 0.25, 0.4, 0.05), [0, 2.65, z + 2.3]);
    }
    b.add('p', rbox(7.4, 5.4, 5.6, 0.9), [0, 0, -15.6]);
    b.m('a', rbox(0.4, 5.6, 5.0, 0.15), [3.75, 0, -15.6]);
    b.engine(2.3, 1.0, -18.4, 1.35, 2.4, '#7fd4ff', true);
    b.engine(0, -1.3, -18.4, 1.45, 2.4, '#7fd4ff');
    b.m('d', rbox(0.18, 3.4, 1.2, 0.05), [1.2, 3.8, -15]);
    b.add('m', cyl(0.06, 0.06, 6, 6), [0.6, 4.4, -12]);
    b.light(4.1, 2.6, -13, '#ff3040').light(-4.1, 2.6, -13, '#30ff60').light(1.2, 5.6, -15, '#ffffff', 1.2).light(0, -2.2, 14, '#ffffff', 0, 1.6);
    b.gun(2.9, -0.4, 10.2, 1.4, 0.09);
    b.cockpit.set(0, 1.7, 15.4);
  },
  mantis(b) {
    b.add('p', lathe([[0.05, 8], [1, 7], [2, 4.5], [2.4, 1], [2.4, -4], [2, -8], [1.6, -9]], 28, 1.6, 0.55));
    b.add('g', sph(1, 24, 14), [0, 1.05, 3.6], [0, 0, 0], [0.8, 0.6, 1.9]);
    b.add('d', rbox(1.9, 0.8, 5.2, 0.3), [0, 0.75, 2.0]);
    b.add('a', rbox(1.2, 0.18, 9, 0.06), [0, 1.18, -2.5]);
    b.m('a', rbox(0.95, 0.95, 6.4, 0.3), [3.3, -0.25, 4.3]);
    b.m('d', rbox(1.1, 0.4, 2.2, 0.1), [3.3, -0.8, 2.0]);
    b.m('p', plate([[2.5, -1], [8.2, -5], [8.4, -6.6], [2.5, -7.2]], 0.42), [0, -0.3, 0], [0, 0, 0.16]);
    b.m('a', plate([[6.8, -4], [8.2, -5], [8.4, -6.6], [6.8, -6.8]], 0.46), [0, -0.3, 0], [0, 0, 0.16]);
    b.m('p', plate([[0, 0], [2.2, -2.1], [2.2, -3.0], [0, -2.6]], 0.24), [1.9, 0.6, -5.8], [0, 0, 1.3]);
    b.engine(1.45, 0, -8.9, 1.0, 2.6, '#c6ff5a', true);
    b.gun(3.3, -0.25, 7.2, 1.5, 0.13);
    b.gun(6.2, -0.85, -4.2, 1.8, 0.1);
    b.m('d', rbox(0.6, 0.5, 2.8, 0.15), [6.2, -0.85, -4.5]);
    b.light(8.4, -1.4, -6, '#ff3040').light(-8.4, -1.4, -6, '#30ff60').light(0, 1.4, -8.4, '#ffffff', 1);
    b.cockpit.set(0, 1.45, 3.9);
  },
  nomad(b) {
    b.add('p', lathe([[0.05, 10], [0.65, 9], [1.4, 6.5], [1.8, 3], [1.8, -3], [1.5, -7], [1.2, -9.2]], 28, 1, 0.9));
    b.add('g', sph(1, 24, 14), [0, 0.85, 5.3], [0, 0, 0], [0.8, 0.55, 2.3]);
    b.add('a', new THREE.TorusGeometry(3.7, 0.36, 14, 56), [0, 0, -4.8]);
    b.add('glow|#a98bff', new THREE.TorusGeometry(3.7, 0.1, 8, 56), [0, 0, -4.45]);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; b.add('d', rbox(0.3, 2.2, 0.8, 0.08), [Math.cos(a) * 2.6, Math.sin(a) * 2.6, -4.8], [0, 0, a + Math.PI / 2]); }
    b.m('p', plate([[1.4, 1.5], [3.6, -1.4], [3.7, -2.6], [1.4, -2.2]], 0.22), [0, -0.3, 0]);
    b.add('m', lathe([[0.05, 0.25], [0.9, 0.0], [1.2, -0.25]], 20), [0, 2.4, -0.8], [-Math.PI / 2, 0, 0]);
    b.add('d', cyl(0.12, 0.12, 1.3, 8), [0, 1.7, -0.8], [Math.PI / 2, 0, 0]);
    b.add('m', cyl(0.04, 0.04, 5, 6), [0.5, 1.2, -6], [0.3, 0, 0]);
    b.engine(0.85, 0, -9.7, 0.78, 2.2, '#b49bff', true);
    b.gun(1.5, -0.6, 3.0, 1.2, 0.08);
    b.light(3.75, -0.3, -2.2, '#ff3040').light(-3.75, -0.3, -2.2, '#30ff60').light(0, 3.8, -4.8, '#ffffff', 1.3);
    b.cockpit.set(0, 1.25, 5.5);
  },
  vanguard(b) {
    b.add('p', lathe([[0.1, 15], [2.6, 10], [3.6, 5]], 4, 1.4, 0.72, Math.PI / 4));
    b.add('p', rbox(7.2, 3.6, 20, 0.6), [0, 0, -4]);
    b.m('a', rbox(1.3, 4.0, 17, 0.3), [4.3, 0, -3.5], [0, 0, 0.22]);
    b.add('p', rbox(3.2, 1.8, 4.6, 0.5), [0, 2.4, -1]);
    b.add('g', rbox(2.9, 0.6, 1.2, 0.2), [0, 2.75, 1.25], [-0.3, 0, 0]);
    b.add('d', rbox(5.4, 0.3, 14, 0.1), [0, 1.9, -6]);
    b.m('d', rbox(0.25, 2.2, 6, 0.08), [2.6, 1.4, -10]);
    b.turret(0, 2.05, 5.2, 1.25, 2);
    b.turret(3.0, 2.05, -7.5, 0.85, 1, true);
    b.add('d', rbox(6, 4.2, 3, 0.5), [0, 0, -14.5]);
    b.engine(1.7, 1.15, -16, 1.25, 2.4, '#ff8a5a', true);
    b.engine(1.7, -1.15, -16, 1.25, 2.4, '#ff8a5a', true);
    b.light(5.2, 0, -10, '#ff3040').light(-5.2, 0, -10, '#30ff60').light(0, 3.4, -12, '#ffffff', 1).light(0, -1.9, 12, '#ffffff', 0, 1.5);
    b.cockpit.set(0, 3.0, 1.0);
  },
  leviathan(b) {
    b.add('p', lathe([[0.2, 29], [3, 24], [6, 16], [7, 4], [7, -14], [6.2, -24], [5.4, -27.5]], 6, 1.25, 0.75, Math.PI / 6));
    b.add('d', rbox(8.5, 3.2, 28, 0.5), [0, 4.4, -4]);
    b.add('p', rbox(5, 6, 7, 0.6), [0, 8.2, -13]);
    b.add('g', rbox(4.6, 0.9, 1.2, 0.2), [0, 10.2, -9.4], [-0.25, 0, 0]);
    b.add('lit|#ffd59a', rbox(8.65, 0.5, 22, 0.1), [0, 4.0, -4]);
    b.m('lit|#7fd4ff', rbox(0.1, 1.6, 7, 0.05), [8.8, 0, 4]);
    b.m('a', rbox(1.8, 6, 30, 0.5), [8.1, 0, -6], [0, 0, 0.12]);
    b.m('d', rbox(0.3, 4, 3, 0.1), [6, 11, -14]);
    b.add('m', cyl(0.08, 0.08, 10, 6), [1, 14, -15], [Math.PI / 2, 0, 0]);
    b.add('m', lathe([[0.05, 0.5], [2.2, 0], [2.8, -0.4]], 24), [-2, 12.5, -16], [-Math.PI / 2.4, 0, 0]);
    b.turret(0, 6.0, 9, 1.8, 3);
    b.turret(0, 9.2, -4, 1.4, 2);
    b.turret(4.8, 6.0, -18, 1.2, 2, true);
    b.turret(5.5, -4.2, 6, 1.1, 2, true);
    b.add('d', rbox(14, 9, 4, 1), [0, 0, -27]);
    b.engine(2.6, 1.8, -29, 1.7, 2.6, '#ffd36a', true);
    b.engine(2.6, -1.8, -29, 1.7, 2.6, '#ffd36a', true);
    b.engine(6.0, 0, -29, 1.5, 2.6, '#ffd36a', true);
    for (let i = 0; i < 6; i++) b.light(8.9, -2.5, 14 - i * 7, '#ffcc66', 0, 0.8).light(-8.9, -2.5, 14 - i * 7, '#ffcc66', 0, 0.8);
    b.light(9.5, 0, -18, '#ff3040').light(-9.5, 0, -18, '#30ff60').light(1, 19, -15, '#ff3040', 1.2, 1.5);
    b.cockpit.set(0, 10.6, -9.2);
  },
};

const shipCache = new Map();
export function buildShip(type, paint) {
  const key = type + '|' + paint.join(',');
  if (!shipCache.has(key)) {
    const b = new Builder(paint[0], paint[1]);
    DESIGNS[type](b);
    const uv = { sparrow: 0.22, kestrel: 0.22, prospector: 0.15, atlas: 0.1, mantis: 0.17, nomad: 0.17, vanguard: 0.09, leviathan: 0.055 }[type] || 0.2;
    shipCache.set(key, b.build(uv));
  }
  const proto = shipCache.get(key);
  const g = proto.clone();
  g.userData = proto.userData;
  return g;
}

// ------------------------------------------------------------
//  엔진 화염 (가산 셰이더)
// ------------------------------------------------------------
const plumeGeo = (() => { const g = new THREE.CylinderGeometry(1, 0.05, 1, 20, 6, true); g.translate(0, -0.5, 0); g.rotateX(Math.PI / 2); return g; })();
// plumeGeo: z 0(노즐) → -1(꼬리)
export function makePlume(color) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: 0 }, uTime: { value: 0 }, uBoost: { value: 0 } },
    vertexShader: `${LD.vpars}
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ vT = -position.z; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; ${LD.vmain} }`,
    fragmentShader: `${LD.fpars}
      uniform vec3 uColor; uniform float uPow, uTime, uBoost; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ ${LD.fmain}
        float edge = abs(dot(vN, vV)); edge = pow(edge, 1.6);
        float fall = pow(1.0 - clamp(vT, 0.0, 1.0), 1.7);
        float flick = 0.85 + 0.15 * sin(uTime * 60.0 + vT * 20.0);
        float shock = 0.6 + 0.4 * pow(abs(sin(vT * 18.0 - uTime * 4.0)), 6.0) * uBoost;
        vec3 core = mix(uColor, vec3(1.0), smoothstep(0.35, 0.0, vT) * 0.85);
        float a = edge * fall * uPow * flick * shock;
        gl_FragColor = vec4(core * a * 2.4, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(plumeGeo, m);
  mesh.frustumCulled = false;
  return mesh;
}

// 함선 인스턴스: 모델 + 화염 + 항법등
export function instantiateShip(type, paint) {
  const root = new THREE.Group();
  const model = buildShip(type, paint);
  root.add(model);
  const ud = model.userData;
  const plumes = [], glows = [], lights = [];
  for (const e of ud.engines) {
    const p = makePlume(e.color);
    p.position.copy(e.pos); p.scale.set(e.r * 0.85, e.r * 0.85, e.r * 4);
    root.add(p); plumes.push({ mesh: p, e });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: e.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(e.pos).add(new THREE.Vector3(0, 0, -e.r * 0.4)); s.scale.setScalar(e.r * 4);
    root.add(s); glows.push({ s, e });
  }
  for (const l of ud.lights) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: l.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(l.pos); s.scale.setScalar(1.6 * l.size * (ud.radius / 12) ** 0.5);
    root.add(s); lights.push({ s, l, base: s.scale.x });
  }
  root.userData = { model, plumes, glows, lights, guns: ud.guns, cockpit: ud.cockpit, radius: ud.radius, engines: ud.engines };
  return root;
}

export function animateShip(root, t, throttle, boost, cruise) {
  const u = root.userData;
  const pw = Math.max(0.08, throttle) * (boost ? 1.5 : 1) + (cruise ? 1.2 : 0);
  for (const p of u.plumes) {
    p.mesh.material.uniforms.uPow.value = Math.min(1.6, 0.25 + pw * 0.9);
    p.mesh.material.uniforms.uTime.value = t;
    p.mesh.material.uniforms.uBoost.value = boost || cruise ? 1 : 0;
    p.mesh.scale.z = p.e.r * (1.5 + pw * 4.5 + (cruise ? 6 : 0));
  }
  for (const g of u.glows) g.s.scale.setScalar(g.e.r * (2.2 + pw * 2.4));
  for (const l of u.lights) {
    if (!l.l.blink) continue;
    const on = ((t / l.l.blink) % 1) < 0.12;
    l.s.visible = on;
  }
}

// ------------------------------------------------------------
//  스테이션
// ------------------------------------------------------------
const stationCache = new Map();
export function buildStation(st) {
  const design = st.type === 'pirate' ? 2 : st.design;
  const key = design + '|' + st.type;
  const rnd = mulberry32(st.seed);
  const accent = { trade: '#3a7bd5', mining: '#f2c230', industry: '#ff8a3c', tech: '#2fd4ff', military: '#b8423a', agri: '#4caf50', pirate: '#ff3040' }[st.type] || '#3a7bd5';
  const root = new THREE.Group();
  const spinners = [];
  const b = new Builder(design === 2 ? '#5a5650' : '#c9ced6', accent);
  const ring = new Builder('#c9ced6', accent);
  let dockZ = 520, colliders = [];
  if (design === 0) {
    b.add('p', cyl(70, 70, 900, 32), [0, 0, 0]);
    b.add('a', cyl(76, 76, 40, 32), [0, 0, 200]).add('a', cyl(76, 76, 40, 32), [0, 0, -200]);
    b.add('p', cyl(130, 70, 80, 32), [0, 0, 400]);
    b.add('p', rbox(240, 140, 90, 12), [0, 0, 470]);
    b.add('d', rbox(250, 150, 20, 6), [0, 0, 425]);
    // 도킹 입구 프레임
    b.add('a', rbox(130, 14, 24, 4), [0, 36, 515]).add('a', rbox(130, 14, 24, 4), [0, -36, 515]);
    b.m('a', rbox(14, 86, 24, 4), [65, 0, 515]);
    b.add('d', rbox(118, 58, 10, 2), [0, 0, 470]);
    b.add('glow|#7fd4ff', rbox(110, 4, 4, 1), [0, 27, 470]).add('glow|#7fd4ff', rbox(110, 4, 4, 1), [0, -27, 470]);
    b.m('d', rbox(260, 4, 120, 2), [-310, 0, -330]);
    b.m('solar', rbox(250, 2, 110, 1), [-310, 0.5, -330]);
    b.m('d', rbox(80, 8, 8, 2), [-130, 0, -330]);
    b.add('m', cyl(6, 6, 300, 8), [0, 0, -600]);
    b.add('a', sph(26, 20, 12), [0, 0, -760]);
    b.add('m', lathe([[1, 30], [60, 0], [75, -14]], 24), [0, 130, -260], [-Math.PI / 2, 0, 0]);
    b.add('d', cyl(6, 6, 60, 8), [0, 90, -260], [Math.PI / 2, 0, 0]);
    ring.add('lit|#ffcf8a', new THREE.TorusGeometry(430, 30, 18, 120), [0, 0, 0]);
    ring.add('p', new THREE.TorusGeometry(430, 46, 18, 120), [0, 0, 0], [0, 0, 0], [1, 1, 1.25]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ring.add('d', rbox(18, 360, 18, 4), [Math.cos(a) * 250, Math.sin(a) * 250, 0], [0, 0, a + Math.PI / 2]);
    }
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ring.light(Math.cos(a) * 478, Math.sin(a) * 478, 0, i % 2 ? '#ffffff' : accent, 0, 10); }
    for (let z = -400; z <= 400; z += 100) colliders.push([0, 0, z, 110]);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; colliders.push([Math.cos(a) * 430, Math.sin(a) * 430, 0, 70]); }
    colliders.push([-310, 0, -330, 130], [310, 0, -330, 130]);
    dockZ = 520;
  } else if (design === 1) {
    const segs = [[100, -380, 160], [150, -200, 140], [80, -40, 120], [130, 120, 160], [90, 270, 120]];
    segs.forEach(([r, z, len], i) => {
      b.add(i % 2 ? 'a' : 'p', cyl(r, r, len, 8), [0, 0, z], [0, 0, Math.PI / 8]);
      b.add('d', cyl(r * 0.6, r * 0.6, 40, 8), [0, 0, z + len / 2 + 15], [0, 0, Math.PI / 8]);
    });
    b.add('p', rbox(320, 160, 200, 16), [0, 0, 430]);
    b.add('d', rbox(140, 70, 10, 2), [0, 0, 455]);
    b.add('a', rbox(160, 14, 30, 4), [0, 42, 525]).add('a', rbox(160, 14, 30, 4), [0, -42, 525]);
    b.m('a', rbox(14, 98, 30, 4), [80, 0, 525]);
    b.add('glow|#7fd4ff', rbox(130, 4, 4, 1), [0, 30, 470]).add('glow|#7fd4ff', rbox(130, 4, 4, 1), [0, -30, 470]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      b.add('m', rbox(20, 20, 380, 4), [c * 260, s * 260, -150], [0, 0, 0]);
      b.add('d', rbox(22, 220, 22, 4), [c * 150, s * 150, -150], [0, 0, a + Math.PI / 2]);
      for (let k = 0; k < 5; k++) b.add('paint|' + ['#b33a2e', '#2e6eb3', '#d98c1a', '#3a8a4a', '#888'][(i + k) % 5], rbox(40, 40, 60, 3), [c * 260 + s * 32, s * 260 - c * 32, -300 + k * 70]);
      b.light(c * 260, s * 260, 50, i % 2 ? '#ff3040' : '#ffffff', 1.5, 14);
    }
    ring.add('p', new THREE.TorusGeometry(240, 22, 12, 80), [0, 0, 0]);
    ring.add('lit|#ffcf8a', new THREE.TorusGeometry(240, 14, 12, 80), [0, 0, 0], [0, 0, 0], [1.02, 1.02, 1.6]);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; ring.add('d', rbox(14, 200, 14, 3), [Math.cos(a) * 140, Math.sin(a) * 140, 0], [0, 0, a + Math.PI / 2]); }
    for (let z = -450; z <= 350; z += 100) colliders.push([0, 0, z, 160]);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; colliders.push([Math.cos(a) * 260, Math.sin(a) * 260, -150, 120], [Math.cos(a) * 260, Math.sin(a) * 260, -300, 100]); }
    colliders.push([0, 0, 420, 150]);
    dockZ = 535;
  } else {
    // 해적 은신처: 소행성에 박힌 구조물
    const rock = rockGeometry(st.seed % 4, 7);
    b.add('rock', rock, [0, 0, -100], [rnd(), rnd(), rnd()], [320, 260, 300]);
    b.add('d', rbox(220, 120, 160, 10), [0, 0, 330]);
    b.add('p', rbox(240, 30, 200, 6), [0, 70, 300]);
    b.add('a', rbox(130, 12, 20, 3), [0, 34, 415]).add('a', rbox(130, 12, 20, 3), [0, -34, 415]);
    b.m('a', rbox(12, 80, 20, 3), [64, 0, 415]);
    b.add('glow|#ff4040', rbox(110, 3, 3, 1), [0, 24, 380]).add('glow|#ff4040', rbox(110, 3, 3, 1), [0, -24, 380]);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, e = rnd() - 0.5;
      const dir = new THREE.Vector3(Math.cos(a), e, Math.sin(a)).normalize();
      b.add('m', cyl(5, 1, 260, 6), [dir.x * 300, dir.y * 260, dir.z * 260 - 100], [Math.atan2(dir.y, 1), Math.atan2(dir.x, dir.z), 0]);
      b.light(dir.x * 420, dir.y * 360, dir.z * 360 - 100, '#ff3040', 1 + rnd(), 14);
    }
    b.add('d', rbox(60, 60, 200, 6), [-220, 120, 50]);
    b.add('lit|#ff7a3a', rbox(62, 8, 180, 2), [-220, 120, 50]);
    for (let i = 0; i < 6; i++) colliders.push([0, 0, -250 + i * 80, 280]);
    colliders.push([0, 0, 260, 150]);
    dockZ = 425;
  }
  b.light(-70, 0, dockZ + 6, '#ff3040', 0.8, 12).light(70, 0, dockZ + 6, '#30ff60', 0.8, 12);
  const body = b.build(0.035);
  root.add(body);
  addLights(root, b.lights);
  if (ring.parts.size) {
    const rg = ring.build(0.035);
    // 고리 재질에 창문 발광 맵
    rg.children.forEach((m) => {
      if (m.material.emissive && m.material.emissiveIntensity > 1) {
        m.material = m.material.clone(); m.material.emissiveMap = windowTex(); m.material.emissiveMap = m.material.emissiveMap.clone(); m.material.emissiveMap.repeat.set(0.6, 2);
        m.geometry.attributes.uv.needsUpdate = true;
      }
    });
    addLights(rg, ring.lights);
    root.add(rg); spinners.push(rg);
  }
  root.userData = { spinners, dockZ, colliders: colliders.map(([x, y, z, r]) => ({ p: new THREE.Vector3(x, y, z), r })), radius: 900 };
  return root;
}
function addLights(root, lights) {
  for (const l of lights) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: l.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(l.pos); s.scale.setScalar(l.size * 3);
    s.userData.blink = l.blink;
    root.add(s);
  }
}
export function animateLights(root, t) {
  root.traverse((o) => { if (o.isSprite && o.userData.blink) o.visible = ((t / o.userData.blink) % 1) < 0.15; });
}

// ------------------------------------------------------------
//  행성
// ------------------------------------------------------------
const planetVert = `${LD.vpars}
  varying vec3 vObj; varying vec3 vWN; varying vec3 vView;
  void main(){
    vObj = position;
    vWN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
    ${LD.vmain}
  }`;
const planetFrag = `${LD.fpars}
  uniform vec3 uSun, uC0, uC1, uC2, uL0, uL1, uAtmo; uniform float uSeed, uTime, uKind, uLand, uCity, uR, uSea; uniform int uOct;
  varying vec3 vObj; varying vec3 vWN; varying vec3 vView;
  ${NOISE}
  void main(){
    ${LD.fmain}
    vec3 n = normalize(vObj);
    vec3 p = n * 2.2 + vec3(uSeed);
    float lat = n.y;
    vec3 col; float spec = 0.0; vec3 emis = vec3(0.0);
    if (uKind > 0.5) { // 가스 거성
      float warp = fbm(p * vec3(1.5, 5.0, 1.5), uOct - 2);
      float bands = sin(lat * 14.0 + warp * 2.6 + uSeed);
      float fine = fbm(vec3(lat * 40.0, p.x * 0.4, p.z * 0.4) + warp, 4);
      col = mix(uC0, uC1, smoothstep(-0.8, 0.6, bands));
      col = mix(col, uC2, smoothstep(0.2, 0.9, fine + bands * 0.3) * 0.7);
      float storm = smoothstep(0.82, 0.92, 1.0 - length((n - normalize(vec3(0.6, -0.25, 0.75))) * vec3(1.0, 2.5, 1.0)));
      col = mix(col, uC0 * 0.6 + vec3(0.25, 0.08, 0.04), storm * 0.8);
    } else {
      float h = fbm(p, uOct) * 0.5 + 0.5;
      float ridge = 1.0 - abs(fbm(p * 2.5 + 7.0, uOct - 2));
      h += (ridge - 0.5) * 0.12;
      if (uLand > 0.5) {
        float sea = uSea;
        if (h < sea) { col = mix(uC0 * 0.6, uC1, smoothstep(sea - 0.25, sea, h)); spec = 1.0; }
        else { float t = smoothstep(sea, sea + 0.35, h); col = mix(uL0, uL1, t); col = mix(col, vec3(0.92), smoothstep(0.7, 0.8, h)); }
        float ice = smoothstep(0.72, 0.82, abs(lat) + (h - 0.5) * 0.25);
        col = mix(col, vec3(0.93, 0.96, 1.0), ice); spec *= 1.0 - ice;
        if (h > sea) emis = vec3(1.0, 0.75, 0.4) * smoothstep(0.62, 0.78, fbm(p * 14.0, 3) * 0.5 + 0.5) * uCity * (1.0 - ice);
      } else {
        col = mix(uC0, uC1, smoothstep(0.25, 0.55, h));
        col = mix(col, uC2, smoothstep(0.55, 0.85, h));
        if (uKind < -0.5) { // 용암
          float cr = smoothstep(0.08, 0.0, abs(fbm(p * 3.0, 5)));
          emis = vec3(1.0, 0.35, 0.05) * cr * 2.5 + vec3(1.0, 0.25, 0.0) * smoothstep(0.35, 0.2, h) * 1.2;
        }
        float craters = smoothstep(0.6, 0.75, fbm(p * 6.0 + 3.0, 3) * 0.5 + 0.5);
        col *= 1.0 - craters * 0.25;
      }
    }
    // 구름
    float cl = 0.0;
    if (uKind > -0.5 && uKind < 0.5 && uAtmo.r + uAtmo.g + uAtmo.b > 0.1) {
      vec3 q = n * 3.0 + vec3(uTime * 0.01, 0.0, uSeed);
      cl = smoothstep(0.05, 0.55, fbm(q + fbm(q * 1.3, 2), uOct - 1)) * 0.85;
    }
    vec3 L = normalize(uSun);
    vec3 N = normalize(vWN);
    float ndl = dot(N, L);
    float diff = smoothstep(-0.08, 0.6, ndl);
    vec3 base = mix(col, vec3(1.0), cl);
    vec3 H = normalize(L + vView);
    float sp = pow(max(dot(N, H), 0.0), 60.0) * spec * (1.0 - cl) * 0.8;
    vec3 c = base * (diff * 1.25 + 0.012) + vec3(1.0, 0.95, 0.85) * sp * step(0.0, ndl);
    c += emis * smoothstep(0.15, -0.2, ndl) * (1.0 - cl);
    if (uKind < -0.5) c += emis * 0.5;
    float fres = pow(1.0 - max(dot(N, vView), 0.0), 3.0);
    c += uAtmo * fres * smoothstep(-0.3, 0.4, ndl) * 0.9;
    gl_FragColor = vec4(c, 1.0);
  }`;
const atmoFrag = `${LD.fpars}
  uniform vec3 uSun, uAtmo; uniform float uDen;
  varying vec3 vObj; varying vec3 vWN; varying vec3 vView;
  void main(){
    ${LD.fmain}
    vec3 N = normalize(vWN);
    float f = 1.0 - max(dot(N, vView), 0.0);
    float rim = pow(f, 2.2) * smoothstep(1.0, 0.82, f);
    float lit = smoothstep(-0.35, 0.5, dot(N, normalize(uSun)));
    float a = rim * lit * uDen;
    gl_FragColor = vec4(uAtmo * a * 1.6, a);
  }`;

export function buildPlanet(pl) {
  const g = new THREE.Group();
  const kind = pl.gas ? 1 : pl.kind === 'lava' ? -1 : 0;
  const uSun = { value: new THREE.Vector3().copy(pl.pos).negate().normalize() };
  const C = (c) => new THREE.Color(c);
  const surf = new THREE.ShaderMaterial({
    uniforms: {
      uSun, uC0: { value: C(pl.colors[0]) }, uC1: { value: C(pl.colors[1]) }, uC2: { value: C(pl.colors[2]) },
      uL0: { value: C(pl.land ? pl.land[0] : '#000') }, uL1: { value: C(pl.land ? pl.land[1] : '#000') },
      uAtmo: { value: C(pl.atmo || '#000') }, uSeed: { value: (pl.seed % 100) / 7 }, uTime: { value: 0 },
      uKind: { value: kind }, uLand: { value: pl.land ? 1 : 0 }, uCity: { value: pl.city ? 1 : 0 }, uR: { value: pl.radius },
      uSea: { value: pl.kind === 'ocean' ? 0.62 : 0.5 }, uOct: { value: E.quality === 'low' ? 4 : E.quality === 'mid' ? 5 : 7 },
    },
    vertexShader: planetVert, fragmentShader: planetFrag,
  });
  const seg = pl.radius > 8000 ? 160 : 128;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(pl.radius, seg, seg / 2), surf);
  mesh.rotation.z = pl.tilt;
  g.add(mesh);
  if (pl.atmo) {
    const am = new THREE.ShaderMaterial({
      uniforms: { uSun, uAtmo: { value: C(pl.atmo) }, uDen: { value: pl.gas ? 0.7 : 1.0 } },
      vertexShader: planetVert, fragmentShader: atmoFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    });
    const atm = new THREE.Mesh(new THREE.SphereGeometry(pl.radius * (pl.gas ? 1.03 : 1.06), 96, 48), am);
    g.add(atm);
  }
  if (pl.ring) {
    const rg = new THREE.RingGeometry(pl.ring.inner, pl.ring.outer, 160, 1);
    rg.rotateX(-Math.PI / 2);
    const rm = new THREE.ShaderMaterial({
      uniforms: { uSun, uCol: { value: C(pl.ring.color) }, uIn: { value: pl.ring.inner }, uOut: { value: pl.ring.outer }, uSeed: { value: pl.seed % 50 }, uPR: { value: pl.radius } },
      vertexShader: `${LD.vpars} varying vec3 vP; varying vec3 vW; void main(){ vP = position; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; ${LD.vmain} }`,
      fragmentShader: `${LD.fpars} uniform vec3 uSun, uCol; uniform float uIn, uOut, uSeed, uPR; varying vec3 vP; varying vec3 vW;
        float h(float x){ return fract(sin(x*127.1+uSeed)*43758.5453); }
        float n1(float x){ float i=floor(x); float f=fract(x); f=f*f*(3.0-2.0*f); return mix(h(i),h(i+1.0),f); }
        void main(){ ${LD.fmain}
          float r = (length(vP.xz) - uIn) / (uOut - uIn);
          float b = n1(r*60.0)*0.5 + n1(r*170.0)*0.3 + n1(r*13.0)*0.4;
          float a = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.9, r) * smoothstep(0.25, 0.75, b);
          // 행성 그림자 (항성 반대편)
          vec3 L = normalize(uSun);
          vec3 c = vP; float along = dot(c, L);
          float perp = length(c - L*along);
          float shadow = (along < 0.0 && perp < uPR) ? 0.15 : 1.0;
          vec3 col = uCol * (0.25 + b*0.55) * shadow;
          gl_FragColor = vec4(col * a, a * 0.8);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(rg, rm);
    ring.rotation.z = pl.tilt * 0.6;
    g.add(ring);
  }
  g.userData = { surf, spin: pl.spin, mesh };
  return g;
}

// ------------------------------------------------------------
//  항성
// ------------------------------------------------------------
export function buildStar(star) {
  const g = new THREE.Group();
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(star.color) }, uTime: { value: 0 } },
    vertexShader: `${LD.vpars} varying vec3 vO; varying vec3 vN; varying vec3 vV; void main(){ vO = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; ${LD.vmain} }`,
    fragmentShader: `${LD.fpars} uniform vec3 uCol; uniform float uTime; varying vec3 vO; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main(){ ${LD.fmain}
        vec3 n = normalize(vO);
        float g = fbm(n * 6.0 + vec3(uTime * 0.02), 5);
        float s = fbm(n * 22.0 - vec3(uTime * 0.05), 3);
        float limb = pow(max(dot(normalize(vN), vV), 0.0), 0.45);
        vec3 c = mix(uCol * 1.6, vec3(3.2, 3.0, 2.8), 0.35 + 0.25 * g + 0.1 * s) * (0.55 + 0.6 * limb);
        gl_FragColor = vec4(c * 2.2, 1.0);
      }`,
  });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(star.radius, 96, 48), m));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: star.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
  glow.scale.setScalar(star.radius * 9);
  g.add(glow);
  const glow2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: star.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
  glow2.scale.setScalar(star.radius * 30);
  g.add(glow2);
  g.userData = { mat: m };
  return g;
}

// ------------------------------------------------------------
//  소행성
// ------------------------------------------------------------
const rockCache = [];
export function rockGeometry(v, detail = 4) {
  const key = v + ':' + detail;
  if (rockCache[key]) return rockCache[key];
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const sq = [[1, 0.8, 1.1], [1.2, 0.7, 0.9], [0.9, 0.9, 1.3], [1.1, 0.6, 1]][v % 4];
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(p, i).normalize();
    const s = v * 13.7;
    let d = 1 + (fbm3(n.x * 1.6 + s, n.y * 1.6, n.z * 1.6, 4) - 0.5) * 0.85;
    d += (fbm3(n.x * 5 + s, n.y * 5 + 3, n.z * 5, 3) - 0.5) * 0.22;
    // 크레이터
    const c = fbm3(n.x * 3 + 9 + s, n.y * 3, n.z * 3, 2);
    if (c > 0.62) d -= (c - 0.62) * 0.9;
    p.setXYZ(i, n.x * d * sq[0], n.y * d * sq[1], n.z * d * sq[2]);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  boxUV(g, 0.9);
  rockCache[key] = g;
  return g;
}
export function rockMaterial() {
  if (!MATS.has('rockI')) MATS.set('rockI', new THREE.MeshStandardMaterial({ color: '#ffffff', map: rockTex(), roughness: 0.92, metalness: 0.1 }));
  return MATS.get('rockI');
}

// 소행성대: 인스턴스 메시 4종
export function buildField(field, rocks) {
  const g = new THREE.Group();
  const byVar = [[], [], [], []];
  rocks.forEach((r) => byVar[r.v].push(r));
  const meshes = [];
  byVar.forEach((list, v) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(rockGeometry(v, 4), rockMaterial(), list.length);
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    list.forEach((r, i) => { r.mesh = im; r.idx = i; im.setColorAt(i, new THREE.Color(r.tint)); });
    g.add(im); meshes.push(im);
  });
  // 먼지 입자
  const N = 900, pos = new Float32Array(N * 3);
  const rnd = mulberry32(field.seed);
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * field.radius * 1.2;
    pos.set([Math.cos(a) * d, (rnd() - 0.5) * field.radius * 0.35, Math.sin(a) * d], i * 3);
  }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#9a8f86', size: 6, sizeAttenuation: true, transparent: true, opacity: 0.35, depthWrite: false }));
  g.add(dust);
  g.userData = { meshes };
  return g;
}

// ------------------------------------------------------------
//  기타: 화물 컨테이너, 신호원, 플레이어 기지
// ------------------------------------------------------------
let canGeo = null;
export function buildCanister(color = '#ffb347') {
  if (!canGeo) {
    const b = new Builder('#8a8f98', '#ffb347');
    b.add('p', cyl(0.7, 0.7, 2.2, 12), [0, 0, 0]);
    b.add('d', cyl(0.8, 0.8, 0.3, 12), [0, 0, 1.0]).add('d', cyl(0.8, 0.8, 0.3, 12), [0, 0, -1.0]);
    canGeo = b.build(0.5);
  }
  const g = canGeo.clone();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 6, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }));
  g.add(band);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(5); g.add(s);
  return g;
}

export function buildOutpost(paint, modules) {
  const root = new THREE.Group();
  const b = new Builder(paint[0], paint[1]);
  b.add('p', cyl(40, 40, 180, 6), [0, 0, 0], [0, 0, Math.PI / 6]);
  b.add('a', cyl(44, 44, 16, 6), [0, 0, 40], [0, 0, Math.PI / 6]);
  b.add('p', rbox(150, 80, 70, 8), [0, 0, 120]);
  b.add('d', rbox(80, 34, 8, 2), [0, 0, 152]);
  b.add('a', rbox(90, 8, 14, 2), [0, 22, 158]).add('a', rbox(90, 8, 14, 2), [0, -22, 158]);
  b.add('glow|#7fd4ff', rbox(76, 2, 2, 0.5), [0, 16, 150]).add('glow|#7fd4ff', rbox(76, 2, 2, 0.5), [0, -16, 150]);
  b.m('d', rbox(160, 3, 60, 1), [-140, 0, -50]);
  b.m('solar', rbox(150, 1.5, 55, 0.5), [-140, 0.4, -50]);
  b.m('m', rbox(70, 6, 6, 1), [-60, 0, -50]);
  const mods = modules || {};
  for (let i = 0; i < (mods.refinery || 0); i++) { b.add('d', cyl(26, 26, 60, 12), [70, 0, -40 - i * 70], [Math.PI / 2, 0, 0]); b.add('lit|#ff8a3c', cyl(27, 27, 6, 12), [70, 20, -40 - i * 70], [Math.PI / 2, 0, 0]); }
  for (let i = 0; i < (mods.hangar || 0); i++) b.add('a', rbox(70, 50, 60, 6), [0, -60, -20 - i * 66]);
  for (let i = 0; i < (mods.turret || 0); i++) { const a = i * Math.PI / 2; b.turret(Math.cos(a) * 48, Math.sin(a) * 48, 60, 4, 2); }
  if (mods.market) { b.add('paint|#3a8a4a', rbox(60, 60, 60, 4), [0, 70, -40]); b.add('lit|#9aff9a', rbox(62, 6, 62, 2), [0, 70, -40]); }
  b.add('m', cyl(2, 2, 120, 6), [0, 0, -150]);
  b.light(0, 0, -212, '#ff3040', 1.2, 8).light(-45, 0, 158, '#ff3040', 0.8, 6).light(45, 0, 158, '#30ff60', 0.8, 6);
  root.add(b.build(0.05));
  addLights(root, b.lights);
  root.userData = { dockZ: 160, colliders: [{ p: new THREE.Vector3(0, 0, 0), r: 90 }, { p: new THREE.Vector3(0, 0, -80), r: 60 }], spinners: [], radius: 300 };
  return root;
}

export function buildWreck(type, seed) {
  const r = rng(seed);
  const root = new THREE.Group();
  const m = buildShip(type, ['#3a3530', '#2a2420']);
  m.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicMaterial) o.material = mat('burnt|'); });
  m.rotation.set(r.range(0, 6), r.range(0, 6), r.range(0, 6));
  root.add(m);
  for (let i = 0; i < 10; i++) {
    const d = new THREE.Mesh(prep(rbox(r.range(0.5, 3), r.range(0.2, 1), r.range(0.5, 4), 0.1)), mat('burnt|'));
    d.position.set(r.range(-15, 15), r.range(-10, 10), r.range(-15, 15));
    d.rotation.set(r.range(0, 6), r.range(0, 6), r.range(0, 6));
    root.add(d);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ff9a3c', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(12); s.userData.blink = 0.7; root.add(s);
  return root;
}
