// 은하 지도 — 확대/이동, 목적지 선택, 오토파일럿
import { G, send, serverTime } from './state.js';
import { GALAXY_RADIUS, secColor, secLabel, fmtDist, STATION_TYPES } from '../shared/data.js';
import { bodyPos } from '../shared/physics.js';
import { esc, toast } from './ui.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
let cv, c, W, H, open = false;
const view = { x: 0, y: 0, s: 0.001 };
let sel = null;
let drag = null;
let hover = null;

function known(sysId) { return G.acct?.discovered?.includes(sysId); }

export function isMapOpen() { return open; }
export function openMap() {
  if (!G.world) return;
  open = true;
  $('map').classList.remove('hidden');
  cv = $('map-canvas'); c = cv.getContext('2d');
  fit();
  if (!sel) { view.x = G.self.x; view.y = G.self.y; view.s = G.self && G.me?.sys ? 0.006 : Math.min(W, H) / (GALAXY_RADIUS * 2.3); }
  sfx.click();
  loop();
}
export function closeMap() { open = false; $('map').classList.add('hidden'); }

function fit() { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; c.setTransform(d, 0, 0, d, 0, 0); }
const mx = (x) => (x - view.x) * view.s + W / 2;
const my = (y) => (y - view.y) * view.s + H / 2;
const toWorld = (px, py) => ({ x: (px - W / 2) / view.s + view.x, y: (py - H / 2) / view.s + view.y });

function objectsAt(px, py) {
  const T = serverTime();
  const hits = [];
  const test = (x, y, r, o) => { const d = Math.hypot(mx(x) - px, my(y) - py); if (d < r) hits.push({ d, ...o }); };
  for (const s of G.world.systems) {
    test(s.x, s.y, Math.max(12, s.starR * view.s * 1.5), { kind: 'system', id: s.id });
    if (view.s > 0.002 && known(s.id)) {
      for (const id of s.stations) { const p = bodyPos(G.bodies[id], G.bodies, T); test(p.x, p.y, 12, { kind: 'station', id }); }
      for (const id of s.planets) { const p = bodyPos(G.bodies[id], G.bodies, T); test(p.x, p.y, Math.max(8, G.bodies[id].r * view.s), { kind: 'planet', id }); }
      for (const id of s.belts) { const b = G.beltById[id]; test(b.x, b.y, 12, { kind: 'belt', id }); }
      if (s.beacon) { const b = G.beaconById[s.beacon]; test(b.x, b.y, 12, { kind: 'beacon', id: b.id }); }
    }
  }
  for (const an of G.anomalies.values()) test(an.x, an.y, 10, { kind: 'anomaly', id: an.id });
  hits.sort((a, b) => a.d - b.d);
  // 시스템보다 세부 오브젝트 우선
  const detail = hits.find((h) => h.kind !== 'system' && h.d < 14);
  return detail || hits[0] || null;
}

function loop() {
  if (!open) return;
  draw();
  requestAnimationFrame(loop);
}

