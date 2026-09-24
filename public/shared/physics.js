// 공유 물리 — 서버(권위)와 클라이언트(예측)가 같은 코드를 사용한다.

export const K = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, BOOST: 16, FIRE: 32 };
export const WARP = { NONE: 0, CHARGE: 1, ACTIVE: 2, EXIT: 3 };

export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

// s: {x,y,vx,vy,a,warp}, spec: 기종 데이터, keys: 비트마스크, aim: 목표 각도
export function stepShip(s, spec, keys, aim, dt, boosting) {
  const warping = s.warp === WARP.ACTIVE;
  const turn = spec.turn * (warping ? 0.22 : 1);
  const da = clamp(angDiff(aim, s.a), -turn * dt, turn * dt);
  s.a += da;
  if (s.a > Math.PI) s.a -= Math.PI * 2; else if (s.a < -Math.PI) s.a += Math.PI * 2;

  const c = Math.cos(s.a), n = Math.sin(s.a);
  if (warping) {
    const k = Math.min(1, dt * 1.2);
    s.vx += (c * spec.warpSpeed - s.vx) * k;
    s.vy += (n * spec.warpSpeed - s.vy) * k;
  } else {
    const acc = spec.accel * (boosting ? 1.9 : 1);
    let ax = 0, ay = 0;
    if (keys & K.UP) { ax += c * acc; ay += n * acc; }
    if (keys & K.DOWN) { ax -= c * acc * 0.6; ay -= n * acc * 0.6; }
    if (keys & K.LEFT) { ax += n * acc * 0.7; ay -= c * acc * 0.7; }
    if (keys & K.RIGHT) { ax -= n * acc * 0.7; ay += c * acc * 0.7; }
    s.vx += ax * dt;
    s.vy += ay * dt;
    const moving = keys & (K.UP | K.DOWN | K.LEFT | K.RIGHT);
    // 관성 감쇠(아케이드 조작감)
    const damp = moving ? 0.35 : 1.1;
    const f = Math.exp(-damp * dt);
    s.vx *= f; s.vy *= f;
    const max = spec.maxSpeed * (boosting ? 1.65 : 1);
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > max) {
      // 워프 이탈 시 부드럽게 감속
      const target = Math.max(max, sp * Math.exp(-(s.warp === WARP.EXIT ? 2.8 : 5) * dt));
      s.vx *= target / sp; s.vy *= target / sp;
    }
  }
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

// 행성/스테이션 궤도 위치 (서버와 클라이언트가 같은 공식을 사용)
export function orbitPos(o, t, out) {
  out = out || {};
  if (!o.orbitR) { out.x = o.cx; out.y = o.cy; return out; }
  const ang = o.phase + (t / o.period) * Math.PI * 2;
  out.x = o.cx + Math.cos(ang) * o.orbitR;
  out.y = o.cy + Math.sin(ang) * o.orbitR;
  return out;
}

// 천체 위치: 부모(행성)가 있으면 부모 주위를 공전
export function bodyPos(body, bodies, t, out) {
  out = out || {};
  if (body.parent) {
    const p = bodyPos(bodies[body.parent], bodies, t, {});
    const ang = body.phase + (t / body.period) * Math.PI * 2;
    out.x = p.x + Math.cos(ang) * body.orbitR;
    out.y = p.y + Math.sin(ang) * body.orbitR;
    return out;
  }
  return orbitPos(body, t, out);
}

// 결정적 난수
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
