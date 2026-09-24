// HUD · 채팅 · 스테이션 · 메뉴 UI
import { G, send, serverTime, saveSettings } from './state.js';
import { SHIPS, SHIP_ORDER, ITEMS, MARKET_ITEMS, WEAPONS, NPCS, secLabel, secColor, fmtCredits, fmtDist, DOCK_RANGE, INTERACT_RANGE, CLAN_CREATE_COST, STATION_TYPES } from '../shared/data.js';
import { bodyPos } from '../shared/physics.js';
import { resize, hexA, shipPreview, shipInfo, shipLabel } from './render.js';
import { sfx, audioSettings, setVolume, initAudio } from './audio.js';
import { openMap } from './map.js';

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const itemName = (k) => (k.startsWith('pkg:') ? '📦 배송 화물' : ITEMS[k]?.name || k);
const KIND = { ore: '광석', good: '상품', salvage: '회수품' };

let loginCb = null;
let stTab = 'market', menuTab = 'pilot', chatTab = 'global';
const chatMsgs = [];
let ovFilter = 0;
let ovHover = false;
const OV_FILTERS = ['전체', '함선', '천체', '신호'];

// ============================================================
//  초기화 / 로그인
// ============================================================
export function initUI() {
  document.body.classList.toggle('no-scanlines', !G.settings.scanlines);
  const form = $('login-form');
  try { $('login-name').value = localStorage.getItem('nv_name') || ''; } catch {}
  form.addEventListener('submit', (e) => { e.preventDefault(); initAudio(); doLogin('login'); });
  $('btn-register').addEventListener('click', () => { initAudio(); doLogin('register'); });

  $('btn-undock').addEventListener('click', () => { send({ t: 'act', a: 'undock' }); sfx.click(); });
  $('btn-st-menu').addEventListener('click', () => openMenu());
  $('btn-st-map').addEventListener('click', () => openMap());
  $('st-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; stTab = b.dataset.tab; setTabs('st-tabs', stTab); renderStation(); sfx.click(); });
  $('menu-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; switchMenu(b.dataset.tab); sfx.click(); });
  $('btn-menu-close').addEventListener('click', closeMenu);

  // 채팅
  $('chat-toggle').addEventListener('click', (e) => { e.stopPropagation(); toggleChat(); });
  setChatCollapsed(chatCollapsed);
  document.querySelector('.chat-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ch]'); if (!b) return;
    if (chatCollapsed) setChatCollapsed(false);
    chatTab = b.dataset.ch; b.classList.remove('unread');
    document.querySelectorAll('.chat-tabs button').forEach((x) => x.classList.toggle('active', x === b));
    renderChat();
  });
  const input = $('chat-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = input.value.trim();
      if (v) send({ t: 'chat', ch: chatTab, msg: v });
      input.value = '';
      input.blur();
      e.preventDefault();
    }
    e.stopPropagation();
  });
  // Enter로 잠깐 펼쳤던 경우 입력을 마치면 다시 접기
  input.addEventListener('blur', () => { if (chatTempOpen) { chatTempOpen = false; setChatCollapsed(true); } });
  $('chat-log').addEventListener('click', (e) => { const f = e.target.closest('.from'); if (f && f.dataset.n && f.dataset.n !== G.name) { input.value = `/w ${f.dataset.n} `; input.focus(); } });

  // 핫키 버튼
  document.querySelector('.hotkeys').addEventListener('click', (e) => {
    const hk = e.target.closest('.hk'); if (!hk) return;
    const a = hk.dataset.act;
    if (a === 'map') openMap(); else if (a === 'menu') openMenu(); else if (a === 'home') send({ t: 'ap', nearest: true }); else send({ t: 'act', a });
  });
  $('ov-filter').addEventListener('click', () => { ovFilter = (ovFilter + 1) % OV_FILTERS.length; $('ov-filter').textContent = OV_FILTERS[ovFilter]; });
  // 목록은 주기적으로 다시 그려지므로 click 대신 pointerdown으로 즉시 처리
  $('ov-list').addEventListener('pointerdown', (e) => {
    const r = e.target.closest('.ov-row');
    if (!r || !r.dataset.kind) return;
    e.preventDefault();
    send({ t: 'ap', kind: r.dataset.kind, id: r.dataset.id });
    r.classList.add('picked');
    sfx.click();
  });
  $('overview').addEventListener('pointerenter', () => { ovHover = true; });
  $('overview').addEventListener('pointerleave', () => { ovHover = false; });
  $('ap-info').addEventListener('click', () => { send({ t: 'ap', clear: true }); toast('오토파일럿 해제', 'info'); });

  // 위임된 버튼 액션
  document.addEventListener('click', onAction);
  document.addEventListener('mousedown', () => initAudio(), { once: true });
}

