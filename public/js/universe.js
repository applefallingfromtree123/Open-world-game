// ============================================================
//  은하 · 성계 절차 생성 (시드 기반, 모든 클라이언트가 같은 우주를 생성)
// ============================================================
import * as THREE from 'three';
import { rng, hashStr } from './util.js';
import { STATION_TYPES } from './data.js';

export const GALAXY_SEED = 90210;
const SYS_NAMES = [
  '솔라리스', '베가 프라임', '알타이르', '카펠라', '리겔', '데네브', '아크투루스', '시리우스 B', '폴룩스', '미라크',
  '안타레스', '스피카', '알데바란', '카노푸스', '레굴루스', '벨라트릭스', '미모사', '아케르나르', '하다르', '엘나스',
  '사이프', '알니탁', '무르짐', '코르 카롤리', '자우라크', '테이아', '헬리온', '오르쿠스', '니플헤임', '아스트라',
  '케레스 게이트', '녹턴', '에레보스', '할시온', '키메라', '오버로드',
];
const ST_WORDS = ['하이델', '노바', '켄싱턴', '아마테라스', '바르가스', '렌퀴스트', '오로라', '갈릴레이', '카르멘', '타카하시', '베일', '이카루스', '마젤란', '헤론', '세레니티', '볼코프', '드 라 크루즈', '카이퍼', '아스펜', '모로', '에클립스', '하버', '킹스턴', '루미나', '프록시마', '사카모토', '그레이', '베로니카', '오딘', '레드필드'];
const ST_SUFFIX = { trade: ['허브', '교역소', '항'], mining: ['채굴 기지', '콜로니', '광산'], industry: ['조선소', '공업 단지', '제련소'], tech: ['연구소', '랩', '관측소'], military: ['요새', '방위 기지', '사령부'], agri: ['농업 위성', '정원', '팜'], pirate: ['은신처', '소굴', '암시장'] };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export const STAR_TYPES = [
  { cls: 'O', name: '청색 거성',   color: '#9bb5ff', r: 34000, w: 0.3, lum: 1.5 },
  { cls: 'B', name: '청백색 별',   color: '#b9ccff', r: 27000, w: 0.6, lum: 1.35 },
  { cls: 'A', name: '백색 별',     color: '#e6ecff', r: 22000, w: 1, lum: 1.2 },
  { cls: 'F', name: '황백색 별',   color: '#fff4e0', r: 19000, w: 1.4, lum: 1.1 },
  { cls: 'G', name: '황색 왜성',   color: '#ffe3a1', r: 17000, w: 2, lum: 1.0 },
  { cls: 'K', name: '주황색 왜성', color: '#ffb46b', r: 15000, w: 2, lum: 0.9 },
  { cls: 'M', name: '적색 왜성',   color: '#ff7b4f', r: 12000, w: 2.4, lum: 0.75 },
  { cls: 'D', name: '백색 왜성',   color: '#dff6ff', r: 6000,  w: 0.3, lum: 0.9 },
];

export const PLANET_KINDS = {
  lava:   { name: '용암 행성',   c: ['#2a0b05', '#ff4a12', '#ffb347'], atmo: '#ff6a2a', rocky: true },
  desert: { name: '사막 행성',   c: ['#6b3d1a', '#d49a5a', '#f2d29b'], atmo: '#ffcc88', rocky: true },
  rock:   { name: '암석 행성',   c: ['#3a3633', '#7a726a', '#b5aca0'], atmo: null, rocky: true },
  ocean:  { name: '해양 행성',   c: ['#0a2a66', '#1e7ad1', '#e8f4ff'], atmo: '#6ac8ff', rocky: true, land: ['#2f6b2a', '#c7b07a'] },
  earth:  { name: '생명 행성',   c: ['#0c3a7a', '#2f8a3c', '#e9f2f7'], atmo: '#7ac8ff', rocky: true, land: ['#3c7a2c', '#a68a52'] },
  toxic:  { name: '독성 행성',   c: ['#2c3a08', '#a6c22a', '#f0ff8a'], atmo: '#c8ff3c', rocky: true },
  ice:    { name: '얼음 행성',   c: ['#5c7a99', '#bfe6ff', '#ffffff'], atmo: '#bfeaff', rocky: true },
  gas:    { name: '가스 거성',   c: ['#6a3d24', '#d9a066', '#f7e1bd'], atmo: '#ffd9a0', gas: true },
  gasb:   { name: '청색 가스 거성', c: ['#14305c', '#4a8fd9', '#cfe7ff'], atmo: '#8ac6ff', gas: true },
  gasp:   { name: '자색 가스 거성', c: ['#3a1450', '#b45ad9', '#f2c8ff'], atmo: '#e0a0ff', gas: true },
};

