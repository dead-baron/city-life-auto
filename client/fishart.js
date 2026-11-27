// The fish, as pixel art (the owner, 11-16: "the fish art is still placeholder"). Every species in shared/fish.js has
// its own sprite on a small pixel grid in the game's SNES style, after his species sheets (FC14-FC20, FC01-FC02 for the
// legendaries): side on, the head to the left, a dark coloured outline, the back / flank / belly in three tones dithered
// where they meet, a sheen row, rayed fins, the eye with its catch-light, and each species' own marks - the perch's bars,
// the striper's stripes, the brook trout's haloed spots and worm marks, the koi's patches, the clownfish's bands... The
// legendaries glow and sparkle. Made here, procedurally, from the data (no image file): the page loads it with fishing
// (client/fishing.js) or the phone's Fish log, never with its first load.
//   fishSprite(f) -> { w, h, px: Uint32Array (ABGR, as ImageData's bytes), seed }   the species' pixels (kept)
//   drawFish(g, f, x, y, L, o)   centred on (x, y), about L px nose to tail; o.ink: one flat colour (the fight's
//                                silhouette), o.glow: a light round it
//   fishCanvas(f, scale) -> a canvas of the sprite at a whole-number scale (the Fish log), or null without a DOM

// ---- the shapes (shared/fish.js shape) ---------------------------------------------------------------------------
// [height / length, tail, dorsal, snout, length in art px]
//   tails: fork, round, square, lunate, lyre, shark, eel, coel, none; dorsals: spiny, spiny2, low, long, back, small,
//   sail, tall, shark, lion, filament, fringe, oar, lure, eel, none; snouts: blunt, big, duck, needle, long, whisk, hook,
//   snout, beak, bill
const SH = {
  pan: [0.56, 'fork', 'spiny', 'blunt', 34], perch: [0.32, 'fork', 'spiny2', 'blunt', 40], bass: [0.34, 'round', 'spiny2', 'big', 44],
  pike: [0.19, 'fork', 'back', 'duck', 54], carp: [0.36, 'fork', 'long', 'whisk', 44], koi: [0.32, 'fork', 'long', 'whisk', 46],
  cat: [0.24, 'fork', 'low', 'whisk', 48], sturgeon: [0.17, 'shark', 'back', 'long', 56], trout: [0.26, 'square', 'low', 'blunt', 44],
  salmon: [0.29, 'square', 'low', 'hook', 46], gar: [0.13, 'round', 'back', 'needle', 58], eel: [0.09, 'eel', 'eel', 'blunt', 58],
  drum: [0.32, 'square', 'spiny2', 'blunt', 44], bowfin: [0.24, 'round', 'long', 'blunt', 46], snook: [0.24, 'fork', 'spiny2', 'big', 48],
  tarpon: [0.3, 'fork', 'filament', 'big', 52], mack: [0.2, 'fork', 'small', 'blunt', 40], flat: [0.52, 'round', 'fringe', 'blunt', 42],
  tuna: [0.3, 'lunate', 'small', 'blunt', 48], snapper: [0.38, 'fork', 'spiny', 'blunt', 42], wrasse: [0.38, 'square', 'spiny', 'snout', 42],
  trigger: [0.5, 'lyre', 'spiny', 'blunt', 38], barracuda: [0.14, 'fork', 'small', 'duck', 56], lion: [0.42, 'round', 'lion', 'blunt', 38],
  bone: [0.24, 'fork', 'small', 'snout', 46], pompano: [0.62, 'fork', 'small', 'blunt', 38], grouper: [0.38, 'round', 'spiny2', 'big', 48],
  clown: [0.44, 'round', 'spiny', 'blunt', 30], tang: [0.62, 'lunate', 'long', 'blunt', 34], angel: [0.8, 'square', 'tall', 'blunt', 32],
  parrot: [0.36, 'lyre', 'long', 'beak', 44], mahi: [0.3, 'fork', 'long', 'blunt', 52], wahoo: [0.15, 'lunate', 'small', 'duck', 58],
  sail: [0.22, 'lunate', 'sail', 'bill', 60], bill: [0.22, 'lunate', 'small', 'bill', 62], shark: [0.22, 'shark', 'shark', 'blunt', 56],
  rock: [0.36, 'round', 'spiny', 'big', 42], angler: [0.56, 'round', 'lure', 'big', 40], oar: [0.1, 'none', 'oar', 'blunt', 64],
  coel: [0.32, 'coel', 'low', 'blunt', 50],
  squid: [0, '', '', '', 46], octopus: [0, '', '', '', 40], isopod: [0, '', '', '', 32], ray: [0, '', '', '', 44],
};
// ---- each species' own look (FC12-FC20) --------------------------------------------------------------------------
// m: its marks, in order (see MARK below: [name, ...args]); n: its length in art px (else its shape's); eye: 'big' |
// 'blind' | 'red' | 'glow'; hr: its own height; extra: the colours its marks use
const SP = {
  bluegill: { m: [['bars', 6, 0.18, '#1e2e48'], ['ear', '#101828'], ['blush', '#f09040']] },
  pumpkinseed: { m: [['speck', 0.16, '#f0a030', 1], ['cheek', '#5ab0e0'], ['ear', '#101010', '#e8402a']] },
  crappie: { m: [['speck', 0.3, '#1a1a1a', 1], ['speck', 0.08, '#2a2a28', 2]], n: 36 },
  perch: { m: [['bars', 6, 0.55, '#2a3218'], ['sheen', '#f8f0a0']] },
  bass: { m: [['blotch', '#2a3a18'], ['speck', 0.05, '#4a6a2a', 1]], tail: 'square' },
  smallmouth: { m: [['bars', 9, 0.28, '#4a3a1a']], eye: 'red', tail: 'square' },
  walleye: { m: [['saddles', 5, '#4a4a2a'], ['tailtip', '#f8f8f0']], eye: 'big' },
  muskie: { m: [['bars', 12, 0.4, '#4a5232']], n: 60 },
  pike: { m: [['lightspots', 0.22, '#e0e0a8']] },
  carp: { m: [['scales', '#5a4a2a'], ['finred', '#b8603a']] },
  goldfish: { m: [['scales', '#c84a10']], n: 36 },
  koi: { m: [['patches', '#e04a2a', 4], ['patches', '#1a1a1a', 2, 1]] },
  catfish: { m: [['fewspots', '#2a2a30']] },
  sturgeon: { m: [['scutes', '#e8e8d0']] },
  brooktrout: { m: [['vermic', '#a8b070'], ['halospots', '#e83a2a', '#6ab0e8'], ['finedge', '#f8f8f0']] },
  rainbow: { m: [['band', '#e070a0', -0.05, 0.25], ['spots', 0.14, '#1a1a1a', 0, 0.85]] },
  browntrout: { m: [['spots', 0.14, '#2a1a10', 0, 0.75], ['halospots', '#d83a2a', '#f0e0b0']] },
  cutthroat: { m: [['spots', 0.18, '#1a1a1a', 0.45, 1], ['throat', '#e03a2a']] },
  goldentrout: { m: [['band', '#e04a2a', 0.05, 0.3], ['parr', '#7a6a3a']] },
  steelhead: { m: [['band', '#d888a8', -0.05, 0.2], ['spots', 0.1, '#2a3a4a', 0, 0.6]] },
  salmon: { m: [['head', '#4a7a5a', 0.24]] },
  bullhead: { m: [['mottle', '#4a3420', 0.3]] },
  longnosegar: { m: [['spots', 0.08, '#3a3a20', 0.5, 1], ['finspots', '#3a3a20']] },
  eel: { m: [['shade', '#3a3a20']] },
  redfish: { m: [['eyespot', '#141414', '#f0d0b0']] },
  seatrout: { m: [['spots', 0.2, '#1e2a38', 0.2, 1]] },
  spottedgar: { m: [['spots', 0.22, '#2a2a14', 0, 1], ['finspots', '#2a2a14']] },
  bowfin: { m: [['eyespot', '#141414', '#e8a030'], ['mottle', '#3a3a1a', 0.2]] },
  snook: { m: [['line', '#141414', 2], ['finyellow', '#e8d040']] },
  alligatorgar: { m: [['spots', 0.1, '#2a2a14', 0, 1], ['finspots', '#2a2a14']], n: 64, hr: 0.16 },
  tarpon: { m: [['bigscales', '#9aa8b8']] },
  mackerel: { m: [['wavy', '#1a3a3a']] },
  herring: { m: [['sheen', '#ffffff']], n: 34 },
  sardine: { m: [['dotrow', '#1a2a3a']], n: 30 },
  seabass: { m: [['netlight', '#8a8a96']] },
  stripedbass: { m: [['stripes', 7, '#3a4450']], tail: 'fork' },
  menhaden: { m: [['shoulder', '#2a2a2a'], ['dotrow', '#6a6a5a']], n: 34 },
  flounder: { m: [['ocelli', '#4a3a24', '#e8e0c0']] },
  halibut: { m: [['mottle', '#3a3020', 0.35], ['lightspots', 0.06, '#c8c0a8']], n: 50 },
  bonito: { m: [['oblique', '#1a2a4a']] },
  sheepshead: { m: [['bars', 6, 0.9, '#1a1a1a']] },
  mangrovesnapper: { m: [['eyebar', '#4a2a1a'], ['speck', 0.06, '#8a4a2a', 1]] },
  stingray: { m: [] },
  squid: { m: [] },
  octopus: { m: [] },
  yellowtail: { m: [['midstripe', '#f0d030'], ['speck', 0.07, '#f0d030', 1, 0.45]] },
  grunt: { m: [['bluestripes', '#2a6ab8']] },
  butterflyfish: { m: [['eyebar', '#2a2a2a'], ['eyespot', '#141414', '#f8f8f0'], ['chevrons', '#a8a8a0']] },
  hogfish: { m: [['snoutbar', '#7a3a3a']], spines: 1 },
  triggerfish: { m: [['cheek', '#5ad0f0'], ['speck', 0.07, '#2a3a4a', 1]] },
  barracuda: { m: [['bars', 18, 0.55, '#3a4858'], ['tailspots', '#141414']], n: 62 },
  lionfish: { m: [['zebra', '#f8f0e8', '#a83a2a']] },
  bonefish: { m: [['stripes', 6, '#a8b0c0', 0.5]] },
  permit: { m: [['finblack', '#2a3440']] },
  grouper: { m: [['lightspots', 0.14, '#e8b090'], ['mottle', '#7a3a2a', 0.2]] },
  clownfish: { m: [['bands', '#f8f8f8', '#141414']] },
  bluetang: { m: [['palette', '#141e4a']] },
  angelfish: { m: [['crown', '#141e4a', '#3ac0f0'], ['scaledots', '#f0d040']] },
  parrotfish: { m: [['scales', '#2a8a7a'], ['beakpink', '#f0a0a0']] },
  skipjack: { m: [['bellystripes', '#2a3a5a']] },
  yellowfin: { m: [['band', '#f0d030', -0.1, 0.05], ['finyellow', '#f0d030']], n: 54 },
  tuna: { m: [['finlets', '#f0d030']], n: 58, hr: 0.32 },
  mahi: { m: [['spots', 0.06, '#2a6aa0', 0, 0.9]], forehead: 1 },
  wahoo: { m: [['tigerbars', '#2a3a6a']] },
  sailfish: { m: [['palebars', '#9ab0e8'], ['sailspots', '#1a2a6a']] },
  whitemarlin: { m: [['palebars', '#c8d0e8']] },
  marlin: { m: [['palebars', '#8ab0f0']], n: 68 },
  swordfish: { m: [['shade', '#2a2a38']], n: 66, sword: 1 },
  goliath: { m: [['mottle', '#3a2a1a', 0.35], ['bars', 5, 0.5, '#4a3a24']], n: 56, hr: 0.42 },
  mako: { m: [['counter']], n: 60 },
  lanternfish: { m: [['photo', '#7af0ff']], n: 30 },
  rockfish: { m: [['mottle', '#8a2a2a', 0.3]] },
  anglerfish: { m: [['mottle', '#2a1a10', 0.3], ['teeth', '#f0f0e0']] },
  oarfish: { m: [['spots', 0.08, '#4a5a6a', 0, 1], ['wavy', '#8a9aa8']], n: 70 },
  coelacanth: { m: [['lightspots', 0.1, '#c8d8f0']] },
  frilledshark: { m: [['frill', '#c86a6a']], n: 60, eye: 'big' },
  vampiresquid: { m: [], eye: 'red' },
  isopod: { m: [] },
  sleepershark: { m: [['speck', 0.05, '#2a2a30', 1]], n: 64, eye: 'glow' },
  cavefish: { m: [['sheen', '#ffffff']], n: 32, eye: 'blind' },
  cavecat: { m: [['sheen', '#ffffff']], eye: 'blind' },
  // the legendaries (FC01, FC02): big, lit, sparkling
  goldenkoi: { m: [['scales', '#c88a10'], ['patches', '#f8f0c0', 3]], glow: '#ffd34a', n: 52 },
  oldsturgeon: { m: [['scutes', '#c8c8b0'], ['mottle', '#2a2a20', 0.25]], glow: '#ffd34a', n: 70 },
  rainbowking: { m: [['band', '#f070c0', -0.15, 0.1], ['band', '#f0c040', 0.1, 0.22], ['band', '#60c0f0', 0.22, 0.34], ['spots', 0.1, '#1a1a1a', 0, 0.7]], glow: '#ffd34a', n: 54 },
  bigmuddy: { m: [['mottle', '#2a2418', 0.35]], glow: '#ffd34a', n: 62, hr: 0.28 },
  ghostkoi: { m: [['scales', '#a8d8f0'], ['patches', '#ffffff', 3]], glow: '#9ae8ff', n: 52, eye: 'glow' },
  gatorgar: { m: [['spots', 0.12, '#2a3414', 0, 1], ['finspots', '#2a3414']], glow: '#ffd34a', n: 70, hr: 0.17 },
  barndoor: { m: [['mottle', '#2a2418', 0.35], ['lightspots', 0.06, '#a89a80']], glow: '#ffd34a', n: 56 },
  silverking: { m: [['bigscales', '#a8b8d0']], glow: '#ffd34a', n: 60 },
  bluethunder: { m: [['palebars', '#9ac0ff']], glow: '#ffd34a', n: 72 },
  kraken: { m: [], glow: '#ff7a5a', n: 56 },
};

