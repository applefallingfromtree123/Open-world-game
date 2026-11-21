// ============================================================
//  STARDRIFT — 게임 데이터 (함선 · 무기 · 모듈 · 상품 · 세력)
// ============================================================

export const GAME = 'STARDRIFT';
export const START_CREDITS = 8000;
export const SAVE_VERSION = 2;

// ---------- 세력 ----------
export const FACTIONS = {
  union:     { name: '태양 연합',        short: '연합',     color: '#5cc8ff', desc: '법과 질서를 중시하는 거대 연방. 보안이 철저하고 밀수에 엄격하다.' },
  free:      { name: '자유 행성 동맹',   short: '동맹',     color: '#7dff9a', desc: '개척자와 광부들의 느슨한 동맹. 자유로운 무역과 채굴의 천국.' },
  syndicate: { name: '코어 신디케이트', short: '신디케이트', color: '#ffb347', desc: '기업들이 지배하는 세력. 돈이면 무엇이든 가능하다.' },
  pirate:    { name: '붉은 송곳니',      short: '해적',     color: '#ff4057', desc: '변방을 떠도는 무법자 함대. 적으로 두면 무섭지만 친구가 되면 든든하다.' },
  indep:     { name: '무소속',           short: '무소속',   color: '#c9cbd6', desc: '어느 세력에도 속하지 않은 독립 정착지.' },
};
export const LAWFUL = ['union', 'free', 'syndicate', 'indep'];

export const SEC_LEVELS = [
  { name: '무법지대', color: '#ff3355', police: 0, pirates: 1.0 },
  { name: '저보안',   color: '#ff9a3c', police: 0.35, pirates: 0.6 },
  { name: '중보안',   color: '#ffe066', police: 0.7, pirates: 0.3 },
  { name: '고보안',   color: '#5dff9d', police: 1.0, pirates: 0.1 },
];

// ---------- 상품 ----------
export const GOODS = {
  food:        { name: '합성 식량',     base: 45,   cat: '생활' },
  water:       { name: '정제수',        base: 28,   cat: '생활' },
  medicine:    { name: '의약품',        base: 210,  cat: '생활' },
  fuelcells:   { name: '연료 전지',     base: 95,   cat: '산업' },
  alloys:      { name: '고강도 합금',   base: 240,  cat: '산업' },
  machinery:   { name: '산업 기계',     base: 480,  cat: '산업' },
  electronics: { name: '전자 부품',     base: 360,  cat: '기술' },
  ai_cores:    { name: 'AI 코어',       base: 1450, cat: '기술' },
  weapons:     { name: '무기류',        base: 690,  cat: '군수', illegalIn: ['union'] },
  luxury:      { name: '사치품',        base: 980,  cat: '사치' },
  narcotics:   { name: '네뷸라 더스트', base: 1250, cat: '불법', illegal: true },
  slaves:      { name: '밀입국자',      base: 1600, cat: '불법', illegal: true },
  iron:        { name: '철광석',        base: 32,   cat: '광물', ore: true, color: '#9a8f86' },
  titanium:    { name: '티타늄',        base: 90,   cat: '광물', ore: true, color: '#9fc4dc' },
  ice:         { name: '수빙',          base: 22,   cat: '광물', ore: true, color: '#c8f0ff' },
  platinum:    { name: '백금',          base: 460,  cat: '광물', ore: true, color: '#e8e2d0' },
  painite:     { name: '페인석',        base: 820,  cat: '광물', ore: true, color: '#ff4f7a' },
  voidcrystal: { name: '공허 수정',     base: 1900, cat: '광물', ore: true, color: '#b07dff' },
  scrap:       { name: '고철',          base: 40,   cat: '회수' },
  blackbox:    { name: '블랙박스',      base: 1100, cat: '회수' },
  artifact:    { name: '고대 유물',     base: 5200, cat: '회수' },
};
export const GOOD_IDS = Object.keys(GOODS);