// ---------- 은하 ----------
export function generateGalaxy(seed = GALAXY_SEED) {
  const r = rng(seed);
  const systems = [];
  const N = SYS_NAMES.length;
  systems.push({ id: 'S0', i: 0, name: SYS_NAMES[0], pos: new THREE.Vector3(0, 0, 0) });
  let guard = 0;
  while (systems.length < N && guard++ < 20000) {
    // 기존 성계 근처(4.5~8 ly)에 성장시켜 연결성 보장, 바깥쪽 편향
    const base = systems[Math.floor(Math.pow(r.f(), 0.6) * systems.length)];
    const d = r.range(4.6, 7.9);
    const dir = r.dir(new THREE.Vector3());
    dir.y *= 0.28; dir.normalize();
    const p = base.pos.clone().addScaledVector(dir, d);
    if (p.length() > 62) continue;
    if (systems.some((s) => s.pos.distanceTo(p) < 4.2)) continue;
    systems.push({ id: 'S' + systems.length, i: systems.length, name: SYS_NAMES[systems.length], pos: p });
  }
  // 이웃 그래프 (8.5 ly 이내)
  for (const s of systems) s.links = systems.filter((o) => o !== s && o.pos.distanceTo(s.pos) <= 8.5).map((o) => o.id);
  const byId = Object.fromEntries(systems.map((s) => [s.id, s]));
  const hops = (from) => {
    const d = { [from]: 0 }; const q = [from];
    while (q.length) { const c = q.shift(); for (const n of byId[c].links) if (d[n] === undefined) { d[n] = d[c] + 1; q.push(n); } }
    return d;
  };
  // 세력 수도: 시작 성계(연합) + 서로 멀리 떨어진 두 성계
  const s0 = systems[0];
  const capFree = systems.filter((s) => s.pos.distanceTo(s0.pos) > 20 && s.pos.distanceTo(s0.pos) < 34).sort((a, b) => b.pos.distanceTo(s0.pos) - a.pos.distanceTo(s0.pos))[0] || systems[5];
  const capSyn = systems.filter((s) => s !== capFree && s.pos.distanceTo(s0.pos) > 18 && s.pos.distanceTo(s0.pos) < 36)
    .sort((a, b) => Math.min(b.pos.distanceTo(s0.pos), b.pos.distanceTo(capFree.pos)) - Math.min(a.pos.distanceTo(s0.pos), a.pos.distanceTo(capFree.pos)))[0] || systems[9];
  const caps = [['union', s0], ['free', capFree], ['syndicate', capSyn]];
  // 가장 가까운 수도까지의 거리 순위로 보안 등급 배분 (고보안 20% · 중보안 28% · 저보안 26% · 무법 26%)
  for (const s of systems) s._near = caps.map(([f, c]) => [f, s.pos.distanceTo(c.pos) * (f === 'union' ? 1.3 : 1)]).sort((a, b) => a[1] - b[1])[0];
  const order = systems.slice().sort((a, b) => a._near[1] - b._near[1]);
  order.forEach((s, i) => { const q = i / order.length; s._sec = q < 0.2 ? 3 : q < 0.48 ? 2 : q < 0.74 ? 1 : 0; });
  for (const s of systems) {
    const sr = rng(seed + s.i * 131);
    const [fac, d] = s._near;
    let sec = s._sec;
    if (fac === 'free' && sec === 3 && d > 3) sec = 2;
    s.faction = fac;
    if (sec === 0) s.faction = sr.chance(0.65) ? 'pirate' : 'indep';
    else if (sec === 1 && sr.chance(0.3)) s.faction = 'indep';
    s.sec = sec;
    s.capital = s === s0 || s === capFree || s === capSyn;
    s.star = sr.weighted(STAR_TYPES.map((t) => [t, t.w]));
    if (s.capital) { s.sec = 3; s.faction = s === s0 ? 'union' : s === capFree ? 'free' : 'syndicate'; }
    s.pop = s.faction === 'pirate' ? 0.4 : [0.2, 0.5, 0.8, 1][s.sec] + (s.capital ? 0.5 : 0);
    delete s._near; delete s._sec;
  }
  return { seed, systems, byId };
}

