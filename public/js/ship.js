// ============================================================
//  함선 엔티티 — 6자유도 비행 물리, 장비, 피해
// ============================================================
import * as THREE from 'three';
import { SHIPS, shipStats, parseW, WEAPONS } from './data.js';
import { instantiateShip, animateShip } from './models.js';
import { clamp, damp } from './util.js';

let NEXT_ID = 1;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();

export const CRUISE_MAX = 32000;
export const CRUISE_MIN = 900;

export class Ship {
  constructor(o) {
    this.id = o.id || 'n' + NEXT_ID++;
    this.type = o.type;
    this.spec = SHIPS[o.type];
    this.loadout = o.loadout;
    this.paint = o.paint || this.spec.paint;
    this.name = o.name || this.spec.name;
    this.role = o.role || 'player';
    this.faction = o.faction || 'indep';
    this.isPlayer = !!o.isPlayer;
    this.isRemote = !!o.isRemote;
    this.stats = shipStats(this.type, this.loadout);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion(); this.angVel = new THREE.Vector3();
    this.hull = this.stats.hull; this.shield = this.stats.shield; this.energy = this.stats.energy;
    this.fuel = this.stats.fuel;
    this.cargo = {};
    this.ctrl = { pitch: 0, yaw: 0, roll: 0, throttle: 0, sx: 0, sy: 0, boost: false, fire1: false, fire2: false };
    this.fa = true;
    this.cruise = 0;            // 0 꺼짐, 1 충전, 2 크루즈
    this.cruiseCharge = 0;
    this.cruiseSpeed = 0;
    this.lastHit = -99; this.shieldDown = false;
    this.dead = false;
    this.target = null;
    this.bounty = o.bounty || 0;
    this.aggressors = new Set();
    this.weapons = (this.loadout.hard || []).map((k, i) => {
      const p = parseW(k);
      return p ? { k, ...p, cd: Math.random() * 0.2, slot: i, ammo: p.w.ammo || 0, maxAmmo: p.w.ammo || 0 } : null;
    }).filter(Boolean);
    this.beam = null;           // 채굴/빔 상태
    this.t = 0;
    this.model = null;
    this.radius = this.spec.size * 0.55;
    this.boosting = false;
    this.speed = 0;
  }

  makeModel() {
    this.model = instantiateShip(this.type, this.paint);
    this.radius = Math.max(this.spec.size * 0.45, this.model.userData.radius * 0.8);
    return this.model;
  }
  get forward() { return _v.set(0, 0, 1).applyQuaternion(this.quat); }
  dir(x, y, z, out) { return out.set(x, y, z).applyQuaternion(this.quat); }
  worldPoint(local, out) { return out.copy(local).applyQuaternion(this.quat).add(this.pos); }

  get maxSpeed() { return this.boosting ? this.stats.boost : this.stats.speed; }