function draw() {
  const t = performance.now() / 1000, T = serverTime();
  c.fillStyle = '#030008'; c.fillRect(0, 0, W, H);
  // 은하 원판
  const gx = mx(0), gy = my(0), gr = GALAXY_RADIUS * view.s;
  const g = c.createRadialGradient(gx, gy, 0, gx, gy, gr * 1.1);
  g.addColorStop(0, 'rgba(120,40,200,0.18)'); g.addColorStop(0.5, 'rgba(0,120,200,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(gx, gy, gr * 1.1, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(255,43,214,0.12)'; c.lineWidth = 1;
  for (let r = 100000; r <= GALAXY_RADIUS * 1.15; r += 100000) { c.beginPath(); c.arc(gx, gy, r * view.s, 0, Math.PI * 2); c.stroke(); }
  c.strokeStyle = 'rgba(255,34,85,0.35)'; c.setLineDash([8, 8]);
  c.beginPath(); c.arc(gx, gy, GALAXY_RADIUS * 1.15 * view.s, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);

  // 성계
  for (const s of G.world.systems) {
    const X = mx(s.x), Y = my(s.y);
    if (X < -300 || X > W + 300 || Y < -300 || Y > H + 300) continue;
    const kn = known(s.id);
    const sov = s.beacon && G.info.sov[s.beacon];
    const owner = sov && sov.owner && G.info.clans[sov.owner];
    // 영향권
    c.strokeStyle = hexA(secColor(s.sec), 0.25); c.lineWidth = 1;
    c.beginPath(); c.arc(X, Y, 70000 * view.s, 0, Math.PI * 2); c.stroke();
    if (owner) { c.fillStyle = hexA(owner.color, 0.08); c.fill(); }
    if (view.s > 0.002 && kn) {
      c.strokeStyle = 'rgba(0,240,255,0.1)';
      for (const pid of s.planets) { c.beginPath(); c.arc(X, Y, G.bodies[pid].orbitR * view.s, 0, Math.PI * 2); c.stroke(); }
      for (const pid of s.planets) {
        const p = G.bodies[pid], pos = bodyPos(p, G.bodies, T);
        c.fillStyle = p.c1; c.beginPath(); c.arc(mx(pos.x), my(pos.y), Math.max(3, p.r * view.s), 0, Math.PI * 2); c.fill();
        if (view.s > 0.006) label(p.name, mx(pos.x), my(pos.y) + Math.max(3, p.r * view.s) + 12, 'rgba(200,220,255,.6)', 11);
      }
      for (const sid of s.stations) {
        const st = G.bodies[sid], pos = bodyPos(st, G.bodies, T);
        const x = mx(pos.x), y = my(pos.y);
        c.fillStyle = st.type === 'pirate' ? '#ff2255' : '#ffe600';
        c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillRect(-5, -5, 10, 10); c.restore();
        label(`${STATION_TYPES[st.type].icon} ${st.name}`, x, y - 10, st.type === 'pirate' ? '#ff5577' : '#ffe600', 11);
      }
      for (const bid of s.belts) { const b = G.beltById[bid]; c.strokeStyle = 'rgba(180,180,200,0.5)'; c.setLineDash([2, 3]); c.beginPath(); c.arc(mx(b.x), my(b.y), Math.max(5, b.r * view.s), 0, Math.PI * 2); c.stroke(); c.setLineDash([]); label('⛏ 소행성대', mx(b.x), my(b.y) + Math.max(5, b.r * view.s) + 12, 'rgba(200,200,220,.7)', 10); }
      if (s.beacon) {
        const b = G.beaconById[s.beacon];
        const col = owner ? owner.color : '#fff';
        c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(mx(b.x), my(b.y), 7, 0, Math.PI * 2); c.stroke();
        label(`⚑ ${sov?.owner ? '[' + sov.owner + ']' : '무주지'}${sov?.prog && sov.prog < 100 ? ` ${Math.round(sov.prog)}%` : ''}`, mx(b.x), my(b.y) + 20, col, 11);
      }
    }
    // 항성
    const R = Math.max(5, s.starR * view.s);
    const sg = c.createRadialGradient(X, Y, 0, X, Y, R * 3);
    sg.addColorStop(0, kn ? s.starColor : '#666'); sg.addColorStop(0.3, hexA(kn ? s.starColor : '#666666', 0.4)); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg; c.beginPath(); c.arc(X, Y, R * 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = kn ? '#fff' : '#888'; c.beginPath(); c.arc(X, Y, R * 0.5, 0, Math.PI * 2); c.fill();
    const nm = kn ? s.name : '??? 미탐사 성계';
    label(nm, X, Y - R * 1.5 - 14, kn ? '#fff' : '#889', 14, true);
    label(`${secLabel(s.sec)} ${s.sec.toFixed(1)}${owner ? ` · [${sov.owner}]` : ''}`, X, Y - R * 1.5 + 2, secColor(s.sec), 11);
    if (sel && sel.kind === 'system' && sel.id === s.id) { c.strokeStyle = '#ff2bd6'; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, R * 2 + 8 + Math.sin(t * 4) * 2, 0, Math.PI * 2); c.stroke(); }
  }
  // 이상 신호
  for (const an of G.anomalies.values()) {
    const X = mx(an.x), Y = my(an.y);
    c.fillStyle = '#c070ff'; c.beginPath(); c.moveTo(X, Y - 6); c.lineTo(X + 6, Y); c.lineTo(X, Y + 6); c.lineTo(X - 6, Y); c.fill();
    if (view.s > 0.003) label(an.name, X, Y + 16, '#c070ff', 10);
  }
  // 오토파일럿 경로
  const me = G.me;
  if (me?.ap) {
    let x = me.ap.x, y = me.ap.y;
    if (me.ap.kind === 'station' || me.ap.kind === 'planet') { const p = bodyPos(G.bodies[me.ap.id], G.bodies, T); x = p.x; y = p.y; }
    c.strokeStyle = '#ffe600'; c.lineWidth = 2; c.setLineDash([10, 6]); c.lineDashOffset = -t * 30;
    c.beginPath(); c.moveTo(mx(G.self.x), my(G.self.y)); c.lineTo(mx(x), my(y)); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(mx(x), my(y), 9, 0, Math.PI * 2); c.stroke();
  }
  // 나
  const X = mx(G.self.x), Y = my(G.self.y);
  c.save(); c.translate(X, Y); c.rotate(G.self.a);
  c.fillStyle = '#00f0ff'; c.shadowColor = '#00f0ff'; c.shadowBlur = 12;
  c.beginPath(); c.moveTo(11, 0); c.lineTo(-7, 6); c.lineTo(-4, 0); c.lineTo(-7, -6); c.closePath(); c.fill();
  c.restore();
  c.strokeStyle = `rgba(0,240,255,${0.5 + Math.sin(t * 3) * 0.3})`; c.beginPath(); c.arc(X, Y, 16 + ((t * 20) % 20), 0, Math.PI * 2); c.stroke();
  label('나', X, Y + 26, '#00f0ff', 11, true);
  if (hover) { c.strokeStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(hover.px, hover.py, 16, 0, Math.PI * 2); c.stroke(); }
  if (sel && sel.kind === 'point') { c.strokeStyle = '#ff2bd6'; c.beginPath(); c.moveTo(mx(sel.x) - 8, my(sel.y)); c.lineTo(mx(sel.x) + 8, my(sel.y)); c.moveTo(mx(sel.x), my(sel.y) - 8); c.lineTo(mx(sel.x), my(sel.y) + 8); c.stroke(); }
  // 축척
  const scaleLen = niceScale(120 / view.s);
  c.strokeStyle = '#fff'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(20, H - 30); c.lineTo(20 + scaleLen * view.s, H - 30); c.stroke();
  label(fmtDist(scaleLen), 20 + (scaleLen * view.s) / 2, H - 38, '#fff', 11);
}
function niceScale(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n < 2 ? 1 : n < 5 ? 2 : 5) * p; }
function label(text, x, y, color, size, bold) {
  c.font = `${bold ? 700 : 400} ${size}px 'Noto Sans KR', sans-serif`; c.textAlign = 'center';
  c.fillStyle = 'rgba(0,0,0,.7)'; c.fillText(text, x + 1, y + 1); c.fillStyle = color; c.fillText(text, x, y);
}
function hexA(hex, a) { const n = parseInt(hex.slice(1, 7), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

// ---------- 사이드 패널 ----------
function showSide() {
  const side = $('map-side');
  if (!sel) { side.classList.add('hidden'); return; }
  side.classList.remove('hidden');
  const T = serverTime();
  const dist = (x, y) => fmtDist(Math.hypot(x - G.self.x, y - G.self.y));
  const go = (kind, id, text = '이동') => `<button class="btn small primary" data-map-go="${kind}" data-id="${esc(id)}">${text}</button>`;
  let html = '';
  if (sel.kind === 'system') {
    const s = G.sysById[sel.id];
    const kn = known(s.id);
    const sov = s.beacon && G.info.sov[s.beacon];
    html = `<h3 style="color:${kn ? '#fff' : '#889'}">${kn ? esc(s.name) : '??? 미탐사 성계'}</h3>
      <div style="color:${secColor(s.sec)}">${secLabel(s.sec)} ${s.sec.toFixed(1)}</div>
      <div class="dim" style="margin:4px 0 10px">거리 ${dist(s.x, s.y)}${sov ? ` · 주권: ${sov.owner ? `[${esc(sov.owner)}]` : '무주지'}` : ''}</div>
      ${go('system', s.id, '▶ 성계로 오토파일럿')}`;
    if (kn) {
      html += `<div class="section-title">스테이션</div>${s.stations.map((id) => { const st = G.bodies[id]; const p = bodyPos(st, G.bodies, T); return `<div class="obj"><span>${STATION_TYPES[st.type].icon} ${esc(st.name)}<br><span class="dim" style="font-size:11px">${STATION_TYPES[st.type].name} · ${dist(p.x, p.y)}</span></span>${go('station', id, '도킹')}</div>`; }).join('')}`;
      html += `<div class="section-title">소행성대</div>${s.belts.map((id) => { const b = G.beltById[id]; return `<div class="obj"><span>⛏ ${esc(b.name)}<br><span class="dim" style="font-size:11px">${dist(b.x, b.y)}</span></span>${go('belt', id)}</div>`; }).join('') || '<div class="dim">없음</div>'}`;
      if (s.beacon) { const b = G.beaconById[s.beacon]; html += `<div class="section-title">주권</div><div class="obj"><span>⚑ ${esc(b.name)}</span>${go('beacon', b.id)}</div>`; }
      html += `<div class="section-title">행성</div>${s.planets.map((id) => `<div class="obj"><span>● ${esc(G.bodies[id].name)}</span>${go('planet', id)}</div>`).join('')}`;
    } else html += '<p class="dim" style="font-size:12px;margin-top:10px">직접 방문해서 탐사하면 스테이션과 소행성대 정보가 공개되고 발견 보너스를 받습니다.</p>';
  } else if (sel.kind === 'point') {
    html = `<h3>지정 좌표</h3><div class="dim" style="margin-bottom:10px">거리 ${dist(sel.x, sel.y)}<br>딥 스페이스 — 이상 신호를 찾으려면 도착 후 R로 스캔하세요.</div><button class="btn small primary" data-map-go="point">▶ 이 좌표로 이동</button>`;
  } else {
    const names = { station: () => G.bodies[sel.id].name, planet: () => G.bodies[sel.id].name, belt: () => G.beltById[sel.id].name, beacon: () => G.beaconById[sel.id].name, anomaly: () => G.anomalies.get(sel.id)?.name || '신호' };
    html = `<h3>${esc(names[sel.kind]())}</h3>${go(sel.kind, sel.id, '▶ 오토파일럿')}`;
  }
  side.innerHTML = html;
}

function goTo(kind, id) {
  if (kind === 'point') send({ t: 'ap', kind: 'point', x: sel.x, y: sel.y });
  else send({ t: 'ap', kind, id });
  sfx.click();
  closeMap();
}

// ---------- 입력 ----------
window.addEventListener('DOMContentLoaded', () => {});
{
  const el = () => $('map-canvas');
  const init = () => {
    const canvas = el();
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = toWorld(e.clientX, e.clientY);
      view.s = Math.max(0.00025, Math.min(0.08, view.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      const after = toWorld(e.clientX, e.clientY);
      view.x += before.x - after.x; view.y += before.y - after.y;
    }, { passive: false });
    canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; });
    window.addEventListener('mousemove', (e) => {
      if (!open) return;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        view.x = drag.vx - dx / view.s; view.y = drag.vy - dy / view.s;
      } else {
        const o = objectsAt(e.clientX, e.clientY);
        hover = o && o.d < 20 ? { px: e.clientX, py: e.clientY } : null;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (!open || !drag) return;
      const moved = drag.moved; drag = null;
      if (moved || e.target !== canvas) return;
      const o = objectsAt(e.clientX, e.clientY);
      if (o && o.d < 24) sel = { kind: o.kind, id: o.id };
      else { const w = toWorld(e.clientX, e.clientY); sel = { kind: 'point', x: w.x, y: w.y }; }
      showSide();
    });
    canvas.addEventListener('dblclick', (e) => {
      const o = objectsAt(e.clientX, e.clientY);
      if (o && o.d < 24) goTo(o.kind, o.id);
      else { const w = toWorld(e.clientX, e.clientY); sel = { kind: 'point', x: w.x, y: w.y }; goTo('point'); }
    });
    $('map-side').addEventListener('click', (e) => { const b = e.target.closest('[data-map-go]'); if (b) goTo(b.dataset.mapGo, b.dataset.id); });
    $('btn-map-close').addEventListener('click', closeMap);
    $('btn-map-me').addEventListener('click', () => { view.x = G.self.x; view.y = G.self.y; });
    window.addEventListener('resize', () => { if (open) fit(); });
    // 터치: 핀치 없이 드래그만
    canvas.addEventListener('touchstart', (e) => { const t = e.touches[0]; drag = { x: t.clientX, y: t.clientY, vx: view.x, vy: view.y, moved: false }; }, { passive: true });
    canvas.addEventListener('touchmove', (e) => { if (!drag) return; const t = e.touches[0]; view.x = drag.vx - (t.clientX - drag.x) / view.s; view.y = drag.vy - (t.clientY - drag.y) / view.s; drag.moved = true; }, { passive: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}
void toast;
