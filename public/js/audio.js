// WebAudio 합성 사운드 — 외부 파일 없이 효과음 · 엔진음 · 앰비언트 음악
let ctx = null, master, sfxG, musicG, noiseBuf, comp;
let engine = null, beamN = null;
const vol = { sfx: 0.7, music: 0.35 };

export function setVolumes(s, m) {
  vol.sfx = s; vol.music = m;
  if (sfxG) sfxG.gain.value = s;
  if (musicG) musicG.gain.value = m * 0.5;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
  comp = ctx.createDynamicsCompressor(); comp.connect(master);
  sfxG = ctx.createGain(); sfxG.gain.value = vol.sfx; sfxG.connect(comp);
  musicG = ctx.createGain(); musicG.gain.value = vol.music * 0.5; musicG.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 3; }
  // 엔진음
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 2;
  const g = ctx.createGain(); g.gain.value = 0;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 45;
  const og = ctx.createGain(); og.gain.value = 0;
  const olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 160;
  src.connect(lp); lp.connect(g); g.connect(sfxG);
  osc.connect(olp); olp.connect(og); og.connect(sfxG);
  src.start(); osc.start();
  engine = { lp, g, osc, og };
  // 빔음
  const bs = ctx.createBufferSource(); bs.buffer = noiseBuf; bs.loop = true;
  const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1800; bf.Q.value = 6;
  const bo = ctx.createOscillator(); bo.type = 'square'; bo.frequency.value = 220;
  const bog = ctx.createGain(); bog.gain.value = 0.15;
  const bg = ctx.createGain(); bg.gain.value = 0;
  bs.connect(bf); bf.connect(bg); bo.connect(bog); bog.connect(bg); bg.connect(sfxG);
  bs.start(); bo.start();
  beamN = { g: bg, o: bo, on: 0 };
  startMusic();
}

function env(g, t, a, peak, dcy) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
}
function tone(type, f0, f1, dur, v, delay = 0) {
  if (!ctx || v <= 0.001) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.004, v, dur);
  o.connect(g); g.connect(sfxG); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, v, freq, q = 1, type = 'lowpass', f1, delay = 0) {
  if (!ctx || v <= 0.001) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, 0.008, v, dur);
  s.connect(f); f.connect(g); g.connect(sfxG); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

const last = {};
function throttleSfx(k, gap) { if (!ctx) return false; const t = ctx.currentTime; if (last[k] && t - last[k] < gap) return false; last[k] = t; return true; }

export const sfx = {
  shot(id, v = 1) {
    if (!throttleSfx('shot' + id + (v < 1 ? 'n' : ''), v < 1 ? 0.08 : 0.03)) return;
    if (id === 'pulse') { tone('square', 1500, 300, 0.09, 0.07 * v); tone('sine', 900, 200, 0.12, 0.08 * v); }
    else if (id === 'cannon') { noise(0.07, 0.22 * v, 2200, 1.5, 'bandpass', 600); tone('square', 180, 60, 0.06, 0.08 * v); }
    else if (id === 'plasma') { tone('sawtooth', 600, 90, 0.35, 0.12 * v); noise(0.3, 0.15 * v, 900, 2, 'bandpass', 200); }
    else if (id === 'rail') { tone('sawtooth', 2400, 80, 0.5, 0.14 * v); noise(0.4, 0.25 * v, 4000, 1, 'highpass', 400); tone('sine', 60, 30, 0.5, 0.25 * v); }
    else if (id === 'missile') { noise(0.8, 0.22 * v, 300, 1.5, 'bandpass', 2500); }
  },
  hit(shield, v = 1) {
    if (!throttleSfx('hit', 0.05)) return;
    if (shield) { tone('sine', 900, 1400, 0.12, 0.08 * v); noise(0.12, 0.08 * v, 3000, 3, 'bandpass'); }
    else { noise(0.15, 0.25 * v, 800, 1, 'lowpass', 120); tone('triangle', 200, 50, 0.12, 0.15 * v); }
  },
  boom(size = 1, v = 1) { noise(1.2 + size * 0.6, 0.6 * v, 1200, 0.7, 'lowpass', 40); tone('sine', 110, 25, 0.9 + size * 0.3, 0.45 * v); noise(0.3, 0.3 * v, 3000, 1, 'highpass', 800); },
  jump(v = 1) { noise(1.4, 0.3 * v, 150, 1, 'bandpass', 5000); tone('sine', 50, 900, 1.0, 0.2 * v); },
  hyperCharge() { tone('sawtooth', 60, 1200, 4.0, 0.06); noise(4.0, 0.08, 100, 1, 'bandpass', 3000); },
  cruiseCharge() { tone('sawtooth', 70, 500, 3.0, 0.05); tone('sine', 140, 800, 3.0, 0.05); },
  cruiseEngage() { noise(1.0, 0.25, 300, 1, 'bandpass', 3000); tone('sine', 400, 1600, 0.4, 0.08); },
  cruiseDrop() { noise(0.8, 0.3, 3000, 1, 'bandpass', 150); tone('sine', 900, 120, 0.5, 0.1); },
  click() { tone('square', 1800, 1800, 0.025, 0.04); },
  coin() { tone('sine', 1320, 1320, 0.08, 0.1); tone('sine', 1760, 1760, 0.14, 0.1, 0.07); },
  pickup() { tone('triangle', 700, 1400, 0.12, 0.1); },
  scan() { tone('sine', 300, 1800, 0.6, 0.08); },
  scanDone() { tone('sine', 1200, 1200, 0.1, 0.1); tone('sine', 1800, 1800, 0.2, 0.1, 0.1); },
  alarm() { tone('square', 880, 660, 0.25, 0.07); tone('square', 880, 660, 0.25, 0.07, 0.3); },
  lock() { if (throttleSfx('lock', 0.15)) tone('square', 2400, 2400, 0.05, 0.04); },
  dock() { tone('sine', 400, 800, 0.3, 0.1); tone('sine', 800, 1200, 0.3, 0.08, 0.18); },
  error() { tone('square', 200, 150, 0.15, 0.06); },
  msg() { if (throttleSfx('msg', 0.2)) tone('sine', 2000, 2400, 0.05, 0.04); },
  warn() { if (throttleSfx('warn', 1)) { tone('triangle', 600, 600, 0.15, 0.07); tone('triangle', 450, 450, 0.2, 0.07, 0.16); } },
  beam(active) { if (beamN) beamN.on = active ? 2 : 1; },
};