  update(dt, env) {
    this.t += dt;
    const c = this.ctrl, s = this.stats;
    // --- 회전 ---
    const turnMul = this.cruise === 2 ? 0.55 : 1;
    const tx = -clamp(c.pitch, -1, 1) * s.pitch * turnMul;
    const ty = -clamp(c.yaw, -1, 1) * s.yaw * turnMul;
    const tz = clamp(c.roll, -1, 1) * s.roll * turnMul;
    const ak = 5.5 / Math.sqrt(this.spec.mass);
    this.angVel.x = damp(this.angVel.x, tx, ak, dt);
    this.angVel.y = damp(this.angVel.y, ty, ak, dt);
    this.angVel.z = damp(this.angVel.z, tz, ak * 1.3, dt);
    _e.set(this.angVel.x * dt, this.angVel.y * dt, this.angVel.z * dt, 'XYZ');
    _q.setFromEuler(_e);
    this.quat.multiply(_q).normalize();

    const fwd = _v.set(0, 0, 1).applyQuaternion(this.quat);
    const fx = fwd.x, fy = fwd.y, fz = fwd.z;
    // --- 부스터 ---
    const wantBoost = c.boost && this.cruise !== 2 && this.energy > 3;
    this.boosting = wantBoost;
    if (wantBoost) this.energy -= dt * 14;
    else this.energy = Math.min(s.energy, this.energy + s.regen * dt);
    if (this.energy < 0) this.energy = 0;

    // --- 크루즈 ---
    if (this.cruise === 1) {
      this.cruiseCharge += dt;
      if (env && env.massLocked) { this.cruise = 0; this.cruiseCharge = 0; if (this.onEvent) this.onEvent('masslock'); }
      else if (this.cruiseCharge >= 3) { this.cruise = 2; this.cruiseSpeed = Math.max(this.vel.length(), 600); if (this.onEvent) this.onEvent('cruise'); }
    }
    if (this.cruise === 2) {
      // 목표 속도: 스로틀 × 중력권 제한 × 목표 접근 감속
      let vmax = CRUISE_MAX * clamp(c.throttle, 0.05, 1);
      if (env) {
        vmax = Math.min(vmax, Math.max(CRUISE_MIN, env.gravLimit));
        if (env.arriveDist !== undefined) vmax = Math.min(vmax, Math.max(CRUISE_MIN * 0.8, (env.arriveDist - 2500) * 0.55));
      }
      const acc = this.cruiseSpeed < vmax ? Math.max(400, this.cruiseSpeed * 0.9) : this.cruiseSpeed * 2.2 + 500;
      this.cruiseSpeed += clamp(vmax - this.cruiseSpeed, -acc * dt, acc * dt);
      const k = Math.min(1, dt * 3);
      this.vel.x += (fx * this.cruiseSpeed - this.vel.x) * k;
      this.vel.y += (fy * this.cruiseSpeed - this.vel.y) * k;
      this.vel.z += (fz * this.cruiseSpeed - this.vel.z) * k;
    } else {
      const up = this.dir(0, 1, 0, new THREE.Vector3());
      const right = this.dir(-1, 0, 0, new THREE.Vector3());
      const vmax = this.maxSpeed;
      const acc = s.accel * (this.boosting ? 2.2 : 1) / Math.sqrt(this.spec.mass) * 1.4;
      if (this.fa) {
        const thr = clamp(c.throttle, -0.5, 1);
        const dx = fx * thr * vmax + right.x * c.sx * vmax * 0.55 + up.x * c.sy * vmax * 0.55 - this.vel.x;
        const dy = fy * thr * vmax + right.y * c.sx * vmax * 0.55 + up.y * c.sy * vmax * 0.55 - this.vel.y;
        const dz = fz * thr * vmax + right.z * c.sx * vmax * 0.55 + up.z * c.sy * vmax * 0.55 - this.vel.z;
        const dl = Math.hypot(dx, dy, dz);
        // 워프 이탈 직후 등 과속 상태는 더 강하게 감속
        const over = this.vel.length() > vmax * 1.1;
        const lim = acc * dt * (over ? 4 : 1);
        if (dl > 0) { const f = Math.min(1, lim / dl); this.vel.x += dx * f; this.vel.y += dy * f; this.vel.z += dz * f; }
      } else {
        const thr = clamp(c.throttle, -0.5, 1);
        this.vel.x += (fx * thr + right.x * c.sx + up.x * c.sy) * acc * dt;
        this.vel.y += (fy * thr + right.y * c.sx + up.y * c.sy) * acc * dt;
        this.vel.z += (fz * thr + right.z * c.sx + up.z * c.sy) * acc * dt;
        const sp = this.vel.length(), cap = s.boost * 1.25;
        if (sp > cap) this.vel.multiplyScalar(cap / sp);
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    this.speed = this.vel.length();

    // --- 쉴드 ---
    const since = this.t - this.lastHit;
    if (this.shieldDown) {
      if (since > 9) { this.shieldDown = false; this.shield = s.shield * 0.25; }
    } else if (since > 4 && this.shield < s.shield) {
      this.shield = Math.min(s.shield, this.shield + s.shieldRegen * dt);
    }
    for (const w of this.weapons) if (w.cd > 0) w.cd -= dt;
  }

  // 피해 처리 — 반환: 'shield' | 'hull' | 'dead'
  damage(amount, w, attacker) {
    if (this.dead) return null;
    this.lastHit = this.t;
    if (attacker && attacker !== this) this.aggressors.add(attacker.id);
    const sm = w ? w.shield : 1, hm = w ? w.hull : 1;
    let res = 'shield';
    if (this.shield > 0) {
      const d = amount * sm;
      if (d <= this.shield) { this.shield -= d; return res; }
      const rest = (d - this.shield) / sm;
      this.shield = 0; this.shieldDown = true;
      amount = rest;
    }
    this.hull -= amount * hm;
    res = 'hull';
    if (this.hull <= 0) { this.hull = 0; this.dead = true; res = 'dead'; }
    return res;
  }

  syncModel(t) {
    if (!this.model) return;
    this.model.quaternion.copy(this.quat);
    const thr = this.cruise === 2 ? 1 : Math.max(0, this.ctrl.throttle, Math.abs(this.ctrl.sx) * 0.4, Math.abs(this.ctrl.sy) * 0.4);
    animateShip(this.model, t, thr, this.boosting, this.cruise === 2);
  }

  cargoUsed() { let n = 0; for (const k in this.cargo) n += this.cargo[k]; return n; }
  cargoFree() { return this.stats.cargo - this.cargoUsed(); }
  addCargo(id, n) {
    n = Math.min(n, this.cargoFree());
    if (n <= 0) return 0;
    this.cargo[id] = (this.cargo[id] || 0) + n;
    return n;
  }
  removeCargo(id, n) {
    const have = this.cargo[id] || 0;
    n = Math.min(n, have);
    if (have - n <= 0) delete this.cargo[id]; else this.cargo[id] = have - n;
    return n;
  }
  primaryWeapon() { return this.weapons.find((w) => !w.w.secondary && w.w.kind !== 'beam') || this.weapons[0]; }
}

export { WEAPONS };
