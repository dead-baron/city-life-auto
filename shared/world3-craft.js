// The district craft pass (the owner, 2026-11-14 20:28: "Big open spaces (like in the Neon Strip) are way too big and
// open and the lights don't act like lanterns, they just look like random lights strung around ... every place
// beautifully crafted ... alive with interesting things and details and NPCs and decorations ... the designs and
// placements of things should be intentional"). The pieces a hand plan dresses a place with, each a group that tells
// its story - the kit the Neon Strip and the Pink Mile use first (shared/world3-neon.js, world3-pinkmile.js):
//   - canopy:   string lights as real catenaries - rows of strings, each hung between two anchors (a post of its own
//               at each end, or the walls either side), no span longer than `span` tiles (a longer run gets a post in
//               the middle, shared by the strings either side), the rows evenly apart; nothing floating
//   - terrace:  a bar's or a food place's tables out front - each table, its two chairs, the menu board by the door,
//               planters at the ends, the canopy of lights over it (or an umbrella over each table) - and the people
//               who sit at them (map.terraceSpots: server/systems/activities.js 'terrace')
//   - vendor:   the stallholder behind a market stall (map.vendorSpots: activities.js 'vendor')
//   - hang:     a knot of people on a corner, by a club's door, under the lanterns - or a queue at a box office
//               (map.hangSpots: activities.js 'hang')
//   - taxiRank: taxis waiting at the kerb (a parked taxi in each bay: map.parking model 'taxi'), the TAXI sign
//   - litPalms: the palms down a boulevard with fairy lights wound up their trunks (the art: client/art2/game/
//               statics.js 'palmlights') instead of strings looped palm to palm
// Positions in tiles; the map's lists in px. No trigonometry (shared code: the world comes out the same everywhere).
import { TILE, T } from './constants.js';

// lights strung from (x, y) to (x + dx, y + dy) (tiles), h px up, made fast at both ends ('pole' | 'wall' | 'palm' |
// 'tree' | 'lamp' | 'stall'); k 'lantern' (red paper lanterns) or none (warm bulbs)
export function fest(K, x, y, dx, dy, h, a0, a1, k = null) { K.prop('festoon', x, y, 0, { tx: Math.round(dx * TILE), ty: Math.round(dy * TILE), h, ends: [a0, a1], ...(k ? { k } : {}) }); }

// A canopy of string lights over the rectangle [x0, x1] x [y0, y1] (tiles): o.dir 'x' - the strings run west-east,
// a row every o.gap tiles north to south (the default); 'y' - they run north-south, a row every o.gap tiles west to
// east. Each row is cut into equal spans of at most o.span tiles, a post at every cut (the strings either side share
// it) - so every string hangs between two posts at the same height and sags the same. o.ends: what the row's two ends
// are made fast to ('pole' by default; 'wall' where a building stands there). Returns how many strings.
export function canopy(K, x0, y0, x1, y1, o = {}) {
  const dir = o.dir || 'x', gap = o.gap || 3, span = o.span || 7, h = o.h || 56, k = o.k || null, [e0, e1] = o.ends || ['pole', 'pole'];
  const along = dir === 'x' ? x1 - x0 : y1 - y0, across = dir === 'x' ? y1 - y0 : x1 - x0;
  const rows = Math.max(1, Math.floor(across / gap) + 1), n = Math.max(1, Math.ceil(along / span)), seg = along / n;
  const off = (across - (rows - 1) * gap) / 2;   // (the rows centred across the rectangle)
  let c = 0;
  for (let r = 0; r < rows; r++) {
    const q = (dir === 'x' ? y0 : x0) + off + r * gap;
    for (let i = 0; i < n; i++) {
      const a = (dir === 'x' ? x0 : y0) + i * seg, ea = i === 0 ? e0 : 'pole', eb = i === n - 1 ? e1 : 'pole';
      if (dir === 'x') fest(K, a, q, seg, 0, h, ea, eb, k); else fest(K, q, a, 0, seg, h, ea, eb, k);
      c++;
    }
  }
  return c;
}

