// ============================================================
//  HUD — 조준선 · 비행경로 · 표적 브래킷 · 리드 · 항법 마커 · 3D 레이더 · 계기
// ============================================================
import * as THREE from 'three';
import { E } from './engine.js';
import { IN } from './input.js';
import { fmtDist, fmtSpeed, hexA, leadPoint, clamp } from './util.js';
import { FACTIONS } from './data.js';

let cv, x, W, H, dpr;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _iq = new THREE.Quaternion();
export const COL = { hud: '#5ce1ff', hostile: '#ff4d5e', police: '#5b8cff', wing: '#5dff9d', neutral: '#e6ecf5', wanted: '#ffb347', remote: '#d08bff', nav: '#9fd8ff', mission: '#ffd84d' };
export const HUD = { radarRange: 6000, scan: 0, msg: null, center: [] };

export function initHud(canvas) { cv = canvas; x = cv.getContext('2d'); }

function project(p, out) {
  out.set(p.x - E.origin.x, p.y - E.origin.y, p.z - E.origin.z);
  const behind = out.clone().applyMatrix4(E.camera.matrixWorldInverse).z > 0;
  out.project(E.camera);
  return { x: (out.x * 0.5 + 0.5) * W, y: (-out.y * 0.5 + 0.5) * H, behind, on: !behind && Math.abs(out.x) < 1 && Math.abs(out.y) < 1 };
}

function bracket(cx, cy, r, color, lw = 1.5) {
  const k = Math.max(5, r * 0.35);
  x.strokeStyle = color; x.lineWidth = lw;
  x.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    x.moveTo(cx + sx * r, cy + sy * (r - k)); x.lineTo(cx + sx * r, cy + sy * r); x.lineTo(cx + sx * (r - k), cy + sy * r);
  }
  x.stroke();
}
function diamond(cx, cy, r, color, fill) {
  x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath();
  if (fill) { x.fillStyle = color; x.fill(); } else { x.strokeStyle = color; x.lineWidth = 1.4; x.stroke(); }
}
function text(t, px, py, color, size = 12, align = 'left', font = 'Rajdhani') {
  x.font = `600 ${size}px ${font}, 'Noto Sans KR', sans-serif`;
  x.textAlign = align; x.fillStyle = color;
  x.fillText(t, px, py);
}
function edgeArrow(sp, color, label) {
  // 화면 가장자리 화살표
  let dx = sp.x - W / 2, dy = sp.y - H / 2;
  if (sp.behind) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; }
  const a = Math.atan2(dy, dx);
  const m = 60;
  const rx = W / 2 - m, ry = H / 2 - m;
  const t = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
  const px = W / 2 + Math.cos(a) * t, py = H / 2 + Math.sin(a) * t;
  x.save(); x.translate(px, py); x.rotate(a);
  x.fillStyle = color; x.beginPath(); x.moveTo(14, 0); x.lineTo(-6, -9); x.lineTo(-2, 0); x.lineTo(-6, 9); x.closePath(); x.fill();
  x.restore();
  if (label) text(label, px - Math.cos(a) * 26, py - Math.sin(a) * 26 + 4, color, 11, 'center');
}

