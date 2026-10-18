// The fish, drawn (the catch card, the fight's silhouette, the log): each species from its shape and its four colours
// (shared/fish.js: body, back, belly, fins), side on, facing right - after the owner's species sheets (FC12-FC20).
// drawFish(g, f, x, y, L, o): centred on (x, y), L px nose to tail; o.ink: one flat colour (a silhouette), o.glow: a
// legendary's light round it.

// shape: [height / length, tail, dorsal fin, snout, markings]
//   tails: fork, round, square, lunate, lyre, shark, eel (none: the fins run round), coel (the lobed one), none
//   dorsals: spiny (one), spiny2 (spiny then soft), low, long, back (set far back), small, sail, tall, shark, lion
//   (the lionfish's spines), filament (the tarpon's), fringe (the flatfish's, round the edge), oar (a red crest), lure
//   (the anglerfish's), eel
//   snouts: blunt, big (a big mouth), duck (a pike's), needle, long (a sturgeon's), whisk (barbels), hook (a spawning
//   salmon's), snout, beak, bill
const SH = {
  pan: [0.56, 'fork', 'spiny', 'blunt', 'ear'], perch: [0.32, 'fork', 'spiny2', 'blunt', 'bars'], bass: [0.34, 'round', 'spiny2', 'big', 'line'],
  pike: [0.19, 'fork', 'back', 'duck', 'spots'], carp: [0.36, 'fork', 'long', 'whisk', 'scales'], koi: [0.32, 'fork', 'long', 'whisk', 'patches'],
  cat: [0.24, 'fork', 'low', 'whisk', ''], sturgeon: [0.17, 'shark', 'back', 'long', 'scutes'], trout: [0.26, 'square', 'low', 'blunt', 'spots'],
  salmon: [0.29, 'square', 'low', 'hook', ''], gar: [0.13, 'round', 'back', 'needle', 'spots'], eel: [0.09, 'eel', 'eel', 'blunt', ''],
  drum: [0.32, 'square', 'spiny2', 'blunt', 'eyespot'], bowfin: [0.24, 'round', 'long', 'blunt', 'eyespot'], snook: [0.24, 'fork', 'spiny2', 'big', 'line'],
  tarpon: [0.3, 'fork', 'filament', 'big', 'scales'], mack: [0.2, 'fork', 'small', 'blunt', 'wavy'], flat: [0.52, 'round', 'fringe', 'blunt', 'spots'],
  tuna: [0.3, 'lunate', 'small', 'blunt', 'finlets'], snapper: [0.38, 'fork', 'spiny', 'blunt', 'line'], wrasse: [0.38, 'square', 'spiny', 'snout', ''],
  trigger: [0.5, 'lyre', 'spiny', 'blunt', 'face'], barracuda: [0.14, 'fork', 'small', 'duck', 'bars'], lion: [0.42, 'round', 'lion', 'blunt', 'bars'],
  bone: [0.24, 'fork', 'small', 'snout', 'line'], pompano: [0.62, 'fork', 'small', 'blunt', ''], grouper: [0.38, 'round', 'spiny2', 'big', 'spots'],
  clown: [0.44, 'round', 'spiny', 'blunt', 'bands'], tang: [0.62, 'lunate', 'long', 'blunt', 'tangmark'], angel: [0.8, 'square', 'tall', 'blunt', 'face'],
  parrot: [0.36, 'lyre', 'long', 'beak', 'scales'], mahi: [0.3, 'fork', 'long', 'blunt', 'spots'], wahoo: [0.15, 'lunate', 'small', 'duck', 'bars'],
  sail: [0.22, 'lunate', 'sail', 'bill', ''], bill: [0.22, 'lunate', 'small', 'bill', ''], shark: [0.22, 'shark', 'shark', 'blunt', 'gills'],
  rock: [0.36, 'round', 'spiny', 'big', 'spots'], angler: [0.56, 'round', 'lure', 'big', ''], oar: [0.1, 'none', 'oar', 'blunt', 'spots'],
  coel: [0.32, 'coel', 'low', 'blunt', 'spots'],
};