// 스테이션 유형: produces 싸게 팔고, consumes 비싸게 산다
export const STATION_TYPES = {
  trade:    { name: '무역 허브',     icon: '◆', produces: ['luxury', 'food', 'medicine'], consumes: ['electronics', 'machinery', 'platinum', 'painite'], services: ['shipyard', 'outfit', 'missions', 'data'] },
  mining:   { name: '채굴 콜로니',   icon: '⛏', produces: ['iron', 'titanium', 'fuelcells'], consumes: ['food', 'water', 'machinery', 'medicine'], services: ['outfit', 'missions'] },
  industry: { name: '산업 단지',     icon: '⚙', produces: ['alloys', 'machinery', 'fuelcells'], consumes: ['iron', 'titanium', 'ice', 'scrap', 'platinum'], services: ['shipyard', 'outfit', 'missions', 'kits'] },
  tech:     { name: '연구 기지',     icon: '✚', produces: ['electronics', 'ai_cores', 'medicine'], consumes: ['voidcrystal', 'painite', 'alloys', 'blackbox', 'artifact'], services: ['outfit', 'missions', 'data'] },
  military: { name: '군사 요새',     icon: '✪', produces: ['weapons'], consumes: ['food', 'alloys', 'electronics', 'fuelcells'], services: ['shipyard', 'outfit', 'missions', 'mercs'] },
  agri:     { name: '농업 위성',     icon: '❀', produces: ['food', 'water'], consumes: ['machinery', 'medicine', 'electronics', 'ice'], services: ['missions'] },
  pirate:   { name: '해적 소굴',     icon: '☠', produces: ['narcotics', 'slaves', 'weapons'], consumes: ['luxury', 'ai_cores', 'medicine', 'weapons', 'artifact'], services: ['shipyard', 'outfit', 'missions', 'mercs', 'black'] },
};

