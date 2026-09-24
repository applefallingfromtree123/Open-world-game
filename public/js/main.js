// NEON//VOID 클라이언트 진입점 — 네트워크, 입력, 예측, 게임 루프
import { G, send, serverTime } from './state.js';
import { initRender, render, explosion, sparks, spawnParticle, titleBackground, aimAt } from './render.js';
import * as UI from './ui.js';
import { openMap, closeMap, isMapOpen } from './map.js';
import { initAudio, sfx } from './audio.js';
import { SHIPS, WEAPONS } from '../shared/data.js';
import { K, WARP, stepShip, angDiff } from '../shared/physics.js';

const canvas = document.getElementById('game');
initRender(canvas);
let stopTitle = titleBackground(document.getElementById('title-bg'));
UI.initUI();

// ============================================================
//  네트워크
// ============================================================
let backoff = 800;
let pendingLogin = null;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  G.ws = ws;
  ws.onopen = () => {
    G.connected = true; backoff = 800;
    UI.serverStatus(true);
    let name = null, token = null;
    try { name = localStorage.getItem('nv_name'); token = localStorage.getItem('nv_token'); } catch {}
    if (pendingLogin) { send(pendingLogin); pendingLogin = null; }
    else if (name && token) send({ t: 'resume', name, token });
  };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
  ws.onclose = () => {
    G.connected = false;
    UI.serverStatus(false);
    if (G.loggedIn) UI.showDisconnected(true);
    setTimeout(connect, backoff);
    backoff = Math.min(8000, backoff * 1.6);
  };
}
connect();

export function login(name, pass, mode) {
  const msg = { t: 'login', name, pass, mode };
  if (G.connected) send(msg); else pendingLogin = msg;
}
UI.onLogin(login);

let localEnergy = 0;
const localCd = [];

function handle(m) {
  switch (m.t) {
    case 'welcome': {
      // 탭을 연 상태에서 서버가 새 버전으로 재배포되면 자동 새로고침
      if (G.build && m.build && G.build !== m.build) {
        UI.toast('새 버전이 배포되었습니다. 곧 새로고침합니다...', 'warn');
        setTimeout(() => location.reload(), 1500);
        return;
      }
      G.build = m.build;
      G.id = m.id; G.name = m.name; G.token = m.token;
      try { localStorage.setItem('nv_name', m.name); localStorage.setItem('nv_token', m.token); } catch {}
      setupWorld(m.world);
      G.timeOffset = m.st - performance.now() / 1000;
      G.loggedIn = true;
      G.ships.clear(); G.missiles.clear(); G.loots.clear(); G.anomalies.clear(); G.shots.length = 0;
      if (stopTitle) { stopTitle(); stopTitle = null; }
      UI.enterGame(m.chat);
      UI.showDisconnected(false);
      break;
    }
    case 'loginErr':
      if (m.silent) { try { localStorage.removeItem('nv_token'); } catch {} UI.showLogin(); }
      else UI.loginError(m.msg);
      break;
    case 'kicked':
      G.loggedIn = false;
      try { localStorage.removeItem('nv_token'); } catch {}
      alert(m.msg); location.reload();
      break;
    case 's': onSnapshot(m); break;
    case 'acct': G.acct = m; UI.onAcct(); break;
    case 'station': G.station = m; UI.onStation(); break;
    case 'undocked': UI.closeStation(); sfx.warpOut(); break;
    case 'clan': G.clan = m.clan; UI.onClan(); break;
    case 'clanList': G.clanList = m.list; UI.onClan(); break;
    case 'lb': G.lb = m; UI.onLeaderboard(); break;
    case 'info': G.info = m; UI.onInfo(); break;
    case 'toast': UI.toast(m.msg, m.kind); if (m.kind === 'err') sfx.error(); else if (m.kind === 'warn') sfx.alarm(); break;
    case 'chat': UI.addChat(m); break;
    case 'credit': UI.creditPop(m.amount, m.reason); sfx.coin(); break;
    case 'pickup': UI.toast(`회수: ${UI.itemName(m.item)} x${m.qty}`, 'info'); sfx.pickup(); break;
    case 'scan': {
      sfx.scan();
      G.rings.push({ x: m.x, y: m.y, r: 100, max: m.range, life: 1.6, t: 0, color: '#c070ff' });
      for (const a of m.list) G.anomalies.set(a.id, a);
      UI.toast(m.list.length ? `스캔 완료: 이상 신호 ${m.list.length}개 탐지!` : '스캔 완료: 반경 45km 내 신호 없음', m.list.length ? 'good' : 'info');
      break;
    }
    case 'enter': UI.onEnterSystem(m.sys); break;
    case 'dead': UI.showDeath(m); sfx.boom(3); G.cam.shake = 30; break;
    case 'respawned': UI.hideDeath(); break;
    case 'pong': { const rtt = (performance.now() - m.c) / 1000; G.rtt = G.rtt * 0.7 + rtt * 0.3; break; }
  }
}

