// Tiny WebAudio synth for game feedback — no audio files needed.
let ctx = null, master = null;
const last = new Map();

// Safari (an iPhone above all) starts the sound suspended unless it's made in a tap, and suspends it when the page
// goes to the background or a call comes in: it's woken on the next touch, click or key, and on coming back.
function wake() { if (ctx && ctx.state !== 'running') { try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch { /* not now */ } } }
export function initAudio() {
  if (ctx) { wake(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch { ctx = null; return; }
  for (const ev of ['touchend', 'pointerdown', 'keydown']) window.addEventListener(ev, wake, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
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
    case 'golfhit': if (throttle('golfhit', 120)) { tone(1500, 0.05, 0.16 * vol, 'triangle', -500); noise(0.06, 2600, 0.8, 0.22 * vol, 'highpass'); } break;   // (a club on the ball: a sharp click)
    case 'putt': if (throttle('putt', 120)) tone(900, 0.05, 0.1 * vol, 'triangle', -300); break;
    case 'swish': if (throttle('swish', 300)) noise(0.25, 2400, 0.6, 0.22 * vol, 'bandpass'); break;   // (a basketball through the net)
    case 'hoopin': if (throttle('hoopin', 300)) { tone(420, 0.06, 0.12 * vol, 'triangle', -80); noise(0.2, 2200, 0.6, 0.16 * vol, 'bandpass'); } break;
    case 'clank': if (throttle('clank', 200)) { tone(310, 0.18, 0.14 * vol, 'square', -60); tone(620, 0.1, 0.06 * vol, 'triangle'); } break;   // (off the rim)
    case 'golfcup': if (throttle('golfcup', 400)) { tone(660, 0.08, 0.14 * vol, 'triangle'); setTimeout(() => tone(520, 0.1, 0.12 * vol, 'triangle'), 90); setTimeout(() => tone(990, 0.18, 0.12 * vol, 'sine'), 260); } break;   // (the rattle in the cup)
    case 'burner': if (throttle('burner', 900)) { noise(1.5, 380, 0.6, 0.42 * vol, 'lowpass'); noise(1.2, 1900, 0.5, 0.08 * vol, 'bandpass'); } break;   // (a balloon's burner: a long roar)
    case 'rumble': if (throttle('rumble', 260)) noise(0.3, 160, 0.8, 0.22 * vol); break;
    // the hunt: a bowstring, an arrow striking home, a bear's roar, a lion's scream, wings bursting up, a goose's honk
    case 'twang': if (throttle('twang', 80)) { tone(150, 0.16, 0.2 * vol, 'triangle', -50); noise(0.1, 3200, 0.8, 0.1 * vol, 'highpass'); } break;
    case 'thwack': if (throttle('thwack', 60)) { noise(0.05, 900, 1.2, 0.35 * vol); tone(170, 0.07, 0.14 * vol, 'sine', -70); } break;
    case 'growl': if (throttle('growl', 600)) { noise(0.7, 170, 1.4, 0.55 * vol, 'bandpass'); tone(68, 0.7, 0.26 * vol, 'sawtooth', -22); } break;
    case 'screech': if (throttle('screech', 800)) { tone(980, 0.55, 0.07 * vol, 'sawtooth', -560); noise(0.45, 2400, 2, 0.12 * vol, 'bandpass'); } break;
    case 'flutter': if (throttle('flutter', 250)) for (let k = 0; k < 6; k++) setTimeout(() => noise(0.05, 1700, 1.4, 0.14 * vol, 'bandpass'), k * 42); break;
    case 'honk': if (throttle('honk', 300)) { tone(330, 0.14, 0.08 * vol, 'square', -40); setTimeout(() => tone(310, 0.16, 0.08 * vol, 'square', -50), 180); } break;
    // blades (main.js 'finisher', 'sizzle', 'deflect', a plasma swing): a finishing stab (a dull thrust and a wet
    // thud), a finishing slash (a long whistle through the air, then the bite), the plasma blade's hum as it swings,
    // its sear where it cuts, and the whine of a bullet it turned aside
    case 'stab': if (throttle('stab', 120)) { noise(0.07, 700, 1.6, 0.55 * vol); setTimeout(() => { noise(0.16, 260, 1.2, 0.6 * vol); tone(95, 0.16, 0.22 * vol, 'sine', -40); }, 55); } break;
    case 'slash': if (throttle('slash', 120)) { noise(0.2, 2600, 2.4, 0.3 * vol, 'bandpass'); setTimeout(() => noise(0.12, 900, 1, 0.5 * vol), 110); } break;
    case 'hum': if (throttle('hum', 140)) { tone(92, 0.32, 0.16 * vol, 'sawtooth', 60); tone(184, 0.28, 0.07 * vol, 'sine', 140); } break;
    case 'sear': if (throttle('sear', 90)) { noise(0.45, 4200, 0.7, 0.32 * vol, 'highpass'); tone(130, 0.22, 0.12 * vol, 'sawtooth', -50); } break;
    case 'ignite': if (throttle('ignite', 300)) { noise(0.06, 3800, 1.2, 0.28 * vol, 'highpass'); setTimeout(() => { noise(0.7, 420, 0.7, 0.4 * vol, 'lowpass'); for (let k = 0; k < 5; k++) setTimeout(() => noise(0.03, 2600, 1.4, 0.12 * vol, 'bandpass'), 120 + k * 90); }, 90); } break;   // a match struck, the kindling catching, a crackle
    case 'douse': if (throttle('douse', 300)) { noise(0.9, 3000, 0.5, 0.3 * vol, 'highpass'); setTimeout(() => { tone(90, 0.1, 0.18 * vol, 'sine', -30); setTimeout(() => tone(80, 0.1, 0.15 * vol, 'sine', -30), 160); }, 60); } break;   // dirt kicked over the embers: a hiss and two dull scuffs
    case 'zing': if (throttle('zing', 70)) { tone(2400, 0.18, 0.09 * vol, 'sine', -1500); noise(0.05, 3600, 1, 0.2 * vol, 'highpass'); } break;
    default: break;
  }
}