// ---- colours ------------------------------------------------------------------------------------------------------
const rgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lit = (a, t) => mix(a, [255, 255, 255], t), dim = (a, t) => mix(a, [0, 0, 0], t);
const pack = (c, al = 255) => ((al << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
const lum = (c) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
// a number from a pixel and a seed, 0..1 (the same everywhere)
function hash(x, y, s) {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(s | 0, 83492791);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const seedOf = (id) => { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---- the grid -------------------------------------------------------------------------------------------------------
// lab: 0 empty, 1 body, 2 a fin above / below, 3 the tail, 4 a fin over the body (the pectoral), 5 a bill / barbel / limb
function grid(W, H) { return { W, H, lab: new Uint8Array(W * H), col: new Uint32Array(W * H), cl: [] }; }
const inG = (G, x, y) => x >= 0 && y >= 0 && x < G.W && y < G.H;
// (the body goes over anything; a fin, a bill, a barbel only where nothing is yet)
function put(G, x, y, l) { x = Math.floor(x); y = Math.floor(y); if (inG(G, x, y) && (l === 1 || !G.lab[y * G.W + x])) G.lab[y * G.W + x] = l; }
function poly(G, pts, l) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
    const px = x + 0.5, py = y + 0.5;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) put(G, x, y, l);
  }
}
function disc(G, cx, cy, rx, ry, l) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) put(G, x, y, l); } }
function stroke(G, pts, l, w = 1) { for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2)); for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n; for (let j = 0; j < w; j++) put(G, x + (j % 2), y + (j >> 1), l); } } }