function setupWorld(w) {
  G.world = w;
  G.bodies = {};
  for (const p of w.planets) G.bodies[p.id] = p;
  for (const s of w.stations) G.bodies[s.id] = s;
  G.sysById = Object.fromEntries(w.systems.map((s) => [s.id, s]));
  G.stById = Object.fromEntries(w.stations.map((s) => [s.id, s]));
  G.beltById = Object.fromEntries(w.belts.map((b) => [b.id, b]));
  G.beaconById = Object.fromEntries(w.beacons.map((b) => [b.id, b]));
  G.asteroids = [];
  for (const a of w.asteroids) G.asteroids[a[0]] = a;
}

// ============================================================
//  스냅샷 처리
// ============================================================
function onSnapshot(m) {
  const nowS = performance.now() / 1000;
  const est = m.st + G.rtt / 2 - nowS;
  G.timeOffset += (est - G.timeOffset) * 0.05;
  const prev = G.me;
  const me = m.me;
  G.me = me;
  const self = G.self;
  const spec = SHIPS[me.type];

  if (me.dock || me.dead) {
    self.x = me.x; self.y = me.y; self.vx = 0; self.vy = 0;
    if (me.dock && !UI.stationOpen()) UI.openStation();
  } else {
    const lat = Math.min(0.3, G.rtt / 2);
    const tx = me.x + me.vx * lat, ty = me.y + me.vy * lat;
    const ex = tx - self.x, ey = ty - self.y;
    const err = Math.hypot(ex, ey);
    const speed = Math.hypot(me.vx, me.vy);
    if (!prev || prev.dock || prev.dead || err > 1200 + speed * 0.4) {
      self.x = tx; self.y = ty; self.vx = me.vx; self.vy = me.vy; self.a = me.a;
      if (!me.ap) G.input.aim = me.a;
    } else {
      self.x += ex * 0.22; self.y += ey * 0.22;
      self.vx += (me.vx - self.vx) * 0.3; self.vy += (me.vy - self.vy) * 0.3;
      const da = angDiff(me.a, self.a);
      if (me.ap || Math.abs(da) > 1.0) self.a += da * 0.5;
    }
    self.warp = me.w;
  }
  localEnergy = me.e;

  // 이벤트성 변화
  if (prev) {
    if (prev.w !== me.w) {
      if (me.w === WARP.CHARGE) sfx.warpCharge();
      if (me.w === WARP.ACTIVE) { sfx.warpIn(); G.cam.shake = 8; }
      if (me.w === WARP.EXIT) sfx.warpOut();
    }
    if (!me.dead && (me.h < prev.h || me.s < prev.s - 0.5)) {
      G.selfHitT = performance.now() / 1000;
      G.cam.shake = Math.min(20, G.cam.shake + (prev.h - me.h) * 0.3 + 3);
      if (me.h < spec.hull * 0.3 && prev.h >= spec.hull * 0.3) { sfx.alarm(); UI.toast('⚠ 선체 손상 심각! 후퇴하세요!', 'err'); }
    }
    if (prev.dock && !me.dock) UI.closeStation();
    if (!prev.dock && me.dock) sfx.dock();
  }

  // 다른 함선
  const seen = new Set();
  const t = nowS;
  for (const a of m.sh) {
    const [id, x, y, vx, vy, ang, type, hp, sh, flags, name, tag, mine] = a;
    seen.add(id);
    let e = G.ships.get(id);
    if (!e) { e = { id, dx: x, dy: y, da: ang }; G.ships.set(id, e); if (flags & 1) G.rings.push({ x, y, r: 20, max: 400, life: 0.5, t: 0, color: '#00f0ff' }); }
    if (e.hp !== undefined && (hp < e.hp || sh < e.sh)) e.hitT = t;
    Object.assign(e, { sx: x, sy: y, svx: vx, svy: vy, sa: ang, type, hp, sh, flags, name, tag, mine, recv: t });
  }
  for (const id of G.ships.keys()) if (!seen.has(id)) G.ships.delete(id);

  const mseen = new Set();
  for (const [id, x, y, vx, vy, w] of m.ms) {
    mseen.add(id);
    const ms = G.missiles.get(id);
    if (ms) Object.assign(ms, { x, y, vx, vy });
    else { G.missiles.set(id, { x, y, vx, vy, w, dx: x, dy: y }); sfx.shot('missile', 0.5); }
  }
  for (const id of G.missiles.keys()) if (!mseen.has(id)) G.missiles.delete(id);

  G.loots.clear();
  for (const [id, x, y, item] of m.lt) G.loots.set(id, { x, y, item });
  G.dep = new Set(m.dep);
  const anSeen = new Set();
  for (const [id, x, y, type, name] of m.an) { anSeen.add(id); G.anomalies.set(id, { id, x, y, type, name }); }
  for (const id of G.anomalies.keys()) if (!anSeen.has(id)) G.anomalies.delete(id);

  // 효과
  for (const f of m.fx) {
    const d = Math.hypot(f.x - self.x, f.y - self.y);
    const vol = Math.max(0, 1 - d / 5000);
    if (f.k === 's') {
      if (f.o === G.id) continue;
      G.shots.push({ id: f.id, x: f.x, y: f.y, vx: f.vx, vy: f.vy, life: f.l, w: f.w });
      if (vol > 0.05) sfx.shot(f.w, vol * 0.6);
    } else if (f.k === 'h') {
      const i = G.shots.findIndex((s) => s.id === f.id);
      if (i >= 0) G.shots.splice(i, 1);
      else {
        let bi = -1, bd = 200 * 200;
        G.shots.forEach((s, k) => { if (s.local) { const dd = (s.x - f.x) ** 2 + (s.y - f.y) ** 2; if (dd < bd) { bd = dd; bi = k; } } });
        if (bi >= 0) G.shots.splice(bi, 1);
      }
      sparks(f.x, f.y, WEAPONS[f.w]?.color || '#fff');
      if (vol > 0.05) sfx.hit(vol);
    } else if (f.k === 'b') {
      explosion(f.x, f.y, f.r);
      if (vol > 0) sfx.boom(f.r / 20, Math.max(0.2, vol));
      G.cam.shake = Math.min(25, G.cam.shake + vol * f.r * 0.4);
    } else if (f.k === 'w') {
      G.rings.push({ x: f.x, y: f.y, r: 30, max: 900, life: 0.6, t: 0, color: '#00f0ff' });
    } else if (f.k === 'scan' && d > 10) {
      G.rings.push({ x: f.x, y: f.y, r: 50, max: 6000, life: 1.2, t: 0, color: '#c070ff' });
    } else if (f.k === 'hack') {
      for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, s = 100 + Math.random() * 400; spawnParticle(f.x, f.y, Math.cos(a) * s, Math.sin(a) * s, 1, '#c070ff', 3); }
      G.rings.push({ x: f.x, y: f.y, r: 50, max: 700, life: 0.8, t: 0, color: '#c070ff' });
    }
  }
  G.lastSnap = t;
}

