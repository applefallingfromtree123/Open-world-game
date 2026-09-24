// ============================================================
//  NEON//VOID — 권위 서버 시뮬레이션
// ============================================================
import crypto from 'crypto';
import { generateWorld, worldForClient } from './world.js';
import {
  TICK_RATE, AOI_RADIUS, GALAXY_RADIUS, SYSTEM_RADIUS, START_CREDITS, CLAN_CREATE_COST, MAX_MISSIONS,
  DOCK_RANGE, INTERACT_RANGE, LOOT_PICKUP_RANGE, SCAN_RANGE, SCAN_COOLDOWN,
  WEAPONS, SHIPS, SHIP_ORDER, NPCS, ITEMS, MARKET_ITEMS, STATION_TYPES, pvpAllowed, secLabel,
} from '../public/shared/data.js';
import { K, WARP, stepShip, angDiff, clamp, dist2, bodyPos } from '../public/shared/physics.js';

const EPOCH = 1.7e9;
const now = () => Date.now() / 1000;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const r1 = (v) => Math.round(v * 10) / 10;
const NAME_RE = /^[A-Za-z0-9가-힣_\-]{2,16}$/;
const TAG_RE = /^[A-Z0-9]{2,5}$/;
const NEON = ['#00f0ff', '#ff2bd6', '#ffe600', '#7dff5a', '#ff8a00', '#b18cff', '#00ffa3', '#ff3b6b', '#3bb0ff'];

function scryptAsync(pass, salt) {
  return new Promise((res, rej) => crypto.scrypt(pass, salt, 32, (e, k) => (e ? rej(e) : res(k.toString('hex')))));
}
function cargoUsed(acct) {
  let n = 0;
  for (const k in acct.cargo) n += acct.cargo[k];
  return n;
}

export class Game {
  constructor(store) {
    this.store = store;
    this.world = generateWorld();
    this.clientWorld = worldForClient(this.world);
    this.sysById = Object.fromEntries(this.world.systems.map((s) => [s.id, s]));
    this.stById = Object.fromEntries(this.world.stations.map((s) => [s.id, s]));
    this.beltById = Object.fromEntries(this.world.belts.map((b) => [b.id, b]));
    this.beaconById = Object.fromEntries(this.world.beacons.map((b) => [b.id, b]));

    this.accounts = {};
    this.clans = {};
    this.sov = {};
    this.markets = {};
    this.boards = {};
    this.chatLog = [];

    this.conns = new Set();
    this.players = new Map();
    this.npcs = new Map();
    this.projectiles = [];
    this.loots = new Map();
    this.anomalies = new Map();
    this.fx = [];
    this.nid = 1;
    this.astAmt = this.world.asteroids.map((a) => a.max);
    this.astRespawn = new Map();
    this.spawnSlots = [];
    this.lastSlow = 0;
    this.lastInfo = 0;
    this.lastMarket = 0;
    this.lastSave = now();
    this.startedAt = now();
  }

  time() { return now() - EPOCH; }
  id(prefix) { return prefix + (this.nid++).toString(36); }

  // ------------------------------------------------------------
  //  초기화 / 저장
  // ------------------------------------------------------------
  async init() {
    const saved = await this.store.load();
    if (saved) {
      this.accounts = saved.accounts || {};
      this.clans = saved.clans || {};
      this.sov = saved.sov || {};
      this.markets = saved.markets || {};
      console.log(`[game] 불러옴: 계정 ${Object.keys(this.accounts).length}, 클랜 ${Object.keys(this.clans).length}`);
    }
    for (const st of this.world.stations) if (!this.markets[st.id]) this.markets[st.id] = this.makeMarket(st);
    for (const b of this.world.beacons) if (!this.sov[b.id]) this.sov[b.id] = { owner: null, prog: 0, cap: null };
    this.setupSpawns();
    for (let i = 0; i < 55; i++) this.spawnAnomaly();
  }

  serialize() {
    for (const p of this.players.values()) this.persistPlayer(p);
    return { v: 1, accounts: this.accounts, clans: this.clans, sov: this.sov, markets: this.markets };
  }
  async save() { await this.store.save(this.serialize()); }

  persistPlayer(p) {
    const a = p.acct;
    const ship = a.ships.find((s) => s.id === a.active);
    if (ship && !p.dead) ship.hp = Math.max(1, Math.round(p.hull));
    if (p.dead) a.pos = { docked: a.home };
    else if (p.docked) a.pos = { docked: p.docked };
    else a.pos = { x: Math.round(p.x), y: Math.round(p.y) };
    a.lastSeen = Date.now();
  }

