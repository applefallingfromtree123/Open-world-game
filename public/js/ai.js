// ============================================================
//  NPC 두뇌 — 상선 · 채굴선 · 해적 · 보안군 · 현상금 사냥꾼 · 윙맨 · 수호자
// ============================================================
import * as THREE from 'three';
import { clamp, leadPoint, R } from './util.js';
import { S } from './state.js';

const _l = new THREE.Vector3(), _iq = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

// 지점으로 기수를 돌림. 반환: { dot: 정면 정렬도, d: 거리 }
export function steer(ship, point, opts = {}) {
  _iq.copy(ship.quat).invert();
  _l.copy(point).sub(ship.pos).applyQuaternion(_iq);
  const d = _l.length();
  if (d < 1e-3) return { dot: 1, d: 0 };
  _l.divideScalar(d);
  const c = ship.ctrl;
  const yawErr = Math.atan2(-_l.x, _l.z);
  const pitchErr = Math.atan2(_l.y, Math.hypot(_l.x, _l.z));
  const g = opts.gain || 3.2;
  c.yaw = clamp(yawErr * g + ship.angVel.y * 0.35, -1, 1);
  c.pitch = clamp(pitchErr * g + ship.angVel.x * 0.35, -1, 1);
  if (opts.bank !== false) {
    const w = clamp((1 - _l.z) * 2.5, 0, 1);
    const rollErr = Math.atan2(-_l.x, Math.max(0.0001, _l.y + 0.25));
    c.roll = clamp(rollErr * 1.3 * w - ship.angVel.z * 0.25, -1, 1);
  } else if (opts.level) {
    // 수평 유지: 함선의 위쪽을 월드 위쪽에 맞춤
    const right = _a.set(-1, 0, 0).applyQuaternion(ship.quat);
    c.roll = clamp(-right.y * 1.5 - ship.angVel.z * 0.25, -1, 1);
  } else c.roll = 0;
  return { dot: _l.z, d };
}

export function newBrain(role, home) {
  return { role, state: 'idle', t: 0, think: Math.random() * 0.5, home, dest: null, target: null, breakT: 0, breakP: new THREE.Vector3(), jink: new THREE.Vector2(), fleeT: 0, said: {}, patrol: null, mineT: 0, rock: null, offset: null };
}

const TAUNTS = {
  pirate: ['화물 내려놓고 꺼져. 그럼 살려주지.', '오늘은 운이 없는 날이군, 파일럿.', '송곳니가 너를 찾았다!', '좋은 배네. 이제 내 거다.', '도망쳐봐. 재밌겠군.'],
  police: ['보안군이다. 즉시 엔진을 정지하라!', '범죄자 확인. 교전을 허가한다.', '법의 심판을 받아라.'],
  hunter: ['네 목에 걸린 현상금, 내가 가져가지.', '아무 감정 없어. 그냥 일일 뿐이야.', '현상금 사냥 개시.'],
  trader: ['메이데이! 공격받고 있다!', '제발, 화물은 가져가고 살려줘!', '보안군! 보안군 어디 있나?!'],
  flee: ['젠장, 후퇴한다!', '이건 계획에 없었어!', '다음엔 각오해라!'],
  wing: ['엄호한다, 보스.', '표적 확인. 교전 개시.', '뒤는 내가 맡지.', '적기 격추!'],
};
function say(w, ship, kind, chance = 1) {
  if (Math.random() > chance) return;
  const b = ship.brain;
  if (b.said[kind] && w.time - b.said[kind] < 25) return;
  b.said[kind] = w.time;
  const list = TAUNTS[kind];
  w.game.comms(ship, list[(Math.random() * list.length) | 0]);
}

