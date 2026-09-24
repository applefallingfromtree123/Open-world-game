// ============================================================
//  NEON//VOID — 공유 게임 데이터 (서버 + 클라이언트 공용)
// ============================================================

export const GAME_NAME = 'NEON//VOID';
export const TICK_RATE = 20;
export const AOI_RADIUS = 7000;          // 이 반경 안의 개체만 클라이언트에 전송
export const GALAXY_RADIUS = 650000;     // 은하 반경 (게임 유닛)
export const SYSTEM_RADIUS = 70000;      // 성계 영향권 반경
export const START_CREDITS = 5000;
export const CLAN_CREATE_COST = 25000;
export const MAX_MISSIONS = 5;
export const DOCK_RANGE = 700;
export const INTERACT_RANGE = 320;
export const LOOT_PICKUP_RANGE = 120;
export const SCAN_RANGE = 45000;
export const SCAN_COOLDOWN = 12;

// ---------- 무기 ----------
export const WEAPONS = {
  pulse:   { name: '펄스 레이저',   dmg: 9,  cd: 0.20, speed: 1500, life: 0.85, energy: 3,  color: '#00f0ff', size: 3, spread: 0.02 },
  blaster: { name: '플라즈마 블래스터', dmg: 16, cd: 0.28, speed: 1250, life: 0.95, energy: 5,  color: '#ff2bd6', size: 4, spread: 0.03 },
  scatter: { name: '스캐터 캐논',   dmg: 7,  cd: 0.55, speed: 1300, life: 0.6,  energy: 8,  color: '#ffe600', size: 3, spread: 0.18, count: 5 },
  railgun: { name: '레일건',        dmg: 55, cd: 1.10, speed: 3200, life: 0.75, energy: 16, color: '#7dff5a', size: 5, spread: 0.0 },
  missile: { name: '스웜 미사일',   dmg: 60, cd: 2.40, speed: 650,  life: 4.5,  energy: 12, color: '#ff8a00', size: 6, spread: 0.2, homing: 3.2 },
  // NPC 전용
  npc_pulse:   { name: '해적 레이저', dmg: 6,  cd: 0.45, speed: 1200, life: 0.9, energy: 0, color: '#ff3355', size: 3, spread: 0.08 },
  npc_blaster: { name: '해적 블래스터', dmg: 13, cd: 0.50, speed: 1200, life: 1.0, energy: 0, color: '#ff3355', size: 4, spread: 0.06 },
  npc_rail:    { name: '신디케이트 레일', dmg: 38, cd: 1.6, speed: 2600, life: 0.9, energy: 0, color: '#ff5a1f', size: 5, spread: 0.03 },
  npc_missile: { name: '카이주 미사일', dmg: 45, cd: 2.2, speed: 600, life: 5, energy: 0, color: '#ff5a1f', size: 6, spread: 0.4, homing: 2.6 },
};

