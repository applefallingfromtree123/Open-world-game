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
const THREE_DIR = path.join(__dirname, '..', 'node_modules', 'three');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// 배포 빌드 식별자 (Render는 RENDER_GIT_COMMIT 제공) — 클라이언트가 새 버전을 감지하는 데 사용
const BUILD = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || Date.now().toString(36);

const store = new Store();
await store.init();
const game = new Game(store);
game.build = BUILD;
await game.init();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, build: BUILD, online: game.players.size, uptime: Math.round(process.uptime()) }));
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  // Three.js는 node_modules에서 직접 제공 (CDN 의존 없음)
  let base = PUBLIC, rel = p;
  if (p.startsWith('/vendor/three/')) { base = THREE_DIR; rel = p.slice('/vendor/three'.length); }
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const vendor = base === THREE_DIR;
    // 게임 파일은 매번 재검증(no-cache + ETag) — 배포 직후 예전 JS와 새 HTML이 섞여 기능이 깨지는 것을 방지
    const etag = `W/"${BUILD}-${st.size}-${Math.round(st.mtimeMs)}"`;
    const headers = {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': vendor ? 'public, max-age=86400' : 'no-cache',
      etag,
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    if (p === '/index.html') {
      // 진입 스크립트/스타일에 빌드 번호를 붙여 캐시를 확실히 무효화
      return fs.readFile(file, 'utf8', (e, html) => {
        if (e) { res.writeHead(500); return res.end(); }
        res.writeHead(200, headers);
        res.end(html.replace('js/main.js', `js/main.js?v=${BUILD}`).replace('css/style.css', `css/style.css?v=${BUILD}`).replace('%BUILD%', BUILD));
      });
    }
    res.writeHead(200, headers);
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
