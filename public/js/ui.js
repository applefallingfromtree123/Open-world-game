// ============================================================
//  DOM UI — HUD 패널, 스테이션 서비스, 메뉴, 알림
// ============================================================
import {
  GOODS, GOOD_IDS, SHIPS, SHIP_IDS, WEAPONS, WEAPON_IDS, CORE, CORE_IDS, OPTIONALS, FACTIONS, SEC_LEVELS, STATION_TYPES, SIZE_NAME,
  shipStats, defaultLoadout, loadoutValue, weaponPrice, weaponName, corePrice, wkey, parseW, OUTPOST_KIT_PRICE, OUTPOST_MODULES, RANKS,
} from './data.js';
import { S, market, priceOf, tradeStock, netWorth, rankOf, repName, activeShip } from './state.js';
import { fmtCr, fmtDist, fmtTime, esc, hexA } from './util.js';
import { showShip, HG } from './hangar.js';
import { sfx, setVolumes } from './audio.js';
import { missionLine } from './missions.js';

const $ = (id) => document.getElementById(id);
let game;
export function initUI(g) {
  game = g;
  document.querySelectorAll('#st-tabs button').forEach((b) => b.addEventListener('click', () => { sfx.click(); stationTab(b.dataset.tab); }));
  document.querySelectorAll('#menu-tabs button').forEach((b) => b.addEventListener('click', () => { sfx.click(); menuTab(b.dataset.tab); }));
  $('btn-undock').onclick = () => game.undock();
  $('btn-menu-close').onclick = () => game.closeMenu();
  $('nav-tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { navTab = b.dataset.tab; $('nav-tabs').querySelectorAll('button').forEach((o) => o.classList.toggle('active', o === b)); updateNav(true); }));
  $('nav-list').addEventListener('click', (e) => {
    const el = e.target.closest('[data-id]'); if (!el) return;
    const id = el.dataset.id;
    const P = game.playerShip; if (!P) return;
    const t = game.world.nav.find((n) => n.id === id) || game.world.byId.get(id);
    if (t) { P.target = t; sfx.click(); updateNav(true); }
  });
  $('comms-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const v = e.target.value.trim(); e.target.value = ''; e.target.blur(); if (v) game.net.chat(v); }
    if (e.key === 'Escape') e.target.blur();
    e.stopPropagation();
  });
}

// ------------------------------------------------------------
//  알림 · 통신
// ------------------------------------------------------------
export function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
  while ($('toasts').children.length > 6) $('toasts').firstChild.remove();
}
export function commsLine(from, text, color = '#9fd8ff', kind = '') {
  const log = $('comms-log');
  const el = document.createElement('div');
  el.className = 'cl ' + kind;
  el.innerHTML = `<b style="color:${color}">${esc(from)}</b> ${esc(text)}`;
  log.appendChild(el);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
export function banner(text, sub, color) {
  const b = $('banner');
  b.innerHTML = `<div class="b1" style="color:${color || '#fff'}">${esc(text)}</div>${sub ? `<div class="b2">${esc(sub)}</div>` : ''}`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

// ------------------------------------------------------------
//  비행 중 DOM HUD
// ------------------------------------------------------------
let navTab = 'nav', lastNav = 0;
export function updateHudDom(dt) {
  const w = game.world, P = game.playerShip;
  if (!w.sys || !P) return;
  const sys = w.sys, sec = SEC_LEVELS[sys.sec], fac = FACTIONS[sys.faction];
  $('sys-name').textContent = sys.name;
  $('sys-info').innerHTML = `<span style="color:${sec.color}">${sec.name}</span> · <span style="color:${fac.color}">${fac.name}</span>`;
  // 근처 천체
  let nearest = null, nd = Infinity;
  for (const n of w.nav) { const d = n.pos.distanceTo(P.pos) - (n.radius || 0); if (d < nd) { nd = d; nearest = n; } }
  $('sys-loc').textContent = nearest ? `${nearest.name} 부근 · ${fmtDist(Math.max(0, nd))}` : '';
  const wanted = S.save.wanted[sys.faction] || 0;
  $('wanted').classList.toggle('hidden', !wanted);
  if (wanted) $('wanted').textContent = `⚠ 수배 중 — ${fac.short} 현상금 ${fmtCr(wanted)}`;
  $('credits').textContent = fmtCr(S.save.credits);
  lastNav -= dt;
  if (lastNav <= 0) { lastNav = 0.3; updateNav(); updateTarget(); updateTracker(); }
}
function updateNav(force) {
  const w = game.world, P = game.playerShip;
  let html = '';
  if (navTab === 'nav') {
    const items = w.nav.slice().sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos)).slice(0, 18);
    for (const n of items) {
      const d = n.pos.distanceTo(P.pos) - ((n.kind === 'planet' || n.kind === 'moon' || n.kind === 'star') ? n.radius : 0);
      const icon = { star: '☀', planet: '●', moon: '◦', station: '■', outpost: '⌂', field: '⁂', anomaly: '◆' }[n.kind] || '·';
      const col = n.type === 'mission' ? '#ffd84d' : n.kind === 'anomaly' ? '#ffb347' : n.kind === 'station' && n.data.faction === 'pirate' ? '#ff4d5e' : '#cfe6f5';
      html += `<div class="nv${P.target === n ? ' sel' : ''}" data-id="${n.id}"><span class="ic" style="color:${col}">${icon}</span><span class="nm">${esc(n.name)}</span><span class="d">${fmtDist(Math.max(0, d))}</span></div>`;
    }
  } else {
    const items = w.ships.filter((s) => !s.isPlayer && !s.dead && s.pos.distanceTo(P.pos) < 15000).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos)).slice(0, 18);
    const C = { hostile: '#ff4d5e', police: '#5b8cff', wing: '#5dff9d', neutral: '#e6ecf5', wanted: '#ffb347', remote: '#d08bff' };
    for (const s of items) {
      const st = w.stance(s);
      const role = s.isRemote ? '파일럿' : ({ trader: '상선', miner: '채굴선', pirate: '해적', police: '보안군', patrol: '순찰대', hunter: '사냥꾼', wing: '윙맨', explorer: '탐험가', guardian: '수호자' }[s.brain.role] || '');
      html += `<div class="nv${P.target === s ? ' sel' : ''}" data-id="${s.id}"><span class="ic" style="color:${C[st]}">▲</span><span class="nm">${esc(s.name)} <i>${role}</i></span><span class="d">${fmtDist(s.pos.distanceTo(P.pos))}</span></div>`;
    }
    if (!items.length) html = '<div class="dim" style="padding:6px">15km 이내 접촉 없음</div>';
  }
  $('nav-list').innerHTML = html;
}
function updateTarget() {
  const P = game.playerShip, t = P.target;
  const el = $('target-panel');
  if (!t || t.dead || (t.isShip && !game.world.byId.has(t.id))) { el.classList.add('hidden'); if (t && (t.dead || (t.isShip && !game.world.byId.has(t.id)))) P.target = null; return; }
  el.classList.remove('hidden');
  const d = t.pos.distanceTo(P.pos);
  if (t.isShip) {
    const st = game.world.stance(t);
    const C = { hostile: '#ff4d5e', police: '#5b8cff', wing: '#5dff9d', neutral: '#e6ecf5', wanted: '#ffb347', remote: '#d08bff' }[st];
    const role = t.isRemote ? '플레이어' : ({ trader: '상선', miner: '채굴선', pirate: '해적', police: '보안군', patrol: '순찰대', hunter: '현상금 사냥꾼', wing: '용병 윙맨', explorer: '탐험가', guardian: '고대 수호자' }[t.brain.role] || '');
    const fac = FACTIONS[t.faction] || { name: '미상', color: '#aaa' };
    el.innerHTML = `<div class="tp-name" style="color:${C}">${esc(t.name)}</div>
      <div class="tp-sub">${t.spec.name} · ${t.spec.cls} · ${role}</div>
      <div class="tp-row"><span>소속</span><b style="color:${fac.color}">${fac.name}</b></div>
      <div class="tp-row"><span>거리</span><b>${fmtDist(d)}</b></div>
      <div class="tp-row"><span>속도</span><b>${Math.round(t.speed)} m/s</b></div>
      ${t.bounty ? `<div class="tp-row"><span>현상금</span><b class="warn-t">${fmtCr(t.bounty)}</b></div>` : ''}
      <div class="tp-bar"><i style="width:${t.shield / t.stats.shield * 100}%;background:#4fc8ff"></i></div>
      <div class="tp-bar"><i style="width:${t.hull / t.stats.hull * 100}%;background:#ffae5a"></i></div>
      ${Object.keys(t.cargo).length && d < 2000 ? `<div class="tp-cargo">화물: ${Object.entries(t.cargo).map(([k, v]) => `${GOODS[k].name} ${v}t`).join(', ')}</div>` : ''}`;
  } else {
    const desc = t.kind === 'station' ? `${FACTIONS[t.data.faction].name} · ${t.data.typeName}` : t.kind === 'can' ? '화물 컨테이너 — 저속으로 접근하면 자동 회수' : t.sub || '';
    const extra = (t.kind === 'planet' || t.kind === 'moon' || t.kind === 'star') ? (S.save.explored[t.id] ? '<div class="good">✓ 탐사 완료</div>' : '<div class="dim">V키를 눌러 스캔 (근접 필요)</div>') : t.kind === 'station' || t.kind === 'outpost' ? '<div class="dim">G: 자동 도킹 · 입구로 직접 진입해도 도킹</div>' : t.kind === 'anomaly' ? '<div class="dim">근접 후 E: 회수/해킹</div>' : '';
    el.innerHTML = `<div class="tp-name">${esc(t.name)}</div><div class="tp-sub">${esc(desc)}</div><div class="tp-row"><span>거리</span><b>${fmtDist(d)}</b></div>${extra}`;
  }
}
function updateTracker() {
  const el = $('tracker');
  const ms = S.save.missions;
  const route = S.save.route || [];
  let html = '';
  if (route.length) html += `<div class="tr-route">▶ 경로: ${route.map((id) => esc(game.galaxy.byId[id].name)).join(' → ')}</div>`;
  for (const m of ms.slice(0, 5)) html += `<div class="tr-m">◇ ${esc(missionLine(m, game.galaxy))}</div>`;
  el.innerHTML = html;
}