// A terrace of n tables in a row west to east from (x, y) (tiles, the tables' middles), `step` tiles apart: each
// table and its two chairs (the chairs drawn with the table), an umbrella over it by day (o.umbrella: a colour list)
// or the canopy of lights over the lot (o.lights), planters at its two ends, the menu board at its west end; its
// tables are terrace spots - one or two sat at each (activities.js 'terrace')
export function terrace(K, x, y, n, o = {}) {
  const { m, prop } = K, step = o.step || 3.5, x1 = x + (n - 1) * step;
  for (let i = 0; i < n; i++) {
    const tx = x + i * step;
    prop('cafetable', tx, y, 0);
    if (o.umbrella) prop(o.umbrella[i % o.umbrella.length], tx, y - 0.1, 0);
    (m.terraceSpots ||= []).push({ x: Math.round(tx * TILE), y: Math.round(y * TILE) });
  }
  if (o.planters !== false) { prop('planter_fl', x - step * 0.55 - 0.4, y, 0); prop('planter_fl', x1 + step * 0.55 + 0.4, y, 0); }
  if (o.menu) prop('aboard', x - step * 0.55 - 0.4, y + 1.1, 0);
  if (o.lights) canopy(K, x - step * 0.5, y - 1.2, x1 + step * 0.5, y + 0.4, { gap: 1.6, span: Math.max(4, step * 2), h: o.h || 50 });
  return n;
}

// a knot of n people stood talking at (x, y) (tiles); line: [dx, dy] (tiles) - a queue, one behind another from (x, y),
// facing back along it (a box office's, a door's)
export function hang(K, x, y, n = 4, line = null) {
  (K.m.hangSpots ||= []).push({ x: Math.round(x * TILE), y: Math.round(y * TILE), n, ...(line ? { line: [Math.round(line[0] * TILE), Math.round(line[1] * TILE)] } : {}) });
}

// a stallholder behind the stall at (x, y) (tiles), facing a (radians: the aisle) - activities.js 'vendor'
export function vendor(K, x, y, a) { (K.m.vendorSpots ||= []).push({ x: Math.round(x * TILE), y: Math.round(y * TILE), a }); }

// taxis waiting at the kerb: n bays from (x, y) (tiles, the first bay's middle) along +x, facing a (radians), the TAXI
// sign on its pole at the head of the rank (sx, sy: on the pavement)
export function taxiRank(K, x, y, n, a, sx, sy) {
  for (let i = 0; i < n; i++) K.m.parking.push({ x: Math.round((x + i * 4.2) * TILE), y: Math.round(y * TILE), a, model: 'taxi', kerb: true });
  K.prop('textsign', sx, sy, 0, { text: 'TAXI', bg: '#e0b030', fg: [30, 30, 30], z: 34, sx: 2, lit: true });
}

// the palms of a planted run (a median, a pavement's grates) with lights wound up their trunks: every 'royal' palm prop
// of this plan inside [x0, x1] x [y0, y1] (tiles) - the props already placed, so the plan places its palms as before
export function litPalms(K, x0, y0, x1, y1) {
  let n = 0;
  for (let i = K.p0 || 0; i < K.m.props.length; i++) {
    const p = K.m.props[i];
    if (p.t !== 'palm_a' || p.sp !== 'royal' || p.x < x0 * TILE || p.x > x1 * TILE || p.y < y0 * TILE || p.y > y1 * TILE) continue;
    p.lit = 1; n++;
  }
  return n;
}

// the life out front of a plan's fronts (its buildings from index b0 on): a knot of friends on the pavement beside a
// bar's or a food place's door (about half of them: o.p), a queue along the front of a picture house from its door;
// not a club's (server/systems/nightclubs.js has its line and its bouncers there)
export function frontLife(K, b0, o = {}) {
  const { m } = K;
  let n = 0;
  for (let i = b0; i < m.buildings.length; i++) {
    const b = m.buildings[i];
    if (!b || !b.door || !b.name || b.door.ty !== b.ty + b.th || b.arch === 'club' || b.kind === 'club') continue;   // (its door on the street to its south)
    const kind = b.art && b.art.shop && b.art.shop.kind, side = b.door.tx > b.tx + b.tw / 2 ? -1 : 1;
    if (b.arch === 'theatre') { const x = b.door.tx + 0.5 + side * 1.6; if (paved(m, x, b.door.ty + 1)) { hang(K, x, b.door.ty + 1, 6, [side * 0.75, 0]); n++; } continue; }
    if ((kind !== 'bar' && kind !== 'diner' && kind !== 'cafe') || K.rnd(b.tx, b.ty, 960) > (o.p ?? 0.5)) continue;
    const x = b.door.tx + 0.5 + side * 2.6, y = b.door.ty + 1.4;
    if (!paved(m, x, y)) continue;
    hang(K, x, y, kind === 'bar' ? 4 : 3); n++;
  }
  return n;
}

// is (x, y) (tiles) open paving a table or a person may stand on?
export const paved = (m, x, y) => { const t = m.tiles[Math.floor(y) * m.w + Math.floor(x)]; return t === T.PLAZA || t === T.SIDEWALK; };
