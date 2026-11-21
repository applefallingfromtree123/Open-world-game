// ============================================================
//  STARDRIFT 서버 허브 — 계정 · 저장 · 같은 성계 위치 공유 · 채팅 · 최초 발견 · 랭킹
//  비행·전투 시뮬레이션은 각 클라이언트가 수행하고, 서버는 영속성과 중계를 담당한다.
// ============================================================
import crypto from 'crypto';

const NAME_RE = /^[A-Za-z0-9가-힣_\-]{2,16}$/;
const MAX_SAVE = 600 * 1024;
const now = () => Date.now();

function scryptAsync(pass, salt) {
  return new Promise((res, rej) => crypto.scrypt(pass, salt, 32, (e, k) => (e ? rej(e) : res(k.toString('hex')))));
}

export class Hub {
  constructor(store) {
    this.store = store;
    this.accounts = {};    // key(lowercase) -> { name, salt, hash, created, save, meta, tokens[] }
    this.discs = {};       // sysId -> 발견자 이름
    this.conns = new Set();
    this.byName = new Map();
    this.dirty = false;
    this.chatLog = [];
  }
  async init() {
    const saved = await this.store.load();
    if (saved && saved.v === 2) {
      this.accounts = saved.accounts || {};
      this.discs = saved.discs || {};
      this.chatLog = saved.chat || [];
      console.log(`[hub] 불러옴: 계정 ${Object.keys(this.accounts).length}, 발견 성계 ${Object.keys(this.discs).length}`);
    } else if (saved) {
      console.log('[hub] 이전 버전 데이터 감지 — 새 게임(STARDRIFT)으로 시작합니다. 이전 데이터는 보존됩니다.');
      this.legacy = saved;
    }
  }
  serialize() {
    const out = { v: 2, accounts: this.accounts, discs: this.discs, chat: this.chatLog.slice(-40) };
    if (this.legacy) out.legacy = this.legacy;
    return out;
  }
  async save() { if (!this.dirty) return; this.dirty = false; await this.store.save(this.serialize()); }
  get online() { return [...this.conns].filter((c) => c.acct).length; }

  onConnect(ws, ip) {
    const c = { ws, ip, acct: null, key: null, st: null, msgs: 0, win: now(), lastChat: 0, id: crypto.randomBytes(4).toString('hex') };
    this.conns.add(c);
    this.send(c, { t: 'hello', online: this.online });
    ws.on('message', (data) => {
      const t = now();
      if (t - c.win > 1000) { c.win = t; c.msgs = 0; }
      if (++c.msgs > 60) return;
      let m; try { m = JSON.parse(data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      this.handle(c, m).catch((e) => console.error('[hub] 오류', m.t, e.message));
    });
    ws.on('close', () => this.onClose(c));
    ws.on('error', () => {});
  }
  onClose(c) {
    this.conns.delete(c);
    if (c.key && this.byName.get(c.key) === c) {
      this.byName.delete(c.key);
      this.broadcast({ t: 'sysmsg', text: `${c.acct.name} 님이 접속을 종료했습니다.` }, c);
      this.broadcast({ t: 'online', n: this.online });
    }
  }
  send(c, o) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); }
  broadcast(o, except) { const s = JSON.stringify(o); for (const c of this.conns) if (c !== except && c.acct && c.ws.readyState === 1) c.ws.send(s); }

  async handle(c, m) {
    switch (m.t) {
      case 'register': return this.register(c, m);
      case 'login': return this.login(c, m);
      case 'resume': return this.resume(c, m);
    }
    if (!c.acct) return;
    switch (m.t) {
      case 'save': {
        if (!m.data || typeof m.data !== 'object') return;
        const json = JSON.stringify(m.data);
        if (json.length > MAX_SAVE) return;
        if (String(m.data.name || '').toLowerCase() !== c.key) return;
        c.acct.save = m.data;
        c.acct.meta = { worth: Math.max(0, +m.meta?.worth || 0), rank: String(m.meta?.rank || '').slice(0, 12), kills: m.meta?.kills | 0, visited: m.meta?.visited | 0, ts: now() };
        this.dirty = true;
        return this.send(c, { t: 'saved' });
      }
      case 'st': {
        if (m.hide || !m.sys) { c.st = null; return; }
        if (!Array.isArray(m.p) || m.p.length !== 3 || !Array.isArray(m.q) || m.q.length !== 4) return;
        c.st = { sys: String(m.sys).slice(0, 8), ty: String(m.ty).slice(0, 16), pt: Array.isArray(m.pt) ? m.pt.slice(0, 2).map((x) => String(x).slice(0, 9)) : null, p: m.p.map(Number), q: m.q.map(Number), v: (m.v || [0, 0, 0]).map(Number), th: +m.th || 0, fl: m.fl | 0, sh: m.sh | 0, hu: m.hu | 0, t: now() };
        return;
      }
      case 'shot': {
        if (!c.st) return;
        const o = JSON.stringify({ t: 'shot', id: c.id, p: m.p, d: m.d, w: String(m.w).slice(0, 10), m: +m.m || 1 });
        for (const x of this.conns) if (x !== c && x.st && x.st.sys === c.st.sys && x.ws.readyState === 1) x.ws.send(o);
        return;
      }
      case 'hit': {
        const tgt = [...this.conns].find((x) => x.id === m.to);
        if (!tgt || !tgt.st || !c.st || tgt.st.sys !== c.st.sys) return;
        const dmg = Math.max(0, Math.min(500, +m.dmg || 0));
        return this.send(tgt, { t: 'hit', from: c.id, fromName: c.acct.name, dmg, sm: +m.sm || 1, hm: +m.hm || 1 });
      }
      case 'died': {
        const by = String(m.by || '').slice(0, 24);
        return this.broadcast({ t: 'sysmsg', text: by ? `☠ ${c.acct.name} 님이 ${by}에게 격추당했습니다.` : `☠ ${c.acct.name} 님의 함선이 파괴되었습니다.` });
      }
      case 'chat': {
        const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
        if (!text || now() - c.lastChat < 700) return;
        c.lastChat = now();
        const msg = { t: 'chat', from: c.acct.name, text, ch: m.ch === 'sys' ? 'sys' : 'all', sys: c.st ? c.st.sys : null };
        if (msg.ch === 'sys') { for (const x of this.conns) if (x.acct && x.st && c.st && x.st.sys === c.st.sys) this.send(x, msg); }
        else { this.broadcast(msg); this.chatLog.push(msg); if (this.chatLog.length > 60) this.chatLog.shift(); }
        return;
      }
      case 'disc': {
        const sys = String(m.sys || '').slice(0, 8);
        if (!/^S\d{1,3}$/.test(sys)) return;
        if (!this.discs[sys]) {
          this.discs[sys] = c.acct.name; this.dirty = true;
          this.broadcast({ t: 'disc', sys, by: c.acct.name, first: true });
          this.broadcast({ t: 'sysmsg', text: `✦ ${c.acct.name} 님이 새로운 성계를 최초로 발견했습니다!` });
        }
        return;
      }
      case 'lb': {
        const rows = Object.values(this.accounts).filter((a) => a.meta).map((a) => ({ name: a.name, worth: a.meta.worth, rank: a.meta.rank, kills: a.meta.kills, visited: a.meta.visited, online: this.byName.has(a.name.toLowerCase()) }))
          .sort((a, b) => b.worth - a.worth).slice(0, 30);
        return this.send(c, { t: 'lb', rows });
      }
    }
  }

