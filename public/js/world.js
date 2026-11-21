// ============================================================
//  성계 시뮬레이션 — 천체 · 함선 · 전투 · 채굴 · 화물 · 신호원 · NPC 생태계
// ============================================================
import * as THREE from 'three';
import { E, anchor, unanchor, clearAnchors, buildSky } from './engine.js';
import { buildPlanet, buildStar, buildStation, buildField, buildCanister, buildOutpost, buildWreck, animateLights, glowTex } from './models.js';
import { generateSystem, PLANET_KINDS } from './universe.js';
import { Ship } from './ship.js';
import { newBrain, control } from './ai.js';
import * as FX from './fx.js';
import { SHIPS, ROLES, NPC_FIRST, NPC_LAST, GOODS, SIZE_MUL, FACTIONS, LAWFUL, defaultLoadout, wkey } from './data.js';
import { S, addBounty, addRep, isWanted } from './state.js';
import { rng, R, hashStr, clamp, leadPoint, segSphere, mulberry32 } from './util.js';
import { sfx } from './audio.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Vector3();

const sysCache = new Map();
export function systemData(sys) {
  if (!sysCache.has(sys.id)) sysCache.set(sys.id, generateSystem(sys));
  return sysCache.get(sys.id);
}

export class World {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.ships = []; this.byId = new Map();
    this.bolts = []; this.missiles = []; this.cans = []; this.anoms = [];
    this.stations = []; this.planets = []; this.fields = []; this.outposts = [];
    this.nav = [];
    this.player = null;
    this.focus = new THREE.Vector3();
    this.firedAt = new Set();
    this.spawnT = 2; this.interdictT = 40; this.scanT = 0;
  }

  // ------------------------------------------------------------
  //  로드
  // ------------------------------------------------------------
  load(sysId) {
    this.unload();
    const gal = this.game.galaxy;
    const sys = gal.byId[sysId];
    const sd = systemData(sys);
    this.sys = sys; this.sd = sd;
    const fc = FACTIONS[sys.faction].color;
    buildSky(hashStr(sys.id) ^ 77, [fc, sd.star.color, ['#ff5ab8', '#5ad8ff', '#9a6bff', '#ffb35a', '#6bffb8'][hashStr(sys.id) % 5]]);
    E.sun.color.set(sd.star.color).lerp(new THREE.Color('#ffffff'), 0.55);
    E.sun.intensity = 3.0 * sd.star.lum;
    // 항성
    this.starModel = buildStar(sd.star);
    this.star = { kind: 'star', id: sys.id + '-star', name: `${sys.name} (${sys.star.cls}형 ${sys.star.name})`, pos: new THREE.Vector3(), radius: sd.star.radius, model: this.starModel };
    anchor(this.starModel, this.star.pos);
    this.nav.push(this.star);
    // 행성 · 위성
    const hasPop = new Set(sd.stations.map((s) => s.planet));
    for (const pl of sd.planets) {
      for (const p of [pl, ...pl.moons]) {
        p.city = hasPop.has(p.id) && (p.kind === 'earth' || p.kind === 'ocean' || p.kind === 'desert');
        const m = buildPlanet(p);
        anchor(m, p.pos);
        const ent = { kind: p.moon ? 'moon' : 'planet', id: p.id, name: p.name, sub: p.kindName, pos: p.pos, radius: p.radius, model: m, data: p };
        this.planets.push(ent); this.nav.push(ent);
      }
    }
    // 스테이션
    for (const st of sd.stations) this.addStation(st, buildStation(st));
    // 소행성대
    for (const f of sd.fields) {
      const r = rng(f.seed);
      const rocks = [];
      for (let i = 0; i < f.count; i++) {
        const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.f()) * f.radius;
        const rad = Math.pow(r.f(), 2.2) * 110 + 10;
        const ore = r.weighted(f.ores);
        const pos = new THREE.Vector3(Math.cos(a) * d, r.range(-0.12, 0.12) * f.radius, Math.sin(a) * d);
        const amount = Math.round(rad * 0.6);
        const tint = new THREE.Color(GOODS[ore].color).lerp(new THREE.Color('#ffffff'), 0.55);
        rocks.push({ local: pos, pos: pos.clone().add(f.pos), r: rad, ore, amount, max: amount, v: i % 4, tint, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(r.f() * 6, r.f() * 6, r.f() * 6)), spin: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(), spd: r.range(0.02, 0.15) });
      }
      const g = buildField(f, rocks);
      const ent = { kind: 'field', id: f.id, name: f.name, sub: `${f.rich} · ${f.ores.slice().sort((a, b) => b[1] - a[1]).slice(0, 3).map((o) => GOODS[o[0]].name).join(', ')}`, pos: f.pos, radius: f.radius, model: g, data: f, rocks };
      anchor(g, f.pos);
      this.fields.push(ent); this.nav.push(ent);
      this.updateRocks(ent, 0, true);
    }
    // 플레이어 기지
    for (const o of S.save.outposts.filter((x) => x.sys === sys.id)) this.addOutpost(o);
    // 신호원
    const nA = R.int(2, 4) + (sys.sec <= 1 ? 1 : 0);
    for (let i = 0; i < nA; i++) this.spawnAnomaly();
    // 임무 표적
    for (const m of S.save.missions) if (m.sys === sys.id && m.spot && !m.done) this.addMissionSpot(m);
    this.spawnT = 1;
  }

  addStation(st, model) {
    const q = new THREE.Quaternion().setFromUnitVectors(_z, st.face);
    model.quaternion.copy(q);
    anchor(model, st.pos);
    const ud = model.userData;
    const entrance = new THREE.Vector3(0, 0, ud.dockZ).applyQuaternion(q).add(st.pos);
    const approach = new THREE.Vector3(0, 0, ud.dockZ + 900).applyQuaternion(q).add(st.pos);
    const colliders = ud.colliders.map((c) => ({ p: c.p.clone().applyQuaternion(q).add(st.pos), r: c.r }));
    const ent = { kind: st.outpost ? 'outpost' : 'station', id: st.id, name: st.name, sub: st.outpost ? '개인 기지' : `${FACTIONS[st.faction].short} · ${st.typeName}`, pos: st.pos, radius: 700, model, data: st, quat: q, entrance, approach, colliders, face: st.face };
    this.stations.push(ent); this.nav.push(ent);
    return ent;
  }
  addOutpost(o) {
    const st = { id: o.id, name: o.name, type: 'outpost', typeName: '개인 기지', faction: 'player', pos: new THREE.Vector3().fromArray(o.pos), face: new THREE.Vector3().fromArray(o.face), outpost: o };
    const ent = this.addStation(st, buildOutpost(S.save.ships.find((x) => x.id === S.save.active)?.paint || ['#c9ced6', '#5ce1ff'], o.modules));
    ent.colliders.forEach((c) => (c.r *= 1));
    this.outposts.push(ent);
    return ent;
  }
  rebuildOutpost(o) {
    const ent = this.stations.find((s) => s.id === o.id);
    if (!ent) return;
    unanchor(ent.model);
    ent.model = buildOutpost(S.save.ships.find((x) => x.id === S.save.active)?.paint || ['#c9ced6', '#5ce1ff'], o.modules);
    ent.model.quaternion.copy(ent.quat);
    anchor(ent.model, ent.pos);
  }

  unload() {
    for (const s of this.ships) this.removeShipModel(s);
    clearAnchors();
    FX.clearFx();
    this.ships = []; this.byId.clear(); this.bolts = []; this.missiles = []; this.cans = []; this.anoms = [];
    this.stations = []; this.planets = []; this.fields = []; this.outposts = []; this.nav = [];
    this.player = null; this.firedAt.clear();
  }

  // ------------------------------------------------------------
  //  함선 관리
  // ------------------------------------------------------------
  addShip(ship) {
    ship.makeModel();
    anchor(ship.model, ship.pos);
    ship.isShip = true;
    this.ships.push(ship);
    this.byId.set(ship.id, ship);
    return ship;
  }
  removeShipModel(s) { if (s.model) unanchor(s.model); }
  despawn(ship, how) {
    if (how === 'jump') FX.jumpFlash(ship.pos, '#7ab8ff', ship.spec.size / 15);
    ship.dead = true; ship.gone = true;
  }
  jumpOut(ship) {
    if (ship.isPlayer) return;
    this.despawn(ship, 'jump');
    if (ship.pos.distanceTo(this.focus) < 4000) sfx.jump(0.5);
  }
  dropCruise(ship) {
    ship.cruise = 0; ship.cruiseCharge = 0;
    ship.vel.setLength(Math.min(ship.vel.length(), ship.stats.speed * 1.4));
  }

  makeNPC(role, opt = {}) {
    const r = R;
    const roleDef = ROLES[role] || ROLES.pirate;
    let type = opt.type || r.weighted(roleDef.ships);
    if (!opt.type && role === 'pirate' && this.sys.sec >= 2 && (type === 'vanguard' || type === 'mantis') && r.chance(0.7)) type = 'kestrel';
    const lo = defaultLoadout(type);
    if (role === 'miner') lo.hard = SHIPS[type].hard.map((sz, i) => i === 0 ? wkey('pulse', sz) : wkey('mining', sz));
    else if (role === 'pirate' || role === 'police' || role === 'hunter' || role === 'patrol' || role === 'wing' || role === 'guardian') {
      lo.hard = SHIPS[type].hard.map((sz) => wkey(r.pick(role === 'police' ? ['pulse', 'pulse', 'cannon'] : role === 'guardian' ? ['plasma', 'pulse'] : ['pulse', 'cannon', 'cannon', 'plasma']), sz));
      if (SHIPS[type].hard.length >= 3 && r.chance(0.35)) lo.hard[lo.hard.length - 1] = wkey('missile', SHIPS[type].hard[SHIPS[type].hard.length - 1]);
      const tier = role === 'police' ? 3 : role === 'hunter' ? 3 : this.sys.sec <= 0 ? r.int(2, 4) : r.int(1, 3);
      for (const k of ['shield', 'thruster', 'power', 'hull']) lo.core[k] = tier;
    }
    const paints = {
      pirate: [['#3a1a1a', '#ff3040'], ['#202020', '#ff5a1a'], ['#4a2a1a', '#ffcc00']],
      police: [['#e8eef5', '#2f6bff']], patrol: [['#c9d1d9', FACTIONS[this.sys.faction].color]], hunter: [['#2a2a32', '#c0c0c0'], ['#1a2a2a', '#ff8a3c']],
      guardian: [['#1a1030', '#c070ff']],
    };
    const paint = opt.paint || (paints[role] ? r.pick(paints[role]) : [r.pick(['#c9d1d9', '#d8c9a8', '#a8b8c8', '#e8e8e8', '#8a9a7a']), r.pick(['#3a7bd5', '#d5743a', '#3ad58a', '#d53a6a', '#f2c230'])]);
    const faction = role === 'pirate' ? 'pirate' : role === 'guardian' ? 'guardian' : role === 'police' || role === 'patrol' ? (this.sys.faction === 'pirate' ? 'indep' : this.sys.faction) : opt.faction || (this.sys.faction === 'pirate' ? 'indep' : this.sys.faction);
    const name = opt.name || (role === 'police' ? `보안군 ${r.pick(['알파', '브라보', '찰리', '델타', '에코'])}-${r.int(1, 99)}` : role === 'guardian' ? `수호자 ${r.int(100, 999)}` : `${r.pick(NPC_FIRST)} ${r.pick(NPC_LAST)}`);
    const s = new Ship({ type, loadout: lo, paint, name, role, faction });
    s.brain = newBrain(role, opt.home || null);
    if (role === 'pirate') s.bounty = Math.round((SHIPS[type].price * 0.04 + 600) * (1 + (2 - Math.min(2, this.sys.sec)) * 0.4) / 100) * 100;
    if (role === 'guardian') s.bounty = 1500;
    if (role === 'trader') { const goods = Object.keys(GOODS).filter((g) => !GOODS[g].ore); const g = r.pick(goods); s.cargo[g] = Math.min(s.stats.cargo, r.int(4, 40)); }
    return s;
  }
  spawnNPC(role, pos, opt = {}) {
    const s = this.makeNPC(role, opt);
    s.pos.copy(pos);
    if (opt.lookAt) s.quat.setFromUnitVectors(_z, _a.copy(opt.lookAt).sub(pos).normalize());
    else s.quat.setFromEuler(new THREE.Euler(R.range(-0.3, 0.3), R.range(0, 6.28), 0));
    if (opt.vel) s.vel.copy(opt.vel);
    this.addShip(s);
    if (opt.jumpIn) { FX.jumpFlash(pos, role === 'pirate' ? '#ff5a5a' : '#7ab8ff', s.spec.size / 15); if (pos.distanceTo(this.focus) < 5000) sfx.jump(0.6); }
    if (opt.brainState) Object.assign(s.brain, opt.brainState);
    return s;
  }

  // ------------------------------------------------------------
  //  관계
  // ------------------------------------------------------------
  playerSide(s) { return !!(s.isPlayer || s.outpostOwner || (s.brain && s.brain.role === 'wing')); }
  hostile(a, b) {
    if (a === b || !b || b.dead || !a || a.gone || b.gone) return false;
    const ra = a.isPlayer ? 'player' : a.isRemote ? 'remote' : a.brain.role;
    const rb = b.isPlayer ? 'player' : b.isRemote ? 'remote' : b.brain ? b.brain.role : 'x';
    if (ra === 'player' || ra === 'remote') return false;
    if (a.aggressors.has(b.id) && ra !== 'trader' && ra !== 'miner' && ra !== 'explorer') return true;
    const bSide = this.playerSide(b);
    const pirateFriend = (S.save.rep.pirate || 0) >= 25;
    const sf = this.sys.faction;
    const crim = isWanted(sf) || (S.save.rep[sf] !== undefined && S.save.rep[sf] <= -60);
    switch (ra) {
      case 'pirate':
        if (rb === 'pirate' || rb === 'guardian') return rb === 'guardian';
        if (bSide) return !pirateFriend;
        return rb !== 'remote';
      case 'guardian': return rb !== 'guardian';
      case 'police': case 'patrol':
        if (rb === 'pirate' || rb === 'guardian') return true;
        if (bSide) return crim;
        return false;
      case 'hunter':
        if (bSide) return Object.values(S.save.wanted).some((v) => v > 0);
        return rb === 'pirate';
      case 'wing':
        if (rb === 'pirate') return !pirateFriend || b.aggressors.has(this.player?.id);
        if (rb === 'guardian') return true;
        if (b.target && this.playerSide(b.target) && this.hostile(b, b.target)) return true;
        return false;
      default: return false;
    }
  }
  // 플레이어 관점의 표시 색 분류
  stance(s) {
    if (s.isRemote) return 'remote';
    if (s.brain && s.brain.role === 'wing') return 'wing';
    if (this.hostile(s, this.player) || (s.brain && s.brain.target === this.player)) return 'hostile';
    if (s.brain && (s.brain.role === 'police' || s.brain.role === 'patrol')) return 'police';
    if (s.bounty > 0 && s.brain && s.brain.role === 'pirate') return 'wanted';
    return 'neutral';
  }
  nearestHostile(ship, range) {
    let best = null, bd = range * range;
    for (const s of this.ships) {
      if (s.dead || s === ship) continue;
      const d = s.pos.distanceToSquared(ship.pos);
      if (d < bd && this.hostile(ship, s)) { bd = d; best = s; }
    }
    return best;
  }
  nearestStation(p) {
    let best = null, bd = Infinity;
    for (const s of this.stations) { if (s.data.outpost) continue; const d = s.pos.distanceToSquared(p); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  nearestField(p) {
    let best = null, bd = Infinity;
    for (const f of this.fields) { const d = f.pos.distanceToSquared(p); if (d < bd) { bd = d; best = f; } }
    return best;
  }
  massLocked(p) {
    for (const s of this.stations) if (s.pos.distanceToSquared(p) < 5000 * 5000) return true;
    for (const pl of this.planets) { const d = pl.pos.distanceTo(p); if (d < pl.radius * 1.15 + 1500) return true; }
    if (this.star.pos.distanceTo(p) < this.star.radius * 1.6) return true;
    for (const s of this.ships) if (!s.dead && !s.isPlayer && s.spec.mass >= 2.5 && s.brain && s.brain.role !== 'wing' && this.hostile(s, this.player) && s.pos.distanceToSquared(p) < 3000 * 3000) return true;
    return false;
  }
  cruiseEnv(ship) {
    let g = Infinity;
    const p = ship.pos;
    for (const pl of this.planets) { const d = pl.pos.distanceTo(p) - pl.radius; g = Math.min(g, d * 0.9); }
    g = Math.min(g, (this.star.pos.distanceTo(p) - this.star.radius) * 0.6);
    for (const s of this.stations) g = Math.min(g, (s.pos.distanceTo(p) - 2500) * 0.8);
    const env = { gravLimit: g, massLocked: ship.cruise === 1 && this.massLocked(p) };
    const t = ship.isPlayer ? ship.target : ship.brain && ship.brain.dest;
    if (t && !t.isShip && t.pos) {
      const tp = t.approach || t.pos;
      const dist = tp.distanceTo(p) - (t.kind === 'planet' || t.kind === 'moon' || t.kind === 'star' ? t.radius : 0);
      _a.copy(tp).sub(p).normalize();
      if (_a.dot(ship.forward) > 0.85) env.arriveDist = dist;
    }
    return env;
  }

  // ------------------------------------------------------------
  //  신호원 · 임무 지점
  // ------------------------------------------------------------
  spawnAnomaly(type, near) {
    const sec = this.sys.sec;
    type = type || R.weighted([['wreck', 3], ['cache', sec <= 1 ? 2 : 0.6], ['distress', 1.5], ['ruins', sec <= 1 ? 1 : 0.3], ['battle', sec >= 1 ? 1 : 0.2], ['convoy', sec <= 1 ? 1.2 : 0.3]]);
    let pos;
    if (near) pos = near.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(R.range(12000, 30000)));
    else {
      const pl = R.pick(this.planets);
      pos = pl.pos.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(pl.radius + R.range(20000, 60000)));
    }
    const names = { wreck: '난파선 잔해', cache: '미확인 신호 (은닉처)', distress: '조난 신호', ruins: '고대 신호', battle: '교전 지역', convoy: '해적 수송대' };
    const a = { kind: 'anomaly', type, id: 'an' + Math.random().toString(36).slice(2, 8), name: names[type], sub: '신호원', pos, radius: 300, triggered: false, looted: false, ttl: 1800 };
    if (type === 'wreck' || type === 'ruins' || type === 'cache') {
      a.model = type === 'ruins' ? this.ruinsModel() : buildWreck(R.pick(['atlas', 'mantis', 'prospector', 'vanguard']), R.int(1, 9999));
      if (type === 'wreck' || type === 'cache') a.model.scale.setScalar(1);
      anchor(a.model, a.pos);
    }
    this.anoms.push(a); this.nav.push(a);
    return a;
  }
  ruinsModel() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: '#2a2440', metalness: 0.8, roughness: 0.3, emissive: '#5a2a9a', emissiveIntensity: 0.4 });
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(R.range(10, 40), 0), m);
      mesh.position.set(R.range(-80, 80), R.range(-50, 50), R.range(-80, 80));
      mesh.scale.set(1, R.range(2, 5), 1); mesh.rotation.set(R.range(0, 3), R.range(0, 3), R.range(0, 3));
      mesh.castShadow = true; g.add(mesh);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#c070ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(160); g.add(s);
    return g;
  }
  addMissionSpot(m) {
    const a = { kind: 'anomaly', type: 'mission', id: 'ms' + m.id, name: m.spotName || '임무 지점', sub: '임무', pos: new THREE.Vector3().fromArray(m.spot), radius: 300, triggered: false, mission: m, ttl: 1e9 };
    this.anoms.push(a); this.nav.push(a);
  }
  removeAnom(a) {
    if (a.model) unanchor(a.model);
    this.anoms.splice(this.anoms.indexOf(a), 1);
    const i = this.nav.indexOf(a); if (i >= 0) this.nav.splice(i, 1);
    if (this.player && this.player.target === a) this.player.target = null;
  }
  triggerAnom(a) {
    a.triggered = true;
    const p = a.pos;
    const around = (r) => p.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(r));
    switch (a.type) {
      case 'cache': for (let i = 0; i < R.int(1, 3); i++) this.spawnNPC('pirate', around(1500), { jumpIn: true, lookAt: p }); break;
      case 'distress': {
        const t = this.spawnNPC('trader', around(400), { brainState: { state: 'flee', fleeT: 40 } });
        a.victim = t;
        for (let i = 0; i < R.int(2, 3); i++) { const pr = this.spawnNPC('pirate', around(1200)); pr.brain.target = t; pr.brain.state = 'fight'; t.aggressors.add(pr.id); }
        this.game.comms(t, '메이데이, 메이데이! 해적의 공격을 받고 있다! 누구든 도와줘!');
        break;
      }
      case 'ruins': for (let i = 0; i < R.int(2, 4); i++) this.spawnNPC('guardian', around(600), { type: 'kestrel' }); this.game.msg('고대 방어 체계가 깨어났습니다!', 'warn'); break;
      case 'battle': {
        for (let i = 0; i < R.int(2, 4); i++) this.spawnNPC('police', around(1500));
        for (let i = 0; i < R.int(3, 5); i++) this.spawnNPC('pirate', around(1500));
        this.game.msg('교전 지역 — 해적을 처치하면 현상금을 받습니다.', 'info');
        break;
      }
      case 'convoy': {
        for (let i = 0; i < 2; i++) { const t = this.spawnNPC('trader', around(500), { type: 'atlas', paint: ['#2a2020', '#ff3040'] }); t.faction = 'pirate'; t.brain.role = 'pirate'; t.brain.convoy = true; t.cargo = { [R.pick(['narcotics', 'weapons', 'slaves', 'luxury'])]: R.int(10, 30) }; t.bounty = 2500; }
        for (let i = 0; i < R.int(2, 3); i++) this.spawnNPC('pirate', around(700));
        break;
      }
      case 'mission': this.game.missions.onSpot(a.mission, this, a); break;
    }
  }
  lootAnom(a) {
    if (a.looted) return false;
    a.looted = true;
    const p = a.pos;
    const drops = [];
    if (a.type === 'wreck') { drops.push(['scrap', R.int(3, 10)]); if (R.chance(0.6)) drops.push(['blackbox', 1]); drops.push([R.pick(['electronics', 'machinery', 'medicine', 'alloys', 'luxury']), R.int(2, 8)]); }
    if (a.type === 'cache') { drops.push([R.pick(['narcotics', 'weapons', 'luxury', 'ai_cores']), R.int(4, 14)]); if (R.chance(0.5)) drops.push([R.pick(['painite', 'voidcrystal', 'platinum']), R.int(2, 8)]); }
    if (a.type === 'ruins') { drops.push(['artifact', R.int(1, 3)]); drops.push(['voidcrystal', R.int(1, 4)]); }
    for (const [id, n] of drops) this.dropCan(p.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(R.range(20, 80))), id, n);
    S.save.stats.salvaged++;
    return true;
  }

  // ------------------------------------------------------------
  //  화물 컨테이너
  // ------------------------------------------------------------
  dropCan(pos, item, qty, vel) {
    const m = buildCanister(GOODS[item].illegal ? '#ff4060' : GOODS[item].ore ? GOODS[item].color : '#ffb347');
    const c = { pos: pos.clone(), vel: vel ? vel.clone() : R.dir(new THREE.Vector3()).multiplyScalar(R.range(3, 15)), item, qty, life: 300, model: m, spin: new THREE.Vector3(R.f(), R.f(), R.f()), kind: 'can', name: `화물: ${GOODS[item].name} ${qty}t`, radius: 2 };
    anchor(m, c.pos);
    this.cans.push(c);
    return c;
  }

  // ------------------------------------------------------------
  //  무기
  // ------------------------------------------------------------
  gunPos(ship, w, out) {
    const guns = ship.model ? ship.model.userData.guns : null;
    if (!guns || !guns.length) return out.copy(ship.pos).addScaledVector(ship.forward, ship.radius);
    return ship.worldPoint(guns[w.slot % guns.length], out);
  }
  aimDir(ship, from, w, out) {
    const fwd = out.copy(ship.forward);
    const t = ship.target;
    if (t && t.isShip && !t.dead && w.w.kind !== 'missile') {
      const spd = w.w.speed || 1e5;
      const lp = leadPoint(from, ship.vel, t.pos, t.vel, spd, _c);
      _b.copy(lp).sub(from);
      const d = _b.length();
      if (d < w.w.range * 1.2) {
        _b.divideScalar(d);
        // 짐벌: 정면 기준 6도 이내면 표적 리드 지점 조준
        if (_b.dot(fwd) > 0.9945) return out.copy(_b);
      }
    }
    return fwd;
  }
  fire(ship, secondary) {
    let fired = false;
    const npcMul = ship.isPlayer ? 1 : ship.brain && ship.brain.role === 'wing' ? 0.8 : 0.55;
    for (const w of ship.weapons) {
      if (!!w.w.secondary !== secondary || w.w.kind === 'beam' || w.cd > 0) continue;
      const mul = SIZE_MUL[w.size];
      const en = w.w.energy * mul * (ship.isPlayer ? 1 : 0.4);
      if (en > ship.energy) continue;
      if (w.w.ammo && w.ammo <= 0) continue;
      if (w.w.kind === 'missile' && !(ship.target && ship.target.isShip && !ship.target.dead)) { if (ship.isPlayer) this.game.msg('미사일: 표적이 필요합니다 (T)', 'warn'); w.cd = 0.5; continue; }
      ship.energy -= en;
      w.cd = 1 / w.w.rof * (0.9 + Math.random() * 0.2);
      if (w.w.ammo) w.ammo--;
      const from = this.gunPos(ship, w, new THREE.Vector3());
      const dir = this.aimDir(ship, from, w, new THREE.Vector3());
      const dmg = w.w.dmg * mul * npcMul;
      if (w.w.kind === 'bolt') {
        if (w.w.spread) { dir.x += (Math.random() - 0.5) * w.w.spread; dir.y += (Math.random() - 0.5) * w.w.spread; dir.z += (Math.random() - 0.5) * w.w.spread; dir.normalize(); }
        this.bolts.push({ pos: from, vel: dir.multiplyScalar(w.w.speed).add(ship.vel), life: w.w.range / w.w.speed, dmg, w: w.w, owner: ship, color: w.w.color, width: (w.w.big ? 1.3 : 0.5) * Math.sqrt(mul), len: w.w.big ? 9 : 16 + mul * 5 });
      } else if (w.w.kind === 'rail') {
        const hit = this.raycastShips(from, dir, w.w.range, ship);
        const end = hit ? hit.point : from.clone().addScaledVector(dir, w.w.range);
        FX.beam(from, end, w.w.color, 0.6 * Math.sqrt(mul), 0.3);
        if (hit) this.hitShip(hit.ship, dmg, w.w, ship, hit.point);
      } else if (w.w.kind === 'missile') this.launchMissile(ship, from, dmg, w.w);
      fired = true;
      if (ship.isPlayer || ship.pos.distanceToSquared(this.focus) < 2500 * 2500) sfx.shot(w.id, ship.isPlayer ? 1 : 0.35 * clamp(1 - ship.pos.distanceTo(this.focus) / 2500, 0, 1));
      if (ship.isPlayer) this.game.net.shot(from, dir, w.id, mul);
    }
    return fired;
  }
  raycastShips(from, dir, range, owner) {
    const to = _a.copy(from).addScaledVector(dir, range);
    let best = null, bt = 2;
    for (const s of this.ships) {
      if (s === owner || s.dead) continue;
      const t = segSphere(from, to, s.pos, s.radius);
      if (t >= 0 && t < bt) { bt = t; best = s; }
    }
    return best ? { ship: best, point: from.clone().lerp(to, bt) } : null;
  }
  launchMissile(ship, from, dmg, w) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.2, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d0d4da', metalness: 0.7, roughness: 0.3 }));
    g.add(body);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffaa55', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    fl.position.z = -1.3; fl.scale.setScalar(4); g.add(fl);
    const m = { pos: from.clone(), vel: ship.forward.clone().multiplyScalar(ship.speed + 80), target: ship.target, owner: ship, dmg, w, life: 9, model: g, jam: false };
    anchor(g, m.pos);
    this.missiles.push(m);
  }
  hitShip(s, dmg, w, attacker, point) {
    if (s.dead) return;
    if (s.isRemote) { // 원격 플레이어: 피해 통보만
      if (attacker && attacker.isPlayer && this.sys.sec <= 1) this.game.net.hit(s.id, dmg, w ? w.shield : 1, w ? w.hull : 1);
      FX.hitSpark(point || s.pos, true);
      return;
    }
    const hadShield = s.shield > 0;
    if (attacker && attacker.isPlayer) this.onPlayerAttack(s);
    if (attacker && s.isPlayer) { this.game.onPlayerHit(attacker); }
    const res = s.damage(dmg, w, attacker);
    FX.hitSpark(point || s.pos, hadShield, null);
    if (s.isPlayer || (attacker && attacker.isPlayer)) sfx.hit(hadShield, s.isPlayer ? 1 : 0.5);
    if (res === 'dead') this.kill(s, attacker);
    else if (s.brain && attacker && !this.playerSide(s) && s.brain.role !== 'trader' && s.brain.role !== 'miner' && attacker !== s) {
      if (!s.brain.target || Math.random() < 0.3) { s.brain.target = attacker; if (this.hostile(s, attacker)) s.brain.state = 'fight'; }
    }
  }
  onPlayerAttack(s) {
    if (!s.brain) return;
    this.firedAt.add(s.id);
    const role = s.brain.role;
    const lawfulTarget = role === 'trader' || role === 'miner' || role === 'police' || role === 'patrol' || role === 'explorer' || role === 'hunter';
    if (!lawfulTarget || s.brain.convoy) return;
    if (this.hostile(s, this.player)) return; // 정당방위
    if (s.aggressors.has(this.player.id)) return;
    const sf = this.sys.faction;
    if (this.sys.sec >= 1 && LAWFUL.includes(sf)) {
      addBounty(sf, 400);
      this.game.msg(`범죄 기록: 폭행 — ${FACTIONS[sf].short} 현상금 +400 Cr`, 'bad');
    }
    addRep(s.faction, -3);
    // 주변 보안군 대응
    for (const o of this.ships) if (o.brain && (o.brain.role === 'police' || o.brain.role === 'patrol') && o.pos.distanceTo(s.pos) < 8000) o.aggressors.add(this.player.id);
  }
  kill(s, attacker) {
    s.dead = true;
    FX.explosion(s.pos, Math.max(0.6, s.spec.size / 16), s.vel);
    const near = s.pos.distanceTo(this.focus);
    if (near < 12000) sfx.boom(Math.min(2, s.spec.size / 18), clamp(1.2 - near / 10000, 0.1, 1));
    // 화물 투하
    for (const k in s.cargo) if (s.cargo[k] > 0 && Math.random() < 0.75) this.dropCan(s.pos, k, Math.max(1, Math.round(s.cargo[k] * R.range(0.3, 0.8))), s.vel.clone().multiplyScalar(0.3).add(R.dir(new THREE.Vector3()).multiplyScalar(20)));
    if (!s.isPlayer && Math.random() < 0.6) this.dropCan(s.pos, R.chance(0.15) ? 'blackbox' : 'scrap', R.int(1, 4), s.vel.clone().multiplyScalar(0.3).add(R.dir(new THREE.Vector3()).multiplyScalar(20)));
    if (s.isPlayer) { this.game.onPlayerDeath(attacker); return; }
    const byPlayerSide = attacker && this.playerSide(attacker);
    if (byPlayerSide) this.game.onKill(s, attacker);
  }

  // ------------------------------------------------------------
  //  소행성
  // ------------------------------------------------------------
  updateRocks(f, dt, force) {
    const near = f.pos.distanceTo(E.origin) < f.radius + 60000;
    f.model.visible = near;
    if (!near && !force) return;
    const m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const r of f.rocks) {
      if (dt) { q.setFromAxisAngle(r.spin, r.spd * dt); r.quat.multiply(q); }
      const sc = r.amount <= 0 ? 0.0001 : r.r * (0.4 + 0.6 * r.amount / r.max);
      r.cr = sc;
      m.compose(r.local, r.quat, s.set(sc, sc, sc));
      r.mesh.setMatrixAt(r.idx, m);
    }
    for (const im of f.model.userData.meshes) im.instanceMatrix.needsUpdate = true;
  }
  rockHit(from, to) {
    let best = null, bt = 2;
    for (const f of this.fields) {
      if (f.pos.distanceTo(from) > f.radius + 3500) continue;
      for (const r of f.rocks) {
        if (r.amount <= 0) continue;
        const t = segSphere(from, to, r.pos, r.cr * 0.92);
        if (t >= 0 && t < bt) { bt = t; best = r; }
      }
    }
    return best ? { rock: best, t: bt } : null;
  }
  doBeams(ship, dt) {
    const beamsW = ship.weapons.filter((w) => w.w.kind === 'beam');
    if (!beamsW.length || !ship.ctrl.fire1) { ship.mining = null; return; }
    let hitRock = null;
    for (const w of beamsW) {
      const mul = SIZE_MUL[w.size];
      const cost = w.w.energy * mul * dt * (ship.isPlayer ? 1 : 0.3);
      if (ship.energy < cost) continue;
      ship.energy -= cost;
      const from = this.gunPos(ship, w, new THREE.Vector3());
      const dir = ship.forward.clone();
      const to = from.clone().addScaledVector(dir, w.w.range);
      const rh = this.rockHit(from, to);
      const sh = this.raycastShips(from, dir, w.w.range, ship);
      let end = to;
      if (rh && (!sh || from.distanceTo(sh.point) > rh.t * w.w.range)) {
        end = from.clone().lerp(to, rh.t);
        const rk = rh.rock;
        const rate = w.w.mine * mul * 0.55 * (ship.stats.refinery ? 1.6 : 1);
        rk.amount = Math.max(0, rk.amount - rate * dt * 1.4);
        ship.mineAcc = (ship.mineAcc || 0) + rate * dt;
        hitRock = rk;
        if (Math.random() < dt * 30) FX.mineSpark(end, GOODS[rk.ore].color);
        while (ship.mineAcc >= 1) {
          ship.mineAcc -= 1;
          if (ship.addCargo(rk.ore, 1)) { if (ship.isPlayer) this.game.onMined(rk.ore); }
          else if (ship.isPlayer) { this.game.msg('화물칸이 가득 찼습니다', 'warn'); ship.mineAcc = 0; }
        }
        if (rk.amount <= 0 && ship.isPlayer) { this.game.msg('소행성 고갈', 'info'); FX.explosion(rk.pos, rk.r / 60); }
      } else if (sh) {
        end = sh.point;
        if (Math.random() < dt * 4) this.hitShip(sh.ship, w.w.dmg * mul * 0.25, w.w, ship, end);
      }
      FX.beam(from, end, w.w.color, 0.35 * Math.sqrt(mul));
    }
    ship.mining = hitRock;
    if (ship.isPlayer) sfx.beam(!!hitRock);
  }

  // ------------------------------------------------------------
  //  NPC 생태계 감독
  // ------------------------------------------------------------
  director(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 2.5;
    const p = this.focus;
    const sys = this.sys;
    const near = (r) => this.ships.filter((s) => !s.dead && !s.isPlayer && !s.isRemote && s.pos.distanceTo(p) < r);
    // 멀리 있는 NPC 정리
    for (const s of this.ships) if (s.brain && s.brain.role !== 'wing' && s.pos.distanceTo(p) > 70000) { s.dead = true; s.gone = true; }
    const local = near(45000);
    const count = (role) => local.filter((s) => s.brain.role === role).length;
    const st = this.nearestStation(p);
    const stD = st ? st.pos.distanceTo(p) : Infinity;
    const f = this.nearestField(p);
    const fD = f ? f.pos.distanceTo(p) : Infinity;
    const lawful = sys.faction !== 'pirate';
    const sec = sys.sec;
    const busy = sys.pop;
    if (this.player && this.player.cruise === 2) return; // 크루즈 중엔 스폰 보류
    // 스테이션 주변 교통
    if (st && stD < 30000 && lawful) {
      if (count('trader') < Math.round(2 + busy * 4) && Math.random() < 0.5) {
        const s = this.spawnNPC(R.chance(0.15) ? 'explorer' : 'trader', st.entrance.clone(), { home: st, lookAt: st.approach });
        s.vel.copy(st.face).multiplyScalar(120); s.brain.home = st;
        s.brain.state = 'idle';
      }
      if (count('police') < Math.round(sec * 1.5) && Math.random() < 0.4) this.spawnNPC('police', st.approach.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(1500)), { home: st });
      if (st.data.faction === 'pirate' && count('pirate') < 3) this.spawnNPC('pirate', st.entrance.clone(), { lookAt: st.approach });
    }
    // 도착하는 교통 (워프 인)
    if (lawful && count('trader') < Math.round(1 + busy * 2) && Math.random() < 0.15 && st && stD < 60000) {
      const pos = st.approach.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(R.range(4000, 9000)));
      const s = this.spawnNPC('trader', pos, { jumpIn: pos.distanceTo(p) < 8000, lookAt: st.approach });
      s.brain.dest = st; s.brain.state = 'travel';
    }
    // 소행성대
    if (f && fD < f.radius + 25000) {
      if (count('miner') < 2 + (sec >= 2 ? 1 : 0) && Math.random() < 0.4 && lawful) {
        const pos = f.pos.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(f.radius * 0.7));
        const s = this.spawnNPC('miner', pos, { jumpIn: pos.distanceTo(p) < 6000, home: st });
        s.brain.field = f; s.brain.state = 'mine';
      }
      const want = [3, 2, 1, 0.5][sec] * (sys.faction === 'pirate' ? 1.5 : 1);
      if (count('pirate') < want && Math.random() < 0.25) {
        const pos = p.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(R.range(3000, 6000)));
        const n = sec <= 1 && R.chance(0.4) ? R.int(2, 3) : 1;
        for (let i = 0; i < n; i++) this.spawnNPC('pirate', pos.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(150)), { jumpIn: true, lookAt: p });
      }
    }
    // 심우주 순찰 · 해적
    if (Math.random() < 0.05 && count('pirate') < 1 && sec <= 2 && this.player) {
      const pos = p.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(R.range(4000, 8000)));
      this.spawnNPC('pirate', pos, { jumpIn: true, lookAt: p });
    }
    if (lawful && sec >= 1 && count('patrol') < 1 && Math.random() < 0.06) {
      const pos = p.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(R.range(4000, 9000)));
      for (let i = 0; i < R.int(1, 2); i++) this.spawnNPC('patrol', pos.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(100)), { jumpIn: true });
    }
    // 현상금 사냥꾼: 수배 중일 때
    const totalWanted = Object.values(S.save.wanted).reduce((a, b) => a + b, 0);
    if (totalWanted > 1500 && count('hunter') < 2 && Math.random() < 0.06 + totalWanted / 200000) {
      const pos = p.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(R.range(3000, 5000)));
      this.spawnNPC('hunter', pos, { jumpIn: true, lookAt: p });
    }
    // 보안군: 수배 중 하이섹이면 증원
    if (lawful && isWanted(sys.faction) && sec >= 2 && count('police') < sec + 1 && Math.random() < 0.3) {
      const pos = p.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(R.range(2500, 4000)));
      this.spawnNPC('police', pos, { jumpIn: true, lookAt: p });
    }
    // 오래된 신호원 교체
    if (this.anoms.filter((a) => a.type !== 'mission').length < 3 && Math.random() < 0.1) this.spawnAnomaly(null, p);
  }

  // ------------------------------------------------------------
  //  메인 갱신
  // ------------------------------------------------------------
  update(dt) {
    this.time += dt;
    const P = this.player;
    if (P && !P.dead) this.focus.copy(P.pos);
    // AI · 물리
    for (const s of this.ships) {
      if (s.dead) continue;
      if (s.isRemote) { this.game.net.interp(s, dt); continue; }
      if (s.brain) control(this, s, dt);
      if (s.cruise) {
        const env = this.cruiseEnv(s);
        s.update(dt, env);
        if (s.cruise === 2 && !s.isPlayer && env.arriveDist !== undefined && env.arriveDist < 4000) this.dropCruise(s);
      } else s.update(dt, null);
      if (s.ctrl.fire1) this.fire(s, false);
      if (s.ctrl.fire2) this.fire(s, true);
      this.doBeams(s, dt);
      if (s.weapons.some((w) => w.w.kind === 'beam') === false) s.mining = null;
    }
    this.collisions(dt);
    this.updateBolts(dt);
    this.updateMissiles(dt);
    this.updateCans(dt);
    this.updateAnoms(dt);
    this.director(dt);
    this.policeScan(dt);
    this.interdiction(dt);
    // 제거
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i];
      if (s.dead && !s.isPlayer) {
        this.removeShipModel(s);
        this.ships.splice(i, 1); this.byId.delete(s.id);
        for (const o of this.ships) { if (o.target === s) o.target = null; if (o.brain && o.brain.target === s) o.brain.target = null; }
      }
    }
    // 애니메이션
    const t = this.time;
    for (const s of this.ships) {
      if (!s.model) continue;
      const d = s.pos.distanceTo(E.origin);
      s.model.visible = d < 30000 && !(s.isPlayer && s.dead);
      if (s.model.visible) s.syncModel(t);
      if (s.model.visible && d < 900 && (s.ctrl.throttle > 0.3 || s.boosting) && Math.random() < 0.5) {
        for (const e of s.model.userData.engines) FX.engineTrail(s.worldPoint(e.pos, _a), s.vel, e.color, e.r * 1.2);
      }
    }
    for (const pl of this.planets) {
      pl.model.userData.mesh.rotation.y += pl.model.userData.spin * dt * 0.1;
      pl.model.userData.surf.uniforms.uTime.value = t;
      pl.model.visible = true;
    }
    this.starModel.userData.mat.uniforms.uTime.value = t;
    { // 가까울수록 항성 광륜을 줄여 화면이 하얗게 날아가지 않도록
      const k = clamp((this.star.pos.distanceTo(E.origin) / this.star.radius - 1.5) / 8, 0.12, 1);
      this.starModel.children[1].material.opacity = 0.9 * k; this.starModel.children[2].material.opacity = 0.35 * k;
    }
    for (const st of this.stations) {
      const vis = st.pos.distanceTo(E.origin) < 120000;
      st.model.visible = vis;
      if (!vis) continue;
      for (const sp of st.model.userData.spinners) sp.rotation.z += (st.data.spin || 0.06) * dt;
      animateLights(st.model, t);
    }
    for (const f of this.fields) this.updateRocks(f, dt);
    for (const a of this.anoms) if (a.model) { a.model.rotation.y += dt * 0.02; animateLights(a.model, t); }
  }

  collisions(dt) {
    for (const s of this.ships) {
      if (s.dead || s.isRemote) continue;
      // 행성 · 항성
      for (const b of [this.star, ...this.planets]) {
        const d = s.pos.distanceTo(b.pos);
        const lim = b.radius * (b.kind === 'star' ? 1.05 : 1.0) + s.radius;
        if (d < lim) {
          _a.copy(s.pos).sub(b.pos).normalize();
          s.pos.copy(b.pos).addScaledVector(_a, lim + 1);
          const vn = s.vel.dot(_a);
          if (vn < 0) s.vel.addScaledVector(_a, -vn * 1.4);
          if (s.cruise === 2) { this.dropCruise(s); if (s.isPlayer) this.game.msg('비상 정지! 천체와 충돌할 뻔했습니다', 'bad'); s.damage(s.stats.hull * 0.15); }
          if (b.kind === 'star') s.damage(60 * dt * 10);
          else if (-vn > 40) this.hitShip(s, (-vn - 40) * 0.8, null, null, s.pos);
        }
        // 항성 열
        if (b.kind === 'star' && d < b.radius * 2.2 && s.isPlayer) { s.heat = (d - b.radius) / (b.radius * 1.2); if (s.stats.scoop && s.cruise !== 2) this.game.fuelScoop(dt, 1 - s.heat); }
      }
      // 스테이션
      for (const st of this.stations) {
        if (st.pos.distanceToSquared(s.pos) > 1500 * 1500) continue;
        for (const c of st.colliders) {
          const d = s.pos.distanceTo(c.p), lim = c.r + s.radius;
          if (d < lim) {
            _a.copy(s.pos).sub(c.p).normalize();
            s.pos.copy(c.p).addScaledVector(_a, lim);
            const vn = s.vel.dot(_a);
            if (vn < 0) { s.vel.addScaledVector(_a, -vn * 1.5); if (-vn > 30) this.hitShip(s, (-vn - 30) * 0.6, null, null, s.pos); }
          }
        }
      }
      // 소행성
      for (const f of this.fields) {
        if (f.pos.distanceTo(s.pos) > f.radius + 300) continue;
        for (const r of f.rocks) {
          if (r.amount <= 0) continue;
          const lim = r.cr * 0.9 + s.radius;
          const dx = s.pos.x - r.pos.x, dy = s.pos.y - r.pos.y, dz = s.pos.z - r.pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < lim * lim) {
            const d = Math.sqrt(d2);
            _a.set(dx / d, dy / d, dz / d);
            s.pos.copy(r.pos).addScaledVector(_a, lim);
            const vn = s.vel.dot(_a);
            if (vn < 0) { s.vel.addScaledVector(_a, -vn * 1.4); if (-vn > 35) this.hitShip(s, (-vn - 35) * 0.5, null, null, s.pos); }
            if (s.cruise === 2) this.dropCruise(s);
          }
        }
      }
    }
    // 함선끼리
    const ss = this.ships;
    for (let i = 0; i < ss.length; i++) {
      const a = ss[i]; if (a.dead || a.isRemote) continue;
      for (let j = i + 1; j < ss.length; j++) {
        const b = ss[j]; if (b.dead || b.isRemote) continue;
        if ((a.cruise === 2) !== (b.cruise === 2)) continue;
        const lim = a.radius + b.radius;
        const d2 = a.pos.distanceToSquared(b.pos);
        if (d2 < lim * lim && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          _a.copy(a.pos).sub(b.pos).divideScalar(d);
          const push = (lim - d) / 2;
          a.pos.addScaledVector(_a, push); b.pos.addScaledVector(_a, -push);
          const rv = _b.copy(a.vel).sub(b.vel).dot(_a);
          if (rv < 0) {
            const ma = a.spec.mass, mb = b.spec.mass;
            a.vel.addScaledVector(_a, -rv * mb / (ma + mb) * 1.3); b.vel.addScaledVector(_a, rv * ma / (ma + mb) * 1.3);
            if (-rv > 50) { this.hitShip(a, (-rv - 50) * 0.3 * mb, null, null, a.pos); this.hitShip(b, (-rv - 50) * 0.3 * ma, null, null, b.pos); }
          }
        }
      }
    }
  }

  updateBolts(dt) {
    const out = [];
    for (const b of this.bolts) {
      b.life -= dt;
      if (b.life <= 0) continue;
      const from = _a.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      let hit = false;
      for (const s of this.ships) {
        if (s === b.owner || s.dead || (s.cruise === 2)) continue;
        if (Math.abs(s.pos.x - b.pos.x) > 400 || Math.abs(s.pos.z - b.pos.z) > 400) continue;
        const t = segSphere(from, b.pos, s.pos, s.radius);
        if (t >= 0) { if (b.visual) FX.hitSpark(from.clone().lerp(b.pos, t), s.shield > 0); else this.hitShip(s, b.dmg, b.w, b.owner, from.clone().lerp(b.pos, t)); hit = true; break; }
      }
      if (!hit) {
        const rh = this.rockHit(from, b.pos);
        if (rh) { FX.hitSpark(from.clone().lerp(b.pos, rh.t), false); hit = true; }
      }
      if (!hit) for (const st of this.stations) {
        if (st.pos.distanceToSquared(b.pos) > 1400 * 1400) continue;
        for (const c of st.colliders) if (c.p.distanceToSquared(b.pos) < c.r * c.r) { FX.hitSpark(b.pos, true); hit = true; break; }
        if (hit) break;
      }
      if (!hit) out.push(b);
    }
    this.bolts = out;
    FX.drawBolts(this.bolts);
  }
  updateMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      const t = m.target;
      if (t && !t.dead && !m.jam) {
        const lp = leadPoint(m.pos, m.vel, t.pos, t.vel, m.w.speed, _a);
        _b.copy(lp).sub(m.pos).normalize();
        const cur = _c.copy(m.vel).normalize();
        cur.lerp(_b, Math.min(1, dt * 2.6)).normalize();
        const sp = Math.min(m.w.speed, m.vel.length() + 400 * dt);
        m.vel.copy(cur).multiplyScalar(sp);
        if (t.stats && t.stats.ecm && t.pos.distanceTo(m.pos) < 700 && !m.ecmChecked) { m.ecmChecked = true; if (Math.random() < 0.6) { m.jam = true; if (t.isPlayer) this.game.msg('ECM: 미사일 교란 성공', 'good'); } }
      } else m.vel.multiplyScalar(1 + dt * 0.2);
      const from = _a.copy(m.pos);
      m.pos.addScaledVector(m.vel, dt);
      m.model.quaternion.setFromUnitVectors(_z, _b.copy(m.vel).normalize());
      if (Math.random() < 0.9) FX.emit(m.pos.x, m.pos.y, m.pos.z, 0, 0, 0, 0.9, 2.2, 0.5, 0.42, 0.4, 0.5, 4);
      let boom = m.life <= 0;
      if (!boom) for (const s of this.ships) {
        if (s === m.owner || s.dead) continue;
        const tt = segSphere(from, m.pos, s.pos, s.radius + 10);
        if (tt >= 0) { this.hitShip(s, m.dmg, m.w, m.owner, m.pos); boom = true; break; }
      }
      if (boom) {
        FX.explosion(m.pos, 0.5, m.vel.clone().multiplyScalar(0.1));
        if (m.pos.distanceTo(this.focus) < 4000) sfx.boom(0.4, 0.6);
        unanchor(m.model);
        this.missiles.splice(i, 1);
      }
    }
  }
  updateCans(dt) {
    const P = this.player;
    for (let i = this.cans.length - 1; i >= 0; i--) {
      const c = this.cans[i];
      c.life -= dt;
      c.vel.multiplyScalar(Math.exp(-0.3 * dt));
      c.pos.addScaledVector(c.vel, dt);
      c.model.rotation.x += c.spin.x * dt; c.model.rotation.y += c.spin.y * dt;
      let take = false;
      if (P && !P.dead) {
        const d = c.pos.distanceTo(P.pos);
        // 화물 스쿠프: 저속에서 자동 회수 (가까우면 끌어당김)
        if (d < 120 && P.speed < 160 && P.cruise === 0) {
          c.vel.lerp(_a.copy(P.pos).sub(c.pos).normalize().multiplyScalar(60).add(P.vel), Math.min(1, dt * 3));
          if (d < P.radius + 6) {
            const got = P.addCargo(c.item, c.qty);
            if (got > 0) { this.game.onScoop(c.item, got, c); c.qty -= got; if (c.qty <= 0) take = true; }
            else if (!c.warned) { c.warned = true; this.game.msg('화물칸이 가득 차 회수할 수 없습니다', 'warn'); }
          }
        }
      }
      if (take || c.life <= 0) {
        unanchor(c.model); this.cans.splice(i, 1);
        if (P && P.target === c) P.target = null;
      }
    }
  }
  updateAnoms(dt) {
    for (let i = this.anoms.length - 1; i >= 0; i--) {
      const a = this.anoms[i];
      a.ttl -= dt;
      const d = a.pos.distanceTo(this.focus);
      if (!a.triggered && d < 3500) this.triggerAnom(a);
      if (a.type === 'distress' && a.triggered && !a.done && a.victim) {
        const pirates = this.ships.filter((s) => s.brain && s.brain.role === 'pirate' && s.pos.distanceTo(a.pos) < 6000 && !s.dead);
        if (!pirates.length && !a.victim.dead && this.player && a.victim.pos.distanceTo(this.player.pos) < 8000) {
          a.done = true;
          const reward = R.int(4, 12) * 1000;
          this.game.comms(a.victim, `고마워, 은인! 약소하지만 ${reward.toLocaleString()} Cr 보낼게.`);
          this.game.reward(reward, '구조 사례금');
          addRep(a.victim.faction, 3);
          a.victim.brain.state = 'idle';
        } else if (a.victim.dead && !a.done) { a.done = true; }
      }
      if (a.ttl <= 0 && d > 20000) this.removeAnom(a);
    }
  }
  policeScan(dt) {
    const P = this.player;
    if (!P || P.dead || P.cruise) return;
    this.scanT = Math.max(0, this.scanT - dt);
    if (this.scanT > 0) return;
    const illegal = Object.keys(P.cargo).filter((k) => GOODS[k].illegal || (GOODS[k].illegalIn || []).includes(this.sys.faction));
    if (!illegal.length) { this.scanT = 2; return; }
    const cop = this.ships.find((s) => s.brain && (s.brain.role === 'police' || s.brain.role === 'patrol') && s.pos.distanceTo(P.pos) < 1200);
    if (!cop) { this.scanT = 1; return; }
    P.scanned = (P.scanned || 0) + 1;
    if (P.scanned === 1) { this.game.msg('보안군이 화물을 스캔하고 있습니다...', 'warn'); this.scanT = 4; return; }
    P.scanned = 0;
    this.scanT = 240;
    let fine = 0;
    for (const k of illegal) { fine += GOODS[k].base * P.cargo[k]; P.removeCargo(k, P.cargo[k]); }
    fine = Math.round(fine * 0.5);
    addBounty(this.sys.faction, fine);
    this.game.comms(cop, `불법 화물 적발! 압수 처리하고 벌금 ${fine.toLocaleString()} Cr을 부과한다.`);
    this.game.msg(`밀수 적발 — 화물 압수, ${FACTIONS[this.sys.faction].short} 현상금 +${fine.toLocaleString()} Cr`, 'bad');
  }
  interdiction(dt) {
    const P = this.player;
    if (!P || P.cruise !== 2 || this.sys.sec >= 2) { this.interdictT = Math.max(this.interdictT, 20); return; }
    this.interdictT -= dt;
    if (this.interdictT > 0) return;
    this.interdictT = R.range(60, 140) * (this.sys.sec + 1);
    const valuable = P.cargoUsed() > 0 || Object.values(S.save.wanted).some((v) => v > 0);
    if (!valuable && Math.random() < 0.6) return;
    if ((S.save.rep.pirate || 0) >= 25) return;
    this.dropCruise(P);
    P.vel.copy(P.forward).multiplyScalar(250);
    this.game.msg('⚠ 인터딕션! 크루즈 드라이브가 강제로 해제되었습니다', 'bad');
    sfx.alarm();
    const n = R.int(1, this.sys.sec === 0 ? 3 : 2);
    for (let i = 0; i < n; i++) {
      const pos = P.pos.clone().addScaledVector(P.forward, -R.range(800, 1500)).add(R.dir(new THREE.Vector3()).multiplyScalar(300));
      const s = this.spawnNPC(R.chance(0.2) && Object.values(S.save.wanted).some((v) => v > 0) ? 'hunter' : 'pirate', pos, { jumpIn: true, lookAt: P.pos });
      s.brain.target = P; s.brain.state = 'fight';
    }
  }
}

export { PLANET_KINDS, mulberry32 };