export function drawHud(g) {
  dpr = E.dpr; W = E.W; H = E.H;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);
  const P = g.playerShip, w = g.world;
  if (!P || g.docked || g.hyper || g.mapOpen) return;
  const C = g.save.settings.hudColor || COL.hud;
  x.lineCap = 'round';

  // ----- 항법 마커 -----
  const navs = [];
  for (const n of w.nav) {
    if (n.kind === 'field' && n.pos.distanceTo(P.pos) < n.radius) continue;
    navs.push(n);
  }
  for (const n of navs) {
    const tgt = P.target === n;
    const sp = project(n.pos, _v);
    const d = n.pos.distanceTo(P.pos) - (n.kind === 'planet' || n.kind === 'moon' || n.kind === 'star' ? n.radius : 0);
    const col = n.type === 'mission' ? COL.mission : n.kind === 'anomaly' ? '#ffb347' : n.kind === 'station' ? (n.data.faction === 'pirate' ? COL.hostile : COL.nav) : n.kind === 'outpost' ? COL.wing : 'rgba(180,200,220,0.75)';
    if (!sp.on) { if (tgt) edgeArrow(sp, C, fmtDist(d)); continue; }
    if (d < 1500 && n.kind !== 'anomaly') continue;
    const r = tgt ? 9 : 5;
    if (n.kind === 'station' || n.kind === 'outpost') { x.strokeStyle = col; x.lineWidth = 1.4; x.strokeRect(sp.x - r, sp.y - r, r * 2, r * 2); }
    else if (n.kind === 'anomaly') diamond(sp.x, sp.y, r + 1, col, false);
    else { x.strokeStyle = col; x.lineWidth = 1.2; x.beginPath(); x.arc(sp.x, sp.y, r, 0, 7); x.stroke(); }
    if (tgt || d < 60000 || n.kind === 'station' || n.type === 'mission') {
      text(n.name, sp.x + r + 5, sp.y - 2, tgt ? C : col, tgt ? 13 : 11);
      text(fmtDist(d), sp.x + r + 5, sp.y + 11, hexA('#c8d8e8', 0.7), 10);
    }
    if (tgt) bracket(sp.x, sp.y, 16, C, 2);
  }
  // 화물 컨테이너
  for (const c of w.cans) {
    const d = c.pos.distanceTo(P.pos);
    if (d > 3000) continue;
    const sp = project(c.pos, _v);
    if (!sp.on) continue;
    diamond(sp.x, sp.y, 4, '#ffb347', P.target === c);
    if (d < 800 || P.target === c) text(c.name, sp.x + 8, sp.y + 4, '#ffcf8a', 10);
    if (P.target === c) bracket(sp.x, sp.y, 12, C, 2);
  }

  // ----- 함선 -----
  for (const s of w.ships) {
    if (s.isPlayer || s.dead) continue;
    const d = s.pos.distanceTo(P.pos);
    const tgt = P.target === s;
    if (d > 12000 && !tgt) continue;
    const st = w.stance(s);
    const col = COL[st] || COL.neutral;
    const sp = project(s.pos, _v);
    if (!sp.on) { if (tgt) edgeArrow(sp, col, fmtDist(d)); continue; }
    // 화면상 크기
    const pr = s.radius / Math.max(1, d) * (H / 2) / Math.tan(E.camera.fov * Math.PI / 360);
    const r = clamp(pr * 1.3, 7, 120);
    if (tgt) {
      bracket(sp.x, sp.y, r + 6, col, 2.2);
      text(s.name, sp.x, sp.y - r - 22, col, 13, 'center');
      text(`${s.spec.name} · ${fmtDist(d)}`, sp.x, sp.y - r - 10, hexA(col, 0.8), 11, 'center');
      // 실드/선체 바
      const bw = Math.max(50, r * 2 + 12), by = sp.y + r + 12;
      x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(sp.x - bw / 2, by, bw, 8);
      x.fillStyle = '#4fc8ff'; x.fillRect(sp.x - bw / 2, by, bw * (s.shield / s.stats.shield), 3);
      x.fillStyle = '#ff9a4d'; x.fillRect(sp.x - bw / 2, by + 5, bw * (s.hull / s.stats.hull), 3);
    } else if (d < 6000) {
      x.globalAlpha = clamp(1.4 - d / 6000, 0.35, 1);
      bracket(sp.x, sp.y, r, col, 1.2);
      if (d < 2500) text(s.name, sp.x, sp.y - r - 5, hexA(col, 0.85), 10, 'center');
      x.globalAlpha = 1;
    } else { x.fillStyle = col; x.fillRect(sp.x - 1.5, sp.y - 1.5, 3, 3); }
  }

  // ----- 리드 지점 -----
  const T = P.target;
  if (T && T.isShip && !T.dead) {
    const pw = P.primaryWeapon();
    if (pw && pw.w.speed) {
      const lp = leadPoint(P.pos, P.vel, T.pos, T.vel, pw.w.speed, _w);
      const sp = project(lp, _v);
      const d = T.pos.distanceTo(P.pos);
      if (sp.on && d < pw.w.range * 1.4) {
        const inRange = d < pw.w.range;
        x.strokeStyle = inRange ? '#ffffff' : hexA('#ffffff', 0.4); x.lineWidth = 1.6;
        x.beginPath(); x.arc(sp.x, sp.y, 7, 0, 7); x.stroke();
        x.beginPath(); x.moveTo(sp.x - 11, sp.y); x.lineTo(sp.x - 4, sp.y); x.moveTo(sp.x + 4, sp.y); x.lineTo(sp.x + 11, sp.y); x.stroke();
        const ts = project(T.pos, _w);
        if (ts.on) { x.setLineDash([3, 4]); x.strokeStyle = hexA('#ffffff', 0.35); x.beginPath(); x.moveTo(ts.x, ts.y); x.lineTo(sp.x, sp.y); x.stroke(); x.setLineDash([]); }
      }
    }
  }

  // ----- 조준선 (함선 정면) -----
  const aim = project(_w.copy(P.pos).addScaledVector(P.forward, 1500), _v);
  const ax = aim.x, ay = aim.y;
  x.strokeStyle = C; x.lineWidth = 1.6;
  x.beginPath();
  x.arc(ax, ay, 14, -Math.PI * 0.35, Math.PI * 0.35); x.stroke();
  x.beginPath(); x.arc(ax, ay, 14, Math.PI * 0.65, Math.PI * 1.35); x.stroke();
  x.beginPath(); x.moveTo(ax - 26, ay); x.lineTo(ax - 18, ay); x.moveTo(ax + 18, ay); x.lineTo(ax + 26, ay); x.moveTo(ax, ay + 18); x.lineTo(ax, ay + 24); x.stroke();
  x.fillStyle = C; x.fillRect(ax - 1, ay - 1, 2, 2);
  // 비행경로 표시
  if (P.speed > 8) {
    const fp = project(_w.copy(P.pos).addScaledVector(_v.copy(P.vel).normalize(), 1500), _v);
    if (fp.on) {
      x.strokeStyle = hexA(C, 0.8); x.lineWidth = 1.4;
      x.beginPath(); x.arc(fp.x, fp.y, 6, 0, 7); x.moveTo(fp.x - 12, fp.y); x.lineTo(fp.x - 6, fp.y); x.moveTo(fp.x + 6, fp.y); x.lineTo(fp.x + 12, fp.y); x.moveTo(fp.x, fp.y - 6); x.lineTo(fp.x, fp.y - 11); x.stroke();
    }
  }
  // 가상 조이스틱 커서
  if (!g.autopilot && !IN.freelook) {
    const r = Math.min(W, H) * 0.32;
    const cx = W / 2 + IN.vx * r, cy = H / 2 + IN.vy * r;
    x.strokeStyle = hexA(C, 0.25); x.lineWidth = 1;
    x.beginPath(); x.arc(W / 2, H / 2, r * 0.06, 0, 7); x.stroke();
    if (Math.hypot(IN.vx, IN.vy) > 0.06) { x.beginPath(); x.moveTo(W / 2, H / 2); x.lineTo(cx, cy); x.stroke(); }
    x.strokeStyle = hexA(C, 0.9); x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(cx - 6, cy); x.lineTo(cx + 6, cy); x.moveTo(cx, cy - 6); x.lineTo(cx, cy + 6); x.stroke();
  }

  drawRadar(g, C);
  drawGauges(g, C);
  drawCenter(g, C);
}

