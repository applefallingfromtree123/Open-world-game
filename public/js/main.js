// ============================================================
//  STARDRIFT — 메인: 게임 루프 · 조종 · 카메라 · 도킹 · 하이퍼점프 · 저장
// ============================================================
import * as THREE from 'three';
import { E, initEngine, syncAnchors, updateSun, render, setQuality, rel } from './engine.js';
import { initFx, updateFx, setTunnel, explosion, jumpFlash } from './fx.js';
import { initHud, drawHud, HUD } from './hud.js';
import { IN, initInput, hit, down, endFrame, updateStick, releaseLock, centerStick } from './input.js';
import { initHangar, updateHangar, showShip, hangarInput, HG } from './hangar.js';
import { initUI, toast, commsLine, banner, updateHudDom, openStation, closeStation, refreshStation, openMenu, closeMenu } from './ui.js';
import { initMap, openMap, drawMap, renderSide, selectedSystem } from './map.js';
import { DEV, initTouch, updateTouch, askDevice, setDevice, savedDevice } from './touch.js';
import { Net } from './net.js';
import { World, systemData } from './world.js';
import { Missions } from './missions.js';
import { Ship } from './ship.js';
import { steer } from './ai.js';
import { generateGalaxy, findRoute } from './universe.js';
import { S, newSave, fixSave, activeShip, netWorth, rankOf, addRep, isWanted } from './state.js';
import { SHIPS, SHIP_IDS, GOODS, FACTIONS, LAWFUL, SEC_LEVELS, shipStats, defaultLoadout, loadoutValue, OUTPOST_MODULES } from './data.js';
import { initAudio, sfx, audioFrame, muteEngine, setVolumes } from './audio.js';
import { clamp, damp, fmtCr, fmtDist, R, esc } from './util.js';

const $ = (id) => document.getElementById(id);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

const game = {
  state: 'login', galaxy: generateGalaxy(), world: null, missions: null, net: null,
  playerShip: null, docked: false, dockedAt: null, autopilot: null, hyper: null, hyperCharge: 0, hyperTarget: null,
  mapOpen: false, menuOpen: false, discoveries: {}, hint: '', camMode: 0, camDist: 1, deadT: 0,
  get save() { return S.save; },
};
window.STARDRIFT = game;

// ------------------------------------------------------------
//  공용 API (다른 모듈에서 호출)
// ------------------------------------------------------------
game.msg = (text, kind = 'info') => { toast(text, kind); if (kind === 'bad' || kind === 'warn') sfx.warn(); else sfx.msg(); };
game.comms = (ship, text) => {
  const C = { pirate: '#ff6070', police: '#6b9cff', patrol: '#6b9cff', hunter: '#ffb347', wing: '#5dff9d', trader: '#e6ecf5', guardian: '#c070ff' };
  commsLine(ship.name, text, C[ship.brain ? ship.brain.role : ''] || '#9fd8ff', 'npc');
  sfx.msg();
};
game.chatIn = (m) => commsLine(`${m.ch === 'sys' ? '[성계] ' : ''}${m.from}`, m.text, m.from === S.save?.name ? '#5ce1ff' : '#d08bff', 'chat');
game.dirty = () => { game._dirty = true; };
game.reward = (amt, why) => {
  amt = Math.round(amt);
  S.save.credits += amt; S.save.stats.earned += amt;
  toast(`+${fmtCr(amt)} — ${why}`, 'good'); sfx.coin(); game.dirty();
  if (game.docked) refreshStation();
};
game.stationName = (id) => {
  for (const s of game.galaxy.systems) {
    if (!id.startsWith(s.id + '-')) continue;
    const st = systemData(s).stations.find((x) => x.id === id);
    if (st) return `${st.name} (${s.name})`;
  }
  const o = S.save.outposts.find((x) => x.id === id);
  if (o) return `${o.name} (${game.galaxy.byId[o.sys].name})`;
  return '알 수 없음';
};
game.setQuality = (q) => setQuality(q);

// ------------------------------------------------------------
//  초기화
// ------------------------------------------------------------
function boot() {
  const canvas = $('game');
  let q = 'high';
  try { q = JSON.parse(localStorage.getItem('sd_quality') || '"high"'); } catch {}
  initEngine(canvas, q);
  initFx();
  initHud($('hud-canvas'));
  initHangar();
  hangarInput($('station-view'));
  game.world = new World(game);
  game.missions = new Missions(game);
  game.net = new Net(game);
  initUI(game);
  initMap(game);
  initInput(canvas, { onKey, wantLock: () => !DEV.mobile && game.state === 'play' && !game.docked && !game.mapOpen && !game.menuOpen });
  initTouch(game);
  const dev = savedDevice();
  if (dev) setDevice(dev); else askDevice(() => {});
  $('btn-device').onclick = () => askDevice(() => {});
  game.setDevice = setDevice;
  game.net.onStatus = (ok) => {
    $('server-status').className = ok ? 'ok' : 'bad';
    $('server-status-text').textContent = ok ? `서버 연결됨 · 접속 ${game.net.online}명` : '서버 연결 중... (오프라인 플레이 가능)';
  };
  game.net.connect();
  setupLogin();
  // 타이틀 배경: 격납고 쇼케이스
  let si = 0;
  const cycle = () => { if (game.state !== 'login') return; const id = SHIP_IDS[si++ % SHIP_IDS.length]; showShip(id, SHIPS[id].paint); $('showcase').innerHTML = `<b>${SHIPS[id].name}</b> ${SHIPS[id].cls}`; setTimeout(cycle, 7000); };
  cycle();
  HG.auto = true;
  requestAnimationFrame(loop);
}

function setupLogin() {
  const form = $('login-form');
  const nameI = $('login-name'), passI = $('login-pass');
  try { nameI.value = localStorage.getItem('sd_name') || ''; } catch {}
  const go = async (kind) => {
    initAudio();
    const name = nameI.value.trim(), pass = passI.value;
    if (!name || !pass) return setMsg('콜사인과 비밀번호를 입력하세요', true);
    setMsg('접속 중...');
    const r = await game.net.auth(kind, name, pass);
    if (!r.ok) return setMsg(r.err || '실패', true);
    try { localStorage.setItem('sd_name', r.name); } catch {}
    let save = r.save;
    const local = loadLocal(r.name);
    // 서버 저장이 없거나 로컬이 더 최신이면 로컬 사용 (서버 초기화 대비)
    if (local && (!save || (local.updated || 0) > (save.updated || 0) + 5000)) save = local;
    S.offline = false;
    startGame(save ? fixSave(save) : newSave(r.name));
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); go('login'); });
  $('btn-register').onclick = () => go('register');
  $('btn-offline').onclick = () => {
    initAudio();
    const name = (nameI.value.trim() || '오프라인 파일럿').slice(0, 16);
    const local = loadLocal(name);
    S.offline = true;
    startGame(local ? fixSave(local) : newSave(name));
  };
}
function setMsg(t, bad) { $('login-msg').textContent = t; $('login-msg').className = bad ? 'bad' : ''; }
function loadLocal(name) { try { const j = localStorage.getItem('sd_save_' + name.toLowerCase()); return j ? JSON.parse(j) : null; } catch { return null; } }

