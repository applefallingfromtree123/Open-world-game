// 캔버스 렌더러 — 네온 벡터 스타일
import { G, serverTime } from './state.js';
import { SHIPS, NPCS, WEAPONS, ITEMS, DOCK_RANGE } from '../shared/data.js';
import { bodyPos, mulberry32 } from '../shared/physics.js';

let cv, ctx, W = 0, H = 0, DPR = 1;
const astShapes = new Map();

export function initRender(canvas) {
  cv = canvas;
  ctx = cv.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}
export function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, G.settings.quality === 'low' ? 1 : 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
export const screenSize = () => ({ W, H });

// ---------- 좌표 ----------
const sx = (x) => (x - G.cam.x) * G.cam.zoom + W / 2;
const sy = (y) => (y - G.cam.y) * G.cam.zoom + H / 2;
export function screenToWorld(px, py) { return { x: (px - W / 2) / G.cam.zoom + G.cam.x, y: (py - H / 2) / G.cam.zoom + G.cam.y }; }
const onScreen = (x, y, r) => { const X = sx(x), Y = sy(y), R = r * G.cam.zoom; return X + R > -50 && X - R < W + 50 && Y + R > -50 && Y - R < H + 50; };

// ---------- 함선 모양 ----------
function mirror(half) {
  const pts = half.slice();
  for (let i = half.length - 1; i >= 0; i--) if (half[i][1] !== 0) pts.push([half[i][0], -half[i][1]]);
  return pts;
}
const SHAPES = {
  shuttle: mirror([[1.1, 0], [0.2, 0.35], [-0.6, 0.75], [-0.35, 0.2], [-0.5, 0]]),
  interceptor: mirror([[1.35, 0], [0.1, 0.28], [-0.5, 1.0], [-0.7, 0.95], [-0.45, 0.25], [-0.75, 0]]),
  miner: mirror([[1.0, 0.25], [0.55, 0.3], [0.45, 0.85], [-0.8, 0.85], [-1.0, 0.4], [-0.85, 0]]),
  hauler: mirror([[1.0, 0.3], [0.75, 0.6], [-1.0, 0.6], [-1.15, 0.3], [-1.0, 0]]),
  fighter: mirror([[1.35, 0], [0.35, 0.25], [0.05, 1.05], [-0.55, 1.05], [-0.35, 0.3], [-0.8, 0]]),
  runner: mirror([[1.45, 0], [0.2, 0.42], [-0.9, 0.72], [-0.55, 0.15], [-0.7, 0]]),
  frigate: mirror([[1.25, 0], [0.65, 0.35], [0.35, 0.9], [-0.7, 0.9], [-1.0, 0.45], [-0.8, 0]]),
  exhumer: mirror([[1.0, 0.45], [0.5, 0.5], [0.4, 1.0], [-0.6, 1.0], [-0.7, 0.55], [-1.05, 0.5], [-1.05, 0]]),
  destroyer: mirror([[1.5, 0], [0.4, 0.2], [0.0, 0.75], [-0.9, 0.85], [-0.75, 0.25], [-1.1, 0.2], [-1.1, 0]]),
  cruiser: mirror([[1.3, 0], [0.85, 0.3], [0.5, 0.42], [0.3, 0.95], [-0.5, 1.0], [-0.75, 0.55], [-1.15, 0.5], [-1.15, 0]]),
  drone: mirror([[1.0, 0], [0.1, 0.8], [-0.8, 0.45], [-0.6, 0]]),
  raider: mirror([[1.25, 0], [-0.1, 0.95], [-0.45, 0.3], [-1.0, 0.65], [-0.75, 0]]),
  enforcer: mirror([[1.2, 0.2], [0.6, 0.7], [-0.2, 1.0], [-1.0, 0.8], [-0.8, 0.3], [-1.1, 0]]),
  boss: mirror([[1.3, 0], [0.9, 0.25], [1.1, 0.6], [0.4, 0.55], [0.3, 1.1], [-0.4, 0.75], [-0.6, 1.2], [-0.9, 0.5], [-1.2, 0.3], [-0.9, 0]]),
  guardian: mirror([[1.1, 0], [0, 0.7], [-1.1, 0], [-0.9, 0]]),
};
function shipInfo(type) {
  if (type.startsWith('npc:')) { const n = NPCS[type.slice(4)]; return { spec: n, shape: n.shape, color: n.color, npc: true }; }
  const s = SHIPS[type]; return { spec: s, shape: s.shape, color: s.color, npc: false };
}