export function drawFish(g, f, x, y, L, o = {}) {
  const c = o.ink ? [o.ink, o.ink, o.ink, o.ink] : f.col;
  g.save();
  g.translate(x, y);
  if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = L * 0.25; }
  if (f.shape === 'squid') squid(g, L, c, o.ink);
  else if (f.shape === 'octopus') octopus(g, L, c, o.ink);
  else if (f.shape === 'isopod') isopod(g, L, c, o.ink);
  else if (f.shape === 'ray') ray(g, L, c, o.ink);
  else body(g, L, SH[f.shape] || SH.bass, c, !o.ink);
  g.restore();
}

// a fish's outline: the nose at -L/2, the tail's root at +L*0.32, the top and the bottom as curves of height h
function body(g, L, s, c, detail) {
  const [hr, tail, dorsal, snout, mark] = s, h = L * hr / 2, x0 = -L / 2, x1 = L * 0.32;
  const top = (k) => -h * Math.sin(Math.PI * Math.pow(k, 0.85)) * (snout === 'needle' || snout === 'bill' ? Math.min(1, k * 3) : 1);
  const xs = (k) => x0 + (x1 - x0) * k;
  // fins first, behind the body: the tail, the dorsal, the belly's
  g.fillStyle = c[3];
  tailFin(g, tail, x1, h, L);
  dorsalFin(g, dorsal, xs, top, h, L, c);
  if (tail !== 'eel' && dorsal !== 'fringe') { g.beginPath(); g.moveTo(xs(0.55), h * 0.55); g.lineTo(xs(0.72), h * 1.05); g.lineTo(xs(0.78), h * 0.4); g.fill(); }
  // the body
  const grad = g.createLinearGradient(0, -h, 0, h);
  grad.addColorStop(0, c[1]); grad.addColorStop(0.45, c[0]); grad.addColorStop(1, c[2]);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x0, snout === 'big' || snout === 'duck' ? h * 0.1 : 0);
  for (let i = 1; i <= 16; i++) { const k = i / 16; g.lineTo(xs(k), top(k) * (k > 0.92 ? 0.55 + (1 - k) * 4 : 1)); }
  g.lineTo(x1, h * 0.28);
  for (let i = 16; i >= 0; i--) { const k = i / 16; g.lineTo(xs(k), -top(k) * (k > 0.92 ? 0.55 + (1 - k) * 4 : 1) * (snout === 'big' ? 1.05 : 0.95)); }
  g.closePath(); g.fill();
  // the snout
  g.fillStyle = c[0];
  if (snout === 'bill') { g.beginPath(); g.moveTo(x0 + L * 0.02, -h * 0.12); g.lineTo(x0 - L * 0.3, -h * 0.02); g.lineTo(x0 + L * 0.02, h * 0.1); g.fill(); }
  if (snout === 'needle') { g.beginPath(); g.moveTo(x0 + L * 0.06, -h * 0.25); g.lineTo(x0 - L * 0.12, 0); g.lineTo(x0 + L * 0.06, h * 0.25); g.fill(); }
  if (snout === 'long') { g.beginPath(); g.moveTo(x0 + L * 0.04, -h * 0.4); g.lineTo(x0 - L * 0.08, h * 0.1); g.lineTo(x0 + L * 0.06, h * 0.3); g.fill(); }
  if (snout === 'beak') { g.fillStyle = c[3]; g.beginPath(); g.arc(x0 + L * 0.02, h * 0.05, h * 0.28, 0, Math.PI * 2); g.fill(); }
  if (!detail) return;
  markings(g, mark, xs, top, h, L, c, x0, x1);
  // the gill's edge, the eye, the mouth, the barbels
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = Math.max(1, L * 0.012);
  { const gr = Math.min(h * 0.75, L * 0.12); g.beginPath(); g.arc(x0 + L * 0.13 + gr, 0, gr, Math.PI * 0.68, Math.PI * 1.32); g.stroke(); }
  if (mark === 'gills') for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x0 + L * (0.22 + k * 0.03), -h * 0.4); g.lineTo(x0 + L * (0.21 + k * 0.03), h * 0.3); g.stroke(); }
  const ex = x0 + L * (snout === 'long' ? 0.12 : 0.09), ey = -h * 0.28, er = Math.max(1.5, L * 0.032);
  g.fillStyle = '#f8f4e0'; g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#141414'; g.beginPath(); g.arc(ex + er * 0.15, ey, er * 0.62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.beginPath(); g.moveTo(x0 + L * 0.01, h * 0.12); g.lineTo(x0 + L * (snout === 'big' ? 0.12 : 0.06), h * 0.16); g.stroke();
  if (snout === 'whisk') { g.strokeStyle = c[3]; g.lineWidth = Math.max(1, L * 0.01); for (const [dx, dy] of [[-0.14, 0.25], [-0.1, 0.45], [-0.16, -0.05]]) { g.beginPath(); g.moveTo(x0 + L * 0.03, h * 0.12); g.quadraticCurveTo(x0 + L * dx * 0.5, h * (dy + 0.2), x0 + L * dx, h * (dy + 0.35)); g.stroke(); } }
  if (snout === 'hook') { g.fillStyle = c[1]; g.beginPath(); g.moveTo(x0, -h * 0.05); g.quadraticCurveTo(x0 - L * 0.04, h * 0.3, x0 + L * 0.03, h * 0.32); g.lineTo(x0 + L * 0.04, h * 0.15); g.fill(); }
}