// ------------------------------------------------------------
//  의사결정 (0.5초마다)
// ------------------------------------------------------------
export function think(w, ship) {
  const b = ship.brain;
  const role = b.role;
  // 피격 시 반응
  if (ship.hull < ship.stats.hull * 0.25 && role !== 'wing' && role !== 'guardian' && role !== 'police' && b.state !== 'flee') {
    b.state = 'flee'; b.fleeT = 6 + Math.random() * 6; say(w, ship, role === 'trader' ? 'trader' : 'flee', 0.8);
  }
  if (b.state === 'flee') return;
  const peaceful = role === 'trader' || role === 'miner' || role === 'explorer';
  if (peaceful) {
    const att = recentAttacker(w, ship);
    if (att) { b.state = 'flee'; b.fleeFrom = att; b.fleeT = 8 + Math.random() * 6; say(w, ship, 'trader', 0.7); return; }
  }
  // 적 탐색
  if (!peaceful) {
    let tgt = b.target && !b.target.dead && w.hostile(ship, b.target) && b.target.pos.distanceTo(ship.pos) < 9000 ? b.target : null;
    if (role === 'wing') {
      const p = w.player;
      const pt = p && p.target && !p.target.dead && p.target.isShip && (w.hostile(p.target, p) || p.target.aggressors.has(p.id) || w.firedAt.has(p.target.id)) ? p.target : null;
      if (pt) tgt = pt;
    }
    if (!tgt) tgt = w.nearestHostile(ship, role === 'police' ? 7000 : role === 'pirate' ? 6000 : 5000);
    if (tgt && tgt !== b.target) {
      if (role === 'pirate' || role === 'hunter' || role === 'police') say(w, ship, role, tgt.isPlayer ? 0.9 : 0.15);
      if (role === 'wing') say(w, ship, 'wing', 0.4);
    }
    b.target = tgt;
    ship.target = tgt;
    if (tgt) { b.state = 'fight'; return; }
  }
  if (b.state === 'fight') b.state = 'idle';
  // 평상시 행동
  if (role === 'trader' || role === 'explorer') {
    if (!b.dest || b.state === 'idle') {
      const sts = w.stations.filter((s) => s !== b.home && s.data.faction !== 'pirate');
      b.dest = sts.length ? sts[(Math.random() * sts.length) | 0] : null;
      b.state = b.dest ? 'travel' : 'wander';
    }
  } else if (role === 'miner') {
    if (b.state === 'idle') {
      const f = w.nearestField(ship.pos);
      if (f && b.mineT < 30) { b.field = f; b.state = 'mine'; b.rock = null; }
      else { b.dest = b.home || w.nearestStation(ship.pos); b.state = 'travel'; }
    }
  } else if (role === 'wing') {
    b.state = 'follow';
  } else {
    if (b.state === 'idle' || (b.state === 'patrol' && (!b.patrol || ship.pos.distanceTo(b.patrol) < 600))) {
      // 순찰 지점: 플레이어 주변 / 스테이션 / 소행성대
      const anchor = (role === 'police' || role === 'patrol') ? (w.nearestStation(w.focus) || null) : (w.nearestField(w.focus) || null);
      const base = anchor ? anchor.pos : w.focus;
      b.patrol = new THREE.Vector3().copy(base).add(R.dir(new THREE.Vector3()).multiplyScalar(1500 + Math.random() * 4000));
      if (role === 'hunter' || (role === 'pirate' && Math.random() < 0.5)) b.patrol.copy(w.focus).add(R.dir(new THREE.Vector3()).multiplyScalar(1500 + Math.random() * 2500));
      b.state = 'patrol';
    }
  }
}
function recentAttacker(w, ship) {
  if (ship.t - ship.lastHit > 3) return null;
  for (const id of ship.aggressors) { const s = w.byId.get(id); if (s && !s.dead) return s; }
  return null;
}

// ------------------------------------------------------------
//  매 프레임 조종
// ------------------------------------------------------------
export function control(w, ship, dt) {
  const b = ship.brain, c = ship.ctrl;
  b.think -= dt;
  if (b.think <= 0) { b.think = 0.45 + Math.random() * 0.2; think(w, ship); }
  c.fire1 = false; c.fire2 = false; c.boost = false; c.sx = 0; c.sy = 0;
  switch (b.state) {
    case 'fight': return fight(w, ship, dt);
    case 'flee': return flee(w, ship, dt);
    case 'travel': return travel(w, ship, dt);
    case 'mine': return mine(w, ship, dt);
    case 'follow': return follow(w, ship, dt);
    case 'patrol': {
      const r = steer(ship, b.patrol);
      c.throttle = r.dot > 0.6 ? 0.55 : 0.25;
      return;
    }
    case 'dock': return dock(w, ship, dt);
    default: c.throttle = 0.3; c.pitch = c.yaw = c.roll = 0;
  }
}

