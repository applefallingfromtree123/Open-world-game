// ============================================================
//  임무 시스템 — 배송 · 운송 · 채굴 · 현상금 · 소탕 · 탐사 · 밀수
// ============================================================
import * as THREE from 'three';
import { GOODS, FACTIONS, NPC_FIRST, NPC_LAST } from './data.js';
import { S, addRep } from './state.js';
import { rng, hashStr, fmtCr, R } from './util.js';
import { systemData } from './world.js';

const SLOT = 15 * 60 * 1000;

export class Missions {
  constructor(game) { this.game = game; }

  // 반경 내 성계 (도약 횟수)
  nearbySystems(sysId, hops) {
    const gal = this.game.galaxy;
    const out = [{ id: sysId, h: 0 }];
    const seen = new Set([sysId]);
    let frontier = [sysId];
    for (let h = 1; h <= hops; h++) {
      const next = [];
      for (const id of frontier) for (const n of gal.byId[id].links) if (!seen.has(n)) { seen.add(n); next.push(n); out.push({ id: n, h }); }
      frontier = next;
    }
    return out;
  }

  board(st, sysId) {
    const slot = Math.floor(Date.now() / SLOT);
    const r = rng(hashStr(st.id) ^ (slot * 2654435761));
    const gal = this.game.galaxy;
    const sys = gal.byId[sysId];
    const near = this.nearbySystems(sysId, 2);
    const pirate = st.type === 'pirate';
    const offers = [];
    const n = r.int(4, 7);
    const allStations = (filter) => {
      const list = [];
      for (const s of near) { const sd = systemData(gal.byId[s.id]); for (const x of sd.stations) if (x.id !== st.id && filter(x)) list.push({ st: x, sys: s.id, h: s.h }); }
      return list;
    };
    for (let i = 0; i < n; i++) {
      const id = `m${slot.toString(36)}${hashStr(st.id).toString(36).slice(0, 4)}${i}`;
      if (S.save.missions.some((m) => m.id === id) || (S.save.doneMissions || []).includes(id)) continue;
      const type = pirate ? r.weighted([['smuggle', 3], ['bounty_l', 1.5], ['courier', 1], ['source', 1]])
        : r.weighted([['delivery', 3], ['courier', 2], ['source', st.type === 'industry' || st.type === 'tech' || st.type === 'trade' ? 2.5 : 1], ['bounty', 2], ['clear', 1.5], ['survey', 1.5]]);
      let m = null;
      const fac = pirate ? 'pirate' : st.faction;
      if (type === 'delivery' || type === 'smuggle') {
        const dests = allStations((x) => type === 'smuggle' ? (x.type === 'pirate' || x.faction === 'indep') : x.type !== 'pirate');
        if (!dests.length) continue;
        const d = r.pick(dests);
        const good = type === 'smuggle' ? r.pick(['narcotics', 'slaves', 'weapons']) : r.pick(['food', 'medicine', 'electronics', 'machinery', 'alloys', 'luxury', 'fuelcells', 'ai_cores']);
        const qty = r.int(4, 24);
        const reward = Math.round((900 + GOODS[good].base * qty * 0.18 + d.h * 4500 + r.int(0, 1500)) * (type === 'smuggle' ? 2.2 : 1) / 50) * 50;
        m = { type, title: type === 'smuggle' ? `밀수: ${GOODS[good].name} 운반` : `배송: ${GOODS[good].name} ${qty}t`, good, qty, dest: d.st.id, destName: d.st.name, sys: d.sys, reward,
          desc: `${GOODS[good].name} ${qty}t을(를) ${gal.byId[d.sys].name} 성계의 ${d.st.name}(으)로 운반하십시오.${type === 'smuggle' ? ' 보안군 스캔에 주의하십시오.' : ''}` };
      } else if (type === 'courier') {
        const dests = allStations((x) => pirate || x.type !== 'pirate');
        if (!dests.length) continue;
        const d = r.pick(dests);
        m = { type, title: `데이터 운송 → ${d.st.name}`, dest: d.st.id, destName: d.st.name, sys: d.sys, reward: Math.round((700 + d.h * 3800 + r.int(0, 1200)) / 50) * 50,
          desc: `암호화된 데이터를 ${gal.byId[d.sys].name} 성계의 ${d.st.name}에 전달하십시오. 화물칸을 차지하지 않습니다.` };
      } else if (type === 'source') {
        const ore = r.pick(['iron', 'titanium', 'ice', 'platinum', 'painite', 'voidcrystal'].filter((o) => sys.sec <= 1 || GOODS[o].base < 1000));
        const qty = r.int(4, GOODS[ore].base > 400 ? 10 : 30);
        m = { type, title: `조달: ${GOODS[ore].name} ${qty}t`, good: ore, qty, dest: st.id, destName: st.name, sys: sysId, reward: Math.round(GOODS[ore].base * qty * 1.7 / 50) * 50 + 500,
          desc: `${GOODS[ore].name} ${qty}t을(를) 이 스테이션으로 가져오십시오. 채굴하거나 구매해도 됩니다.` };
      } else if (type === 'bounty' || type === 'bounty_l') {
        const cands = near.filter((s) => gal.byId[s.id].sec <= (type === 'bounty_l' ? 3 : 2));
        if (!cands.length) continue;
        const ts = r.pick(cands);
        const sd = systemData(gal.byId[ts.id]);
        const pl = r.pick(sd.planets);
        const spot = pl.pos.clone().add(r.dir(new THREE.Vector3()).multiplyScalar(pl.radius + r.range(15000, 40000)));
        const tname = `${r.pick(NPC_FIRST)} "${r.pick(['피의', '검은', '미친', '조용한', '붉은', '외눈'])} ${r.pick(NPC_LAST)}"`;
        const ship = r.pick(type === 'bounty_l' ? ['mantis', 'kestrel'] : ['mantis', 'vanguard', 'kestrel']);
        m = { type: type === 'bounty_l' ? 'bounty' : type, lawTarget: type === 'bounty_l', title: type === 'bounty_l' ? `청부: ${tname}` : `현상금: ${tname}`, target: tname, ship, sys: ts.id, spot: spot.toArray().map(Math.round), spotName: `${tname}의 은신처`,
          escorts: r.int(0, sys.sec >= 2 ? 1 : 2), reward: Math.round((8000 + ts.h * 5000 + r.int(0, 8000)) * (ship === 'vanguard' ? 1.8 : 1) / 100) * 100,
          desc: type === 'bounty_l' ? `경쟁 조직의 파일럿 ${tname}을(를) 제거하라. ${gal.byId[ts.id].name} 성계에 숨어 있다. (보안군에게는 살인으로 간주될 수 있음)` : `수배범 ${tname}이(가) ${gal.byId[ts.id].name} 성계에 은신 중입니다. 처치하십시오. 호위기가 있을 수 있습니다.` };
      } else if (type === 'clear') {
        const cands = near.filter((s) => gal.byId[s.id].sec <= 2);
        if (!cands.length) continue;
        const ts = r.pick(cands);
        const cnt = r.int(3, 8);
        m = { type, title: `해적 소탕: ${gal.byId[ts.id].name}`, sys: ts.id, count: cnt, progress: 0, reward: cnt * r.int(1800, 3200) + ts.h * 2000,
          desc: `${gal.byId[ts.id].name} 성계에서 해적 ${cnt}척을 격추하십시오. 소행성대와 신호원 근처에 자주 출몰합니다.` };
      } else if (type === 'survey') {
        const ts = r.pick(near);
        const sd = systemData(gal.byId[ts.id]);
        const pl = r.pick(sd.planets);
        if (S.save.explored[pl.id]) continue;
        m = { type, title: `탐사: ${pl.name}`, body: pl.id, bodyName: pl.name, sys: ts.id, reward: Math.round((2500 + ts.h * 3000 + r.int(0, 3000)) / 50) * 50,
          desc: `${gal.byId[ts.id].name} 성계의 ${pl.name}(${pl.kindName})을(를) 근접 스캔(V)하십시오.` };
      }
      if (!m) continue;
      m.id = id; m.from = st.id; m.fromName = st.name; m.faction = fac; m.fromSys = sysId;
      offers.push(m);
    }
    return offers;
  }