// ------------------------------------------------------------
//  스테이션
// ------------------------------------------------------------
let curTab = 'market', selShip = null;
export function openStation() {
  const st = game.dockedAt.data;
  $('station').classList.remove('hidden');
  $('hud').classList.add('hidden');
  const fac = FACTIONS[st.faction] || { name: '개인 소유', color: '#5dff9d', short: '' };
  $('st-name').textContent = st.name;
  $('st-sub').innerHTML = st.outpost ? `<span style="color:#5dff9d">개인 기지</span> · ${esc(game.world.sys.name)}` : `<span style="color:${fac.color}">${fac.name}</span> · ${st.typeName} · ${esc(game.world.sys.name)} 성계`;
  const services = st.outpost ? ['outpost', 'storage', 'hangar', 'services'] : ['market', 'missions', ...STATION_TYPES[st.type].services.filter((s) => s === 'shipyard' || s === 'outfit' || s === 'mercs'), 'hangar', 'services'];
  const names = { market: '시장', missions: '임무', shipyard: '조선소', outfit: '장비', mercs: '용병', hangar: '함대', services: '서비스', outpost: '기지 관리', storage: '보관함' };
  $('st-tabs').innerHTML = services.map((s) => `<button data-tab="${s}">${names[s]}</button>`).join('');
  $('st-tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { sfx.click(); stationTab(b.dataset.tab); }));
  selShip = null;
  stationTab(services[0]);
}
export function closeStation() { $('station').classList.add('hidden'); $('hud').classList.remove('hidden'); }
export function refreshStation() { if (!$('station').classList.contains('hidden')) stationTab(curTab); }
function hdr() {
  const sh = activeShip(), P = game.playerShip;
  $('st-credits').innerHTML = `${fmtCr(S.save.credits)} <span class="dim">· ${esc(SHIPS[sh.type].name)} · 화물 ${P.cargoUsed()}/${P.stats.cargo}t</span>`;
}
function stationTab(tab) {
  curTab = tab;
  $('st-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const body = $('st-body');
  const fn = { market: tabMarket, missions: tabMissions, shipyard: tabShipyard, outfit: tabOutfit, mercs: tabMercs, hangar: tabHangar, services: tabServices, outpost: tabOutpost, storage: tabStorage }[tab];
  if (tab !== 'shipyard') { const sh = activeShip(); if (HG.type !== sh.type || selShip) { selShip = null; showShip(sh.type, sh.paint); } }
  body.innerHTML = '';
  fn(body);
  hdr();
}
function btn(label, cls, onclick, disabled) {
  const b = document.createElement('button');
  b.className = 'btn ' + (cls || ''); b.innerHTML = label; b.disabled = !!disabled;
  b.onclick = (e) => { e.stopPropagation(); sfx.click(); onclick(); };
  return b;
}
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

// ----- 시장 -----
function tabMarket(body) {
  const st = game.dockedAt.data;
  const mk = market(st);
  const P = game.playerShip;
  const tbl = el('table', 'tbl');
  tbl.innerHTML = '<tr><th>상품</th><th>분류</th><th class="r">재고</th><th class="r">구매가</th><th class="r">판매가</th><th class="r">보유</th><th></th></tr>';
  const ids = GOOD_IDS.filter((id) => mk.defs[id]);
  ids.sort((a, b) => (GOODS[a].cat > GOODS[b].cat ? 1 : -1));
  for (const id of ids) {
    const g = GOODS[id], p = priceOf(st, id, mk);
    const have = P.cargo[id] || 0;
    const tr = el('tr');
    const avg = g.base;
    const sc = p.sell > avg * 1.15 ? 'good' : p.sell < avg * 0.85 ? 'bad' : '';
    const bc = p.buy < avg * 0.85 ? 'good' : p.buy > avg * 1.15 ? 'bad' : '';
    tr.innerHTML = `<td><b>${g.name}</b>${g.illegal ? ' <span class="bad">불법</span>' : ''}${p.mode === 'prod' ? ' <span class="tag">생산</span>' : p.mode === 'cons' ? ' <span class="tag t2">수요</span>' : ''}</td><td class="dim">${g.cat}</td>
      <td class="r">${p.stock > 0 ? p.stock : '<span class="dim">—</span>'}</td><td class="r ${bc}">${p.stock > 0 ? fmtCr(p.buy) : '—'}</td><td class="r ${sc}">${fmtCr(p.sell)}</td><td class="r">${have || ''}</td>`;
    const td = el('td', 'acts');
    const buy = (n) => {
      n = Math.min(n, p.stock, P.cargoFree(), Math.floor(S.save.credits / p.buy));
      if (n <= 0) { sfx.error(); toast(P.cargoFree() <= 0 ? '화물칸이 가득 찼습니다' : S.save.credits < p.buy ? '크레딧이 부족합니다' : '재고가 없습니다', 'warn'); return; }
      S.save.credits -= n * p.buy; P.addCargo(id, n); tradeStock(st, id, -n); sfx.coin(); stationTab('market'); game.dirty();
    };
    const sell = (n) => {
      n = Math.min(n, have);
      if (n <= 0) return;
      P.removeCargo(id, n); S.save.credits += n * p.sell; tradeStock(st, id, n);
      S.save.stats.traded += n * p.sell; S.save.stats.earned += n * p.sell;
      sfx.coin(); stationTab('market'); game.dirty();
    };
    td.append(btn('구매 1', 'small', () => buy(1), p.stock <= 0), btn('최대', 'small', () => buy(9999), p.stock <= 0), btn('판매 1', 'small pk', () => sell(1), !have), btn('전부', 'small pk', () => sell(9999), !have));
    tr.appendChild(td);
    tbl.appendChild(tr);
  }
  body.appendChild(el('div', 'hint', '초록색 = 유리한 가격. 생산지에서 사서 수요지에 팔면 이익! 많이 팔수록 시세가 떨어집니다.'));
  body.appendChild(tbl);
  // 화물 중 시장에서 거래되지 않는 것
  const other = Object.keys(P.cargo).filter((k) => !mk.defs[k]);
  if (other.length) body.appendChild(el('div', 'hint bad', `이 스테이션에서 거래할 수 없는 화물: ${other.map((k) => GOODS[k].name).join(', ')}`));
}

// ----- 임무 -----
function tabMissions(body) {
  const st = game.dockedAt.data;
  const offers = game.missions.board(st, game.world.sys.id);
  const rep = S.save.rep[st.faction === 'player' ? 'indep' : st.faction] || 0;
  body.appendChild(el('div', 'hint', `임무 게시판은 15분마다 갱신됩니다. 이 세력과의 평판: <b style="color:${repName(rep)[1]}">${repName(rep)[0]} (${rep})</b>`));
  if (!offers.length) body.appendChild(el('div', 'dim', '현재 가능한 임무가 없습니다.'));
  for (const m of offers) {
    const card = el('div', 'card');
    card.innerHTML = `<div class="c-title">${esc(m.title)} <span class="c-rew">${fmtCr(m.reward)}</span></div><div class="c-desc">${esc(m.desc)}</div>`;
    card.appendChild(btn('수락', 'primary small', () => { const e = game.missions.accept(m); if (e) { toast(e, 'warn'); sfx.error(); } else { toast('임무 수락: ' + m.title, 'good'); stationTab('missions'); game.dirty(); } }));
    body.appendChild(card);
  }
  if (S.save.missions.length) {
    body.appendChild(el('h3', '', '진행 중인 임무'));
    for (const m of S.save.missions) {
      const card = el('div', 'card active');
      card.innerHTML = `<div class="c-title">${esc(m.title)} <span class="c-rew">${fmtCr(m.reward)}</span></div><div class="c-desc">${esc(m.desc)}</div>`;
      card.appendChild(btn('포기', 'warn small', () => { game.missions.abandon(m); stationTab('missions'); }));
      body.appendChild(card);
    }
  }
}

// ----- 조선소 -----
function tabShipyard(body) {
  const list = el('div', 'shiplist');
  const ids = SHIP_IDS.filter((id) => SHIPS[id].price > 0 || true);
  if (!selShip) selShip = ids[1];
  for (const id of ids) {
    const s = SHIPS[id];
    const it = el('div', 'si' + (selShip === id ? ' sel' : ''), `<b>${s.name}</b><span>${s.cls}</span><em>${s.price ? fmtCr(s.price) : '무료'}</em>`);
    it.onclick = () => { selShip = id; sfx.click(); stationTab('shipyard'); };
    list.appendChild(it);
  }
  body.appendChild(list);
  const s = SHIPS[selShip];
  showShip(selShip, s.paint);
  const st = shipStats(selShip, defaultLoadout(selShip));
  const cur = activeShip();
  const tradeIn = Math.round(loadoutValue(cur.type, cur.loadout) * 0.85);
  const info = el('div', 'shipinfo');
  info.innerHTML = `<div class="c-title">${s.name} <span class="dim">${s.cls} · ${s.maker}</span></div><div class="c-desc">${s.desc}</div>
    <div class="stats">
      <div><span>선체</span><b>${Math.round(st.hull)}</b></div><div><span>실드</span><b>${Math.round(st.shield)}</b></div>
      <div><span>최고속도</span><b>${Math.round(st.speed)} m/s</b></div><div><span>부스트</span><b>${Math.round(st.boost)} m/s</b></div>
      <div><span>선회력</span><b>${(s.pitch * 57.3).toFixed(0)}°/s</b></div><div><span>도약 거리</span><b>${st.jump.toFixed(1)} ly</b></div>
      <div><span>하드포인트</span><b>${s.hard.map((h) => SIZE_NAME[h]).join(' ')}</b></div><div><span>옵션 슬롯</span><b>${s.opt}</b></div>
      <div><span>화물칸</span><b>${st.cargo}t (최대 ${Math.round(s.rack * (s.opt + 0.5))}t)</b></div><div><span>연료</span><b>${st.fuel}t</b></div>
    </div>`;
  const row = el('div', 'row');
  row.appendChild(btn(`구매 ${fmtCr(s.price)}`, 'primary', () => buyShip(selShip, false), S.save.credits < s.price));
  row.appendChild(btn(`보상판매 구매 (현재 함선 −${fmtCr(tradeIn)})`, '', () => buyShip(selShip, true), S.save.credits + tradeIn < s.price || S.save.ships.length < 1));
  info.appendChild(row);
  info.appendChild(el('div', 'hint', '구매한 함선은 이 스테이션 격납고에 보관됩니다. 함대 탭에서 교체할 수 있습니다.'));
  body.appendChild(info);
}
function buyShip(id, trade) {
  const s = SHIPS[id];
  const cur = activeShip();
  const P = game.playerShip;
  let credit = 0;
  if (trade) {
    if (P.cargoUsed() > 0) { toast('보상판매 전 화물을 비우세요', 'warn'); return; }
    credit = Math.round(loadoutValue(cur.type, cur.loadout) * 0.85);
  }
  if (S.save.credits + credit < s.price) { toast('크레딧이 부족합니다', 'warn'); sfx.error(); return; }
  S.save.credits += credit - s.price;
  const lo = defaultLoadout(id);
  const st = shipStats(id, lo);
  const nsh = { id: 'h' + Date.now().toString(36), type: id, loadout: lo, paint: s.paint.slice(), nick: '', loc: game.dockedAt.id, hull: 1, fuel: st.fuel, cargo: {}, ammo: {} };
  if (trade) S.save.ships = S.save.ships.filter((x) => x !== cur);
  S.save.ships.push(nsh);
  if (trade) game.switchShip(nsh.id);
  sfx.coin();
  toast(`${s.name} 구매 완료!`, 'good');
  game.dirty(); stationTab(trade ? 'outfit' : 'hangar');
}

// ----- 장비 -----
function tabOutfit(body) {
  const sh = activeShip(), spec = SHIPS[sh.type];
  const P = game.playerShip;
  const lo = sh.loadout;
  const apply = () => { game.applyLoadout(); stationTab('outfit'); game.dirty(); };
  body.appendChild(el('div', 'hint', `<b>${spec.name}</b>의 장비를 교체합니다. 판매 시 정가의 80%를 돌려받습니다.`));
  // 하드포인트
  body.appendChild(el('h3', '', '하드포인트 (무기)'));
  spec.hard.forEach((size, i) => {
    const cur = lo.hard[i];
    const r = el('div', 'slot');
    r.innerHTML = `<span class="sz">${SIZE_NAME[size]}</span><b>${weaponName(cur)}</b>`;
    const sel = el('select');
    sel.innerHTML = `<option value="">— 교체할 무기 선택 —</option>` + WEAPON_IDS.flatMap((wid) => [1, 2, 3].filter((s2) => s2 <= size).map((s2) => {
      const k = wkey(wid, s2), pr = weaponPrice(k);
      const W = WEAPONS[wid];
      return `<option value="${k}">${W.name} ${SIZE_NAME[s2]} — ${fmtCr(pr)} (${W.kind === 'beam' ? '채굴' : `피해 ${Math.round(W.dmg * [0, 1, 1.85, 3.2][s2])}${W.rof > 1.5 ? '×' + W.rof + '/s' : ''}`})</option>`;
    })).join('');
    sel.onchange = () => {
      const k = sel.value; if (!k) return;
      const price = weaponPrice(k) - (cur ? Math.round(weaponPrice(cur) * 0.8) : 0);
      if (S.save.credits < price) { toast('크레딧이 부족합니다', 'warn'); sfx.error(); sel.value = ''; return; }
      S.save.credits -= price; lo.hard[i] = k; sfx.coin(); apply();
    };
    r.appendChild(sel);
    if (cur) r.appendChild(btn('판매', 'small warn', () => { S.save.credits += Math.round(weaponPrice(cur) * 0.8); lo.hard[i] = null; apply(); }));
    body.appendChild(r);
  });
  // 코어
  body.appendChild(el('h3', '', '코어 모듈 (등급 1~5)'));
  for (const c of CORE_IDS) {
    const g = lo.core[c];
    const r = el('div', 'slot');
    r.innerHTML = `<span class="sz">${'★'.repeat(g)}</span><b>${CORE[c].name}</b><span class="dim">${CORE[c].desc} ×${CORE[c].mul[g]}</span>`;
    if (g < 5) { const p = corePrice(sh.type, c, g + 1) - Math.round(corePrice(sh.type, c, g) * 0.8); r.appendChild(btn(`업그레이드 ${fmtCr(p)}`, 'small primary', () => { if (S.save.credits < p) { toast('크레딧이 부족합니다', 'warn'); return; } S.save.credits -= p; lo.core[c] = g + 1; sfx.coin(); apply(); }, S.save.credits < p)); }
    if (g > 1) { const back = Math.round(corePrice(sh.type, c, g) * 0.8) - corePrice(sh.type, c, g - 1); r.appendChild(btn(`다운그레이드 +${fmtCr(back)}`, 'small', () => { S.save.credits += back; lo.core[c] = g - 1; apply(); })); }
    body.appendChild(r);
  }
  // 옵션
  body.appendChild(el('h3', '', '옵션 슬롯'));
  lo.opt.forEach((o, i) => {
    const r = el('div', 'slot');
    const desc = o ? OPTIONALS[o].desc.replace('{rack}', spec.rack).replace('{fuel}', Math.max(2, Math.round(spec.fuel * 0.5))) : '';
    r.innerHTML = `<span class="sz">${i + 1}</span><b>${o ? OPTIONALS[o].name : '— 비어 있음 —'}</b><span class="dim">${desc}</span>`;
    const sel = el('select');
    sel.innerHTML = '<option value="">— 설치 —</option>' + Object.keys(OPTIONALS).filter((k) => !(OPTIONALS[k].unique && lo.opt.includes(k))).map((k) => `<option value="${k}">${OPTIONALS[k].name} — ${fmtCr(OPTIONALS[k].price)}</option>`).join('');
    sel.onchange = () => {
      const k = sel.value; if (!k) return;
      const price = OPTIONALS[k].price - (o ? Math.round(OPTIONALS[o].price * 0.8) : 0);
      if (o === 'cargo' && P.cargoUsed() > P.stats.cargo - spec.rack) { toast('화물을 먼저 비우세요', 'warn'); sel.value = ''; return; }
      if (S.save.credits < price) { toast('크레딧이 부족합니다', 'warn'); sel.value = ''; return; }
      S.save.credits -= price; lo.opt[i] = k; sfx.coin(); apply();
    };
    r.appendChild(sel);
    if (o) r.appendChild(btn('제거', 'small warn', () => { if (o === 'cargo' && P.cargoUsed() > P.stats.cargo - spec.rack) { toast('화물을 먼저 비우세요', 'warn'); return; } S.save.credits += Math.round(OPTIONALS[o].price * 0.8); lo.opt[i] = null; apply(); }));
    body.appendChild(r);
  });
  // 도색
  body.appendChild(el('h3', '', '도색'));
  const pr = el('div', 'slot');
  pr.innerHTML = '<b>주 색상 / 보조 색상</b><span class="dim">2,000 Cr</span>';
  const c1 = el('input'); c1.type = 'color'; c1.value = sh.paint[0];
  const c2 = el('input'); c2.type = 'color'; c2.value = sh.paint[1];
  c1.oninput = c2.oninput = () => showShip(sh.type, [c1.value, c2.value]);
  pr.append(c1, c2, btn('도색 적용', 'small primary', () => { if (S.save.credits < 2000) return toast('크레딧이 부족합니다', 'warn'); S.save.credits -= 2000; sh.paint = [c1.value, c2.value]; game.applyLoadout(); sfx.coin(); stationTab('outfit'); game.dirty(); }));
  body.appendChild(pr);
  const v = loadoutValue(sh.type, lo);
  body.appendChild(el('div', 'hint', `함선 가치: ${fmtCr(v)} · 화물 ${P.stats.cargo}t · 도약 ${P.stats.jump.toFixed(1)} ly · 속도 ${Math.round(P.stats.speed)} m/s`));
}

// ----- 용병 -----
function tabMercs(body) {
  body.appendChild(el('div', 'hint', '용병 윙맨은 당신을 따라다니며 함께 싸웁니다. 계약 기간 동안 성계 이동도 함께합니다. (최대 2명)'));
  const offers = [
    { type: 'kestrel', name: '"코요테" 레인', skill: '중급', price: 18000, hours: 1 },
    { type: 'mantis', name: '"아이언" 발렌', skill: '고급', price: 42000, hours: 1 },
    { type: 'vanguard', name: '"타이탄" 보스', skill: '정예', price: 110000, hours: 1 },
  ];
  for (const o of offers) {
    const card = el('div', 'card');
    card.innerHTML = `<div class="c-title">${esc(o.name)} <span class="c-rew">${fmtCr(o.price)}</span></div><div class="c-desc">${SHIPS[o.type].name} · 실력 ${o.skill} · 계약 ${o.hours}시간(실시간)</div>`;
    card.appendChild(btn('고용', 'primary small', () => {
      if (S.save.wingmen.length >= 2) return toast('윙맨은 최대 2명입니다', 'warn');
      if (S.save.credits < o.price) return toast('크레딧이 부족합니다', 'warn');
      S.save.credits -= o.price;
      S.save.wingmen.push({ id: 'w' + Date.now().toString(36), type: o.type, name: o.name, until: Date.now() + o.hours * 3600e3 });
      sfx.coin(); toast(`${o.name} 고용 완료`, 'good'); game.dirty(); stationTab('mercs');
    }));
    body.appendChild(card);
  }
  if (S.save.wingmen.length) {
    body.appendChild(el('h3', '', '계약 중'));
    for (const w of S.save.wingmen) {
      const r = el('div', 'slot', `<b>${esc(w.name)}</b><span class="dim">${SHIPS[w.type].name} · 남은 시간 ${fmtTime((w.until - Date.now()) / 1000)}</span>`);
      r.appendChild(btn('해고', 'small warn', () => { S.save.wingmen = S.save.wingmen.filter((x) => x !== w); stationTab('mercs'); game.dirty(); }));
      body.appendChild(r);
    }
  }
}

// ----- 함대 -----
function tabHangar(body) {
  const here = game.dockedAt.id;
  body.appendChild(el('div', 'hint', '보유한 함선 목록입니다. 같은 스테이션에 있는 함선으로 교체하거나, 다른 곳의 함선을 이곳으로 운송할 수 있습니다.'));
  for (const sh of S.save.ships) {
    const s = SHIPS[sh.type];
    const active = sh.id === S.save.active;
    const at = sh.loc === here || active;
    const locName = active ? '탑승 중' : game.stationName(sh.loc);
    const card = el('div', 'card' + (active ? ' active' : ''));
    card.innerHTML = `<div class="c-title">${s.name} <span class="dim">${s.cls}</span> <span class="c-rew">${fmtCr(loadoutValue(sh.type, sh.loadout))}</span></div><div class="c-desc">위치: ${esc(locName)} · 무기: ${sh.loadout.hard.filter(Boolean).map(weaponName).join(', ') || '없음'}</div>`;
    const row = el('div', 'row');
    if (!active && at) row.appendChild(btn('탑승', 'primary small', () => { if (game.playerShip.cargoUsed() > 0 && SHIPS[sh.type].rack < 1) return; game.switchShip(sh.id); stationTab('hangar'); }));
    if (!active && !at) { const cost = 5000 + Math.round(s.price * 0.02); row.appendChild(btn(`이곳으로 운송 ${fmtCr(cost)}`, 'small', () => { if (S.save.credits < cost) return toast('크레딧이 부족합니다', 'warn'); S.save.credits -= cost; sh.loc = here; sfx.coin(); toast('운송 완료', 'good'); game.dirty(); stationTab('hangar'); })); }
    if (!active && at) row.appendChild(btn(`판매 +${fmtCr(Math.round(loadoutValue(sh.type, sh.loadout) * 0.8))}`, 'small warn', () => { S.save.credits += Math.round(loadoutValue(sh.type, sh.loadout) * 0.8); S.save.ships = S.save.ships.filter((x) => x !== sh); sfx.coin(); game.dirty(); stationTab('hangar'); }));
    card.appendChild(row);
    body.appendChild(card);
  }
}

// ----- 서비스 -----
function tabServices(body) {
  const P = game.playerShip, st = game.dockedAt.data, sh = activeShip();
  const repairCost = Math.round((1 - P.hull / P.stats.hull) * SHIPS[sh.type].price * 0.04 + (P.hull < P.stats.hull ? 60 : 0));
  const fuelCost = Math.round((P.stats.fuel - P.fuel) * 70);
  const ammoNeed = P.weapons.filter((w) => w.w.ammo).reduce((a, w) => a + (w.maxAmmo - w.ammo), 0);
  const ammoCost = ammoNeed * 250;
  const r1 = el('div', 'slot', `<b>선체 수리</b><span class="dim">${Math.round(P.hull / P.stats.hull * 100)}%</span>`);
  r1.appendChild(btn(`수리 ${fmtCr(repairCost)}`, 'small primary', () => { if (S.save.credits < repairCost) return toast('크레딧 부족', 'warn'); S.save.credits -= repairCost; P.hull = P.stats.hull; sfx.coin(); stationTab('services'); }, repairCost <= 0));
  const r2 = el('div', 'slot', `<b>연료 보급</b><span class="dim">${P.fuel.toFixed(1)} / ${P.stats.fuel}t</span>`);
  r2.appendChild(btn(`보급 ${fmtCr(fuelCost)}`, 'small primary', () => { if (S.save.credits < fuelCost) return toast('크레딧 부족', 'warn'); S.save.credits -= fuelCost; P.fuel = P.stats.fuel; sfx.coin(); stationTab('services'); }, fuelCost <= 0));
  const r3 = el('div', 'slot', `<b>미사일 재장전</b><span class="dim">${ammoNeed}발 부족</span>`);
  r3.appendChild(btn(`재장전 ${fmtCr(ammoCost)}`, 'small primary', () => { if (S.save.credits < ammoCost) return toast('크레딧 부족', 'warn'); S.save.credits -= ammoCost; P.weapons.forEach((w) => { w.ammo = w.maxAmmo; }); sfx.coin(); stationTab('services'); }, ammoNeed <= 0));
  body.append(r1, r2, r3);
  // 탐사 데이터
  const unsold = Object.entries(S.save.explored).filter(([, v]) => !v.sold);
  const total = unsold.reduce((a, [, v]) => a + v.value, 0);
  const r4 = el('div', 'slot', `<b>탐사 데이터 판매</b><span class="dim">${unsold.length}건 · ${fmtCr(total)}</span>`);
  r4.appendChild(btn('판매', 'small primary', () => {
    unsold.forEach(([, v]) => { v.sold = true; });
    game.reward(total, `탐사 데이터 ${unsold.length}건 판매`); stationTab('services');
  }, !unsold.length || st.outpost));
  body.appendChild(r4);
  // 회수품 (블랙박스 등)은 시장에서
  // 벌금
  const fac = st.faction;
  const wantedHere = Object.entries(S.save.wanted).filter(([f, v]) => v > 0 && (fac === 'pirate' || st.outpost || fac === 'indep' || f === fac));
  if (wantedHere.length) {
    body.appendChild(el('h3', '', '현상금 · 벌금 정산'));
    for (const [f, v] of wantedHere) {
      const cost = Math.round(v * (f === fac ? 1 : 1.25));
      const r = el('div', 'slot', `<b style="color:${FACTIONS[f].color}">${FACTIONS[f].name} 수배</b><span class="dim">현상금 ${fmtCr(v)}${f !== fac ? ' (중개 수수료 25%)' : ''}</span>`);
      r.appendChild(btn(`정산 ${fmtCr(cost)}`, 'small warn', () => { if (S.save.credits < cost) return toast('크레딧 부족', 'warn'); S.save.credits -= cost; delete S.save.wanted[f]; sfx.coin(); toast('기록이 말소되었습니다', 'good'); stationTab('services'); game.dirty(); }));
      body.appendChild(r);
    }
  }
  // 기지 키트
  if (!st.outpost && (st.type === 'industry' || st.type === 'pirate' || st.type === 'military')) {
    body.appendChild(el('h3', '', '개인 기지'));
    const have = S.save.storage.outpost_kit || 0;
    const r = el('div', 'slot', `<b>기지 건설 키트</b><span class="dim">우주 어디에서나 B키로 개인 기지를 건설 (보유 ${have})</span>`);
    r.appendChild(btn(`구매 ${fmtCr(OUTPOST_KIT_PRICE)}`, 'small primary', () => { if (S.save.credits < OUTPOST_KIT_PRICE) return toast('크레딧 부족', 'warn'); S.save.credits -= OUTPOST_KIT_PRICE; S.save.storage.outpost_kit = have + 1; sfx.coin(); toast('기지 건설 키트 구매 — 출항 후 원하는 곳에서 B키', 'good'); stationTab('services'); game.dirty(); }));
    body.appendChild(r);
  }
}

// ----- 개인 기지 -----
function tabOutpost(body) {
  const o = game.dockedAt.data.outpost;
  const inc = game.outpostIncome(o);
  body.appendChild(el('div', 'hint', `<b>${esc(o.name)}</b> — 건설일 ${new Date(o.built).toLocaleDateString()} · 시간당 수익 ${fmtCr(inc.rate)}${inc.nearField ? ' (소행성대 보너스 적용)' : ''}`));
  const r = el('div', 'slot', `<b>누적 수익</b><span class="dim">${fmtCr(inc.pending)}</span>`);
  r.appendChild(btn('수령', 'small primary', () => { game.collectOutpost(o); stationTab('outpost'); }, inc.pending < 1));
  body.appendChild(r);
  const nm = el('div', 'slot', '<b>기지 이름</b>');
  const inp = el('input'); inp.value = o.name; inp.maxLength = 24;
  nm.append(inp, btn('변경', 'small', () => { o.name = inp.value.trim().slice(0, 24) || o.name; game.dockedAt.name = o.name; game.dockedAt.data.name = o.name; game.dirty(); openStation(); }));
  body.appendChild(nm);
  body.appendChild(el('h3', '', '모듈 건설'));
  for (const [k, m] of Object.entries(OUTPOST_MODULES)) {
    const n = o.modules[k] || 0;
    const rr = el('div', 'slot', `<b>${m.name}</b> <span class="sz">${n}/${m.max}</span><span class="dim">${m.desc}</span>`);
    rr.appendChild(btn(`건설 ${fmtCr(m.price)}`, 'small primary', () => {
      if (S.save.credits < m.price) return toast('크레딧 부족', 'warn');
      S.save.credits -= m.price; game.collectOutpost(o, true); o.modules[k] = n + 1; sfx.coin(); game.world.rebuildOutpost(o); toast(`${m.name} 건설 완료`, 'good'); game.dirty(); stationTab('outpost');
    }, n >= m.max));
    body.appendChild(rr);
  }
  body.appendChild(el('h3', '', '기지 해체'));
  const d = el('div', 'slot', '<b>기지를 해체하고 키트로 회수</b><span class="dim">모듈은 50% 가치로 환급됩니다</span>');
  d.appendChild(btn('해체', 'small warn', () => {
    if (!confirm('정말 기지를 해체하시겠습니까?')) return;
    let refund = 0; for (const [k, n] of Object.entries(o.modules)) refund += OUTPOST_MODULES[k].price * n * 0.5;
    game.collectOutpost(o, true);
    S.save.credits += Math.round(refund);
    for (const [k, v] of Object.entries(o.storage || {})) S.save.storage[k] = (S.save.storage[k] || 0) + v;
    S.save.storage.outpost_kit = (S.save.storage.outpost_kit || 0) + 1;
    game.removeOutpost(o);
  }));
  body.appendChild(d);
}
function tabStorage(body) {
  const o = game.dockedAt.data.outpost;
  const P = game.playerShip;
  o.storage = o.storage || {};
  body.appendChild(el('div', 'hint', '기지 보관함에는 화물을 무제한 보관할 수 있습니다. 교역소 모듈이 있으면 NPC 상인에게 판매할 수 있습니다.'));
  const tbl = el('table', 'tbl');
  tbl.innerHTML = '<tr><th>화물</th><th class="r">함선</th><th class="r">보관함</th><th></th></tr>';
  const ids = [...new Set([...Object.keys(P.cargo), ...Object.keys(o.storage)])];
  for (const id of ids) {
    const tr = el('tr');
    tr.innerHTML = `<td><b>${GOODS[id].name}</b></td><td class="r">${P.cargo[id] || 0}</td><td class="r">${o.storage[id] || 0}</td>`;
    const td = el('td', 'acts');
    td.append(btn('맡기기', 'small', () => { const n = P.removeCargo(id, P.cargo[id] || 0); o.storage[id] = (o.storage[id] || 0) + n; stationTab('storage'); game.dirty(); }, !P.cargo[id]),
      btn('꺼내기', 'small', () => { const n = P.addCargo(id, o.storage[id] || 0); o.storage[id] -= n; if (o.storage[id] <= 0) delete o.storage[id]; stationTab('storage'); game.dirty(); }, !o.storage[id]));
    if (o.modules.market) td.append(btn('판매', 'small pk', () => { const n = o.storage[id] || 0; const v = Math.round(GOODS[id].base * 1.1 * n); delete o.storage[id]; game.reward(v, `교역소 판매: ${GOODS[id].name} ${n}t`); stationTab('storage'); }, !o.storage[id] || GOODS[id].illegal));
    tr.appendChild(td);
    tbl.appendChild(tr);
  }
  if (!ids.length) body.appendChild(el('div', 'dim', '보관 중인 화물이 없습니다.'));
  else body.appendChild(tbl);
}

// ------------------------------------------------------------
//  메뉴 (ESC)
// ------------------------------------------------------------
let menuCur = 'pilot';
export function openMenu(tab) {
  $('menu').classList.remove('hidden');
  menuTab(tab || menuCur);
}
export function closeMenu() { $('menu').classList.add('hidden'); }
function menuTab(tab) {
  menuCur = tab;
  document.querySelectorAll('#menu-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const body = $('menu-body');
  body.innerHTML = '';
  ({ pilot: mPilot, cargo: mCargo, missions: mMissions, factions: mFactions, ranking: mRanking, settings: mSettings, help: mHelp })[tab](body);
}
function mPilot(body) {
  const s = S.save, st = s.stats, rk = rankOf();
  const P = game.playerShip;
  body.innerHTML = `<div class="pilot-head"><div class="ph-name">${esc(s.name)}</div><div class="ph-rank">${rk.name}</div></div>
  <div class="grid2">
    <div class="kv"><span>보유 크레딧</span><b>${fmtCr(s.credits)}</b></div><div class="kv"><span>총 자산</span><b>${fmtCr(netWorth())}</b></div>
    <div class="kv"><span>현재 함선</span><b>${P ? P.spec.name : '-'}</b></div><div class="kv"><span>보유 함선</span><b>${s.ships.length}척</b></div>
    <div class="kv"><span>총 수입</span><b>${fmtCr(st.earned)}</b></div><div class="kv"><span>무역 거래액</span><b>${fmtCr(st.traded)}</b></div>
    <div class="kv"><span>격추</span><b>${st.kills} (해적 ${st.pirates})</b></div><div class="kv"><span>받은 현상금</span><b>${fmtCr(st.bounties)}</b></div>
    <div class="kv"><span>채굴량</span><b>${st.mined}t</b></div><div class="kv"><span>탐사 스캔</span><b>${st.scans}</b></div>
    <div class="kv"><span>하이퍼점프</span><b>${st.jumps}회</b></div><div class="kv"><span>방문 성계</span><b>${Object.keys(s.visited).length} / ${game.galaxy.systems.length}</b></div>
    <div class="kv"><span>완료 임무</span><b>${st.missions}</b></div><div class="kv"><span>회수한 신호원</span><b>${st.salvaged}</b></div>
    <div class="kv"><span>비행 거리</span><b>${fmtDist(st.dist)}</b></div><div class="kv"><span>격추당함</span><b>${st.deaths}회</b></div>
    <div class="kv"><span>플레이 시간</span><b>${fmtTime(st.playtime)}</b></div><div class="kv"><span>개인 기지</span><b>${s.outposts.length}개</b></div>
  </div>
  <div class="hint">계급은 총 자산과 수입으로 결정됩니다. 다음 계급: ${(RANKS.find((r) => r.at > netWorth() + st.earned * 0.3) || { name: '최고' }).name}</div>`;
}
function mCargo(body) {
  const P = game.playerShip;
  if (!P) return;
  body.appendChild(el('div', 'hint', `화물 ${P.cargoUsed()}/${P.stats.cargo}t — 투하한 화물은 우주에 컨테이너로 남습니다.`));
  const ids = Object.keys(P.cargo);
  if (!ids.length) body.appendChild(el('div', 'dim', '화물칸이 비어 있습니다.'));
  for (const id of ids) {
    const r = el('div', 'slot', `<b>${GOODS[id].name}</b><span class="sz">${P.cargo[id]}t</span><span class="dim">기준가 ${fmtCr(GOODS[id].base)}${GOODS[id].illegal ? ' · <span class="bad">불법</span>' : ''}</span>`);
    if (!game.docked) r.appendChild(btn('투하', 'small warn', () => { const n = P.removeCargo(id, P.cargo[id]); game.world.dropCan(P.pos.clone().addScaledVector(P.forward, -P.radius * 3), id, n, P.vel.clone().multiplyScalar(0.8)); menuTab('cargo'); }));
    body.appendChild(r);
  }
  const kits = S.save.storage.outpost_kit || 0;
  if (kits) body.appendChild(el('div', 'hint good', `기지 건설 키트 ${kits}개 보유 — 스테이션·행성에서 20km 이상 떨어진 곳에서 B키로 건설`));
}
function mMissions(body) {
  if (!S.save.missions.length) body.appendChild(el('div', 'dim', '진행 중인 임무가 없습니다. 스테이션 임무 게시판을 확인하세요.'));
  for (const m of S.save.missions) {
    const card = el('div', 'card active');
    card.innerHTML = `<div class="c-title">${esc(m.title)} <span class="c-rew">${fmtCr(m.reward)}</span></div><div class="c-desc">${esc(m.desc)}<br><span class="dim">의뢰: ${esc(m.fromName)}</span></div>`;
    const row = el('div', 'row');
    if (m.sys && m.sys !== game.world.sys.id) row.appendChild(btn('경로 설정', 'small', () => game.plotTo(m.sys)));
    if (m.sys === game.world.sys.id) row.appendChild(btn('항법 목표', 'small', () => game.targetMission(m)));
    row.appendChild(btn('포기', 'small warn', () => { game.missions.abandon(m); menuTab('missions'); }));
    card.appendChild(row);
    body.appendChild(card);
  }
}
function mFactions(body) {
  for (const f of ['union', 'free', 'syndicate', 'pirate', 'indep']) {
    const F = FACTIONS[f], v = S.save.rep[f] || 0, [rn, rc] = repName(v);
    const wanted = S.save.wanted[f] || 0;
    body.appendChild(el('div', 'card', `<div class="c-title" style="color:${F.color}">${F.name} <span style="color:${rc}">${rn} (${v})</span></div>
      <div class="repbar"><i style="left:${(v + 100) / 2}%"></i></div><div class="c-desc">${F.desc}${wanted ? `<br><b class="bad">수배 중: 현상금 ${fmtCr(wanted)}</b>` : ''}</div>`));
  }
  body.appendChild(el('div', 'hint', '평판이 높으면 시장 가격이 유리해집니다. 비우호 이하로 떨어지면 해당 세력의 보안군이 적대합니다. 해적 평판이 "우호"(25) 이상이면 해적이 당신을 공격하지 않습니다.'));
}
function mRanking(body) {
  body.innerHTML = '<div class="dim">랭킹 불러오는 중...</div>';
  game.net.leaderboard((lb) => {
    if (!lb) { body.innerHTML = '<div class="dim">오프라인 모드에서는 랭킹을 볼 수 없습니다.</div>'; return; }
    const tbl = el('table', 'tbl');
    tbl.innerHTML = '<tr><th>#</th><th>파일럿</th><th>계급</th><th class="r">총 자산</th><th class="r">격추</th><th class="r">방문 성계</th></tr>' +
      lb.map((r, i) => `<tr${r.name === S.save.name ? ' class="me"' : ''}><td>${i + 1}</td><td><b>${esc(r.name)}</b>${r.online ? ' <span class="good">●</span>' : ''}</td><td>${esc(r.rank || '')}</td><td class="r">${fmtCr(r.worth)}</td><td class="r">${r.kills}</td><td class="r">${r.visited}</td></tr>`).join('');
    body.innerHTML = '';
    body.appendChild(el('div', 'hint', `접속 중인 파일럿: ${game.net.online}명`));
    body.appendChild(tbl);
  });
}
function mSettings(body) {
  const st = S.save.settings;
  const row = (label, input) => { const r = el('div', 'slot', `<b>${label}</b>`); r.appendChild(input); body.appendChild(r); };
  const range = (val, min, max, step, on) => { const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = val; i.oninput = () => on(+i.value); return i; };
  const select = (val, opts, on) => { const s = el('select'); s.innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === val ? ' selected' : ''}>${l}</option>`).join(''); s.onchange = () => on(s.value); return s; };
  row('효과음 볼륨', range(st.sfx, 0, 1, 0.05, (v) => { st.sfx = v; setVolumes(st.sfx, st.music); }));
  row('음악 볼륨', range(st.music, 0, 1, 0.05, (v) => { st.music = v; setVolumes(st.sfx, st.music); }));
  row('마우스 감도', range(st.sens, 0.3, 2.5, 0.1, (v) => { st.sens = v; }));
  row('마우스 Y축 반전', select(String(st.invertY), [['false', '끔'], ['true', '켬']], (v) => { st.invertY = v === 'true'; }));
  row('마우스 조종 방식', select(st.mouseMode, [['virtual', '가상 조이스틱 (커서 위치 유지)'], ['relative', '상대 이동 (자동 중앙 복귀)']], (v) => { st.mouseMode = v; }));
  row('그래픽 품질', select(st.quality, [['high', '높음 (그림자 · 고해상도)'], ['mid', '중간'], ['low', '낮음 (그림자 끔)']], (v) => { st.quality = v; game.setQuality(v); }));
  row('HUD 색상', (() => { const i = el('input'); i.type = 'color'; i.value = st.hudColor; i.oninput = () => { st.hudColor = i.value; document.documentElement.style.setProperty('--hud', i.value); }; return i; })());
  const r = el('div', 'row');
  r.append(btn('저장 후 로그아웃', 'warn', () => game.logout()));
  body.appendChild(r);
}
function mHelp(body) {
  body.innerHTML = `<div class="help">
  <h3>비행</h3>
  <p><kbd>마우스</kbd> 기수 방향 (가상 조이스틱 — 화면을 클릭하면 마우스가 잠깁니다) · <kbd>W</kbd>/<kbd>S</kbd> 스로틀 증감 · <kbd>X</kbd> 스로틀 0 · <kbd>A</kbd>/<kbd>D</kbd> 좌우 이동 · <kbd>R</kbd>/<kbd>F</kbd> 상하 이동 · <kbd>Q</kbd>/<kbd>E</kbd> 롤 · <kbd>Shift</kbd> 부스트 · <kbd>Z</kbd> 비행 보조 ON/OFF (OFF면 뉴턴 관성 비행) · <kbd>Alt</kbd> 누르는 동안 자유 시점</p>
  <h3>전투</h3>
  <p><kbd>좌클릭</kbd> 주무기 (채굴 레이저 포함) · <kbd>우클릭</kbd> 미사일 · <kbd>T</kbd> 조준선 근처 표적 선택 · <kbd>Y</kbd> 가장 가까운 적 · <kbd>Tab</kbd> 표적 순환. 표적을 잡으면 짐벌 무기가 리드 지점을 자동 보정합니다.</p>
  <h3>항법</h3>
  <p><kbd>J</kbd> 크루즈 드라이브 (성계 내 고속 이동, 목표를 정면에 두면 자동 감속) · <kbd>G</kbd> 오토파일럿 (목표까지 자동 비행, 스테이션이면 자동 도킹) · <kbd>M</kbd> 은하 지도 · <kbd>H</kbd> 경로상 다음 성계로 하이퍼점프 · <kbd>N</kbd> 항법/접촉 패널 전환</p>
  <h3>활동</h3>
  <p><kbd>V</kbd> (누르고 있기) 행성·항성 탐사 스캔 · <kbd>E</kbd> 신호원 회수/해킹 · <kbd>B</kbd> 기지 건설 · <kbd>C</kbd> 카메라 시점 전환 (추적/원거리/조종석) · <kbd>휠</kbd> 카메라 거리 · <kbd>Enter</kbd> 채팅 · <kbd>Esc</kbd> 메뉴</p>
  <h3>할 수 있는 일</h3>
  <ul><li><b>무역</b>: 생산지에서 싸게 사서 수요지에 비싸게 팔기. 불법품은 해적 소굴에서만 거래되며 보안군 스캔에 걸리면 압수.</li>
  <li><b>채굴</b>: 채굴 레이저로 소행성을 깎아 광석 수집. 저보안 성계일수록 귀한 광물.</li>
  <li><b>현상금 사냥</b>: 해적을 격추하면 즉시 현상금. 신호원·교전 지역에서 더 많은 표적을.</li>
  <li><b>해적질</b>: 상선을 공격해 화물을 빼앗을 수도 있지만 수배되고 현상금 사냥꾼이 쫓아옵니다.</li>
  <li><b>탐험</b>: 행성을 스캔해 데이터를 판매. 처음 방문한 성계는 서버에 최초 발견자로 기록됩니다.</li>
  <li><b>임무</b>: 배송·운송·조달·현상금·소탕·탐사·밀수.</li>
  <li><b>기지</b>: 키트를 사서 원하는 곳에 개인 기지 건설 → 정제소로 시간당 수익, 보관함, 방어 포탑.</li>
  <li><b>용병</b>: 군사 요새에서 윙맨을 고용해 함께 비행.</li></ul></div>`;
}
export { selShip };