// ============================================================
//  입력
// ============================================================
const KEYMAP = { KeyW: K.UP, ArrowUp: K.UP, KeyS: K.DOWN, ArrowDown: K.DOWN, KeyA: K.LEFT, ArrowLeft: K.LEFT, KeyD: K.RIGHT, ArrowRight: K.RIGHT, ShiftLeft: K.BOOST, ShiftRight: K.BOOST, Space: K.FIRE };
let heldKeys = 0;
const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT'); };

window.addEventListener('keydown', (e) => {
  initAudio();
  if (!G.loggedIn) return;
  if (e.code === 'Escape') {
    if (typing()) { document.activeElement.blur(); return; }
    if (isMapOpen()) return closeMap();
    if (UI.menuOpen()) return UI.closeMenu();
    return UI.openMenu();
  }
  if (e.code === 'Enter') {
    if (typing()) return;
    e.preventDefault();
    UI.focusChat();
    return;
  }
  if (typing()) return;
  if (e.code === 'Tab') { e.preventDefault(); if (UI.menuOpen()) UI.closeMenu(); else UI.openMenu(); return; }
  if (e.code === 'KeyM') { if (isMapOpen()) closeMap(); else openMap(); return; }
  if (e.code === 'KeyH') { UI.openMenu('help'); return; }
  if (UI.anyWindowOpen()) return;
  if (KEYMAP[e.code]) { heldKeys |= KEYMAP[e.code]; if (e.code === 'Space') e.preventDefault(); return; }
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyJ': send({ t: 'act', a: 'warp' }); break;
    case 'KeyF': send({ t: 'act', a: 'mine' }); break;
    case 'KeyR': send({ t: 'act', a: 'scan' }); break;
    case 'KeyE': send({ t: 'act', a: 'interact' }); break;
    case 'KeyX': send({ t: 'ap', clear: true }); UI.toast('오토파일럿 해제', 'info'); break;
    case 'KeyG': send({ t: 'ap', nearest: true }); break;
    case 'KeyV': UI.toggleChat(); break;
    case 'KeyC': G.cam.yaw = Math.PI / 2; G.cam.pitch = 0.62; break;
    case 'Equal': case 'NumpadAdd': zoomBy(1.2); break;
    case 'Minus': case 'NumpadSubtract': zoomBy(1 / 1.2); break;
  }
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) heldKeys &= ~KEYMAP[e.code]; });
window.addEventListener('blur', () => { heldKeys = 0; G.input.mouseDown = false; });

