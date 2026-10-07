// Tiny WebAudio synth for game feedback — no audio files needed.
let ctx = null, master = null;
const last = new Map();

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

function noiseBuffer(sec) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
let nb = null;

function throttle(name, ms) {
  const t = performance.now();
  if ((last.get(name) || 0) + ms > t) return false;
  last.set(name, t);
  return true;
}

function noise(dur, freq, q, vol, type = 'lowpass') {
  if (!ctx) return;
  nb ||= noiseBuffer(1.5);
  const src = ctx.createBufferSource(); src.buffer = nb;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}
function tone(freq, dur, vol, type = 'square', slide = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}

export function sfx(name, vol = 1) {
  if (!ctx || vol <= 0.02) return;
  switch (name) {
    case 'shot': if (throttle('shot', 40)) noise(0.12, 2200, 0.7, 0.5 * vol); break;
    case 'heavy': if (throttle('heavy', 60)) { noise(0.25, 900, 0.7, 0.7 * vol); tone(90, 0.2, 0.3 * vol, 'sine', -40); } break;
    case 'taser': if (throttle('taser', 80)) tone(1800, 0.25, 0.12 * vol, 'sawtooth', -600); break;
    case 'spray': if (throttle('spray', 120)) noise(0.35, 3200, 0.8, 0.25 * vol, 'highpass'); break;
    case 'pop': if (throttle('pop', 90)) { noise(0.1, 1600, 0.6, 0.6 * vol); setTimeout(() => noise(0.5, 2400, 0.4, 0.25 * vol, 'highpass'), 60); } break;
    case 'swing': if (throttle('swing', 80)) noise(0.08, 800, 2, 0.2 * vol, 'bandpass'); break;
    case 'hit': if (throttle('hit', 50)) noise(0.06, 500, 1, 0.4 * vol); break;
    case 'crash': if (throttle('crash', 120)) { noise(0.35, 600, 0.6, 0.8 * vol); tone(70, 0.25, 0.3 * vol, 'triangle', -30); } break;
    case 'explode': noise(0.9, 400, 0.5, 1.0 * vol); tone(50, 0.7, 0.5 * vol, 'sine', -30); break;
    case 'cash': if (throttle('cash', 100)) { tone(1320, 0.08, 0.2 * vol); setTimeout(() => tone(1760, 0.12, 0.2 * vol), 70); } break;
    case 'door': if (throttle('door', 150)) noise(0.08, 300, 1, 0.4 * vol); break;
    case 'horn': if (throttle('horn', 220)) { tone(392, 0.22, 0.12 * vol, 'square'); tone(494, 0.22, 0.1 * vol, 'square'); } break;
    case 'siren': if (throttle('siren', 700)) { tone(700, 0.35, 0.06 * vol, 'sine', 400); setTimeout(() => tone(1100, 0.35, 0.06 * vol, 'sine', -400), 350); } break;
    case 'splash': if (throttle('splash', 100)) noise(0.4, 1400, 0.5, 0.35 * vol, 'highpass'); break;
    case 'bite': tone(880, 0.1, 0.2); setTimeout(() => tone(880, 0.1, 0.2), 140); break;
    case 'alert': if (throttle('alert', 500)) { tone(660, 0.12, 0.15 * vol); setTimeout(() => tone(990, 0.15, 0.15 * vol), 120); } break;
    case 'bad': if (throttle('bad', 300)) tone(180, 0.25, 0.15 * vol, 'sawtooth', -60); break;
    case 'camera': if (throttle('camera', 400)) { tone(1500, 0.06, 0.08 * vol); setTimeout(() => tone(1500, 0.06, 0.08 * vol), 120); } break;
    case 'click': if (throttle('click', 40)) { tone(1050, 0.035, 0.14 * vol, 'square'); setTimeout(() => tone(1400, 0.03, 0.08 * vol, 'square'), 30); } break;
    case 'thunder': if (throttle('thunder', 3000)) { noise(2.6, 140, 0.6, 0.9 * vol); setTimeout(() => noise(1.8, 90, 0.8, 0.7 * vol), 260); tone(42, 1.6, 0.35 * vol, 'sine', -12); } break;
    case 'glass': if (throttle('glass', 90)) { noise(0.25, 4200, 0.6, 0.45 * vol, 'highpass'); tone(2600, 0.12, 0.06 * vol, 'triangle', 900); setTimeout(() => tone(3400, 0.1, 0.04 * vol, 'triangle'), 50); } break;
    case 'paper': if (throttle('paper', 120)) noise(0.3, 2600, 0.5, 0.3 * vol, 'highpass'); break;
    case 'gush': if (throttle('gush', 400)) noise(1.4, 1100, 0.4, 0.4 * vol, 'bandpass'); break;
    case 'clang': if (throttle('clang', 90)) { tone(520, 0.3, 0.12 * vol, 'triangle', -120); tone(780, 0.22, 0.06 * vol, 'square', -200); noise(0.12, 900, 1, 0.3 * vol); } break;
    case 'thud': if (throttle('thud', 80)) tone(110, 0.12, 0.25 * vol, 'sine', -50); break;
    // diesel air horn: a low two-note chord, long or short
    case 'trainhorn': case 'trainhornshort': if (throttle('trainhorn', 700)) { const d = name === 'trainhorn' ? 1.1 : 0.5; tone(277, d, 0.11 * vol, 'sawtooth'); tone(349, d, 0.09 * vol, 'sawtooth'); tone(415, d, 0.06 * vol, 'square'); } break;
    case 'bell': if (throttle('bell', 480)) { tone(1245, 0.18, 0.09 * vol, 'triangle'); tone(2490, 0.1, 0.03 * vol, 'sine'); } break;
    case 'churchbell': if (throttle('churchbell', 600)) { tone(196, 2.8, 0.2 * vol, 'sine'); tone(392, 2.2, 0.09 * vol, 'sine'); tone(466, 1.6, 0.05 * vol, 'triangle'); tone(784, 0.9, 0.04 * vol, 'sine'); noise(0.05, 1800, 1, 0.12 * vol, 'bandpass'); } break;   // (the old mission's bells: a deep strike with its hum and overtones)
    case 'burner': if (throttle('burner', 900)) { noise(1.5, 380, 0.6, 0.42 * vol, 'lowpass'); noise(1.2, 1900, 0.5, 0.08 * vol, 'bandpass'); } break;   // (a balloon's burner: a long roar)
    case 'rumble': if (throttle('rumble', 260)) noise(0.3, 160, 0.8, 0.22 * vol); break;
    default: break;
  }
}
