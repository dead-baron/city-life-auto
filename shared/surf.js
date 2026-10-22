// Surfing (the owner's #312, 10-08): the surf breaks and the waves that roll into them - the same on the server, which
// rides you on them (server/systems/surf.js), and on the page, which draws them (client/art2/game/surfart.js).
//
// A break (findBreaks, once per map, on the server): a stretch of sandy beach facing the open sea - the beach straight
// enough for a wave to run along it, open water out in front. Each is { id, x, y (px: the waterline at its middle), nx,
// ny (out to sea), half (px along the beach either side of the middle), ph (its sets' phase, s), side (+1 or -1: which
// end the waves start to break from) }; the page gets the ones near you in your 'me'.
//
// The waves (wavesAt, from the world's tick, so the page and the server agree to the frame): sets of SURF.waves, gapS
// apart, a lull between sets; each rises SURF.start px out and rolls in at SURF.speed, steepens, starts to break at
// SURF.brk px out - from one end of the beach, the break peeling along the crest at SURF.peel px/s toward the other -
// and washes up at SURF.shore. Surfing it (surf.js): paddle for the beach as a wave comes (in front of its crest,
// where it hasn't broken) and you're up; ride it along the face ahead of the peel; the white water behind the peel
// catches you if you stay in it.
// Arithmetic only (no Math.sin and the like): the page and the server must agree.
import { TILE, T } from './constants.js';
import { SURFBOARD_PRICE } from './rules-base.js';

export const SURF = {
  price: SURFBOARD_PRICE,   // a surfboard at the surf shops and the sports shops
  waves: 3, gapS: 4.5, lullS: 13,    // a set: three waves 4.5 s apart, then 13 s of calm
  speed: 84,           // px/s a wave rolls in - faster than you paddle, so paddling in ahead of one, it catches you up
  start: 22 * TILE,    // px out where a wave rises
  brk: 11 * TILE,      // px out where it starts to break
  shore: 42,           // px out where it washes up
  peel: 100,           // px/s the break runs along the crest
  catch: [-26, 18],    // you catch a wave with its crest this far behind (-) / in front of you (px across it)
  paddle: 70,          // px/s lying on the board, paddling (half again as fast as you swim)
  along: 230,          // px/s the fastest you carve along the face
  face: 12,            // px in front of the crest you ride
  pocket: 140,         // px ahead of the break: the pocket, where the points are
  airS: 0.75,          // s up in the air off the lip
  wipeS: 1.6,          // s tumbling in the white water
  pts: { base: 20, speed: 0.14, pocket: 45, air: 300, carve: 90, carveS: 1.2 },   // points: a second's ride, per px/s along, a second in the pocket, an aerial, a carve
  near: 2600,          // px: a break this near you is in your 'me'
};
export const SET_S = SURF.waves * SURF.gapS + SURF.lullS;
export const LIFE_S = (SURF.start - SURF.shore) / SURF.speed;