// ------------------------------------------------------------
//  게임 시작 / 저장
// ------------------------------------------------------------
function startGame(save) {
  S.save = save;
  if (!save.active) save.active = save.ships[0].id;
  // 모바일 기본 그래픽: 낮음 (사용자가 직접 바꾸면 유지)
  if (DEV.mobile && !save.settings.qSet) save.settings.quality = 'low';
  if (DEV.mobile) document.getElementById('nav-panel').classList.add('folded');
  setVolumes(save.settings.sfx, save.settings.music);
  if (save.settings.quality !== E.quality) setQuality(save.settings.quality);
  document.documentElement.style.setProperty('--hud', save.settings.hudColor);
  $('login-screen').classList.add('hidden');
  game.state = 'play';
  const loc = save.loc;
  const sysId = game.galaxy.byId[loc.sys] ? loc.sys : 'S0';
  enterSystem(sysId);
  if (loc.station && findStationEnt(loc.station)) dockAt(findStationEnt(loc.station), true);
  else {
    const P = spawnPlayer();
    if (loc.pos) { P.pos.fromArray(loc.pos); if (loc.quat) P.quat.fromArray(loc.quat); }
    else { const st = game.world.stations[0]; P.pos.copy(st.approach); P.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), st.face); }
    spawnWingmen();
    $('hud').classList.remove('hidden');
  }
  banner(`환영합니다, ${save.name}`, `${game.world.sys.name} 성계 · ${rankOf().name}`, '#5ce1ff');
  if (!save.seenIntro) { save.seenIntro = true; setTimeout(() => showIntro(), 600); }
  saveNow();
}
function showIntro() {
  commsLine('관제소', `${S.save.name} 파일럿, 은하에 오신 것을 환영합니다. 무엇을 할지는 전적으로 당신의 자유입니다.`, '#5ce1ff');
  commsLine('관제소', '시장에서 무역, 소행성 채굴, 해적 사냥, 탐사, 임무... 출항(Undock) 후 H키 도움말은 ESC → 조작법에서.', '#5ce1ff');
}
function persistShip() {
  const P = game.playerShip, rec = activeShip();
  if (!P || !rec) return;
  rec.hull = P.dead ? 1 : clamp(P.hull / P.stats.hull, 0.01, 1);
  rec.fuel = P.fuel;
  rec.ammo = {};
  for (const w of P.weapons) if (w.w.ammo) rec.ammo[w.slot] = w.ammo;
}
function saveNow() {
  if (!S.save) return;
  persistShip();
  const P = game.playerShip;
  if (game.docked && game.dockedAt) S.save.loc = { sys: game.world.sys.id, station: game.dockedAt.id };
  else if (P && !P.dead && game.world.sys && !game.hyper) S.save.loc = { sys: game.world.sys.id, pos: P.pos.toArray().map(Math.round), quat: P.quat.toArray() };
  S.save.updated = Date.now();
  try { localStorage.setItem('sd_save_' + S.save.name.toLowerCase(), JSON.stringify(S.save)); } catch {}
  if (!S.offline) game.net.save(S.save, { worth: netWorth(), rank: rankOf().name, kills: S.save.stats.kills, visited: Object.keys(S.save.visited).length });
  game._dirty = false;
}
game.saveNow = saveNow;
game.logout = () => { saveNow(); try { localStorage.removeItem('sd_token'); } catch {} location.reload(); };

// ------------------------------------------------------------
//  플레이어 함선
// ------------------------------------------------------------
function makePlayerShip() {
  const rec = activeShip();
  const s = new Ship({ id: 'player', type: rec.type, loadout: rec.loadout, paint: rec.paint, name: S.save.name, role: 'player', faction: 'indep', isPlayer: true });
  s.hull = s.stats.hull * (rec.hull ?? 1);
  s.fuel = Math.min(s.stats.fuel, rec.fuel ?? s.stats.fuel);
  rec.cargo = rec.cargo || {};
  s.cargo = rec.cargo;
  for (const w of s.weapons) if (w.w.ammo && rec.ammo && rec.ammo[w.slot] !== undefined) w.ammo = rec.ammo[w.slot];
  s.onEvent = (e) => {
    if (e === 'cruise') { sfx.cruiseEngage(); game.msg('크루즈 드라이브 가동 — 목표를 정면에 두면 자동 감속', 'info'); }
    if (e === 'masslock') game.msg('질량 고정! 스테이션/천체/대형 함선에서 멀어지세요', 'warn');
  };
  return s;
}
function spawnPlayer() {
  const w = game.world;
  if (game.playerShip && w.ships.includes(game.playerShip)) { w.ships.splice(w.ships.indexOf(game.playerShip), 1); w.removeShipModel(game.playerShip); }
  const s = makePlayerShip();
  w.addShip(s);
  w.player = s;
  game.playerShip = s;
  s.model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return s;
}
game.applyLoadout = () => {
  persistShip();
  const old = game.playerShip;
  const s = spawnPlayer();
  if (old) { s.pos.copy(old.pos); s.quat.copy(old.quat); }
  if (game.docked) { s.model.visible = false; const rec = activeShip(); showShip(rec.type, rec.paint); }
};
game.switchShip = (id) => {
  persistShip();
  const cur = activeShip();
  cur.loc = game.dockedAt.id;
  S.save.active = id;
  activeShip().loc = game.dockedAt.id;
  game.applyLoadout();
  toast(`${SHIPS[activeShip().type].name}에 탑승했습니다`, 'good');
  game.dirty();
};
function spawnWingmen() {
  const w = game.world, P = game.playerShip;
  S.save.wingmen = S.save.wingmen.filter((x) => x.until > Date.now());
  S.save.wingmen.forEach((wm, i) => {
    const s = w.spawnNPC('wing', P.pos.clone().add(new THREE.Vector3((i ? 1 : -1) * 40, 10, -60).applyQuaternion(P.quat)), { type: wm.type, name: wm.name, paint: ['#2a3a2a', '#5dff9d'], faction: 'indep' });
    s.quat.copy(P.quat); s.vel.copy(P.vel);
    s.brain.slot = i; s.wingRec = wm;
    for (const k of ['shield', 'hull']) { s.stats[k] *= 1.5; }
    s.hull = s.stats.hull; s.shield = s.stats.shield;
  });
}