function drawRadar(g, C) {
  const P = g.playerShip, w = g.world;
  const mob = document.body.classList.contains('mobile');
  const cx = W / 2, rw = mob ? Math.min(85, W * 0.11) : Math.min(150, W * 0.12), rh = rw * 0.45, cy = H - (mob ? rh + 18 : 92);
  const R = HUD.radarRange;
  x.save();
  const grd = x.createRadialGradient(cx, cy, 0, cx, cy, rw);
  grd.addColorStop(0, hexA(C, 0.12)); grd.addColorStop(1, hexA(C, 0.02));
  x.fillStyle = grd;
  x.beginPath(); x.ellipse(cx, cy, rw, rh, 0, 0, 7); x.fill();
  x.strokeStyle = hexA(C, 0.5); x.lineWidth = 1.2; x.stroke();
  x.strokeStyle = hexA(C, 0.2);
  for (const k of [0.33, 0.66]) { x.beginPath(); x.ellipse(cx, cy, rw * k, rh * k, 0, 0, 7); x.stroke(); }
  x.beginPath(); x.moveTo(cx - rw, cy); x.lineTo(cx + rw, cy); x.moveTo(cx, cy - rh); x.lineTo(cx, cy + rh); x.stroke();
  // 시야각
  x.strokeStyle = hexA(C, 0.3);
  x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx - rw * 0.55, cy - rh); x.moveTo(cx, cy); x.lineTo(cx + rw * 0.55, cy - rh); x.stroke();
  _iq.copy(P.quat).invert();
  const blip = (pos, col, size, filled = true, sq = true) => {
    _v.copy(pos).sub(P.pos).applyQuaternion(_iq);
    const lx = -_v.x / R, lz = _v.z / R, ly = _v.y / R;
    const d = Math.hypot(lx, lz);
    let bx = lx, bz = lz;
    if (d > 1) { bx /= d; bz /= d; }
    const ex = cx + bx * rw, ey = cy - bz * rh;
    const sy = ey - clamp(ly, -1.2, 1.2) * rh * 1.1;
    x.strokeStyle = hexA(col, 0.6); x.lineWidth = 1;
    x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex, sy); x.stroke();
    x.fillStyle = col; x.strokeStyle = col;
    if (sq) { if (filled && ly >= 0) x.fillRect(ex - size / 2, sy - size / 2, size, size); else { x.lineWidth = 1.3; x.strokeRect(ex - size / 2, sy - size / 2, size, size); } }
    else { x.beginPath(); x.moveTo(ex, sy - size); x.lineTo(ex + size, sy + size * 0.7); x.lineTo(ex - size, sy + size * 0.7); x.closePath(); if (ly >= 0) x.fill(); else x.stroke(); }
    return [ex, sy];
  };
  for (const s of w.ships) {
    if (s.isPlayer || s.dead) continue;
    if (s.pos.distanceTo(P.pos) > R * 1.5) continue;
    const col = COL[w.stance(s)];
    const [ex, sy] = blip(s.pos, col, s.spec.mass >= 2.5 ? 6 : 4.5, true, s.spec.mass < 2.5);
    if (P.target === s) { x.strokeStyle = '#fff'; x.lineWidth = 1; x.strokeRect(ex - 5, sy - 5, 10, 10); }
  }
  for (const c of w.cans) if (c.pos.distanceTo(P.pos) < R * 1.2) blip(c.pos, '#ffb347', 3);
  for (const s of w.stations) if (s.pos.distanceTo(P.pos) < R * 2) blip(s.pos, COL.nav, 7);
  for (const a of w.anoms) if (a.pos.distanceTo(P.pos) < R * 1.5) blip(a.pos, '#ffb347', 5, false);
  x.restore();
  text(`${(R / 1000).toFixed(0)} km`, cx + rw - 4, cy + rh + 14, hexA(C, 0.6), 10, 'right');
}