export function drawShipShape(c, shape, color, r, thrust, t, glow = true) {
  const pts = SHAPES[shape] || SHAPES.shuttle;
  // 엔진 화염
  if (thrust) {
    const fl = r * (0.9 + Math.random() * 0.6) * thrust;
    const g = c.createLinearGradient(-r * 0.6, 0, -r * 0.6 - fl, 0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(-r * 0.55, r * 0.28); c.lineTo(-r * 0.6 - fl, 0); c.lineTo(-r * 0.55, -r * 0.28); c.closePath(); c.fill();
  }
  c.beginPath();
  c.moveTo(pts[0][0] * r, pts[0][1] * r);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] * r, pts[i][1] * r);
  c.closePath();
  c.fillStyle = 'rgba(10,6,30,0.92)';
  c.fill();
  if (glow && G.settings.quality === 'high') { c.shadowColor = color; c.shadowBlur = 12; }
  c.strokeStyle = color; c.lineWidth = Math.max(1.2, r * 0.09);
  c.stroke();
  c.shadowBlur = 0;
  // 조종석/코어
  c.fillStyle = color;
  c.globalAlpha = 0.55 + Math.sin(t * 6) * 0.2;
  c.beginPath(); c.arc(r * 0.25, 0, r * 0.16, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
  // 디테일 라인
  c.strokeStyle = color; c.globalAlpha = 0.4; c.lineWidth = 1;
  c.beginPath(); c.moveTo(r * 0.9, 0); c.lineTo(-r * 0.6, 0); c.stroke();
  c.globalAlpha = 1;
}

function astShape(a) {
  let s = astShapes.get(a[0]);
  if (!s) {
    const rnd = mulberry32(a[5] + 7);
    const n = 8 + Math.floor(rnd() * 5);
    s = [];
    for (let i = 0; i < n; i++) { const g = (i / n) * Math.PI * 2; const rr = 0.72 + rnd() * 0.38; s.push([Math.cos(g) * rr, Math.sin(g) * rr]); }
    astShapes.set(a[0], s);
  }
  return s;
}

