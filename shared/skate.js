// Skateboarding, parts 2 and 3 (the owner, 2026-10-18: "lets put in the skateboard moves"): the tricks a rider does on top
// of riding. shared/board.js boardStep hands its step to `step` here (the server always, the page once you
// have a board - client/skate.js), so the page predicts every trick exactly as the server rides it.
//   - Flips: the trick button in the air, by where the stick points against the deck - ahead a kickflip, back a heelflip,
//     to the left a pop shove-it, to the right a 360 flip. On the ground the trick button pops one (an ollie and the flip
//     at once). A flip has to come round before you land, or you bail.
//   - Grabs: in a big air (off a kicker or a quarter pipe) the trick button held - indy, melon, method, nosegrab by the
//     stick - for as long as you hold it; let go before you land.
//   - Grinds and slides: coming down out of an air onto a kerb, a ledge, a bench, a flat bar, a planter's edge or a quarter
//     pipe's coping, along it, the board snaps on and slides (50-50, 5-0, boardslide, crooked grind by the stick). The
//     balance tips one way and the other; the stick across the rail holds you on. Off the end, or the dive button pops
//     you off (the trick button: off with a flip).
//   - Manuals: the trick button with the stick pulled back - rolling on the back wheels, the stick along the deck holding
//     the balance; the dive button pops you out of it, the trick button flips you out.
//   - The ramps (the skate spots' obstacles: shared/world3-midtown.js skateSpot, world3-northgate.js overpassPark): a kicker
//     launches you up and on; a quarter pipe straight up - you hang there, turn, and come back down the way you came; off
//     the pyramid's banks at speed, a little air.
// The state is the ped's (the snapshot carries it: shared/physics.js boardOut): bm the mode (0 rolling, 1 / 3 grinding
// along its rail / back along it, 2 a manual), bg the rail (its id), gh its height, bb the balance (-1..1: past it you
// fall), bT how long in it; tk the trick going (TRICKS; 20-23: the trick button down in a big air - a grab once held,
// a flip if let go) and tt its time; airT the air's length, airH its height, h0 where it started, airK what it was (0 an
// ollie, 1 off a kicker or a bank, 2 up a quarter pipe, 3 dropping off the end of a rail), vg the quarter pipe's speed.
// Where the server keeps score (server/systems/skate.js) it gives the ped an skEv list: what happened, step by step
// (w: what - not a world event).
// Deterministic like the rest of the physics: the same map, the same input, the same ride (nothing random, nothing timed
// but the step).
import { TILE, T } from './constants.js';
import { IN } from './input.js';
import { clamp, wrapAngle } from './math.js';

// The tricks (the code rides the ped's extra byte on the wire: server/net.js; pts - the points, the server's scoring; a
// grind's, a grab's and a manual's per second too; sp - its special's name, when the special meter is full)
export const TRICKS = [
  null,
  { id: 'kickflip', name: 'Kickflip', kind: 'flip', d: 0.36, pts: 100, sp: 'Kickflip Underflip' },
  { id: 'heelflip', name: 'Heelflip', kind: 'flip', d: 0.36, pts: 100, sp: 'Double Heelflip' },
  { id: 'shoveit', name: 'Pop Shove-It', kind: 'flip', d: 0.3, pts: 100, sp: '360 Shove-It' },
  { id: 'treflip', name: '360 Flip', kind: 'flip', d: 0.44, pts: 250, sp: 'Hardflip Late Flip' },
  { id: 'indy', name: 'Indy', kind: 'grab', pts: 200, sp: 'Christ Air' },
  { id: 'melon', name: 'Melon', kind: 'grab', pts: 200, sp: 'Madonna' },
  { id: 'method', name: 'Method', kind: 'grab', pts: 250, sp: 'Judo Air' },
  { id: 'nosegrab', name: 'Nosegrab', kind: 'grab', pts: 200, sp: 'Superman' },
  { id: 'fiftyfifty', name: '50-50', kind: 'grind', pts: 100, sp: 'Darkslide' },
  { id: 'fiveo', name: '5-0', kind: 'grind', pts: 150, sp: 'Darkslide' },
  { id: 'boardslide', name: 'Boardslide', kind: 'grind', pts: 150, sp: 'Darkslide' },
  { id: 'crooked', name: 'Crooked Grind', kind: 'grind', pts: 200, sp: 'Darkslide' },
  { id: 'manual', name: 'Manual', kind: 'manual', pts: 80, sp: 'Casper' },
];
export const FLIP0 = 1, GRAB0 = 5, GRIND0 = 9, MANUAL = 13, PENDING = 20;
export const trickOf = (k) => (k > 0 && k < TRICKS.length ? TRICKS[k] : null);
// the numbers: grab - how big an air takes a grab (s) and how long the button is held before it's one; fr - a grind's
// drag by what it's on (px/s/s); gain, wob, hold - the balance: how fast it tips, how it wobbles, how hard the stick
// holds it; snap - how close (px) and how near parallel (rad) you come down to a rail to land on it
export const SKATE = {
  grab: 0.72, grabHold: 0.12, fr: { kerb: 70, ledge: 55, bench: 55, planter: 55, rail: 30, coping: 35 }, grindMin: 70,
  gain: 1.3, gainT: 0.18, wob: 0.45, hold: 2.6, snap: 10, snapA: 0.6, manualMin: 55, manualDrag: 40, manualTurn: 1.3,
};