// ---- a fish's body: the outline from nose to tail ------------------------------------------------------------------
function fishBody(G, f, S, sp) {
  const [hr0, tail0, dorsal, snout] = S, tail = sp.tail || tail0, N = sp.n || S[4], hr = sp.hr || hr0;
  const xn = 6 + (snout === 'bill' ? Math.round(N * 0.3) : snout === 'needle' ? Math.round(N * 0.12) : snout === 'long' ? 4 : snout === 'duck' ? 2 : 0);
  const blen = Math.round(N * (tail === 'eel' || tail === 'none' ? 0.88 : 0.78)), xt = xn + blen, y0 = G.H / 2, h = Math.max(2, (N * hr) / 2);
  const T = N * (tail === 'eel' ? 0.1 : tail === 'none' ? 0.04 : 0.2);
  const blunt = snout === 'blunt' || snout === 'big' || snout === 'whisk' || snout === 'beak' ? 0.42 : snout === 'hook' ? 0.36 : 0.22;
  const pd = tail === 'eel' || tail === 'none' ? 0.5 : 0.28;
  // the half-height at k (0 the nose, 1 the tail's root): a smooth belly, a blunt nose, the narrow wrist before the tail
  const half = (k) => h * Math.max(Math.sin(Math.PI * Math.min(1, Math.pow(Math.max(0, k), 0.78))), blunt * Math.sqrt(Math.min(1, k / 0.1)), pd * Math.max(0, (k - 0.55) / 0.45));
  const topK = sp.forehead ? (k) => half(k) * (k < 0.2 ? 1.12 : 1) : half;
  const bot = snout === 'big' ? 1 : 0.9;
  const B = { xn, xt, y0, h, N, T, half, top: (x) => y0 - topK((x - xn) / (xt - xn)), bottom: (x) => y0 + half((x - xn) / (xt - xn)) * bot };
  // fins behind the body
  const ty = (k) => B.top(xn + k * (xt - xn)), by = (k) => B.bottom(xn + k * (xt - xn)), X = (k) => xn + k * (xt - xn);
  tailFin(G, tail, xt, y0, h, T);
  dorsalFin(G, dorsal, X, ty, h, N, sp);
  if (tail !== 'eel' && dorsal !== 'fringe' && tail !== 'none') {
    poly(G, [[X(0.6), by(0.6) - 1], [X(0.7), by(0.68) + h * 0.5], [X(0.8), by(0.8) + h * 0.38], [X(0.82), by(0.82) - 1]], 2);   // the anal fin
    poly(G, [[X(0.3), by(0.3) - 1], [X(0.36), by(0.32) + h * 0.45], [X(0.42), by(0.4) - 1]], 2);   // the pelvic fin
  }
  if (dorsal === 'fringe') poly(G, [[X(0.15), by(0.15) - 1], ...Array.from({ length: 9 }, (_, i) => { const k = 0.18 + i * 0.09; return [X(k), by(k) + h * 0.22]; }), [X(0.98), by(0.98) - 1]], 2);
  // the body
  for (let x = Math.floor(xn); x <= xt; x++) { const a = B.top(x + 0.5), b = B.bottom(x + 0.5); for (let y = Math.floor(a); y <= Math.ceil(b); y++) if (y + 0.5 >= a && y + 0.5 <= b) put(G, x, y, 1); }
  // the snouts
  if (snout === 'bill') { const L = N * 0.3; poly(G, [[xn + 2, y0 - h * 0.35], [xn - L, y0 - h * 0.15], [xn - L, y0 - h * 0.05], [xn + 2, y0 + h * 0.05]], sp.sword ? 1 : 5); }
  if (snout === 'needle') { const L = N * 0.12; poly(G, [[xn + 3, y0 - h * 0.45], [xn - L, y0 - 0.6], [xn - L, y0 + 0.9], [xn + 3, y0 + h * 0.4]], 1); }
  if (snout === 'long') poly(G, [[xn + 4, y0 - h * 0.7], [xn - 4, y0 + h * 0.15], [xn - 3, y0 + h * 0.4], [xn + 4, y0 + h * 0.5]], 1);
  if (snout === 'duck') poly(G, [[xn + 4, y0 - h * 0.55], [xn - 2, y0 - h * 0.15], [xn - 2, y0 + h * 0.3], [xn + 4, y0 + h * 0.6]], 1);
  if (snout === 'snout') poly(G, [[xn + 3, y0 - h * 0.5], [xn - 2, y0 + h * 0.05], [xn + 3, y0 + h * 0.4]], 1);
  if (snout === 'hook') { put(G, xn - 1, y0 + 1, 1); put(G, xn - 1, y0 + 2, 1); put(G, xn, y0 + 3, 1); }
  if (snout === 'whisk') { stroke(G, [[xn + 1, y0 + h * 0.15], [xn - 2, y0 + h * 0.5], [xn - 3, y0 + h * 0.9]], 5); stroke(G, [[xn + 2, y0 + h * 0.2], [xn + 1, y0 + h * 0.8], [xn, y0 + h * 1.2]], 5); if (f.shape === 'cat') stroke(G, [[xn + 2, y0 - h * 0.3], [xn - 4, y0 - h * 0.6], [xn - 6, y0 - h * 0.2]], 5); }
  if (f.id === 'hogfish') stroke(G, [[X(0.28), ty(0.28)], [X(0.24), ty(0.24) - h * 1.1]], 2);
  return B;
}
function tailFin(G, tail, xt, y0, h, T) {
  const P = (pts) => poly(G, pts.map(([a, b]) => [xt + a * T, y0 + b * h]), 3);
  switch (tail) {
    case 'fork': P([[-0.15, -0.3], [1, -1.15], [0.85, -0.9], [0.5, 0], [0.85, 0.9], [1, 1.15], [-0.15, 0.3]]); break;
    case 'lunate': P([[-0.15, -0.18], [0.45, -0.6], [1.05, -1.55], [0.8, -0.45], [0.6, 0], [0.8, 0.45], [1.05, 1.55], [0.45, 0.6], [-0.15, 0.18]]); break;
    case 'lyre': P([[-0.15, -0.3], [1.3, -1.25], [0.75, -0.6], [0.6, 0], [0.75, 0.6], [1.3, 1.25], [-0.15, 0.3]]); break;
    case 'square': P([[-0.15, -0.3], [0.95, -0.95], [0.85, -0.3], [0.85, 0.3], [0.95, 0.95], [-0.15, 0.3]]); break;
    case 'round': P([[-0.15, -0.3], [0.45, -0.72], [0.78, -0.5], [0.86, 0], [0.78, 0.5], [0.45, 0.72], [-0.15, 0.3]]); break;
    case 'shark': P([[-0.15, -0.25], [0.6, -0.9], [1.15, -1.75], [0.85, -0.6], [0.6, 0.05], [0.7, 0.8], [-0.15, 0.3]]); break;
    case 'coel': P([[-0.15, -0.3], [0.7, -1], [0.55, -0.15], [1.25, -0.12], [1.35, 0], [1.25, 0.12], [0.55, 0.15], [0.7, 1], [-0.15, 0.3]]); break;
    case 'eel': P([[-0.2, -0.6], [1.2, 0], [-0.2, 0.6]]); break;
    default: P([[-0.2, -0.5], [0.8, 0], [-0.2, 0.5]]); break;
  }
}
function dorsalFin(G, d, X, ty, h, N, sp) {
  const fin = (a, b, hh, saw, l = 2) => {
    const pts = [[X(a), ty(a) + 1]];
    const n = Math.max(3, Math.round((X(b) - X(a)) / 2));
    for (let i = 0; i <= n; i++) { const t = i / n, k = a + (b - a) * t; const env = saw ? (1 - t * 0.45) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.4 + 0.08)), 0.5) : Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.05)), 0.6); pts.push([X(k), ty(k) - h * hh * env * (saw && i % 2 ? 0.72 : 1)]); }
    pts.push([X(b), ty(b) + 1]);
    poly(G, pts, l);
  };
  switch (d) {
    case 'spiny': fin(0.26, 0.78, 0.62, true); break;
    case 'spiny2': fin(0.26, 0.52, 0.66, true); fin(0.52, 0.8, 0.46, false); break;
    case 'low': fin(0.38, 0.62, 0.42, false); fin(0.82, 0.88, 0.22, false); break;
    case 'long': fin(0.22, 0.9, 0.36, false); break;
    case 'back': fin(0.7, 0.9, 0.55, false); break;
    case 'small': fin(0.34, 0.5, 0.5, false); fin(0.66, 0.74, 0.32, false); break;
    case 'sail': fin(0.1, 0.66, 2.6, false); break;
    case 'tall': poly(G, [[X(0.3), ty(0.3) + 1], [X(0.62), ty(0.5) - h * 0.55], [X(1.12), ty(0.95) - h * 0.15], [X(0.9), ty(0.9) + 1]], 2); poly(G, [[X(0.4), G.H - ty(0.4) - 1], [X(0.66), G.H - ty(0.55) + h * 0.5], [X(1.12), G.H - ty(0.95) + h * 0.15], [X(0.9), G.H - ty(0.9) - 1]], 2); break;
    case 'shark': poly(G, [[X(0.34), ty(0.34) + 1], [X(0.44), ty(0.4) - h * 1.15], [X(0.56), ty(0.56) + 1]], 2); fin(0.84, 0.9, 0.3, false); break;
    case 'lion': for (let i = 0; i < 9; i++) { const k = 0.2 + i * 0.075; stroke(G, [[X(k), ty(k)], [X(k) + N * 0.04, ty(k) - h * (1.15 + (i % 2) * 0.35)]], 2); } for (let i = 0; i < 6; i++) stroke(G, [[X(0.26), G.H / 2 + h * 0.2], [X(0.18 + i * 0.07), G.H / 2 + h * (1.3 + (i % 2) * 0.35)]], 2); fin(0.72, 0.92, 0.5, false); break;
    case 'filament': fin(0.44, 0.62, 0.62, false); stroke(G, [[X(0.6), ty(0.6) - h * 0.55], [X(0.72), ty(0.66) - h * 0.85], [X(0.88), ty(0.88) - h * 0.35]], 2); break;
    case 'fringe': poly(G, [[X(0.12), ty(0.12) + 1], ...Array.from({ length: 10 }, (_, i) => { const k = 0.15 + i * 0.085; return [X(k), ty(k) - h * 0.22]; }), [X(0.98), ty(0.98) + 1]], 2); break;
    case 'oar': fin(0.02, 1, 0.3, false); for (let i = 0; i < 5; i++) stroke(G, [[X(0.03 + i * 0.012), ty(0.03)], [X(0.0 + i * 0.03), ty(0.03) - h * (2.4 + i * 0.35)]], 2); break;
    case 'lure': fin(0.6, 0.78, 0.35, false); stroke(G, [[X(0.18), ty(0.18)], [X(0.08), ty(0.1) - h * 0.75], [X(-0.04), ty(0.1) - h * 0.5]], 5); G.lure = [Math.round(X(-0.05)), Math.round(ty(0.1) - h * 0.45)]; break;
    case 'eel': fin(0.32, 1, 0.32, false); break;
    default: break;
  }
  if (sp.spines) for (let i = 0; i < 3; i++) stroke(G, [[X(0.28 + i * 0.05), ty(0.28 + i * 0.05)], [X(0.25 + i * 0.05), ty(0.25 + i * 0.05) - h * (1 - i * 0.2)]], 2);
}

