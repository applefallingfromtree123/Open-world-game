// 은하 생성 — 시드 기반 결정적 생성
import { mulberry32 } from '../public/shared/physics.js';
import { GALAXY_RADIUS, STATION_TYPES } from '../public/shared/data.js';

const SYSTEM_NAMES = [
  '네오 서울', '카우룽 프라임', '시부야 드리프트', '크롬 헤이븐', '네온 어비스', '고스트 서킷',
  '데이터스트림', '블랙 로터스', '아이언 베일', '보이드 마켓', '신스 에덴', '오메가 스프롤',
  '레드 라인', '글리치 필드', '사이버 문', '할로우 코어',
];
const STATION_SUFFIX = ['오비탈', '타워', '아크', '넥서스', '포트', '스파이어', '돔', '허브'];
const STAR_COLORS = ['#ffcc55', '#ff6644', '#66ccff', '#ff55dd', '#aaffee', '#ffffff', '#ff9933', '#9f7bff'];
const PLANET_KINDS = [
  { kind: 'lava', c1: '#ff5522', c2: '#551100' },
  { kind: 'ice', c1: '#bff4ff', c2: '#2a5a8a' },
  { kind: 'gas', c1: '#ff9ad5', c2: '#5a1a6a' },
  { kind: 'toxic', c1: '#b6ff3c', c2: '#1f4a10' },
  { kind: 'ocean', c1: '#34b4ff', c2: '#0a2250' },
  { kind: 'desert', c1: '#ffcf7a', c2: '#6a3a10' },
  { kind: 'city', c1: '#ffe600', c2: '#1a1a40' },
  { kind: 'dead', c1: '#9a9aa8', c2: '#2a2a33' },
];
const GREEK = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export function generateWorld(seed = 20771) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const systems = [];
  const bodies = {};   // id -> planet/station
  const stations = [];
  const planets = [];
  const belts = [];
  const asteroids = [];
  const beacons = [];

  // --- 성계 배치 ---
  const N = SYSTEM_NAMES.length;
  let tries = 0;
  while (systems.length < N && tries < 5000) {
    tries++;
    let x, y;
    if (systems.length === 0) { x = 0; y = 0; }
    else {
      const ang = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * GALAXY_RADIUS * 0.92;
      x = Math.cos(ang) * d; y = Math.sin(ang) * d;
    }
    if (systems.some((s) => Math.hypot(s.x - x, s.y - y) < 150000)) continue;
    const i = systems.length;
    const dn = Math.hypot(x, y) / GALAXY_RADIUS;
    let sec = i === 0 ? 1.0 : Math.max(-0.4, Math.min(1, 1.12 - dn * 1.45 + R(-0.18, 0.18)));
    sec = Math.round(sec * 10) / 10;
    systems.push({
      id: 's' + i, name: SYSTEM_NAMES[i], x, y, sec,
      starColor: pick(STAR_COLORS), starR: R(1800, 3400),
      nebula: pick(['#ff2bd6', '#00f0ff', '#7a2bff', '#ff5a1f', '#00ff9d', '#2b6bff']),
      planets: [], stations: [], belts: [], beacon: null,
    });
  }
  // 하이섹 몇 개 보장 (시작 지역 근처)
  systems.slice().sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)).slice(0, 4).forEach((s) => { if (s.sec < 0.6) s.sec = 0.7; });
  // 널섹 몇 개 보장
  systems.slice().sort((a, b) => Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y)).slice(0, 4).forEach((s) => { if (s.sec > 0) s.sec = -0.1 - Math.round(rnd() * 3) / 10; });

  let stationCount = 0;
  let asteroidId = 0;
  for (const sys of systems) {
    const np = RI(2, 5);
    let orbit = R(9000, 13000);
    for (let p = 0; p < np; p++) {
      const pk = pick(PLANET_KINDS);
      const planet = {
        id: `${sys.id}p${p}`, sys: sys.id, name: `${sys.name} ${GREEK[p]}`,
        kind: pk.kind, c1: pk.c1, c2: pk.c2, r: R(700, 1900), ring: rnd() < 0.3,
        cx: sys.x, cy: sys.y, orbitR: orbit, period: R(2400, 7200), phase: R(0, Math.PI * 2),
      };
      orbit += R(7000, 13000);
      bodies[planet.id] = planet;
      planets.push(planet);
      sys.planets.push(planet.id);

      // 스테이션
      const want = p === 0 || rnd() < 0.45;
      if (want) {
        let type;
        if (sys.sec <= 0) type = rnd() < 0.55 ? 'pirate' : pick(['research', 'military', 'mining']);
        else if (sys.sec < 0.5) type = pick(['mining', 'industry', 'research', 'military', 'pirate']);
        else type = pick(['hub', 'hub', 'mining', 'industry', 'research', 'military']);
        if (sys.id === 's0' && p === 0) type = 'hub';
        const st = {
          id: 'st' + stationCount++, sys: sys.id, type,
          name: `${sys.name} ${pick(STATION_SUFFIX)}${sys.stations.length ? ' ' + (sys.stations.length + 1) : ''}`,
          parent: planet.id, orbitR: planet.r + R(1400, 2200), period: R(600, 1200), phase: R(0, Math.PI * 2),
          color: type === 'pirate' ? '#ff2255' : pick(['#00f0ff', '#ff2bd6', '#ffe600', '#7dff5a', '#b18cff']),
        };
        bodies[st.id] = st;
        stations.push(st);
        sys.stations.push(st.id);
      }
    }
    // 소행성대
    const nb = sys.sec <= 0 ? RI(2, 3) : RI(1, 2);
    for (let b = 0; b < nb; b++) {
      const ang = R(0, Math.PI * 2), d = R(14000, orbit + 4000);
      const bx = sys.x + Math.cos(ang) * d, by = sys.y + Math.sin(ang) * d;
      const belt = { id: `${sys.id}b${b}`, sys: sys.id, x: bx, y: by, r: R(2500, 4200), name: `${sys.name} 소행성대 ${b + 1}` };
      const ores = sys.sec >= 0.7 ? ['ferrite', 'ferrite', 'titanite']
        : sys.sec >= 0.4 ? ['ferrite', 'titanite', 'titanite', 'neonium']
        : sys.sec > 0 ? ['titanite', 'neonium', 'neonium', 'voidstone']
        : ['neonium', 'voidstone', 'voidstone', 'quantum'];
      const count = RI(28, 42);
      for (let k = 0; k < count; k++) {
        const aa = R(0, Math.PI * 2), dd = Math.sqrt(rnd()) * belt.r;
        const ore = pick(ores);
        const r = R(50, 150);
        asteroids.push({ id: asteroidId++, x: bx + Math.cos(aa) * dd, y: by + Math.sin(aa) * dd, r: Math.round(r), ore, max: Math.round(r * 1.1), belt: belt.id, rot: R(-0.4, 0.4), seed: RI(0, 9999) });
      }
      belts.push(belt);
      sys.belts.push(belt.id);
    }
    // 널섹 주권 비콘
    if (sys.sec < 0.3) {
      const ang = R(0, Math.PI * 2);
      const b = { id: 'bc' + sys.id, sys: sys.id, name: `${sys.name} 주권 비콘`, x: sys.x + Math.cos(ang) * 6000, y: sys.y + Math.sin(ang) * 6000 };
      beacons.push(b);
      sys.beacon = b.id;
    }
  }

  return { seed, systems, planets, stations, belts, asteroids, beacons, bodies, stationTypes: STATION_TYPES };
}

// 클라이언트로 보낼 정적 데이터
export function worldForClient(w) {
  return {
    systems: w.systems.map(({ id, name, x, y, sec, starColor, starR, nebula, planets, stations, belts, beacon }) => ({ id, name, x, y, sec, starColor, starR, nebula, planets, stations, belts, beacon })),
    planets: w.planets,
    stations: w.stations,
    belts: w.belts,
    asteroids: w.asteroids.map((a) => [a.id, Math.round(a.x), Math.round(a.y), a.r, a.ore, a.seed]),
    beacons: w.beacons,
  };
}