// ---- the city's rails, ledges, kerbs and ramps ---------------------------------------------------------------------
// An index of the map (kept on it; the page's map is a window onto the world, so it builds what it has): chunks of
// CH x CH tiles, each with its grindable lines (segs) and ramps. A seg: x0, y0 to x1, y1 (px), its unit ux, uy and len,
// h (how high its top is, px), k (what it is), id (from where it is: the page and the server name it the same), pi (the
// prop it is, if any: one smashed is gone). The kerbs are where a road tile meets a pavement or a plaza along a run of
// three tiles or more; a run is cut at the chunk's edge and ridden on to the next (`next`).
const CH = 32;
const ckey = (cx, cy) => cx * 65536 + cy;
const GRIND_T = { ledge: 1, flatbar: 1, qpipe: 1, bench_a: 1, bench_b: 1, bench_m: 1, pbench: 1, planter_fl: 1, planter_g: 1, kicker: 1, pyramid: 1 };
function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }   // (client/art2/gbuf.js's)
const segId = (x0, y0, x1, y1) => ((Math.imul(x0 | 0, 73856093) ^ Math.imul(y0 | 0, 19349663) ^ Math.imul(x1 | 0, 83492791) ^ Math.imul(y1 | 0, 50331653)) >>> 0) & 0xffffff;
function mkSeg(x0, y0, x1, y1, h, k, pi = -1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  return { x0, y0, x1, y1, ux: dx / len, uy: dy / len, len, h, k, pi, id: segId(x0, y0, x1, y1) };
}
const tileOf = (map, tx, ty) => map.tileAt(tx, ty);
// a bench's heading as its art draws it (client/art2/game/statics.js: set by the place, else back to the nearest road,
// else by a hash): along x or along y
function benchAlongX(map, p) {
  const q4 = (a) => (Math.round(((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2))) % 4 + 4) % 4;
  if (p.a !== undefined) return q4(p.a) % 2 === 0;
  const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
  for (let k = 1; k <= 3; k++) for (const [dx, dy, a] of [[0, 1, Math.PI / 2], [0, -1, -Math.PI / 2], [1, 0, 0], [-1, 0, Math.PI]]) {
    const t = tileOf(map, tx + dx * k, ty + dy * k);
    if (t === T.ROAD || t === T.BRIDGE) return q4(a - Math.PI / 2) % 2 === 0;
  }
  return Math.floor(hash(Math.floor(p.x), Math.floor(p.y), 7) * 4) % 2 === 0;
}
function propsByChunk(map) {
  const out = new Map();
  (map.props || []).forEach((p, i) => {
    if (!p || !GRIND_T[p.t]) return;
    const k = ckey(Math.floor(p.x / TILE / CH), Math.floor(p.y / TILE / CH));
    let L = out.get(k); if (!L) out.set(k, (L = []));
    L.push(i);
  });
  return out;
}
function buildChunk(map, X, cx, cy) {
  const segs = [], ramps = [];
  for (const i of X.props.get(ckey(cx, cy)) || []) {
    const p = map.props[i], w = p.w || 96;
    switch (p.t) {
      case 'ledge': segs.push(mkSeg(p.x - w / 2 + 3, p.y, p.x + w / 2 - 3, p.y, 14, 'ledge', i)); break;
      case 'flatbar': segs.push(mkSeg(p.x - w / 2 + 4, p.y, p.x + w / 2 - 4, p.y, 13, 'rail', i)); break;
      case 'qpipe': { const qw = p.w || 128; segs.push(mkSeg(p.x - qw / 2 + 2, p.y - 15, p.x + qw / 2 - 2, p.y - 15, 32, 'coping', i)); ramps.push({ k: 'qp', x0: p.x - qw / 2, x1: p.x + qw / 2, y0: p.y - 24, y1: p.y + 24, pi: i }); break; }
      case 'kicker': ramps.push({ k: 'kick', x0: p.x - 20, x1: p.x + 20, y0: p.y - 17, y1: p.y + 17, pi: i }); break;
      case 'pyramid': ramps.push({ k: 'pyr', x0: p.x - 60, x1: p.x + 60, y0: p.y - 40, y1: p.y + 40, pi: i }); break;
      case 'planter_fl': segs.push(mkSeg(p.x - 20, p.y, p.x + 20, p.y, 26, 'planter', i)); break;
      case 'planter_g': segs.push(mkSeg(p.x - 10, p.y, p.x + 10, p.y, 22, 'planter', i)); break;
      default: {   // a bench
        const ax = benchAlongX(map, p);
        segs.push(ax ? mkSeg(p.x - 14, p.y, p.x + 14, p.y, 14, 'bench', i) : mkSeg(p.x, p.y - 14, p.x, p.y + 14, 14, 'bench', i));
      }
    }
  }
  // the kerbs: road against pavement, along x (between a row and the next) and along y (a column and the next)
  const road = (t) => t === T.ROAD, walk = (t) => t === T.SIDEWALK || t === T.PLAZA;
  const kerb = (a, b) => (road(a) && walk(b)) || (walk(a) && road(b));
  const tx0 = cx * CH, ty0 = cy * CH;
  for (let y = ty0; y < ty0 + CH; y++) {
    let run = -1;
    for (let x = tx0; x <= tx0 + CH; x++) {
      const on = x < tx0 + CH && kerb(tileOf(map, x, y), tileOf(map, x, y + 1));
      if (on && run < 0) run = x;
      else if (!on && run >= 0) { if (x - run >= 3 || run === tx0 || x === tx0 + CH) segs.push(mkSeg(run * TILE, (y + 1) * TILE, x * TILE, (y + 1) * TILE, 4, 'kerb')); run = -1; }
    }
  }
  for (let x = tx0; x < tx0 + CH; x++) {
    let run = -1;
    for (let y = ty0; y <= ty0 + CH; y++) {
      const on = y < ty0 + CH && kerb(tileOf(map, x, y), tileOf(map, x + 1, y));
      if (on && run < 0) run = y;
      else if (!on && run >= 0) { if (y - run >= 3 || run === ty0 || y === ty0 + CH) segs.push(mkSeg((x + 1) * TILE, run * TILE, (x + 1) * TILE, y * TILE, 4, 'kerb')); run = -1; }
    }
  }
  return { segs, ramps };
}
function index(map) {
  let X = map._skate;
  if (!X) { X = map._skate = { ch: new Map(), props: propsByChunk(map) }; }
  return X;
}
function chunkAt(map, cx, cy) {
  const X = index(map), k = ckey(cx, cy);
  let C = X.ch.get(k);
  if (!C) { C = buildChunk(map, X, cx, cy); X.ch.set(k, C); }
  return C;
}
// the segs and ramps in the chunks round a point (px)
export function nearby(map, x, y, what = 'segs') {
  const cx = Math.floor(x / TILE / CH), cy = Math.floor(y / TILE / CH), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const C = chunkAt(map, cx + dx, cy + dy); for (const q of C[what]) out.push(q); }
  return out;
}
const gone = (map, q) => q.pi >= 0 && !!(map.propSolid && map.propSolid.get(q.pi) && map.propSolid.get(q.pi).off);
// the seg named `id` near (x, y)
export function segById(map, x, y, id) {
  for (const q of nearby(map, x, y)) if (q.id === id && !gone(map, q)) return q;
  return null;
}
// where on a seg a point is: t along it (px), d across it (px, + to its left)
const along = (q, x, y) => (x - q.x0) * q.ux + (y - q.y0) * q.uy;
const across = (q, x, y) => -(x - q.x0) * q.uy + (y - q.y0) * q.ux;
// the seg that carries on from q's end (dir 1) or start (dir -1): the next run of a kerb, a ledge laid end to end
function nextSeg(map, q, dir) {
  const ex = dir > 0 ? q.x1 : q.x0, ey = dir > 0 ? q.y1 : q.y0;
  for (const r of nearby(map, ex, ey)) {
    if (r === q || r.id === q.id || gone(map, r) || Math.abs(r.ux * q.uy - r.uy * q.ux) > 0.02 || Math.abs(r.h - q.h) > 3) continue;
    const s = r.ux * q.ux + r.uy * q.uy > 0 ? 1 : -1;   // (its own way along, against q's)
    const sx = s * dir > 0 ? r.x0 : r.x1, sy = s * dir > 0 ? r.y0 : r.y1;
    if (Math.hypot(sx - ex, sy - ey) <= 3) return { q: r, dir: s * dir };
  }
  return null;
}