function tailFin(g, tail, x1, h, L) {
  const t = L * 0.18;
  g.beginPath();
  switch (tail) {
    case 'fork': g.moveTo(x1 - 2, 0); g.lineTo(x1 + t, -h * 1.05); g.lineTo(x1 + t * 0.55, 0); g.lineTo(x1 + t, h * 1.05); break;
    case 'lunate': g.moveTo(x1 - 2, 0); g.quadraticCurveTo(x1 + t * 0.6, -h * 0.3, x1 + t * 1.1, -h * 1.4); g.quadraticCurveTo(x1 + t * 0.55, 0, x1 + t * 1.1, h * 1.4); g.quadraticCurveTo(x1 + t * 0.6, h * 0.3, x1 - 2, 0); break;
    case 'lyre': g.moveTo(x1 - 2, 0); g.lineTo(x1 + t * 1.2, -h * 1.1); g.lineTo(x1 + t * 0.6, 0); g.lineTo(x1 + t * 1.2, h * 1.1); break;
    case 'square': g.moveTo(x1 - 2, -h * 0.25); g.lineTo(x1 + t, -h * 0.85); g.lineTo(x1 + t * 0.92, h * 0.85); g.lineTo(x1 - 2, h * 0.25); break;
    case 'round': g.moveTo(x1 - 2, -h * 0.3); g.quadraticCurveTo(x1 + t * 1.4, -h * 0.9, x1 + t * 1.1, 0); g.quadraticCurveTo(x1 + t * 1.4, h * 0.9, x1 - 2, h * 0.3); break;
    case 'shark': g.moveTo(x1 - 2, -h * 0.2); g.lineTo(x1 + t * 1.1, -h * 1.5); g.lineTo(x1 + t * 0.5, h * 0.1); g.lineTo(x1 + t * 0.6, h * 0.8); g.lineTo(x1 - 2, h * 0.2); break;
    case 'coel': g.moveTo(x1 - 2, 0); g.lineTo(x1 + t, -h * 0.9); g.lineTo(x1 + t * 0.7, 0); g.lineTo(x1 + t * 1.3, -h * 0.05); g.lineTo(x1 + t * 1.3, h * 0.05); g.lineTo(x1 + t * 0.7, 0); g.lineTo(x1 + t, h * 0.9); break;
    case 'eel': g.moveTo(x1 - 2, -h * 0.6); g.quadraticCurveTo(x1 + t * 0.9, -h * 0.2, x1 + t * 0.9, 0); g.quadraticCurveTo(x1 + t * 0.9, h * 0.2, x1 - 2, h * 0.6); break;
    default: g.moveTo(x1 - 2, -h * 0.3); g.lineTo(x1 + t * 0.5, 0); g.lineTo(x1 - 2, h * 0.3); break;
  }
  g.closePath(); g.fill();
}