function fight(w, ship, dt) {
  const b = ship.brain, c = ship.ctrl, t = b.target;
  if (!t || t.dead) { b.state = 'idle'; return; }
  if (ship.cruise) ship.cruise = 0;
  const pw = ship.primaryWeapon();
  const spd = pw && pw.w.speed ? pw.w.speed : 2000;
  const lead = leadPoint(ship.pos, ship.vel, t.pos, t.vel, spd, _b);
  const d = ship.pos.distanceTo(t.pos);
  if (b.breakT > 0) {
    b.breakT -= dt;
    steer(ship, b.breakP);
    c.throttle = 1; c.boost = ship.energy > ship.stats.energy * 0.3;
    return;
  }
  const r = steer(ship, lead, { gain: 3.6 });
  const range = pw ? pw.w.range * 0.85 : 1500;
  if (d < 140 + ship.radius + t.radius) {
    // 충돌 회피 — 이탈 기동
    b.breakT = 1.6 + Math.random() * 1.4;
    b.breakP.copy(ship.pos).add(_a.copy(ship.forward).multiplyScalar(1200)).add(R.dir(new THREE.Vector3()).multiplyScalar(900));
  }
  c.throttle = d > range ? 1 : d > 500 ? 0.7 : 0.4;
  c.boost = d > 3000 && ship.energy > ship.stats.energy * 0.5;
  // 피격 시 회피 기동
  if (ship.t - ship.lastHit < 1.2) {
    if (Math.random() < dt * 2) b.jink.set(Math.random() * 2 - 1, Math.random() * 2 - 1);
    c.sx = b.jink.x; c.sy = b.jink.y;
  }
  const accuracy = b.role === 'wing' || b.role === 'police' ? 0.993 : 0.988;
  if (r.dot > accuracy && d < range * 1.1) c.fire1 = true;
  if (d < 3500 && r.dot > 0.94 && ship.weapons.some((x) => x.w.secondary && x.ammo > 0) && Math.random() < dt * 0.25) c.fire2 = true;
}

function flee(w, ship, dt) {
  const b = ship.brain, c = ship.ctrl;
  b.fleeT -= dt;
  let from = b.fleeFrom && !b.fleeFrom.dead ? b.fleeFrom.pos : null;
  if (!from) for (const id of ship.aggressors) { const s = w.byId.get(id); if (s && !s.dead) { from = s.pos; break; } }
  if (from) _a.copy(ship.pos).sub(from).normalize().multiplyScalar(5000).add(ship.pos);
  else _a.copy(ship.pos).add(_b.copy(ship.forward).multiplyScalar(5000));
  steer(ship, _a);
  c.throttle = 1; c.boost = true;
  if (Math.random() < dt * 0.8) b.jink.set(Math.random() * 2 - 1, Math.random() * 2 - 1);
  c.sx = b.jink.x; c.sy = b.jink.y;
  if (b.fleeT <= 0 && !w.massLocked(ship.pos)) w.jumpOut(ship);
  else if (b.fleeT < -10) w.jumpOut(ship);
}

function travel(w, ship, dt) {
  const b = ship.brain, c = ship.ctrl;
  const st = b.dest;
  if (!st) { b.state = 'idle'; return; }
  const ap = st.approach;
  const d = ship.pos.distanceTo(ap);
  const r = steer(ship, ap, { gain: 2.6 });
  if (d > 9000) {
    if (!ship.cruise && r.dot > 0.97 && !w.massLocked(ship.pos)) ship.cruise = 1, ship.cruiseCharge = 0;
    c.throttle = r.dot > 0.8 ? 1 : 0.3;
  } else {
    if (ship.cruise === 2 && d < 5500) w.dropCruise(ship);
    c.throttle = d > 1200 ? (r.dot > 0.7 ? 0.9 : 0.3) : 0.35;
    if (d < 350) { b.state = 'dock'; b.dockPhase = 0; }
  }
}