// ---- the step ---------------------------------------------------------------------------------------------------
// the stick against the deck (or a heading): 0 ahead (or let go), 1 back, 2 to the left, 3 to the right
export function stickWay(a, mx, my, ml) {
  if (ml < 0.3) return 0;
  const d = wrapAngle(Math.atan2(my, mx) - a);
  return Math.abs(d) < 0.785 ? 0 : Math.abs(d) > 2.356 ? 1 : d < 0 ? 2 : 3;
}
const ev = (s, e) => { if (s.skEv) s.skEv.push(e); };
function startAir(s, T0, H, h0, k) { s.rollT = s.airT = T0; s.airH = H; s.h0 = h0; s.airK = k; s.bm = 0; s.bg = -1; s.gh = 0; s.bT = 0; s.bb = 0; }
function flip(s, way) { s.tk = FLIP0 + way; s.tt = 0; }
function fall(s, why) { s.skFall = why; s.bm = 0; s.bg = -1; s.gh = 0; s.tk = 0; s.tt = 0; s.bb = 0; ev(s, { w: 'fall', why }); }
// the balance a step on (grinds and manuals): it tips away from the middle, faster the longer you're on, wobbling, and the
// stick held against it brings it back
function balance(s, push, dt, seed) {
  const g = SKATE.gain + SKATE.gainT * s.bT, w = SKATE.wob * Math.sin(s.bT * 2.4 + seed);
  s.bb += (g * s.bb + w + SKATE.hold * push) * dt;
  s.bT += dt;
  return Math.abs(s.bb) >= 1;
}
// One step of a rider on a board, when tricks are in (shared/physics.js boardStep): true if it was a trick's step (the
// board step then does no more); false - just riding (the board step pushes and carves)
export function step(s, inp, bits, pressed, mx, my, ml, dt, ground, mods, map) {
  if (s.bm === undefined) { s.bm = 0; s.bg = -1; s.tk = 0; s.tt = 0; s.bb = 0; s.bT = 0; s.gh = 0; }
  if (s.bm === 1 || s.bm === 3) return grind(s, bits, pressed, mx, my, ml, dt, map);
  if (s.rollT > 0) return air(s, bits, pressed, mx, my, ml, dt, map);
  if (s.bm === 2) return manual(s, bits, pressed, mx, my, ml, dt, ground);
  if (s.tk) { s.tk = 0; s.tt = 0; }
  if (ground === 2) return false;
  const v = Math.hypot(s.vx, s.vy);
  // the trick button on the ground: the stick pulled back and rolling, a manual; else pop a flip
  if (pressed & IN.FIRE) {
    const way = stickWay(s.a, mx, my, ml);
    if (way === 1 && v > SKATE.manualMin) { s.bm = 2; s.bT = 0; s.bb = -0.25; s.tk = MANUAL; s.tt = 0; ev(s, { w: 'manual' }); return true; }
    startAir(s, 0.6, 16, 0, 0); flip(s, way === 1 ? 0 : way); ev(s, { w: 'air', k: 0 });
    return true;
  }
  // the ramps: rolling onto one fast enough
  if (map && v > 100) {
    const px = s.x - s.vx * dt, py = s.y - s.vy * dt;   // (where you were a step ago)
    for (const r of nearby(map, s.x, s.y, 'ramps')) {
      if (gone(map, r)) continue;
      if (r.k === 'kick') {   // ridden from the south: off its lip, up and on
        const lip = r.y0 + 3;
        if (s.vy < -80 && s.x > r.x0 + 2 && s.x < r.x1 - 2 && py >= lip && s.y < lip && py < r.y1 + 4) { startAir(s, 0.55 + v / 650, 16 + v / 22, 12, 1); ev(s, { w: 'air', k: 1, r: r.pi }); return true; }
      } else if (r.k === 'qp') {   // up it from the south: straight up, the hang, back down the way you came
        const toe = r.y1 - 4;
        if (s.vy < -120 && Math.abs(s.vx) < -s.vy && s.x > r.x0 + 4 && s.x < r.x1 - 4 && py >= toe && s.y < toe) {
          const up = -s.vy;
          startAir(s, 0.7 + up / 650, 26 + up / 14, 0, 2); s.vg = up; s.a = -Math.PI / 2; s.vx *= 0.3;
          ev(s, { w: 'air', k: 2, r: r.pi });
          return true;
        }
      } else if (r.k === 'pyr' && v > 170) {   // off a bank, going out
        const inside = (x, y) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
        if (inside(px, py) && !inside(s.x, s.y)) { startAir(s, 0.45 + v / 1200, 10 + v / 45, 8, 1); ev(s, { w: 'air', k: 1, r: r.pi }); return true; }
      }
    }
  }
  return false;
}