function dorsalFin(g, dorsal, xs, top, h, L, c) {
  const fin = (a, b, hh, notch) => { g.beginPath(); g.moveTo(xs(a), top(a) * 0.95); const n = 6; for (let i = 0; i <= n; i++) { const k = a + (b - a) * i / n; g.lineTo(xs(k), top(k) - h * hh * (notch ? (i % 2 ? 0.7 : 1) : 1) * Math.sin(Math.PI * Math.min(1, (i / n) * 1.6))); } g.lineTo(xs(b), top(b) * 0.95); g.closePath(); g.fill(); };
  switch (dorsal) {
    case 'spiny': fin(0.3, 0.75, 0.55, true); break;
    case 'spiny2': fin(0.28, 0.5, 0.55, true); fin(0.52, 0.8, 0.4, false); break;
    case 'low': fin(0.38, 0.6, 0.35, false); break;
    case 'long': fin(0.22, 0.88, 0.32, false); break;
    case 'back': fin(0.72, 0.88, 0.5, false); g.beginPath(); g.moveTo(xs(0.72), -top(0.72)); g.lineTo(xs(0.8), -top(0.8) + h * 0.5); g.lineTo(xs(0.88), -top(0.88)); g.fill(); break;
    case 'small': fin(0.36, 0.5, 0.45, false); fin(0.68, 0.76, 0.3, false); break;
    case 'sail': g.fillStyle = c[3]; g.beginPath(); g.moveTo(xs(0.12), top(0.12)); g.quadraticCurveTo(xs(0.3), top(0.3) - h * 3.2, xs(0.62), top(0.62) - h * 1.2); g.lineTo(xs(0.66), top(0.66)); g.closePath(); g.fill(); break;
    case 'tall': g.beginPath(); g.moveTo(xs(0.35), top(0.35)); g.quadraticCurveTo(xs(0.75), top(0.6) - h * 0.35, xs(1.06), -h * 0.62); g.lineTo(xs(0.9), top(0.9)); g.closePath(); g.fill(); g.beginPath(); g.moveTo(xs(0.45), -top(0.45)); g.quadraticCurveTo(xs(0.75), -top(0.6) + h * 0.35, xs(1.06), h * 0.62); g.lineTo(xs(0.9), -top(0.9)); g.closePath(); g.fill(); break;
    case 'shark': g.beginPath(); g.moveTo(xs(0.36), top(0.36)); g.lineTo(xs(0.46), top(0.4) - h * 1.1); g.lineTo(xs(0.58), top(0.58)); g.closePath(); g.fill(); break;
    case 'lion': g.strokeStyle = c[3]; g.lineWidth = Math.max(1, L * 0.012); for (let i = 0; i < 9; i++) { const k = 0.25 + i * 0.07; g.beginPath(); g.moveTo(xs(k), top(k)); g.lineTo(xs(k) + L * 0.05, top(k) - h * (1.2 + (i % 2) * 0.3)); g.stroke(); } for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(xs(0.3), h * 0.3); g.lineTo(xs(0.3 + i * 0.06), h * (1.6 + (i % 2) * 0.4)); g.stroke(); } break;
    case 'filament': fin(0.45, 0.62, 0.6, false); g.strokeStyle = c[3]; g.lineWidth = Math.max(1, L * 0.01); g.beginPath(); g.moveTo(xs(0.6), top(0.6) - h * 0.5); g.quadraticCurveTo(xs(0.8), top(0.7) - h * 0.9, xs(0.95), top(0.9) - h * 0.2); g.stroke(); break;
    case 'fringe': for (const sg of [1, -1]) { g.beginPath(); g.moveTo(xs(0.1), 0); for (let i = 0; i <= 12; i++) { const k = 0.1 + i * 0.075; g.lineTo(xs(k), sg * (Math.abs(top(k)) + h * 0.22)); } g.lineTo(xs(1), 0); g.closePath(); g.fill(); } break;
    case 'oar': g.fillStyle = '#d83a3a'; fin(0.02, 0.98, 0.35, false); g.beginPath(); for (let i = 0; i < 5; i++) { g.moveTo(xs(0.04 + i * 0.015), top(0.04)); g.lineTo(xs(0.02 + i * 0.03), top(0.04) - h * (2.4 + i * 0.3)); g.lineTo(xs(0.06 + i * 0.015), top(0.06)); } g.fill(); break;
    case 'lure': g.strokeStyle = c[1]; g.lineWidth = Math.max(1, L * 0.012); g.beginPath(); g.moveTo(xs(0.18), top(0.18)); g.quadraticCurveTo(xs(0.05), top(0.1) - h * 1.2, xs(-0.06), top(0.1) - h * 0.6); g.stroke(); g.fillStyle = '#ffe070'; g.shadowColor = '#ffe070'; g.shadowBlur = L * 0.08; g.beginPath(); g.arc(xs(-0.06), top(0.1) - h * 0.6, Math.max(2, L * 0.03), 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; break;
    case 'eel': g.beginPath(); g.moveTo(xs(0.3), top(0.3)); for (let i = 0; i <= 10; i++) { const k = 0.3 + i * 0.07; g.lineTo(xs(k), top(k) - h * 0.35); } g.lineTo(xs(1), 0); for (let i = 10; i >= 0; i--) { const k = 0.4 + i * 0.06; g.lineTo(xs(k), -top(k) + h * 0.3); } g.closePath(); g.fill(); break;
    default: break;
  }
}

