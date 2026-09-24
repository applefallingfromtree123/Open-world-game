// NEON//VOID 서버 진입점 — HTTP 정적 파일 + WebSocket 게임 서버
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { Store } from './db.js';
import { TICK_RATE } from '../public/shared/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const store = new Store();
await store.init();
const game = new Game(store);
await game.init();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, online: game.players.size, uptime: Math.round(process.uptime()) }));
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': p === '/index.html' ? 'no-cache' : 'public, max-age=300',
    });
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  game.onConnect(ws, ip);
});
// 죽은 연결 정리 (Render 프록시 유휴 타임아웃 방지)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 25000);

// 고정 틱 게임 루프
const DT = 1 / TICK_RATE;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const n = performance.now();
  acc += Math.min(0.25, (n - last) / 1000);
  last = n;
  let steps = 0;
  while (acc >= DT && steps < 5) {
    try { game.tick(DT); } catch (e) { console.error('[tick] 오류', e); }
    acc -= DT;
    steps++;
  }
}, 1000 / TICK_RATE / 2);

// 자동 저장
setInterval(() => game.save(), 30000);

let shuttingDown = false;
async function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${sig} 수신 — 저장 후 종료`);
  await game.save();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => console.log(`[server] NEON//VOID 실행 중 — http://localhost:${PORT}`));