// ------------------------------------------------------------
//  성계 진입 · 도킹
// ------------------------------------------------------------
function findStationEnt(id) { return game.world.stations.find((s) => s.id === id); }
function enterSystem(sysId) {
  game.net.clearRemotes();
  game.world.load(sysId);
  const first = !S.save.visited[sysId];
  S.save.visited[sysId] = true;
  if (first && sysId !== 'S0') {
    game.reward(500 + game.galaxy.byId[sysId].pos.length() * 40, '신규 성계 방문');
    if (!S.offline) game.net.discover(sysId); else S.save.discovered[sysId] = true;
  }
  const sys = game.world.sys;
  if (S.save.route && S.save.route[0] === sysId) S.save.route.shift();
}
game.onFirstDiscovery = (sysId) => { S.save.discovered[sysId] = true; game.reward(2500, `최초 발견: ${game.galaxy.byId[sysId].name}`); };

function canDock(st) {
  const d = st.data;
  if (d.outpost) return true;
  if (d.faction === 'pirate') return (S.save.rep.pirate || 0) > -50 ? true : '해적 소굴: "꺼져라, 너 같은 놈은 안 받는다."';
  if (isWanted(d.faction)) return `도킹 거부: ${FACTIONS[d.faction].short} 수배 중 (해적 소굴이나 무소속 스테이션에서 벌금 정산 가능)`;
  if ((S.save.rep[d.faction] || 0) <= -60) return '도킹 거부: 적대 세력';
  return true;
}
function dockAt(st, silent) {
  const P = game.playerShip || spawnPlayer();
  game.docked = true; game.dockedAt = st; game.autopilot = null;
  P.vel.set(0, 0, 0); P.cruise = 0; P.ctrl.throttle = 0;
  P.pos.copy(st.entrance);
  P.model.visible = false;
  // 윙맨 대기
  for (const s of game.world.ships) if (s.brain && s.brain.role === 'wing') { s.dead = true; s.gone = true; }
  releaseLock(); muteEngine();
  activeShip().loc = st.id;
  S.save.loc = { sys: game.world.sys.id, station: st.id };
  if (!st.data.outpost) S.save.lastDock = { sys: game.world.sys.id, station: st.id };
  if (!silent) { sfx.dock(); banner(st.name, '도킹 완료', '#5ce1ff'); }
  game.missions.onDock(st.data);
  if (st.data.outpost) game.collectOutpost(st.data.outpost, false, true);
  const rec = activeShip();
  showShip(rec.type, rec.paint);
  HG.auto = true;
  openStation();
  saveNow();
}
game.undock = () => {
  const st = game.dockedAt;
  if (!st) return;
  // 연료 부족 경고
  closeStation();
  game.docked = false; game.dockedAt = null;
  const P = game.playerShip;
  P.pos.copy(st.entrance).addScaledVector(st.face, 40);
  P.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), st.face);
  P.vel.copy(st.face).multiplyScalar(90);
  P.ctrl.throttle = 0.35;
  P.model.visible = true;
  game.undockT = 6;
  centerStick();
  spawnWingmen();
  sfx.dock();
  game.camSmooth = null;
  if (P.fuel < P.stats.fuel * 0.3) game.msg('연료가 부족합니다 — 서비스 탭에서 보급하세요', 'warn');
  saveNow();
};

// ------------------------------------------------------------
//  이벤트 콜백 (world → game)
// ------------------------------------------------------------
game.onPlayerHit = (attacker) => { game.hitFx = Math.min(1, (game.hitFx || 0) + 0.35); game.shake = Math.min(1.5, (game.shake || 0) + 0.4); if (game.autopilot && attacker) { game.autopilot = null; game.msg('공격받아 오토파일럿 해제', 'warn'); } };
game.onRemoteHit = (m) => {
  const P = game.playerShip, w = game.world;
  if (!P || P.dead || game.docked || w.sys.sec > 1) return;
  const att = w.ships.find((s) => s.isRemote && s.netId === m.from) || null;
  const had = P.shield > 0;
  const res = P.damage(m.dmg, { shield: m.sm, hull: m.hm }, att);
  game.onPlayerHit(att);
  sfx.hit(had, 1);
  if (res === 'dead') { w.kill(P, att); game.net.died(m.fromName); }
};
game.onKill = (s, attacker) => {
  const st = S.save.stats;
  st.kills++;
  const role = s.brain ? s.brain.role : '';
  const sys = game.world.sys;
  if (role === 'pirate' || role === 'guardian') {
    st.pirates++;
    if (s.bounty) {
      if (sys.faction !== 'pirate') { game.reward(s.bounty, `현상금: ${s.name}`); st.bounties += s.bounty; }
      else game.msg(`해적 성계에서는 현상금을 지급받을 수 없습니다`, 'warn');
    }
    if (LAWFUL.includes(sys.faction)) addRep(sys.faction, 1);
    addRep('pirate', -2);
  } else if (role === 'trader' || role === 'miner' || role === 'police' || role === 'patrol' || role === 'explorer') {
    st.lawful++;
    if (LAWFUL.includes(sys.faction) && sys.sec >= 1) {
      const b = 2500 + SHIPS[s.type].price * 0.02 + (role === 'police' ? 5000 : 0);
      S.save.wanted[sys.faction] = Math.round((S.save.wanted[sys.faction] || 0) + b);
      game.msg(`범죄 기록: 살인 — ${FACTIONS[sys.faction].short} 현상금 +${fmtCr(b)}`, 'bad');
    }
    addRep(s.faction, -8); addRep('pirate', 3);
  } else if (role === 'hunter') { addRep('pirate', 2); }
  game.missions.onKill(s);
  game.dirty();
};
game.onMined = (ore) => {
  S.save.stats.mined++;
  game.mineCount = (game.mineCount || 0) + 1;
  clearTimeout(game.mineT);
  game.mineT = setTimeout(() => { toast(`채굴: ${GOODS[ore].name} +${game.mineCount}t`, 'good'); game.mineCount = 0; }, 900);
  sfx.pickup();
};
game.onScoop = (item, n) => { toast(`화물 회수: ${GOODS[item].name} ${n}t`, 'good'); sfx.pickup(); game.dirty(); };
game.fuelScoop = (dt, k) => {
  const P = game.playerShip;
  if (P.fuel < P.stats.fuel && k > 0.2) { P.fuel = Math.min(P.stats.fuel, P.fuel + dt * 0.25 * k); game.hint = '연료 스쿠프 작동 중'; }
};
game.onPlayerDeath = (attacker) => {
  const P = game.playerShip;
  P.dead = true;
  game.deadT = 2.6;
  game.autopilot = null;
  S.save.stats.deaths++;
  sfx.boom(2, 1);
  game.deathBy = attacker ? attacker.name : null;
  releaseLock();
};
function showDeath() {
  const rec = activeShip();
  const value = loadoutValue(rec.type, rec.loadout);
  const cost = rec.type === 'sparrow' ? 0 : Math.round(value * 0.06);
  const home = S.save.loc.station || 'S0-st0';
  $('death').classList.remove('hidden');
  $('death-info').innerHTML = `${game.deathBy ? `<b>${esc(game.deathBy)}</b>에게 격추당했습니다.<br>` : ''}적재한 화물은 모두 잃었습니다.<br>보험금 <b>${fmtCr(cost)}</b>으로 같은 함선을 되찾을 수 있습니다.`;
  $('btn-rebuy').textContent = cost ? `보험 청구 (${fmtCr(cost)})` : '스패로 재지급 (무료)';
  $('btn-rebuy').disabled = S.save.credits < cost;
  $('btn-rebuy').onclick = () => respawn(true, cost);
  $('btn-starter').classList.toggle('hidden', rec.type === 'sparrow');
  $('btn-starter').onclick = () => respawn(false, 0);
}
function respawn(rebuy, cost) {
  $('death').classList.add('hidden');
  const rec = activeShip();
  for (const k in rec.cargo) delete rec.cargo[k];
  if (rebuy) { S.save.credits -= cost; rec.hull = 1; }
  else {
    S.save.ships = S.save.ships.filter((x) => x !== rec);
    const lo = defaultLoadout('sparrow');
    const n = { id: 'h' + Date.now().toString(36), type: 'sparrow', loadout: lo, paint: SHIPS.sparrow.paint.slice(), nick: '', loc: null, hull: 1, fuel: 8, cargo: {}, ammo: {} };
    S.save.ships.push(n); S.save.active = n.id;
  }
  const home = S.save.loc.station && S.save.loc.sys ? S.save.loc : { sys: 'S0', station: 'S0-st0' };
  // 마지막 도킹 스테이션에서 부활
  const lastDock = S.save.lastDock || { sys: 'S0', station: 'S0-st0' };
  game.playerShip = null;
  enterSystem(lastDock.sys);
  const st = findStationEnt(lastDock.station) || game.world.stations[0];
  spawnPlayer();
  activeShip().fuel = game.playerShip.stats.fuel;
  game.playerShip.fuel = game.playerShip.stats.fuel;
  dockAt(st, true);
  game.msg('클론 재생성 완료 — 새 함선이 준비되었습니다', 'info');
  void home;
}