// ---------- 배경 ----------
function hash(x, y, l) {
  let h = (x * 374761393 + y * 668265263 + l * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function drawBackground(t) {
  ctx.fillStyle = '#04010c';
  ctx.fillRect(0, 0, W, H);
  // 성운
  if (G.world) {
    for (const s of G.world.systems) {
      const d = Math.hypot(s.x - G.cam.x, s.y - G.cam.y);
      if (d > 160000) continue;
      const R = Math.max(250, 90000 * G.cam.zoom);
      const X = s.x + (G.cam.x - s.x) * 0.0, Y = s.y;
      const px = sx(X), py = sy(Y);
      const g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, hexA(s.nebula, 0.16));
      g.addColorStop(0.4, hexA(s.nebula, 0.05));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - R, py - R, R * 2, R * 2);
    }
  }
  // 별 (시차 레이어)
  const layers = G.settings.quality === 'low' ? [[0.04, 5], [0.12, 3]] : [[0.03, 6], [0.09, 4], [0.22, 3]];
  const z = Math.sqrt(G.cam.zoom);
  layers.forEach(([p, n], li) => {
    const cell = 240;
    const ox = G.cam.x * p * z, oy = G.cam.y * p * z;
    const c0 = Math.floor(ox / cell), c1 = Math.floor((ox + W) / cell);
    const r0 = Math.floor(oy / cell), r1 = Math.floor((oy + H) / cell);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      for (let k = 0; k < n; k++) {
        const h1 = hash(cx, cy, li * 31 + k), h2 = hash(cy, cx, li * 17 + k + 5), h3 = hash(cx + k, cy - k, li);
        const X = cx * cell + h1 * cell - ox, Y = cy * cell + h2 * cell - oy;
        const b = 0.25 + h3 * 0.75;
        const tw = 0.7 + Math.sin(t * (1 + h3 * 3) + h1 * 40) * 0.3;
        ctx.fillStyle = h3 > 0.93 ? `rgba(255,120,240,${b * tw})` : h3 > 0.86 ? `rgba(120,240,255,${b * tw})` : `rgba(220,230,255,${b * tw * 0.8})`;
        const s = (li + 1) * 0.6 + h3;
        ctx.fillRect(X, Y, s, s);
      }
    }
  });
  // 네온 그리드
  if (G.cam.zoom > 0.06) {
    const step = G.cam.zoom > 0.3 ? 1000 : 5000;
    const a = Math.min(0.09, (G.cam.zoom - 0.06) * 0.4);
    ctx.strokeStyle = `rgba(255,43,214,${a})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const tl = screenToWorld(0, 0), br = screenToWorld(W, H);
    for (let x = Math.floor(tl.x / step) * step; x < br.x; x += step) { const X = sx(x); ctx.moveTo(X, 0); ctx.lineTo(X, H); }
    for (let y = Math.floor(tl.y / step) * step; y < br.y; y += step) { const Y = sy(y); ctx.moveTo(0, Y); ctx.lineTo(W, Y); }
    ctx.stroke();
  }
}
export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- 천체 ----------
function drawSystemBodies(t, T) {
  const z = G.cam.zoom;
  for (const s of G.world.systems) {
    if (Math.abs(s.x - G.cam.x) > 90000 + W / z && Math.abs(s.y - G.cam.y) > 90000 + H / z) continue;
    const px = sx(s.x), py = sy(s.y);
    // 궤도선
    if (Math.hypot(s.x - G.cam.x, s.y - G.cam.y) < 80000) {
      ctx.strokeStyle = 'rgba(0,240,255,0.07)'; ctx.lineWidth = 1;
      for (const pid of s.planets) { const p = G.bodies[pid]; ctx.beginPath(); ctx.arc(px, py, p.orbitR * z, 0, Math.PI * 2); ctx.stroke(); }
    }
    // 항성
    if (onScreen(s.x, s.y, s.starR * 5)) {
      const R = s.starR * z;
      const pulse = 1 + Math.sin(t * 0.8) * 0.03;
      const GR = R * 4.5 * pulse;
      const g = ctx.createRadialGradient(px, py, R * 0.5, px, py, GR);
      g.addColorStop(0, hexA(s.starColor, 0.55)); g.addColorStop(0.2, hexA(s.starColor, 0.14)); g.addColorStop(0.55, hexA(s.starColor, 0.03)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, GR, 0, Math.PI * 2); ctx.fill();
      // 코로나 플레어
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(s.starColor, 0.25); ctx.lineWidth = Math.max(1, R * 0.04);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + t * 0.05; const L = R * (1.25 + 0.2 * Math.sin(t * 1.3 + i * 2.1)); ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * R, py + Math.sin(a) * R); ctx.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); ctx.stroke(); }
      ctx.restore();
      const g2 = ctx.createRadialGradient(px, py, 0, px, py, R);
      g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.6, s.starColor); g2.addColorStop(1, hexA(s.starColor, 0.6));
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
    }
    // 행성
    for (const pid of s.planets) {
      const p = G.bodies[pid];
      const pos = bodyPos(p, G.bodies, T);
      if (!onScreen(pos.x, pos.y, p.r * 2.5)) continue;
      const X = sx(pos.x), Y = sy(pos.y), R = Math.max(2, p.r * z);
      const dx = s.x - pos.x, dy = s.y - pos.y, dl = Math.hypot(dx, dy) || 1;
      // 대기 글로우
      const ga = ctx.createRadialGradient(X, Y, R * 0.9, X, Y, R * 1.35);
      ga.addColorStop(0, hexA(p.c1, 0.35)); ga.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ga; ctx.beginPath(); ctx.arc(X, Y, R * 1.35, 0, Math.PI * 2); ctx.fill();
      const lx = X + (dx / dl) * R * 0.45, ly = Y + (dy / dl) * R * 0.45;
      const g = ctx.createRadialGradient(lx, ly, R * 0.05, X, Y, R);
      g.addColorStop(0, p.c1); g.addColorStop(0.55, p.c2); g.addColorStop(1, '#020008');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
      // 표면 띠
      if (R > 30) {
        ctx.save(); ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = hexA(p.c1, 0.12); ctx.lineWidth = R * 0.08;
        for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(X, Y + i * R * 0.28, R * 1.2, R * 0.08, 0.2, 0, Math.PI * 2); ctx.stroke(); }
        if (p.kind === 'city') {
          ctx.fillStyle = 'rgba(255,230,0,0.7)';
          const rnd = mulberry32(p.orbitR | 0);
          for (let i = 0; i < 70; i++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * R; const qx = X + Math.cos(a) * d, qy = Y + Math.sin(a) * d; if (((qx - X) * dx + (qy - Y) * dy) < 0) ctx.fillRect(qx, qy, 2, 2); }
        }
        ctx.restore();
      }
      if (p.ring) {
        ctx.strokeStyle = hexA(p.c1, 0.45); ctx.lineWidth = Math.max(1, R * 0.12);
        ctx.beginPath(); ctx.ellipse(X, Y, R * 1.9, R * 0.45, -0.35, 0, Math.PI * 2); ctx.stroke();
      }
      if (z > 0.02) label(p.name, X, Y + R + 16, 'rgba(200,220,255,0.6)', 12);
    }
    // 스테이션
    for (const stId of s.stations) {
      const st = G.bodies[stId];
      const pos = bodyPos(st, G.bodies, T);
      if (!onScreen(pos.x, pos.y, 800)) continue;
      drawStation(st, sx(pos.x), sy(pos.y), z, t);
    }
    // 비콘
    if (s.beacon) {
      const b = G.beaconById[s.beacon];
      if (onScreen(b.x, b.y, 2000)) drawBeacon(b, t);
    }
  }
}

function drawStation(st, X, Y, z, t) {
  const R = Math.max(6, 230 * z);
  const c = st.color;
  ctx.save(); ctx.translate(X, Y);
  // 도킹 범위
  ctx.strokeStyle = hexA(c, 0.12); ctx.setLineDash([6, 10]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, DOCK_RANGE * z, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  if (G.settings.quality === 'high') { ctx.shadowColor = c; ctx.shadowBlur = 16; }
  ctx.rotate(t * 0.15);
  ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, R * 0.06);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, R * 0.03);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.35); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
  ctx.rotate(-t * 0.35);
  ctx.fillStyle = 'rgba(10,6,30,0.95)';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.lineTo(Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.38); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // 깜빡이는 불빛
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + t * 0.15;
    if (Math.sin(t * 3 + i) > 0.3) { ctx.fillStyle = i % 3 ? c : '#fff'; ctx.fillRect(Math.cos(a) * R * 1.08 - 1.5, Math.sin(a) * R * 1.08 - 1.5, 3, 3); }
  }
  ctx.restore();
  label(`${st.name}`, X, Y + R + 18, c, 13, true);
}

function drawBeacon(b, t) {
  const s = G.info.sov[b.id] || {};
  const owner = s.owner && G.info.clans[s.owner];
  const col = owner ? owner.color : '#ffffff';
  const X = sx(b.x), Y = sy(b.y), z = G.cam.zoom;
  ctx.strokeStyle = hexA(col, 0.35); ctx.lineWidth = 2; ctx.setLineDash([14, 12]);
  ctx.beginPath(); ctx.arc(X, Y, 1800 * z, t * 0.1, t * 0.1 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  if (s.prog > 0) {
    ctx.strokeStyle = s.cap ? (G.info.clans[s.cap]?.color || '#fff') : col; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(X, Y, 1800 * z + 6, -Math.PI / 2, -Math.PI / 2 + (s.prog / 100) * Math.PI * 2); ctx.stroke();
  }
  const R = Math.max(8, 120 * z);
  ctx.fillStyle = hexA(col, 0.25 + Math.sin(t * 4) * 0.1);
  ctx.beginPath(); ctx.moveTo(X, Y - R * 1.6); ctx.lineTo(X + R * 0.6, Y); ctx.lineTo(X, Y + R * 1.6); ctx.lineTo(X - R * 0.6, Y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
  label(`⚑ ${b.name}${s.owner ? ` [${s.owner}]` : ' (무주지)'}`, X, Y + R * 1.6 + 18, col, 13, true);
}

function drawAsteroids(t) {
  const z = G.cam.zoom;
  if (z < 0.03) return;
  const tl = screenToWorld(-200, -200), br = screenToWorld(W + 200, H + 200);
  for (const a of G.asteroids) {
    const [id, x, y, r, ore] = a;
    if (x < tl.x || x > br.x || y < tl.y || y > br.y) continue;
    const dep = G.dep.has(id);
    const shape = astShape(a);
    const X = sx(x), Y = sy(y), R = r * z;
    const col = ITEMS[ore].color;
    ctx.save(); ctx.translate(X, Y); ctx.rotate(t * 0.05 * ((a[5] % 7) - 3) * 0.3 + a[5]);
    ctx.beginPath();
    ctx.moveTo(shape[0][0] * R, shape[0][1] * R);
    for (let i = 1; i < shape.length; i++) ctx.lineTo(shape[i][0] * R, shape[i][1] * R);
    ctx.closePath();
    ctx.fillStyle = dep ? 'rgba(30,30,40,0.5)' : 'rgba(25,22,40,0.95)';
    ctx.fill();
    ctx.strokeStyle = dep ? 'rgba(90,90,110,0.3)' : hexA(col, 0.75);
    ctx.lineWidth = Math.max(1, R * 0.05);
    ctx.stroke();
    if (!dep && R > 8) {
      ctx.fillStyle = hexA(col, 0.5 + Math.sin(t * 2 + id) * 0.2);
      for (let i = 0; i < 3; i++) { const p = shape[(i * 3) % shape.length]; ctx.fillRect(p[0] * R * 0.45 - 2, p[1] * R * 0.45 - 2, 4, 4); }
    }
    ctx.restore();
  }
}

function drawAnomalies(t) {
  const colors = { wreck: '#9affff', cache: '#ff4df0', relic: '#c070ff' };
  const names = { wreck: '난파선', cache: '은닉처', relic: '유적' };
  for (const an of G.anomalies.values()) {
    if (!onScreen(an.x, an.y, 600)) continue;
    const X = sx(an.x), Y = sy(an.y), c = colors[an.type];
    const R = Math.max(10, 60 * G.cam.zoom);
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    const p = (t * 0.6) % 1;
    ctx.globalAlpha = 1 - p; ctx.beginPath(); ctx.arc(X, Y, R + p * R * 3, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(X, Y); ctx.rotate(t);
    ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(R, 0); ctx.lineTo(0, R); ctx.lineTo(-R, 0); ctx.closePath();
    ctx.fillStyle = hexA(c, 0.15); ctx.fill(); ctx.stroke();
    if (an.type === 'wreck') { ctx.strokeStyle = hexA(c, 0.6); ctx.beginPath(); ctx.moveTo(-R * 0.5, -R * 0.2); ctx.lineTo(R * 0.4, R * 0.3); ctx.stroke(); }
    ctx.restore();
    label(`✦ ${an.name} (${names[an.type]})`, X, Y + R + 18, c, 12, true);
  }
}

function drawLoot(t) {
  for (const l of G.loots.values()) {
    if (!onScreen(l.x, l.y, 50)) continue;
    const X = sx(l.x), Y = sy(l.y);
    const c = ITEMS[l.item]?.color || '#fff';
    const R = Math.max(4, 14 * G.cam.zoom);
    ctx.save(); ctx.translate(X, Y); ctx.rotate(t * 1.5);
    ctx.shadowColor = c; ctx.shadowBlur = G.settings.quality === 'high' ? 10 : 0;
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.fillStyle = hexA(c, 0.3);
    ctx.fillRect(-R, -R, R * 2, R * 2); ctx.strokeRect(-R, -R, R * 2, R * 2);
    ctx.restore();
    if (G.cam.zoom > 0.25) label(ITEMS[l.item]?.name || '', X, Y + R + 12, c, 10);
  }
}

function label(text, x, y, color, size = 12, bold = false) {
  ctx.font = `${bold ? 700 : 500} ${size}px 'Noto Sans KR', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// ---------- 함선 ----------
function drawShips(t) {
  const myClan = G.acct?.clan;
  for (const e of G.ships.values()) {
    const info = shipInfo(e.type);
    const r = info.spec.radius;
    if (!onScreen(e.dx, e.dy, r * 4 + 100)) continue;
    const X = sx(e.dx), Y = sy(e.dy), R = Math.max(5, r * G.cam.zoom);
    // 채굴 빔
    if (e.mine >= 0 && G.asteroids[e.mine]) drawBeam(e.dx, e.dy, e.da, G.asteroids[e.mine], t, info.color);
    let color = info.color;
    if (!info.npc) {
      if (e.flags & 16) color = '#ff2255';
      else if (myClan && e.tag === myClan) color = '#2cff9a';
    }
    ctx.save(); ctx.translate(X, Y); ctx.rotate(e.da);
    const thrust = (e.flags & 8) ? 1 : (e.flags & 1) ? 2.5 : 0;
    drawShipShape(ctx, info.shape, color, R, thrust + ((e.flags & 4) ? 0.8 : 0), t);
    ctx.restore();
    // 실드 피격
    if (e.hitT && t - e.hitT < 0.25 && e.sh > 0) {
      ctx.strokeStyle = `rgba(0,240,255,${1 - (t - e.hitT) * 4})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X, Y, R * 1.5, 0, Math.PI * 2); ctx.stroke();
    }
    // 워프 충전
    if (e.flags & 2) {
      ctx.strokeStyle = 'rgba(255,230,0,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X, Y, R * (1.6 + Math.sin(t * 20) * 0.2), 0, Math.PI * 2); ctx.stroke();
    }
    // 이름표 + 체력
    if (G.settings.names && G.cam.zoom > 0.08) {
      const nm = info.npc ? info.spec.name : `${e.tag ? `[${e.tag}] ` : ''}${e.name}`;
      label(nm + ((e.flags & 16) ? ' ☠' : ''), X, Y - R - 16, info.npc ? '#ff5577' : color, 12, !info.npc);
      const bw = 44;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(X - bw / 2, Y - R - 11, bw, 5);
      if (info.spec.shield) { ctx.fillStyle = '#00f0ff'; ctx.fillRect(X - bw / 2, Y - R - 11, bw * e.sh / 100, 2); }
      ctx.fillStyle = e.hp > 35 ? '#ffb000' : '#ff2255'; ctx.fillRect(X - bw / 2, Y - R - 8, bw * e.hp / 100, 2);
      if (e.flags & 32) label('⚠ 조준됨', X, Y + R + 16, '#ff2255', 10, true);
    }
  }
}

function drawSelf(t) {
  const me = G.me;
  if (!me || me.dock || me.dead) return;
  const spec = SHIPS[me.type];
  const s = G.self;
  const X = sx(s.x), Y = sy(s.y), R = Math.max(6, spec.radius * G.cam.zoom);
  if (me.mine >= 0 && G.asteroids[me.mine]) drawBeam(s.x, s.y, s.a, G.asteroids[me.mine], t, spec.color);
  const k = G.input.keys | (me.ap ? me.ak : 0);
  const thrust = (s.warp === 2) ? 2.8 : (k & 1) ? 1 : (k & 12) ? 0.4 : 0;
  ctx.save(); ctx.translate(X, Y); ctx.rotate(s.a);
  drawShipShape(ctx, spec.shape, spec.color, R, thrust + (me.boost ? 0.9 : 0), t);
  ctx.restore();
  if (G.selfHitT && t - G.selfHitT < 0.3 && me.s > 0) {
    ctx.strokeStyle = `rgba(0,240,255,${1 - (t - G.selfHitT) * 3.3})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(X, Y, R * 1.6, 0, Math.PI * 2); ctx.stroke();
  }
  if (me.w === 1) {
    const p = 1 - me.wt / spec.warpCharge;
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(X, Y, R * 2.2, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
  }
  // 조준선
  if (!me.ap && s.warp === 0) {
    ctx.strokeStyle = 'rgba(0,240,255,0.18)'; ctx.setLineDash([4, 8]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X + Math.cos(s.a) * R * 1.5, Y + Math.sin(s.a) * R * 1.5); ctx.lineTo(X + Math.cos(s.a) * 600 * G.cam.zoom + Math.cos(s.a) * 60, Y + Math.sin(s.a) * 600 * G.cam.zoom + Math.sin(s.a) * 60); ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawBeam(x, y, a, ast, t, color) {
  const [, ax, ay, ar, ore] = ast;
  const c = ITEMS[ore].color;
  const X = sx(x + Math.cos(a) * 10), Y = sy(y + Math.sin(a) * 10);
  const g = Math.atan2(y - ay, x - ax);
  const tx = sx(ax + Math.cos(g) * ar * 0.7 + Math.sin(t * 13) * ar * 0.15), ty = sy(ay + Math.sin(g) * ar * 0.7 + Math.cos(t * 11) * ar * 0.15);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(c, 0.35); ctx.lineWidth = 7 + Math.sin(t * 30) * 2;
  ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.restore();
  if (Math.random() < 0.5) spawnParticle(ax + Math.cos(g) * ar * 0.7, ay + Math.sin(g) * ar * 0.7, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, 0.5, c, 2);
  void color;
}

function drawShots(dt) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const z = G.cam.zoom;
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.life -= dt;
    if (s.life <= 0) { G.shots.splice(i, 1); continue; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (!onScreen(s.x, s.y, 200)) continue;
    const w = WEAPONS[s.w];
    const len = 0.025;
    const X = sx(s.x), Y = sy(s.y);
    const tx = X - s.vx * len * z * (s.w.includes('rail') ? 2.5 : 1), ty = Y - s.vy * len * z * (s.w.includes('rail') ? 2.5 : 1);
    ctx.strokeStyle = w.color; ctx.lineWidth = Math.max(1.5, w.size * z * 1.2 + 1);
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo((X + tx) / 2, (Y + ty) / 2); ctx.stroke();
  }
  // 미사일
  for (const m of G.missiles.values()) {
    m.dx += (m.x - m.dx) * 0.3 + m.vx * dt; m.dy += (m.y - m.dy) * 0.3 + m.vy * dt;
    if (!onScreen(m.dx, m.dy, 100)) continue;
    const X = sx(m.dx), Y = sy(m.dy), a = Math.atan2(m.vy, m.vx);
    ctx.fillStyle = WEAPONS[m.w].color;
    ctx.save(); ctx.translate(X, Y); ctx.rotate(a);
    ctx.fillRect(-6, -2, 12, 4);
    ctx.restore();
    spawnParticle(m.dx - Math.cos(a) * 8, m.dy - Math.sin(a) * 8, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.5, '#ff8a00', 3);
  }
  ctx.restore();
}

// ---------- 파티클 ----------
export function spawnParticle(x, y, vx, vy, life, color, size) {
  if (G.particles.length > (G.settings.quality === 'low' ? 400 : 1600)) return;
  G.particles.push({ x, y, vx, vy, life, max: life, color, size });
}
export function explosion(x, y, r) {
  const n = Math.min(90, 20 + r * 1.5);
  const cols = ['#ffffff', '#ffe600', '#ff8a00', '#ff2bd6', '#00f0ff'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * (150 + r * 12);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + Math.random() * 1.2, cols[i % cols.length], 2 + Math.random() * 3);
  }
  G.rings.push({ x, y, r: r * 0.5, max: r * 6 + 120, life: 0.7, t: 0, color: '#ff8a00' });
}
export function sparks(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 260;
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.3, color, 2);
  }
}
function drawParticles(dt) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const z = G.cam.zoom;
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    if (p.life <= 0) { G.particles[i] = G.particles[G.particles.length - 1]; G.particles.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.98; p.vy *= 0.98;
    const X = sx(p.x), Y = sy(p.y);
    if (X < -10 || X > W + 10 || Y < -10 || Y > H + 10) continue;
    ctx.globalAlpha = p.life / p.max;
    ctx.fillStyle = p.color;
    const s = Math.max(1, p.size * Math.min(1.5, z * 1.6));
    ctx.fillRect(X - s / 2, Y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  for (let i = G.rings.length - 1; i >= 0; i--) {
    const r = G.rings[i];
    r.t += dt;
    if (r.t >= r.life) { G.rings.splice(i, 1); continue; }
    const k = r.t / r.life;
    ctx.strokeStyle = hexA(r.color, 1 - k); ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), (r.r + (r.max - r.r) * k) * z, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// 엔진 궤적
function trails() {
  if (G.settings.quality === 'low') return;
  const add = (x, y, a, color, r, k) => {
    if (!k) return;
    const bx = x - Math.cos(a) * r * 0.8, by = y - Math.sin(a) * r * 0.8;
    spawnParticle(bx, by, -Math.cos(a) * 60 + (Math.random() - 0.5) * 30, -Math.sin(a) * 60 + (Math.random() - 0.5) * 30, 0.4 + k * 0.2, color, 2 + k);
  };
  for (const e of G.ships.values()) {
    const info = shipInfo(e.type);
    if (!onScreen(e.dx, e.dy, 300)) continue;
    add(e.dx, e.dy, e.da, info.color, info.spec.radius, (e.flags & 8) ? 1 : (e.flags & 1) ? 2 : 0);
  }
  const me = G.me;
  if (me && !me.dock && !me.dead) {
    const spec = SHIPS[me.type];
    const k = G.input.keys | (me.ap ? me.ak : 0);
    add(G.self.x, G.self.y, G.self.a, spec.color, spec.radius, G.self.warp === 2 ? 2 : (k & 1) ? (me.boost ? 1.8 : 1) : 0);
  }
}

// 워프 속도선
function warpLines(t) {
  const me = G.me;
  if (!me || G.self.warp !== 2) return;
  const a = Math.atan2(G.self.vy, G.self.vx);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rnd = mulberry32(Math.floor(t * 30));
  for (let i = 0; i < 70; i++) {
    const X = rnd() * W, Y = rnd() * H;
    const L = 80 + rnd() * 260;
    ctx.strokeStyle = rnd() < 0.3 ? 'rgba(255,43,214,0.35)' : 'rgba(0,240,255,0.35)';
    ctx.lineWidth = 1 + rnd() * 1.5;
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - Math.cos(a) * L, Y - Math.sin(a) * L); ctx.stroke();
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,120,255,0.18)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// 화면 밖 표시기
function edgeMarkers(T, t) {
  const me = G.me;
  if (!me || me.dock) return;
  const marks = [];
  if (me.ap) {
    let x = me.ap.x, y = me.ap.y;
    if (me.ap.kind === 'station' || me.ap.kind === 'planet') { const p = bodyPos(G.bodies[me.ap.id], G.bodies, T); x = p.x; y = p.y; }
    marks.push({ x, y, color: '#ffe600', text: me.ap.name });
  }
  for (const e of G.ships.values()) if (e.flags & 32) marks.push({ x: e.dx, y: e.dy, color: '#ff2255', text: '' });
  for (const an of G.anomalies.values()) marks.push({ x: an.x, y: an.y, color: '#c070ff', text: '' });
  const m = 34;
  for (const k of marks) {
    const X = sx(k.x), Y = sy(k.y);
    if (X > m && X < W - m && Y > m && Y < H - m) continue;
    const a = Math.atan2(Y - H / 2, X - W / 2);
    const ex = Math.cos(a), ey = Math.sin(a);
    const s = Math.min((W / 2 - m) / Math.abs(ex || 1e-6), (H / 2 - m) / Math.abs(ey || 1e-6));
    const px = W / 2 + ex * s, py = H / 2 + ey * s;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.fillStyle = k.color; ctx.globalAlpha = 0.75 + Math.sin(t * 5) * 0.25;
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, 8); ctx.lineTo(-6, -8); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (k.text) {
      const d = Math.hypot(k.x - G.self.x, k.y - G.self.y);
      label(`${k.text} ${fmt(d)}`, px - ex * 40, py - ey * 26, k.color, 11, true);
    }
  }
}
const fmt = (d) => d >= 1000 ? (d / 1000).toFixed(d > 100000 ? 0 : 1) + 'km' : Math.round(d) + 'm';

// ---------- 메인 ----------
export function render(dt, t) {
  if (!ctx) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // 화면 흔들림
  let shx = 0, shy = 0;
  if (G.cam.shake > 0) { shx = (Math.random() - 0.5) * G.cam.shake; shy = (Math.random() - 0.5) * G.cam.shake; G.cam.shake = Math.max(0, G.cam.shake - dt * 40); }
  ctx.translate(shx, shy);
  drawBackground(t);
  if (!G.world) return;
  const T = serverTime();
  drawSystemBodies(t, T);
  drawAsteroids(t);
  drawAnomalies(t);
  drawLoot(t);
  trails();
  drawParticles(dt);
  drawShips(t);
  drawSelf(t);
  drawShots(dt);
  warpLines(t);
  edgeMarkers(T, t);
}

// ---------- 타이틀 배경 ----------
export function titleBackground(canvas) {
  const c = canvas.getContext('2d');
  let w, h;
  const fit = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
  fit(); window.addEventListener('resize', fit);
  const stars = Array.from({ length: 260 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
  let running = true;
  const ships = Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * 1600, y: 100 + Math.random() * 600, s: 60 + Math.random() * 120, shape: ['fighter', 'interceptor', 'hauler', 'frigate', 'runner'][i], color: ['#ff2bd6', '#00f0ff', '#8affc1', '#ff8a00', '#b18cff'][i], r: 10 + Math.random() * 14 }));
  function frame(ts) {
    if (!running) return;
    const t = ts / 1000;
    c.fillStyle = 'rgba(4,1,12,0.35)'; c.fillRect(0, 0, w, h);
    // 원근 그리드 (신스웨이브)
    const hy = h * 0.62;
    const g = c.createLinearGradient(0, hy - 200, 0, hy);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,43,214,0.15)');
    c.fillStyle = g; c.fillRect(0, hy - 200, w, 200);
    // 태양
    const sunR = Math.min(w, h) * 0.18;
    const sg = c.createLinearGradient(0, hy - sunR * 2, 0, hy);
    sg.addColorStop(0, '#ffe600'); sg.addColorStop(1, '#ff2bd6');
    c.save(); c.beginPath(); c.arc(w / 2, hy - sunR * 0.3, sunR, Math.PI, 0); c.clip();
    c.fillStyle = sg; c.fillRect(w / 2 - sunR, hy - sunR * 1.4, sunR * 2, sunR * 1.2);
    c.fillStyle = 'rgba(4,1,12,1)';
    for (let i = 0; i < 7; i++) { const yy = hy - sunR * 0.3 - i * sunR * 0.13; c.fillRect(w / 2 - sunR, yy - 1, sunR * 2, 2 + i * 0.6); }
    c.restore();
    c.fillStyle = '#04010c'; c.fillRect(0, hy, w, h - hy);
    c.strokeStyle = 'rgba(255,43,214,0.55)'; c.lineWidth = 1;
    for (let i = -20; i <= 20; i++) { c.beginPath(); c.moveTo(w / 2 + i * 30, hy); c.lineTo(w / 2 + i * w * 0.12, h); c.stroke(); }
    const off = (t * 40) % 40;
    for (let i = 0; i < 20; i++) { const yy = hy + Math.pow((i * 40 + off) / 800, 2) * (h - hy) * 1.2; if (yy > h) break; c.globalAlpha = Math.min(1, (yy - hy) / 60); c.beginPath(); c.moveTo(0, yy); c.lineTo(w, yy); c.stroke(); }
    c.globalAlpha = 1;
    // 별
    for (const s of stars) {
      s.z -= 0.0015; if (s.z <= 0.02) { s.z = 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; }
      const X = w / 2 + (s.x / s.z) * w * 0.3, Y = hy * 0.5 + (s.y / s.z) * hy * 0.5;
      if (Y > hy) continue;
      c.fillStyle = `rgba(200,230,255,${1 - s.z})`; c.fillRect(X, Y, 2 - s.z, 2 - s.z);
    }
    for (const sh of ships) {
      sh.x += sh.s / 60; if (sh.x > w + 100) { sh.x = -100; sh.y = 60 + Math.random() * (hy - 120); }
      c.save(); c.translate(sh.x, sh.y); drawShipShape(c, sh.shape, sh.color, sh.r, 1, t, false); c.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return () => { running = false; };
}
