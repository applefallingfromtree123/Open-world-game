// ============================================================
//  시각 효과 — 파티클, 폭발, 발사체, 빔, 우주 먼지, 하이퍼스페이스 터널
// ============================================================
import * as THREE from 'three';
import { E, LD } from './engine.js';
import { glowTex } from './models.js';
import { NOISE } from './glsl.js';

const MAXP = 7000;
const P = {
  pos: new Float64Array(MAXP * 3), vel: new Float32Array(MAXP * 3), life: new Float32Array(MAXP), max: new Float32Array(MAXP),
  size: new Float32Array(MAXP), grow: new Float32Array(MAXP), drag: new Float32Array(MAXP), col: new Float32Array(MAXP * 3), n: 0,
};
let pGeo, pPos, pCol, pSize, pAlpha, points;
let boltMesh, boltCount = 0;
const MAXB = 700;
const beams = [];
let dust, dustPos, dustBase;
let tunnel;
const flashes = [];
const debris = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();

export function initFx() {
  pGeo = new THREE.BufferGeometry();
  pPos = new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3).setUsage(THREE.DynamicDrawUsage);
  pCol = new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3).setUsage(THREE.DynamicDrawUsage);
  pSize = new THREE.BufferAttribute(new Float32Array(MAXP), 1).setUsage(THREE.DynamicDrawUsage);
  pAlpha = new THREE.BufferAttribute(new Float32Array(MAXP), 1).setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', pPos); pGeo.setAttribute('color', pCol); pGeo.setAttribute('size', pSize); pGeo.setAttribute('alpha', pAlpha);
  const pm = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: glowTex() }, uScale: { value: 600 } },
    vertexShader: `${LD.vpars} attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * uScale / max(0.5, -mv.z), 0.0, 400.0); ${LD.vmain} }`,
    fragmentShader: `${LD.fpars} uniform sampler2D uMap; varying vec3 vC; varying float vA;
      void main(){ ${LD.fmain} vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * t.a * vA, t.a * vA); }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  points = new THREE.Points(pGeo, pm);
  points.frustumCulled = false;
  E.scene.add(points);

  const bg = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); bg.rotateX(Math.PI / 2);
  const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  boltMesh = new THREE.InstancedMesh(bg, bm, MAXB);
  boltMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 3), 3);
  boltMesh.frustumCulled = false; boltMesh.count = 0;
  E.scene.add(boltMesh);

  // 우주 먼지 (속도감 표현)
  const N = 700;
  dustBase = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) dustBase[i] = (Math.random() - 0.5) * 400;
  dustPos = new Float32Array(N * 6);
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
  dust = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: '#9fb4d0', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  dust.frustumCulled = false;
  E.scene.add(dust);

  // 하이퍼스페이스 터널
  const tg = new THREE.CylinderGeometry(30, 30, 2000, 48, 1, true); tg.rotateX(Math.PI / 2);
  tunnel = new THREE.Mesh(tg, new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color('#5aa8ff') } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uA; uniform vec3 uCol; varying vec2 vUv; ${NOISE}
      void main(){ float a = vUv.x * 6.2831;
        float n = fbm(vec3(cos(a)*2.0, sin(a)*2.0, vUv.y * 30.0 + uTime * 6.0), 4);
        float streak = pow(max(0.0, fbm(vec3(cos(a)*9.0, sin(a)*9.0, vUv.y * 4.0 + uTime * 3.0), 2)), 2.0);
        vec3 c = mix(uCol, vec3(1.0, 0.6, 0.9), n * 0.5 + 0.5) * (0.6 + n) + vec3(1.0) * streak * 3.0;
        float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        gl_FragColor = vec4(c * fade * uA, 1.0);
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  tunnel.visible = false; tunnel.renderOrder = 100; tunnel.frustumCulled = false;
  E.camera.add(tunnel);
  tunnel.position.set(0, 0, -900);
}

// ---------- 파티클 ----------
export function emit(x, y, z, vx, vy, vz, life, size, r, g, b, drag = 0.5, grow = 0) {
  let i = P.n;
  if (i >= MAXP) {
    // 가장 오래된 것 덮어쓰기 대신 무작위 교체
    i = (Math.random() * MAXP) | 0;
  } else P.n++;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.life[i] = life; P.max[i] = life; P.size[i] = size; P.grow[i] = grow; P.drag[i] = drag;
  P.col[i * 3] = r; P.col[i * 3 + 1] = g; P.col[i * 3 + 2] = b;
}
function rdir() { const u = Math.random() * 2 - 1, t = Math.random() * 6.283, s = Math.sqrt(1 - u * u); return _v.set(Math.cos(t) * s, u, Math.sin(t) * s); }

export function explosion(pos, size = 1, vel) {
  const vx = vel ? vel.x * 0.4 : 0, vy = vel ? vel.y * 0.4 : 0, vz = vel ? vel.z * 0.4 : 0;
  const n = Math.min(260, 70 + size * 60);
  for (let i = 0; i < n; i++) {
    const d = rdir(), sp = (20 + Math.random() * 110) * Math.sqrt(size);
    const t = Math.random();
    emit(pos.x, pos.y, pos.z, vx + d.x * sp, vy + d.y * sp, vz + d.z * sp, 0.6 + Math.random() * 1.3, (4 + Math.random() * 7) * size,
      2.5, 0.9 + t * 0.9, 0.25 + t * 0.3, 1.6, 2.5 * size);
  }
  for (let i = 0; i < n * 0.6; i++) {
    const d = rdir(), sp = (120 + Math.random() * 380) * Math.sqrt(size);
    emit(pos.x, pos.y, pos.z, vx + d.x * sp, vy + d.y * sp, vz + d.z * sp, 0.4 + Math.random() * 0.9, 0.9 + Math.random() * 1.2, 3, 2.2, 1.2, 0.8, 0);
  }
  for (let i = 0; i < n * 0.35; i++) {
    const d = rdir(), sp = (8 + Math.random() * 40) * Math.sqrt(size);
    emit(pos.x, pos.y, pos.z, vx + d.x * sp, vy + d.y * sp, vz + d.z * sp, 2 + Math.random() * 2.5, (8 + Math.random() * 10) * size, 0.18, 0.13, 0.12, 0.9, 4 * size);
  }
  flash(pos, 60 * size + 40, '#ffd0a0', 0.5 + size * 0.15);
  flash(pos, 25 * size, '#ffffff', 0.2);
  shockwave(pos, size);
  for (let i = 0; i < Math.min(14, 4 + size * 3); i++) spawnDebris(pos, size, vel);
}
export function hitSpark(pos, shield, normal) {
  if (shield) {
    flash(pos, 9, '#5ad8ff', 0.18);
    for (let i = 0; i < 10; i++) { const d = rdir(); emit(pos.x, pos.y, pos.z, d.x * 40, d.y * 40, d.z * 40, 0.25, 1.5, 0.6, 1.8, 3, 2); }
  } else {
    flash(pos, 7, '#ffb050', 0.15);
    for (let i = 0; i < 14; i++) { const d = rdir(); if (normal) d.add(normal).normalize(); const s = 60 + Math.random() * 120; emit(pos.x, pos.y, pos.z, d.x * s, d.y * s, d.z * s, 0.3 + Math.random() * 0.4, 0.5 + Math.random(), 3, 1.6, 0.5, 1.2); }
  }
}
export function mineSpark(pos, color) {
  _c.set(color);
  for (let i = 0; i < 3; i++) { const d = rdir(); const s = 15 + Math.random() * 40; emit(pos.x, pos.y, pos.z, d.x * s, d.y * s, d.z * s, 0.5 + Math.random() * 0.6, 1.2 + Math.random() * 2, _c.r * 2, _c.g * 2, _c.b * 2, 1, 1); }
  if (Math.random() < 0.3) { const d = rdir(); emit(pos.x, pos.y, pos.z, d.x * 6, d.y * 6, d.z * 6, 1.5, 6, 0.15, 0.13, 0.12, 0.6, 5); }
}
export function engineTrail(pos, vel, color, size) {
  _c.set(color);
  emit(pos.x, pos.y, pos.z, vel.x * 0.2 + (Math.random() - 0.5) * 3, vel.y * 0.2 + (Math.random() - 0.5) * 3, vel.z * 0.2 + (Math.random() - 0.5) * 3, 0.35, size, _c.r * 0.8, _c.g * 0.8, _c.b * 0.8, 2, size * 1.5);
}
export function jumpFlash(pos, color = '#7ab8ff', size = 1) {
  flash(pos, 220 * size, color, 0.8);
  _c.set(color);
  for (let i = 0; i < 120; i++) { const d = rdir(); const s = 200 + Math.random() * 400; emit(pos.x, pos.y, pos.z, d.x * s, d.y * s, d.z * s, 0.6, 3, _c.r * 2, _c.g * 2, _c.b * 2, 2.5, 0); }
}

// ---------- 섬광 / 충격파 ----------
const flashPool = [];
function flash(pos, size, color, life) {
  let f = flashPool.find((x) => !x.alive);
  if (!f) {
    if (flashPool.length > 60) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    f = { s, alive: false, pos: new THREE.Vector3() };
    flashPool.push(f); E.scene.add(s);
  }
  f.alive = true; f.pos.copy(pos); f.life = life; f.max = life; f.size = size;
  f.s.material.color.set(color); f.s.visible = true;
  flashes.push(f);
}
const ringGeo = new THREE.RingGeometry(0.93, 1, 64);
const ringPool = [];
function shockwave(pos, size) {
  let r = ringPool.find((x) => !x.alive);
  if (!r) {
    if (ringPool.length > 20) return;
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.1, 1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    r = { m, alive: false, pos: new THREE.Vector3() };
    ringPool.push(r); E.scene.add(m);
  }
  r.alive = true; r.pos.copy(pos); r.life = 0.8; r.size = size; r.m.visible = true;
  r.m.lookAt(E.camera.position);
  r.m.quaternion.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0));
}

// ---------- 잔해 ----------
const debrisGeo = new THREE.TetrahedronGeometry(1, 0);
const debrisMat = new THREE.MeshStandardMaterial({ color: '#4a4540', roughness: 0.7, metalness: 0.6, emissive: '#ff5a1a', emissiveIntensity: 0.6 });
function spawnDebris(pos, size, vel) {
  let d = debris.find((x) => !x.alive);
  if (!d) {
    if (debris.length > 80) return;
    const m = new THREE.Mesh(debrisGeo, debrisMat);
    d = { m, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3() };
    debris.push(d); E.scene.add(m);
  }
  d.alive = true; d.pos.copy(pos); d.life = 3 + Math.random() * 3;
  rdir(); d.vel.copy(_v).multiplyScalar(30 + Math.random() * 90);
  if (vel) d.vel.addScaledVector(vel, 0.5);
  d.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  d.m.scale.set(Math.random() * 2 + 0.5, Math.random() * 1 + 0.3, Math.random() * 2 + 0.6).multiplyScalar(Math.sqrt(size));
  d.m.visible = true;
}

// ---------- 빔 ----------
const beamGeo = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); g.translate(0, 0.5, 0); g.rotateX(Math.PI / 2); return g; })();
export function beam(from, to, color, width, life = 0) {
  let b = beams.find((x) => !x.alive);
  if (!b) {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.frustumCulled = false;
    const core = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.frustumCulled = false;
    m.add(core);
    b = { m, core, alive: false, from: new THREE.Vector3(), to: new THREE.Vector3() };
    beams.push(b); E.scene.add(m);
  }
  b.alive = true; b.from.copy(from); b.to.copy(to); b.life = life; b.max = life || 1; b.width = width; b.frame = !life;
  b.m.material.color.set(color).multiplyScalar(2.2);
  b.m.visible = true;
  return b;
}

// ---------- 발사체 렌더 ----------
export function drawBolts(list) {
  let n = 0;
  const o = E.origin;
  for (const b of list) {
    if (n >= MAXB) break;
    _v.copy(b.vel).normalize();
    _q.setFromUnitVectors(_z, _v);
    const len = b.len;
    _s.set(b.width, b.width, len);
    const p = _v.set(b.pos.x - o.x, b.pos.y - o.y, b.pos.z - o.z);
    _m.compose(p, _q, _s);
    // 꼬리 방향으로 길이만큼 이동
    const back = new THREE.Vector3(0, 0, -len).applyQuaternion(_q);
    _m.elements[12] += back.x; _m.elements[13] += back.y; _m.elements[14] += back.z;
    boltMesh.setMatrixAt(n, _m);
    _c.set(b.color);
    boltMesh.instanceColor.setXYZ(n, _c.r, _c.g, _c.b);
    n++;
  }
  boltMesh.count = n;
  boltMesh.instanceMatrix.needsUpdate = true;
  boltMesh.instanceColor.needsUpdate = true;
}

// ---------- 터널 ----------
export function setTunnel(a, color) {
  tunnel.visible = a > 0.001;
  tunnel.material.uniforms.uA.value = a;
  if (color) tunnel.material.uniforms.uCol.value.set(color);
}

export function clearFx() {
  P.n = 0;
  for (const b of beams) { b.alive = false; b.m.visible = false; }
  for (const f of flashPool) { f.alive = false; f.s.visible = false; }
  flashes.length = 0;
  for (const r of ringPool) { r.alive = false; r.m.visible = false; }
  for (const d of debris) { d.alive = false; d.m.visible = false; }
  boltMesh.count = 0;
}

// ---------- 갱신 ----------
export function updateFx(dt, camVel, cruise, hidden) {
  const o = E.origin;
  // 파티클
  let w = 0;
  for (let i = 0; i < P.n; i++) {
    const l = P.life[i] - dt;
    if (l <= 0) continue;
    const dr = Math.exp(-P.drag[i] * dt);
    if (w !== i) {
      for (let k = 0; k < 3; k++) { P.pos[w * 3 + k] = P.pos[i * 3 + k]; P.vel[w * 3 + k] = P.vel[i * 3 + k]; P.col[w * 3 + k] = P.col[i * 3 + k]; }
      P.max[w] = P.max[i]; P.size[w] = P.size[i]; P.grow[w] = P.grow[i]; P.drag[w] = P.drag[i];
    }
    P.life[w] = l;
    P.vel[w * 3] *= dr; P.vel[w * 3 + 1] *= dr; P.vel[w * 3 + 2] *= dr;
    P.pos[w * 3] += P.vel[w * 3] * dt; P.pos[w * 3 + 1] += P.vel[w * 3 + 1] * dt; P.pos[w * 3 + 2] += P.vel[w * 3 + 2] * dt;
    P.size[w] += P.grow[w] * dt;
    w++;
  }
  P.n = w;
  const pa = pPos.array, ca = pCol.array, sa = pSize.array, aa = pAlpha.array;
  for (let i = 0; i < w; i++) {
    pa[i * 3] = P.pos[i * 3] - o.x; pa[i * 3 + 1] = P.pos[i * 3 + 1] - o.y; pa[i * 3 + 2] = P.pos[i * 3 + 2] - o.z;
    ca[i * 3] = P.col[i * 3]; ca[i * 3 + 1] = P.col[i * 3 + 1]; ca[i * 3 + 2] = P.col[i * 3 + 2];
    sa[i] = P.size[i];
    const t = P.life[i] / P.max[i];
    aa[i] = Math.min(1, t * 2.2) * (t > 0.92 ? (1 - t) * 12.5 : 1);
  }
  pGeo.setDrawRange(0, w);
  pPos.needsUpdate = true; pCol.needsUpdate = true; pSize.needsUpdate = true; pAlpha.needsUpdate = true;
  points.material.uniforms.uScale.value = E.H * E.dpr * 0.5 / Math.tan(E.camera.fov * Math.PI / 360);

  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.life -= dt;
    if (f.life <= 0) { f.alive = false; f.s.visible = false; flashes.splice(i, 1); continue; }
    const t = f.life / f.max;
    f.s.position.set(f.pos.x - o.x, f.pos.y - o.y, f.pos.z - o.z);
    f.s.scale.setScalar(f.size * (1.4 - t * 0.4));
    f.s.material.opacity = t;
  }
  for (const r of ringPool) {
    if (!r.alive) continue;
    r.life -= dt;
    if (r.life <= 0) { r.alive = false; r.m.visible = false; continue; }
    const t = 1 - r.life / 0.8;
    r.m.position.set(r.pos.x - o.x, r.pos.y - o.y, r.pos.z - o.z);
    r.m.scale.setScalar(10 + t * 160 * r.size);
    r.m.material.opacity = (1 - t) * (1 - t) * 0.45;
  }
  for (const d of debris) {
    if (!d.alive) continue;
    d.life -= dt;
    if (d.life <= 0) { d.alive = false; d.m.visible = false; continue; }
    d.pos.addScaledVector(d.vel, dt);
    d.m.position.set(d.pos.x - o.x, d.pos.y - o.y, d.pos.z - o.z);
    d.m.rotation.x += d.spin.x * dt; d.m.rotation.y += d.spin.y * dt;
    if (Math.random() < 0.3) emit(d.pos.x, d.pos.y, d.pos.z, 0, 0, 0, 0.8, 2.5, 0.6, 0.3, 0.1, 1, 3);
  }
  for (const b of beams) {
    if (!b.alive) continue;
    if (b.frame) { if (b.used) { b.alive = false; b.m.visible = false; b.used = false; continue; } b.used = true; }
    else { b.life -= dt; if (b.life <= 0) { b.alive = false; b.m.visible = false; continue; } }
    const a = b.frame ? 1 : b.life / b.max;
    b.m.position.set(b.from.x - o.x, b.from.y - o.y, b.from.z - o.z);
    _v.copy(b.to).sub(b.from);
    const len = _v.length();
    b.m.quaternion.setFromUnitVectors(_z, _v.normalize());
    const wd = b.width * (b.frame ? 0.85 + Math.random() * 0.3 : a);
    b.m.scale.set(wd, wd, len);
    b.core.scale.set(0.35, 0.35, 1);
    b.m.material.opacity = a * 0.8; b.core.material.opacity = a;
  }

  // 우주 먼지
  dust.visible = !hidden;
  if (!hidden) {
    const sp = camVel.length();
    const k = cruise ? Math.min(0.0025, 60 / Math.max(1, sp)) : 0.045;
    const box = cruise ? 1600 : 400, half = box / 2;
    const scale = cruise ? 4 : 1;
    const N = dustBase.length / 3;
    for (let i = 0; i < N; i++) {
      // 월드 고정 격자 → 카메라 주변으로 래핑
      let x = (dustBase[i * 3] * scale - o.x) % box, y = (dustBase[i * 3 + 1] * scale - o.y) % box, z = (dustBase[i * 3 + 2] * scale - o.z) % box;
      if (x < -half) x += box; else if (x > half) x -= box;
      if (y < -half) y += box; else if (y > half) y -= box;
      if (z < -half) z += box; else if (z > half) z -= box;
      dustPos[i * 6] = x; dustPos[i * 6 + 1] = y; dustPos[i * 6 + 2] = z;
      dustPos[i * 6 + 3] = x - camVel.x * k - 0.3; dustPos[i * 6 + 4] = y - camVel.y * k; dustPos[i * 6 + 5] = z - camVel.z * k;
    }
    dust.geometry.attributes.position.needsUpdate = true;
    dust.material.opacity = cruise ? 0.55 : Math.min(0.45, 0.08 + sp / 600);
    dust.material.color.set(cruise ? '#9fc8ff' : '#9fb4d0');
  }
  tunnel.material.uniforms.uTime.value += dt;
}