  // ------------------------------------------------------------
  //  네트워크
  // ------------------------------------------------------------
  onConnect(ws, ip) {
    const conn = { ws, ip, player: null, acct: null, msgs: 0, msgWindow: now(), lastChat: 0, lastLb: 0 };
    this.conns.add(conn);
    ws.on('message', (data) => {
      const t = now();
      if (t - conn.msgWindow > 1) { conn.msgWindow = t; conn.msgs = 0; }
      if (++conn.msgs > 80) return;
      if (data.length > 4096) return;
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      try { this.handle(conn, msg); } catch (e) { console.error('[game] 메시지 처리 오류', msg.t, e); }
    });
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => {});
  }

  onClose(conn) {
    this.conns.delete(conn);
    const p = conn.player;
    if (p) {
      this.persistPlayer(p);
      this.players.delete(p.id);
      this.broadcastClan(p.acct.clan);
      this.sysChat(`${p.name} 님이 접속을 종료했습니다.`, 'local', p);
    }
  }

  send(conn, obj) {
    if (conn && conn.ws.readyState === 1) conn.ws.send(JSON.stringify(obj));
  }
  toast(p, msg, kind = 'info') { this.send(p.conn, { t: 'toast', msg, kind }); }
  err(conn, msg) { this.send(conn, { t: 'toast', msg, kind: 'err' }); }

  handle(conn, m) {
    if (m.t === 'ping') return this.send(conn, { t: 'pong', c: m.c, st: this.time() });
    if (m.t === 'login') return this.login(conn, m);
    if (m.t === 'resume') return this.resume(conn, m);
    const p = conn.player;
    if (!p) return;
    switch (m.t) {
      case 'in': {
        p.keys = (m.k | 0) & 63;
        if (Number.isFinite(m.a)) p.aim = clamp(m.a, -7, 7);
        if (p.keys & (K.UP | K.DOWN | K.LEFT | K.RIGHT)) if (p.ap) { p.ap = null; }
        break;
      }
      case 'act': return this.action(p, m);
      case 'chat': return this.chat(p, m);
      case 'buy': return this.marketBuy(p, m.item, m.qty | 0);
      case 'sell': return this.marketSell(p, m.item, m.qty | 0);
      case 'buyShip': return this.buyShip(p, m.type);
      case 'sellShip': return this.sellShip(p, m.id | 0);
      case 'switchShip': return this.switchShip(p, m.id | 0);
      case 'repair': return this.repair(p);
      case 'insure': return this.insure(p, m.id | 0);
      case 'mission': return this.missionAction(p, m);
      case 'clan': return this.clanAction(p, m);
      case 'jettison': return this.jettison(p, m.item, m.qty | 0);
      case 'lb': return this.leaderboard(conn);
      case 'ap': return m.nearest ? this.apNearestStation(p) : this.setAutopilot(p, m);
    }
  }

  async login(conn, m) {
    if (conn.player || conn.busy) return;
    const name = String(m.name || '').trim();
    const pass = String(m.pass || '');
    if (!NAME_RE.test(name)) return this.send(conn, { t: 'loginErr', msg: '파일럿 이름은 2~16자 (한글/영문/숫자/_-) 여야 합니다.' });
    if (pass.length < 4 || pass.length > 64) return this.send(conn, { t: 'loginErr', msg: '비밀번호는 4~64자여야 합니다.' });
    const key = name.toLowerCase();
    conn.busy = true;
    try {
      let acct = this.accounts[key];
      if (acct) {
        const h = await scryptAsync(pass, acct.salt);
        if (h !== acct.hash) return this.send(conn, { t: 'loginErr', msg: '비밀번호가 올바르지 않습니다.' });
      } else {
        if (m.mode !== 'register' && m.mode !== 'auto') return this.send(conn, { t: 'loginErr', msg: '존재하지 않는 파일럿입니다. 신규 등록을 눌러주세요.' });
        const salt = crypto.randomBytes(12).toString('hex');
        acct = this.newAccount(name, salt, await scryptAsync(pass, salt));
        this.accounts[key] = acct;
        console.log('[game] 신규 파일럿', name);
      }
      acct.token = crypto.randomBytes(18).toString('hex');
      this.enter(conn, acct);
    } finally { conn.busy = false; }
  }

  resume(conn, m) {
    if (conn.player) return;
    const name = String(m.name || '').toLowerCase();
    const acct = this.accounts[name];
    if (!acct || !acct.token || typeof m.token !== 'string' || acct.token !== m.token) return this.send(conn, { t: 'loginErr', msg: '', silent: true });
    this.enter(conn, acct);
  }

  newAccount(name, salt, hash) {
    return {
      name, salt, hash, token: null, created: Date.now(), lastSeen: Date.now(),
      credits: START_CREDITS, ships: [{ id: 1, type: 'shuttle', hp: SHIPS.shuttle.hull, ins: false }], active: 1, nextShip: 2,
      cargo: {}, pos: { docked: 'st0' }, home: 'st0', clan: null, missions: [],
      stats: { kills: 0, deaths: 0, pve: 0, mined: 0, earned: 0, explored: 0, trades: 0 },
      discovered: ['s0'], tutorial: true,
    };
  }

  enter(conn, acct) {
    // 중복 접속 처리
    for (const p of this.players.values()) {
      if (p.acct === acct) {
        this.send(p.conn, { t: 'kicked', msg: '다른 곳에서 같은 파일럿으로 접속했습니다.' });
        p.conn.ws.close();
        this.persistPlayer(p);
        this.players.delete(p.id);
        p.conn.player = null;
      }
    }
    if (acct.clan && !this.clans[acct.clan]) acct.clan = null;
    const p = this.createPlayer(conn, acct);
    conn.player = p;
    conn.acct = acct;
    this.players.set(p.id, p);
    this.send(conn, {
      t: 'welcome', id: p.id, token: acct.token, name: acct.name, st: this.time(), build: this.build,
      world: this.clientWorld, chat: this.chatLog.slice(-40),
    });
    this.sendAcct(p);
    this.sendInfo(conn);
    if (p.docked) this.sendStation(p);
    this.broadcastClan(acct.clan);
    if (acct.tutorial) {
      acct.tutorial = false;
      const tips = [
        [0, 'NEON//VOID에 오신 것을 환영합니다, 파일럿. [H] 키로 조작법을 확인하세요.'],
        [6, '① [임무 게시판]에서 배송 임무를 받아보세요 — 초반 돈벌이에 최고!'],
        [14, '② [출항] 후 M 은하지도에서 목적지를 더블클릭하면 오토파일럿이 워프로 데려다줍니다.'],
        [22, '③ 소행성대에서 F로 채굴, R로 이상 신호 스캔. 로우섹(주황·빨강)은 위험하지만 보상이 큽니다!'],
      ];
      for (const [d, msg] of tips) setTimeout(() => { if (p.conn.player === p) this.toast(p, msg, 'good'); }, d * 1000);
    }
    this.sysChat(`${acct.name} 님이 접속했습니다.`, 'local', p);
  }

  createPlayer(conn, acct) {
    let ship = acct.ships.find((s) => s.id === acct.active);
    if (!ship) { ship = this.ensureShuttle(acct); acct.active = ship.id; }
    const spec = SHIPS[ship.type];
    const p = {
      id: this.id('p'), conn, acct, name: acct.name, type: ship.type, spec,
      x: 0, y: 0, vx: 0, vy: 0, a: 0, hull: Math.min(spec.hull, ship.hp || spec.hull), shield: spec.shield, energy: spec.energy,
      keys: 0, aim: 0, warp: WARP.NONE, warpT: 0, docked: null, cds: [], mining: -1, mineAcc: 0,
      ap: null, apKeys: 0, apAim: 0, crimUntil: 0, lastHitT: 0, lastHitBy: null, sys: null, sec: 1, dead: false, respawnAt: 0,
      hack: null, hackT: 0, scanCd: 0, scanned: new Map(), boosting: false, dirty: true, sysCheck: 0,
    };
    const pos = acct.pos || { docked: 'st0' };
    if (pos.docked && this.stById[pos.docked]) {
      p.docked = pos.docked;
      const sp = bodyPos(this.stById[p.docked], this.world.bodies, this.time());
      p.x = sp.x; p.y = sp.y;
    } else if (Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      p.x = pos.x; p.y = pos.y;
    } else {
      p.docked = acct.home in this.stById ? acct.home : 'st0';
    }
    this.updateSystem(p, true);
    return p;
  }

  ensureShuttle(acct) {
    let s = acct.ships.find((x) => x.type === 'shuttle');
    if (!s) { s = { id: acct.nextShip++, type: 'shuttle', hp: SHIPS.shuttle.hull, ins: false }; acct.ships.push(s); }
    return s;
  }

  acctPayload(p) {
    const a = p.acct;
    return {
      t: 'acct', name: a.name, credits: Math.floor(a.credits), ships: a.ships, active: a.active,
      cargo: a.cargo, cargoUsed: cargoUsed(a), cargoCap: p.spec.cargo, missions: a.missions,
      stats: a.stats, clan: a.clan, home: a.home, discovered: a.discovered,
    };
  }
  sendAcct(p) { p.dirty = false; this.send(p.conn, this.acctPayload(p)); }

  sendInfo(conn) {
    const clans = {};
    for (const tag in this.clans) clans[tag] = { name: this.clans[tag].name, color: this.clans[tag].color };
    this.send(conn, { t: 'info', online: this.players.size, sov: this.sov, clans });
  }

  // ------------------------------------------------------------
  //  플레이어 행동
  // ------------------------------------------------------------
  action(p, m) {
    if (p.dead) return;
    switch (m.a) {
      case 'dock': return this.tryDock(p);
      case 'undock': return this.undock(p);
      case 'warp': return this.toggleWarp(p);
      case 'mine': return this.toggleMine(p);
      case 'scan': return this.scan(p);
      case 'interact': return this.interact(p);
    }
  }

  tryDock(p) {
    if (p.docked) return;
    if (p.warp === WARP.ACTIVE) return this.err(p.conn, '워프 중에는 도킹할 수 없습니다.');
    const t = this.time();
    let best = null, bd = Infinity;
    for (const st of this.world.stations) {
      if (st.sys !== p.sys) continue;
      const sp = bodyPos(st, this.world.bodies, t);
      const d = Math.hypot(sp.x - p.x, sp.y - p.y);
      if (d < bd) { bd = d; best = st; }
    }
    if (!best || bd > DOCK_RANGE) return this.err(p.conn, '도킹 가능한 스테이션이 범위 밖에 있습니다.');
    this.dock(p, best);
  }

  dock(p, st) {
    p.docked = st.id;
    p.warp = WARP.NONE; p.ap = null; p.mining = -1; p.hack = null;
    p.vx = 0; p.vy = 0;
    p.shield = p.spec.shield;
    p.acct.home = st.id;
    this.persistPlayer(p);
    this.sendAcct(p);
    this.sendStation(p);
    this.toast(p, `${st.name}에 도킹했습니다.`, 'good');
  }

  undock(p) {
    if (!p.docked) return;
    const st = this.stById[p.docked];
    const sp = bodyPos(st, this.world.bodies, this.time());
    const ang = Math.random() * Math.PI * 2;
    p.x = sp.x + Math.cos(ang) * 260; p.y = sp.y + Math.sin(ang) * 260;
    p.vx = Math.cos(ang) * 200; p.vy = Math.sin(ang) * 200; p.a = ang; p.aim = ang;
    p.docked = null;
    p.energy = p.spec.energy;
    this.send(p.conn, { t: 'undocked' });
  }

  toggleWarp(p) {
    if (p.docked) return;
    if (p.warp === WARP.NONE) {
      p.warp = WARP.CHARGE; p.warpT = p.spec.warpCharge; p.mining = -1;
    } else if (p.warp === WARP.CHARGE) {
      p.warp = WARP.NONE;
    } else if (p.warp === WARP.ACTIVE) {
      p.warp = WARP.EXIT;
    }
  }

  toggleMine(p) {
    if (p.docked) return;
    if (p.mining >= 0) { p.mining = -1; return; }
    if (p.warp !== WARP.NONE) return this.err(p.conn, '워프 중에는 채굴할 수 없습니다.');
    let best = -1, bd = Infinity;
    const range = p.spec.miningRange;
    for (const a of this.world.asteroids) {
      if (Math.abs(a.x - p.x) > range + 200 || Math.abs(a.y - p.y) > range + 200) continue;
      if (this.astAmt[a.id] <= 0) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y) - a.r;
      if (d < bd) { bd = d; best = a.id; }
    }
    if (best < 0 || bd > range) return this.err(p.conn, '채굴 가능한 소행성이 범위 안에 없습니다.');
    if (cargoUsed(p.acct) >= p.spec.cargo) return this.err(p.conn, '화물칸이 가득 찼습니다.');
    p.mining = best; p.mineAcc = 0;
  }

  scan(p) {
    if (p.docked) return;
    const t = now();
    if (p.scanCd > t) return this.err(p.conn, `스캐너 재충전 중... ${Math.ceil(p.scanCd - t)}초`);
    p.scanCd = t + SCAN_COOLDOWN;
    const found = [];
    for (const an of this.anomalies.values()) {
      const d = Math.hypot(an.x - p.x, an.y - p.y);
      if (d < SCAN_RANGE) {
        p.scanned.set(an.id, t + 180);
        found.push({ id: an.id, x: Math.round(an.x), y: Math.round(an.y), type: an.type, name: an.name });
      }
    }
    this.send(p.conn, { t: 'scan', list: found, x: p.x, y: p.y, range: SCAN_RANGE });
    this.fx.push({ k: 'scan', x: p.x, y: p.y });
  }

  interact(p) {
    if (p.docked) return;
    // 1) 이상 신호 해킹
    for (const an of this.anomalies.values()) {
      if (Math.hypot(an.x - p.x, an.y - p.y) < INTERACT_RANGE) {
        if (an.hacker && an.hacker !== p.id && this.players.has(an.hacker)) return this.err(p.conn, '다른 파일럿이 해킹 중입니다.');
        p.hack = an.id; p.hackT = 0; an.hacker = p.id;
        if (an.type === 'relic' && !an.guarded) {
          an.guarded = true;
          const n = randi(2, 3);
          for (let i = 0; i < n; i++) {
            const g = Math.random() * Math.PI * 2;
            this.spawnNpc('guardian', an.x + Math.cos(g) * 1400, an.y + Math.sin(g) * 1400, null, now() + 240);
          }
          this.toast(p, '경고: 고대 방어 시스템이 깨어났습니다!', 'warn');
        }
        return;
      }
    }
    // 2) 스테이션 도킹
    this.tryDock(p);
  }

  setAutopilot(p, m) {
    if (p.dead) return;
    if (m.clear) { p.ap = null; return; }
    let target = null;
    if (m.kind === 'station' && this.stById[m.id]) target = { kind: 'station', id: m.id, name: this.stById[m.id].name, body: true };
    else if (m.kind === 'planet' && this.world.bodies[m.id]) target = { kind: 'planet', id: m.id, name: this.world.bodies[m.id].name, body: true };
    else if (m.kind === 'belt' && this.beltById[m.id]) { const b = this.beltById[m.id]; target = { kind: 'belt', id: m.id, name: b.name, x: b.x, y: b.y }; }
    else if (m.kind === 'beacon' && this.beaconById[m.id]) { const b = this.beaconById[m.id]; target = { kind: 'beacon', id: m.id, name: b.name, x: b.x, y: b.y }; }
    else if (m.kind === 'system' && this.sysById[m.id]) { const s = this.sysById[m.id]; const g = Math.atan2(p.y - s.y, p.x - s.x); target = { kind: 'system', id: m.id, name: s.name, x: s.x + Math.cos(g) * s.starR * 5, y: s.y + Math.sin(g) * s.starR * 5 }; }
    else if (m.kind === 'anomaly' && this.anomalies.has(m.id)) { const a = this.anomalies.get(m.id); target = { kind: 'anomaly', id: m.id, name: a.name, x: a.x, y: a.y }; }
    else if (m.kind === 'point' && Number.isFinite(m.x) && Number.isFinite(m.y)) target = { kind: 'point', name: '지정 좌표', x: clamp(m.x, -GALAXY_RADIUS * 1.1, GALAXY_RADIUS * 1.1), y: clamp(m.y, -GALAXY_RADIUS * 1.1, GALAXY_RADIUS * 1.1) };
    if (!target) return;
    p.ap = target;
    if (p.docked) this.undock(p);
    this.toast(p, `오토파일럿: ${target.name}(으)로 향합니다.`, 'info');
  }

  apTargetPos(p) {
    const ap = p.ap;
    if (ap.body) return bodyPos(this.world.bodies[ap.id], this.world.bodies, this.time());
    return { x: ap.x, y: ap.y };
  }

  // 공용 항법: 목표 지점까지 조향 · 워프 판단 · 감속 (플레이어 오토파일럿과 봇이 함께 사용)
  navigate(e, tx, ty, arrive) {
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy) || 1;
    // 항성 회피: 경로가 항성을 관통하면 옆으로 돌아가는 경유점을 조준
    let aimX = tx, aimY = ty;
    for (const s of this.world.systems) {
      const sx = s.x - e.x, sy = s.y - e.y;
      const proj = (sx * dx + sy * dy) / d;
      if (proj <= 0 || proj >= d) continue;
      const px = (dx / d) * proj, py = (dy / d) * proj;
      const safe = s.starR * 3;
      if (Math.hypot(sx - px, sy - py) < safe) {
        let nx = px - sx, ny = py - sy;
        let nl = Math.hypot(nx, ny);
        if (nl < 1) { nx = -dy; ny = dx; nl = d; }
        aimX = s.x + (nx / nl) * safe * 1.3; aimY = s.y + (ny / nl) * safe * 1.3;
        break;
      }
    }
    let aim = Math.atan2(aimY - e.y, aimX - e.x);
    const sp = Math.hypot(e.vx, e.vy);
    let keys = 0;
    if (e.warp === WARP.ACTIVE) {
      if (d < e.spec.warpSpeed * 0.35 + 1200 + arrive) e.warp = WARP.EXIT;
    } else if (e.warp === WARP.NONE) {
      if (d > 10000 && Math.abs(angDiff(aim, e.a)) < 0.15) { e.warp = WARP.CHARGE; e.warpT = e.spec.warpCharge; }
      if (d > arrive) {
        const want = Math.min(e.spec.maxSpeed, Math.sqrt(2 * e.spec.accel * 0.6 * Math.max(0, d - arrive * 0.5)) + 30);
        const dvx = (dx / d) * want - e.vx, dvy = (dy / d) * want - e.vy;
        if (d < 12000 && Math.hypot(dvx, dvy) > 40) {
          aim = Math.atan2(dvy, dvx);
          if (Math.abs(angDiff(aim, e.a)) < 0.5) keys = K.UP;
        } else if (Math.abs(angDiff(aim, e.a)) < 0.6) keys = K.UP;
      }
    }
    return { keys, aim, d, arrived: d <= arrive && e.warp === WARP.NONE && sp < 320 };
  }

  // 오토파일럿 — 입력 생성
  runAutopilot(p) {
    const tp = this.apTargetPos(p);
    const k = p.ap.kind;
    const arrive = k === 'station' ? DOCK_RANGE * 0.7 : k === 'point' || k === 'system' ? 1500 : k === 'planet' ? (this.world.bodies[p.ap.id].r + 900) : 600;
    const nav = this.navigate(p, tp.x, tp.y, arrive);
    p.apKeys = nav.keys; p.apAim = nav.aim;
    if (nav.arrived) {
      const ap = p.ap; p.ap = null;
      if (ap.kind === 'station') { const st = this.stById[ap.id]; if (st.sys === p.sys) return this.dock(p, st); }
      this.toast(p, `목적지 도착: ${ap.name}`, 'good');
    }
  }

  // 가장 가까운 스테이션으로 오토파일럿
  apNearestStation(p) {
    const T = this.time();
    let best = null, bd = Infinity;
    for (const st of this.world.stations) {
      const sp = bodyPos(st, this.world.bodies, T);
      const d = Math.hypot(sp.x - p.x, sp.y - p.y);
      if (d < bd) { bd = d; best = st; }
    }
    if (best) this.setAutopilot(p, { kind: 'station', id: best.id });
  }

  // ------------------------------------------------------------
  //  채팅
  // ------------------------------------------------------------
  chat(p, m) {
    const t = now();
    if (t - p.conn.lastChat < 0.6) return;
    p.conn.lastChat = t;
    let msg = String(m.msg || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
    if (!msg) return;
    let ch = ['global', 'local', 'clan'].includes(m.ch) ? m.ch : 'global';
    if (msg.startsWith('/')) {
      const [cmd, ...rest] = msg.split(' ');
      if (cmd === '/w' || cmd === '/귓') {
        const to = (rest.shift() || '').toLowerCase();
        const text = rest.join(' ').trim();
        const target = [...this.players.values()].find((x) => x.name.toLowerCase() === to);
        if (!target || !text) return this.err(p.conn, '사용법: /w 이름 메시지 (상대가 접속 중이어야 합니다)');
        const out = { t: 'chat', ch: 'whisper', from: p.name, to: target.name, tag: p.acct.clan, msg: text, ts: Date.now() };
        this.send(target.conn, out); this.send(p.conn, out);
        return;
      }
      if (cmd === '/who' || cmd === '/접속') {
        const names = [...this.players.values()].map((x) => x.name).join(', ');
        return this.send(p.conn, { t: 'chat', ch: 'sys', msg: `접속 중 (${this.players.size}): ${names}`, ts: Date.now() });
      }
      if (cmd === '/g') { ch = 'global'; msg = rest.join(' '); }
      else if (cmd === '/l') { ch = 'local'; msg = rest.join(' '); }
      else if (cmd === '/c') { ch = 'clan'; msg = rest.join(' '); }
      else return this.send(p.conn, { t: 'chat', ch: 'sys', msg: '명령어: /w 이름 메시지, /g 전체, /l 지역, /c 클랜, /who 접속자', ts: Date.now() });
      if (!msg.trim()) return;
    }
    const out = { t: 'chat', ch, from: p.name, tag: p.acct.clan, msg, ts: Date.now() };
    if (ch === 'global') {
      this.chatLog.push(out); if (this.chatLog.length > 60) this.chatLog.shift();
      for (const q of this.players.values()) this.send(q.conn, out);
    } else if (ch === 'local') {
      out.where = p.sys ? this.sysById[p.sys].name : '딥 스페이스';
      for (const q of this.players.values()) if (q.sys === p.sys && (p.sys || Math.hypot(q.x - p.x, q.y - p.y) < 60000)) this.send(q.conn, out);
    } else if (ch === 'clan') {
      if (!p.acct.clan) return this.err(p.conn, '클랜에 소속되어 있지 않습니다.');
      for (const q of this.players.values()) if (q.acct.clan === p.acct.clan) this.send(q.conn, out);
    }
  }

  sysChat(msg, scope = 'global', p = null) {
    const out = { t: 'chat', ch: 'sys', msg, ts: Date.now() };
    if (scope === 'global') {
      this.chatLog.push(out); if (this.chatLog.length > 60) this.chatLog.shift();
      for (const q of this.players.values()) this.send(q.conn, out);
    } else if (scope === 'local' && p) {
      for (const q of this.players.values()) if (q !== p && q.sys && q.sys === p.sys) this.send(q.conn, out);
    }
  }

  // ------------------------------------------------------------
  //  화물 / 시장
  // ------------------------------------------------------------
  addCargo(p, item, qty) {
    const free = p.spec.cargo - cargoUsed(p.acct);
    const n = Math.max(0, Math.min(free, qty));
    if (n > 0) { p.acct.cargo[item] = (p.acct.cargo[item] || 0) + n; p.dirty = true; }
    return n;
  }
  removeCargo(p, item, qty) {
    const have = p.acct.cargo[item] || 0;
    const n = Math.min(have, qty);
    if (n <= 0) return 0;
    if (have - n <= 0) delete p.acct.cargo[item]; else p.acct.cargo[item] = have - n;
    p.dirty = true;
    return n;
  }
  credit(p, amount, reason) {
    p.acct.credits += amount;
    if (amount > 0) p.acct.stats.earned += amount;
    p.dirty = true;
    if (reason) this.send(p.conn, { t: 'credit', amount: Math.round(amount), reason });
  }

  makeMarket(st) {
    const type = STATION_TYPES[st.type];
    const mk = {};
    for (const item of MARKET_ITEMS) {
      let mod = rand(0.9, 1.1), target = 220;
      if (type.produces.includes(item)) { mod *= 0.62; target = 600; }
      else if (type.consumes.includes(item)) { mod *= 1.5; target = 160; }
      if (ITEMS[item].kind === 'salvage' && !type.consumes.includes(item)) mod *= 0.85;
      mk[item] = { stock: Math.round(target * rand(0.6, 1.1)), target, mod: Math.round(mod * 100) / 100 };
    }
    return mk;
  }
  isLegal(stId, item) {
    const st = this.stById[stId];
    if (item !== 'contraband') return true;
    return this.sysById[st.sys].sec < 0.5;
  }
  price(stId, item) {
    const e = this.markets[stId][item];
    const f = clamp(1 + 0.6 * (e.target - e.stock) / e.target, 0.45, 1.9);
    return ITEMS[item].base * e.mod * f;
  }
  quote(stId, item) {
    const pr = this.price(stId, item);
    return { buy: Math.max(1, Math.round(pr * 1.06)), sell: Math.max(1, Math.round(pr * 0.94)) };
  }

  marketBuy(p, item, qty) {
    if (!p.docked || !ITEMS[item] || qty <= 0) return;
    if (!this.isLegal(p.docked, item)) return this.err(p.conn, '하이섹 스테이션에서는 불법 물품을 거래할 수 없습니다.');
    const e = this.markets[p.docked][item];
    qty = Math.min(qty, e.stock, p.spec.cargo - cargoUsed(p.acct), 10000);
    if (qty <= 0) return this.err(p.conn, '재고 또는 화물 공간이 부족합니다.');
    let total = 0, bought = 0;
    for (let i = 0; i < qty; i++) {
      const c = this.quote(p.docked, item).buy;
      if (p.acct.credits < total + c) break;
      total += c; bought++; e.stock--;
    }
    if (!bought) return this.err(p.conn, '크레딧이 부족합니다.');
    p.acct.credits -= total;
    this.addCargo(p, item, bought);
    p.acct.stats.trades++;
    this.toast(p, `${ITEMS[item].name} ${bought}개 구매 (-${total.toLocaleString()} ¢)`, 'good');
    this.sendAcct(p); this.sendStation(p);
  }

  marketSell(p, item, qty) {
    if (!p.docked || !ITEMS[item] || qty <= 0) return;
    if (!this.isLegal(p.docked, item)) return this.err(p.conn, '하이섹 스테이션에서는 불법 물품을 거래할 수 없습니다.');
    qty = Math.min(qty, p.acct.cargo[item] || 0);
    if (qty <= 0) return;
    const e = this.markets[p.docked][item];
    let total = 0;
    for (let i = 0; i < qty; i++) { total += this.quote(p.docked, item).sell; e.stock++; }
    this.removeCargo(p, item, qty);
    this.credit(p, total);
    p.acct.stats.trades++;
    this.toast(p, `${ITEMS[item].name} ${qty}개 판매 (+${total.toLocaleString()} ¢)`, 'good');
    this.sendAcct(p); this.sendStation(p);
  }

  jettison(p, item, qty) {
    if (p.docked || p.dead) return;
    const n = this.removeCargo(p, item, qty > 0 ? qty : 1e9);
    if (!n) return;
    if (item.startsWith('pkg:')) {
      this.failMission(p, item.slice(4), '화물을 버려서 임무에 실패했습니다.');
    } else {
      this.dropLoot(p.x - Math.cos(p.a) * 80, p.y - Math.sin(p.a) * 80, item, n, 0);
    }
    this.sendAcct(p);
  }

  dropLoot(x, y, item, qty, spread = 120) {
    const id = this.id('l');
    const g = Math.random() * Math.PI * 2;
    this.loots.set(id, { id, x: x + Math.cos(g) * spread * Math.random(), y: y + Math.sin(g) * spread * Math.random(), vx: Math.cos(g) * rand(20, 80), vy: Math.sin(g) * rand(20, 80), item, qty, expires: now() + 240 });
  }

  // ------------------------------------------------------------
  //  조선소 / 격납고
  // ------------------------------------------------------------
  buyShip(p, type) {
    if (!p.docked || !SHIPS[type] || type === 'shuttle') return;
    const spec = SHIPS[type];
    if (p.acct.ships.length >= 12) return this.err(p.conn, '격납고가 가득 찼습니다 (최대 12척).');
    if (p.acct.credits < spec.price) return this.err(p.conn, '크레딧이 부족합니다.');
    p.acct.credits -= spec.price;
    const s = { id: p.acct.nextShip++, type, hp: spec.hull, ins: false };
    p.acct.ships.push(s);
    this.toast(p, `${spec.name} 구매 완료! 격납고에서 탑승할 수 있습니다.`, 'good');
    this.sendAcct(p); this.sendStation(p);
  }
  sellShip(p, id) {
    if (!p.docked) return;
    const i = p.acct.ships.findIndex((s) => s.id === id);
    if (i < 0) return;
    const s = p.acct.ships[i];
    if (s.id === p.acct.active) return this.err(p.conn, '현재 탑승 중인 함선은 판매할 수 없습니다.');
    if (s.type === 'shuttle') return this.err(p.conn, '셔틀은 판매할 수 없습니다.');
    const v = Math.round(SHIPS[s.type].price * 0.55 * (s.hp / SHIPS[s.type].hull));
    p.acct.ships.splice(i, 1);
    this.credit(p, v);
    this.toast(p, `${SHIPS[s.type].name} 판매 (+${v.toLocaleString()} ¢)`, 'good');
    this.sendAcct(p); this.sendStation(p);
  }
  switchShip(p, id) {
    if (!p.docked) return this.err(p.conn, '함선 교체는 도킹 중에만 가능합니다.');
    const s = p.acct.ships.find((x) => x.id === id);
    if (!s || s.id === p.acct.active) return;
    const spec = SHIPS[s.type];
    if (cargoUsed(p.acct) > spec.cargo) return this.err(p.conn, '화물이 새 함선의 화물칸보다 많습니다. 먼저 판매하세요.');
    this.persistPlayer(p);
    p.acct.active = s.id;
    p.type = s.type; p.spec = spec; p.hull = Math.min(spec.hull, s.hp); p.shield = spec.shield; p.energy = spec.energy; p.cds = [];
    this.toast(p, `${spec.name}에 탑승했습니다.`, 'good');
    this.sendAcct(p); this.sendStation(p);
  }
  repairCost(p) {
    const missing = Math.max(0, p.spec.hull - p.hull);
    return Math.ceil(missing * (1 + p.spec.price / 60000));
  }
  repair(p) {
    if (!p.docked) return;
    const c = this.repairCost(p);
    if (c <= 0) return;
    if (p.acct.credits < c) return this.err(p.conn, '크레딧이 부족합니다.');
    p.acct.credits -= c; p.hull = p.spec.hull;
    this.persistPlayer(p);
    this.toast(p, `선체 수리 완료 (-${c.toLocaleString()} ¢)`, 'good');
    this.sendAcct(p); this.sendStation(p);
  }
  insure(p, id) {
    if (!p.docked) return;
    const s = p.acct.ships.find((x) => x.id === id);
    if (!s || s.ins || s.type === 'shuttle') return;
    const c = Math.round(SHIPS[s.type].price * 0.15);
    if (p.acct.credits < c) return this.err(p.conn, '크레딧이 부족합니다.');
    p.acct.credits -= c; s.ins = true;
    this.toast(p, `${SHIPS[s.type].name} 보험 가입 완료. 파괴 시 가격의 75%를 보상받습니다.`, 'good');
    this.sendAcct(p); this.sendStation(p);
  }

  sendStation(p) {
    if (!p.docked) return;
    const st = this.stById[p.docked];
    const market = MARKET_ITEMS.map((item) => {
      const q = this.quote(st.id, item);
      return { item, buy: q.buy, sell: q.sell, stock: this.markets[st.id][item].stock, legal: this.isLegal(st.id, item) };
    });
    this.send(p.conn, {
      t: 'station', id: st.id, name: st.name, type: st.type, sys: st.sys, market,
      missions: this.getBoard(st.id), repair: this.repairCost(p), hull: Math.round(p.hull),
    });
  }

  // ------------------------------------------------------------
  //  임무
  // ------------------------------------------------------------
  getBoard(stId) {
    let b = this.boards[stId];
    const t = now();
    if (!b || t - b.at > 900) { b = this.boards[stId] = { at: t, list: [] }; }
    while (b.list.length < 6) b.list.push(this.genMission(stId));
    return b.list;
  }

  genMission(stId) {
    const st = this.stById[stId];
    const sys = this.sysById[st.sys];
    const id = this.id('m');
    const roll = Math.random();
    const riskSys = (s) => 1 - clamp(s.sec, 0, 1);
    if (roll < 0.45) {
      const others = this.world.stations.filter((o) => o.id !== stId);
      const near = others.map((o) => ({ o, d: Math.hypot(this.sysById[o.sys].x - sys.x, this.sysById[o.sys].y - sys.y) })).sort((a, b) => a.d - b.d);
      const cand = near.slice(0, Math.min(near.length, 9));
      const { o, d } = pick(cand);
      const dsys = this.sysById[o.sys];
      const qty = randi(2, 18);
      const dist = Math.max(d, 8000);
      const risk = Math.max(riskSys(sys), riskSys(dsys));
      const reward = Math.round((300 + dist * 0.022 * (1 + risk * 1.6) + qty * 45) / 10) * 10;
      return { id, type: 'delivery', from: stId, to: o.id, qty, reward, title: `긴급 배송: ${o.name}`, desc: `암호화 화물 ${qty}개를 ${dsys.name}의 ${o.name}(으)로 배송하라. (${secLabel(dsys.sec)} ${dsys.sec.toFixed(1)})` };
    }
    if (roll < 0.7) {
      const hostile = this.world.systems.filter((s) => s.sec < 0.8 && s.belts.length);
      const near = hostile.map((s) => ({ s, d: Math.hypot(s.x - sys.x, s.y - sys.y) })).sort((a, b) => a.d - b.d).slice(0, 5);
      const { s } = pick(near);
      const qty = randi(3, 8);
      const reward = Math.round((qty * 500 * (1 + riskSys(s) * 2.2) + 400) / 10) * 10;
      return { id, type: 'bounty', from: stId, sys: s.id, qty, progress: 0, reward, title: `현상금: ${s.name} 해적 소탕`, desc: `${s.name}의 소행성대에서 해적 ${qty}기를 격추하라. 완료 후 아무 스테이션에서 보상 수령.` };
    }
    if (roll < 0.88) {
      const ores = sys.sec >= 0.5 ? ['ferrite', 'titanite', 'neonium'] : ['titanite', 'neonium', 'voidstone', 'quantum'];
      const ore = pick(ores);
      const qty = Math.max(5, Math.round(randi(15, 60) * (30 / ITEMS[ore].base) ** 0.5));
      const reward = Math.round((qty * ITEMS[ore].base * 1.9 + 200) / 10) * 10;
      return { id, type: 'mining', from: stId, ore, qty, reward, title: `조달 요청: ${ITEMS[ore].name}`, desc: `${ITEMS[ore].name} ${qty}개를 이 스테이션(${st.name})에 납품하라.` };
    }
    const qty = randi(1, 3);
    const reward = qty * 2600 + 500;
    return { id, type: 'explore', from: stId, qty, progress: 0, reward, title: '딥 스페이스 탐사 계약', desc: `스캐너(R)로 이상 신호를 찾아 ${qty}곳을 해킹(E)하라. 완료 후 아무 스테이션에서 보상 수령.` };
  }

  missionAction(p, m) {
    const a = p.acct;
    if (m.a === 'accept') {
      if (!p.docked) return;
      const list = this.getBoard(p.docked);
      const i = list.findIndex((x) => x.id === m.id);
      if (i < 0) return;
      if (a.missions.length >= MAX_MISSIONS) return this.err(p.conn, `동시에 수행 가능한 임무는 최대 ${MAX_MISSIONS}개입니다.`);
      const mis = list[i];
      if (mis.type === 'delivery') {
        if (p.spec.cargo - cargoUsed(a) < mis.qty) return this.err(p.conn, '화물칸 공간이 부족합니다.');
        this.addCargo(p, 'pkg:' + mis.id, mis.qty);
      }
      list.splice(i, 1);
      a.missions.push(mis);
      this.toast(p, `임무 수락: ${mis.title}`, 'good');
      this.sendAcct(p); this.sendStation(p);
    } else if (m.a === 'complete') {
      if (!p.docked) return this.err(p.conn, '임무 완료는 스테이션에 도킹한 상태에서 가능합니다.');
      const mis = a.missions.find((x) => x.id === m.id);
      if (!mis) return;
      if (mis.type === 'delivery') {
        if (p.docked !== mis.to) return this.err(p.conn, `배송지는 ${this.stById[mis.to].name}입니다.`);
        if ((a.cargo['pkg:' + mis.id] || 0) < mis.qty) return this.err(p.conn, '배송 화물이 부족합니다.');
        this.removeCargo(p, 'pkg:' + mis.id, mis.qty);
      } else if (mis.type === 'mining') {
        if (p.docked !== mis.from) return this.err(p.conn, `납품지는 ${this.stById[mis.from].name}입니다.`);
        if ((a.cargo[mis.ore] || 0) < mis.qty) return this.err(p.conn, `${ITEMS[mis.ore].name}이(가) 부족합니다.`);
        this.removeCargo(p, mis.ore, mis.qty);
      } else if (mis.progress < mis.qty) return this.err(p.conn, '아직 임무 목표를 달성하지 못했습니다.');
      a.missions = a.missions.filter((x) => x !== mis);
      this.credit(p, mis.reward, '임무 보상');
      this.toast(p, `임무 완료! +${mis.reward.toLocaleString()} ¢`, 'good');
      this.sendAcct(p); this.sendStation(p);
    } else if (m.a === 'abandon') {
      this.failMission(p, m.id, '임무를 포기했습니다.');
    }
  }

  failMission(p, id, msg) {
    const a = p.acct;
    const mis = a.missions.find((x) => x.id === id);
    if (!mis) return;
    a.missions = a.missions.filter((x) => x !== mis);
    delete a.cargo['pkg:' + id];
    p.dirty = true;
    this.toast(p, msg, 'warn');
    if (p.docked) this.sendStation(p);
  }

  progressMission(p, type, sysId) {
    let changed = false;
    for (const mis of p.acct.missions) {
      if (mis.type !== type || mis.progress >= mis.qty) continue;
      if (type === 'bounty' && mis.sys !== sysId) continue;
      mis.progress++;
      changed = true;
      if (mis.progress >= mis.qty) this.toast(p, `임무 목표 달성: ${mis.title} — 스테이션에서 보상을 받으세요.`, 'good');
    }
    if (changed) p.dirty = true;
  }

  // ------------------------------------------------------------
  //  클랜
  // ------------------------------------------------------------
  clanPayload(tag) {
    const c = this.clans[tag];
    if (!c) return null;
    const online = new Set([...this.players.values()].map((p) => p.acct.name));
    const sovs = Object.entries(this.sov).filter(([, v]) => v.owner === tag).map(([k]) => this.beaconById[k].name);
    return {
      tag, name: c.name, color: c.color, leader: c.leader, officers: c.officers, bank: Math.floor(c.bank), open: c.open, motd: c.motd,
      members: c.members.map((n) => ({ name: n, online: online.has(n), role: n === c.leader ? '리더' : c.officers.includes(n) ? '간부' : '멤버' })),
      requests: c.requests, sov: sovs, kills: c.kills || 0, created: c.created,
    };
  }
  broadcastClan(tag) {
    if (!tag || !this.clans[tag]) return;
    const payload = { t: 'clan', clan: this.clanPayload(tag) };
    for (const p of this.players.values()) if (p.acct.clan === tag) this.send(p.conn, payload);
  }
  clanList() {
    return Object.values(this.clans).map((c) => ({
      tag: c.tag, name: c.name, color: c.color, members: c.members.length, open: c.open,
      sov: Object.values(this.sov).filter((v) => v.owner === c.tag).length, kills: c.kills || 0,
    })).sort((a, b) => b.sov - a.sov || b.members - a.members);
  }

  clanAction(p, m) {
    const a = p.acct;
    const c = a.clan ? this.clans[a.clan] : null;
    const isLead = c && c.leader === a.name;
    const isOff = c && (isLead || c.officers.includes(a.name));
    const findAcct = (n) => this.accounts[String(n || '').toLowerCase()];
    switch (m.a) {
      case 'list': return this.send(p.conn, { t: 'clanList', list: this.clanList() });
      case 'info': return this.send(p.conn, { t: 'clan', clan: c ? this.clanPayload(c.tag) : null });
      case 'create': {
        if (c) return this.err(p.conn, '이미 클랜에 소속되어 있습니다.');
        const tag = String(m.tag || '').toUpperCase().trim();
        const name = String(m.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
        if (!TAG_RE.test(tag)) return this.err(p.conn, '클랜 태그는 영문 대문자/숫자 2~5자입니다.');
        if (name.length < 2) return this.err(p.conn, '클랜 이름은 2자 이상이어야 합니다.');
        if (this.clans[tag]) return this.err(p.conn, '이미 사용 중인 태그입니다.');
        if (a.credits < CLAN_CREATE_COST) return this.err(p.conn, `클랜 창설 비용 ${CLAN_CREATE_COST.toLocaleString()} ¢이 필요합니다.`);
        a.credits -= CLAN_CREATE_COST;
        this.clans[tag] = { tag, name, color: pick(NEON), leader: a.name, officers: [], members: [a.name], bank: 0, open: true, requests: [], motd: '클랜에 오신 것을 환영합니다!', created: Date.now(), kills: 0 };
        a.clan = tag;
        this.sysChat(`새로운 클랜 [${tag}] ${name} 이(가) 창설되었습니다!`);
        this.sendAcct(p); this.broadcastClan(tag); this.broadcastInfo();
        return;
      }
      case 'join': {
        if (c) return this.err(p.conn, '이미 클랜에 소속되어 있습니다.');
        const t = this.clans[String(m.tag || '').toUpperCase()];
        if (!t) return this.err(p.conn, '존재하지 않는 클랜입니다.');
        if (t.members.length >= 50) return this.err(p.conn, '클랜 정원이 가득 찼습니다.');
        if (t.open) {
          t.members.push(a.name); a.clan = t.tag; t.requests = t.requests.filter((n) => n !== a.name);
          this.toast(p, `[${t.tag}] ${t.name}에 가입했습니다!`, 'good');
          this.sendAcct(p); this.broadcastClan(t.tag);
        } else {
          if (!t.requests.includes(a.name)) t.requests.push(a.name);
          if (t.requests.length > 30) t.requests.shift();
          this.toast(p, `[${t.tag}]에 가입 신청을 보냈습니다.`, 'info');
          this.broadcastClan(t.tag);
        }
        return;
      }
      case 'leave': {
        if (!c) return;
        c.members = c.members.filter((n) => n !== a.name);
        c.officers = c.officers.filter((n) => n !== a.name);
        a.clan = null;
        this.toast(p, `[${c.tag}]에서 탈퇴했습니다.`, 'info');
        this.send(p.conn, { t: 'clan', clan: null });
        if (!c.members.length) {
          delete this.clans[c.tag];
          for (const k in this.sov) if (this.sov[k].owner === c.tag) this.sov[k] = { owner: null, prog: 0, cap: null };
          this.sysChat(`클랜 [${c.tag}] ${c.name} 이(가) 해체되었습니다.`);
          this.broadcastInfo();
        } else {
          if (c.leader === a.name) c.leader = c.officers[0] || c.members[0];
          this.broadcastClan(c.tag);
        }
        this.sendAcct(p);
        return;
      }
      case 'accept': case 'reject': {
        if (!isOff) return this.err(p.conn, '권한이 없습니다.');
        const who = String(m.name || '');
        if (!c.requests.includes(who)) return;
        c.requests = c.requests.filter((n) => n !== who);
        const ta = findAcct(who);
        if (m.a === 'accept' && ta && !ta.clan) {
          c.members.push(ta.name); ta.clan = c.tag;
          const tp = [...this.players.values()].find((x) => x.acct === ta);
          if (tp) { this.toast(tp, `[${c.tag}] ${c.name} 가입이 승인되었습니다!`, 'good'); this.sendAcct(tp); }
        }
        this.broadcastClan(c.tag);
        return;
      }
      case 'kick': {
        if (!isOff) return this.err(p.conn, '권한이 없습니다.');
        const who = String(m.name || '');
        if (who === c.leader || (!isLead && c.officers.includes(who)) || who === a.name) return this.err(p.conn, '추방할 수 없는 대상입니다.');
        const ta = findAcct(who);
        c.members = c.members.filter((n) => n !== who);
        c.officers = c.officers.filter((n) => n !== who);
        if (ta) ta.clan = null;
        const tp = [...this.players.values()].find((x) => x.acct === ta);
        if (tp) { this.toast(tp, `[${c.tag}]에서 추방되었습니다.`, 'warn'); this.sendAcct(tp); this.send(tp.conn, { t: 'clan', clan: null }); }
        this.broadcastClan(c.tag);
        return;
      }
      case 'promote': case 'demote': {
        if (!isLead) return this.err(p.conn, '리더만 가능합니다.');
        const who = String(m.name || '');
        if (!c.members.includes(who) || who === a.name) return;
        if (m.a === 'promote' && !c.officers.includes(who)) c.officers.push(who);
        if (m.a === 'demote') c.officers = c.officers.filter((n) => n !== who);
        this.broadcastClan(c.tag);
        return;
      }
      case 'transfer': {
        if (!isLead) return this.err(p.conn, '리더만 가능합니다.');
        const who = String(m.name || '');
        if (!c.members.includes(who) || who === a.name) return;
        c.leader = who;
        c.officers = c.officers.filter((n) => n !== who);
        if (!c.officers.includes(a.name)) c.officers.push(a.name);
        this.broadcastClan(c.tag);
        return;
      }
      case 'deposit': {
        if (!c) return;
        const amt = Math.floor(Number(m.amount) || 0);
        if (amt <= 0 || amt > a.credits) return this.err(p.conn, '금액이 올바르지 않습니다.');
        a.credits -= amt; c.bank += amt;
        this.sendAcct(p); this.broadcastClan(c.tag);
        return;
      }
      case 'withdraw': {
        if (!isOff) return this.err(p.conn, '간부 이상만 인출할 수 있습니다.');
        const amt = Math.floor(Number(m.amount) || 0);
        if (amt <= 0 || amt > c.bank) return this.err(p.conn, '금액이 올바르지 않습니다.');
        c.bank -= amt; a.credits += amt;
        this.sendAcct(p); this.broadcastClan(c.tag);
        return;
      }
      case 'settings': {
        if (!isOff) return this.err(p.conn, '권한이 없습니다.');
        if (typeof m.open === 'boolean') c.open = m.open;
        if (typeof m.motd === 'string') c.motd = m.motd.replace(/[\u0000-\u001f]/g, '').slice(0, 140);
        this.broadcastClan(c.tag);
        return;
      }
    }
  }

  // ------------------------------------------------------------
  //  랭킹
  // ------------------------------------------------------------
  leaderboard(conn) {
    const t = now();
    if (t - conn.lastLb < 2) return;
    conn.lastLb = t;
    const all = Object.values(this.accounts);
    const worth = (a) => a.credits + a.ships.reduce((s, x) => s + SHIPS[x.type].price, 0);
    const top = (fn) => all.map((a) => ({ name: a.name, tag: a.clan, v: Math.floor(fn(a)) })).sort((x, y) => y.v - x.v).slice(0, 10);
    this.send(conn, {
      t: 'lb',
      worth: top(worth),
      pvp: top((a) => a.stats.kills),
      pve: top((a) => a.stats.pve),
      explore: top((a) => a.discovered.length * 10 + a.stats.explored),
      clans: this.clanList().slice(0, 10),
    });
  }

  broadcastInfo() { for (const p of this.players.values()) this.sendInfo(p.conn); }

  // ------------------------------------------------------------
  //  NPC / 이상신호 스폰
  // ------------------------------------------------------------
  setupSpawns() {
    const T = { hi: ['drone', 'drone', 'swarm', 'swarm', 'swarm'], mid: ['drone', 'drone', 'raider', 'raider', 'swarm', 'swarm', 'swarm', 'swarm'],
      low: ['raider', 'raider', 'enforcer', 'gunship', 'swarm', 'swarm', 'swarm', 'swarm'], nul: ['raider', 'enforcer', 'enforcer', 'gunship', 'gunship', 'swarm', 'swarm', 'swarm', 'swarm', 'swarm'] };
    for (const belt of this.world.belts) {
      const sec = this.sysById[belt.sys].sec;
      if (sec >= 0.8) continue;
      const list = sec >= 0.5 ? T.hi : sec > 0.2 ? T.mid : sec > 0 ? T.low : T.nul;
      for (const type of list) this.spawnSlots.push({ belt: belt.id, type, respawnAt: now() + rand(0, 8), npc: null, delay: type === 'swarm' ? 35 : 45 });
    }
    // 널섹마다 보스 하나
    for (const sys of this.world.systems) {
      if (sys.sec > 0 || !sys.belts.length) continue;
      this.spawnSlots.push({ belt: pick(sys.belts), type: 'kaiju', respawnAt: now() + rand(10, 60), npc: null, delay: 600 });
    }
    // 하이섹 보안군 순찰대
    for (const sys of this.world.systems) {
      if (sys.sec < 0.5) continue;
      const n = sys.sec >= 0.8 ? 3 : 4;
      for (let i = 0; i < n; i++) this.spawnSlots.push({ sys: sys.id, type: 'police', respawnAt: now() + rand(0, 5), npc: null, delay: 60 });
    }
    // 로그 파일럿 봇
    const botCount = Math.max(0, Number(process.env.BOT_COUNT ?? 30));
    this.botSlots = [];
    for (let i = 0; i < botCount; i++) this.botSlots.push({ npc: null, respawnAt: now() + rand(0, 25) });
    this.botDests = this.world.belts.filter((b) => this.sysById[b.sys].sec < 0.6);
  }

  slotSpawnPos(slot) {
    if (slot.belt) {
      const belt = this.beltById[slot.belt];
      const g = Math.random() * Math.PI * 2, d = Math.random() * belt.r;
      return { x: belt.x + Math.cos(g) * d, y: belt.y + Math.sin(g) * d };
    }
    const sys = this.sysById[slot.sys];
    const stId = sys.stations.length ? pick(sys.stations) : null;
    const base = stId ? bodyPos(this.stById[stId], this.world.bodies, this.time()) : { x: sys.x + 15000, y: sys.y };
    const g = Math.random() * Math.PI * 2;
    return { x: base.x + Math.cos(g) * rand(1500, 4000), y: base.y + Math.sin(g) * rand(1500, 4000) };
  }

  spawnNpc(type, x, y, slot, expires = 0) {
    const spec = NPCS[type];
    const n = {
      id: this.id('n'), npc: true, type, spec, x, y, vx: 0, vy: 0, a: Math.random() * 6.28,
      hull: spec.hull, shield: spec.shield, homeX: x, homeY: y, slot, target: null, cd: rand(0.5, 1.5), cd2: 2,
      wanderX: x, wanderY: y, wanderT: 0, lastHitT: 0, expires, warp: 0, warpT: 0, keys: 0, aim: 0, sleep: false, orbitDir: Math.random() < 0.5 ? 1 : -1,
      sys: null, sec: 0, scanT: Math.random() * 0.5, sysT: 0,
    };
    this.updateNpcSys(n);
    this.npcs.set(n.id, n);
    return n;
  }

  updateNpcSys(n) {
    n.sys = null; n.sec = 0;
    let nd = Infinity;
    for (const s of this.world.systems) {
      const d = Math.hypot(s.x - n.x, s.y - n.y);
      if (d < SYSTEM_RADIUS && d < nd) { nd = d; n.sys = s.id; n.sec = s.sec; }
    }
  }

  // ------------------------------------------------------------
  //  로그 파일럿 봇 — 플레이어 기체를 몰고 성계 사이를 워프로 이동하는 적대 AI
  // ------------------------------------------------------------
  spawnBot(slot) {
    const roll = Math.random();
    const ace = roll < 0.08;
    const shipType = ace ? pick(['oni', 'leviathan']) : pick(['razor', 'razor', 'katana', 'katana', 'katana', 'ronin', 'ronin', 'phantom', 'drill', 'mule']);
    const base = SHIPS[shipType];
    const range = Math.max(...base.hardpoints.map(([w]) => WEAPONS[w].speed * WEAPONS[w].life)) * 0.8;
    const spec = {
      ...base, faction: 'pirate', aggro: ace ? 3000 : 2500, range,
      bounty: Math.round((900 + base.price * 0.045) * (ace ? 1.5 : 1)),
      loot: [[pick(['neonium', 'voidstone', 'titanite', 'plasma', 'chips']), 0.9, 3, 12], ['datashard', 0.4, 1, 3], ['cyberware', ace ? 0.8 : 0.15, 1, 3], ['quantum', ace ? 0.7 : 0.05, 1, 4]],
    };
    const PRE = ['Neon', 'Ghost', 'Chrome', 'Void', 'Glitch', 'Razor', 'Hex', 'Nova', 'Zero', 'Byte', 'Static', 'Viper', 'Shade', 'Kuro', 'Akira', 'Rogue', 'Null', 'Echo', 'Blitz', 'Kaiser', '네온', '크롬', '검은', '독'];
    const SUF = ['_Runner', 'Fang', 'X', '_77', '-9', 'Wolf', 'Ronin', 'Jack', 'Kid', '_2099', 'Byte', '뱀', '늑대', '까마귀', 'Zer0'];
    const name = (ace ? 'ACE_' : '') + pick(PRE) + pick(SUF);
    const tag = pick(['GLCH', 'RZR', 'VOID', 'HEX', '0DAY', 'KRKN', 'BLK', 'SYN']);
    const dest = pick(this.botDests.length ? this.botDests : this.world.belts);
    const g = Math.random() * Math.PI * 2;
    const x = dest.x + Math.cos(g) * rand(500, 4000), y = dest.y + Math.sin(g) * rand(500, 4000);
    const n = {
      id: this.id('b'), npc: true, bot: true, type: shipType, name, tag, spec, x, y, vx: 0, vy: 0, a: g,
      hull: spec.hull, shield: spec.shield, target: null, cds: [], dmgMul: ace ? 0.8 : 0.55, lastHitT: 0,
      warp: 0, warpT: 0, keys: 0, aim: 0, sleep: false, orbitDir: Math.random() < 0.5 ? 1 : -1,
      mode: 'patrol', patrolT: rand(20, 100), destX: dest.x, destY: dest.y, wanderX: x, wanderY: y, wanderT: 0,
      sys: null, sec: 0, scanT: 0, sysT: 0, sayT: 0, botSlot: slot, ace,
    };
    this.updateNpcSys(n);
    this.npcs.set(n.id, n);
    return n;
  }

  botPickDest(n, flee) {
    let cands = this.botDests.length ? this.botDests : this.world.belts;
    cands = cands.filter((b) => b.sys !== n.sys && (!flee || Math.hypot(b.x - n.x, b.y - n.y) > 90000));
    if (!cands.length) cands = this.world.belts;
    const b = pick(cands);
    n.destX = b.x + rand(-1500, 1500); n.destY = b.y + rand(-1500, 1500);
    n.mode = flee ? 'flee' : 'travel';
  }

  botSay(n, kind) {
    const t = now();
    if (t < n.sayT) return;
    n.sayT = t + 25;
    const L = {
      engage: ['네 화물은 이제 내 거다.', '로그오프할 시간이다, 초보.', '이 구역은 우리 영역이다!', '크레딧 두고 가면 살려주지.', '타겟 확인. 사냥 시작.', '보험은 들어뒀겠지?'],
      flee: ['젠장, 후퇴한다!', '다음엔 안 봐준다...', '실드 붕괴! 이탈한다!'],
      kill: ['GG. 다음 클론에서 보자.', '너무 쉽군.', '고철 잘 받아간다.'],
    }[kind];
    const out = { t: 'chat', ch: 'local', from: n.name, tag: n.tag, msg: pick(L), ts: Date.now(), where: n.sys ? this.sysById[n.sys].name : '딥 스페이스', bot: true };
    for (const q of this.players.values()) if (Math.hypot(q.x - n.x, q.y - n.y) < 30000) this.send(q.conn, out);
  }

  // 플레이어가 근처에 없을 때: 물리 없이 목적지로 워프 이동만 추상 시뮬레이션
  botSleepTravel(n, dt, t) {
    n.shield = n.spec.shield;
    n.hull = Math.min(n.spec.hull, n.hull + n.spec.hull * 0.02 * dt);
    if (n.mode === 'patrol') {
      n.vx = n.vy = 0; n.warp = WARP.NONE;
      n.patrolT -= dt;
      if (n.patrolT <= 0) this.botPickDest(n, false);
      return;
    }
    const dx = n.destX - n.x, dy = n.destY - n.y, d = Math.hypot(dx, dy);
    if (d < 3000) { n.mode = 'patrol'; n.patrolT = rand(40, 140); n.vx = n.vy = 0; n.warp = WARP.NONE; n.wanderX = n.x; n.wanderY = n.y; return; }
    const v = n.spec.warpSpeed;
    n.vx = (dx / d) * v; n.vy = (dy / d) * v; n.a = Math.atan2(dy, dx); n.warp = WARP.ACTIVE;
    const step = Math.min(d, v * dt);
    n.x += (dx / d) * step; n.y += (dy / d) * step;
    n.sysT -= dt; if (n.sysT <= 0) { n.sysT = 1; this.updateNpcSys(n); }
  }

  spawnAnomaly() {
    const id = this.id('x');
    const roll = Math.random();
    const type = roll < 0.5 ? 'wreck' : roll < 0.78 ? 'cache' : 'relic';
    let x, y, sec = 0.3;
    for (let tries = 0; tries < 30; tries++) {
      if (Math.random() < 0.55) {
        const g = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * GALAXY_RADIUS;
        x = Math.cos(g) * d; y = Math.sin(g) * d;
      } else {
        const s = pick(this.world.systems);
        const g = Math.random() * Math.PI * 2, d = rand(25000, 65000);
        x = s.x + Math.cos(g) * d; y = s.y + Math.sin(g) * d;
      }
      let ok = true;
      for (const s of this.world.systems) if (Math.hypot(s.x - x, s.y - y) < s.starR * 6) ok = false;
      if (ok) break;
    }
    let nd = Infinity;
    for (const s of this.world.systems) { const d = Math.hypot(s.x - x, s.y - y); if (d < nd) { nd = d; sec = s.sec; } }
    const names = { wreck: ['유기된 화물선 잔해', '추락한 기업 셔틀', '침묵한 채굴 드론'], cache: ['밀수 은닉처', '암호화 데드드롭', '신디케이트 금고'], relic: ['고대 데이터 코어', '전전(前戰) AI 유적', '봉인된 신호탑'] };
    this.anomalies.set(id, { id, type, x, y, sec, name: pick(names[type]), hacker: null, guarded: false });
  }

  hackReward(p, an) {
    const danger = 1 + (1 - clamp(an.sec, -0.5, 1)) * 1.2;
    let credits = 0;
    const items = [];
    if (an.type === 'wreck') { credits = randi(600, 2200); items.push(['scrap', randi(3, 10)]); if (Math.random() < 0.5) items.push([pick(['plasma', 'chips', 'water', 'food']), randi(2, 8)]); }
    else if (an.type === 'cache') { credits = randi(1500, 4000); items.push([pick(['contraband', 'cyberware', 'chips']), randi(1, 4)]); }
    else { credits = randi(3500, 8000); items.push(['datashard', randi(2, 6)]); if (Math.random() < 0.6) items.push(['quantum', randi(1, 3)]); }
    credits = Math.round(credits * danger);
    this.credit(p, credits, '해킹 성공');
    const got = [];
    for (const [item, q] of items) {
      const n = this.addCargo(p, item, q);
      if (n < q) this.dropLoot(an.x, an.y, item, q - n);
      got.push(`${ITEMS[item].name} x${q}`);
    }
    p.acct.stats.explored++;
    this.progressMission(p, 'explore');
    this.toast(p, `해킹 성공! +${credits.toLocaleString()} ¢ / ${got.join(', ')}`, 'good');
    this.fx.push({ k: 'hack', x: an.x, y: an.y });
    this.anomalies.delete(an.id);
    setTimeout(() => this.spawnAnomaly(), rand(60, 180) * 1000);
    p.dirty = true;
  }

  // ------------------------------------------------------------
  //  전투
  // ------------------------------------------------------------
  fire(shooter, wKey, offsets, targetHint) {
    const w = WEAPONS[wKey];
    const c = Math.cos(shooter.a), s = Math.sin(shooter.a);
    const count = w.count || 1;
    for (const [ox, oy] of offsets) {
      const px = shooter.x + c * ox - s * oy, py = shooter.y + s * ox + c * oy;
      for (let i = 0; i < count; i++) {
        const ang = shooter.a + (count > 1 ? (i / (count - 1) - 0.5) * w.spread * 2 : (Math.random() - 0.5) * w.spread * 2);
        const pr = {
          id: this.nid++, w: wKey, x: px, y: py,
          vx: Math.cos(ang) * w.speed + shooter.vx * 0.6, vy: Math.sin(ang) * w.speed + shooter.vy * 0.6,
          life: w.life, dmg: w.dmg * (shooter.dmgMul || 1), owner: shooter.id, npc: !!shooter.npc, fac: this.faction(shooter), clan: shooter.npc ? null : shooter.acct.clan,
          target: null, a: ang,
        };
        if (w.homing) pr.target = targetHint || this.findMissileTarget(shooter);
        this.projectiles.push(pr);
        if (!w.homing) this.fx.push({ k: 's', id: pr.id, o: shooter.id, x: Math.round(px), y: Math.round(py), vx: Math.round(pr.vx), vy: Math.round(pr.vy), l: w.life, w: wKey });
      }
    }
  }

  findMissileTarget(p) {
    let best = null, bd = 3000 * 3000;
    const c = Math.cos(p.a), s = Math.sin(p.a);
    const consider = (e) => {
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = dx * dx + dy * dy;
      if (d > bd) return;
      if ((dx * c + dy * s) / Math.sqrt(d || 1) < 0.35) return;
      bd = d; best = e.id;
    };
    for (const n of this.npcs.values()) if (!n.sleep && this.hostileTo(p, n)) consider(n);
    for (const q of this.players.values()) if (q !== p && this.hostileTo(p, q)) consider(q);
    return best;
  }

  canDamage(att, tgt) {
    if (!tgt || tgt.dead || tgt.docked) return false;
    if (att.npc && tgt.npc) return false;
    if (att.npc || tgt.npc) return true;
    if (att.id === tgt.id) return false;
    if (att.acct.clan && att.acct.clan === tgt.acct.clan) return false;
    return pvpAllowed(tgt.sec) && pvpAllowed(att.sec);
  }

  entity(id) { return this.players.get(id) || this.npcs.get(id); }

  faction(e) { return e.npc ? (e.spec.faction || 'pirate') : 'player'; }
  // 적대 관계: 플레이어끼리는 PvP 규칙, 해적(봇 포함)은 모두를 공격, 보안군은 해적과 범죄자만 공격
  hostileTo(att, tgt) {
    if (!att || !tgt || tgt.dead || tgt.docked || att === tgt) return false;
    const fa = this.faction(att), ft = this.faction(tgt);
    if (fa === 'player' && ft === 'player') return this.canDamage(att, tgt);
    if (fa === 'player') return ft !== 'police';
    if (fa === 'pirate') return ft !== 'pirate';
    if (ft === 'pirate') return true;
    if (ft === 'player') return tgt.crimUntil > now();
    return false;
  }

  damage(tgt, amount, attId, wKey) {
    const att = this.entity(attId);
    if (att && !att.npc && !tgt.npc) {
      if (!this.canDamage(att, tgt)) return;
      // 로우섹 선제공격 → 범죄자 플래그
      if (tgt.sec > 0 && tgt.crimUntil < now()) {
        if (att.crimUntil < now()) this.toast(att, '로우섹에서 무고한 파일럿을 공격했습니다. 범죄자로 지정됩니다! (5분)', 'warn');
        att.crimUntil = now() + 300;
      }
    }
    if (att && (att.npc || tgt.npc) && !this.hostileTo(att, tgt)) return;
    tgt.lastHitT = now();
    tgt.lastHitBy = attId;
    if (tgt.npc && att && (!tgt.target || !this.entity(tgt.target))) tgt.target = att.id;
    if (tgt.warp === WARP.CHARGE) { tgt.warp = WARP.NONE; if (!tgt.npc) this.toast(tgt, '워프 방해! 충전이 취소되었습니다.', 'warn'); }
    let d = amount;
    if (tgt.shield > 0) { const s = Math.min(tgt.shield, d); tgt.shield -= s; d -= s; }
    tgt.hull -= d;
    if (tgt.hull <= 0) this.kill(tgt, att);
  }

  kill(tgt, att) {
    const bigR = tgt.npc ? tgt.spec.radius : tgt.spec.radius;
    this.fx.push({ k: 'b', x: Math.round(tgt.x), y: Math.round(tgt.y), r: bigR });
    if (tgt.npc) {
      this.npcs.delete(tgt.id);
      if (tgt.slot) { tgt.slot.npc = null; tgt.slot.respawnAt = now() + tgt.slot.delay * rand(0.8, 1.3); }
      if (tgt.botSlot) { tgt.botSlot.npc = null; tgt.botSlot.respawnAt = now() + rand(90, 160); }
      for (const [item, ch, mn, mx] of tgt.spec.loot) if (Math.random() < ch) this.dropLoot(tgt.x, tgt.y, item, randi(mn, mx));
      if (att && !att.npc) {
        let bounty = tgt.spec.bounty;
        const sysId = tgt.sys;
        const beacon = sysId && this.sysById[sysId].beacon;
        const sov = beacon && this.sov[beacon];
        if (sov && sov.owner && this.clans[sov.owner]) {
          this.clans[sov.owner].bank += Math.round(bounty * 0.1);
          if (att.acct.clan === sov.owner) bounty = Math.round(bounty * 1.15);
        }
        this.credit(att, bounty, `${tgt.bot ? tgt.name : tgt.spec.name} 격추`);
        if (tgt.bot) this.sysChat(`⚔ ${att.acct.clan ? `[${att.acct.clan}] ` : ''}${att.name} 님이 로그 파일럿 [${tgt.tag}] ${tgt.name}의 ${tgt.spec.name}을(를) 격추했습니다! (+${bounty.toLocaleString()} ¢)`);
        att.acct.stats.pve++;
        this.progressMission(att, 'bounty', sysId);
        if (tgt.type === 'kaiju') this.sysChat(`☠ ${att.acct.clan ? `[${att.acct.clan}] ` : ''}${att.name} 님이 워로드 「카이주」를 격추했습니다! (+${bounty.toLocaleString()} ¢)`);
      }
      return;
    }
    // 플레이어 사망
    const a = tgt.acct;
    tgt.dead = true;
    tgt.respawnAt = now() + 5;
    tgt.warp = WARP.NONE; tgt.ap = null; tgt.mining = -1; tgt.hack = null;
    a.stats.deaths++;
    for (const [item, qty] of Object.entries(a.cargo)) {
      if (item.startsWith('pkg:')) continue;
      if (Math.random() < 0.7) this.dropLoot(tgt.x, tgt.y, item, Math.max(1, Math.round(qty * rand(0.5, 1))));
    }
    for (const mis of [...a.missions]) if (mis.type === 'delivery') this.failMission(tgt, mis.id, '함선 파괴로 배송 화물을 잃었습니다. 임무 실패.');
    a.cargo = {};
    const shipRec = a.ships.find((s) => s.id === a.active);
    const shipSpec = SHIPS[tgt.type];
    let lossMsg = '';
    if (shipRec && shipRec.type !== 'shuttle') {
      a.ships = a.ships.filter((s) => s !== shipRec);
      if (shipRec.ins) {
        const pay = Math.round(shipSpec.price * 0.75);
        a.credits += pay;
        lossMsg = `보험금 +${pay.toLocaleString()} ¢`;
      } else lossMsg = '보험 미가입 — 함선을 잃었습니다.';
    }
    const shuttle = this.ensureShuttle(a);
    shuttle.hp = SHIPS.shuttle.hull;
    a.active = shuttle.id;
    let killer = '알 수 없는 원인';
    if (att) {
      if (att.bot) {
        killer = `[${att.tag}] ${att.name} (로그 파일럿)`;
        this.sysChat(`☠ 로그 파일럿 [${att.tag}] ${att.name} 이(가) ${a.clan ? `[${a.clan}] ` : ''}${tgt.name} 님의 ${shipSpec.name}을(를) 격추했습니다! (${tgt.sys ? this.sysById[tgt.sys].name : '딥 스페이스'})`);
        this.botSay(att, 'kill');
        att.target = null;
      } else if (att.npc) killer = att.spec.name;
      else {
        killer = att.name;
        att.acct.stats.kills++;
        const reward = Math.round(shipSpec.price * 0.08) + (tgt.crimUntil > now() ? 3000 : 250);
        this.credit(att, reward, `${tgt.name} 격추`);
        if (att.acct.clan && this.clans[att.acct.clan]) this.clans[att.acct.clan].kills = (this.clans[att.acct.clan].kills || 0) + 1;
        const tagA = att.acct.clan ? `[${att.acct.clan}] ` : '';
        const tagV = a.clan ? `[${a.clan}] ` : '';
        this.sysChat(`⚔ ${tagA}${att.name} 님이 ${tagV}${tgt.name} 님의 ${shipSpec.name}을(를) 격추했습니다! (${tgt.sys ? this.sysById[tgt.sys].name : '딥 스페이스'})`);
      }
    }
    this.send(tgt.conn, { t: 'dead', killer, ship: shipSpec.name, loss: lossMsg, respawn: this.stById[a.home]?.name || '' });
    tgt.dirty = true;
  }

  respawn(p) {
    const a = p.acct;
    p.dead = false;
    const ship = a.ships.find((s) => s.id === a.active);
    p.type = ship.type; p.spec = SHIPS[ship.type];
    p.hull = p.spec.hull; p.shield = p.spec.shield; p.energy = p.spec.energy;
    p.crimUntil = 0; p.cds = [];
    const st = this.stById[a.home] || this.stById.st0;
    p.docked = st.id;
    const sp = bodyPos(st, this.world.bodies, this.time());
    p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0;
    this.updateSystem(p, true);
    this.send(p.conn, { t: 'respawned' });
    this.sendAcct(p);
    this.sendStation(p);
  }

  // ------------------------------------------------------------
  //  위치 → 성계
  // ------------------------------------------------------------
  updateSystem(p, silent) {
    let best = null, bd = Infinity, near = null, nd = Infinity;
    for (const s of this.world.systems) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < SYSTEM_RADIUS && d < bd) { bd = d; best = s; }
      if (d < nd) { nd = d; near = s; }
    }
    const prev = p.sys;
    p.sys = best ? best.id : null;
    p.sec = best ? best.sec : Math.round(clamp(near.sec - 0.2, -1, 1) * 10) / 10;
    if (!silent && prev !== p.sys) {
      if (best) {
        this.send(p.conn, { t: 'enter', sys: best.id });
        if (!p.acct.discovered.includes(best.id)) {
          p.acct.discovered.push(best.id);
          const bonus = Math.round(800 * (1 + (1 - clamp(best.sec, -0.5, 1)) * 1.5));
          this.credit(p, bonus, '신규 성계 발견');
          this.toast(p, `★ 신규 성계 발견: ${best.name} (+${bonus.toLocaleString()} ¢)`, 'good');
        }
      } else this.send(p.conn, { t: 'enter', sys: null });
    }
  }

  // ------------------------------------------------------------
  //  메인 루프
  // ------------------------------------------------------------
  tick(dt) {
    const t = now();
    const T = this.time();

    // --- 플레이어 ---
    for (const p of this.players.values()) {
      if (p.dead) { if (t >= p.respawnAt) this.respawn(p); continue; }
      if (p.docked) {
        const sp = bodyPos(this.stById[p.docked], this.world.bodies, T);
        p.x = sp.x; p.y = sp.y;
        continue;
      }
      const spec = p.spec;
      // 재생
      p.energy = Math.min(spec.energy, p.energy + spec.energyRegen * dt);
      if (t - p.lastHitT > 4) p.shield = Math.min(spec.shield, p.shield + spec.shieldRegen * dt * (t - p.lastHitT > 10 ? 2.5 : 1));

      if (p.ap) this.runAutopilot(p);
      if (p.docked) continue;
      const keys = p.ap ? p.apKeys | (p.keys & K.FIRE) : p.keys;
      const aim = p.ap ? p.apAim : p.aim;

      // 워프 상태
      if (p.warp === WARP.CHARGE) {
        p.warpT -= dt;
        if (p.warpT <= 0) { p.warp = WARP.ACTIVE; this.fx.push({ k: 'w', x: Math.round(p.x), y: Math.round(p.y), a: p.a }); }
      } else if (p.warp === WARP.EXIT) {
        if (Math.hypot(p.vx, p.vy) <= spec.maxSpeed * 1.05) p.warp = WARP.NONE;
      }
      // 부스트
      p.boosting = false;
      if ((keys & K.BOOST) && p.warp === WARP.NONE && p.energy > 5) { p.boosting = true; p.energy -= 28 * dt; }

      stepShip(p, spec, keys, aim, dt, p.boosting);

      // 은하 경계
      const gr = Math.hypot(p.x, p.y);
      if (gr > GALAXY_RADIUS * 1.15) {
        if (p.warp === WARP.ACTIVE) { p.warp = WARP.EXIT; this.toast(p, '은하 경계에 도달했습니다. 워프 해제.', 'warn'); }
        p.vx -= (p.x / gr) * 600 * dt; p.vy -= (p.y / gr) * 600 * dt;
      }
      // 항성 근접
      if (t - p.sysCheck > 0.25) { p.sysCheck = t; this.updateSystem(p); }
      if (p.sys) {
        const s = this.sysById[p.sys];
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        const inbound = (s.x - p.x) * p.vx + (s.y - p.y) * p.vy > 0;
        if (p.warp === WARP.ACTIVE && inbound && d < s.starR * 2.2) { p.warp = WARP.EXIT; this.toast(p, '항성 중력장 — 강제 워프 해제!', 'warn'); }
        if (d < s.starR * 1.05) { this.damage(p, 120 * dt, null); if (p.dead) continue; }
      }

      // 사격
      if ((keys & K.FIRE) && p.warp === WARP.NONE) {
        spec.hardpoints.forEach(([wKey, offs], i) => {
          const w = WEAPONS[wKey];
          if ((p.cds[i] || 0) > t || p.energy < w.energy) return;
          p.cds[i] = t + w.cd;
          p.energy -= w.energy;
          this.fire(p, wKey, offs);
        });
      }

      // 채굴
      if (p.mining >= 0) {
        const ast = this.world.asteroids[p.mining];
        const d = Math.hypot(ast.x - p.x, ast.y - p.y) - ast.r;
        const free = spec.cargo - cargoUsed(p.acct);
        if (d > spec.miningRange || this.astAmt[ast.id] <= 0 || p.warp !== WARP.NONE || free <= 0) {
          if (free <= 0) this.toast(p, '화물칸이 가득 찼습니다. 스테이션에서 판매하세요.', 'warn');
          else if (this.astAmt[ast.id] <= 0) this.toast(p, '소행성이 고갈되었습니다.', 'info');
          p.mining = -1;
        } else if (p.energy > 0) {
          p.energy = Math.max(0, p.energy - 3 * dt);
          p.mineAcc += spec.mining * ITEMS[ast.ore].hard * dt;
          if (p.mineAcc >= 1) {
            const n = Math.min(Math.floor(p.mineAcc), this.astAmt[ast.id]);
            p.mineAcc -= Math.floor(p.mineAcc);
            const got = this.addCargo(p, ast.ore, n);
            this.astAmt[ast.id] -= got;
            p.acct.stats.mined += got;
            if (this.astAmt[ast.id] <= 0) this.astRespawn.set(ast.id, t + 240);
          }
        }
      }

      // 해킹
      if (p.hack) {
        const an = this.anomalies.get(p.hack);
        if (!an || Math.hypot(an.x - p.x, an.y - p.y) > INTERACT_RANGE * 1.4 || p.warp !== WARP.NONE) {
          if (an) an.hacker = null;
          p.hack = null;
          this.toast(p, '해킹 중단 — 신호에서 너무 멀어졌습니다.', 'warn');
        } else {
          p.hackT += dt;
          const need = an.type === 'wreck' ? 3 : an.type === 'cache' ? 4.5 : 7;
          if (p.hackT >= need) { p.hack = null; this.hackReward(p, an); }
        }
      }

      // 스캔 만료
      for (const [id, exp] of p.scanned) if (exp < t || !this.anomalies.has(id)) p.scanned.delete(id);
    }

    // --- NPC ---
    this.tickNpcs(dt, t);

    // --- 투사체 ---
    this.tickProjectiles(dt);

    // --- 전리품 ---
    for (const l of this.loots.values()) {
      if (l.expires < t) { this.loots.delete(l.id); continue; }
      let pulled = false;
      for (const p of this.players.values()) {
        if (p.docked || p.dead) continue;
        const dx = p.x - l.x, dy = p.y - l.y;
        const d = Math.hypot(dx, dy);
        if (d < LOOT_PICKUP_RANGE + p.spec.radius) {
          const n = this.addCargo(p, l.item, l.qty);
          if (n > 0) {
            l.qty -= n;
            this.send(p.conn, { t: 'pickup', item: l.item, qty: n });
            if (l.qty <= 0) { this.loots.delete(l.id); break; }
          }
        } else if (d < 450 && cargoUsed(p.acct) < p.spec.cargo) {
          l.vx += (dx / d) * 500 * dt; l.vy += (dy / d) * 500 * dt; pulled = true;
        }
      }
      const f = Math.exp(-(pulled ? 1.5 : 0.5) * dt);
      l.vx *= f; l.vy *= f;
      l.x += l.vx * dt; l.y += l.vy * dt;
    }

    // --- 느린 업데이트 (1초) ---
    if (t - this.lastSlow >= 1) {
      this.lastSlow = t;
      for (const [id, at] of this.astRespawn) if (at <= t) { this.astAmt[id] = this.world.asteroids[id].max; this.astRespawn.delete(id); }
      for (const slot of this.spawnSlots) {
        if (slot.npc || slot.respawnAt > t) continue;
        const pos = this.slotSpawnPos(slot);
        slot.npc = this.spawnNpc(slot.type, pos.x, pos.y, slot);
      }
      for (const slot of this.botSlots) if (!slot.npc && slot.respawnAt <= t) slot.npc = this.spawnBot(slot);
      this.tickSov();
    }
    if (t - this.lastMarket >= 20) {
      this.lastMarket = t;
      for (const stId in this.markets) for (const item in this.markets[stId]) {
        const e = this.markets[stId][item];
        e.stock += Math.round((e.target - e.stock) * 0.03 + (Math.random() - 0.5) * 3);
        e.stock = Math.max(0, e.stock);
      }
      // 클랜 주권 수입
      for (const k in this.sov) { const o = this.sov[k].owner; if (o && this.clans[o]) this.clans[o].bank += 60; }
    }
    if (t - this.lastInfo >= 4) { this.lastInfo = t; this.broadcastInfo(); }

    // --- 계정 변경 전송 ---
    for (const p of this.players.values()) if (p.dirty) this.sendAcct(p);

    // --- 스냅샷 ---
    this.sendSnapshots(T);
    this.fx.length = 0;
  }

  tickSov() {
    for (const b of this.world.beacons) {
      const s = this.sov[b.id];
      const present = new Set();
      for (const p of this.players.values()) {
        if (p.docked || p.dead || !p.acct.clan) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) < 1800) present.add(p.acct.clan);
      }
      s.contested = present.size > 1;
      if (present.size !== 1) continue;
      const clan = [...present][0];
      if (s.owner === clan) { s.prog = Math.min(100, s.prog + 5); s.cap = null; continue; }
      if (s.owner) {
        s.prog -= 2;
        s.cap = clan;
        if (s.prog <= 0) {
          this.sysChat(`⚑ [${s.owner}] 이(가) ${b.name}의 주권을 잃었습니다!`);
          s.owner = null; s.prog = 0;
        }
      } else {
        if (s.cap !== clan) { s.cap = clan; s.prog = 0; }
        s.prog += 2;
        if (s.prog >= 100) {
          s.owner = clan; s.prog = 100; s.cap = null;
          this.sysChat(`⚑ 클랜 [${clan}] 이(가) ${b.name}을(를) 점령했습니다!`);
          this.broadcastClan(clan);
        }
      }
    }
  }

  tickNpcs(dt, t) {
    const active = [];
    for (const p of this.players.values()) if (!p.docked && !p.dead) active.push(p);
    const awake = [];
    for (const n of this.npcs.values()) {
      if (n.expires && n.expires < t) { this.npcs.delete(n.id); continue; }
      // 근처에 플레이어가 없으면 휴면 (봇은 휴면 중에도 목적지로 이동)
      let near = false;
      for (const p of active) if (Math.abs(p.x - n.x) < 18000 && Math.abs(p.y - n.y) < 18000) { near = true; break; }
      n.sleep = !near;
      if (n.sleep) { if (n.bot) this.botSleepTravel(n, dt, t); continue; }
      awake.push(n);
    }
    for (const n of awake) {
      if (!this.npcs.has(n.id)) continue;
      if (n.bot) this.botAI(n, dt, t, active, awake); else this.npcAI(n, dt, t, active, awake);
    }
  }

  validTarget(n, tgt) {
    return !!tgt && (this.players.has(tgt.id) || this.npcs.has(tgt.id)) && !tgt.dead && !tgt.docked && tgt.warp !== WARP.ACTIVE
      && this.hostileTo(n, tgt) && Math.hypot(tgt.x - n.x, tgt.y - n.y) < n.spec.aggro * 2.5;
  }

  findTarget(n, active, awake) {
    let best = null, bd = n.spec.aggro * n.spec.aggro;
    for (const p of active) {
      if (p.warp === WARP.ACTIVE) continue;
      if (n.bot && !pvpAllowed(p.sec)) continue;       // 봇은 하이섹에서 먼저 공격하지 않음
      const d = dist2(p.x, p.y, n.x, n.y);
      if (d < bd && this.hostileTo(n, p)) { bd = d; best = p; }
    }
    for (const e of awake) {
      if (e === n || e.warp === WARP.ACTIVE) continue;
      const d = dist2(e.x, e.y, n.x, n.y);
      if (d < bd && this.hostileTo(n, e)) { bd = d; best = e; }
    }
    return best;
  }

  // 선회 공격 기동: 목표 주위를 돌며 리드 조준
  combatSteer(n, tgt, dt, wKey) {
    const spec = n.spec;
    const dx = tgt.x - n.x, dy = tgt.y - n.y;
    const d = Math.hypot(dx, dy);
    const want = spec.range * 0.6;
    const g = Math.atan2(-dy, -dx) + n.orbitDir * 0.9;
    const gx = tgt.x + Math.cos(g) * want, gy = tgt.y + Math.sin(g) * want;
    const w = WEAPONS[wKey];
    const tt = d / w.speed;
    const lx = tgt.x + tgt.vx * tt * 0.8, ly = tgt.y + tgt.vy * tt * 0.8;
    const fireAim = Math.atan2(ly - n.y, lx - n.x);
    const aim = d < spec.range * 1.3 ? fireAim : Math.atan2(gy - n.y, gx - n.x);
    const keys = d > want ? K.UP : (K.UP | (n.orbitDir > 0 ? K.LEFT : K.RIGHT));
    if (Math.random() < dt * 0.15) n.orbitDir *= -1;
    return { keys, aim, d, canFire: d < spec.range && Math.abs(angDiff(fireAim, n.a)) < 0.35 };
  }

  npcAI(n, dt, t, active, awake) {
    const spec = n.spec;
    if (t - n.lastHitT > 6) n.shield = Math.min(spec.shield, n.shield + spec.shield * 0.02 * dt);
    let tgt = n.target ? this.entity(n.target) : null;
    if (!this.validTarget(n, tgt)) { tgt = null; n.target = null; }
    n.scanT -= dt;
    if (!tgt && n.scanT <= 0) { n.scanT = 0.5; tgt = this.findTarget(n, active, awake); if (tgt) n.target = tgt.id; }
    const leash = spec.faction === 'police' ? 14000 : 9000;
    if (Math.hypot(n.homeX - n.x, n.homeY - n.y) > leash && n.slot) { n.target = null; tgt = null; }

    let keys, aim;
    if (tgt) {
      const c = this.combatSteer(n, tgt, dt, spec.weapon);
      keys = c.keys; aim = c.aim;
      n.cd -= dt;
      if (c.canFire && n.cd <= 0) {
        n.cd = WEAPONS[spec.weapon].cd * rand(1, 1.4);
        this.fire(n, spec.weapon, [[spec.radius, 0]], tgt.id);
      }
      if (spec.weapon2) {
        n.cd2 -= dt;
        if (c.d < spec.range && n.cd2 <= 0) { n.cd2 = WEAPONS[spec.weapon2].cd; this.fire(n, spec.weapon2, [[spec.radius * 0.6, -spec.radius * 0.5], [spec.radius * 0.6, spec.radius * 0.5]], tgt.id); }
      }
    } else {
      n.wanderT -= dt;
      const R = spec.faction === 'police' ? 6000 : 2500;
      if (n.wanderT <= 0) { n.wanderT = rand(3, 8); const g = Math.random() * 6.28, r = rand(200, R); n.wanderX = n.homeX + Math.cos(g) * r; n.wanderY = n.homeY + Math.sin(g) * r; }
      aim = Math.atan2(n.wanderY - n.y, n.wanderX - n.x);
      keys = Math.hypot(n.wanderX - n.x, n.wanderY - n.y) > 200 ? K.UP : 0;
    }
    n.keys = keys;
    stepShip(n, spec, keys, aim, dt, false);
    const sp = Math.hypot(n.vx, n.vy);
    const cap = tgt ? spec.maxSpeed : spec.maxSpeed * 0.45;
    if (sp > cap) { n.vx *= cap / sp; n.vy *= cap / sp; }
  }

  botAI(n, dt, t, active, awake) {
    const spec = n.spec;
    if (t - n.lastHitT > 5) n.shield = Math.min(spec.shield, n.shield + spec.shieldRegen * dt);
    n.sysT -= dt; if (n.sysT <= 0) { n.sysT = 1; this.updateNpcSys(n); }
    // 피해가 크면 도주
    if (n.hull < spec.hull * 0.3 && n.mode !== 'flee') { n.mode = 'flee'; n.target = null; this.botPickDest(n, true); this.botSay(n, 'flee'); }

    let tgt = null;
    if (n.mode !== 'flee' && n.warp !== WARP.ACTIVE) {
      tgt = n.target ? this.entity(n.target) : null;
      if (!this.validTarget(n, tgt)) { tgt = null; n.target = null; }
      n.scanT -= dt;
      if (!tgt && n.scanT <= 0) {
        n.scanT = 0.6;
        tgt = this.findTarget(n, active, awake);
        if (tgt) { n.target = tgt.id; if (!tgt.npc) this.botSay(n, 'engage'); }
      }
    }

    let keys = 0, aim = n.a;
    if (tgt) {
      if (n.warp === WARP.CHARGE) n.warp = WARP.NONE;
      const c = this.combatSteer(n, tgt, dt, spec.hardpoints[0][0]);
      keys = c.keys; aim = c.aim;
      if (c.canFire && n.warp === WARP.NONE) {
        spec.hardpoints.forEach(([wKey, offs], i) => {
          if ((n.cds[i] || 0) > t) return;
          n.cds[i] = t + WEAPONS[wKey].cd * rand(1.15, 1.6);
          this.fire(n, wKey, offs, tgt.id);
        });
      }
    } else if (n.mode === 'patrol') {
      n.patrolT -= dt;
      n.wanderT -= dt;
      if (n.wanderT <= 0) { n.wanderT = rand(4, 10); const g = Math.random() * 6.28, r = rand(300, 3500); n.wanderX = n.destX + Math.cos(g) * r; n.wanderY = n.destY + Math.sin(g) * r; }
      if (n.warp === WARP.NONE) {
        aim = Math.atan2(n.wanderY - n.y, n.wanderX - n.x);
        keys = Math.hypot(n.wanderX - n.x, n.wanderY - n.y) > 250 ? K.UP : 0;
      }
      if (n.patrolT <= 0) this.botPickDest(n, false);
    } else {
      const nav = this.navigate(n, n.destX, n.destY, 1500);
      keys = nav.keys; aim = nav.aim;
      if (nav.arrived) { n.mode = 'patrol'; n.patrolT = rand(40, 140); n.wanderT = 0; }
    }
    // 워프 상태
    if (n.warp === WARP.CHARGE) { n.warpT -= dt; if (n.warpT <= 0) { n.warp = WARP.ACTIVE; this.fx.push({ k: 'w', x: Math.round(n.x), y: Math.round(n.y), a: n.a }); } }
    else if (n.warp === WARP.EXIT && Math.hypot(n.vx, n.vy) <= spec.maxSpeed * 1.05) n.warp = WARP.NONE;
    if (n.warp === WARP.ACTIVE && n.sys) {
      const s = this.sysById[n.sys];
      if (Math.hypot(s.x - n.x, s.y - n.y) < s.starR * 2.2 && (s.x - n.x) * n.vx + (s.y - n.y) * n.vy > 0) n.warp = WARP.EXIT;
    }
    n.keys = keys;
    stepShip(n, spec, keys, aim, dt, false);
    if (n.warp === WARP.NONE && !tgt && n.mode === 'patrol') {
      const sp = Math.hypot(n.vx, n.vy), cap = spec.maxSpeed * 0.5;
      if (sp > cap) { n.vx *= cap / sp; n.vy *= cap / sp; }
    }
  }

  tickProjectiles(dt) {
    const targets = [];
    for (const p of this.players.values()) if (!p.docked && !p.dead) targets.push(p);
    for (const n of this.npcs.values()) if (!n.sleep) targets.push(n);
    const out = [];
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.life <= 0) continue;
      const w = WEAPONS[pr.w];
      if (w.homing && pr.target) {
        const tg = this.entity(pr.target);
        if (tg && !tg.dead && !tg.docked) {
          const want = Math.atan2(tg.y - pr.y, tg.x - pr.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          const na = cur + clamp(angDiff(want, cur), -w.homing * dt, w.homing * dt);
          const sp = Math.min(w.speed * 1.6, Math.hypot(pr.vx, pr.vy) + 300 * dt);
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      const ox = pr.x, oy = pr.y;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.a = Math.atan2(pr.vy, pr.vx);
      // 선분-원 충돌
      let hit = null;
      const sx = pr.x - ox, sy = pr.y - oy, sl = sx * sx + sy * sy || 1;
      const shooter = this.entity(pr.owner);
      for (const e of targets) {
        if (e.id === pr.owner) continue;
        if (shooter) { if (!this.hostileTo(shooter, e)) continue; }
        else {
          // 발사자가 이미 사라진 경우 진영으로 판정
          const ft = this.faction(e);
          if (pr.fac === 'player' || ft === pr.fac) continue;
          if (pr.fac === 'police' && ft === 'player' && !(e.crimUntil > now())) continue;
        }
        const r = e.spec.radius + w.size;
        if (Math.abs(e.x - pr.x) > r + 400 || Math.abs(e.y - pr.y) > r + 400) continue;
        let u = ((e.x - ox) * sx + (e.y - oy) * sy) / sl;
        u = clamp(u, 0, 1);
        const cx = ox + sx * u - e.x, cy = oy + sy * u - e.y;
        if (cx * cx + cy * cy <= r * r) { hit = e; pr.x = ox + sx * u; pr.y = oy + sy * u; break; }
      }
      if (hit) {
        this.fx.push({ k: 'h', x: Math.round(pr.x), y: Math.round(pr.y), w: pr.w, id: pr.id });
        this.damage(hit, pr.dmg, pr.owner, pr.w);
        continue;
      }
      out.push(pr);
    }
    this.projectiles = out;
  }

  // ------------------------------------------------------------
  //  스냅샷
  // ------------------------------------------------------------
  sendSnapshots(T) {
    const R = AOI_RADIUS;
    const ships = [];
    for (const p of this.players.values()) if (!p.docked && !p.dead) ships.push(p);
    for (const n of this.npcs.values()) if (!n.sleep) ships.push(n);
    const t = now();
    for (const p of this.players.values()) {
      if (p.conn.ws.bufferedAmount > 512 * 1024) continue;
      const vr = p.warp === WARP.ACTIVE ? R * 1.6 : R;
      const sh = [];
      for (const e of ships) {
        if (e === p) continue;
        if (Math.abs(e.x - p.x) > vr || Math.abs(e.y - p.y) > vr) continue;
        const flags = (e.warp === WARP.ACTIVE ? 1 : 0) | (e.warp === WARP.CHARGE ? 2 : 0) | (e.boosting ? 4 : 0) | ((e.keys & K.UP) || (e.apKeys & K.UP) ? 8 : 0) | (!e.npc && e.crimUntil > t ? 16 : 0) | (e.npc && e.target === p.id ? 32 : 0);
        sh.push([
          e.id, Math.round(e.x), Math.round(e.y), Math.round(e.vx), Math.round(e.vy), r1(e.a * 10) / 10,
          e.bot ? 'bot:' + e.type : e.npc ? 'npc:' + e.type : e.type,
          Math.round((e.hull / e.spec.hull) * 100), e.spec.shield ? Math.round((e.shield / e.spec.shield) * 100) : 0,
          flags, e.bot ? e.name : e.npc ? '' : e.name, e.bot ? e.tag : e.npc ? '' : (e.acct.clan || ''), e.npc ? -1 : e.mining,
        ]);
      }
      const ms = [];
      for (const pr of this.projectiles) {
        if (!WEAPONS[pr.w].homing) continue;
        if (Math.abs(pr.x - p.x) > R || Math.abs(pr.y - p.y) > R) continue;
        ms.push([pr.id, Math.round(pr.x), Math.round(pr.y), Math.round(pr.vx), Math.round(pr.vy), pr.w]);
      }
      const lt = [];
      for (const l of this.loots.values()) {
        if (Math.abs(l.x - p.x) > R || Math.abs(l.y - p.y) > R) continue;
        lt.push([l.id, Math.round(l.x), Math.round(l.y), l.item]);
      }
      const dep = [];
      if (p.sys) {
        for (const bId of this.sysById[p.sys].belts) {
          const belt = this.beltById[bId];
          if (Math.abs(belt.x - p.x) > R + belt.r || Math.abs(belt.y - p.y) > R + belt.r) continue;
          for (const [id] of this.astRespawn) if (this.world.asteroids[id].belt === bId) dep.push(id);
        }
      }
      const an = [];
      for (const a of this.anomalies.values()) {
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        if (d < 3000 || p.scanned.has(a.id)) an.push([a.id, Math.round(a.x), Math.round(a.y), a.type, a.name]);
      }
      const fx = [];
      for (const f of this.fx) if (Math.abs(f.x - p.x) < R * 1.2 && Math.abs(f.y - p.y) < R * 1.2) fx.push(f);
      let hackP = 0;
      if (p.hack) { const a = this.anomalies.get(p.hack); if (a) hackP = p.hackT / (a.type === 'wreck' ? 3 : a.type === 'cache' ? 4.5 : 7); }
      const me = {
        x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), a: Math.round(p.a * 1000) / 1000,
        h: Math.round(p.hull), s: Math.round(p.shield), e: Math.round(p.energy), w: p.warp, wt: r1(p.warpT),
        type: p.type, dock: p.docked, dead: p.dead, mine: p.mining, amt: p.mining >= 0 ? this.astAmt[p.mining] : 0,
        hk: Math.round(hackP * 100) / 100, crim: p.crimUntil > t ? Math.ceil(p.crimUntil - t) : 0,
        sys: p.sys, sec: p.sec, boost: p.boosting, scan: Math.max(0, Math.ceil(p.scanCd - t)),
        ap: p.ap ? { name: p.ap.name, kind: p.ap.kind, id: p.ap.id, x: p.ap.x, y: p.ap.y } : null, ak: p.apKeys, aa: Math.round(p.apAim * 1000) / 1000,
      };
      this.send(p.conn, { t: 's', st: T, me, sh, ms, lt, dep, an, fx });
    }
  }
}