// ---------- 우주선 기종 ----------
// hardpoints: [무기, [[x,y] 발사 위치...]]
export const SHIPS = {
  shuttle: {
    name: 'NX-1 글리치', cls: '셔틀', tier: 0, price: 0,
    hull: 110, shield: 60, energy: 100, energyRegen: 14, shieldRegen: 4,
    accel: 300, maxSpeed: 430, turn: 3.4, cargo: 25, radius: 16,
    warpSpeed: 5200, warpCharge: 3.0, mining: 1.5, miningRange: 550,
    hardpoints: [['pulse', [[14, 0]]]],
    color: '#00f0ff', shape: 'shuttle',
    desc: '모든 파일럿에게 무료로 지급되는 기본 셔틀. 느리지만 믿음직하다.'
  },
  razor: {
    name: 'RZ-7 레이저와이어', cls: '인터셉터', tier: 1, price: 14000,
    hull: 130, shield: 110, energy: 140, energyRegen: 22, shieldRegen: 7,
    accel: 520, maxSpeed: 720, turn: 4.6, cargo: 15, radius: 15,
    warpSpeed: 9500, warpCharge: 1.6, mining: 0.5, miningRange: 450,
    hardpoints: [['pulse', [[12, -7], [12, 7]]]],
    color: '#ff2bd6', shape: 'interceptor',
    desc: '은하에서 가장 빠른 선체. 워프 충전이 짧아 탐험가와 추격자에게 인기.'
  },
  drill: {
    name: 'DB-3 드릴비트', cls: '채굴선', tier: 1, price: 16000,
    hull: 220, shield: 90, energy: 140, energyRegen: 16, shieldRegen: 5,
    accel: 230, maxSpeed: 360, turn: 2.6, cargo: 90, radius: 22,
    warpSpeed: 5000, warpCharge: 3.5, mining: 4.0, miningRange: 700,
    hardpoints: [['pulse', [[18, 0]]]],
    color: '#ffe600', shape: 'miner',
    desc: '강화 채굴 레이저 탑재. 초보 광부의 첫 번째 투자.'
  },
  mule: {
    name: 'MU-9 뮬', cls: '화물선', tier: 2, price: 32000,
    hull: 420, shield: 160, energy: 160, energyRegen: 16, shieldRegen: 6,
    accel: 180, maxSpeed: 330, turn: 2.0, cargo: 320, radius: 30,
    warpSpeed: 6000, warpCharge: 4.0, mining: 0.8, miningRange: 500,
    hardpoints: [['pulse', [[24, 0]]]],
    color: '#8affc1', shape: 'hauler',
    desc: '거대한 화물칸. 무역로를 따라 부를 쌓아라. 단, 해적을 조심할 것.'
  },
  katana: {
    name: 'KT-4 카타나', cls: '전투기', tier: 2, price: 48000,
    hull: 300, shield: 240, energy: 200, energyRegen: 28, shieldRegen: 9,
    accel: 430, maxSpeed: 600, turn: 4.0, cargo: 20, radius: 18,
    warpSpeed: 7500, warpCharge: 2.4, mining: 0.5, miningRange: 450,
    hardpoints: [['blaster', [[14, -9], [14, 9]]], ['pulse', [[18, 0]]]],
    color: '#ff3b6b', shape: 'fighter',
    desc: '근접 격투를 위해 설계된 사이버 사무라이의 칼날.'
  },
  phantom: {
    name: 'PH-0 팬텀', cls: '봉쇄돌파선', tier: 3, price: 95000,
    hull: 320, shield: 280, energy: 220, energyRegen: 26, shieldRegen: 10,
    accel: 400, maxSpeed: 640, turn: 3.6, cargo: 140, radius: 20,
    warpSpeed: 12000, warpCharge: 1.2, mining: 0.6, miningRange: 450,
    hardpoints: [['scatter', [[16, 0]]]],
    color: '#b18cff', shape: 'runner',
    desc: '밀수업자의 꿈. 초고속 워프와 넉넉한 화물칸으로 봉쇄를 뚫는다.'
  },
  ronin: {
    name: 'RN-6 로닌', cls: '프리깃', tier: 3, price: 110000,
    hull: 650, shield: 420, energy: 260, energyRegen: 30, shieldRegen: 11,
    accel: 330, maxSpeed: 520, turn: 3.0, cargo: 45, radius: 26,
    warpSpeed: 7000, warpCharge: 2.8, mining: 1.0, miningRange: 500,
    hardpoints: [['blaster', [[18, -12], [18, 12]]], ['missile', [[0, 0]]]],
    color: '#ff8a00', shape: 'frigate',
    desc: '용병들이 사랑하는 만능 전투함. 유도 미사일 포드 탑재.'
  },
  deepcore: {
    name: 'DC-X 딥코어', cls: '대형 채굴선', tier: 3, price: 160000,
    hull: 900, shield: 380, energy: 260, energyRegen: 22, shieldRegen: 8,
    accel: 170, maxSpeed: 300, turn: 1.7, cargo: 260, radius: 34,
    warpSpeed: 5500, warpCharge: 4.0, mining: 9.0, miningRange: 900,
    hardpoints: [['scatter', [[26, 0]]]],
    color: '#ffd000', shape: 'exhumer',
    desc: '소행성을 통째로 삼키는 산업용 괴물. 널섹 광맥을 노려라.'
  },
  oni: {
    name: 'ON-8 오니', cls: '구축함', tier: 4, price: 220000,
    hull: 1100, shield: 700, energy: 320, energyRegen: 34, shieldRegen: 13,
    accel: 260, maxSpeed: 450, turn: 2.4, cargo: 60, radius: 32,
    warpSpeed: 6800, warpCharge: 3.2, mining: 1.0, miningRange: 500,
    hardpoints: [['railgun', [[30, -10], [30, 10]]], ['pulse', [[20, -16], [20, 16]]]],
    color: '#7dff5a', shape: 'destroyer',
    desc: '쌍열 레일건을 장착한 악마. 적 함선을 한 방에 꿰뚫는다.'
  },
  leviathan: {
    name: 'LV-X 리바이어던', cls: '순양함', tier: 5, price: 480000,
    hull: 2200, shield: 1400, energy: 480, energyRegen: 46, shieldRegen: 18,
    accel: 200, maxSpeed: 400, turn: 1.8, cargo: 120, radius: 44,
    warpSpeed: 6500, warpCharge: 4.5, mining: 1.2, miningRange: 600,
    hardpoints: [['railgun', [[40, 0]]], ['blaster', [[24, -22], [24, 22]]], ['missile', [[-10, -18], [-10, 18]]]],
    color: '#00ffa3', shape: 'cruiser',
    desc: '클랜 함대의 기함. 소유만으로도 존경받는 전설의 순양함.'
  },
};
export const SHIP_ORDER = ['shuttle', 'razor', 'drill', 'mule', 'katana', 'phantom', 'ronin', 'deepcore', 'oni', 'leviathan'];