function dock(w, ship, dt) {
  const b = ship.brain, c = ship.ctrl;
  const st = b.dest;
  if (!st) { b.state = 'idle'; return; }
  const r = steer(ship, st.entrance, { gain: 3 });
  const d = ship.pos.distanceTo(st.entrance);
  c.throttle = r.dot > 0.9 ? clamp(d / 600, 0.15, 0.5) : 0.05;
  if (d < 40 + ship.radius) w.despawn(ship, 'dock');
}

function mine(w, ship, dt) {
  const b = ship.brain, c = ship.ctrl;
  const f = b.field;
  if (!f) { b.state = 'idle'; return; }
  if (!b.rock || b.rock.amount <= 0) {
    // 가까운 소행성 고르기
    let best = null, bd = 1e12;
    for (const rk of f.rocks) { if (rk.amount <= 0 || rk.r < 15) continue; const d = rk.pos.distanceToSquared(ship.pos); if (d < bd) { bd = d; best = rk; } }
    b.rock = best;
    if (!best) { b.state = 'idle'; b.mineT = 99; return; }
  }
  const rk = b.rock;
  const d = ship.pos.distanceTo(rk.pos) - rk.r;
  const dd = ship.pos.distanceTo(f.pos);
  if (dd > f.radius + 9000) {
    // 멀리 있으면 크루즈
    const r = steer(ship, f.pos);
    if (!ship.cruise && r.dot > 0.97 && !w.massLocked(ship.pos)) { ship.cruise = 1; ship.cruiseCharge = 0; }
    c.throttle = 1;
    return;
  }
  if (ship.cruise === 2) w.dropCruise(ship);
  const r = steer(ship, rk.pos, { gain: 2.5 });
  if (d > 380) c.throttle = r.dot > 0.8 ? 0.7 : 0.1;
  else { c.throttle = d < 200 ? -0.2 : 0; if (r.dot > 0.985) { c.fire1 = true; b.mineT += dt; } }
  if (b.mineT > 35 || ship.cargoFree() <= 0) { b.dest = b.home || w.nearestStation(ship.pos); b.state = b.dest ? 'travel' : 'idle'; b.mineT = 0; }
}

function follow(w, ship, dt) {
  const b = ship.brain, c = ship.ctrl, p = w.player;
  if (!p || p.dead) { c.throttle = 0; return; }
  if (!b.offset) b.offset = new THREE.Vector3((b.slot % 2 ? 1 : -1) * (30 + 25 * Math.floor(b.slot / 2)), 8, -40 - 20 * b.slot);
  const goal = _a.copy(b.offset).applyQuaternion(p.quat).add(p.pos);
  if (p.cruise === 2 || p.pos.distanceTo(ship.pos) > 8000) {
    // 크루즈 중에는 대형 유지 (점프 동기화)
    ship.pos.lerp(goal, Math.min(1, dt * 3)); ship.vel.copy(p.vel); ship.quat.slerp(p.quat, Math.min(1, dt * 3)); ship.cruise = p.cruise;
    return;
  }
  ship.cruise = 0;
  const d = ship.pos.distanceTo(goal);
  const lookAt = _b.copy(goal).addScaledVector(p.forward, 600);
  steer(ship, d > 150 ? goal : lookAt, { bank: false, level: false });
  if (d < 150) { c.roll = clamp(_dot(p, ship) * 2, -1, 1); }
  const vp = p.speed;
  c.throttle = clamp((vp + (d - 20) * 0.8) / Math.max(1, ship.stats.speed), -0.3, 1);
  c.boost = d > 1200;
}
function _dot(p, s) {
  // 리더의 롤에 맞춤
  const pr = _l.set(-1, 0, 0).applyQuaternion(p.quat);
  const su = _iq.copy(s.quat);
  const sUp = new THREE.Vector3(0, 1, 0).applyQuaternion(su);
  return -pr.dot(sUp);
}