// ------------------------------------------------------------
//  기지
// ------------------------------------------------------------
game.outpostIncome = (o) => {
  const sd = systemData(game.galaxy.byId[o.sys]);
  const pos = new THREE.Vector3().fromArray(o.pos);
  const nearField = sd.fields.some((f) => f.pos.distanceTo(pos) < 40000);
  const rate = Math.round((1200 + (o.modules.refinery || 0) * 4500) * (nearField ? 1.5 : 1));
  const hours = Math.min(72, (Date.now() - o.lastCollect) / 3600e3);
  return { rate, pending: Math.floor(rate * hours), nearField };
};
game.collectOutpost = (o, silent, auto) => {
  const inc = game.outpostIncome(o);
  if (inc.pending >= 1 && !silent) game.reward(inc.pending, `${o.name} 수익`);
  else if (inc.pending >= 1 && silent) S.save.credits += inc.pending;
  o.lastCollect = Date.now();
  game.dirty();
};
game.removeOutpost = (o) => {
  S.save.outposts = S.save.outposts.filter((x) => x !== o);
  for (const sh of S.save.ships) if (sh.loc === o.id) sh.loc = 'S0-st0';
  const st = game.dockedAt;
  game.undock();
  const w = game.world;
  const ent = w.stations.find((s) => s.id === o.id);
  if (ent) { w.stations.splice(w.stations.indexOf(ent), 1); w.nav.splice(w.nav.indexOf(ent), 1); w.outposts.splice(w.outposts.indexOf(ent), 1); explosion(ent.pos, 4); import('./engine.js').then((m) => m.unanchor(ent.model)); }
  void st;
  game.msg('기지를 해체했습니다. 키트가 보관함에 회수되었습니다.', 'info');
  saveNow();
};
function buildOutpostHere() {
  const P = game.playerShip, w = game.world;
  if ((S.save.storage.outpost_kit || 0) <= 0) return game.msg('기지 건설 키트가 없습니다 (산업 단지·군사 요새·해적 소굴에서 구매)', 'warn');
  if (S.save.outposts.length >= 3) return game.msg('개인 기지는 최대 3개입니다', 'warn');
  if (P.cruise) return game.msg('크루즈 중에는 건설할 수 없습니다', 'warn');
  for (const s of w.stations) if (s.pos.distanceTo(P.pos) < 20000) return game.msg('다른 스테이션에서 20km 이상 떨어져야 합니다', 'warn');
  for (const p of w.planets) if (p.pos.distanceTo(P.pos) < p.radius + 8000) return game.msg('행성에서 더 멀리 떨어져야 합니다', 'warn');
  S.save.storage.outpost_kit--;
  const face = P.forward.clone().negate();
  const pos = P.pos.clone().addScaledVector(P.forward, 600);
  const o = { id: 'op' + Date.now().toString(36), sys: w.sys.id, pos: pos.toArray().map(Math.round), face: face.toArray(), name: `${S.save.name}의 기지`, modules: {}, built: Date.now(), lastCollect: Date.now(), storage: {} };
  S.save.outposts.push(o);
  w.addOutpost(o);
  jumpFlash(pos, '#5dff9d', 3);
  banner('기지 건설 완료', o.name, '#5dff9d');
  P.target = w.stations.find((s) => s.id === o.id);
  saveNow();
}