// ---- colour the pixels ---------------------------------------------------------------------------------------------
function paint(G, f, sp, B, seed) {
  const C = f.col.map(rgb), [body, back, belly, finc] = C, W = G.W, H = G.H;
  const ink = dim(mix(back, body, 0.2), lum(back) < 0.18 ? 0.35 : 0.62);
  // each column's body: its top and its bottom row
  const top = new Int16Array(W).fill(-1), bot = new Int16Array(W).fill(-1);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (G.lab[y * W + x] === 1) { if (top[x] < 0) top[x] = y; bot[x] = y; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, l = G.lab[i];
    if (!l) continue;
    let c;
    if (l === 1) {
      const t = bot[x] > top[x] ? (y - top[x]) / (bot[x] - top[x]) : 0.5, dith = (x + y) & 1;
      c = t < 0.34 - (dith ? 0.05 : -0.03) ? back : t < 0.7 - (dith ? 0.04 : -0.04) ? body : belly;
      if (y === top[x] + Math.max(1, Math.round((bot[x] - top[x]) * 0.18)) && bot[x] - top[x] > 4) c = lit(c, 0.2);   // (the sheen)
      if (y === bot[x] && bot[x] - top[x] > 3) c = dim(c, 0.16);
    } else if (l === 5) c = finc;
    else {
      c = mix(finc, back, l === 3 ? 0.1 : 0.15);
      if (l === 3 ? (y & 1) : !(x & 1)) c = dim(c, 0.14);   // (the rays)
    }
    G.col[i] = pack(c);
  }
  // the marks
  const ctx = { G, f, B, seed, top, bot, C, sp };
  for (const m of sp.m || []) (MARK[m[0]] || (() => {}))(ctx, ...m.slice(1));
  // the pectoral fin over the body, the gill's edge, the mouth, the eye
  const { xn, xt, y0, h } = B, X = (k) => Math.round(xn + k * (xt - xn));
  if (f.shape !== 'eel' && h > 3) {
    const gx = X(f.shape === 'flat' ? 0.2 : 0.22);
    if (top[gx] >= 0) for (let y = top[gx] + 2; y <= bot[gx] - 1; y++) { const dx = Math.round(Math.abs(y - y0) / Math.max(2, h) * 1.5); const i = y * W + gx - dx; if (G.lab[i] === 1) G.col[i] = pack(dim(unpack(G.col[i]), 0.28)); }
    const px = X(0.27), py = Math.round(y0 + h * 0.2);
    for (let k = 0; k < 4; k++) for (let j = 0; j <= k; j++) { const i = (py - j + (k >> 1)) * W + px + k; if (G.lab[i] === 1) G.col[i] = pack((k + j) & 1 ? dim(finc, 0.1) : finc); }
  }
  const mouth = f.shape === 'bass' || f.shape === 'grouper' || f.shape === 'snook' || f.shape === 'tarpon' || f.shape === 'angler' || f.shape === 'rock' ? 3 : 1;
  const my = Math.round(y0 + h * (f.shape === 'angler' ? 0.25 : 0.12));
  for (let k = 0; k < mouth; k++) { const x = Math.round(xn) + k, i = my * W + x; if (G.lab[i] === 1) G.col[i] = pack(dim(body, 0.55)); }
  if (sp.eye !== 'blind') {
    const ex = Math.round(xn + (xt - xn) * (f.shape === 'sturgeon' || f.shape === 'gar' ? 0.07 : f.shape === 'flat' ? 0.12 : 0.1)) + (f.shape === 'pan' || f.shape === 'angel' || f.shape === 'tang' ? 1 : 0), ey = Math.round(y0 - h * (f.shape === 'flat' ? 0.45 : 0.32));
    const big = sp.eye === 'big' || h > 10 || f.shape === 'angler', ring = sp.eye === 'glow' ? [150, 240, 255] : sp.eye === 'red' ? [220, 50, 40] : sp.eye === 'big' ? [230, 230, 200] : lit(belly, 0.55);
    const pupil = sp.eye === 'glow' ? [230, 255, 255] : [16, 16, 24], r = big ? 3 : 2, x0 = ex - (r >> 1), y0e = ey - (r >> 1);
    const at = (x, y, cc) => { const i = y * W + x; if (inG(G, x, y) && G.lab[i] === 1) G.col[i] = pack(cc); };
    for (let dy = -1; dy <= r; dy++) for (let dx = -1; dx <= r; dx++) if (!((dx === -1 || dx === r) && (dy === -1 || dy === r))) at(x0 + dx, y0e + dy, ring);   // (the iris's ring)
    for (let dy = 0; dy < r; dy++) for (let dx = 0; dx < r; dx++) at(x0 + dx, y0e + dy, pupil);
    if (sp.eye !== 'glow') at(x0, y0e, [250, 250, 245]);   // (the catch-light)
  }
  if (G.lure) { const [lx, ly] = G.lure; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { put(G, lx + dx, ly + dy, 5); G.col[(ly + dy) * W + lx + dx] = pack(dx + dy ? [255, 220, 90] : [255, 250, 200]); } }
  outline(G, ink);
  return ink;
}
const unpack = (u) => [u & 255, (u >>> 8) & 255, (u >>> 16) & 255];
function outline(G, ink) {
  const W = G.W, H = G.H, o = pack(ink), add = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (G.lab[y * W + x]) continue;
    if ((x > 0 && G.lab[y * W + x - 1]) || (x < W - 1 && G.lab[y * W + x + 1]) || (y > 0 && G.lab[(y - 1) * W + x]) || (y < H - 1 && G.lab[(y + 1) * W + x])) add.push(y * W + x);
  }
  for (const i of add) { G.lab[i] = 9; G.col[i] = o; }
}

