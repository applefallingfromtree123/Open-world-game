// ============================================================
//  모바일 터치 조작 — 조종 스틱 · 스로틀 슬라이더 · 사격/부스트/롤 · 액션 버튼
// ============================================================
import { IN } from './input.js';

export const DEV = { mobile: false };
let game, root, stick, knob, thr, thrFill, thrLabel;
const R = 60; // 스틱 반경(px)

export function detectTouch() {
  return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
export function savedDevice() { try { return localStorage.getItem('sd_device'); } catch { return null; } }

export function setDevice(mode) {
  DEV.mobile = mode === 'mobile';
  IN.touch = DEV.mobile;
  try { localStorage.setItem('sd_device', mode); } catch {}
  document.body.classList.toggle('mobile', DEV.mobile);
  if (root) root.classList.toggle('hidden', !DEV.mobile);
}

// 처음 실행 시 기기 선택
export function askDevice(done) {
  const el = document.getElementById('device-pick');
  const rec = detectTouch() ? 'mobile' : 'pc';
  el.querySelector(`[data-dev="${rec}"]`).classList.add('rec');
  el.classList.remove('hidden');
  el.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => {
    const mode = b.dataset.dev;
    setDevice(mode);
    el.classList.add('hidden');
    if (mode === 'mobile') {
      // 전체 화면 + 가로 모드 시도 (지원 브라우저만)
      const d = document.documentElement;
      try { const p = d.requestFullscreen && d.requestFullscreen({ navigationUI: 'hide' }); if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch {} }).catch(() => {}); } catch {}
    }
    done(mode);
  }, { once: true }));
}

function hold(el, on, off) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); on(); });
  const up = (e) => { el.classList.remove('on'); off(); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
}
function tap(el, fn) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('on'); fn(); });
  const up = () => el.classList.remove('on');
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
}
const press = (code) => { IN.pressed.add(code); };
const keyOn = (code) => () => IN.keys.add(code);
const keyOff = (code) => () => IN.keys.delete(code);

export function initTouch(g) {
  game = g;
  root = document.getElementById('touch');
  stick = root.querySelector('.t-stick'); knob = stick.querySelector('i');
  thr = root.querySelector('.t-thr'); thrFill = thr.querySelector('.fill'); thrLabel = thr.querySelector('b');

  // ---- 조종 스틱 (터치한 위치가 중심) ----
  const zone = root.querySelector('.t-stick-zone');
  let sid = null, cx = 0, cy = 0;
  zone.addEventListener('pointerdown', (e) => {
    if (sid !== null) return;
    e.preventDefault();
    sid = e.pointerId; zone.setPointerCapture(sid);
    const r = zone.getBoundingClientRect();
    cx = e.clientX; cy = e.clientY;
    stick.style.left = (cx - r.left) + 'px'; stick.style.top = (cy - r.top) + 'px';
    stick.classList.add('on');
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const sens = (game.save && game.save.settings.sens) || 1;
    IN.vx = Math.max(-1, Math.min(1, dx / R * (0.6 + sens * 0.4)));
    IN.vy = Math.max(-1, Math.min(1, dy / R * (0.6 + sens * 0.4)));
  });
  const release = (e) => {
    if (e.pointerId !== sid) return;
    sid = null; IN.vx = 0; IN.vy = 0;
    knob.style.transform = ''; stick.classList.remove('on');
  };
  zone.addEventListener('pointerup', release); zone.addEventListener('pointercancel', release);

  // ---- 스로틀 슬라이더 (위 100% · 아래 −50%) ----
  let tid = null;
  const setThr = (e) => {
    const r = thr.getBoundingClientRect();
    const t = 1 - (e.clientY - r.top) / r.height;          // 0..1
    let v = -0.5 + t * 1.5;
    if (Math.abs(v) < 0.06) v = 0;                           // 0 근처 스냅
    const P = game.playerShip;
    if (P) { P.ctrl.throttle = Math.max(P.cruise ? 0.05 : -0.5, Math.min(1, v)); if (game.autopilot) game.autopilot = null; }
  };
  thr.addEventListener('pointerdown', (e) => { e.preventDefault(); tid = e.pointerId; thr.setPointerCapture(tid); setThr(e); });
  thr.addEventListener('pointermove', (e) => { if (e.pointerId === tid) setThr(e); });
  const tup = (e) => { if (e.pointerId === tid) tid = null; };
  thr.addEventListener('pointerup', tup); thr.addEventListener('pointercancel', tup);

  // ---- 버튼 ----
  hold(root.querySelector('[data-b="fire"]'), () => { IN.lmb = true; }, () => { IN.lmb = false; });
  hold(root.querySelector('[data-b="missile"]'), () => { IN.rmb = true; }, () => { IN.rmb = false; });
  hold(root.querySelector('[data-b="boost"]'), keyOn('ShiftLeft'), keyOff('ShiftLeft'));
  hold(root.querySelector('[data-b="rollL"]'), keyOn('KeyQ'), keyOff('KeyQ'));
  hold(root.querySelector('[data-b="rollR"]'), keyOn('KeyE'), keyOff('KeyE'));
  hold(root.querySelector('[data-b="scan"]'), keyOn('KeyV'), keyOff('KeyV'));
  for (const [b, code] of [['cruise', 'KeyJ'], ['auto', 'KeyG'], ['target', 'KeyT'], ['hostile', 'KeyY'], ['cam', 'KeyC'], ['fa', 'KeyZ'], ['stop', 'KeyX']]) tap(root.querySelector(`[data-b="${b}"]`), () => press(code));
  tap(root.querySelector('[data-b="jump"]'), () => game.tryHyperjump());
  root.querySelector('[data-b="chat"]').addEventListener('click', () => openChat());
  tap(root.querySelector('[data-b="build"]'), () => press('KeyB'));
  // 스크롤/확대 방지
  root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}

// 매 프레임: 표시 여부와 스로틀 표시 갱신
export function updateTouch() {
  if (!DEV.mobile || !root) return;
  const show = game.state === 'play' && !game.docked && !game.mapOpen && !game.menuOpen && game.playerShip && !game.playerShip.dead;
  root.classList.toggle('hidden', !show);
  if (!show) return;
  const P = game.playerShip;
  const t = (P.ctrl.throttle + 0.5) / 1.5;
  thrFill.style.height = Math.max(0, t * 100) + '%';
  thrFill.classList.toggle('neg', P.ctrl.throttle < 0);
  thrLabel.textContent = Math.round(P.ctrl.throttle * 100) + '%';
  root.querySelector('[data-b="cruise"]').classList.toggle('lit', P.cruise > 0);
  root.querySelector('[data-b="auto"]').classList.toggle('lit', !!game.autopilot);
  root.querySelector('[data-b="fa"]').classList.toggle('lit', !P.fa);
  root.querySelector('[data-b="jump"]').classList.toggle('lit', game.hyperCharge > 0);
  root.querySelector('[data-b="missile"]').classList.toggle('hidden', !P.weapons.some((w) => w.w.secondary));
  root.querySelector('[data-b="build"]').classList.toggle('hidden', !((game.save.storage || {}).outpost_kit > 0));
}

// 모바일 채팅: 화면 위쪽에 큰 입력창을 띄우고 키보드를 연다
export function openChat() {
  document.body.classList.add('chatting');
  const i = document.getElementById('comms-input');
  i.focus();
}
export function closeChat() { document.body.classList.remove('chatting'); }