function markings(g, mark, xs, top, h, L, c, x0, x1) {
  g.save();
  // (inside the body only: a clip of its outline)
  g.beginPath(); g.moveTo(x0, 0); for (let i = 1; i <= 16; i++) { const k = i / 16; g.lineTo(xs(k), top(k)); } for (let i = 16; i >= 0; i--) { const k = i / 16; g.lineTo(xs(k), -top(k)); } g.closePath(); g.clip();
  const dark = 'rgba(0,0,0,.3)', light = 'rgba(255,255,255,.55)';
  const dots = (col, n, r) => { g.fillStyle = col; for (let i = 0; i < n; i++) { const k = 0.25 + ((i * 0.618) % 1) * 0.65, v = ((i * 0.37) % 1) * 1.4 - 0.7; g.beginPath(); g.arc(xs(k), top(k) * v, r, 0, Math.PI * 2); g.fill(); } };
  switch (mark) {
    case 'bars': g.fillStyle = dark; for (let i = 0; i < 6; i++) { const k = 0.25 + i * 0.11; g.fillRect(xs(k), -h, L * 0.035, h * 1.5); } break;
    case 'bands': g.fillStyle = '#f8f8f8'; for (const k of [0.22, 0.5, 0.82]) g.fillRect(xs(k) - L * 0.035, -h, L * 0.07, h * 2); g.strokeStyle = '#1a1a1a'; g.lineWidth = Math.max(1, L * 0.01); for (const k of [0.22, 0.5, 0.82]) g.strokeRect(xs(k) - L * 0.035, -h, L * 0.07, h * 2); break;
    case 'spots': dots(dark, 14, Math.max(1, L * 0.018)); break;
    case 'patches': g.fillStyle = c[1]; for (const [k, v, r] of [[0.3, -0.3, 0.13], [0.55, 0.1, 0.1], [0.75, -0.4, 0.08]]) { g.beginPath(); g.ellipse(xs(k), h * v, L * r, h * 0.55, 0, 0, Math.PI * 2); g.fill(); } break;
    case 'line': g.fillStyle = dark; g.fillRect(x0 + L * 0.2, -h * 0.08, (x1 - x0) * 0.75, h * 0.14); break;
    case 'wavy': g.strokeStyle = dark; g.lineWidth = Math.max(1, L * 0.012); for (let i = 0; i < 9; i++) { const k = 0.3 + i * 0.075; g.beginPath(); g.moveTo(xs(k), top(k)); g.quadraticCurveTo(xs(k + 0.04), top(k) * 0.5, xs(k), -h * 0.05); g.stroke(); } break;
    case 'scales': g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 1; for (let i = 0; i < 10; i++) for (let j = -2; j <= 2; j++) { const k = 0.25 + i * 0.07; g.beginPath(); g.arc(xs(k), j * h * 0.35, L * 0.025, -Math.PI / 2, Math.PI / 2); g.stroke(); } break;
    case 'eyespot': g.fillStyle = '#141414'; g.beginPath(); g.arc(xs(0.88), -h * 0.15, Math.max(2, L * 0.03), 0, Math.PI * 2); g.fill(); break;
    case 'finlets': g.fillStyle = c[3]; for (let i = 0; i < 6; i++) { const k = 0.8 + i * 0.03; g.fillRect(xs(k), top(k) - 1, L * 0.012, L * 0.02); g.fillRect(xs(k), -top(k) - L * 0.02 + 1, L * 0.012, L * 0.02); } break;
    case 'scutes': g.fillStyle = light; for (let i = 0; i < 10; i++) { const k = 0.2 + i * 0.075; g.beginPath(); g.moveTo(xs(k), top(k) + 1); g.lineTo(xs(k) + L * 0.015, top(k) + L * 0.03); g.lineTo(xs(k) + L * 0.03, top(k) + 1); g.fill(); } break;
    case 'tangmark': g.fillStyle = '#141e4a'; g.beginPath(); g.moveTo(xs(0.18), -h * 0.2); g.quadraticCurveTo(xs(0.5), -h * 0.9, xs(0.92), -h * 0.1); g.quadraticCurveTo(xs(0.6), -h * 0.4, xs(0.3), 0); g.closePath(); g.fill(); break;
    case 'face': g.fillStyle = c[3]; g.globalAlpha = 0.8; g.beginPath(); g.ellipse(x0 + L * 0.03, h * 0.08, L * 0.05, h * 0.12, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; break;
    case 'ear': g.fillStyle = '#1a1a2a'; g.beginPath(); g.ellipse(x0 + L * 0.27, -h * 0.12, L * 0.035, h * 0.12, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = Math.max(1, L * 0.02); for (let i = 0; i < 6; i++) { const k = 0.32 + i * 0.1; g.beginPath(); g.moveTo(xs(k), top(k)); g.lineTo(xs(k - 0.04), -top(k) * 0.4); g.stroke(); } break;
    default: break;
  }
  g.restore();
}

// the soft ones and the odd ones
function squid(g, L, c, ink) {
  const h = L * 0.13;
  g.fillStyle = c[3];
  for (let i = 0; i < 8; i++) { const v = (i - 3.5) / 3.5; g.beginPath(); g.moveTo(-L * 0.12, v * h * 0.6); g.quadraticCurveTo(-L * 0.32, v * h * 1.1, -L * 0.5, v * h * (0.8 + (i % 3) * 0.3)); g.lineTo(-L * 0.46, v * h * 0.6); g.closePath(); g.fill(); }
  const grad = ink ? c[0] : g.createLinearGradient(0, -h, 0, h);
  if (!ink) { grad.addColorStop(0, c[1]); grad.addColorStop(0.5, c[0]); grad.addColorStop(1, c[2]); }
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(-L * 0.14, -h); g.quadraticCurveTo(L * 0.3, -h * 1.1, L * 0.5, 0); g.quadraticCurveTo(L * 0.3, h * 1.1, -L * 0.14, h); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(L * 0.28, -h * 0.6); g.lineTo(L * 0.42, -h * 1.5); g.lineTo(L * 0.5, 0); g.lineTo(L * 0.42, h * 1.5); g.lineTo(L * 0.28, h * 0.6); g.fill();
  if (!ink) { g.fillStyle = '#141414'; g.beginPath(); g.arc(-L * 0.08, -h * 0.25, Math.max(2, L * 0.03), 0, Math.PI * 2); g.fill(); }
}
function octopus(g, L, c, ink) {
  const r = L * 0.2;
  g.strokeStyle = c[3]; g.lineCap = 'round'; g.lineWidth = Math.max(2, L * 0.05);
  for (let i = 0; i < 8; i++) { const a = Math.PI * 0.2 + i * Math.PI * 0.6 / 7; g.beginPath(); g.moveTo(0, r * 0.4); g.bezierCurveTo(Math.cos(a) * r * 1.6, r * 0.6 + Math.sin(a) * r, Math.cos(a) * L * 0.45, r + Math.sin(a) * r * 0.4, Math.cos(a) * L * 0.5 + (i % 2 ? 6 : -6), r * 1.4); g.stroke(); }
  g.fillStyle = c[0]; g.beginPath(); g.ellipse(0, -r * 0.3, r, r * 1.15, 0, 0, Math.PI * 2); g.fill();
  if (!ink) { g.fillStyle = c[1]; g.beginPath(); g.ellipse(-r * 0.2, -r * 0.7, r * 0.5, r * 0.5, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#141414'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.45, r * 0.15, Math.max(2, L * 0.025), 0, Math.PI * 2); g.fill(); } }
}
function isopod(g, L, c, ink) {
  const h = L * 0.24;
  g.fillStyle = c[3]; for (let i = 0; i < 7; i++) { const x = -L * 0.3 + i * L * 0.09; g.fillRect(x, h * 0.6, L * 0.02, h * 0.5); }
  g.fillStyle = c[0]; g.beginPath(); g.ellipse(0, 0, L * 0.45, h, 0, 0, Math.PI * 2); g.fill();
  if (!ink) { g.strokeStyle = c[1]; g.lineWidth = Math.max(1, L * 0.012); for (let i = 1; i < 8; i++) { const x = -L * 0.4 + i * L * 0.1; g.beginPath(); g.moveTo(x, -h * Math.sqrt(Math.max(0, 1 - (x / (L * 0.45)) ** 2))); g.lineTo(x, h * 0.5); g.stroke(); } g.fillStyle = '#141414'; g.beginPath(); g.arc(-L * 0.38, -h * 0.2, Math.max(2, L * 0.025), 0, Math.PI * 2); g.fill(); }
}
function ray(g, L, c, ink) {
  const w = L * 0.36;
  g.strokeStyle = c[3]; g.lineWidth = Math.max(1, L * 0.015); g.beginPath(); g.moveTo(L * 0.1, 0); g.quadraticCurveTo(L * 0.35, w * 0.15, L * 0.5, -w * 0.05); g.stroke();
  g.fillStyle = c[0]; g.beginPath(); g.moveTo(-L * 0.45, 0); g.quadraticCurveTo(-L * 0.1, -w * 1.4, L * 0.12, -w * 0.15); g.lineTo(L * 0.12, w * 0.15); g.quadraticCurveTo(-L * 0.1, w * 1.4, -L * 0.45, 0); g.fill();
  if (!ink) { g.fillStyle = c[1]; g.beginPath(); g.ellipse(-L * 0.12, 0, L * 0.12, w * 0.3, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#141414'; for (const s of [-1, 1]) { g.beginPath(); g.arc(-L * 0.25, s * w * 0.14, Math.max(1.5, L * 0.02), 0, Math.PI * 2); g.fill(); } }
}
