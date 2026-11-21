// 공용 유틸리티 — 난수, 노이즈, 수학, 포맷
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  const r = mulberry32(seed);
  const o = {
    f: r,
    range: (a, b) => a + r() * (b - a),
    int: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    weighted: (pairs) => { // [[item, w], ...]
      let t = 0; for (const p of pairs) t += p[1];
      let x = r() * t;
      for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; }
      return pairs[pairs.length - 1][0];
    },
    dir: (v = new THREE.Vector3()) => {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      return v.set(Math.cos(th) * s, u, Math.sin(th) * s);
    },
  };
  return o;
}
export const R = rng((Math.random() * 1e9) | 0);

// 3D 값 노이즈 (지오메트리 변형용)
function h3(x, y, z) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), xf), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), xf), yf),
    l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), xf), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), xf), yf),
    zf);
}
export function fbm3(x, y, z, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return v;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const sat = (v) => clamp(v, 0, 1);

export function fmtCr(n) { return Math.floor(n).toLocaleString('en-US') + ' Cr'; }
export function fmtDist(d) {
  if (d < 1000) return Math.round(d) + ' m';
  if (d < 100000) return (d / 1000).toFixed(1) + ' km';
  if (d < 1e7) return Math.round(d / 1000).toLocaleString('en-US') + ' km';
  return (d / 1000 / 1000).toFixed(1) + ' Mm';
}
export function fmtSpeed(v) {
  if (v < 1000) return Math.round(v) + ' m/s';
  return (v / 1000).toFixed(1) + ' km/s';
}
export function fmtTime(s) {
  if (!isFinite(s)) return '--';
  s = Math.max(0, Math.round(s));
  if (s < 60) return s + '초';
  if (s < 3600) return Math.floor(s / 60) + '분 ' + (s % 60) + '초';
  return Math.floor(s / 3600) + '시간 ' + Math.floor((s % 3600) / 60) + '분';
}
export function hexA(hex, a) {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 재사용 임시 벡터
export const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
export const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion();
export const FWD = new THREE.Vector3(0, 0, 1), UPV = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);

// 이동 표적 리드(예측 사격) 계산
export function leadPoint(shooterPos, shooterVel, targetPos, targetVel, speed, out) {
  const rx = targetPos.x - shooterPos.x, ry = targetPos.y - shooterPos.y, rz = targetPos.z - shooterPos.z;
  const vx = targetVel.x - shooterVel.x, vy = targetVel.y - shooterVel.y, vz = targetVel.z - shooterVel.z;
  const a = vx * vx + vy * vy + vz * vz - speed * speed;
  const b = 2 * (rx * vx + ry * vy + rz * vz);
  const c = rx * rx + ry * ry + rz * rz;
  let t = 0;
  if (Math.abs(a) < 1e-6) t = -c / b;
  else {
    const d = b * b - 4 * a * c;
    if (d >= 0) {
      const s = Math.sqrt(d);
      const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
      t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    }
  }
  if (!(t > 0) || t > 8) t = Math.sqrt(c) / speed;
  return out.set(targetPos.x + vx * t, targetPos.y + vy * t, targetPos.z + vz * t);
}

// 선분-구 교차 (발사체 판정). 교차 시 t(0..1) 반환, 아니면 -1
export function segSphere(p0, p1, c, r) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const fx = p0.x - c.x, fy = p0.y - c.y, fz = p0.z - c.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const cc = fx * fx + fy * fy + fz * fz - r * r;
  if (cc <= 0) return 0;
  if (a < 1e-9) return -1;
  const d = b * b - 4 * a * cc;
  if (d < 0) return -1;
  const t = (-b - Math.sqrt(d)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}