// ---- the marks: each (ctx, ...args) recolours body pixels -----------------------------------------------------------
// k: 0 the nose .. 1 the tail's root; v: -1 the back .. 1 the belly (the column's own)
function each(c, fn) {
  const { G, B, top, bot } = c, W = G.W;
  for (let x = Math.floor(B.xn); x <= B.xt; x++) {
    if (top[x] < 0) continue;
    const k = (x - B.xn) / (B.xt - B.xn), mid = (top[x] + bot[x]) / 2, hh = Math.max(1, (bot[x] - top[x]) / 2);
    for (let y = top[x]; y <= bot[x]; y++) { const i = y * W + x; if (G.lab[i] !== 1) continue; const r = fn(k, (y - mid) / hh, x, y, unpack(G.col[i])); if (r) G.col[i] = pack(r); }
  }
}
const on = (base, col, a) => mix(base, rgb(col), a);
const MARK = {
  bars(c, n, depth, col) { each(c, (k, v, x, y, b) => { if (k < 0.18 || k > 0.92 || v > depth * 2 - 1) return null; const p = ((k - 0.18) / 0.74) * n; return p % 1 < 0.42 ? on(b, col, 0.6) : null; }); },
  stripes(c, n, col, a = 0.75) { each(c, (k, v, x, y, b) => { if (k < 0.16 || v > 0.75) return null; const p = (v + 1) / 1.75 * n; return Math.abs(p - Math.round(p)) < 0.22 ? on(b, col, a) : null; }); },
  speck(c, d, col, sz = 1, vmax = 1) { each(c, (k, v, x, y, b) => (k > 0.15 && v < vmax && hash(sz > 1 ? x >> 1 : x, sz > 1 ? y >> 1 : y, c.seed + 1) < d ? on(b, col, 0.85) : null)); },
  spots(c, d, col, k0 = 0, vmax = 1) { each(c, (k, v, x, y, b) => (k > Math.max(0.14, k0) && v < vmax * 2 - 1 && hash(x, y, c.seed + 2) < d && (x + y) % 2 === 0 ? on(b, col, 0.9) : null)); },
  lightspots(c, d, col) { each(c, (k, v, x, y, b) => (k > 0.14 && v < 0.7 && hash(x >> 1, y >> 1, c.seed + 3) < d ? on(b, col, 0.75) : null)); },
  fewspots(c, col) { each(c, (k, v, x, y, b) => (k > 0.2 && v < 0.2 && hash(x, y, c.seed + 4) < 0.05 ? on(b, col, 0.8) : null)); },
  mottle(c, col, a) { each(c, (k, v, x, y, b) => { const n = hash(x >> 2, y >> 2, c.seed + 5) * 0.6 + hash(x >> 1, y >> 1, c.seed + 6) * 0.4; return n < a ? on(b, col, 0.55) : null; }); },
  scales(c, col) { each(c, (k, v, x, y, b) => (k > 0.2 && k < 0.95 && (x + (y >> 1) * 2) % 4 === 0 && y % 2 === 0 ? on(b, col, 0.55) : null)); },
  bigscales(c, col) { each(c, (k, v, x, y, b) => (k > 0.2 && k < 0.95 && ((x + ((y / 3) | 0) * 3) % 6 === 0 || y % 3 === 0 && (x % 6) < 1) ? on(b, col, 0.5) : null)); },
  netlight(c, col) { each(c, (k, v, x, y, b) => (k > 0.2 && (x + y) % 3 === 0 && y % 2 === 0 ? on(b, col, 0.5) : null)); },
  scaledots(c, col) { each(c, (k, v, x, y, b) => (k > 0.22 && (x % 3 === 0) && (y % 3 === 1) ? on(b, col, 0.6) : null)); },
  band(c, col, v0, v1) { each(c, (k, v, x, y, b) => (k > 0.12 && k < 0.98 && v >= v0 * 2 - 0.5 && v <= v1 * 2 - 0.3 ? on(b, col, 0.62) : null)); },
  blotch(c, col) { each(c, (k, v, x, y, b) => (k > 0.2 && Math.abs(v + 0.05 + Math.sin(k * 22) * 0.12) < 0.24 && hash(x >> 1, 0, c.seed + 7) > 0.15 ? on(b, col, 0.7) : null)); },
  line(c, col, w = 1) { each(c, (k, v, x, y, b) => (k > 0.22 && Math.abs(v + 0.08) < 0.12 * w ? on(b, col, 0.85) : null)); },
  saddles(c, n, col) { each(c, (k, v, x, y, b) => (k > 0.25 && v < -0.2 && (((k - 0.25) / 0.7) * n) % 1 < 0.4 ? on(b, col, 0.45) : null)); },
  wavy(c, col) { each(c, (k, v, x, y, b) => (k > 0.2 && v < -0.05 && ((x + Math.round(Math.sin(y * 1.3) * 1.5)) % 4 === 0) ? on(b, col, 0.75) : null)); },
  oblique(c, col) { each(c, (k, v, x, y, b) => (k > 0.25 && v < -0.15 && (x + y) % 4 === 0 ? on(b, col, 0.8) : null)); },
  bellystripes(c, col) { each(c, (k, v, x, y, b) => (k > 0.25 && v > 0.15 && y % 2 === 0 ? on(b, col, 0.6) : null)); },
  tigerbars(c, col) { each(c, (k, v, x, y, b) => (k > 0.25 && v < 0.35 && x % 3 === 0 ? on(b, col, 0.7) : null)); },
  palebars(c, col) { each(c, (k, v, x, y, b) => (k > 0.25 && k < 0.92 && v < 0.2 && x % 4 === 0 ? on(b, col, 0.6) : null)); },
  midstripe(c, col) { each(c, (k, v, x, y, b) => (Math.abs(v + 0.02 - k * 0.1) < 0.16 ? on(b, col, 0.95) : null)); },
  bluestripes(c, col) { each(c, (k, v, x, y, b) => (k > 0.05 && Math.abs(((v + 1) * 3.2) % 1 - 0.5) < 0.17 ? on(b, col, 0.85) : null)); },
  dotrow(c, col) { each(c, (k, v, x, y, b) => (k > 0.25 && k < 0.9 && Math.abs(v + 0.2) < 0.2 && x % 3 === 0 ? on(b, col, 0.85) : null)); },
  shoulder(c, col) { each(c, (k, v, x, y, b) => (Math.hypot((k - 0.28) * 14, (v + 0.2) * 2.4) < 1 ? on(b, col, 0.9) : null)); },
  ear(c, col, tip) { each(c, (k, v, x, y, b) => (k > 0.2 && k < 0.27 && v > -0.42 && v < 0.05 ? (tip && k > 0.245 ? rgb(tip) : rgb(col)) : null)); },
  blush(c, col) { each(c, (k, v, x, y, b) => (k > 0.12 && k < 0.5 && v > 0.35 ? on(b, col, 0.55) : null)); },
  cheek(c, col) { each(c, (k, v, x, y, b) => (k > 0.04 && k < 0.22 && v > -0.3 && v < 0.6 && (y + (x >> 1)) % 3 === 0 ? on(b, col, 0.85) : null)); },
  sheen(c, col) { each(c, (k, v, x, y, b) => (Math.abs(v - 0.1) < 0.14 && k > 0.15 && (x & 1) ? on(b, col, 0.35) : null)); },
  tailtip(c, col) { const { G } = c; for (let y = 0; y < G.H; y++) for (let x = Math.round(c.B.xt + c.B.T * 0.6); x < G.W; x++) { const i = y * G.W + x; if (G.lab[i] === 3 && y > c.B.y0 + c.B.h * 0.6) G.col[i] = pack(rgb(col)); } },
  finred(c, col) { fins(c, (l, x, y, b) => (l === 2 && y > c.B.y0 ? on(b, col, 0.5) : null)); },
  finyellow(c, col) { fins(c, (l, x, y, b) => (l === 2 || l === 3 ? on(b, col, 0.7) : null)); },
  finblack(c, col) { fins(c, (l, x, y, b) => on(b, col, 0.75)); },
  finedge(c, col) { fins(c, (l, x, y, b) => (l === 2 && y > c.B.y0 && c.G.lab[(y + 1) * c.G.W + x] === 0 ? rgb(col) : null)); },
  finspots(c, col) { fins(c, (l, x, y, b) => (hash(x, y, c.seed + 9) < 0.25 ? on(b, col, 0.8) : null)); },
  sailspots(c, col) { fins(c, (l, x, y, b) => (l === 2 && y < c.B.y0 && (x + y) % 4 === 0 ? on(b, col, 0.8) : null)); },
  finlets(c, col) { const { G, B } = c; for (let i = 0; i < 6; i++) { const x = Math.round(B.xn + (0.8 + i * 0.03) * (B.xt - B.xn)); for (const y of [c.top[x] - 1, c.bot[x] + 1]) if (inG(G, x, y) && !G.lab[y * G.W + x]) { G.lab[y * G.W + x] = 2; G.col[y * G.W + x] = pack(rgb(col)); } } },
  halospots(c, col, ring) { const { G } = c; each(c, (k, v, x, y, b) => { if (k < 0.2 || v > 0.6 || x % 4 !== 1 || y % 4 !== (x >> 2) % 2 * 2 + 1 || hash(x, y, c.seed + 10) > 0.6) return null; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const i = (y + dy) * G.W + x + dx; if (G.lab[i] === 1) G.col[i] = pack(on(unpack(G.col[i]), ring, 0.7)); } return rgb(col); }); },
  vermic(c, col) { each(c, (k, v, x, y, b) => (k > 0.18 && v < -0.25 && ((x * 2 + y * 3) % 5 === 0 || (x + y * 2) % 7 === 0) ? on(b, col, 0.8) : null)); },
  throat(c, col) { each(c, (k, v, x, y, b) => (k > 0.05 && k < 0.2 && v > 0.55 ? rgb(col) : null)); },
  parr(c, col) { each(c, (k, v, x, y, b) => (k > 0.22 && k < 0.9 && Math.abs(v) < 0.35 && ((k - 0.22) * 9) % 1 < 0.45 ? on(b, col, 0.55) : null)); },
  head(c, col, k1) { each(c, (k, v, x, y, b) => (k < k1 && v < 0.5 ? on(b, col, 0.85) : null)); },
  shade(c, col) { each(c, (k, v, x, y, b) => (v < -0.4 ? on(b, col, 0.4) : null)); },
  eyespot(c, col, ring) { each(c, (k, v, x, y, b) => { const d = Math.hypot((k - 0.9) * (c.B.xt - c.B.xn), v * (c.bot[x] - c.top[x]) / 2 + 1); return d < 1.3 ? rgb(col) : d < 2.4 ? on(b, ring, 0.85) : null; }); },
  eyebar(c, col) { each(c, (k, v, x, y, b) => (k > 0.07 && k < 0.15 ? on(b, col, 0.8) : null)); },
  snoutbar(c, col) { each(c, (k, v, x, y, b) => (k < 0.2 && v < -0.1 ? on(b, col, 0.6) : null)); },
  chevrons(c, col) { each(c, (k, v, x, y, b) => (k > 0.2 && (x + Math.abs(Math.round(v * 6))) % 4 === 0 ? on(b, col, 0.8) : null)); },
  tailspots(c, col) { each(c, (k, v, x, y, b) => (k > 0.7 && v > -0.3 && hash(x, y, c.seed + 11) < 0.12 ? rgb(col) : null)); },
  zebra(c, a, b2) { each(c, (k, v, x, y, b) => (k > 0.1 ? ((x + Math.round(v * 2)) % 4 < 2 ? rgb(a) : rgb(b2)) : null)); fins(c, (l, x, y, b) => (l === 2 && (x + y) % 3 === 0 ? rgb(a) : null)); },
  bands(c, a, edge) { each(c, (k, v, x, y, b) => { for (const m of [0.2, 0.52, 0.86]) { const d = Math.abs(k - m) * (c.B.xt - c.B.xn) - (m === 0.86 ? 0.4 : 1.4); if (d < 0) return rgb(a); if (d < 1) return rgb(edge); } return null; }); fins(c, (l, x, y, b) => (c.G.lab[(y + 1) * c.G.W + x] === 0 || c.G.lab[(y - 1) * c.G.W + x] === 0 || c.G.lab[y * c.G.W + x + 1] === 0 ? rgb(edge) : null)); },
  palette(c, col) { each(c, (k, v, x, y, b) => (k > 0.15 && k < 0.95 && v < 0.15 - Math.abs(k - 0.55) * 0.9 && v > -0.75 + Math.abs(k - 0.5) * 0.4 ? rgb(col) : null)); },
  crown(c, col, ring) { each(c, (k, v, x, y, b) => { const d = Math.hypot((k - 0.2) * (c.B.xt - c.B.xn), (v + 0.75) * 4); return d < 1.5 ? rgb(col) : d < 2.5 ? rgb(ring) : null; }); },
  beakpink(c, col) { each(c, (k, v, x, y, b) => (k < 0.1 ? on(b, col, 0.6) : null)); },
  photo(c, col) { each(c, (k, v, x, y, b) => (k > 0.15 && v > 0.5 && x % 3 === 0 ? rgb(col) : null)); },
  frill(c, col) { each(c, (k, v, x, y, b) => (k > 0.12 && k < 0.22 && (y % 2 === 0) ? on(b, col, 0.75) : null)); },
  teeth(c, col) { const { G, B } = c; const y = Math.round(B.y0 + B.h * 0.25); for (let k = 0; k < 4; k++) { const x = Math.round(B.xn) + k; if (inG(G, x, y - 1) && G.lab[(y - 1) * G.W + x] === 1 && (k & 1)) G.col[(y - 1) * G.W + x] = pack(rgb(col)); } },
  // n round blobs over the back and the flank (a koi's red and black), each its own place and size
  patches(c, col, n, off = 0) { const P = Array.from({ length: n }, (_, i) => [0.18 + hash(i, off, c.seed + 12) * 0.7, -0.8 + hash(i, off + 1, c.seed + 12) * 1.1, 0.07 + hash(i, off + 2, c.seed + 12) * 0.08]); const L = c.B.xt - c.B.xn; each(c, (k, v, x, y, b) => (P.some(([pk, pv, r]) => Math.hypot((k - pk) * L, (v - pv) * c.B.h * 0.9) < r * L) ? on(b, col, 0.92) : null)); },
  counter(c) { each(c, (k, v, x, y, b) => (v > 0.1 ? lit(b, 0.35) : null)); },
  forehead() {},
};
function fins(c, fn) { const { G } = c; for (let i = 0; i < G.lab.length; i++) { const l = G.lab[i]; if (l !== 2 && l !== 3) continue; const r = fn(l, i % G.W, (i / G.W) | 0, unpack(G.col[i])); if (r) G.col[i] = pack(r); } }