function bar(px, py, w, h, frac, col, label, val) {
  x.fillStyle = 'rgba(5,12,20,0.55)'; x.fillRect(px, py, w, h);
  x.fillStyle = col; x.fillRect(px, py, w * clamp(frac, 0, 1), h);
  x.strokeStyle = hexA(col, 0.5); x.lineWidth = 1; x.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  text(label, px, py - 4, hexA('#cfe6f5', 0.75), 10);
  if (val !== undefined) text(val, px + w, py - 4, '#e6f3ff', 11, 'right');
}

function drawGauges(g, C) {
  const P = g.playerShip, s = P.stats;
  const mob = document.body.classList.contains('mobile');
  const rw = mob ? Math.min(85, W * 0.11) : Math.min(150, W * 0.12);
  const GW = mob ? 96 : 150;
  const lx = W / 2 - rw - GW - 18, by = H - (mob ? 104 : 140);
  // 왼쪽: 실드 · 선체 · 에너지 · 연료
  bar(lx, by, GW, 8, P.shieldDown ? 0 : P.shield / s.shield, P.shieldDown ? '#335' : '#4fc8ff', P.shieldDown ? '실드 재가동 중' : '실드', Math.round(P.shield));
  bar(lx, by + 26, GW, 8, P.hull / s.hull, P.hull / s.hull < 0.3 ? '#ff4d5e' : '#ffae5a', '선체', Math.round(P.hull));
  bar(lx, by + 52, GW, 6, P.energy / s.energy, '#b48bff', '에너지', Math.round(P.energy));
  bar(lx, by + 76, GW, 6, P.fuel / s.fuel, P.fuel / s.fuel < 0.25 ? '#ff4d5e' : '#7dff9a', '연료', `${P.fuel.toFixed(1)} / ${s.fuel} t`);
  // 오른쪽: 속도 · 스로틀
  const rx = W / 2 + rw + 18;
  const cruise = P.cruise === 2;
  text(cruise ? '크루즈' : P.fa ? '비행 보조 ON' : '비행 보조 OFF', rx, by - 4, cruise ? '#9fc8ff' : P.fa ? hexA(C, 0.8) : '#ffb347', 11);
  text(fmtSpeed(P.speed), rx, by + 26, '#ffffff', 26, 'left', 'Orbitron');
  // 스로틀 바
  const tw = GW, ty = by + 44;
  x.fillStyle = 'rgba(5,12,20,0.55)'; x.fillRect(rx, ty, tw, 10);
  const zero = rx + tw / 3;
  const thr = P.ctrl.throttle;
  x.fillStyle = cruise ? '#7ab8ff' : thr >= 0 ? C : '#ffb347';
  if (thr >= 0) x.fillRect(zero, ty, (tw * 2 / 3) * thr, 10); else x.fillRect(zero + (tw / 3) * thr * 2, ty, -(tw / 3) * thr * 2, 10);
  // 최적 선회 구간 (스로틀 50~75%)
  x.fillStyle = hexA('#5b8cff', 0.35); x.fillRect(zero + (tw * 2 / 3) * 0.5, ty + 10, (tw * 2 / 3) * 0.25, 3);
  x.strokeStyle = hexA(C, 0.5); x.strokeRect(rx + 0.5, ty + 0.5, tw - 1, 9);
  x.fillStyle = '#fff'; x.fillRect(zero - 1, ty - 3, 2, 16);
  text('스로틀', rx, ty - 4 + 26, hexA('#cfe6f5', 0.6), 10);
  text(`${Math.round(thr * 100)}%`, rx + tw, ty + 22, '#e6f3ff', 11, 'right');
  if (P.boosting) text('부스트', rx + tw, by - 4, '#ffb347', 12, 'right');
  // 화물
  text(`화물 ${P.cargoUsed()}/${s.cargo}t`, rx, by + 88, hexA('#cfe6f5', 0.75), 11);
  // 무기 목록
  let wy = by + 88;
  const sec = P.weapons.filter((w) => w.w.secondary);
  if (sec.length) text(`미사일 ${sec.reduce((a, w) => a + w.ammo, 0)}`, rx + tw, wy, '#ffb347', 11, 'right');
  // 열 경고
  if (P.heat !== undefined && P.heat < 0.6) text(`⚠ 항성 열 위험 ${Math.round((1 - P.heat) * 100)}%`, W / 2, H - 200, '#ff7a3c', 14, 'center');
}

function drawCenter(g, C) {
  const lines = [];
  const P = g.playerShip;
  if (P.cruise === 1) lines.push([`크루즈 드라이브 충전 ${Math.min(100, Math.round(P.cruiseCharge / 3 * 100))}%`, '#9fc8ff']);
  if (g.hyperCharge > 0) lines.push([`하이퍼점프 충전 ${Math.round(g.hyperCharge / 4 * 100)}% → ${g.hyperTarget ? g.galaxy.byId[g.hyperTarget].name : ''}`, '#c8a0ff']);
  if (g.autopilot) lines.push([g.autopilot.label, '#7dff9a']);
  if (HUD.scan > 0) lines.push([`스캔 중 ${Math.round(HUD.scan * 100)}%`, '#ffd84d']);
  if (g.hint) lines.push([g.hint, C]);
  let y = document.body.classList.contains('mobile') ? 128 : 110;
  for (const [t, c] of lines) { text(t, W / 2, y, c, 15, 'center'); y += 22; }
  if (HUD.scan > 0) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(W / 2 - 100, y - 10, 200, 6); x.fillStyle = '#ffd84d'; x.fillRect(W / 2 - 100, y - 10, 200 * HUD.scan, 6); }
}
export { FACTIONS };
