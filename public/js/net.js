// 멀티플레이 네트워크 — 계정 · 저장 동기화 · 같은 성계 플레이어 표시 · 채팅 · 최초 발견
import * as THREE from 'three';
import { Ship } from './ship.js';
import { S } from './state.js';
import { SHIPS, defaultLoadout } from './data.js';
import * as FX from './fx.js';

const _z = new THREE.Vector3(0, 0, 1);

export class Net {
  constructor(game) {
    this.game = game;
    this.ws = null; this.connected = false; this.online = 0; this.authed = false;
    this.pending = null; this.lbCb = null; this.stT = 0; this.retry = 0;
    this.remotes = new Map();
    this.onStatus = null;
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try { ws = new WebSocket(`${proto}://${location.host}/ws`); } catch { return this.status(false); }
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.retry = 0; this.status(true); if (this.authed && this.token) this.send({ t: 'resume', token: this.token }); };
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false; this.status(false);
      if (was && this.authed) this.game.msg('서버 연결이 끊어졌습니다 — 재접속 시도 중 (진행 상황은 브라우저에 저장됩니다)', 'warn');
      setTimeout(() => this.connect(), Math.min(15000, 1500 * ++this.retry));
    };
    ws.onerror = () => {};
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.handle(m); };
  }
  status(ok) { if (this.onStatus) this.onStatus(ok); }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }

  auth(kind, name, pass) {
    return new Promise((res) => {
      if (!this.connected) return res({ ok: false, err: '서버에 연결되지 않았습니다' });
      this.pending = res;
      this.send({ t: kind, name, pass });
      setTimeout(() => { if (this.pending === res) { this.pending = null; res({ ok: false, err: '서버 응답 없음' }); } }, 12000);
    });
  }
  handle(m) {
    switch (m.t) {
      case 'hello': this.online = m.online; break;
      case 'auth':
        if (m.ok) { this.authed = true; this.token = m.token; try { localStorage.setItem('sd_token', m.token); } catch {} this.game.discoveries = m.discs || {}; }
        if (this.pending) { const p = this.pending; this.pending = null; p(m); }
        break;
      case 'online': this.online = m.n; break;
      case 'ps': this.presence(m); break;
      case 'shot': this.remoteShot(m); break;
      case 'hit': this.game.onRemoteHit(m); break;
      case 'chat': this.game.chatIn(m); break;
      case 'sysmsg': this.game.msg(m.text, 'info'); break;
      case 'disc': if (this.game.discoveries) this.game.discoveries[m.sys] = m.by; if (m.by === S.save?.name && m.first) this.game.onFirstDiscovery(m.sys); break;
      case 'lb': if (this.lbCb) { this.lbCb(m.rows); this.lbCb = null; } break;
      case 'kicked': this.game.msg('다른 곳에서 같은 계정으로 접속했습니다', 'bad'); this.authed = false; break;
    }
  }

  // ---- 저장 ----
  save(data, meta) { if (this.authed) this.send({ t: 'save', data, meta }); }

  // ---- 위치 공유 ----
  tick(dt) {
    if (!this.authed || !this.connected) return;
    this.stT -= dt;
    if (this.stT > 0) return;
    this.stT = 0.12;
    const g = this.game, P = g.playerShip;
    if (!P || g.docked || g.hyper || P.dead || !g.world.sys) { this.send({ t: 'st', sys: g.world.sys ? g.world.sys.id : null, hide: 1 }); return; }
    const r = (v) => Math.round(v * 10) / 10;
    this.send({
      t: 'st', sys: g.world.sys.id, ty: P.type, pt: P.paint,
      p: [r(P.pos.x), r(P.pos.y), r(P.pos.z)], q: [P.quat.x, P.quat.y, P.quat.z, P.quat.w].map((v) => Math.round(v * 1e4) / 1e4),
      v: [r(P.vel.x), r(P.vel.y), r(P.vel.z)], th: Math.round(P.ctrl.throttle * 100) / 100, fl: (P.boosting ? 1 : 0) | (P.cruise === 2 ? 2 : 0),
      sh: Math.round(P.shield / P.stats.shield * 100), hu: Math.round(P.hull / P.stats.hull * 100),
    });
  }
  presence(m) {
    const w = this.game.world;
    if (!w.sys || m.sys !== w.sys.id) return;
    const seen = new Set();
    for (const r of m.list) {
      seen.add(r.id);
      let s = this.remotes.get(r.id);
      if (s && (s.type !== r.ty || s.paint.join() !== (r.pt || []).join() || !w.byId.has(s.id))) { if (w.byId.has(s.id)) s.dead = true; this.remotes.delete(r.id); s = null; }
      if (!s) {
        if (!SHIPS[r.ty]) continue;
        s = new Ship({ id: 'r' + r.id, type: r.ty, loadout: defaultLoadout(r.ty), paint: r.pt || SHIPS[r.ty].paint, name: r.n, role: 'remote', faction: 'indep', isRemote: true });
        s.netId = r.id;
        s.pos.fromArray(r.p); s.quat.fromArray(r.q);
        w.addShip(s);
        this.remotes.set(r.id, s);
        FX.jumpFlash(s.pos, '#d08bff', 0.6);
      }
      s.snap = { p: new THREE.Vector3().fromArray(r.p), q: new THREE.Quaternion().fromArray(r.q), v: new THREE.Vector3().fromArray(r.v), t: performance.now() / 1000 };
      s.ctrl.throttle = r.th; s.boosting = !!(r.fl & 1); s.cruise = r.fl & 2 ? 2 : 0;
      s.shield = s.stats.shield * (r.sh ?? 100) / 100; s.hull = s.stats.hull * (r.hu ?? 100) / 100;
      s.bounty = r.b || 0;
    }
    for (const [id, s] of this.remotes) if (!seen.has(id)) { s.dead = true; this.remotes.delete(id); }
  }
  interp(s, dt) {
    const sn = s.snap; if (!sn) return;
    const age = Math.min(0.5, performance.now() / 1000 - sn.t);
    const tx = sn.p.x + sn.v.x * age, ty = sn.p.y + sn.v.y * age, tz = sn.p.z + sn.v.z * age;
    const k = 1 - Math.exp(-12 * dt);
    if (s.pos.distanceToSquared(sn.p) > 4e6) s.pos.set(tx, ty, tz);
    s.pos.x += (tx - s.pos.x) * k; s.pos.y += (ty - s.pos.y) * k; s.pos.z += (tz - s.pos.z) * k;
    s.vel.copy(sn.v); s.speed = s.vel.length();
    s.quat.slerp(sn.q, k);
  }
  clearRemotes() { this.remotes.clear(); }

  // ---- 전투 ----
  shot(from, dir, w, mul) {
    if (!this.authed || this.game.docked) return;
    this.send({ t: 'shot', sys: this.game.world.sys.id, p: from.toArray().map((v) => Math.round(v * 10) / 10), d: dir.toArray().map((v) => Math.round(v * 1e4) / 1e4), w, m: mul });
  }
  remoteShot(m) {
    const w = this.game.world;
    const s = this.remotes.get(m.id);
    if (!s || !w.sys) return;
    const W = (s.weapons.find((x) => x.id === m.w) || {}).w || { kind: 'bolt', speed: 1800, range: 1800, color: '#d08bff' };
    const from = new THREE.Vector3().fromArray(m.p), dir = new THREE.Vector3().fromArray(m.d);
    if (W.kind === 'rail') { FX.beam(from, from.clone().addScaledVector(dir, W.range), W.color, 0.6, 0.3); return; }
    if (W.kind !== 'bolt') return;
    // 시각 효과용 볼트 (피해 판정은 맞은 쪽 클라이언트가 원격 플레이어의 hit 메시지로 처리)
    w.bolts.push({ pos: from, vel: dir.multiplyScalar(W.speed).add(s.vel), life: W.range / W.speed, dmg: 0, w: W, owner: s, color: W.color, width: 0.25, len: 10, visual: true });
  }
  hit(id, dmg, sm, hm) {
    const s = [...this.remotes.values()].find((x) => x.id === id);
    if (s) this.send({ t: 'hit', to: s.netId, dmg: Math.round(dmg), sm, hm, sys: this.game.world.sys.id });
  }
  chat(text) {
    if (!this.authed) { this.game.msg('오프라인 모드에서는 채팅을 사용할 수 없습니다', 'warn'); return; }
    let ch = 'all';
    if (text.startsWith('/s ')) { ch = 'sys'; text = text.slice(3); }
    this.send({ t: 'chat', ch, text: text.slice(0, 200), sys: this.game.world.sys ? this.game.world.sys.id : null });
  }
  discover(sys) { this.send({ t: 'disc', sys }); }
  died(by) { this.send({ t: 'died', by, sys: this.game.world.sys.id }); }
  leaderboard(cb) { if (!this.authed) return cb(null); this.lbCb = cb; this.send({ t: 'lb' }); setTimeout(() => { if (this.lbCb === cb) { this.lbCb = null; cb(null); } }, 6000); }
}
export { _z };
