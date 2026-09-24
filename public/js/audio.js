// WebAudio 합성 사운드 — 외부 파일 없이 사이버펑크 효과음과 앰비언트 음악 생성
let ctx = null, master = null, sfxGain = null, musicGain = null, noiseBuf = null;
const settings = { sfx: 0.6, music: 0.35 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('nv_audio') || '{}')); } catch {}

export function audioSettings() { return settings; }
export function setVolume(kind, v) {
  settings[kind] = v;
  try { localStorage.setItem('nv_audio', JSON.stringify(settings)); } catch {}
  if (sfxGain) sfxGain.gain.value = settings.sfx;
  if (musicGain) musicGain.gain.value = settings.music * 0.5;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = settings.sfx; sfxGain.connect(comp);
  musicGain = ctx.createGain(); musicGain.gain.value = settings.music * 0.5; musicGain.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}

function env(g, t, a, peak, dcy) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
}
function tone(type, f0, f1, dur, vol, dest = sfxGain) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, q = 1, type = 'lowpass', f1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, 0.01, vol, dur);
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.05);
}

let lastShot = 0;
export const sfx = {
  shot(w, vol = 1) {
    if (!ctx) return;
    const t = ctx.currentTime; if (t - lastShot < 0.03) return; lastShot = t;
    if (w === 'railgun' || w === 'npc_rail') { tone('sawtooth', 1800, 90, 0.35, 0.22 * vol); noise(0.25, 0.25 * vol, 3000, 1, 'bandpass', 300); }
    else if (w === 'scatter') { noise(0.18, 0.3 * vol, 1400, 1); tone('square', 300, 80, 0.12, 0.08 * vol); }
    else if (w === 'blaster' || w === 'npc_blaster') tone('square', 620, 120, 0.14, 0.1 * vol);
    else if (w && w.includes('missile')) noise(0.5, 0.18 * vol, 400, 2, 'bandpass', 2000);
    else tone('square', 1100, 220, 0.09, 0.08 * vol);
  },
  hit(vol = 1) { tone('triangle', 260, 60, 0.08, 0.15 * vol); noise(0.06, 0.12 * vol, 2500, 2, 'highpass'); },
  boom(size = 1, vol = 1) { noise(0.9 + size * 0.4, 0.55 * vol, 900, 0.7, 'lowpass', 60); tone('sine', 120, 30, 0.7, 0.35 * vol); },
  warpCharge() { tone('sawtooth', 80, 900, 2.0, 0.08); },
  warpIn() { noise(1.2, 0.3, 200, 1, 'bandpass', 4000); tone('sine', 60, 600, 0.8, 0.2); },
  warpOut() { noise(0.8, 0.25, 3000, 1, 'bandpass', 150); },
  click() { tone('square', 1500, 1500, 0.03, 0.04); },
  coin() { tone('sine', 1320, 1320, 0.08, 0.12); setTimeout(() => tone('sine', 1760, 1760, 0.14, 0.12), 70); },
  pickup() { tone('triangle', 700, 1400, 0.12, 0.1); },
  scan() { tone('sine', 300, 1800, 1.0, 0.12); setTimeout(() => tone('sine', 1800, 1800, 0.25, 0.06), 900); },
  alarm() { tone('square', 880, 660, 0.25, 0.08); setTimeout(() => tone('square', 880, 660, 0.25, 0.08), 300); },
  dock() { tone('sine', 400, 800, 0.3, 0.12); setTimeout(() => tone('sine', 800, 1200, 0.3, 0.1), 180); },
  error() { tone('square', 200, 150, 0.15, 0.08); },
  msg() { tone('sine', 2000, 2400, 0.05, 0.05); },
};

// ---------- 앰비언트 신스웨이브 ----------
function startMusic() {
  const t0 = ctx.currentTime;
  // 패드
  const pad = ctx.createGain(); pad.gain.value = 0.12;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 4;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
  const lfoG = ctx.createGain(); lfoG.gain.value = 500; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
  pad.connect(lp); lp.connect(musicGain);
  const chords = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]];
  const oscs = [];
  for (let i = 0; i < 4; i++) for (const det of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
    o.connect(pad); o.start(); oscs.push({ o, i });
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // 아르페지오
  const arpG = ctx.createGain(); arpG.gain.value = 0.05;
  const dl = ctx.createDelay(); dl.delayTime.value = 0.375;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  arpG.connect(musicGain); arpG.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(musicGain);
  let step = 0;
  const bar = 8;
  function schedule() {
    const now = ctx.currentTime;
    const ci = Math.floor((now - t0) / bar) % chords.length;
    const ch = chords[ci];
    for (const { o, i } of oscs) o.frequency.setTargetAtTime(mtof(ch[i]), now, 0.8);
    // 16분음표 아르페지오 (가끔 쉼)
    for (let k = 0; k < 8; k++) {
      const tt = now + k * 0.1875;
      if (Math.random() < 0.3) continue;
      const note = ch[(step + k) % 4] + 24 + (Math.random() < 0.2 ? 12 : 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = mtof(note);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.5, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16);
      o.connect(g); g.connect(arpG); o.start(tt); o.stop(tt + 0.2);
    }
    step += 8;
    // 킥 (느린 펄스)
    for (let k = 0; k < 2; k++) {
      const tt = now + k * 0.75;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(110, tt); o.frequency.exponentialRampToValueAtTime(35, tt + 0.25);
      g.gain.setValueAtTime(0.25, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.3);
      o.connect(g); g.connect(musicGain); o.start(tt); o.stop(tt + 0.35);
    }
  }
  schedule();
  setInterval(schedule, 1500);
}