// ---- the soft ones and the odd ones (their own grids, the head to the left) ---------------------------------------
function softBody(G, f, sp, N) {
  const y0 = G.H / 2, C = f.col.map(rgb);
  const X = (k) => 6 + N * k;
  if (f.shape === 'squid') {   // the mantle to the right, its fins at the tip; the head, the eye; the arms trailing left
    const vamp = f.id === 'vampiresquid', t = N * (vamp ? 0.14 : 0.1);
    poly(G, [[X(0.36), y0 - t], [X(0.8), y0 - t * 0.8], [X(1.0), y0], [X(0.8), y0 + t * 0.8], [X(0.36), y0 + t]], 1);
    poly(G, [[X(0.74), y0 - t * 0.6], [X(0.92), y0 - t * 2], [X(1.02), y0], [X(0.92), y0 + t * 2], [X(0.74), y0 + t * 0.6]], 3);
    disc(G, X(0.33), y0, N * 0.07, t * 0.9, 1);
    if (vamp) poly(G, [[X(0.3), y0 - t * 0.8], [X(0.04), y0 - t * 2.2], [X(-0.02), y0], [X(0.04), y0 + t * 2.2], [X(0.3), y0 + t * 0.8]], 2);
    for (let i = 0; i < 8; i++) { const v = (i - 3.5) / 3.5, long = i === 2 || i === 5, end = long ? -0.06 : 0.04; stroke(G, [[X(0.28), y0 + v * t * 0.6], [X(0.16), y0 + v * t * 0.9 + Math.sin(i * 1.7)], [X(end), y0 + v * t * 1.3 + Math.sin(i * 2.3) * 2]], 5, i % 3 ? 1 : 2); }
    return { xn: 6, xt: X(1), y0, h: t, N, T: 0, eye: [Math.round(X(0.32)), Math.round(y0 - t * 0.35)], C };
  }
  if (f.shape === 'octopus') {   // the head up to the right, eight arms curling away down and to the left
    const cx = X(0.68), cy = y0 - N * 0.14, r = N * 0.2;
    disc(G, cx, cy, r, r * 0.85, 1);
    for (let i = 0; i < 8; i++) {
      const a = i / 7, sx = cx - r * 0.7 + a * r * 1.2, sy = cy + r * 0.6, ex = X(0.02 + a * 0.62), ey = y0 + N * (0.2 + (i % 3) * 0.05), mx = (sx + ex) / 2 - 2, my = Math.max(sy, ey) + 3;
      const pts = []; for (let q = 0; q <= 8; q++) { const t = q / 8; pts.push([(1 - t) * (1 - t) * sx + 2 * t * (1 - t) * mx + t * t * ex, (1 - t) * (1 - t) * sy + 2 * t * (1 - t) * my + t * t * ey]); }
      pts.push([ex - 2, ey - 2]);   // (the tip's curl)
      stroke(G, pts.slice(0, 5), 5, 3); stroke(G, pts.slice(4), 5, 2);
    }
    return { xn: 6, xt: 6 + N, y0: cy, h: r * 0.85, N, T: 0, eye: [Math.round(cx - r * 0.45), Math.round(cy + r * 0.1)], C };
  }
  if (f.shape === 'isopod') {
    disc(G, 6 + N * 0.5, y0, N * 0.48, N * 0.24, 1);
    for (let i = 0; i < 7; i++) { const x = 6 + N * (0.18 + i * 0.1); stroke(G, [[x, y0 + N * 0.18], [x - 2, y0 + N * 0.32]], 5); }
    stroke(G, [[6 + N * 0.05, y0 - N * 0.05], [6 - 4, y0 - N * 0.2]], 5);
    return { xn: 6, xt: 6 + N, y0, h: N * 0.24, N, T: 0, eye: [Math.round(6 + N * 0.1), Math.round(y0 - N * 0.08)], C, segs: true };
  }
  // a ray, from above: the disc, the whip tail
  poly(G, [[6, y0], [6 + N * 0.32, y0 - N * 0.42], [6 + N * 0.55, y0 - N * 0.08], [6 + N * 0.55, y0 + N * 0.08], [6 + N * 0.32, y0 + N * 0.42]], 1);
  stroke(G, [[6 + N * 0.55, y0], [6 + N * 0.8, y0 + 1], [6 + N, y0 - 1]], 5);
  return { xn: 6, xt: 6 + N * 0.55, y0, h: N * 0.42, N, T: 0, eye: [Math.round(6 + N * 0.18), Math.round(y0 - 3)], C, ray: true };
}
function paintSoft(G, f, sp, B, seed) {
  const [body, back, belly, finc] = B.C, W = G.W;
  for (let y = 0; y < G.H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, l = G.lab[i];
    if (!l) continue;
    let c = l === 5 ? finc : l === 3 || l === 2 ? mix(finc, body, 0.3) : body;
    if (l === 1) {
      const t = (y - (B.y0 - B.h)) / (2 * B.h);
      c = t < 0.35 ? back : t > 0.72 ? belly : body;
      if (B.ray) c = Math.hypot(x - (B.xn + B.N * 0.26), (y - B.y0) * 1.4) < B.N * 0.12 ? back : body;
      if (B.segs && x % 3 === 0) c = dim(c, 0.25);
      if (hash(x, y, seed + 13) < (f.shape === 'octopus' || f.shape === 'squid' ? 0.12 : 0.05)) c = dim(c, 0.22);   // (chromatophores, freckles)
      if (f.id === 'kraken' && (x + y) % 5 === 0) c = lit(c, 0.25);
    }
    if (l === 5 && f.shape === 'octopus' && (x + y) % 3 === 0) c = lit(belly, 0.3);   // (the suckers)
    G.col[i] = pack(c);
  }
  const [ex, ey] = B.eye;
  for (const [dx, dy, cc] of [[0, 0, sp.eye === 'red' ? [230, 40, 40] : [16, 16, 24]], [1, 0, sp.eye === 'red' ? [255, 90, 80] : [16, 16, 24]], [0, -1, [250, 250, 240]], [1, -1, lit(belly, 0.4)]]) { const i = (ey + dy) * W + ex + dx; if (G.lab[i]) G.col[i] = pack(cc); }
  if (B.ray) { const i = (ey + 6) * W + ex; if (G.lab[i]) G.col[i] = pack([16, 16, 24]); }
  const ink = dim(back, lum(back) < 0.18 ? 0.35 : 0.6);
  outline(G, ink);
  return ink;
}