// In the air: the flips and grabs; up a quarter pipe and back; coming down onto a rail; landing
function air(s, bits, pressed, mx, my, ml, dt, map) {
  const T0 = s.airT || 0.55;
  s.rollT = Math.max(0, s.rollT - dt);
  const k = 1 - s.rollT / T0;
  if (s.airK === 2) {   // a quarter pipe: up the ramp, stopped at the top - the hang - and back down; turned round as you go
    const v0 = s.vg || 0, u = 1 - 2 * k;
    s.vy = -v0 * Math.sign(u) * u * u * u * u; s.vx *= Math.exp(-3 * dt);
    s.a = wrapAngle(-Math.PI / 2 + Math.PI * Math.min(1, k * 1.15) * (stickWay(-Math.PI / 2, mx, my, ml) === 2 ? -1 : 1));
  } else if (ml > 0.15) { const d = wrapAngle(Math.atan2(my, mx) - s.a), st = 1.6 * dt; s.a = wrapAngle(s.a + clamp(d, -st, st)); }
  // the trick button: a flip, or - in a big air, held - a grab
  const fire = !!(bits & IN.FIRE), big = T0 >= SKATE.grab;
  if (s.tk >= PENDING) {
    s.tt += dt;
    if (!fire) { flip(s, s.tk - PENDING); s.tt = SKATE.grabHold * 0.5; }
    else if (s.tt >= SKATE.grabHold) { s.tk = GRAB0 + s.tk - PENDING; s.tt = 0; ev(s, { w: 'grab', k: s.tk }); }
  } else if (s.tk >= GRAB0 && s.tk < GRIND0) {
    s.tt += dt;
    if (!fire || s.rollT < 0.12) { ev(s, { w: 'grabEnd', k: s.tk, t: s.tt }); s.tk = 0; s.tt = 0; }
  } else if (s.tk >= FLIP0 && s.tk < GRAB0) {
    s.tt += dt;
    if (s.tt >= TRICKS[s.tk].d) { ev(s, { w: 'trick', k: s.tk }); s.tk = 0; s.tt = 0; }
  }
  if ((pressed & IN.FIRE) && !s.tk) {
    const way = stickWay(s.a, mx, my, ml);
    if (big && s.rollT > 0.3) { s.tk = PENDING + way; s.tt = 0; } else flip(s, way);
  }
  s.over = s.rollT > 0.04 && liftAt(s) > 8;
  // coming down onto a rail
  if (map && k > 0.4 && s.airK !== 2) {
    const lift = liftAt(s), v = Math.hypot(s.vx, s.vy);
    let best = null, bd = SKATE.snap;
    for (const q of nearby(map, s.x, s.y)) {
      if (lift < q.h - 3 || lift > q.h + 14 || gone(map, q)) continue;
      const t = along(q, s.x, s.y), d = Math.abs(across(q, s.x, s.y));
      if (t < -2 || t > q.len + 2 || d > bd) continue;
      const va = (s.vx * q.ux + s.vy * q.uy) / Math.max(1, v);
      if (Math.abs(va) < Math.cos(SKATE.snapA) || v * Math.abs(va) < SKATE.grindMin + 20) continue;
      best = q; bd = d;
    }
    if (best) {
      if (s.tk && s.tk < GRIND0 && s.tk < PENDING && TRICKS[s.tk].kind === 'flip') { fall(s, 'flip'); return true; }   // (mid-flip onto a rail)
      if (s.tk >= GRAB0 && s.tk < GRIND0) ev(s, { w: 'grabEnd', k: s.tk, t: s.tt });
      const q = best, dir = s.vx * q.ux + s.vy * q.uy >= 0 ? 1 : -1, way = stickWay(Math.atan2(q.uy * dir, q.ux * dir), mx, my, ml);
      const t = clamp(along(q, s.x, s.y), 0, q.len), sp = Math.abs(s.vx * q.ux + s.vy * q.uy);
      s.x = q.x0 + q.ux * t; s.y = q.y0 + q.uy * t; s.vx = q.ux * dir * sp; s.vy = q.uy * dir * sp;
      s.a = Math.atan2(q.uy * dir, q.ux * dir);
      s.rollT = 0; s.bm = dir > 0 ? 1 : 3; s.bg = q.id; s.gh = q.h; s.bT = 0; s.bb = ((q.id & 255) / 255 - 0.5) * 0.16;
      s.tk = GRIND0 + way; s.tt = 0; s.over = true;
      ev(s, { w: 'grind', k: s.tk, q: q.k });
      return true;
    }
  }
  if (s.rollT <= 0) {   // down
    if (s.tk >= FLIP0 && s.tk < GRAB0) { fall(s, 'flip'); return true; }   // (the flip not round yet)
    if (s.tk >= GRAB0 && s.tk < GRIND0) ev(s, { w: 'grabEnd', k: s.tk, t: s.tt });
    s.tk = 0; s.tt = 0; s.airK = 0; s.vg = 0; s.h0 = 0; s.over = false;
    ev(s, { w: 'land' });
  }
  return true;
}
const liftAt = (s) => { const T0 = s.airT || 0.55, k = 1 - s.rollT / T0; return (s.h0 || 0) * (1 - k) + (s.airH ?? 15) * Math.sin(Math.PI * k); };