// ---------- 무기 ----------
// 크기(1~3)에 따라 피해·가격·에너지 배수
export const SIZE_MUL = [0, 1, 1.85, 3.2];
export const SIZE_NAME = ['', 'S', 'M', 'L'];
export const WEAPONS = {
  pulse:   { name: '펄스 레이저',     kind: 'bolt', dmg: 11, rof: 5.5, speed: 1900, range: 1900, energy: 1.6, color: '#46f2ff', shield: 1.35, hull: 0.75, price: 2400, spread: 0.002 },
  cannon:  { name: '멀티캐논',        kind: 'bolt', dmg: 6.5, rof: 13,  speed: 1450, range: 1600, energy: 0.35, color: '#ffd166', shield: 0.65, hull: 1.45, price: 3600, spread: 0.012 },
  plasma:  { name: '플라즈마 가속기', kind: 'bolt', dmg: 62, rof: 1.3, speed: 800,  range: 2000, energy: 11, color: '#8dff5a', shield: 1.1, hull: 1.2, price: 14000, spread: 0, big: true },
  rail:    { name: '레일건',          kind: 'rail', dmg: 105, rof: 0.75, speed: 0,  range: 2800, energy: 18, color: '#c79bff', shield: 1.0, hull: 1.1, price: 26000 },
  missile: { name: '유도 미사일',     kind: 'missile', dmg: 150, rof: 0.9, speed: 520, range: 4500, energy: 0, ammo: 10, color: '#ff8a3c', shield: 0.8, hull: 1.4, price: 18000, secondary: true },
  mining:  { name: '채굴 레이저',     kind: 'beam', dmg: 6, rof: 1, speed: 0, range: 900, energy: 3.2, color: '#ff6a3d', shield: 0.5, hull: 0.5, price: 1800, mine: 1 },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
export const wkey = (id, size) => id + ':' + size;
export function parseW(k) { if (!k) return null; const [id, s] = k.split(':'); return { id, size: +s, w: WEAPONS[id] }; }
export function weaponPrice(k) { const p = parseW(k); return p ? Math.round(p.w.price * Math.pow(SIZE_MUL[p.size], 1.6)) : 0; }
export function weaponName(k) { const p = parseW(k); return p ? `${p.w.name} ${SIZE_NAME[p.size]}` : '— 비어 있음 —'; }

// ---------- 코어 모듈 (등급 1~5) ----------
export const CORE = {
  shield:   { name: '쉴드 발생기',   desc: '쉴드 용량과 재충전 속도', mul: [0, 0.7, 1, 1.3, 1.65, 2.1] },
  thruster: { name: '추진기',        desc: '최고 속도와 가속도',       mul: [0, 0.88, 1, 1.1, 1.2, 1.32] },
  power:    { name: '동력로',        desc: '에너지 용량과 회복',       mul: [0, 0.75, 1, 1.25, 1.55, 1.9] },
  hyper:    { name: '하이퍼드라이브', desc: '도약 거리',               mul: [0, 0.75, 1, 1.25, 1.5, 1.85] },
  hull:     { name: '장갑 합금',     desc: '선체 내구도',              mul: [0, 0.85, 1, 1.25, 1.5, 1.8] },
};
export const CORE_IDS = Object.keys(CORE);
export const corePrice = (ship, id, g) => g <= 1 ? 0 : Math.round(SHIPS[ship].coreCost * Math.pow(g - 1, 2.1) * (id === 'hyper' ? 1.2 : 1));

// ---------- 옵션 모듈 ----------
export const OPTIONALS = {
  cargo:   { name: '화물칸 확장',     desc: '화물 용량 +{rack}t', price: 1500 },
  fuel:    { name: '보조 연료 탱크',  desc: '연료 +{fuel}t', price: 2500 },
  scoop:   { name: '연료 스쿠프',     desc: '항성 근처에서 연료 자동 보급', price: 9000, unique: true },
  armor:   { name: '복합 장갑판',     desc: '선체 +20%', price: 6000 },
  booster: { name: '쉴드 부스터',     desc: '쉴드 +18%', price: 7000 },
  scanner: { name: '정밀 스캐너',     desc: '행성 탐사 데이터 가치 ×2, 스캔 속도 ×2', price: 12000, unique: true },
  refinery:{ name: '광물 정제기',     desc: '채굴 수율 +60%', price: 15000, unique: true },
  ecm:     { name: 'ECM 교란기',      desc: '유도 미사일 회피 (자동)', price: 11000, unique: true },
};

// ---------- 함선 ----------
// 속도 m/s, 회전 rad/s. hard: 무기 슬롯 크기 배열, opt: 옵션 슬롯 수
export const SHIPS = {
  sparrow: {
    name: '스패로 Mk.II', cls: '경전투정', maker: '헬리오스 조선', price: 0, coreCost: 900,
    hull: 200, shield: 140, energy: 60, regen: 9, speed: 230, boost: 400, accel: 120,
    pitch: 1.55, yaw: 1.1, roll: 2.6, size: 13, hard: [1, 1], opt: 3, rack: 4, fuel: 8, jump: 9, mass: 1,
    paint: ['#d8dde6', '#ff7a2f'], desc: '모든 신참 파일럿의 첫 번째 날개. 저렴하고, 튼튼하고, 수리하기 쉽다.',
  },
  kestrel: {
    name: '케스트렐', cls: '요격기', maker: '아르테미스 동역학', price: 48000, coreCost: 2600,
    hull: 190, shield: 190, energy: 80, regen: 14, speed: 330, boost: 560, accel: 210,
    pitch: 2.1, yaw: 1.5, roll: 3.4, size: 14, hard: [1, 1, 1], opt: 2, rack: 2, fuel: 8, jump: 11, mass: 0.8,
    paint: ['#20242c', '#2fd4ff'], desc: '빠르고 날카롭다. 추격전과 현상금 사냥의 정석.',
  },
  prospector: {
    name: '프로스펙터', cls: '채굴선', maker: '딥록 중공업', price: 62000, coreCost: 2400,
    hull: 340, shield: 220, energy: 90, regen: 13, speed: 200, boost: 330, accel: 95,
    pitch: 1.2, yaw: 0.9, roll: 1.8, size: 22, hard: [1, 1, 2], opt: 5, rack: 12, fuel: 12, jump: 10, mass: 1.6,
    paint: ['#f2c230', '#2a2a2a'], desc: '중형 채굴 레이저 슬롯과 넉넉한 화물칸. 광부의 꿈.',
    loadout: ['pulse:1', 'mining:1', 'mining:2'],
  },
  atlas: {
    name: '아틀라스', cls: '화물선', maker: '헬리오스 조선', price: 95000, coreCost: 3200,
    hull: 520, shield: 260, energy: 80, regen: 10, speed: 180, boost: 290, accel: 70,
    pitch: 0.85, yaw: 0.65, roll: 1.3, size: 34, hard: [1, 1], opt: 7, rack: 28, fuel: 20, jump: 12, mass: 3,
    paint: ['#c9d1d9', '#3a7bd5'], desc: '이 은하의 물류는 아틀라스가 움직인다. 무역로의 왕.',
  },
  mantis: {
    name: '맨티스', cls: '중전투기', maker: '아르테미스 동역학', price: 135000, coreCost: 5200,
    hull: 460, shield: 420, energy: 120, regen: 19, speed: 270, boost: 450, accel: 150,
    pitch: 1.65, yaw: 1.2, roll: 2.6, size: 19, hard: [2, 2, 1, 1], opt: 3, rack: 4, fuel: 10, jump: 10, mass: 1.4,
    paint: ['#3b4a2f', '#d6ff3f'], desc: '네 개의 하드포인트에서 쏟아지는 화력. 개싸움의 지배자.',
  },
  nomad: {
    name: '노매드', cls: '탐사선', maker: '스타게이저 연구소', price: 165000, coreCost: 4800,
    hull: 300, shield: 280, energy: 110, regen: 16, speed: 290, boost: 470, accel: 140,
    pitch: 1.4, yaw: 1.0, roll: 2.2, size: 20, hard: [1, 1], opt: 6, rack: 6, fuel: 32, jump: 22, mass: 1.2,
    paint: ['#f4f6f8', '#7a5cff'], desc: '긴 도약 거리와 거대한 연료 탱크. 지도 바깥을 꿈꾸는 자를 위해.',
    loadout: ['pulse:1', 'pulse:1'], opts: ['scanner', 'scoop'],
  },
  vanguard: {
    name: '뱅가드', cls: '건쉽', maker: '타이탄 무기창', price: 420000, coreCost: 12000,
    hull: 1000, shield: 820, energy: 170, regen: 24, speed: 220, boost: 360, accel: 95,
    pitch: 1.0, yaw: 0.78, roll: 1.6, size: 32, hard: [3, 2, 2, 1, 1], opt: 5, rack: 8, fuel: 16, jump: 10, mass: 2.6,
    paint: ['#2b2f38', '#ff3b3b'], desc: '날아다니는 요새. 대형 하드포인트가 함선을 갈아버린다.',
  },
  leviathan: {
    name: '리바이어던', cls: '코르벳', maker: '타이탄 무기창', price: 1350000, coreCost: 34000,
    hull: 2600, shield: 2000, energy: 260, regen: 34, speed: 190, boost: 300, accel: 60,
    pitch: 0.7, yaw: 0.55, roll: 1.0, size: 58, hard: [3, 3, 2, 2, 2, 1], opt: 8, rack: 20, fuel: 28, jump: 13, mass: 6,
    paint: ['#1d2230', '#ffcc33'], desc: '함대의 기함. 이 함선이 성계에 도착하면 해적들은 도망친다.',
  },
};
export const SHIP_IDS = Object.keys(SHIPS);

export function defaultLoadout(id) {
  const s = SHIPS[id];
  const hard = s.loadout ? s.loadout.slice() : s.hard.map((sz, i) => (i < 2 ? wkey(i === 0 ? 'pulse' : 'cannon', sz) : null));
  const opt = new Array(s.opt).fill(null);
  (s.opts || []).forEach((o, i) => { opt[i] = o; });
  // 빈 옵션 슬롯 하나는 화물칸으로
  const free = opt.indexOf(null);
  if (free >= 0) opt[free] = 'cargo';
  return { hard, core: { shield: 2, thruster: 2, power: 2, hyper: 2, hull: 2 }, opt };
}

// 장착 상태를 반영한 최종 성능
export function shipStats(id, lo) {
  const s = SHIPS[id];
  const c = lo.core;
  const cnt = (k) => lo.opt.filter((o) => o === k).length;
  const hull = s.hull * CORE.hull.mul[c.hull] * (1 + 0.2 * cnt('armor'));
  const shield = s.shield * CORE.shield.mul[c.shield] * (1 + 0.18 * cnt('booster'));
  const th = CORE.thruster.mul[c.thruster];
  const pw = CORE.power.mul[c.power];
  const cargo = cnt('cargo') * s.rack + Math.round(s.rack * 0.5);
  const fuel = s.fuel + cnt('fuel') * Math.max(2, Math.round(s.fuel * 0.5));
  return {
    hull, shield, shieldRegen: shield * 0.035 * Math.sqrt(CORE.shield.mul[c.shield]),
    energy: s.energy * pw, regen: s.regen * pw,
    speed: s.speed * th, boost: s.boost * th, accel: s.accel * th,
    pitch: s.pitch * (0.9 + th * 0.1), yaw: s.yaw * (0.9 + th * 0.1), roll: s.roll,
    cargo, fuel, jump: s.jump * CORE.hyper.mul[c.hyper],
    scoop: cnt('scoop') > 0, scanner: cnt('scanner') > 0, refinery: cnt('refinery') > 0, ecm: cnt('ecm') > 0,
  };
}
export function loadoutValue(id, lo) {
  let v = SHIPS[id].price;
  for (const k of lo.hard) v += weaponPrice(k);
  for (const c of CORE_IDS) v += corePrice(id, c, lo.core[c]);
  for (const o of lo.opt) if (o) v += OPTIONALS[o].price;
  return v;
}

// ---------- NPC 역할 ----------
export const ROLES = {
  trader:  { name: '상선',        ships: [['atlas', 5], ['prospector', 1], ['sparrow', 2]] },
  miner:   { name: '채굴선',      ships: [['prospector', 5], ['sparrow', 1]] },
  pirate:  { name: '해적',        ships: [['sparrow', 3], ['kestrel', 3], ['mantis', 2], ['vanguard', 0.4]] },
  police:  { name: '보안군',      ships: [['kestrel', 3], ['mantis', 2], ['vanguard', 0.5]] },
  hunter:  { name: '현상금 사냥꾼', ships: [['kestrel', 2], ['mantis', 2]] },
  patrol:  { name: '순찰대',      ships: [['mantis', 2], ['kestrel', 1]] },
  wing:    { name: '용병 윙맨',   ships: [['mantis', 1]] },
  explorer:{ name: '탐험가',      ships: [['nomad', 1]] },
};

export const NPC_FIRST = ['레이', '카스', '미라', '오린', '제드', '나나', '빅터', '세라', '토르', '이바', '루카', '하나', '도윤', '서진', '카이', '유나', '닉스', '벡', '로와', '진'];
export const NPC_LAST = ['스톰', '블랙', '크로우', '발렌', '하트', '레인', '실버', '녹스', '보스', '아이언', '코어', '드레이크', '팡', '울프', '노바'];

export const RANKS = [
  { name: '무명', at: 0 }, { name: '견습', at: 2000 }, { name: '파일럿', at: 15000 }, { name: '베테랑', at: 60000 },
  { name: '에이스', at: 200000 }, { name: '전설', at: 800000 }, { name: '엘리트', at: 3000000 },
];

export const OUTPOST_KIT_PRICE = 140000;
export const OUTPOST_MODULES = {
  refinery: { name: '자동 정제소', desc: '주변 자원을 정제해 시간당 수익 발생', price: 60000, max: 3 },
  hangar:   { name: '격납고 확장', desc: '함선 보관 슬롯 +2', price: 35000, max: 3 },
  turret:   { name: '방어 포탑',   desc: '기지에 접근하는 적대 함선 자동 공격', price: 45000, max: 4 },
  market:   { name: '교역소',     desc: 'NPC 상선이 방문해 화물을 사고판다 (판매가 +10%)', price: 80000, max: 1 },
};
