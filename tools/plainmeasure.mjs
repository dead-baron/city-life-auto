// How plain a built map's buildings are (tools/plainblocks.mjs, test/plainblocks.test.js): for each building its
// footprint, where it came from and what makes it more than a blank box - a front on an open street (the south side,
// the camera's: the art draws a shopfront or a door there), a sign, a place (a business, a home, a walk-in, a POI that
// isn't just a delivery drop) and hand dressing (a designed look). A building with no sign, no place and no dressing is
// plain; its score (0-4) counts what it lacks, the front too.
import { T } from '../shared/constants.js';

// the histogram's bins (footprint area, tiles)
export const AREA_BINS = [0, 50, 100, 200, 300, 400, 600, 800, 1200, 2000];
// no plain footprint bigger than this (tiles): a 1080p screen shows about 48 x 27 tiles (client/main.js baseZoom), so
// 400 tiles (20 x 20) is a block a sixth of the view - the owner's "vast blank block" was half of it
export const PLAIN_CAP = 400;

export function surveyBuildings(m) {
  const placeOf = new Map(), delivery = new Set();
  for (const p of m.pois) if (p && p.b !== undefined) { if (p.kind === 'delivery') delivery.add(p.b); else placeOf.set(p.b, p.kind); }
  const open = (t) => t !== T.BUILDING && t !== T.WALL && t !== T.WATER && t !== T.DEEP;
  const list = [];
  let plain = 0;
  for (const b of m.buildings) {
    if (!b || b.gone || b.kind === 'motorpool') continue;   // (a motor pool is a walled yard, not a building: map.js buildMotorPools)
    let o = 0;
    for (let x = b.tx; x < b.tx + b.tw; x++) if (m.inside(x, b.ty + b.th) && open(m.tiles[m.idx(x, b.ty + b.th)])) o++;
    const turned = !!b.walkIn && !b.walkIn.south;
    const front = !b.back && !turned && o >= b.tw * 0.5;
    const sign = !!(b.signs && b.signs.length);
    const place = !!(b.business || b.home !== undefined || b.walkIn || placeOf.has(b.id));
    const dressed = !!(b.art || b.look || b.handLook || b.hero || b.dress);
    const score = (front ? 0 : 1) + (sign ? 0 : 1) + (place ? 0 : 1) + (dressed ? 0 : 1);
    const isPlain = !sign && !place && !dressed;
    if (isPlain) plain++;
    const pf = b.prefab >= 0 ? m.prefabs[b.prefab] : null;
    const src = b.hand ? 'hand' : b.hero ? 'hero' : pf ? 'prefab:' + pf.key : b.roof >= 0 ? (b.back ? 'roof-back' : 'roof') : 'other';
    const d = m.dist[m.idx(Math.min(m.x0 + m.w - 1, b.tx + (b.tw >> 1)), Math.min(m.y0 + m.h - 1, b.ty + (b.th >> 1)))];
    list.push({ id: b.id, tx: b.tx, ty: b.ty, tw: b.tw, th: b.th, area: b.tw * b.th, d, kind: b.kind, src, back: !!b.back, front, sign, place, dressed, delivery: delivery.has(b.id), score, plain: isPlain });
  }
  return { list, plain };
}

// the plain footprints over the cap
export const oversized = (S, cap = PLAIN_CAP) => S.list.filter((q) => q.plain && q.area > cap);

// How deep the plain mass runs: down each column of tiles, the unbroken runs of plain buildings' tiles (neighbours
// stacked north-south with nothing open between them read as one blank block from the camera). -> { runs: [[len, x,
// y0]...] of runs longer than `min`, longest }
export function plainRuns(m, S, min = 20) {
  const plainB = new Set(S.list.filter((q) => q.plain).map((q) => q.id));
  const runs = [];
  let longest = 0;
  const cols = new Map();   // (only the columns plain buildings stand in)
  for (const q of S.list) if (q.plain) for (let x = q.tx; x < q.tx + q.tw; x++) { const c = cols.get(x) || []; c.push([q.ty, q.ty + q.th]); cols.set(x, c); }
  for (const [x, c] of cols) {
    let y0 = Infinity, y1 = -Infinity;
    for (const [a, b] of c) { y0 = Math.min(y0, a); y1 = Math.max(y1, b); }
    let run = 0, start = y0;
    for (let y = y0; y <= y1; y++) {
      const i = y < y1 && m.inside(x, y) ? m.bld[m.idx(x, y)] : -1;
      if (i >= 0 && plainB.has(i)) { if (!run) start = y; run++; continue; }
      if (run > longest) longest = run;
      if (run > min) runs.push([run, x, start]);
      run = 0;
    }
  }
  return { runs, longest };
}