function doLogin(mode) {
  const name = $('login-name').value.trim(), pass = $('login-pass').value;
  if (!name || !pass) return loginError('콜사인과 접속 코드를 입력하세요.');
  $('login-msg').style.color = 'var(--cyan)';
  $('login-msg').textContent = mode === 'register' ? '신규 파일럿 등록 중...' : '뉴럴 링크 연결 중...';
  loginCb && loginCb(name, pass, mode);
}
export function onLogin(cb) { loginCb = cb; }
export function loginError(msg) { $('login-msg').style.color = 'var(--red)'; $('login-msg').textContent = msg; sfx.error(); }
export function showLogin() { $('login-screen').classList.remove('hidden'); $('hud').classList.add('hidden'); }
export function serverStatus(ok) {
  $('server-status').classList.toggle('ok', ok);
  $('server-status-text').textContent = ok ? '서버 온라인 — 접속 가능' : '서버 연결 중... (Render 무료 서버는 깨어나는 데 최대 1분 걸릴 수 있습니다)';
}
export function enterGame(history) {
  $('login-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  chatMsgs.length = 0;
  for (const m of history || []) chatMsgs.push(m);
  renderChat();
  toast('뉴럴 링크 연결 완료. 행운을 빕니다, 파일럿.', 'good');
}
export function showDisconnected(v) { $('disconnected').classList.toggle('hidden', !v); }

// ============================================================
//  토스트 / 배너 / 팝업
// ============================================================
export function toast(msg, kind = 'info') {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, kind === 'err' ? 3500 : 4200);
}
let bannerTimer = null;
function banner(b1, b2, b3, color) {
  const el = $('banner');
  el.innerHTML = `<div class="b1">${esc(b1)}</div><div class="b2">${esc(b2)}</div><div class="b3" style="color:${color}">${esc(b3)}</div>`;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
export function onEnterSystem(sysId) {
  if (sysId) {
    const s = G.sysById[sysId];
    banner('// 성계 진입 //', s.name, `${secLabel(s.sec)} ${s.sec.toFixed(1)}${s.sec < 0.5 ? ' — PvP 가능 지역!' : ' — 안전 지역'}`, secColor(s.sec));
    if (s.sec < 0.5) sfx.alarm();
  } else banner('// 성계 이탈 //', '딥 스페이스', '성간 공간 — 주의하십시오', '#ffb000');
}
export function creditPop(amount, reason) {
  const el = document.createElement('div');
  el.className = 'credit-pop';
  el.textContent = `${amount >= 0 ? '+' : ''}${amount.toLocaleString()} ¢  ${reason || ''}`;
  el.style.left = (window.innerWidth / 2 - 60) + 'px';
  el.style.top = (window.innerHeight / 2 - 70) + 'px';
  $('hud').appendChild(el);
  setTimeout(() => el.remove(), 1700);
}
export function showDeath(m) {
  $('death-info').innerHTML = `<div>${esc(m.ship)} 파괴됨 — 가해자: <b class="bad">${esc(m.killer)}</b></div>${m.loss ? `<div class="warn-t">${esc(m.loss)}</div>` : ''}<div class="dim">${esc(m.respawn)}에서 셔틀로 재시작합니다.</div>`;
  $('death').classList.remove('hidden');
  closeMenu();
}
export function hideDeath() { $('death').classList.add('hidden'); }

// ============================================================
//  채팅
// ============================================================
// ---------- 채팅창 접기 ----------
let chatCollapsed = false, chatTempOpen = false, chatUnread = 0, peekTimer = null;
try { chatCollapsed = localStorage.getItem('nv_chat_collapsed') === '1'; } catch {}
function setChatCollapsed(v) {
  chatCollapsed = v;
  $('chat').classList.toggle('collapsed', v);
  $('chat-toggle').textContent = v ? '▴' : '▾';
  $('chat-toggle').title = v ? '채팅창 펼치기 (V)' : '채팅창 접기 (V)';
  if (!v) { chatUnread = 0; renderChat(); }
  updateUnread();
  if (!chatTempOpen) try { localStorage.setItem('nv_chat_collapsed', v ? '1' : '0'); } catch {}
}
export function toggleChat() { chatTempOpen = false; setChatCollapsed(!chatCollapsed); sfx.click(); }
function updateUnread() {
  const el = $('chat-unread');
  el.textContent = chatUnread > 99 ? '99+' : chatUnread;
  el.classList.toggle('hidden', !(chatCollapsed && chatUnread > 0));
}
function peek(m) {
  const el = $('chat-peek');
  el.textContent = m.ch === 'sys' ? m.msg : `${m.tag ? `[${m.tag}] ` : ''}${m.from}: ${m.msg}`;
  el.classList.add('show');
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

export function addChat(m) {
  if (chatCollapsed) {
    if (m.ch !== 'sys' && m.from !== G.name) { chatUnread++; updateUnread(); }
    if (m.ch !== 'sys' || /⚔|☠|⚑/.test(m.msg)) peek(m);
  }
  chatMsgs.push(m);
  if (chatMsgs.length > 200) chatMsgs.shift();
  const vis = chatVisible(m, chatTab);
  if (vis) appendChat(m);
  else {
    const tab = m.ch === 'clan' ? 'clan' : m.ch === 'local' ? 'local' : 'global';
    document.querySelector(`.chat-tabs button[data-ch="${tab}"]`)?.classList.add('unread');
  }
  if (m.ch === 'whisper' && m.from !== G.name) sfx.msg();
}
function chatVisible(m, tab) {
  if (m.ch === 'sys' || m.ch === 'whisper') return true;
  return m.ch === tab;
}
function chatHtml(m) {
  const d = new Date(m.ts || Date.now());
  const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (m.ch === 'sys') return `<div class="m ch-sys"><span class="ts">${ts}</span>${esc(m.msg)}</div>`;
  const tag = m.tag ? `<span class="clan-tag">[${esc(m.tag)}]</span>` : '';
  const pre = m.ch === 'whisper' ? (m.from === G.name ? `→ ${esc(m.to)}` : `← `) : m.ch === 'local' ? `<span class="dim">[${esc(m.where || '지역')}]</span> ` : m.ch === 'clan' ? '<span class="dim">[클랜]</span> ' : '';
  return `<div class="m ch-${m.ch}${m.bot ? ' bot' : ''}"><span class="ts">${ts}</span>${pre}${tag}<span class="from" data-n="${m.bot ? '' : esc(m.from)}">${esc(m.from)}</span>: ${esc(m.msg)}</div>`;
}
function appendChat(m) {
  const log = $('chat-log');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.insertAdjacentHTML('beforeend', chatHtml(m));
  while (log.children.length > 150) log.firstChild.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}
function renderChat() {
  const log = $('chat-log');
  log.innerHTML = chatMsgs.filter((m) => chatVisible(m, chatTab)).slice(-150).map(chatHtml).join('');
  log.scrollTop = log.scrollHeight;
}
export function focusChat() {
  if (chatCollapsed) { chatTempOpen = true; $('chat').classList.remove('collapsed'); chatUnread = 0; updateUnread(); renderChat(); }
  $('chat-input').focus();
}

// ============================================================
//  계정 / 정보
// ============================================================
export function onAcct() {
  const a = G.acct;
  $('hud-name').textContent = a.name;
  $('hud-tag').textContent = a.clan ? `[${a.clan}]` : '';
  $('hud-credits').textContent = fmtCredits(a.credits);
  const ship = a.ships.find((s) => s.id === a.active);
  if (ship) $('hud-ship').textContent = `${SHIPS[ship.type].cls} · ${SHIPS[ship.type].name}`;
  $('hud-cargo').textContent = `화물 ${a.cargoUsed} / ${a.cargoCap}`;
  renderMissionTracker();
  if (stationOpen()) renderStation();
  if (menuOpen() && menuTab !== 'ranking' && menuTab !== 'settings') renderMenu();
}
export function onInfo() {
  $('online-count').textContent = `● ${G.info.online}명 접속`;
}
export function onClan() { if (menuOpen() && menuTab === 'clan') renderMenu(); if (G.acct) $('hud-tag').textContent = G.acct.clan ? `[${G.acct.clan}]` : ''; }
export function onLeaderboard() { if (menuOpen() && menuTab === 'ranking') renderMenu(); }

function renderMissionTracker() {
  const a = G.acct;
  $('hud-missions').innerHTML = (a.missions || []).map((m) => {
    let prog = '';
    if (m.type === 'delivery') prog = `→ ${G.stById[m.to]?.name}`;
    else if (m.type === 'mining') prog = `${Math.min(a.cargo[m.ore] || 0, m.qty)}/${m.qty} → ${G.stById[m.from]?.name}`;
    else prog = `${m.progress}/${m.qty}`;
    const done = (m.type === 'bounty' || m.type === 'explore') && m.progress >= m.qty;
    return `<div class="mis-track ${done ? 'done' : ''}"><b>${esc(m.title)}</b><br><span class="dim">${esc(prog)}</span></div>`;
  }).join('');
}

// ============================================================
//  프레임마다 HUD 갱신
// ============================================================
let hudT = 0, radarT = 0, ovT = 0;
export function frame(dt, t) {
  hudT += dt; radarT += dt; ovT += dt;
  if (hudT > 0.1) { hudT = 0; updateHud(); }
  if (radarT > 0.08) { radarT = 0; drawRadar(); }
  if (ovT > (ovHover ? 1.5 : 0.4)) { ovT = 0; updateOverview(); }
}

function setBar(sel, v, max) {
  const el = document.querySelector(`.bar.${sel}`);
  el.querySelector('i').style.width = `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  el.querySelector('b').textContent = Math.round(v);
  return el;
}
function updateHud() {
  const me = G.me; if (!me) return;
  const spec = SHIPS[me.type];
  setBar('shield', me.s, spec.shield);
  const hull = setBar('hull', me.h, spec.hull);
  hull.classList.toggle('low', me.h < spec.hull * 0.3);
  setBar('energy', me.e, spec.energy);
  $('v-speed').textContent = Math.round(Math.hypot(G.self.vx, G.self.vy));
  // 위치
  const T = serverTime();
  if (me.dock) { $('loc-name').textContent = G.stById[me.dock]?.name || ''; }
  else $('loc-name').textContent = me.sys ? G.sysById[me.sys].name : '딥 스페이스';
  const sec = me.sec ?? 1;
  $('loc-sec').innerHTML = `<span style="color:${secColor(sec)}">${secLabel(sec)} ${sec.toFixed(1)}</span>${sec < 0.5 ? ' <span class="bad">· PvP</span>' : ''}`;
  // 오토파일럿
  const ap = $('ap-info');
  if (me.ap) {
    let x = me.ap.x, y = me.ap.y;
    if (me.ap.kind === 'station' || me.ap.kind === 'planet') { const p = bodyPos(G.bodies[me.ap.id], G.bodies, T); x = p.x; y = p.y; }
    const d = Math.hypot(x - G.self.x, y - G.self.y);
    const sp = Math.max(1, Math.hypot(G.self.vx, G.self.vy));
    const eta = d / Math.max(sp, me.w === 2 ? sp : spec.warpSpeed * 0.85);
    ap.innerHTML = `⌖ 오토파일럿: ${esc(me.ap.name)} · ${fmtDist(d)} · ETA ${eta > 60 ? Math.floor(eta / 60) + '분 ' : ''}${Math.round(eta % 60)}초 <span class="dim">[X 해제]</span>`;
    ap.classList.remove('hidden');
  } else ap.classList.add('hidden');
  // 워프
  const ws = $('warp-status');
  if (me.w === 1) { ws.className = 'charge'; ws.textContent = `워프 드라이브 충전 중 ${Math.round((1 - me.wt / spec.warpCharge) * 100)}%`; }
  else if (me.w === 2) { ws.className = ''; ws.textContent = `▶▶ 워프 중 · ${Math.round(Math.hypot(G.self.vx, G.self.vy)).toLocaleString()} m/s ◀◀`; }
  else if (me.w === 3) { ws.className = ''; ws.textContent = '워프 이탈 중...'; }
  else ws.className = 'hidden';
  // 해킹
  const hb = $('hack-bar');
  if (me.hk > 0) { hb.classList.remove('hidden'); hb.querySelector('.fill').style.width = `${Math.min(100, me.hk * 100)}%`; hb.querySelector('span').textContent = `ICE 해킹 중... ${Math.round(me.hk * 100)}%`; }
  else hb.classList.add('hidden');
  // 핫키
  document.querySelector('.hk[data-act="mine"]').classList.toggle('on', me.mine >= 0);
  document.querySelector('.hk[data-act="warp"]').classList.toggle('on', me.w > 0);
  $('scan-cd').textContent = me.scan > 0 ? ` ${me.scan}s` : '';
  // 범죄자
  const cr = $('hud-crim');
  if (me.crim > 0) { cr.classList.remove('hidden'); cr.textContent = `☠ 범죄자 플래그 ${Math.floor(me.crim / 60)}:${String(me.crim % 60).padStart(2, '0')}`; }
  else cr.classList.add('hidden');
  // 상호작용 힌트
  const hint = $('interact-hint');
  let h = '';
  if (!me.dock && !me.dead && me.w === 0) {
    for (const an of G.anomalies.values()) if (Math.hypot(an.x - G.self.x, an.y - G.self.y) < INTERACT_RANGE && !(me.hk > 0)) h = `[E] 해킹 시작: ${an.name}`;
    if (!h && me.sys) for (const stId of G.sysById[me.sys].stations) {
      const p = bodyPos(G.bodies[stId], G.bodies, T);
      if (Math.hypot(p.x - G.self.x, p.y - G.self.y) < DOCK_RANGE) h = `[E] 도킹: ${G.bodies[stId].name}`;
    }
    if (!h && me.mine < 0 && me.sys) {
      const range = spec.miningRange;
      for (const bId of G.sysById[me.sys].belts) {
        const b = G.beltById[bId];
        if (Math.hypot(b.x - G.self.x, b.y - G.self.y) > b.r + range + 200) continue;
        for (const a of G.asteroids) {
          if (!a || G.dep.has(a[0]) || Math.abs(a[1] - G.self.x) > range + 200 || Math.abs(a[2] - G.self.y) > range + 200) continue;
          if (Math.hypot(a[1] - G.self.x, a[2] - G.self.y) - a[3] < range) { h = `[F] 채굴: ${ITEMS[a[4]].name}`; break; }
        }
        if (h) break;
      }
    }
  }
  hint.textContent = h;
  hint.classList.toggle('hidden', !h);
}

// ---------- 레이더 ----------
function drawRadar() {
  const cv = $('radar'), c = cv.getContext('2d');
  const S = 200, R = S / 2;
  const me = G.me; if (!me) return;
  const range = me.w === 2 ? 40000 : Math.max(5000, G.cam.userDist * 6);
  $('radar-range').textContent = fmtDist(range);
  const k = R / range;
  c.clearRect(0, 0, S, S);
  c.save();
  c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.clip();
  c.fillStyle = 'rgba(0,20,30,0.5)'; c.fillRect(0, 0, S, S);
  c.strokeStyle = 'rgba(0,240,255,0.15)'; c.lineWidth = 1;
  for (const f of [0.33, 0.66, 1]) { c.beginPath(); c.arc(R, R, R * f - 1, 0, Math.PI * 2); c.stroke(); }
  c.beginPath(); c.moveTo(R, 0); c.lineTo(R, S); c.moveTo(0, R); c.lineTo(S, R); c.stroke();
  const sweep = (performance.now() / 1000) * 2;
  const g = c.createConicGradient ? c.createConicGradient(sweep, R, R) : null;
  if (g) { g.addColorStop(0, 'rgba(0,240,255,0.25)'); g.addColorStop(0.1, 'rgba(0,240,255,0)'); g.addColorStop(1, 'rgba(0,240,255,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); }
  const P = (x, y) => [R + (x - G.self.x) * k, R + (y - G.self.y) * k];
  const T = serverTime();
  // 성계
  for (const s of G.world.systems) {
    const [x, y] = P(s.x, s.y);
    if (Math.hypot(x - R, y - R) > R + s.starR * k) continue;
    c.fillStyle = s.starColor; c.beginPath(); c.arc(x, y, Math.max(3, s.starR * k), 0, Math.PI * 2); c.fill();
    for (const pid of s.planets) { const p = bodyPos(G.bodies[pid], G.bodies, T); const [px, py] = P(p.x, p.y); c.fillStyle = G.bodies[pid].c1; c.beginPath(); c.arc(px, py, Math.max(2, G.bodies[pid].r * k), 0, Math.PI * 2); c.fill(); }
    for (const sid of s.stations) { const p = bodyPos(G.bodies[sid], G.bodies, T); const [px, py] = P(p.x, p.y); c.fillStyle = '#ffe600'; c.fillRect(px - 3, py - 3, 6, 6); }
    if (s.beacon) { const b = G.beaconById[s.beacon]; const [bx, by] = P(b.x, b.y); c.strokeStyle = '#fff'; c.strokeRect(bx - 3, by - 3, 6, 6); }
  }
  if (range < 20000) {
    c.fillStyle = 'rgba(160,160,190,0.6)';
    for (const a of G.asteroids) {
      if (!a || Math.abs(a[1] - G.self.x) > range || Math.abs(a[2] - G.self.y) > range) continue;
      const [x, y] = P(a[1], a[2]); c.fillRect(x - 1, y - 1, 2, 2);
    }
  }
  for (const an of G.anomalies.values()) { const [x, y] = P(an.x, an.y); c.fillStyle = '#c070ff'; c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 4, y); c.lineTo(x, y + 4); c.lineTo(x - 4, y); c.fill(); }
  for (const l of G.loots.values()) { const [x, y] = P(l.x, l.y); c.fillStyle = '#ffe600'; c.fillRect(x - 1.5, y - 1.5, 3, 3); }
  for (const e of G.ships.values()) {
    const [x, y] = P(e.dx, e.dy);
    const info = shipInfo(e.type);
    c.fillStyle = info.police ? '#3bb0ff' : info.bot ? '#ff4466' : info.npc ? '#ff2255' : (e.flags & 16) ? '#ff7700' : (G.acct?.clan && e.tag === G.acct.clan) ? '#2cff9a' : '#00f0ff';
    const big = e.type === 'npc:kaiju' || info.bot;
    if (info.bot) { c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillRect(-3.5, -3.5, 7, 7); c.restore(); }
    else { c.beginPath(); c.arc(x, y, big ? 5 : 3, 0, Math.PI * 2); c.fill(); }
  }
  if (me.ap) {
    let x = me.ap.x, y = me.ap.y;
    if (me.ap.kind === 'station' || me.ap.kind === 'planet') { const p = bodyPos(G.bodies[me.ap.id], G.bodies, T); x = p.x; y = p.y; }
    const a = Math.atan2(y - G.self.y, x - G.self.x);
    c.strokeStyle = 'rgba(255,230,0,0.7)'; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(R, R); c.lineTo(R + Math.cos(a) * R, R + Math.sin(a) * R); c.stroke(); c.setLineDash([]);
  }
  c.restore();
  // 자기 함선
  c.save(); c.translate(R, R); c.rotate(G.self.a);
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, 4); c.lineTo(-5, -4); c.closePath(); c.fill();
  c.restore();
}

// ---------- 오버뷰 ----------
function updateOverview() {
  const me = G.me; if (!me || me.dock) { $('ov-list').innerHTML = '<div class="dim" style="font-size:12px">도킹 중</div>'; return; }
  const T = serverTime();
  const rows = [];
  const X = G.self.x, Y = G.self.y;
  const f = ovFilter;
  if (f === 0 || f === 2) {
    for (const s of G.world.systems) {
      const dSys = Math.hypot(s.x - X, s.y - Y);
      if (dSys > 150000) continue;
      for (const sid of s.stations) { const p = bodyPos(G.bodies[sid], G.bodies, T); rows.push({ cls: 'station', name: `◆ ${G.bodies[sid].name}`, d: Math.hypot(p.x - X, p.y - Y), kind: 'station', id: sid }); }
      if (dSys < 80000) {
        for (const pid of s.planets) { const p = bodyPos(G.bodies[pid], G.bodies, T); rows.push({ cls: '', name: `● ${G.bodies[pid].name}`, d: Math.hypot(p.x - X, p.y - Y), kind: 'planet', id: pid }); }
        for (const bid of s.belts) { const b = G.beltById[bid]; rows.push({ cls: '', name: `⛏ ${b.name}`, d: Math.hypot(b.x - X, b.y - Y), kind: 'belt', id: bid }); }
        if (s.beacon) { const b = G.beaconById[s.beacon]; rows.push({ cls: '', name: `⚑ ${b.name}`, d: Math.hypot(b.x - X, b.y - Y), kind: 'beacon', id: b.id }); }
      }
    }
  }
  if (f === 0 || f === 3) for (const an of G.anomalies.values()) rows.push({ cls: 'anomaly', name: `✦ ${an.name}`, d: Math.hypot(an.x - X, an.y - Y), kind: 'anomaly', id: an.id });
  if (f === 0 || f === 1) for (const e of G.ships.values()) {
    const info = shipInfo(e.type);
    const nm = shipLabel(e, info) + (info.npc && !info.bot ? '' : ` (${info.spec.cls})`);
    rows.push({ cls: info.police ? 'police' : info.hostile || (e.flags & 16) ? 'hostile' : 'player', name: nm, d: Math.hypot(e.dx - X, e.dy - Y) });
  }
  rows.sort((a, b) => a.d - b.d);
  const apId = me.ap && me.ap.id;
  $('ov-list').innerHTML = rows.slice(0, 16).map((r) => `<div class="ov-row ${r.cls}${r.id && r.id === apId ? ' picked' : ''}" ${r.kind ? `data-kind="${r.kind}" data-id="${esc(r.id)}" title="클릭: 오토파일럿"` : ''}><span class="nm">${esc(r.name)}</span><span class="d">${fmtDist(r.d)}</span></div>`).join('') || '<div class="dim" style="font-size:12px">주변에 아무것도 없습니다</div>';
}

// ============================================================
//  창 관리
// ============================================================
function setTabs(id, tab) { document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('active', b.dataset.tab === tab)); }
export const stationOpen = () => !$('station').classList.contains('hidden');
export const menuOpen = () => !$('menu').classList.contains('hidden');
export const anyWindowOpen = () => stationOpen() || menuOpen() || !$('map').classList.contains('hidden');
export function openStation() { $('station').classList.remove('hidden'); closeMenu(); renderStation(); }
export function closeStation() { $('station').classList.add('hidden'); }
export function onStation() { if (G.me?.dock || !G.me) openStation(); if (stationOpen()) renderStation(); }
export function openMenu(tab) { if (tab) menuTab = tab; $('menu').classList.remove('hidden'); setTabs('menu-tabs', menuTab); switchMenu(menuTab); }
export function closeMenu() { $('menu').classList.add('hidden'); }
function switchMenu(tab) {
  menuTab = tab; setTabs('menu-tabs', tab);
  if (tab === 'ranking') send({ t: 'lb' });
  if (tab === 'clan') { send({ t: 'clan', a: 'info' }); send({ t: 'clan', a: 'list' }); }
  renderMenu();
}

// ============================================================
//  스테이션
// ============================================================
function renderStation() {
  const st = G.station, a = G.acct;
  if (!st || !a) return;
  const sys = G.sysById[st.sys];
  const type = STATION_TYPES[st.type];
  $('st-name').textContent = st.name;
  $('st-sub').innerHTML = `${type.icon} ${type.name} · ${esc(sys.name)} · <span style="color:${secColor(sys.sec)}">${secLabel(sys.sec)} ${sys.sec.toFixed(1)}</span> · 보유 <span class="mono" style="color:var(--yellow)">${fmtCredits(a.credits)}</span> · 화물 ${a.cargoUsed}/${a.cargoCap}`;
  const body = $('st-body');
  const scroll = body.scrollTop;
  if (stTab === 'market') body.innerHTML = marketHtml(st, a, type);
  else if (stTab === 'shipyard') { body.innerHTML = shipyardHtml(a); drawShipPreviews(); }
  else if (stTab === 'hangar') { body.innerHTML = hangarHtml(a); drawShipPreviews(); }
  else if (stTab === 'missions') body.innerHTML = missionsBoardHtml(st, a);
  else if (stTab === 'services') body.innerHTML = servicesHtml(st, a, type);
  body.scrollTop = scroll;
}

function marketHtml(st, a, type) {
  const rows = st.market.map((m) => {
    const it = ITEMS[m.item];
    const have = a.cargo[m.item] || 0;
    const tag = type.produces.includes(m.item) ? '<span class="good" title="이 스테이션의 생산품 — 싸게 살 수 있음">▼생산</span>' : type.consumes.includes(m.item) ? '<span class="warn-t" title="이 스테이션의 수요품 — 비싸게 팔 수 있음">▲수요</span>' : '';
    const sellRatio = m.sell / it.base;
    const sc = sellRatio > 1.2 ? 'good' : sellRatio < 0.8 ? 'bad' : '';
    return `<tr${m.legal ? '' : ' style="opacity:.4"'}>
      <td><span class="swatch" style="background:${it.color};color:${it.color}"></span>${esc(it.name)} ${tag}${m.legal ? '' : ' <span class="bad">불법</span>'}</td>
      <td class="dim">${KIND[it.kind]}</td>
      <td class="num">${m.stock}</td>
      <td class="num" style="color:var(--pink)">${m.buy.toLocaleString()}</td>
      <td class="num ${sc}">${m.sell.toLocaleString()}</td>
      <td class="num">${have || '<span class="dim">0</span>'}</td>
      <td><div class="flex" style="gap:4px;flex-wrap:nowrap">
        <input class="qty" type="number" min="1" value="${have || 1}" id="q-${m.item}">
        <button class="btn small" data-act="buy" data-item="${m.item}" ${m.legal ? '' : 'disabled'}>구매</button>
        <button class="btn small primary" data-act="sell" data-item="${m.item}" ${have && m.legal ? '' : 'disabled'}>판매</button>
      </div></td></tr>`;
  }).join('');
  const oreTotal = Object.keys(a.cargo).filter((k) => ITEMS[k] && ITEMS[k].kind !== 'good').length;
  return `<div class="flex" style="margin-bottom:10px"><span class="dim">가격은 재고에 따라 실시간으로 변동됩니다. 생산지에서 사서 수요지에 팔아 차익을 남기세요.</span>
    <span style="margin-left:auto"></span><button class="btn primary" data-act="sellAllOre" ${oreTotal ? '' : 'disabled'}>⛏ 광석·회수품 전량 판매</button></div>
    <table class="grid"><thead><tr><th>품목</th><th>분류</th><th class="num">재고</th><th class="num">구매가</th><th class="num">판매가</th><th class="num">보유</th><th>거래</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function shipStats(s) {
  const wps = s.hardpoints.map(([w, o]) => `${WEAPONS[w].name}×${o.length}`).join(', ');
  return `<div class="stats">
    <span>선체</span><b>${s.hull}</b><span>실드</span><b>${s.shield}</b>
    <span>최고속도</span><b>${s.maxSpeed}</b><span>워프속도</span><b>${(s.warpSpeed / 1000).toFixed(1)}k</b>
    <span>워프충전</span><b>${s.warpCharge}s</b><span>화물</span><b>${s.cargo}</b>
    <span>채굴력</span><b>${s.mining}</b><span>에너지</span><b>${s.energy}</b>
  </div><div class="dim" style="font-size:12px">⚔ ${wps}</div>`;
}
function shipyardHtml(a) {
  return `<div class="cards">${SHIP_ORDER.filter((k) => k !== 'shuttle').map((k) => {
    const s = SHIPS[k];
    return `<div class="card"><div class="cls">${esc(s.cls)} · T${s.tier}</div><h3 style="color:${s.color}">${esc(s.name)}</h3>
      <canvas data-ship="${k}" width="280" height="110"></canvas>
      <div class="desc">${esc(s.desc)}</div>${shipStats(s)}
      <div class="row"><span class="price">${fmtCredits(s.price)}</span><button class="btn primary" data-act="buyShip" data-type="${k}" ${a.credits >= s.price ? '' : 'disabled'}>구매</button></div></div>`;
  }).join('')}</div>`;
}
function hangarHtml(a) {
  return `<div class="dim" style="margin-bottom:10px">보유 함선 ${a.ships.length}/12 · 함선은 파괴되면 영구 손실됩니다 (셔틀 제외). 보험에 가입하면 가격의 75%를 보상받습니다.</div>
  <div class="cards">${a.ships.map((sh) => {
    const s = SHIPS[sh.type];
    const active = sh.id === a.active;
    const val = Math.round(s.price * 0.55 * (sh.hp / s.hull));
    return `<div class="card ${active ? 'active' : ''}"><div class="cls">${esc(s.cls)}${active ? ' · <span style="color:var(--pink)">탑승 중</span>' : ''}${sh.ins ? ' · <span class="good">보험 가입</span>' : ''}</div>
      <h3 style="color:${s.color}">${esc(s.name)}</h3><canvas data-ship="${sh.type}" width="280" height="110"></canvas>
      ${shipStats(s)}<div class="dim" style="font-size:12px">선체 상태: ${active ? Math.round(G.me?.h ?? sh.hp) : sh.hp} / ${s.hull}</div>
      <div class="row">
        ${active ? '' : `<button class="btn primary" data-act="switchShip" data-id="${sh.id}">탑승</button>`}
        ${!sh.ins && sh.type !== 'shuttle' ? `<button class="btn" data-act="insure" data-id="${sh.id}">보험 (${fmtCredits(s.price * 0.15)})</button>` : ''}
        ${!active && sh.type !== 'shuttle' ? `<button class="btn warn" data-act="sellShip" data-id="${sh.id}">판매 ${fmtCredits(val)}</button>` : ''}
      </div></div>`;
  }).join('')}</div>`;
}
function drawShipPreviews() {
  document.querySelectorAll('canvas[data-ship]').forEach((cv) => { try { shipPreview(cv, cv.dataset.ship); } catch (e) { console.warn(e); } });
}

const MTYPE = { delivery: ['배송', '#00f0ff'], bounty: ['현상금', '#ff2255'], mining: ['조달', '#ffe600'], explore: ['탐사', '#c070ff'] };
function missionHtml(m, actions) {
  const [tn, tc] = MTYPE[m.type];
  let extra = '';
  if (m.type === 'delivery') { const d = G.stById[m.to]; const ds = G.sysById[d.sys]; extra = ` · 목적지 성계 보안 <span style="color:${secColor(ds.sec)}">${ds.sec.toFixed(1)}</span>`; }
  if (m.type === 'bounty' || m.type === 'explore') if (m.progress !== undefined) extra = ` · 진행 ${m.progress}/${m.qty}`;
  return `<div class="mis"><div class="body"><h4><span class="type" style="color:${tc};border-color:${tc}">${tn}</span>${esc(m.title)}</h4><p>${esc(m.desc)}${extra}</p></div>
    <div class="rw">${fmtCredits(m.reward)}</div><div class="flex" style="flex-direction:column;gap:4px">${actions}</div></div>`;
}
function missionsBoardHtml(st, a) {
  const active = a.missions.map((m) => missionHtml(m, `<button class="btn small primary" data-act="mComplete" data-id="${m.id}">완료</button>${apBtn(m)}<button class="btn small warn" data-act="mAbandon" data-id="${m.id}">포기</button>`)).join('');
  const board = st.missions.map((m) => missionHtml(m, `<button class="btn primary" data-act="mAccept" data-id="${m.id}" ${a.missions.length >= 5 ? 'disabled' : ''}>수락</button>`)).join('');
  return `<div class="section-title">진행 중인 임무 (${a.missions.length}/5)</div>${active || '<div class="empty">진행 중인 임무가 없습니다.</div>'}
    <div class="section-title">임무 게시판 — ${esc(st.name)}</div>${board}`;
}
function apBtn(m) {
  if (m.type === 'delivery') return `<button class="btn small" data-act="apTo" data-kind="station" data-id="${m.to}">경로</button>`;
  if (m.type === 'mining') return `<button class="btn small" data-act="apTo" data-kind="station" data-id="${m.from}">경로</button>`;
  if (m.type === 'bounty') { const s = G.sysById[m.sys]; return s.belts.length ? `<button class="btn small" data-act="apTo" data-kind="belt" data-id="${s.belts[0]}">경로</button>` : ''; }
  return '';
}
function servicesHtml(st, a, type) {
  const me = G.me;
  const spec = SHIPS[me?.type || 'shuttle'];
  const uninsured = a.ships.filter((s) => !s.ins && s.type !== 'shuttle');
  return `<div class="kv">
    <div><span>선체 상태</span><b>${st.hull} / ${spec.hull}</b></div>
    <div><span>수리 비용</span><b style="color:var(--yellow)">${fmtCredits(st.repair)}</b></div>
    <div><span>귀환 지점</span><b style="font-size:14px">${esc(G.stById[a.home]?.name || '')}</b></div>
  </div>
  <div class="flex" style="margin-top:12px"><button class="btn primary big" data-act="repair" ${st.repair > 0 && a.credits >= st.repair ? '' : 'disabled'}>🔧 전체 수리</button>
  <span class="dim">마지막으로 도킹한 스테이션이 사망 시 귀환 지점이 됩니다.</span></div>
  <div class="section-title">보험</div>
  ${uninsured.length ? uninsured.map((s) => `<div class="flex" style="margin-bottom:6px"><span style="min-width:200px">${esc(SHIPS[s.type].name)}</span><button class="btn small" data-act="insure" data-id="${s.id}">가입 ${fmtCredits(SHIPS[s.type].price * 0.15)}</button><span class="dim">보상금 ${fmtCredits(SHIPS[s.type].price * 0.75)}</span></div>`).join('') : '<div class="dim">보험이 필요한 함선이 없습니다.</div>'}
  <div class="section-title">스테이션 정보</div>
  <div style="line-height:1.8">유형: ${type.icon} ${type.name}<br>
  생산품 (저렴): <span class="good">${type.produces.map((i) => ITEMS[i].name).join(', ')}</span><br>
  수요품 (고가 매입): <span class="warn-t">${type.consumes.map((i) => ITEMS[i].name).join(', ')}</span></div>`;
}

// ============================================================
//  메뉴
// ============================================================
function renderMenu() {
  if (!G.acct) return;
  const body = $('menu-body');
  const a = G.acct;
  const scroll = body.scrollTop;
  switch (menuTab) {
    case 'pilot': {
      const worth = a.credits + a.ships.reduce((s, x) => s + SHIPS[x.type].price, 0);
      const ship = SHIPS[a.ships.find((s) => s.id === a.active)?.type || 'shuttle'];
      body.innerHTML = `<div class="kv">
        <div><span>파일럿</span><b style="font-size:16px">${a.clan ? `[${esc(a.clan)}] ` : ''}${esc(a.name)}</b></div>
        <div><span>보유 크레딧</span><b style="color:var(--yellow)">${fmtCredits(a.credits)}</b></div>
        <div><span>총 자산</span><b>${fmtCredits(worth)}</b></div>
        <div><span>누적 수입</span><b>${fmtCredits(a.stats.earned)}</b></div>
        <div><span>PvP 격추</span><b>${a.stats.kills}</b></div>
        <div><span>해적 격추</span><b>${a.stats.pve}</b></div>
        <div><span>사망</span><b>${a.stats.deaths}</b></div>
        <div><span>채굴량</span><b>${a.stats.mined}</b></div>
        <div><span>해킹 성공</span><b>${a.stats.explored}</b></div>
        <div><span>발견한 성계</span><b>${a.discovered.length} / ${G.world.systems.length}</b></div>
        <div><span>거래 횟수</span><b>${a.stats.trades}</b></div>
        <div><span>보유 함선</span><b>${a.ships.length}</b></div>
      </div>
      <div class="section-title">현재 함선</div>
      <div class="card active" style="max-width:420px"><div class="cls">${esc(ship.cls)}</div><h3 style="color:${ship.color}">${esc(ship.name)}</h3>${shipStats(ship)}</div>`;
      break;
    }
    case 'cargo': {
      const items = Object.entries(a.cargo);
      body.innerHTML = `<div class="dim" style="margin-bottom:8px">화물 ${a.cargoUsed} / ${a.cargoCap} · 우주에서 버린 화물은 컨테이너로 남아 다른 파일럿이 주울 수 있습니다.</div>
      ${items.length ? `<table class="grid"><thead><tr><th>품목</th><th class="num">수량</th><th class="num">기준가</th><th></th></tr></thead><tbody>
      ${items.map(([k, q]) => `<tr><td>${ITEMS[k] ? `<span class="swatch" style="background:${ITEMS[k].color};color:${ITEMS[k].color}"></span>` : ''}${esc(itemName(k))}</td><td class="num">${q}</td><td class="num">${ITEMS[k] ? ITEMS[k].base.toLocaleString() : '-'}</td>
      <td style="text-align:right">${G.me?.dock ? '' : `<button class="btn small warn" data-act="jettison" data-item="${esc(k)}">투하</button>`}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">화물칸이 비어 있습니다.</div>'}`;
      break;
    }
    case 'missions': {
      body.innerHTML = a.missions.length ? a.missions.map((m) => missionHtml(m, `${apBtn(m)}<button class="btn small warn" data-act="mAbandon" data-id="${m.id}">포기</button>`)).join('') : '<div class="empty">진행 중인 임무가 없습니다. 스테이션의 임무 게시판에서 임무를 수락하세요.</div>';
      break;
    }
    case 'clan': body.innerHTML = clanHtml(a); break;
    case 'ranking': body.innerHTML = rankingHtml(); break;
    case 'settings': body.innerHTML = settingsHtml(); bindSettings(); break;
    case 'help': body.innerHTML = helpHtml(); break;
  }
  body.scrollTop = scroll;
}

function clanHtml(a) {
  const c = G.clan;
  if (a.clan && c) {
    const me = c.members.find((m) => m.name === a.name);
    const isLead = c.leader === a.name, isOff = isLead || c.officers.includes(a.name);
    return `<div class="flex"><div class="win-title" style="color:${c.color};text-shadow:0 0 12px ${c.color}">[${esc(c.tag)}] ${esc(c.name)}</div><span class="dim">내 역할: ${me?.role || ''}</span>
      <span style="margin-left:auto"></span><button class="btn warn" data-act="clanLeave">클랜 탈퇴</button></div>
      <div style="margin:10px 0;padding:10px;border-left:3px solid ${c.color};background:rgba(0,0,0,.3)">📢 ${esc(c.motd)}</div>
      <div class="kv">
        <div><span>클랜 금고</span><b style="color:var(--yellow)">${fmtCredits(c.bank)}</b></div>
        <div><span>멤버</span><b>${c.members.length} (${c.members.filter((m) => m.online).length} 접속)</b></div>
        <div><span>PvP 격추</span><b>${c.kills}</b></div>
        <div><span>주권 비콘</span><b>${c.sov.length}</b></div>
      </div>
      ${c.sov.length ? `<div class="dim" style="margin-top:6px">점령 중: ${c.sov.map(esc).join(', ')} — 비콘마다 수입 + 해당 성계 현상금 10% 세금 + 멤버 현상금 15% 보너스</div>` : '<div class="dim" style="margin-top:6px">널섹의 주권 비콘 근처에 클랜원만 머무르면 점령할 수 있습니다 (지도에서 ⚑ 확인).</div>'}
      <div class="flex" style="margin-top:10px"><input id="clan-amt" type="number" min="1" placeholder="금액" style="width:140px">
        <button class="btn" data-act="clanDeposit">입금</button>${isOff ? '<button class="btn" data-act="clanWithdraw">인출</button>' : ''}</div>
      ${isOff ? `<div class="section-title">클랜 관리</div><div class="flex"><input id="clan-motd" maxlength="140" value="${esc(c.motd)}" style="flex:1;min-width:200px"><button class="btn" data-act="clanMotd">공지 저장</button>
        <button class="btn" data-act="clanOpen">${c.open ? '🔓 자유 가입 (클릭: 승인제로)' : '🔒 승인제 (클릭: 자유 가입으로)'}</button></div>
        ${c.requests.length ? `<div class="section-title">가입 신청</div>${c.requests.map((n) => `<div class="flex" style="margin-bottom:4px"><span style="min-width:160px">${esc(n)}</span><button class="btn small primary" data-act="clanAccept" data-name="${esc(n)}">승인</button><button class="btn small warn" data-act="clanReject" data-name="${esc(n)}">거절</button></div>`).join('')}` : ''}` : ''}
      <div class="section-title">멤버</div>
      <table class="grid"><thead><tr><th>이름</th><th>역할</th><th>상태</th><th></th></tr></thead><tbody>
      ${c.members.map((m) => `<tr><td>${esc(m.name)}</td><td>${m.role}</td><td>${m.online ? '<span class="good">● 접속</span>' : '<span class="dim">오프라인</span>'}</td><td style="text-align:right">
        ${isLead && m.name !== a.name ? (m.role === '간부' ? `<button class="btn small" data-act="clanDemote" data-name="${esc(m.name)}">강등</button>` : `<button class="btn small" data-act="clanPromote" data-name="${esc(m.name)}">간부 임명</button>`) + `<button class="btn small" data-act="clanTransfer" data-name="${esc(m.name)}">리더 위임</button>` : ''}
        ${isOff && m.name !== a.name && m.role !== '리더' ? `<button class="btn small warn" data-act="clanKick" data-name="${esc(m.name)}">추방</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
  }
  const list = G.clanList || [];
  return `<div class="section-title">클랜 창설</div>
    <div class="flex"><input id="clan-tag" maxlength="5" placeholder="태그 (예: NEON)" style="width:150px;text-transform:uppercase"><input id="clan-name" maxlength="24" placeholder="클랜 이름" style="flex:1;min-width:180px">
    <button class="btn primary" data-act="clanCreate">창설 (${fmtCredits(CLAN_CREATE_COST)})</button></div>
    <div class="dim" style="margin-top:6px">클랜은 전용 채팅, 공동 금고, 아군 사격 방지, 널섹 주권 비콘 점령 기능을 제공합니다.</div>
    <div class="section-title">클랜 목록</div>
    ${list.length ? `<table class="grid"><thead><tr><th>태그</th><th>이름</th><th class="num">멤버</th><th class="num">주권</th><th class="num">격추</th><th></th></tr></thead><tbody>
    ${list.map((c) => `<tr><td style="color:${c.color}" class="mono">[${esc(c.tag)}]</td><td>${esc(c.name)}</td><td class="num">${c.members}</td><td class="num">${c.sov}</td><td class="num">${c.kills}</td>
      <td style="text-align:right"><button class="btn small primary" data-act="clanJoin" data-tag="${esc(c.tag)}">${c.open ? '가입' : '가입 신청'}</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">아직 클랜이 없습니다. 첫 번째 클랜을 창설하세요!</div>'}`;
}

function rankingHtml() {
  const lb = G.lb;
  if (!lb) return '<div class="empty">불러오는 중...</div>';
  const ol = (title, list, fmt) => `<div class="card"><h3>${title}</h3><ol>${list.map((r) => `<li>${r.tag ? `<span class="clan-tag">[${esc(r.tag)}]</span>` : ''}${esc(r.name)} <b>${fmt(r.v)}</b></li>`).join('') || '<li class="dim">기록 없음</li>'}</ol></div>`;
  return `<div class="lb-grid">
    ${ol('💰 총 자산', lb.worth, (v) => fmtCredits(v))}
    ${ol('⚔ PvP 격추', lb.pvp, (v) => v)}
    ${ol('☠ 해적 사냥', lb.pve, (v) => v)}
    ${ol('✦ 탐험가', lb.explore, (v) => v + 'pt')}
    <div class="card"><h3>⚑ 클랜</h3><ol>${lb.clans.map((c) => `<li><span style="color:${c.color}">[${esc(c.tag)}]</span> ${esc(c.name)} <b>주권 ${c.sov} · ${c.members}명</b></li>`).join('') || '<li class="dim">클랜 없음</li>'}</ol></div>
  </div>`;
}

function settingsHtml() {
  const au = audioSettings();
  return `<div style="display:grid;gap:16px;max-width:520px">
    <label>효과음 볼륨 <input type="range" min="0" max="1" step="0.05" value="${au.sfx}" id="set-sfx" style="width:100%"></label>
    <label>음악 볼륨 <input type="range" min="0" max="1" step="0.05" value="${au.music}" id="set-music" style="width:100%"></label>
    <label class="flex"><input type="checkbox" id="set-quality" ${G.settings.quality === 'high' ? 'checked' : ''}> 고품질 그래픽 (글로우 · 파티클)</label>
    <label class="flex"><input type="checkbox" id="set-names" ${G.settings.names ? 'checked' : ''}> 함선 이름표 표시</label>
    <label class="flex"><input type="checkbox" id="set-scan" ${G.settings.scanlines ? 'checked' : ''}> CRT 스캔라인 효과</label>
    <div class="flex"><button class="btn warn" data-act="logout">로그아웃</button><span class="dim mono">빌드 ${esc(G.build || '-')}</span></div>
  </div>`;
}
function bindSettings() {
  $('set-sfx').oninput = (e) => setVolume('sfx', +e.target.value);
  $('set-music').oninput = (e) => setVolume('music', +e.target.value);
  $('set-quality').onchange = (e) => { G.settings.quality = e.target.checked ? 'high' : 'low'; saveSettings(); resize(); };
  $('set-names').onchange = (e) => { G.settings.names = e.target.checked; saveSettings(); };
  $('set-scan').onchange = (e) => { G.settings.scanlines = e.target.checked; saveSettings(); document.body.classList.toggle('no-scanlines', !e.target.checked); };
}

function helpHtml() {
  return `<div class="help-grid">
    <div><h4>조작</h4><kbd>W A S D</kbd> 추진/측면 이동<br><kbd>마우스</kbd> 조준 (함선이 커서를 향함)<br><kbd>우클릭 드래그</kbd> 3D 카메라 회전 · <kbd>C</kbd> 카메라 초기화<br><kbd>좌클릭</kbd>/<kbd>Space</kbd> 사격<br><kbd>Shift</kbd> 부스터 (에너지 소모)<br><kbd>J</kbd> 워프 드라이브 켜기/끄기<br><kbd>F</kbd> 채굴 레이저<br><kbd>R</kbd> 신호 스캐너<br><kbd>E</kbd> 도킹 / 해킹<br><kbd>M</kbd> 은하 지도 · <kbd>G</kbd> 가장 가까운 스테이션으로 자동 귀환 · <kbd>X</kbd> 오토파일럿 해제<br><kbd>휠</kbd> 확대/축소 · <kbd>Tab</kbd> 메뉴 · <kbd>Enter</kbd> 채팅 · <kbd>V</kbd> 채팅창 접기/펼치기</div>
    <div><h4>이동과 워프</h4>행성 사이는 순간이동 없이 직접 비행합니다. <b>J</b>를 누르면 워프 드라이브가 충전된 뒤 초고속으로 비행합니다. 워프 중에는 선회가 느리고 사격할 수 없으며, 항성 근처에서는 강제로 워프가 해제됩니다. 충전 중 피격되면 워프가 취소됩니다!<br><br><b>M</b> 은하 지도에서 목적지를 더블클릭하면 오토파일럿이 자동으로 워프해 이동하고, 스테이션이라면 자동 도킹합니다.</div>
    <div><h4>돈 버는 법</h4>⛏ <b>채굴</b>: 소행성대에서 F로 광석 채굴 → 스테이션 시장에 판매<br>⇄ <b>무역</b>: ▼생산 스테이션에서 사서 ▲수요 스테이션에 판매<br>📦 <b>임무</b>: 배송 · 현상금 · 조달 · 탐사 계약<br>☠ <b>사냥</b>: 해적 격추 현상금 + 전리품<br>✦ <b>탐험</b>: R로 이상 신호 스캔 → 찾아가서 E로 해킹 → 크레딧 + 희귀품<br>★ <b>발견</b>: 처음 방문하는 성계마다 보너스</div>
    <div><h4>보안 등급</h4><span style="color:#2cff9a">하이섹 (0.5 이상)</span>: PvP 불가, 안전하지만 수익이 낮음<br><span style="color:#ff8a00">로우섹 (0.1~0.4)</span>: PvP 가능. 무고한 파일럿을 먼저 공격하면 5분간 범죄자(☠) 지정 — 누구나 공격 가능하고 현상금이 걸림<br><span style="color:#ff1f4b">널섹 (0.0 이하)</span>: 무법지대. 최고급 광석, 강력한 해적, 워로드 보스, 클랜 주권 비콘<br><br>파괴되면 화물을 잃고 함선도 잃습니다(셔틀 제외). <b>보험</b>을 꼭 드세요!</div>
    <div><h4>클랜 & 주권</h4>메뉴 → 클랜에서 창설 또는 가입. 클랜원끼리는 서로 공격할 수 없습니다.<br>널섹의 <b>⚑ 주권 비콘</b> 반경 1.8km 안에 우리 클랜만 머무르면 점령 게이지가 오릅니다. 점령하면 클랜 금고에 지속 수입과 성계 현상금 세금이 들어옵니다. 다른 클랜이 오면 쟁탈전!</div>
    <div><h4>채팅 명령어</h4><kbd>/w 이름 메시지</kbd> 귓속말<br><kbd>/g</kbd> 전체 · <kbd>/l</kbd> 지역 · <kbd>/c</kbd> 클랜<br><kbd>/who</kbd> 접속자 목록<br><br>채팅 로그에서 이름을 클릭하면 귓속말을 보낼 수 있습니다.</div>
  </div>`;
}

// ============================================================
//  버튼 액션 (위임)
// ============================================================
function onAction(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.classList.contains('hk')) return;
  const d = b.dataset;
  const qty = (item) => Math.max(1, parseInt($(`q-${item}`)?.value, 10) || 1);
  sfx.click();
  switch (d.act) {
    case 'buy': send({ t: 'buy', item: d.item, qty: qty(d.item) }); break;
    case 'sell': send({ t: 'sell', item: d.item, qty: qty(d.item) }); break;
    case 'sellAllOre':
      for (const [k, q] of Object.entries(G.acct.cargo)) if (ITEMS[k] && ITEMS[k].kind !== 'good' && G.station.market.find((m) => m.item === k)?.legal) send({ t: 'sell', item: k, qty: q });
      break;
    case 'buyShip': if (confirm(`${SHIPS[d.type].name}을(를) ${fmtCredits(SHIPS[d.type].price)}에 구매하시겠습니까?`)) send({ t: 'buyShip', type: d.type }); break;
    case 'sellShip': if (confirm('정말 이 함선을 판매하시겠습니까?')) send({ t: 'sellShip', id: +d.id }); break;
    case 'switchShip': send({ t: 'switchShip', id: +d.id }); break;
    case 'insure': send({ t: 'insure', id: +d.id }); break;
    case 'repair': send({ t: 'repair' }); break;
    case 'mAccept': send({ t: 'mission', a: 'accept', id: d.id }); break;
    case 'mComplete': send({ t: 'mission', a: 'complete', id: d.id }); break;
    case 'mAbandon': if (confirm('임무를 포기하시겠습니까? 배송 화물은 사라집니다.')) send({ t: 'mission', a: 'abandon', id: d.id }); break;
    case 'apTo': send({ t: 'ap', kind: d.kind, id: d.id }); closeMenu(); break;
    case 'jettison': send({ t: 'jettison', item: d.item, qty: 0 }); break;
    case 'clanCreate': send({ t: 'clan', a: 'create', tag: $('clan-tag').value, name: $('clan-name').value }); break;
    case 'clanJoin': send({ t: 'clan', a: 'join', tag: d.tag }); break;
    case 'clanLeave': if (confirm('클랜을 탈퇴하시겠습니까?')) send({ t: 'clan', a: 'leave' }); break;
    case 'clanDeposit': send({ t: 'clan', a: 'deposit', amount: +$('clan-amt').value }); break;
    case 'clanWithdraw': send({ t: 'clan', a: 'withdraw', amount: +$('clan-amt').value }); break;
    case 'clanMotd': send({ t: 'clan', a: 'settings', motd: $('clan-motd').value }); break;
    case 'clanOpen': send({ t: 'clan', a: 'settings', open: !G.clan.open }); break;
    case 'clanAccept': send({ t: 'clan', a: 'accept', name: d.name }); break;
    case 'clanReject': send({ t: 'clan', a: 'reject', name: d.name }); break;
    case 'clanKick': if (confirm(`${d.name} 님을 추방하시겠습니까?`)) send({ t: 'clan', a: 'kick', name: d.name }); break;
    case 'clanPromote': send({ t: 'clan', a: 'promote', name: d.name }); break;
    case 'clanDemote': send({ t: 'clan', a: 'demote', name: d.name }); break;
    case 'clanTransfer': if (confirm(`${d.name} 님에게 리더를 위임하시겠습니까?`)) send({ t: 'clan', a: 'transfer', name: d.name }); break;
    case 'logout': try { localStorage.removeItem('nv_token'); } catch {} location.reload(); break;
  }
}
export { hexA };
