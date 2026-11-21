// ============================================================
//  플레이어 저장 상태 + 경제(시장)
// ============================================================
import { GOODS, GOOD_IDS, STATION_TYPES, SHIPS, START_CREDITS, SAVE_VERSION, defaultLoadout, loadoutValue, shipStats, RANKS, FACTIONS } from './data.js';
import { rng, hashStr, clamp } from './util.js';

export const S = { save: null, offline: false };

export function newSave(name) {
  const lo = defaultLoadout('sparrow');
  return {
    v: SAVE_VERSION, name, created: Date.now(), updated: Date.now(),
    credits: START_CREDITS,
    ships: [{ id: 'h' + Date.now().toString(36), type: 'sparrow', loadout: lo, paint: SHIPS.sparrow.paint.slice(), nick: '', loc: 'S0-st0', hull: 1, fuel: shipStats('sparrow', lo).fuel, cargo: {}, ammo: {} }],
    active: null,
    loc: { sys: 'S0', station: 'S0-st0' },
    rep: { union: 10, free: 0, syndicate: 0, pirate: -15, indep: 0 },
    wanted: {},
    missions: [], explored: {}, visited: { S0: true }, discovered: {},
    stats: { kills: 0, pirates: 0, lawful: 0, earned: 0, traded: 0, mined: 0, jumps: 0, dist: 0, scans: 0, missions: 0, deaths: 0, bounties: 0, playtime: 0, salvaged: 0 },
    wingmen: [], outposts: [], markets: {}, route: [], storage: {},
    settings: { invertY: false, sens: 1, quality: 'high', mouseMode: 'virtual', music: 0.35, sfx: 0.7, hudColor: '#5ce1ff' },
  };
}
export function fixSave(s) {
  const d = newSave(s.name);
  for (const k in d) if (s[k] === undefined) s[k] = d[k];
  for (const k in d.stats) if (s.stats[k] === undefined) s.stats[k] = 0;
  for (const k in d.rep) if (s.rep[k] === undefined) s.rep[k] = d.rep[k];
  for (const k in d.settings) if (s.settings[k] === undefined) s.settings[k] = d.settings[k];
  if (!s.active || !s.ships.find((x) => x.id === s.active)) s.active = s.ships[0] && s.ships[0].id;
  if (!s.ships.length) {
    const lo = defaultLoadout('sparrow');
    s.ships.push({ id: 'h' + Date.now().toString(36), type: 'sparrow', loadout: lo, paint: SHIPS.sparrow.paint.slice(), nick: '', loc: s.loc.station || 'S0-st0', hull: 1, fuel: 8, cargo: {}, ammo: {} });
    s.active = s.ships[0].id;
  }
  return s;
}
export const activeShip = () => S.save.ships.find((x) => x.id === S.save.active);

export function netWorth(s = S.save) {
  let v = s.credits;
  for (const sh of s.ships) {
    v += loadoutValue(sh.type, sh.loadout) * 0.9;
    for (const k in sh.cargo || {}) v += (GOODS[k] ? GOODS[k].base : 0) * sh.cargo[k];
  }
  v += s.outposts.length * 140000;
  return Math.floor(v);
}
export function rankOf(s = S.save) {
  const w = netWorth(s) + s.stats.earned * 0.3;
  let r = RANKS[0];
  for (const k of RANKS) if (w >= k.at) r = k;
  return r;
}
export function repName(v) {
  if (v >= 60) return ['동맹', '#5dff9d'];
  if (v >= 25) return ['우호', '#9dffb0'];
  if (v > -25) return ['중립', '#c9cbd6'];
  if (v > -60) return ['비우호', '#ff9a3c'];
  return ['적대', '#ff3355'];
}
export function addRep(f, d) {
  if (!S.save.rep[f] && S.save.rep[f] !== 0) return;
  S.save.rep[f] = clamp(S.save.rep[f] + d, -100, 100);
}
export function isWanted(f) { return (S.save.wanted[f] || 0) > 0; }
export function addBounty(f, amt) {
  if (f === 'pirate') return;
  S.save.wanted[f] = Math.round((S.save.wanted[f] || 0) + amt);
}

// ------------------------------------------------------------
//  시장
// ------------------------------------------------------------
function stationGoods(st) {
  const T = STATION_TYPES[st.type];
  const r = rng(hashStr(st.id));
  const out = {};
  for (const id of GOOD_IDS) {
    const g = GOODS[id];
    if (id === 'artifact' || id === 'blackbox') { out[id] = { mode: 'cons', eq: 0 }; continue; }
    if (g.illegal && st.type !== 'pirate') continue;              // 합법 스테이션은 불법품 거래 불가
    let mode = 'none', eq = 0;
    if (T.produces.includes(id)) { mode = 'prod'; eq = r.int(250, 1400); }
    else if (T.consumes.includes(id)) { mode = 'cons'; eq = r.int(5, 30); }
    else if (!g.ore && r.chance(0.35)) { mode = 'misc'; eq = r.int(20, 120); }
    out[id] = { mode, eq };
  }
  return out;
}
const goodsCache = new Map();
export function market(st) {
  if (!goodsCache.has(st.id)) goodsCache.set(st.id, stationGoods(st));
  const defs = goodsCache.get(st.id);
  let m = S.save.markets[st.id];
  const now = Date.now();
  if (!m) {
    m = { t: now, s: {} };
    for (const id in defs) m.s[id] = defs[id].eq;
    S.save.markets[st.id] = m;
  }
  // 시간 경과에 따라 평형 재고로 회복
  const el = (now - m.t) / 1000;
  if (el > 5) {
    const k = Math.exp(-el / 1500);
    for (const id in defs) { const cur = m.s[id] ?? defs[id].eq; m.s[id] = Math.round(defs[id].eq + (cur - defs[id].eq) * k); }
    m.t = now;
  }
  return { defs, stock: m.s };
}
export function priceOf(st, id, mk = market(st)) {
  const g = GOODS[id], d = mk.defs[id];
  if (!d) return null;
  const mult = d.mode === 'prod' ? 0.68 : d.mode === 'cons' ? 1.38 : d.mode === 'misc' ? 0.98 : 1.08;
  const ref = Math.max(d.eq, 40);
  const ratio = clamp((mk.stock[id] || 0) / ref, 0, 2.5);
  const pressure = 1 + 0.28 * (1 - ratio);
  const rep = S.save.rep[st.faction] || 0;
  const repMul = 1 - clamp(rep, -50, 100) * 0.0008;
  const base = g.base * mult * Math.max(0.55, pressure);
  return {
    buy: Math.max(1, Math.round(base * 1.04 * repMul)),       // 플레이어 구매가
    sell: Math.max(1, Math.round(base * 0.94 / repMul)),      // 플레이어 판매가
    stock: mk.stock[id] || 0, mode: d.mode,
  };
}
export function tradeStock(st, id, delta) {
  const mk = market(st);
  mk.stock[id] = Math.max(0, (mk.stock[id] || 0) + delta);
}
