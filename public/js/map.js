// 은하 지도 — 3D 회전 투영, 경로 계획
import * as THREE from 'three';
import { FACTIONS, SEC_LEVELS } from './data.js';
import { S } from './state.js';
import { findRoute } from './universe.js';
import { systemData } from './world.js';
import { hexA, esc, fmtDist } from './util.js';

const M = { yaw: 0.4, pitch: 0.9, zoom: 13, sel: null, hover: null, cx: 0, cy: 0, drag: false, moved: 0, center: new THREE.Vector3(), tab: 'galaxy' };
let cv, x, game, side;

export function initMap(g) {
  game = g;
  cv = document.getElementById('map-canvas');
  x = cv.getContext('2d');
  side = document.getElementById('map-side');
  let lx = 0, ly = 0;
  cv.style.touchAction = 'none';
  const pts = new Map(); let pinch = 0;
  cv.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); M.moved = 99; } M.drag = true; if (pts.size === 1) M.moved = 0; lx = e.clientX; ly = e.clientY; M.mx = e.clientX; M.my = e.clientY; });
  window.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); M.drag = pts.size > 0; });
  window.addEventListener('pointerup', (e) => {
    pts.delete(e.pointerId);
    if (pts.size) return;
    // 탭 위치에서 가장 가까운 성계 선택
    if (M.moved < 8 && game.mapOpen) M.hover = nearestAt(e.clientX, e.clientY);
    if (!M.drag) return; M.drag = false;
    if (M.moved < 8 && game.mapOpen && M.hover) { M.sel = M.hover; if (M.sel.id !== game.world.sys.id) plot(M.sel.id, true); else renderSide(); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) M.zoom = Math.max(2.5, Math.min(30, M.zoom * d / pinch)); pinch = d; return; }
    if (M.drag) { M.yaw -= (e.clientX - lx) * 0.006; M.pitch = Math.max(0.1, Math.min(1.5, M.pitch + (e.clientY - ly) * 0.005)); M.moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly); lx = e.clientX; ly = e.clientY; }
    M.mx = e.clientX; M.my = e.clientY;
  });
  cv.addEventListener('dblclick', () => { if (M.hover && M.hover.id !== game.world.sys.id) { M.sel = M.hover; plot(M.sel.id); game.tryHyperjump(); } });
  cv.addEventListener('wheel', (e) => { M.zoom = Math.max(2.5, Math.min(30, M.zoom * (1 - Math.sign(e.deltaY) * 0.1))); e.preventDefault(); }, { passive: false });
  document.getElementById('map-zin').onclick = () => { M.zoom = Math.min(30, M.zoom * 1.25); };
  document.getElementById('map-zout').onclick = () => { M.zoom = Math.max(2.5, M.zoom / 1.25); };
  document.querySelectorAll('#map-tabs button').forEach((b) => b.addEventListener('click', () => { M.tab = b.dataset.tab; document.querySelectorAll('#map-tabs button').forEach((o) => o.classList.toggle('active', o === b)); renderSide(); }));
}
export function openMap() {
  const cur = game.galaxy.byId[game.world.sys.id];
  M.center.copy(cur.pos);
  M.sel = M.sel || cur;
  renderSide();
}
function proj(p) {
  const dx = p.x - M.center.x, dy = p.y - M.center.y, dz = p.z - M.center.z;
  const cy = Math.cos(M.yaw), sy = Math.sin(M.yaw);
  const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
  const cp = Math.cos(M.pitch), sp = Math.sin(M.pitch);
  const y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
  const persp = 600 / (600 + z2 * M.zoom * 0.6);
  return { x: M.cx + x1 * M.zoom * persp, y: M.cy - y2 * M.zoom * persp, z: z2, s: persp };
}
export function drawMap(dt) {
  const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  M.cx = (W - 340) / 2; M.cy = H / 2;
  if (!M.drag) M.yaw += dt * 0.02;
  const g = x.createRadialGradient(M.cx, M.cy, 0, M.cx, M.cy, Math.max(W, H) * 0.7);
  g.addColorStop(0, '#0b1020'); g.addColorStop(1, '#020308');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const gal = game.galaxy;
  const curId = game.world.sys.id;
  const range = game.playerShip ? game.playerShip.stats.jump : 9;
  // 은하면 격자
  x.strokeStyle = 'rgba(92,225,255,0.06)'; x.lineWidth = 1;
  for (let r = 10; r <= 70; r += 10) {
    x.beginPath();
    for (let a = 0; a <= 64; a++) { const t = a / 64 * Math.PI * 2; const p = proj({ x: Math.cos(t) * r, y: 0, z: Math.sin(t) * r }); a ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }
    x.stroke();
  }
  const P = new Map(gal.systems.map((s) => [s.id, proj(s.pos)]));
  lastP = P;
  // 항로 (도약 가능 범위)
  for (const s of gal.systems) for (const n of s.links) {
    if (n < s.id) continue;
    const o = gal.byId[n];
    if (s.pos.distanceTo(o.pos) > range) continue;
    const a = P.get(s.id), b = P.get(n);
    x.strokeStyle = 'rgba(120,160,220,0.14)';
    x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
  }
  // 도약 범위 원
  const cp = P.get(curId);
  x.strokeStyle = 'rgba(125,255,154,0.35)'; x.setLineDash([4, 6]);
  x.beginPath(); x.arc(cp.x, cp.y, range * M.zoom * cp.s, 0, 7); x.stroke(); x.setLineDash([]);
  // 경로
  const route = S.save.route || [];
  if (route.length) {
    x.strokeStyle = '#ffd84d'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(cp.x, cp.y);
    for (const id of route) { const p = P.get(id); x.lineTo(p.x, p.y); }
    x.stroke(); x.lineWidth = 1;
  }
  // 성계
  M.hover = null;
  let hd = 14;
  const sorted = gal.systems.slice().sort((a, b) => P.get(b.id).z - P.get(a.id).z);
  for (const s of sorted) {
    const p = P.get(s.id);
    const col = FACTIONS[s.faction].color;
    const r = (s.capital ? 6 : 4) * p.s;
    // 높이 막대
    const base = proj({ x: s.pos.x, y: 0, z: s.pos.z });
    x.strokeStyle = hexA(col, 0.25); x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(base.x, base.y); x.stroke();
    const sg = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
    sg.addColorStop(0, hexA(s.star.color, 0.9)); sg.addColorStop(1, hexA(s.star.color, 0));
    x.fillStyle = sg; x.beginPath(); x.arc(p.x, p.y, r * 4, 0, 7); x.fill();
    x.fillStyle = col; x.beginPath(); x.arc(p.x, p.y, r, 0, 7); x.fill();
    if (s.id === curId) { x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.beginPath(); x.arc(p.x, p.y, r + 6, 0, 7); x.stroke(); x.lineWidth = 1; }
    if (M.sel && M.sel.id === s.id) { x.strokeStyle = '#ffd84d'; x.lineWidth = 2; x.strokeRect(p.x - r - 9, p.y - r - 9, (r + 9) * 2, (r + 9) * 2); x.lineWidth = 1; }
    const known = S.save.visited[s.id];
    x.font = `${s.id === curId ? 700 : 500} ${s.capital ? 13 : 11}px Rajdhani, 'Noto Sans KR', sans-serif`;
    x.fillStyle = known ? '#e6f3ff' : 'rgba(200,215,235,0.55)';
    x.textAlign = 'left';
    x.fillText(s.name + (s.capital ? ' ★' : ''), p.x + r + 6, p.y + 4);
    const d = Math.hypot((M.mx || -99) - p.x, (M.my || -99) - p.y);
    if (d < hd) { hd = d; M.hover = s; }
  }
  // 범례
  x.font = '600 12px Rajdhani, sans-serif'; x.textAlign = 'left';
  let ly = H - 110;
  for (const f of ['union', 'free', 'syndicate', 'pirate', 'indep']) {
    x.fillStyle = FACTIONS[f].color; x.fillRect(20, ly - 9, 10, 10);
    x.fillStyle = '#cfe6f5'; x.fillText(FACTIONS[f].name, 36, ly); ly += 18;
  }
}