// ------------------------------------------------------------
//  하이퍼점프
// ------------------------------------------------------------
function tryHyperjump() {
  const P = game.playerShip, w = game.world;
  if (!P || P.dead || game.hyper) return;
  if (game.hyperCharge > 0) { game.hyperCharge = 0; game.msg('하이퍼점프 취소', 'info'); return; }
  // 최종 목적지 결정: 저장된 경로 → 지도에서 선택한 성계
  let dest = (S.save.route || []).length ? S.save.route[S.save.route.length - 1] : null;
  const sel = selectedSystem();
  if (!dest && sel && sel.id !== w.sys.id) dest = sel.id;
  if (!dest || dest === w.sys.id) {
    game.msg('목적지가 없습니다 — 은하 지도에서 성계를 클릭한 뒤 H를 누르세요', 'warn');
    if (!game.mapOpen) toggleMap(true);
    return;
  }
  // 현재 위치 기준으로 경로 재계산 (도약 거리 반영)
  const route = findRoute(game.galaxy, w.sys.id, dest, P.stats.jump);
  if (!route || !route.length) { game.msg(`도약 거리(${P.stats.jump.toFixed(1)} ly)로는 ${game.galaxy.byId[dest].name}에 갈 수 없습니다 — 하이퍼드라이브를 업그레이드하세요`, 'warn'); return; }
  S.save.route = route;
  const next = route[0];
  const dist = game.galaxy.byId[next].pos.distanceTo(w.sys.pos);
  const fuel = 0.6 + dist * 0.2 * Math.sqrt(P.spec.mass);
  if (P.fuel < fuel) { game.msg(`연료 부족 (${fuel.toFixed(1)}t 필요, 보유 ${P.fuel.toFixed(1)}t) — 스테이션 서비스 탭에서 보급하세요`, 'bad'); return; }
  if (game.mapOpen) toggleMap(false);
  if (game.docked) game.undock();
  game.hyperCharge = 0.001; game.hyperTarget = next; game.hyperFuel = fuel;
  sfx.hyperCharge();
  game.msg(`하이퍼점프 충전 — ${game.galaxy.byId[next].name}${route.length > 1 ? ` (남은 도약 ${route.length}회)` : ''}`, 'info');
}
game.tryHyperjump = tryHyperjump;
function doHyper(dt) {
  const P = game.playerShip;
  if (game.hyperCharge > 0) {
    if (P.dead || game.docked) { game.hyperCharge = 0; return; }
    // 질량 고정 중에는 충전이 멈춤 (멀어지면 자동 재개)
    if (P.cruise !== 2 && game.world.massLocked(P.pos)) game.hint = '질량 고정 — 스테이션/행성에서 멀어지면 점프 충전이 계속됩니다 (J 크루즈 추천)';
    else game.hyperCharge += dt;
    if (game.hyperCharge >= 4) {
      game.hyperCharge = 0;
      game.hyper = { t: 0, target: game.hyperTarget, loaded: false };
      P.fuel -= game.hyperFuel;
      S.save.stats.jumps++;
      jumpFlash(P.pos, '#9a7bff', 2);
      sfx.jump(1);
      game.autopilot = null;
    }
  }
  const h = game.hyper;
  if (!h) return;
  h.t += dt;
  const a = h.t < 0.6 ? h.t / 0.6 : h.t > 3.4 ? Math.max(0, (4 - h.t) / 0.6) : 1;
  setTunnel(a, '#7a6bff');
  E.post.uniforms.uWarp.value = a;
  if (h.t > 1.2 && !h.loaded) {
    h.loaded = true;
    const keepQuatFwd = P.quat.clone();
    persistShip();
    game.playerShip = null;
    enterSystem(h.target);
    const s = spawnPlayer();
    const sd = game.world.sd;
    s.pos.copy(sd.arrival);
    // 주 스테이션(없으면 첫 행성) 방향을 바라보며 도착
    const look = (game.world.stations[0] || game.world.planets[0] || game.world.star).pos;
    s.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _a.copy(look).sub(sd.arrival).normalize());
    s.target = game.world.stations[0] || null;
    s.cruise = 2; s.cruiseSpeed = 2500; s.ctrl.throttle = 0.5;
    s.vel.copy(s.forward).multiplyScalar(2500);
    void keepQuatFwd;
  }
  if (h.t >= 4) {
    game.hyper = null; setTunnel(0); E.post.uniforms.uWarp.value = 0;
    const sys = game.world.sys;
    banner(sys.name, `${SEC_LEVELS[sys.sec].name} · ${FACTIONS[sys.faction].name}`, FACTIONS[sys.faction].color);
    spawnWingmen();
    if (S.save.route.length) game.msg(`다음 도약: ${game.galaxy.byId[S.save.route[0]].name} (H)`, 'info');
    if (sys.sec === 0) game.msg('⚠ 무법지대 — 보안군이 없습니다', 'warn');
    saveNow();
  }
}
game.plotTo = (sysId) => {
  const r = findRoute(game.galaxy, game.world.sys.id, sysId, game.playerShip.stats.jump);
  if (!r) return game.msg('도약 범위로 도달할 수 없습니다', 'warn');
  S.save.route = r; game.msg(`경로 설정: ${r.length}회 도약 (H키로 점프)`, 'info');
};
game.targetMission = (m) => {
  const w = game.world, P = game.playerShip;
  const t = w.anoms.find((a) => a.mission === m) || w.stations.find((s) => s.id === m.dest) || w.planets.find((p) => p.id === m.body);
  if (t) { P.target = t; game.msg(`항법 목표: ${t.name}`, 'info'); }
  closeMenuFn();
};

// ------------------------------------------------------------
//  입력
// ------------------------------------------------------------
function onKey(e) {
  if (game.state !== 'play') return;
  if (e.code === 'Escape') {
    if (game.mapOpen) return toggleMap(false);
    if (game.menuOpen) return closeMenuFn();
    if (game.autopilot) { game.autopilot = null; game.msg('오토파일럿 해제', 'info'); return; }
    openMenuFn();
    return;
  }
  if (e.code === 'KeyM' && !game.menuOpen) return toggleMap(!game.mapOpen);
  if (e.code === 'KeyH' && !game.menuOpen && (game.mapOpen || game.docked)) { IN.pressed.delete('KeyH'); return tryHyperjump(); }
  if (e.code === 'Enter' && !game.docked) { e.preventDefault(); releaseLock(); $('comms-input').focus(); return; }
}
function openMenuFn(tab) { game.menuOpen = true; releaseLock(); openMenu(tab); }
function closeMenuFn() { game.menuOpen = false; closeMenu(); }
game.closeMenu = closeMenuFn;
function toggleMap(on) {
  game.mapOpen = on;
  $('map').classList.toggle('hidden', !on);
  if (on) { releaseLock(); openMap(); }
}

function pickTargetAhead() {
  const P = game.playerShip, w = game.world;
  const fwd = P.forward.clone();
  let best = null, bs = -1;
  const consider = (o, maxD, minDot) => {
    _a.copy(o.pos).sub(P.pos);
    const d = _a.length(); if (d > maxD || d < 1) return;
    const dot = _a.divideScalar(d).dot(fwd);
    if (dot < minDot) return;
    const score = dot - d / maxD * 0.02;
    if (score > bs) { bs = score; best = o; }
  };
  for (const s of w.ships) if (!s.isPlayer && !s.dead) consider(s, 15000, 0.95);
  for (const c of w.cans) consider(c, 4000, 0.97);
  if (!best) for (const n of w.nav) consider(n, 1e9, 0.985);
  if (best) { P.target = best; sfx.lock(); } else game.msg('정면에 표적이 없습니다', 'info');
}
function cycleTargets() {
  const P = game.playerShip, w = game.world;
  const list = w.ships.filter((s) => !s.isPlayer && !s.dead && s.pos.distanceTo(P.pos) < 8000).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
  if (!list.length) return;
  const i = list.indexOf(P.target);
  P.target = list[(i + 1) % list.length]; sfx.lock();
}
function nearestHostileTarget() {
  const P = game.playerShip, w = game.world;
  let best = null, bd = 12000;
  for (const s of w.ships) { if (s.dead || s.isPlayer) continue; const st = w.stance(s); if (st !== 'hostile' && st !== 'wanted') continue; const d = s.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = s; } }
  if (best) { P.target = best; sfx.lock(); } else game.msg('근처에 적이 없습니다', 'info');
}