  accept(m) {
    if (S.save.missions.length >= 8) return '임무는 최대 8개까지 수락할 수 있습니다';
    const ship = this.game.playerShip;
    if ((m.type === 'delivery' || m.type === 'smuggle')) {
      if (ship.cargoFree() < m.qty) return `화물 공간이 부족합니다 (${m.qty}t 필요)`;
      ship.addCargo(m.good, m.qty);
    }
    S.save.missions.push(Object.assign({}, m, { accepted: Date.now() }));
    if (m.spot && m.sys === this.game.world.sys.id) this.game.world.addMissionSpot(S.save.missions[S.save.missions.length - 1]);
    return null;
  }
  abandon(m) {
    S.save.missions = S.save.missions.filter((x) => x !== m);
    addRep(m.faction, -2);
    const a = this.game.world.anoms.find((x) => x.mission === m);
    if (a) this.game.world.removeAnom(a);
  }
  complete(m, extraMsg) {
    S.save.missions = S.save.missions.filter((x) => x !== m);
    S.save.doneMissions = (S.save.doneMissions || []).slice(-60);
    S.save.doneMissions.push(m.id);
    S.save.stats.missions++;
    addRep(m.faction, 4 + Math.round(m.reward / 6000));
    this.game.reward(m.reward, `임무 완료: ${m.title}`);
    if (extraMsg) this.game.msg(extraMsg, 'good');
  }