// ---- the legendaries: a light round them, sparkles ---------------------------------------------------------------
function glowRim(G, col, seed) {
  const W = G.W, H = G.H, c = rgb(col), add = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (G.lab[y * W + x]) continue;
    let near = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inG(G, x + dx, y + dy) && G.lab[(y + dy) * W + x + dx] === 9) near = true;
    if (near) add.push(y * W + x);
  }
  for (const i of add) { G.lab[i] = 8; G.col[i] = pack(c, (i + seed) % 2 ? 150 : 210); }
  // four sparkles round about, a plus each
  let n = 0;
  for (let t = 0; t < 400 && n < 4; t++) {
    const x = 2 + Math.floor(hash(t, 1, seed) * (W - 4)), y = 2 + Math.floor(hash(t, 2, seed) * (H - 4));
    if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]].some(([dx, dy]) => G.lab[(y + dy) * W + x + dx])) continue;
    let near = false;
    for (let dy = -5; dy <= 5 && !near; dy++) for (let dx = -5; dx <= 5; dx++) if (inG(G, x + dx, y + dy) && G.lab[(y + dy) * W + x + dx] && G.lab[(y + dy) * W + x + dx] < 8) { near = true; break; }
    if (!near) continue;
    for (const [dx, dy, a] of [[0, 0, 255], [1, 0, 170], [-1, 0, 170], [0, 1, 170], [0, -1, 170]]) { const i = (y + dy) * W + x + dx; G.lab[i] = 8; G.col[i] = pack(dx || dy ? lit(c, 0.3) : [255, 255, 240], a); }
    n++;
  }
}