function interact() {
  const P = game.playerShip, w = game.world;
  const t = P.target;
  // 신호원 회수
  for (const a of w.anoms) {
    if (a.pos.distanceTo(P.pos) < 600 && (a.type === 'wreck' || a.type === 'cache' || a.type === 'ruins')) {
      if (a.looted) { game.msg('이미 회수한 신호원입니다', 'info'); return; }
      if (a.type === 'ruins' && w.ships.some((s) => s.brain && s.brain.role === 'guardian' && s.pos.distanceTo(a.pos) < 4000)) { game.msg('수호자가 남아 있어 해킹할 수 없습니다', 'warn'); return; }
      w.lootAnom(a);
      game.msg(a.type === 'ruins' ? '고대 유적 해킹 성공! 유물이 방출되었습니다' : '잔해를 회수했습니다 — 화물 컨테이너를 수거하세요', 'good');
      sfx.scanDone();
      return;
    }
  }
  if (!t) { const st = w.nearestStation(P.pos); if (st && st.pos.distanceTo(P.pos) < 8000) P.target = st; else return game.msg('표적이 없습니다 (항법 패널에서 목표 선택)', 'info'); }
  startAutopilot(P.target);
}
function startAutopilot(t) {
  if (!t || t.isShip) { game.msg('오토파일럿은 스테이션·행성·신호원 등에만 사용할 수 있습니다', 'info'); return; }
  if (t.kind === 'station' || t.kind === 'outpost') {
    const ok = canDock(t);
    if (ok !== true) { game.msg(ok, 'bad'); return; }
  }
  game.autopilot = { target: t, phase: 0, label: `오토파일럿 → ${t.name}${t.kind === 'station' || t.kind === 'outpost' ? ' (자동 도킹)' : ''} · ESC/X 해제` };
  sfx.click();
}
function runAutopilot(dt) {
  const ap = game.autopilot, P = game.playerShip, w = game.world, c = P.ctrl;
  const t = ap.target;
  if (!t || (t.isShip) || !w.nav.includes(t) && t.kind !== 'can') { game.autopilot = null; return; }
  const dock = t.kind === 'station' || t.kind === 'outpost';
  const goal = dock ? t.approach : t.pos;
  const stopD = dock ? 0 : t.kind === 'planet' || t.kind === 'moon' ? t.radius + 6000 : t.kind === 'star' ? t.radius * 2.5 : t.kind === 'field' ? t.radius * 0.6 : 500;
  const d = P.pos.distanceTo(goal);
  if (ap.phase === 0) {
    const r = steer(P, goal, { gain: 2.4, bank: false, level: true });
    if (d - stopD > 9000) {
      if (!P.cruise && r.dot > 0.985 && !w.massLocked(P.pos)) { P.cruise = 1; P.cruiseCharge = 0; sfx.cruiseCharge(); }
      if (P.cruise === 1 && w.massLocked(P.pos)) { P.cruise = 0; }
      c.throttle = P.cruise === 2 ? 1 : r.dot > 0.9 ? 1 : 0.2;
      c.boost = !P.cruise && r.dot > 0.95 && w.massLocked(P.pos);
    } else {
      if (P.cruise === 2 && d - stopD < 6000) { w.dropCruise(P); sfx.cruiseDrop(); }
      if (P.cruise === 1) P.cruise = 0;
      c.throttle = dock ? (d > 1500 ? (r.dot > 0.8 ? 1 : 0.2) : clamp(d / 1500, 0.3, 1) * (r.dot > 0.6 ? 1 : 0.2)) : clamp((d - stopD) / 1500, 0, 1) * (r.dot > 0.8 ? 1 : 0.2);
      c.boost = false;
      if (dock && d < 300) ap.phase = 1;
      if (!dock && d < stopD + 200) { game.autopilot = null; game.msg(`목표 도착: ${t.name}`, 'good'); c.throttle = 0; }
    }
  } else {
    const r = steer(P, t.entrance, { gain: 3, bank: false, level: false });
    const de = P.pos.distanceTo(t.entrance);
    c.throttle = r.dot > 0.95 ? clamp(de / 500, 0.15, 0.5) : 0;
    c.boost = false;
  }
}

function flightControls(dt) {
  const P = game.playerShip, st = S.save.settings, c = P.ctrl;
  if (P.dead) return;
  // 키 입력
  if (hit('KeyZ')) { P.fa = !P.fa; game.msg(P.fa ? '비행 보조 ON' : '비행 보조 OFF — 뉴턴 관성 비행', 'info'); }
  if (hit('KeyJ')) {
    if (P.cruise) { if (P.cruise === 2) sfx.cruiseDrop(); w_drop(); }
    else if (game.world.massLocked(P.pos)) game.msg('질량 고정! 스테이션/천체/대형 함선에서 멀어지세요', 'warn');
    else { P.cruise = 1; P.cruiseCharge = 0; sfx.cruiseCharge(); }
  }
  if (hit('KeyH')) tryHyperjump();
  if (hit('KeyT')) pickTargetAhead();
  if (hit('KeyY')) nearestHostileTarget();
  if (hit('Tab')) cycleTargets();
  if (hit('KeyG')) { if (game.autopilot) { game.autopilot = null; game.msg('오토파일럿 해제', 'info'); } else interact(); }
  if (hit('KeyB')) buildOutpostHere();
  if (hit('KeyC')) { game.camMode = (game.camMode + 1) % 3; game.msg(['추적 시점', '원거리 시점', '조종석 시점'][game.camMode], 'info'); }
  if (hit('KeyN')) document.querySelector(`#nav-tabs button:not(.active)`)?.click();
  if (hit('KeyI')) openMenuFn('cargo');
  IN.freelook = down('AltLeft') || down('AltRight');
  if (IN.wheel) game.camDist = clamp(game.camDist * (1 + IN.wheel * 0.1), 0.5, 4);

  const manual = down('KeyW') || down('KeyS') || down('KeyX') || down('KeyA') || down('KeyD');
  if (game.autopilot && manual) { game.autopilot = null; game.msg('오토파일럿 해제', 'info'); }
  if (game.autopilot) { runAutopilot(dt); centerStick(); c.fire1 = IN.lmb || down('Space'); c.fire2 = IN.rmb; return; }

  updateStick(E.W, E.H, st.sens, st.mouseMode);
  if (!DEV.mobile && !IN.active && !IN.locked) game.hint = '화면을 클릭하면 마우스 조종이 시작됩니다';
  const dz = (v) => { const a = Math.abs(v); return a < 0.04 ? 0 : Math.sign(v) * Math.pow((a - 0.04) / 0.96, 1.3); };
  c.yaw = IN.freelook ? 0 : dz(IN.vx);
  c.pitch = IN.freelook ? 0 : dz(IN.vy) * (st.invertY ? 1 : -1);
  c.roll = (down('KeyE') ? 1 : 0) - (down('KeyQ') ? 1 : 0);
  c.sx = (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0);
  c.sy = (down('KeyR') ? 1 : 0) - (down('KeyF') ? 1 : 0);
  if (down('KeyW')) c.throttle = Math.min(1, c.throttle + dt * 0.9);
  if (down('KeyS')) c.throttle = Math.max(P.cruise ? 0.05 : -0.5, c.throttle - dt * 0.9);
  if (hit('KeyX')) c.throttle = 0;
  c.boost = down('ShiftLeft') || down('ShiftRight');
  c.fire1 = IN.lmb || down('Space');
  c.fire2 = IN.rmb;
}
function w_drop() { game.world.dropCruise(game.playerShip); }