  onDock(st) {
    const ship = this.game.playerShip;
    for (const m of S.save.missions.slice()) {
      if (m.dest !== st.id) continue;
      if (m.type === 'courier') this.complete(m);
      else if (m.type === 'delivery' || m.type === 'smuggle' || m.type === 'source') {
        const have = ship.cargo[m.good] || 0;
        if (have >= m.qty) { ship.removeCargo(m.good, m.qty); this.complete(m); }
        else this.game.msg(`임무 "${m.title}": ${GOODS[m.good].name} ${m.qty - have}t 부족`, 'warn');
      }
    }
  }
  onKill(ship) {
    const sysId = this.game.world.sys.id;
    for (const m of S.save.missions.slice()) {
      if (m.sys !== sysId) continue;
      if (m.type === 'clear' && ship.brain && ship.brain.role === 'pirate') {
        m.progress = (m.progress || 0) + 1;
        if (m.progress >= m.count) this.complete(m); else this.game.msg(`해적 소탕 ${m.progress}/${m.count}`, 'info');
      }
      if (m.type === 'bounty' && ship.missionId === m.id) {
        this.complete(m, `${m.target} 처치 완료!`);
        const a = this.game.world.anoms.find((x) => x.mission === m);
        if (a) this.game.world.removeAnom(a);
      }
    }
  }
  onScan(bodyId) {
    for (const m of S.save.missions.slice()) if (m.type === 'survey' && m.body === bodyId) this.complete(m);
  }
  onSpot(m, w, a) {
    if (m.type !== 'bounty') return;
    const p = a.pos;
    const t = w.spawnNPC(m.lawTarget ? 'hunter' : 'pirate', p.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(500)), { type: m.ship, name: m.target, lookAt: this.game.playerShip.pos, paint: ['#1a1a1a', '#ffcc00'] });
    t.missionId = m.id; t.bounty = m.lawTarget ? 0 : Math.round(m.reward * 0.1);
    t.brain.role = 'pirate'; t.faction = 'pirate';
    for (const k of ['shield', 'hull']) { t.stats[k] *= 1.6; }
    t.hull = t.stats.hull; t.shield = t.stats.shield;
    for (let i = 0; i < (m.escorts || 0); i++) w.spawnNPC('pirate', p.clone().add(R.dir(new THREE.Vector3()).multiplyScalar(700)));
    this.game.comms(t, m.lawTarget ? '누가 보냈지? ...상관없어. 여기서 끝이다.' : '날 찾아낸 건 칭찬해주지. 하지만 거기까지다.');
  }
}

export function missionLine(m, gal) {
  const where = m.sys ? gal.byId[m.sys].name : '';
  let prog = '';
  if (m.type === 'clear') prog = ` (${m.progress || 0}/${m.count})`;
  return `${m.title}${prog} · ${where} · ${fmtCr(m.reward)}`;
}
export { FACTIONS };