// On a rail: along it at the speed you came on with, the rail dragging; the balance across it; off the end or popped off
function grind(s, bits, pressed, mx, my, ml, dt, map) {
  let q = map ? segById(map, s.x, s.y, s.bg) : null;
  let dir = s.bm === 1 ? 1 : -1;
  const end = (H, why) => { const h = s.gh || 0; ev(s, { w: 'grindEnd', t: s.bT, why }); s.tk = 0; s.tt = 0; startAir(s, 0.16 + h / 110 + H / 60, H, h, 3); return true; };
  if (!q) return end(4, 'gone');
  let v = Math.max(0, Math.hypot(s.vx, s.vy) - (SKATE.fr[q.k] || 50) * dt);
  if (v < SKATE.grindMin) return end(2, 'slow');
  if (pressed & IN.DIVE) { ev(s, { w: 'grindEnd', t: s.bT, why: 'ollie' }); const h = s.gh; s.tk = 0; s.tt = 0; startAir(s, 0.55, 15, h, 0); return true; }
  if (pressed & IN.FIRE) { ev(s, { w: 'grindEnd', t: s.bT, why: 'flip' }); const h = s.gh; startAir(s, 0.6, 16, h, 0); flip(s, stickWay(s.a, mx, my, ml)); return true; }
  // the balance: the stick across the rail (+ to the left of the way you go) holds it
  const nx = q.uy * dir, ny = -q.ux * dir, push = ml > 0.15 ? clamp(mx * nx + my * ny, -1, 1) : 0;
  if (balance(s, push, dt, q.id & 7)) { fall(s, 'grind'); return true; }
  // held on its line (the ped step moves you on along it after this); at its end this step, on along the next run of it,
  // or off the end
  const t = clamp(along(q, s.x, s.y), 0, q.len);
  s.x = q.x0 + q.ux * t; s.y = q.y0 + q.uy * t;
  if (dir > 0 ? t + v * dt > q.len : t - v * dt < 0) {
    const n = nextSeg(map, q, dir);
    if (!n) { s.vx = q.ux * dir * v; s.vy = q.uy * dir * v; return end(6, 'end'); }
    q = n.q; dir = n.dir; s.bg = q.id; s.gh = q.h; s.bm = dir > 0 ? 1 : 3;
  }
  s.vx = q.ux * dir * v; s.vy = q.uy * dir * v; s.a = Math.atan2(q.uy * dir, q.ux * dir);
  s.tt += dt; s.over = true;
  return true;
}