// 스캔
function doScan(dt) {
  const P = game.playerShip, t = P.target;
  HUD.scan = 0;
  if (!down('KeyV') || !t || P.dead) { game.scanP = 0; return; }
  if (!(t.kind === 'planet' || t.kind === 'moon' || t.kind === 'star')) { if (!game.scanWarn) { game.msg('스캔: 행성·위성·항성을 표적으로 지정하세요', 'info'); game.scanWarn = true; setTimeout(() => { game.scanWarn = false; }, 3000); } return; }
  if (S.save.explored[t.id]) { if (!game.scanWarn) { game.msg('이미 탐사한 천체입니다', 'info'); game.scanWarn = true; setTimeout(() => { game.scanWarn = false; }, 3000); } return; }
  const d = P.pos.distanceTo(t.pos);
  const maxD = t.radius * (t.kind === 'star' ? 6 : 5) + 10000;
  if (d > maxD) { game.hint = `스캔 거리 밖 — ${fmtDist(d - maxD)} 더 접근`; return; }
  game.scanP = (game.scanP || 0) + dt / (P.stats.scanner ? 2 : 4.5);
  HUD.scan = Math.min(1, game.scanP);
  if (Math.random() < dt * 3) sfx.scan();
  if (game.scanP >= 1) {
    game.scanP = 0;
    const base = { star: 1800, gas: 4200, gasb: 4800, gasp: 5600, earth: 22000, ocean: 11000, lava: 2600, ice: 3200, desert: 2800, toxic: 3800, rock: 1600 };
    let v = t.kind === 'star' ? base.star * (game.world.sys.star.cls === 'O' || game.world.sys.star.cls === 'D' ? 3 : 1) : base[t.data.kind] || 2000;
    if (t.kind === 'moon') v *= 0.6;
    if (P.stats.scanner) v *= 2;
    v = Math.round(v);
    S.save.explored[t.id] = { value: v, sys: game.world.sys.id, sold: false };
    S.save.stats.scans++;
    sfx.scanDone();
    game.msg(`탐사 완료: ${t.name} — 데이터 가치 ${fmtCr(v)} (스테이션에서 판매)`, 'good');
    game.missions.onScan(t.id);
    game.dirty();
  }
}

// ------------------------------------------------------------
//  카메라
// ------------------------------------------------------------
const cam = { q: new THREE.Quaternion(), fl: { yaw: 0, pitch: 0 }, pos: new THREE.Vector3(), init: false, fov: 65 };
function updateCamera(dt) {
  const P = game.playerShip;
  const C = E.camera;
  if (!cam.init || game.camSmooth === null) { cam.q.copy(P.quat); cam.init = true; game.camSmooth = 1; }
  cam.q.slerp(P.quat, 1 - Math.exp(-(game.camMode === 2 ? 30 : 7) * dt));
  if (IN.freelook) {
    cam.fl.yaw -= (IN.locked ? IN.dx : 0) * 0.004; cam.fl.pitch = clamp(cam.fl.pitch - (IN.locked ? IN.dy : 0) * 0.004, -1.4, 1.4);
    if (!IN.locked) { cam.fl.yaw = -(IN.mx / E.W - 0.5) * 5; cam.fl.pitch = -(IN.my / E.H - 0.5) * 2.5; }
  } else { cam.fl.yaw *= Math.exp(-5 * dt); cam.fl.pitch *= Math.exp(-5 * dt); }
  const rq = _q.copy(cam.q).multiply(_q2.setFromEuler(new THREE.Euler(cam.fl.pitch, cam.fl.yaw, 0, 'YXZ')));
  const r = P.radius;
  let off;
  if (game.camMode === 2 && !IN.freelook) off = _a.copy(P.model.userData.cockpit);
  else if (game.camMode === 1) off = _a.set(0, r * 0.9, -r * 6.5 * game.camDist);
  else off = _a.set(0, r * 0.55, -r * 3.0 * game.camDist - 4);
  off.applyQuaternion(game.camMode === 2 && !IN.freelook ? P.quat : rq);
  // 속도 따라 약간 뒤로 밀림
  if (game.camMode !== 2) off.addScaledVector(P.vel, -Math.min(0.012, 6 / Math.max(1, P.speed)) * (P.cruise === 2 ? 0.3 : 1));
  const camW = cam.pos.copy(P.pos).add(off);
  E.origin.copy(camW);
  C.position.set(0, 0, 0);
  C.quaternion.copy(game.camMode === 2 && !IN.freelook ? P.quat : rq).multiply(FLIP);
  if (game.camMode !== 2 || IN.freelook) {
    // 함선보다 약간 앞을 바라봄
    const look = _b.copy(P.pos).addScaledVector(_a.set(0, 0, 1).applyQuaternion(rq), r * 6).sub(camW);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), look, _a.set(0, 1, 0).applyQuaternion(rq));
    C.quaternion.setFromRotationMatrix(m);
  }
  // 흔들림
  game.shake = Math.max(0, (game.shake || 0) - dt * 2);
  const sh = game.shake + (P.boosting ? 0.06 : 0) + (P.cruise === 1 ? P.cruiseCharge * 0.03 : 0) + (game.hyperCharge > 0 ? game.hyperCharge * 0.05 : 0);
  if (sh > 0.001) C.quaternion.multiply(_q2.setFromEuler(new THREE.Euler((Math.random() - 0.5) * sh * 0.02, (Math.random() - 0.5) * sh * 0.02, 0)));
  const fovT = 65 + (P.boosting ? 6 : 0) + (P.cruise === 2 ? 10 : 0) + (game.hyper ? 25 : 0);
  cam.fov = damp(cam.fov, fovT, 3, dt);
  C.fov = cam.fov; C.updateProjectionMatrix();
  P.model.visible = !(game.camMode === 2 && !IN.freelook) && !P.dead;
}