function plot(id, quiet) {
  const range = game.playerShip.stats.jump;
  const r = findRoute(game.galaxy, game.world.sys.id, id, range);
  if (!r) { if (!quiet) game.msg(`도약 범위(${range.toFixed(1)} ly)로는 도달할 수 없습니다`, 'warn'); renderSide(); return; }
  S.save.route = r;
  if (!quiet) game.msg(r.length ? `경로 설정: ${r.length}회 도약 — H키로 하이퍼점프` : '현재 성계입니다', 'info');
  renderSide();
}
export function selectedSystem() { return M.sel; }
let lastP = null;
function nearestAt(px, py) {
  if (!lastP) return null;
  let best = null, bd = 30;
  for (const s of game.galaxy.systems) { const p = lastP.get(s.id); if (!p) continue; const d = Math.hypot(px - p.x, py - p.y); if (d < bd) { bd = d; best = s; } }
  return best;
}
export function selectSystem(id) { M.sel = game.galaxy.byId[id]; plot(id, true); }

function renderSide() {
  if (!side) return;
  if (M.tab === 'system') return renderSystem();
  const s = M.sel;
  if (!s) { side.innerHTML = '<div class="dim">성계를 선택하세요</div>'; return; }
  const gal = game.galaxy;
  const cur = gal.byId[game.world.sys.id];
  const dist = s.pos.distanceTo(cur.pos);
  const known = S.save.visited[s.id];
  const sd = systemData(s);
  const sec = SEC_LEVELS[s.sec];
  const route = findRoute(gal, cur.id, s.id, game.playerShip.stats.jump);
  const fac = FACTIONS[s.faction];
  let html = `<div class="ms-name">${esc(s.name)}${s.capital ? ' <span class="cap">수도</span>' : ''}</div>
    <div class="ms-row"><span>세력</span><b style="color:${fac.color}">${fac.name}</b></div>
    <div class="ms-row"><span>보안</span><b style="color:${sec.color}">${sec.name}</b></div>
    <div class="ms-row"><span>항성</span><b>${s.star.cls}형 · ${s.star.name}</b></div>
    <div class="ms-row"><span>거리</span><b>${dist.toFixed(1)} ly</b></div>
    <div class="ms-row"><span>도약</span><b>${route ? route.length + '회' : '도달 불가'}</b></div>
    <div class="ms-row"><span>천체</span><b>행성 ${sd.planets.length} · 소행성대 ${sd.fields.length}</b></div>`;
  html += `<div class="ms-sub">스테이션 ${known ? '' : '<span class="dim">(미방문 — 추정 정보)</span>'}</div>`;
  for (const st of sd.stations) html += `<div class="ms-st"><span style="color:${FACTIONS[st.faction].color}">■</span> ${esc(st.name)} <span class="dim">${st.typeName}</span></div>`;
  const disc = S.save.discovered[s.id];
  if (game.discoveries && game.discoveries[s.id]) html += `<div class="ms-sub">최초 발견자: <b>${esc(game.discoveries[s.id])}</b></div>`;
  else if (disc) html += `<div class="ms-sub">최초 발견자: <b>당신</b></div>`;
  html += `<div class="ms-desc dim">${fac.desc}</div><div class="ms-btns">`;
  const onRoute = (S.save.route || []).length && S.save.route[S.save.route.length - 1] === s.id;
  if (s.id !== cur.id && route) html += onRoute ? `<button class="btn primary" id="ms-jump">▶ 하이퍼점프 (H)</button>` : `<button class="btn primary" id="ms-plot">경로 설정</button>`;
  if ((S.save.route || []).length) html += `<button class="btn" id="ms-clear">경로 해제</button>`;
  html += '</div>';
  side.innerHTML = html;
  const b = document.getElementById('ms-plot'); if (b) b.onclick = () => plot(s.id);
  const j = document.getElementById('ms-jump'); if (j) j.onclick = () => game.tryHyperjump();
  const c = document.getElementById('ms-clear'); if (c) c.onclick = () => { S.save.route = []; renderSide(); };
}

function renderSystem() {
  const w = game.world, P = game.playerShip;
  const items = w.nav.slice().sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
  let html = `<div class="ms-name">${esc(w.sys.name)} 성계</div><div class="dim" style="margin-bottom:8px">클릭하면 항법 목표로 설정됩니다</div>`;
  for (const n of items) {
    const d = n.pos.distanceTo(P.pos);
    const icon = { star: '☀', planet: '●', moon: '◦', station: '■', outpost: '⌂', field: '⁂', anomaly: '◆' }[n.kind] || '·';
    const ex = S.save.explored[n.id] ? ' <span class="good">✓탐사</span>' : '';
    html += `<div class="ms-item" data-id="${n.id}"><span class="ic">${icon}</span><div><b>${esc(n.name)}</b>${ex}<div class="dim">${esc(n.sub || '')}</div></div><span class="d">${fmtDist(d)}</span></div>`;
  }
  side.innerHTML = html;
  side.querySelectorAll('.ms-item').forEach((el) => el.addEventListener('click', () => {
    const n = w.nav.find((o) => o.id === el.dataset.id);
    if (n) { P.target = n; game.msg(`항법 목표: ${n.name}`, 'info'); }
  }));
}
export { renderSide };