// ---------- NPC ----------
export const NPCS = {
  drone:    { name: '스캐브 드론', hull: 70, shield: 0, accel: 360, maxSpeed: 380, turn: 3.2, radius: 13, weapon: 'npc_pulse', bounty: 180, aggro: 1700, range: 850, color: '#ff3355', shape: 'drone', loot: [['scrap', 0.7, 1, 4], ['chips', 0.08, 1, 1]] },
  raider:   { name: '넷러너 레이더', hull: 200, shield: 90, accel: 380, maxSpeed: 470, turn: 3.0, radius: 17, weapon: 'npc_blaster', bounty: 700, aggro: 2000, range: 900, color: '#ff2255', shape: 'raider', loot: [['scrap', 0.8, 2, 6], ['datashard', 0.25, 1, 2], ['plasma', 0.3, 1, 4]] },
  enforcer: { name: '신디케이트 집행자', hull: 600, shield: 320, accel: 300, maxSpeed: 420, turn: 2.4, radius: 26, weapon: 'npc_rail', bounty: 2600, aggro: 2400, range: 1500, color: '#ff5a1f', shape: 'enforcer', loot: [['datashard', 0.7, 1, 4], ['cyberware', 0.3, 1, 2], ['contraband', 0.15, 1, 2]] },
  kaiju:    { name: '워로드 「카이주」', hull: 4200, shield: 2200, accel: 200, maxSpeed: 320, turn: 1.4, radius: 60, weapon: 'npc_missile', weapon2: 'npc_blaster', bounty: 30000, aggro: 3000, range: 1800, color: '#ff0033', shape: 'boss', loot: [['quantum', 1, 4, 10], ['contraband', 0.8, 2, 6], ['datashard', 1, 4, 10]] },
  guardian: { name: '고대 수호자', hull: 350, shield: 350, accel: 340, maxSpeed: 450, turn: 2.8, radius: 20, weapon: 'npc_blaster', bounty: 1200, aggro: 2500, range: 1000, color: '#c070ff', shape: 'guardian', loot: [['datashard', 0.6, 1, 3], ['quantum', 0.2, 1, 2]] },
};