  async register(c, m) {
    const name = String(m.name || '').trim(), pass = String(m.pass || '');
    if (!NAME_RE.test(name)) return this.send(c, { t: 'auth', ok: false, err: '콜사인은 2~16자 (한글/영문/숫자/_-)' });
    if (pass.length < 4 || pass.length > 64) return this.send(c, { t: 'auth', ok: false, err: '비밀번호는 4자 이상' });
    const key = name.toLowerCase();
    if (this.accounts[key]) return this.send(c, { t: 'auth', ok: false, err: '이미 존재하는 콜사인입니다' });
    const salt = crypto.randomBytes(16).toString('hex');
    this.accounts[key] = { name, salt, hash: await scryptAsync(pass, salt), created: now(), save: null, meta: null, tokens: [] };
    this.dirty = true;
    await this.save().catch(() => {});
    return this.finishAuth(c, key);
  }
  async login(c, m) {
    const key = String(m.name || '').trim().toLowerCase();
    const a = this.accounts[key];
    if (!a) return this.send(c, { t: 'auth', ok: false, err: '존재하지 않는 콜사인입니다 (신규 등록을 눌러주세요)' });
    const h = await scryptAsync(String(m.pass || ''), a.salt);
    if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(a.hash))) return this.send(c, { t: 'auth', ok: false, err: '비밀번호가 틀렸습니다' });
    return this.finishAuth(c, key);
  }
  resume(c, m) {
    const tok = String(m.token || '');
    const key = Object.keys(this.accounts).find((k) => (this.accounts[k].tokens || []).includes(tok));
    if (!key) return this.send(c, { t: 'auth', ok: false, err: '세션 만료', resume: true });
    return this.finishAuth(c, key, true);
  }
  finishAuth(c, key, resumed) {
    const a = this.accounts[key];
    const old = this.byName.get(key);
    if (old && old !== c) { this.send(old, { t: 'kicked' }); old.acct = null; old.key = null; old.st = null; }
    c.acct = a; c.key = key;
    this.byName.set(key, c);
    const token = crypto.randomBytes(18).toString('hex');
    a.tokens = [...(a.tokens || []).slice(-4), token];
    this.dirty = true;
    this.send(c, { t: 'auth', ok: true, name: a.name, token, save: resumed ? undefined : a.save, discs: this.discs, online: this.online, resumed: !!resumed });
    if (!resumed) {
      this.broadcast({ t: 'sysmsg', text: `${a.name} 님이 접속했습니다.` }, c);
      for (const msg of this.chatLog.slice(-12)) this.send(c, msg);
    }
    this.broadcast({ t: 'online', n: this.online });
  }

  // 같은 성계 플레이어 위치 중계 (10Hz)
  tick() {
    const bySys = new Map();
    const t = now();
    for (const c of this.conns) {
      if (!c.acct || !c.st || t - c.st.t > 5000) continue;
      if (!bySys.has(c.st.sys)) bySys.set(c.st.sys, []);
      bySys.get(c.st.sys).push(c);
    }
    for (const [sys, list] of bySys) {
      if (list.length < 2) continue;
      for (const c of list) {
        const others = list.filter((o) => o !== c).map((o) => ({ id: o.id, n: o.acct.name, ty: o.st.ty, pt: o.st.pt, p: o.st.p, q: o.st.q, v: o.st.v, th: o.st.th, fl: o.st.fl, sh: o.st.sh, hu: o.st.hu }));
        this.send(c, { t: 'ps', sys, list: others });
      }
    }
    // 같은 성계에 아무도 없으면 빈 목록으로 정리
    for (const c of this.conns) if (c.acct && c.st && (!bySys.get(c.st.sys) || bySys.get(c.st.sys).length < 2) && c.hadOthers !== false) { this.send(c, { t: 'ps', sys: c.st.sys, list: [] }); c.hadOthers = false; }
    for (const [, list] of bySys) if (list.length >= 2) for (const c of list) c.hadOthers = true;
  }
}