// ------------------------------------------------------------
//  루프
// ------------------------------------------------------------
let last = performance.now(), saveT = 0, hudT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  updateTouch();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'login' || game.docked) {
    updateHangar(dt);
    E.composer.passes[0].scene = HG.scene; E.composer.passes[0].camera = HG.camera;
    E.bloom.strength = 0.4; E.bloom.threshold = 0.9;
    render(dt);
    E.bloom.strength = 0.75; E.bloom.threshold = 0.82;
    E.composer.passes[0].scene = E.scene; E.composer.passes[0].camera = E.camera;
    if (game.docked) { drawHud(game); if (game.mapOpen) drawMap(dt); }
    endFrame();
    tickSave(dt);
    game.net.tick(dt);
    if (game.state === 'play') S.save.stats.playtime += dt;
    return;
  }
  if (simulate(dt, now) === false) return;
  const PP = game.playerShip;
  updateCamera(dt);
  syncAnchors();
  updateSun(PP.pos, rel(PP.pos, _b), null);
  updateFx(dt, PP.vel, PP.cruise === 2, game.camMode === 2 && false);
  game.hitFx = Math.max(0, (game.hitFx || 0) - dt * 1.8);
  E.post.uniforms.uHit.value = game.hitFx;
  E.post.uniforms.uLow.value = !PP.dead && PP.hull / PP.stats.hull < 0.25 ? 1 : 0;
  if (!game.hyper) E.post.uniforms.uWarp.value = PP.cruise === 2 ? 0.35 : PP.cruise === 1 ? PP.cruiseCharge / 3 * 0.3 : game.hyperCharge / 4 * 0.5;
  render(dt);
  drawHud(game);
  hudT -= dt;
  updateHudDom(dt);
  if (game.mapOpen) drawMap(dt);
  audioFrame(PP.ctrl.throttle, PP.boosting, PP.cruise === 2, PP.speed);
  game.net.tick(dt);
  tickSave(dt);
  S.save.stats.playtime += dt;
  endFrame();
}
function simulate(dt, now) {
  const P = game.playerShip;
  const w = game.world;
  game.hint = '';
  if (!game.mapOpen && !game.menuOpen && document.activeElement !== $('comms-input')) flightControls(dt);
  else { P.ctrl.fire1 = P.ctrl.fire2 = false; P.ctrl.boost = false; if (game.autopilot) runAutopilot(dt); }
  doHyper(dt);
  if (!(game.hyper && game.hyper.t > 1 && !game.hyper.loaded)) w.update(dt);
  const PP = game.playerShip;
  if (!PP.dead) {
    doScan(dt);
    game.undockT = (game.undockT || 0) - dt;
    // 수동 도킹: 입구 근처 저속 진입
    for (const st of w.stations) {
      if (game.undockT > 0) break;
      if (st.entrance.distanceTo(PP.pos) < 70 + PP.radius && PP.speed < 170 && PP.vel.dot(st.face) < 5) {
        const ok = canDock(st);
        if (ok === true) { dockAt(st); return false; }
        if (!game.denyT || now - game.denyT > 4000) { game.denyT = now; game.msg(ok, 'bad'); }
      }
    }
    if (game.autopilot && game.autopilot.phase === 1 && game.autopilot.target.entrance.distanceTo(PP.pos) < 90 + PP.radius) { dockAt(game.autopilot.target); return false; }
    // 도킹 안내
    const st = w.nearestStation(PP.pos);
    if (st && st.pos.distanceTo(PP.pos) < 6000 && !game.autopilot) game.hint = `${st.name} — ${DEV.mobile ? '[자동 도킹] 버튼' : 'G: 자동 도킹'}`;
    for (const a of w.anoms) if (a.pos.distanceTo(PP.pos) < 600 && !a.looted && (a.type === 'wreck' || a.type === 'cache' || a.type === 'ruins')) game.hint = `${a.name} — ${DEV.mobile ? '[자동 도킹] 버튼으로 ' : 'G: '}${a.type === 'ruins' ? '해킹' : '회수'}`;
    S.save.stats.dist += PP.speed * dt;
  } else {
    game.deadT -= dt;
    if (game.deadT <= 0 && $('death').classList.contains('hidden')) showDeath();
  }
  // 기지 포탑
  outpostDefense(dt);
  // 용병 계약 만료
  if (Math.random() < dt * 0.2) for (const s of w.ships) if (s.wingRec && s.wingRec.until < Date.now()) { s.dead = true; s.gone = true; jumpFlash(s.pos); S.save.wingmen = S.save.wingmen.filter((x) => x !== s.wingRec); game.msg(`${s.name}: 계약 만료. 다음에 또 부르라고.`, 'info'); }
  return true;
}
// 테스트용: 렌더 없이 시뮬레이션 진행
game.debugStep = (n, dt = 0.05) => { for (let i = 0; i < n && !game.docked; i++) { if (simulate(dt, performance.now()) === false) break; endFrame(); } };

function tickSave(dt) {
  saveT -= dt;
  if (saveT <= 0 && S.save) { saveT = game._dirty ? 8 : 25; saveNow(); }
}
let opT = 0;
function outpostDefense(dt) {
  opT -= dt; if (opT > 0) return; opT = 0.6;
  const w = game.world;
  for (const o of w.outposts) {
    const n = (o.data.outpost.modules.turret || 0); if (!n) continue;
    for (const s of w.ships) {
      if (s.dead || !s.brain || !(s.brain.role === 'pirate' || s.brain.role === 'guardian' || s.brain.role === 'hunter')) continue;
      if (s.pos.distanceTo(o.pos) > 2800) continue;
      for (let i = 0; i < n; i++) {
        const from = o.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, 60));
        const dir = s.pos.clone().sub(from).normalize();
        w.bolts.push({ pos: from, vel: dir.multiplyScalar(2200), life: 1.5, dmg: 30, w: { shield: 1, hull: 1 }, owner: { id: 'outpost', isShip: false, outpostOwner: true }, color: '#5dff9d', width: 0.6, len: 14 });
      }
      break;
    }
  }
}

window.addEventListener('beforeunload', () => { if (S.save && game.state === 'play') saveNow(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.save && game.state === 'play') saveNow(); });
// 오버뷰 버튼
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a || game.state !== 'play') return;
  const act = a.dataset.act;
  if (act === 'map') toggleMap(!game.mapOpen);
  if (act === 'menu') openMenuFn();
  if (act === 'closemap') toggleMap(false);
});

boot();
export { game };