// ---- the tall plain towers (the owner, 2026-11-06: "there are still a lot of really huge tall plain buildings, like park
// west tower ... make those buildings more interesting, less tall, maybe split them up into multiple buildings") --------
// A hand plan's tower is drawn whole (one section: its spec's floors across the whole front), so a big one is one wall of
// glass or stone as wide as its lot and as tall as its floors. Plain here is what the eye sees: a tower whose look is the
// towers' kit alone (shared/world3-downtown.js towerKit: its floors, its skin, a lobby with its name) - no business but a
// delivery stop (a home behind the lobby counts as plain: it shows nothing), no walk-in, no set-piece kit, no neon, no
// light of its own. Height: the art's wall (client/art2/buildings.js buildingH, its ground floor a shop's), in px and tiles.
export const TOWER_FLOORS = 8;      // tall: this many floors or more (8 floors: about 470 px, 15 tiles drawn up over the north)
export const TOWER_FRONT = 24;      // big: a front this wide (tiles) or more ...
export const TOWER_AREA = 600;      // ... or a footprint this big
export const wallPx = (f, parapet = 12) => 64 + (Math.max(1, f) - 1) * 56 + 6 + parapet;
export function surveyTowers(m) {
  const pois = new Map();
  for (const p of m.pois) if (p && p.b !== undefined) { const a = pois.get(p.b) || []; a.push(p); pois.set(p.b, a); }
  const list = [];
  for (const b of m.buildings) {
    if (!b || b.gone || !b.art || !b.art.spec) continue;
    const s = b.art.spec, f = s.height ? Math.round(s.height / 56) : s.floors || 0;
    if (f < 6) continue;
    const P = pois.get(b.id) || [];
    const role = P.filter((p) => p.kind !== 'delivery' && p.kind !== 'home').map((p) => p.kind);
    const plain = !!b.whole && !b.walkIn && (!b.business || b.business === 'delivery') && !role.length && !b.art.kit && !b.art.neon && !(b.art.lights && b.art.lights.length) && !b.hero && !b.towerPart;
    const H = s.height || wallPx(f, s.parapet ?? 12), Ht = Math.ceil(H / 32);
    // what it hides: the camera draws it up over the tiles north of it - the street tiles, the places and the signs of
    // other buildings in the strip its wall covers
    let road = 0, hidden = 0;
    const y0 = b.ty - Ht;
    for (let y = Math.max(m.y0, y0); y < b.ty; y++) for (let x = b.tx; x < b.tx + b.tw; x++) { if (!m.inside(x, y)) continue; const t = m.tiles[m.idx(x, y)]; if (t === T.ROAD || t === T.SIDEWALK || t === T.PLAZA) road++; }
    for (const p of m.pois) if (p && p.b !== b.id && p.x >= b.tx * 32 && p.x < (b.tx + b.tw) * 32 && p.y >= y0 * 32 && p.y < b.ty * 32 && p.kind !== 'delivery') hidden++;
    const d = m.dist[m.idx(Math.min(m.x0 + m.w - 1, b.tx + (b.tw >> 1)), Math.min(m.y0 + m.h - 1, b.ty + (b.th >> 1)))];
    const big = b.tw >= TOWER_FRONT || b.tw * b.th >= TOWER_AREA, tall = f >= TOWER_FLOORS;
    list.push({ id: b.id, name: b.name, tx: b.tx, ty: b.ty, tw: b.tw, th: b.th, area: b.tw * b.th, floors: f, H, Ht, d, arch: b.arch || b.kind, style: s.style || 'glass', home: b.home !== undefined, role, plain, big, tall, slab: plain && big && tall, road, hidden, part: b.towerPart || null });
  }
  return list;
}