// ---------- 성계 상세 ----------
export function generateSystem(sys) {
  const r = rng(hashStr(sys.id) ^ GALAXY_SEED);
  const star = { radius: sys.star.r * r.range(0.85, 1.15), color: sys.star.color, lum: sys.star.lum };
  const planets = [], stations = [], fields = [];
  const np = r.int(3, 7);
  let orbit = star.radius * 4 + r.range(30000, 60000);
  const usedWords = new Set();
  const stName = (type) => {
    let w; do { w = r.pick(ST_WORDS); } while (usedWords.has(w) && usedWords.size < ST_WORDS.length);
    usedWords.add(w);
    return `${w} ${r.pick(ST_SUFFIX[type])}`;
  };
  for (let i = 0; i < np; i++) {
    const t = i / Math.max(1, np - 1);
    let kind;
    if (t < 0.25) kind = r.weighted([['lava', 3], ['desert', 3], ['rock', 2], ['toxic', 1]]);
    else if (t < 0.6) kind = r.weighted([['earth', sys.sec >= 2 ? 2 : 0.6], ['ocean', 2], ['desert', 1.5], ['rock', 1.5], ['toxic', 1.5], ['gas', 1]]);
    else kind = r.weighted([['gas', 3], ['gasb', 2], ['gasp', 1.5], ['ice', 2.5], ['rock', 0.8]]);
    const K = PLANET_KINDS[kind];
    const radius = K.gas ? r.range(9000, 16000) : r.range(2600, 6200);
    const ang = r.range(0, Math.PI * 2);
    const pos = new THREE.Vector3(Math.cos(ang) * orbit, r.range(-0.07, 0.07) * orbit, Math.sin(ang) * orbit);
    const pl = {
      id: `${sys.id}-p${i}`, name: `${sys.name} ${ROMAN[i]}`, kind, kindName: K.name, radius, pos,
      colors: K.c, land: K.land || null, atmo: K.atmo, gas: !!K.gas, seed: r.int(1, 99999),
      tilt: r.range(-0.4, 0.4), spin: r.range(0.004, 0.02) * (K.gas ? 1.6 : 1),
      ring: K.gas && r.chance(0.55) ? { inner: radius * r.range(1.35, 1.6), outer: radius * r.range(2.0, 2.6), color: r.pick(['#d9c3a0', '#c8d4e8', '#e0b0a0', '#b0a8d8']) } : null,
      moons: [],
    };
    if (K.gas) {
      const nm = r.int(0, 2);
      for (let m = 0; m < nm; m++) {
        const md = radius * r.range(3.2, 5.5);
        const ma = r.range(0, Math.PI * 2);
        const mk = r.pick(['rock', 'ice', 'desert', 'toxic']);
        pl.moons.push({
          id: `${pl.id}m${m}`, name: `${pl.name}-${String.fromCharCode(97 + m)}`, kind: mk, kindName: PLANET_KINDS[mk].name + ' (위성)',
          radius: r.range(1200, 2400), colors: PLANET_KINDS[mk].c, atmo: null, gas: false, seed: r.int(1, 99999), tilt: 0, spin: 0.01, ring: null,
          pos: pos.clone().add(new THREE.Vector3(Math.cos(ma) * md, r.range(-0.15, 0.15) * md, Math.sin(ma) * md)), moon: true,
        });
      }
    }
    planets.push(pl);
    orbit += r.range(55000, 110000) * (K.gas ? 1.3 : 1);
  }
  // 스테이션
  const typesFor = () => {
    if (sys.faction === 'pirate') return [['pirate', 4], ['mining', 1]];
    if (sys.sec === 0) return [['mining', 2], ['pirate', 1.5], ['tech', 1]];
    return [['trade', 2], ['mining', 2], ['industry', 2], ['tech', 1.2], ['military', sys.sec >= 2 ? 1.2 : 0.5], ['agri', 1.3]];
  };
  const nst = sys.faction === 'pirate' ? r.int(1, 2) : Math.min(planets.length, r.int(sys.sec >= 2 ? 2 : 1, sys.sec >= 2 ? 4 : 3) + (sys.capital ? 1 : 0));
  const hosts = planets.slice().sort(() => r.f() - 0.5).slice(0, nst);
  hosts.forEach((pl, k) => {
    let type = r.weighted(typesFor());
    if (k === 0 && sys.faction !== 'pirate') type = sys.capital ? (sys.faction === 'union' ? 'trade' : sys.faction === 'free' ? 'mining' : 'tech') : (type === 'pirate' ? 'mining' : type);
    if (k === 0 && sys.capital) type = 'trade';
    if (k === 1 && sys.capital) type = 'military';
    if (sys.id === 'S0' && k === 2) type = 'industry';
    const dir = r.dir(new THREE.Vector3()); dir.y *= 0.3; dir.normalize();
    const pos = pl.pos.clone().addScaledVector(dir, pl.radius * (pl.gas ? 1.25 : 1.35) + r.range(3500, 6000) + (pl.ring ? pl.ring.outer - pl.radius : 0));
    stations.push({
      id: `${sys.id}-st${k}`, name: stName(type), type, typeName: STATION_TYPES[type].name,
      faction: type === 'pirate' ? 'pirate' : sys.faction === 'pirate' ? 'indep' : sys.faction,
      pos, planet: pl.id, seed: r.int(1, 99999), design: r.int(0, 2),
      // 도킹 입구 방향 (행성 반대쪽)
      face: pos.clone().sub(pl.pos).normalize(),
      spin: r.range(0.05, 0.12) * (r.chance(0.5) ? 1 : -1),
    });
  });
  // 소행성대
  const nf = r.int(1, 2) + (sys.sec <= 1 ? 1 : 0);
  for (let f = 0; f < nf; f++) {
    let pos;
    const ringPl = planets.find((p) => p.ring && !fields.some((x) => x.planet === p.id));
    if (ringPl && r.chance(0.6)) {
      const a = r.range(0, Math.PI * 2);
      const rd = (ringPl.ring.inner + ringPl.ring.outer) / 2;
      pos = ringPl.pos.clone().add(new THREE.Vector3(Math.cos(a) * rd, 0, Math.sin(a) * rd));
      fields.push(makeField(sys, r, f, pos, ringPl.id));
      continue;
    }
    const ang = r.range(0, Math.PI * 2);
    const d = r.range(star.radius * 5, orbit * 0.9);
    pos = new THREE.Vector3(Math.cos(ang) * d, r.range(-6000, 6000), Math.sin(ang) * d);
    fields.push(makeField(sys, r, f, pos, null));
  }
  // 해적 성계의 은신처는 소행성대 속에
  if (sys.faction === 'pirate' && fields[0]) {
    const st = stations.find((s) => s.type === 'pirate');
    if (st) { st.pos = fields[0].pos.clone().add(new THREE.Vector3(0, fields[0].radius * 0.2, 0)); st.planet = null; st.face = new THREE.Vector3(0, 0, 1); }
  }
  const ad = r.dir(new THREE.Vector3()); ad.y *= 0.2; ad.normalize();
  const arrival = ad.multiplyScalar(star.radius * 4 + 25000);
  return { sys, star, planets, stations, fields, arrival, extent: orbit };
}