// ---------- 상품 ----------
// kind: ore / good / salvage / special
export const ITEMS = {
  ferrite:    { name: '페라이트 광석',    kind: 'ore',  base: 14,   color: '#b0b8c8', hard: 1.0 },
  titanite:   { name: '티타나이트 광석',  kind: 'ore',  base: 32,   color: '#8fd3ff', hard: 0.8 },
  neonium:    { name: '네오늄 결정',      kind: 'ore',  base: 75,   color: '#ff4df0', hard: 0.6 },
  voidstone:  { name: '보이드스톤',       kind: 'ore',  base: 160,  color: '#8a5cff', hard: 0.45 },
  quantum:    { name: '퀀텀 크리스탈',    kind: 'ore',  base: 420,  color: '#00ffd0', hard: 0.3 },
  food:       { name: '합성 식량',        kind: 'good', base: 22,   color: '#9aff7a' },
  water:      { name: '정제수',           kind: 'good', base: 16,   color: '#6ad0ff' },
  plasma:     { name: '플라즈마 셀',      kind: 'good', base: 65,   color: '#ffb000' },
  chips:      { name: '뉴럴 칩',          kind: 'good', base: 190,  color: '#00f0ff' },
  cyberware:  { name: '군용 사이버웨어',  kind: 'good', base: 380,  color: '#ff2bd6' },
  contraband: { name: '블랙 ICE',         kind: 'good', base: 720,  color: '#ff0040' },
  scrap:      { name: '고철',             kind: 'salvage', base: 28, color: '#9a8a7a' },
  datashard:  { name: '암호화 데이터 샤드', kind: 'salvage', base: 260, color: '#7dff5a' },
};
export const MARKET_ITEMS = Object.keys(ITEMS);

// 스테이션 유형: produces = 싸게 팜, consumes = 비싸게 삼
export const STATION_TYPES = {
  hub:      { name: '무역 허브',     produces: ['food', 'water'], consumes: ['chips', 'cyberware'], icon: '◆' },
  mining:   { name: '채굴 콜로니',   produces: ['plasma'], consumes: ['food', 'water', 'ferrite', 'titanite'], icon: '⛏' },
  industry: { name: '산업 정제소',   produces: ['plasma', 'chips'], consumes: ['ferrite', 'titanite', 'neonium', 'scrap'], icon: '⚙' },
  research: { name: '연구 기지',     produces: ['chips'], consumes: ['neonium', 'voidstone', 'quantum', 'datashard'], icon: '✚' },
  military: { name: '군사 요새',     produces: ['cyberware'], consumes: ['plasma', 'voidstone', 'food'], icon: '✪' },
  pirate:   { name: '해적 소굴',     produces: ['contraband'], consumes: ['cyberware', 'chips', 'datashard', 'quantum'], icon: '☠' },
};

// 보안 등급
export function secLabel(sec) {
  if (sec >= 0.5) return '하이섹';
  if (sec > 0.0) return '로우섹';
  return '널섹';
}
export function secColor(sec) {
  if (sec >= 0.8) return '#2cff9a';
  if (sec >= 0.5) return '#b8ff3c';
  if (sec >= 0.25) return '#ffb000';
  if (sec > 0.0) return '#ff6a00';
  return '#ff1f4b';
}
export const pvpAllowed = (sec) => sec < 0.5;

export function fmtCredits(n) {
  return Math.floor(n).toLocaleString('en-US') + ' ¢';
}
export function fmtDist(d) {
  if (d >= 1000) return (d / 1000).toFixed(d >= 100000 ? 0 : 1) + ' km';
  return Math.round(d) + ' m';
}