// 우클릭 드래그: 3D 카메라 회전
let orbit = null;
canvas.addEventListener('mousemove', (e) => {
  G.input.mx = e.clientX; G.input.my = e.clientY;
  if (orbit) {
    G.cam.yaw += (e.clientX - orbit.x) * 0.006;
    G.cam.pitch = Math.max(0.08, Math.min(1.5, G.cam.pitch + (e.clientY - orbit.y) * 0.005));
    orbit.x = e.clientX; orbit.y = e.clientY;
  }
});
canvas.addEventListener('mousedown', (e) => {
  initAudio();
  if (e.button === 0) G.input.mouseDown = true;
  if (e.button === 2 || e.button === 1) { orbit = { x: e.clientX, y: e.clientY }; e.preventDefault(); }
  if (typing()) document.activeElement.blur();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) G.input.mouseDown = false; if (e.button === 2 || e.button === 1) orbit = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
function zoomBy(f) { G.cam.userDist = Math.max(160, Math.min(60000, G.cam.userDist / f)); }

// 터치 (간단한 모바일 지원: 누르고 있는 방향으로 추진 + 사격)
canvas.addEventListener('touchstart', (e) => { initAudio(); const t = e.touches[0]; G.input.mx = t.clientX; G.input.my = t.clientY; G.touch = true; }, { passive: true });
canvas.addEventListener('touchmove', (e) => { const t = e.touches[0]; G.input.mx = t.clientX; G.input.my = t.clientY; }, { passive: true });
canvas.addEventListener('touchend', () => { G.touch = false; }, { passive: true });

let lastSent = { k: -1, a: 0, t: 0 };
function updateInput() {
  let keys = UI.anyWindowOpen() ? 0 : heldKeys;
  if (!UI.anyWindowOpen() && G.input.mouseDown) keys |= K.FIRE;
  if (G.touch) keys |= K.UP;
  G.input.keys = keys;
  if (G.me && !G.me.dock && (G.input.mx || G.input.my)) G.input.aim = aimAt(G.input.mx, G.input.my);
  const t = performance.now();
  if (keys !== lastSent.k || (Math.abs(angDiff(G.input.aim, lastSent.a)) > 0.01 && t - lastSent.t > 45) || t - lastSent.t > 250) {
    send({ t: 'in', k: keys, a: Math.round(G.input.aim * 1000) / 1000 });
    lastSent = { k: keys, a: G.input.aim, t };
  }
}
setInterval(() => { if (G.connected) send({ t: 'ping', c: performance.now() }); }, 2000);

// 로컬 사격 예측
function predictFire(nowS) {
  const me = G.me;
  if (!me || me.dock || me.dead || me.w !== 0) return;
  if (!(G.input.keys & K.FIRE)) return;
  const spec = SHIPS[me.type];
  const s = G.self;
  const c = Math.cos(s.a), n = Math.sin(s.a);
  spec.hardpoints.forEach(([wk, offs], i) => {
    const w = WEAPONS[wk];
    if ((localCd[i] || 0) > nowS || localEnergy < w.energy) return;
    localCd[i] = nowS + w.cd;
    localEnergy -= w.energy;
    sfx.shot(wk, 0.8);
    if (w.homing) return;
    const count = w.count || 1;
    for (const [ox, oy] of offs) {
      const px = s.x + c * ox - n * oy, py = s.y + n * ox + c * oy;
      for (let k = 0; k < count; k++) {
        const ang = s.a + (count > 1 ? (k / (count - 1) - 0.5) * w.spread * 2 : (Math.random() - 0.5) * w.spread * 2);
        G.shots.push({ local: true, x: px, y: py, vx: Math.cos(ang) * w.speed + s.vx * 0.6, vy: Math.sin(ang) * w.speed + s.vy * 0.6, life: w.life, w: wk });
      }
      spawnParticle(px, py, s.vx, s.vy, 0.12, w.color, 6);
    }
  });
}

// ============================================================
//  게임 루프
// ============================================================
let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000);
  last = ts;
  const t = ts / 1000;
  if (G.loggedIn && G.me) {
    updateInput();
    const me = G.me;
    // 자기 함선 예측
    if (!me.dock && !me.dead) {
      const spec = SHIPS[me.type];
      const keys = me.ap ? me.ak : G.input.keys;
      const aim = me.ap ? me.aa : G.input.aim;
      const boosting = (keys & K.BOOST) && me.w === 0 && me.e > 5;
      let rem = dt;
      while (rem > 0) { const st = Math.min(rem, 1 / 60); stepShip(G.self, spec, keys, aim, st, boosting); rem -= st; }
      predictFire(t);
    }
    // 다른 개체 보간
    const k = Math.min(1, dt * 10);
    for (const e of G.ships.values()) {
      const age = Math.min(0.5, t - e.recv);
      const tx = e.sx + e.svx * age, ty = e.sy + e.svy * age;
      const sp = Math.hypot(e.svx, e.svy);
      if (Math.hypot(tx - e.dx, ty - e.dy) > 1500 + sp * 0.4) { e.dx = tx; e.dy = ty; }
      else { e.dx += (tx - e.dx) * k + e.svx * dt * (1 - k); e.dy += (ty - e.dy) * k + e.svy * dt * (1 - k); }
      e.da += angDiff(e.sa, e.da) * k;
    }
    // 카메라 대상
    G.cam.x = G.self.x; G.cam.y = G.self.y;
    UI.frame(dt, t);
  }
  render(dt, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 디버그/콘솔 편의
window.NV = { G, serverTime };