const ih = (a, b, s) => { let h = (a * 374761393 + b * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the waves on break B at time t (s): [{ id, d (px out from the waterline: its crest), age (s), size (0.75 .. 1.2), edge
// (along the beach, px from the middle: the break's front - behind it, toward the end it started from, it's white
// water; null before it breaks), green (not yet breaking) }]
export function wavesAt(B, t, out = []) {
  out.length = 0;
  const n1 = Math.floor((t - B.ph) / SET_S);
  for (let n = n1 - 1; n <= n1; n++) for (let j = 0; j < SURF.waves; j++) {
    const t0 = B.ph + n * SET_S + j * SURF.gapS, age = t - t0;
    if (age < 0 || age > LIFE_S) continue;
    const d = SURF.start - age * SURF.speed, id = n * SURF.waves + j, aBrk = (SURF.start - SURF.brk) / SURF.speed;
    const size = 0.75 + ih(B.id, id, 7) * 0.45;
    const edge = age < aBrk ? null : -B.side * B.half + B.side * SURF.peel * (age - aBrk);
    out.push({ id, d, age, size, edge, green: age < aBrk });
  }
  return out;
}
// where (x, y) is on break B: { a (px along the beach from its middle), d (px out from the waterline) }
export function onBreak(B, x, y) {
  const dx = x - B.x, dy = y - B.y;
  return { a: dx * -B.ny + dy * B.nx, d: dx * B.nx + dy * B.ny };
}
// a point on break B: a along, d out
export function breakPt(B, a, d) { return { x: B.x + -B.ny * a + B.nx * d, y: B.y + B.nx * a + B.ny * d }; }
// has the break reached a (along) on wave w?
export const broken = (B, w, a) => w.edge !== null && B.side * (a - w.edge) <= 0;

// The breaks of a map (the server's, once): sandy beaches facing the open sea, straight for a wave to run along them,
// the water out in front open (no lake, river, dock or bridge; no land for SURF.start px). At most one to a CELL
// tiles' square; at least MIN_HALF tiles of beach either side.
const CELL = 40, MIN_HALF = 7, MAX_HALF = 18, STEP = 3;
export function findBreaks(m) {
  const W = m.w, H = m.h, X0 = m.x0 || 0, Y0 = m.y0 || 0;
  const at = (tx, ty) => (m.inside ? (m.inside(tx, ty) ? m.idx(tx, ty) : -1) : tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1);
  const sea = (tx, ty) => { const i = at(tx, ty); if (i < 0) return false; const t = m.tiles[i]; return (t === T.WATER || t === T.DEEP) && !(m.river && m.river[i]) && !(m.lake && m.lake[i]) && !(m.land && m.land[i]); };
  const sand = (tx, ty) => { const i = at(tx, ty); return i >= 0 && m.tiles[i] === T.SAND; };
  const best = new Map();
  for (let ty = Y0 + 2; ty < Y0 + H - 2; ty += STEP) for (let tx = X0 + 2; tx < X0 + W - 2; tx += STEP) {
    if (!sand(tx, ty)) continue;
    if (!sea(tx + 1, ty) && !sea(tx - 1, ty) && !sea(tx, ty + 1) && !sea(tx, ty - 1)) continue;
    // out to sea: toward the water round it
    let sx = 0, sy = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if ((dx || dy) && sea(tx + dx, ty + dy)) { const l = Math.sqrt(dx * dx + dy * dy); sx += dx / l; sy += dy / l; }
    const l = Math.sqrt(sx * sx + sy * sy);
    if (l < 3) continue;
    const nx = sx / l, ny = sy / l;
    // open water in front, as far out as the waves rise, and to either side of that line at the break
    let open = true;
    for (let k = 2; k <= SURF.start / TILE + 2 && open; k++) if (!sea(Math.round(tx + nx * k), Math.round(ty + ny * k))) open = false;
    for (let j = -8; j <= 8 && open; j += 4) if (!sea(Math.round(tx + nx * 12 - ny * j), Math.round(ty + ny * 12 + nx * j))) open = false;
    if (!open) continue;
    // the beach straight along the waterline: either way, the water's edge within 1.5 tiles of this one's line
    const edgeAt = (j) => {   // (how far out the water starts j tiles along: from 3 tiles in to 3 out)
      for (let k = -3; k <= 3; k++) if (sea(Math.round(tx - ny * j + nx * k), Math.round(ty + nx * j + ny * k))) return k;
      return null;
    };
    const e0 = edgeAt(0);
    if (e0 === null) continue;
    let half = 0;
    for (let j = 1; j <= MAX_HALF; j++) {
      const a = edgeAt(j), b = edgeAt(-j);
      if (a === null || b === null || Math.abs(a - e0) > 1.5 || Math.abs(b - e0) > 1.5 || !sand(Math.round(tx - ny * j - nx), Math.round(ty + nx * j - ny)) || !sand(Math.round(tx + ny * j - nx), Math.round(ty - nx * j - ny))) break;
      half = j;
    }
    if (half < MIN_HALF) continue;
    const k = Math.floor(tx / CELL) * 65536 + Math.floor(ty / CELL), cur = best.get(k);
    if (!cur || half > cur.half) best.set(k, { tx, ty, nx, ny, half, e0 });
  }
  // (a break too close to a better one: dropped)
  const list = [...best.values()].sort((a, b) => b.half - a.half), out = [];
  for (const c of list) {
    if (out.some((o) => Math.hypot(o.tx - c.tx, o.ty - c.ty) < CELL * 0.8)) continue;
    out.push(c);
  }
  return out.map((c, id) => ({
    id, x: Math.round((c.tx + 0.5 + c.nx * (c.e0 - 0.5)) * TILE), y: Math.round((c.ty + 0.5 + c.ny * (c.e0 - 0.5)) * TILE),
    nx: Math.round(c.nx * 1000) / 1000, ny: Math.round(c.ny * 1000) / 1000, half: c.half * TILE,
    ph: Math.round(ih(c.tx, c.ty, 11) * SET_S * 10) / 10, side: ih(c.ty, c.tx, 13) < 0.5 ? -1 : 1,
  }));
}