export function audioFrame(throttle, boost, cruise, speed) {
  if (!ctx || !engine) return;
  const t = ctx.currentTime;
  const p = cruise ? 0.9 : Math.min(1, Math.abs(throttle) * 0.8 + (boost ? 0.5 : 0));
  engine.g.gain.setTargetAtTime(0.05 + p * 0.22, t, 0.1);
  engine.lp.frequency.setTargetAtTime(140 + p * 700 + (cruise ? 600 : 0), t, 0.15);
  engine.osc.frequency.setTargetAtTime(38 + p * 40 + (cruise ? 30 : 0), t, 0.2);
  engine.og.gain.setTargetAtTime(0.02 + p * 0.06, t, 0.1);
  if (beamN) {
    beamN.g.gain.setTargetAtTime(beamN.on === 2 ? 0.09 : beamN.on === 1 ? 0.05 : 0, t, 0.03);
    beamN.o.frequency.setTargetAtTime(beamN.on === 2 ? 180 + Math.random() * 40 : 260, t, 0.05);
    beamN.on = 0;
  }
}
export function muteEngine() { if (engine && ctx) { engine.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); engine.og.gain.setTargetAtTime(0, ctx.currentTime, 0.2); } }

// ---------- 앰비언트 음악 (느린 패드 + 반짝이는 아르페지오) ----------
function startMusic() {
  const t0 = ctx.currentTime;
  const pad = ctx.createGain(); pad.gain.value = 0.1;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.03;
  const lfoG = ctx.createGain(); lfoG.gain.value = 400; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
  const dl = ctx.createDelay(1.5); dl.delayTime.value = 0.9;
  const fb = ctx.createGain(); fb.gain.value = 0.45;
  pad.connect(lp); lp.connect(musicG); lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(musicG);
  const chords = [[38, 50, 57, 62, 65], [34, 46, 53, 58, 62], [41, 53, 57, 60, 64], [36, 48, 55, 60, 62]];
  const oscs = [];
  for (let i = 0; i < 5; i++) for (const det of [-6, 6]) {
    const o = ctx.createOscillator(); o.type = i === 0 ? 'triangle' : 'sawtooth'; o.detune.value = det;
    const g = ctx.createGain(); g.gain.value = i === 0 ? 0.9 : 0.35;
    o.connect(g); g.connect(pad); o.start(); oscs.push({ o, i });
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const bell = ctx.createGain(); bell.gain.value = 0.04; bell.connect(musicG); bell.connect(dl);
  function schedule() {
    const now = ctx.currentTime;
    const ci = Math.floor((now - t0) / 12) % chords.length;
    const ch = chords[ci];
    for (const { o, i } of oscs) o.frequency.setTargetAtTime(mtof(ch[i]), now, 2.5);
    for (let k = 0; k < 4; k++) {
      if (Math.random() < 0.45) continue;
      const tt = now + k * 0.75 + Math.random() * 0.2;
      const note = ch[1 + ((Math.random() * 4) | 0)] + 24;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = mtof(note);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.6, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.2);
      o.connect(g); g.connect(bell); o.start(tt); o.stop(tt + 2.3);
    }
  }
  schedule();
  setInterval(schedule, 3000);
}