// A manual: on the back wheels, no pushing, the stick along the deck holding the balance and across it steering a little
function manual(s, bits, pressed, mx, my, ml, dt, ground) {
  const c = Math.cos(s.a), sn = Math.sin(s.a);
  let v = Math.max(0, s.vx * c + s.vy * sn - SKATE.manualDrag * dt);
  const done = (why) => { ev(s, { w: 'manualEnd', t: s.bT, why }); s.bm = 0; s.tk = 0; s.tt = 0; s.bT = 0; s.bb = 0; };
  if (pressed & IN.DIVE) { done('ollie'); startAir(s, 0.55, 15, 0, 0); return true; }
  if (pressed & IN.FIRE) { done('flip'); startAir(s, 0.6, 16, 0, 0); flip(s, stickWay(s.a, mx, my, ml)); return true; }
  if (v < SKATE.manualMin * 0.7 || ground === 2) { done('slow'); return false; }
  const fwd = ml > 0.15 ? clamp(mx * c + my * sn, -1, 1) : 0, side = ml > 0.15 ? clamp(-mx * sn + my * c, -1, 1) : 0;
  if (balance(s, -fwd, dt, 3)) { fall(s, 'manual'); return true; }
  s.a = wrapAngle(s.a + side * SKATE.manualTurn * dt);
  const c2 = Math.cos(s.a), s2 = Math.sin(s.a);
  s.vx = c2 * v; s.vy = s2 * v; s.tt += dt;
  return true;
}

// ---- the street gaps (the server's scoring): an air from a pavement over a road to the pavement across ------------
// how many road tiles the line from (x0, y0) to (x1, y1) crosses (px)
export function roadTilesBetween(map, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 2));
  let roads = 0, last = -1;
  for (let i = 0; i <= n; i++) {
    const tx = Math.floor((x0 + (x1 - x0) * i / n) / TILE), ty = Math.floor((y0 + (y1 - y0) * i / n) / TILE), key = tx * 100000 + ty;
    if (key === last) continue;
    last = key;
    if (tileOf(map, tx, ty) === T.ROAD) roads++;
  }
  return roads;
}
export const walkway = (map, x, y) => { const t = tileOf(map, Math.floor(x / TILE), Math.floor(y / TILE)); return t === T.SIDEWALK || t === T.PLAZA; };
