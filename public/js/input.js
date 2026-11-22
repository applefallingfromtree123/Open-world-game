// 입력 — 키보드 · 마우스(가상 조이스틱 / 포인터 잠금) · 휠
export const IN = {
  keys: new Set(), pressed: new Set(),
  mx: 0, my: 0,                 // 화면 좌표
  vx: 0, vy: 0,                 // 가상 조이스틱 (-1..1)
  lmb: false, rmb: false, wheel: 0, locked: false, enabled: true, freelook: false, active: false, touch: false,
  dx: 0, dy: 0,
};
let canvas;
export function initInput(cv, opts) {
  canvas = cv;
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if (['Tab', 'Space', 'AltLeft', 'AltRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1'].includes(e.code)) e.preventDefault();
    if (!IN.keys.has(e.code)) IN.pressed.add(e.code);
    IN.keys.add(e.code);
    opts.onKey && opts.onKey(e);
  });
  window.addEventListener('keyup', (e) => { IN.keys.delete(e.code); });
  window.addEventListener('blur', () => { IN.keys.clear(); IN.lmb = IN.rmb = false; });
  cv.addEventListener('mousedown', (e) => {
    if (!IN.enabled || IN.touch) return;
    if (opts.wantLock() && !IN.locked) {
      const first = !IN.active;
      IN.active = true;
      if (cv.requestPointerLock) { try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} }
      if (first) return;   // 조종 활성화 클릭은 사격하지 않음
    }
    if (e.button === 0) IN.lmb = true;
    if (e.button === 2) IN.rmb = true;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) IN.lmb = false; if (e.button === 2) IN.rmb = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    IN.mx = e.clientX; IN.my = e.clientY;
    if (IN.locked) { IN.dx += e.movementX; IN.dy += e.movementY; }
  });
  cv.addEventListener('wheel', (e) => { IN.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { IN.locked = document.pointerLockElement === cv; if (!IN.locked) { IN.vx = IN.vy = 0; } });
}
export function releaseLock() { IN.active = false; IN.vx = IN.vy = 0; if (document.pointerLockElement) document.exitPointerLock(); }
export const down = (c) => IN.keys.has(c);
export function hit(c) { if (IN.pressed.has(c)) { IN.pressed.delete(c); return true; } return false; }
export function endFrame() { IN.pressed.clear(); IN.wheel = 0; IN.dx = 0; IN.dy = 0; }

// 가상 조이스틱 갱신
export function updateStick(W, H, sens, mode) {
  if (IN.freelook || IN.touch) return;   // 모바일: 터치 스틱이 직접 값을 넣음
  if (IN.locked) {
    const k = 0.0028 * sens;
    IN.vx += IN.dx * k; IN.vy += IN.dy * k;
    const l = Math.hypot(IN.vx, IN.vy);
    if (l > 1) { IN.vx /= l; IN.vy /= l; }
    if (mode === 'relative') { IN.vx *= 0.9; IN.vy *= 0.9; }
  } else if (!IN.active) {
    IN.vx = 0; IN.vy = 0;
  } else {
    const r = Math.min(W, H) * 0.32;
    IN.vx = Math.max(-1, Math.min(1, (IN.mx - W / 2) / r));
    IN.vy = Math.max(-1, Math.min(1, (IN.my - H / 2) / r));
  }
}
export function centerStick() { IN.vx = 0; IN.vy = 0; }
