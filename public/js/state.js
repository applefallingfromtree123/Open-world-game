// 클라이언트 전역 상태
export const G = {
  ws: null, connected: false, loggedIn: false,
  id: null, name: null, token: null,
  world: null, bodies: {}, sysById: {}, stById: {}, beltById: {}, beaconById: {}, asteroids: [],
  acct: null, station: null, clan: null, clanList: null, lb: null,
  info: { online: 0, sov: {}, clans: {} },
  me: null,
  self: { x: 0, y: 0, vx: 0, vy: 0, a: 0, warp: 0 },
  ships: new Map(), missiles: new Map(), loots: new Map(), dep: new Set(), anomalies: new Map(),
  shots: [], particles: [], rings: [], beams: [],
  timeOffset: 0, rtt: 0.12,
  cam: { x: 0, y: 0, zoom: 0.85, userZoom: 0.85, shake: 0 },
  input: { keys: 0, aim: 0, mx: 0, my: 0, mouseDown: false },
  lastSnap: 0,
  settings: { quality: 'high', names: true, scanlines: true },
};
try { Object.assign(G.settings, JSON.parse(localStorage.getItem('nv_settings') || '{}')); } catch {}
export function saveSettings() { try { localStorage.setItem('nv_settings', JSON.stringify(G.settings)); } catch {} }

export const serverTime = () => performance.now() / 1000 + G.timeOffset;

export function send(obj) {
  if (G.ws && G.ws.readyState === 1) G.ws.send(JSON.stringify(obj));
}