function makeField(sys, r, f, pos, planet) {
  const ores = sys.sec >= 3 ? [['iron', 5], ['titanium', 3], ['ice', 3], ['platinum', 0.5]]
    : sys.sec === 2 ? [['iron', 4], ['titanium', 4], ['ice', 2], ['platinum', 1.2], ['painite', 0.3]]
    : sys.sec === 1 ? [['titanium', 3], ['platinum', 2.5], ['painite', 1.5], ['ice', 1], ['voidcrystal', 0.3]]
    : [['platinum', 3], ['painite', 3], ['voidcrystal', 1.4], ['titanium', 1]];
  return {
    id: `${sys.id}-f${f}`, name: `${sys.name} 소행성대 ${String.fromCharCode(65 + f)}`, pos, planet,
    radius: r.range(3500, 5200), count: r.int(140, 210), seed: r.int(1, 99999), ores,
    rich: sys.sec <= 1 ? '풍부' : sys.sec === 2 ? '보통' : '빈약',
  };
}

// 하이퍼점프 경로 (도약 거리 제한, 다익스트라 — 최소 도약 수)
export function findRoute(gal, from, to, range) {
  if (from === to) return [];
  const dist = { [from]: 0 }, prev = {};
  const q = [from];
  while (q.length) {
    const c = q.shift();
    if (c === to) break;
    const cs = gal.byId[c];
    for (const s of gal.systems) {
      if (dist[s.id] !== undefined) continue;
      if (s.pos.distanceTo(cs.pos) <= range) { dist[s.id] = dist[c] + 1; prev[s.id] = c; q.push(s.id); }
    }
  }
  if (dist[to] === undefined) return null;
  const path = [];
  for (let c = to; c !== from; c = prev[c]) path.unshift(c);
  return path;
}