// ---- the sprite -------------------------------------------------------------------------------------------------------
const CACHE = new Map();
export function fishSprite(f) {
  if (CACHE.has(f.id)) return CACHE.get(f.id);
  const sp = SP[f.id] || { m: [] }, S = SH[f.shape] || SH.bass, N = sp.n || S[4], seed = seedOf(f.id);
  const tallFin = S[2] === 'sail' || S[2] === 'oar' || S[2] === 'lion' || S[2] === 'tall';
  const G = grid(Math.ceil(N * 1.45) + 16, Math.ceil(N * (Math.max(S[0], sp.hr || 0) * 1.6 + (tallFin ? 0.9 : 0.35))) + 16);
  let ink;
  if (S[0] === 0) { const B = softBody(G, f, sp, N); ink = paintSoft(G, f, sp, B, seed); } else { const B = fishBody(G, f, S, sp); ink = paint(G, f, sp, B, seed); }
  if (f.rare === 5 && sp.glow) glowRim(G, sp.glow, seed);
  // cropped to what's drawn, a pixel's margin
  let x0 = G.W, y0 = G.H, x1 = -1, y1 = -1;
  for (let y = 0; y < G.H; y++) for (let x = 0; x < G.W; x++) if (G.lab[y * G.W + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, px = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y + y0) * G.W + x + x0; px[y * w + x] = G.lab[i] ? G.col[i] : 0; }
  const out = { w, h, px, seed, ink: pack(ink) };
  CACHE.set(f.id, out);
  return out;
}
export const FISH_LOOKS = SP;   // (the tests: every species has its own)

// ---- drawing it ----------------------------------------------------------------------------------------------------
const CANVAS = new Map();
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
}
// the sprite as a canvas (one per species and ink), or null where there's no canvas (node)
function spriteCanvas(f, ink) {
  const key = f.id + (ink || '');
  if (CANVAS.has(key)) return CANVAS.get(key);
  const s = fishSprite(f), c = makeCanvas(s.w, s.h);
  if (!c) return null;
  const g = c.getContext('2d'), img = g.createImageData(s.w, s.h), u = new Uint32Array(img.data.buffer);
  const k = ink ? pack(rgb(ink)) & 0xffffff : 0;
  for (let i = 0; i < s.px.length; i++) u[i] = ink ? (s.px[i] >>> 24 ? ((s.px[i] & 0xff000000) | k) >>> 0 : 0) : s.px[i];
  g.putImageData(img, 0, 0);
  CANVAS.set(key, c);
  return c;
}
// drawFish(g, f, x, y, L, o): about L px nose to tail, centred; whole art pixels when it's drawn big (2x, 3x...)
export function drawFish(g, f, x, y, L, o = {}) {
  const s = fishSprite(f), raw = L / s.w, k = raw >= 1 ? Math.max(1, Math.floor(raw + 0.25)) : raw;
  const w = s.w * k, h = s.h * k, X = Math.round(x - w / 2), Y = Math.round(y - h / 2);
  const c = spriteCanvas(f, o.ink);
  g.save();
  if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = Math.max(4, L * 0.12); }
  if (c) { g.imageSmoothingEnabled = false; g.drawImage(c, X, Y, w, h); g.restore(); return; }
  // (no canvas to hand - a test's stand-in context: the pixels as runs of rectangles)
  for (let yy = 0; yy < s.h; yy++) {
    let run = 0, start = 0, cur = 0;
    for (let xx = 0; xx <= s.w; xx++) {
      const v = xx < s.w ? s.px[yy * s.w + xx] : 0;
      if (v === cur && xx < s.w) { run++; continue; }
      if (cur >>> 24) { g.fillStyle = o.ink || `rgba(${cur & 255},${(cur >>> 8) & 255},${(cur >>> 16) & 255},${((cur >>> 24) / 255).toFixed(2)})`; g.fillRect(X + start * k, Y + yy * k, run * k, k); }
      cur = v; start = xx; run = 1;
    }
  }
  g.restore();
}
// the sprite at a whole-number scale, as a canvas element to put on a page (the phone's Fish log); null without a DOM
export function fishCanvas(f, scale = 2, o = {}) {
  if (typeof document === 'undefined') return null;
  const s = fishSprite(f), c = document.createElement('canvas');
  c.width = s.w * scale; c.height = s.h * scale;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const src = spriteCanvas(f, o.ink);
  if (src) g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
