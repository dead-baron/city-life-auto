// World v3b (docs/WORLD-V3.md 9.6): the north coast's harbour - the owner's concepts' north coast (concept 1: the
// peninsula's finger piers and the lighthouse on its tip; concept 2: the harbour town with its boats). The towns
// themselves are the city generator's (shared/world3-city.js CITY3: Northshore 31 round the station, North Point 32 on
// the peninsula's inlet shore, The Bluffs 34 on its headland); this lays what a street grid doesn't:
// - North Point's finger piers: decking from the peninsula's west shore out into the inlet (the sketch's five, which
//   the trace had made land - shared/world3-layout.js MAINLAND3), the fleet moored along them, the charter boat at the
//   end of one, gear on the decks, a lamp at each end; the fish shack at the piers' root (a fish market: rods, the catch
//   sold) and the harbour as a landmark;
// - Northshore's own two piers off the lobe's east shore across the inlet, its dinghies;
// - North Point Light on the peninsula's tip (the beach's, district 54: the town stops short of it), the keeper's
//   cottage, the rocks round its foot, a track up from Lighthouse Avenue's end;
// - the rocks under The Bluffs: basalt along the foot of the headland where its beach meets the sea.
// For the whole-world build only (shared/world3-world.js calls buildNorth once, from the dress hook, before the
// biomes' dressing: what it builds is kept from it, reserve 4). Deterministic: integer hashing, no Math.random, no
// trigonometry.
import { TILE, T } from './constants.js';

export const NORTH = {
  // North Point's piers: the rows (tiles) they run west along from the peninsula's shore, out over the inlet
  piers: [404, 446, 488, 530, 572], pierLen: 30, shoreFrom: 3470,
  // Northshore's piers: east from the lobe's shore into the inlet, at these rows
  lobePiers: [610, 640], lobeFrom: 3220,
  shack: [3436, 470],          // the fish shack: near here, by the piers' root
  light: [3504, 350],          // North Point Light: on the tip, rocks round it
  avenue: 3480,                // Lighthouse Avenue (world3-city.js AVE_X): the light's track comes off its north end
  bluffs: [3620, 400, 3880, 700],   // The Bluffs' coast: the rocks along the foot of the headland
  harbor: [3360, 380, 3480, 600],   // North Point's harbour (the landmark's box)
};

// North Point's own building style (the generator's STYLE form, handed in as opts.styles by district - world3-towns.js
// TOWN_STYLES' way): a harbour village, not an apartment district - cottages and small houses, the fish restaurants,
// a diner, the corner store, a bar on the water; gardens between, tin and tile roofs
export const NORTH_STYLES = {
  32: { minW: 12, minH: 12, gen: { house1: 2, house2: 2, house3: 1.5, house5: 1, rest1: 0.8, rest2: 0.8, diner: 0.4, conv: 0.5, beachbar: 0.4 }, filler: 'park', roof: 0.08, roofKinds: ['metal', 'tile'] },
};

const GROUND = new Set([T.GRASS, T.DIRT, T.SAND, T.PLAZA]);
const hash = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// a building of ours (a roof record for the classic renderer; `art` its look for art v2, or none: the kind's archetype)
function addBld(m, x, y, w, h, kind, name, roofKind, art, sign) {
  const bid = m.buildings.length;
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { if (!m.inside(tx, ty)) return null; const i = m.idx(tx, ty); if (!m.land[i] || !GROUND.has(m.tiles[i]) || m.bld[i] >= 0) return null; }
  m.roofs.push({ tx: x, ty: y, tw: w, th: h, kind: roofKind, seed: (Math.imul(x, 7919) ^ Math.imul(y, 104729)) >>> 0, d: m.dist[m.idx(x + (w >> 1), y + (h >> 1))], b: bid });
  const b = { id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x, ty: y, tw: w, th: h, kind, name, business: null, signs: sign ? [sign] : [] };
  if (art) b.art = { noShop: true, ...art };
  m.buildings.push(b);
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { m.set(tx, ty, T.BUILDING); const i = m.idx(tx, ty); m.bld[i] = bid; m.reserve[i] |= 4; }
  return b;
}

export function buildNorth(m, addProp) {
  const out = { piers: 0, decking: 0, boats: 0, shack: null, light: null, lobePiers: 0, rocks: 0, props: 0 };
  const tile = (x, y) => (m.inside(x, y) ? m.tiles[m.idx(x, y)] : T.DEEP);
  const sea = (x, y) => { if (!m.inside(x, y)) return true; const i = m.idx(x, y); return !m.land[i] && !m.river[i] && (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP); };
  const open = (x, y) => m.inside(x, y) && m.land[m.idx(x, y)] && GROUND.has(m.tiles[m.idx(x, y)]) && m.bld[m.idx(x, y)] < 0;
  const keep = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (m.inside(x, y)) m.reserve[m.idx(x, y)] |= 4; };
  const prop = (t, tx, ty, r, extra) => { if (!open(Math.floor(tx), Math.floor(ty))) return false; addProp(m, t, tx * TILE, ty * TILE, r, extra); out.props++; return true; };
  const landmark = (name, type, x0, y0, x1, y1) => (m.landmarks ||= []).push({ name, type, x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });
  const poi = (kind, label, x, y, extra) => { const p = { id: m.pois.length, kind, label, x: Math.round(x * TILE), y: Math.round(y * TILE), r: 44, fixed: true, ...extra }; m.pois.push(p); return p; };
  // the nearest top-left corner to (x, y), within r tiles, where a w x h footprint is all open ground
  const spot = (x, y, w, h, r) => {
    for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx += (Math.abs(dy) === d ? 1 : 2 * d || 1)) {
      const tx = x + dx, ty = y + dy;
      let ok = true;
      for (let yy = ty; yy < ty + h && ok; yy++) for (let xx = tx; xx < tx + w; xx++) if (!open(xx, yy)) { ok = false; break; }
      if (ok) return [tx, ty];
    }
    return null;
  };
  // a pier: 3 tiles wide along row py, from the first water tile met going `dir` (-1 west, +1 east) from x0, `len` tiles
  // out over the water (decking only on water); its boats along both sides; -> the pier's [root x, tip x] or null
  const pier = (x0, py, dir, len, k, fleet) => {
    let sx = x0, n = 0;
    while (n < 90 && !sea(sx, py)) { sx += dir; n++; }
    if (n >= 90 || !sea(sx, py - 1) || !sea(sx, py + 1)) return null;
    let laid = 0, tip = sx;
    for (let j = 0; j < len; j++) {
      const x = sx + dir * j;
      if (!sea(x, py - 2) || !sea(x, py + 2)) break;   // (not into the other shore)
      for (let o = -1; o <= 1; o++) { const i = m.idx(x, py + o); m.tiles[i] = T.DOCK; m.reserve[i] |= 16; laid++; }
      tip = x;
    }
    // (a step of decking back over the shore's last tiles: the pier meets the land)
    for (let j = 1; j <= 3; j++) for (let o = -1; o <= 1; o++) { const x = sx - dir * j, i = m.idx(x, py + o); if (m.inside(x, py + o) && (m.tiles[i] === T.SAND || m.tiles[i] === T.GRASS || m.tiles[i] === T.PLAZA) && m.bld[i] < 0) { m.tiles[i] = T.DOCK; m.reserve[i] |= 4 | 16; laid++; } }
    if (Math.abs(tip - sx) < 10) return null;
    out.decking += laid;
    addProp(m, 'lamp', (tip + 0.5 + dir * -0.6) * TILE, (py + 1.6) * TILE); out.props++;
    const L = Math.abs(tip - sx);
    for (let j = 0; j * 3.6 + 4 < L; j++) for (const side of [-1, 1]) {
      if (hash(k, j * 2 + side, 911) < fleet) continue;
      const bx = sx + dir * (3.5 + j * 3.6), by = py + side * 2.7;
      m.marina.push({ x: Math.round((bx + 0.5) * TILE), y: Math.round(by * TILE), a: dir < 0 ? Math.PI : 0, kind: hash(k, j, 912) < 0.6 ? 'dinghy' : 'speedboat' });
      out.boats++;
    }
    for (const [dx, t] of [[5, 'crates'], [11, 'drum'], [17, 'crates'], [23, 'rods']]) if (dx < L - 2 && hash(k, dx, 913) < 0.55) { addProp(m, t, (sx + dir * dx + 0.5) * TILE, (py + 0.2) * TILE, 0); out.props++; }
    return [sx, tip];
  };

  // 1. North Point's finger piers and its fleet; the charter boat at the end of the middle one
  let charter = null;
  NORTH.piers.forEach((py, k) => {
    const p = pier(NORTH.shoreFrom, py, -1, NORTH.pierLen, k, 0.3);
    if (!p) return;
    out.piers++;
    if (k === 2) charter = [p[1] - 2, py + 2.7];
  });
  if (charter) { m.marina.push({ x: Math.round(charter[0] * TILE), y: Math.round(charter[1] * TILE), a: Math.PI, kind: 'speedboat', charter: true }); out.boats++; }
  // 2. Northshore's piers off the lobe across the inlet (east into it), a few dinghies
  NORTH.lobePiers.forEach((py, k) => { if (pier(NORTH.lobeFrom, py, 1, 18, 10 + k, 0.5)) out.lobePiers++; });
  // 3. the fish shack at the piers' root: a fish market (rods, the catch sold), weathered siding and a tin roof; the
  // charter office beside it (2026-10-19: North Point's handcrafted plan - shared/world3-northpoint.js - builds both on
  // its quay: the charter office gets the boat)
  const HP = m.world3hand && m.world3hand.northpoint;
  if (HP && HP.shack) {
    out.shack = HP.shack;
    const c = m.pois.find((p) => p.kind === 'charter' && p.label === 'North Point Charters');
    if (c && charter) { c.boat = { x: Math.round(charter[0] * TILE), y: Math.round(charter[1] * TILE) }; out.charter = true; }
    const [x0, y0, x1, y1] = NORTH.harbor;
    landmark('North Point Harbor', 'harbor', x0, y0, x1, y1);
  } else {
    const at = spot(NORTH.shack[0], NORTH.shack[1], 10, 6, 40);
    if (at) {
      const [x, y] = at;
      const b = addBld(m, x, y, 10, 6, 'market', 'North Point Fish Shack', 'metal', { spec: { floors: 1, style: 'siding', wallColor: '#7a8a7a', pitch: 'gable', roof: 'metal', roofColor: '#8a6a50', slope: 0.42 } }, { x: (x + 5) * TILE, y: (y + 6.8) * TILE, text: 'Fish Shack' });
      if (b) {
        poi('fishmarket', 'North Point Fish Shack', x + 5, y + 7, { b: b.id });
        out.shack = [x, y];
        prop('crates', x - 1.2, y + 2, 10); prop('fishtable', x + 11.5, y + 3, 0); prop('drum', x + 11.5, y + 5, 6);
        const at2 = spot(x, y + 9, 8, 5, 16);
        if (at2 && charter) {
          const c = addBld(m, at2[0], at2[1], 8, 5, 'charter', 'North Point Charters', 'metal', null, { x: (at2[0] + 4) * TILE, y: (at2[1] + 5.8) * TILE, text: 'Charters' });
          if (c) { const p = poi('charter', 'North Point Charters', at2[0] + 4, at2[1] + 6, { b: c.id }); p.boat = { x: Math.round(charter[0] * TILE), y: Math.round(charter[1] * TILE) }; out.charter = true; }
        }
      }
    }
    const [x0, y0, x1, y1] = NORTH.harbor;
    landmark('North Point Harbor', 'harbor', x0, y0, x1, y1);
  }
  // 4. North Point Light on the tip: the tower (5 x 5), its patch of dirt, the keeper's cottage, a bench looking out;
  // basalt round its foot and out into the surf; the track up from Lighthouse Avenue's end
  {
    const at = spot(NORTH.light[0] - 2, NORTH.light[1] - 2, 5, 5, 16);
    if (at) {
      const lx = at[0] + 2, ly = at[1] + 2;
      for (let y = ly - 5; y < ly + 7; y++) for (let x = lx - 7; x < lx + 8; x++) if (open(x, y)) { m.tiles[m.idx(x, y)] = T.DIRT; m.reserve[m.idx(x, y)] |= 4; }
      const b = addBld(m, lx - 2, ly - 2, 5, 5, 'lighthouse', 'North Point Light', 'tile', null, { x: (lx + 0.5) * TILE, y: (ly + 3.4) * TILE, text: 'North Point Light' });
      if (b) out.light = [lx, ly];
      prop('cottage', lx + 8, ly + 2, 12, { w: 84, d: 54 });
      prop('pbench', lx - 6, ly + 3, 0, { a: Math.PI / 2 });
      for (const [dx, dy, w, d, h] of [[-6, -4, 64, 40, 40], [5, -5, 80, 48, 44], [0, -8, 96, 56, 36], [-10, -1, 48, 32, 30], [10, -2, 56, 36, 30]]) {
        addProp(m, 'outcrop', (lx + dx) * TILE, (ly + dy) * TILE, 0, { w, d, h, style: 'basalt', s: dx + dy }); m.addSolidProp((lx + dx) * TILE, (ly + dy) * TILE, Math.round(d * 0.42)); out.props++;
      }
      // the track: from the light's foot south, then over to Lighthouse Avenue's line and down it to the first road tile
      let ey = ly + 10;
      while (ey < ly + 70 && tile(NORTH.avenue, ey) !== T.ROAD) ey++;
      const dirt = (x, y) => { if (open(x, y)) { m.tiles[m.idx(x, y)] = T.DIRT; m.reserve[m.idx(x, y)] |= 4; } };
      for (let y = ly + 3; y <= ly + 9; y++) for (let o = -1; o <= 1; o++) dirt(lx + o, y);
      for (let x = Math.min(lx, NORTH.avenue) - 1; x <= Math.max(lx, NORTH.avenue) + 1; x++) for (let y = ly + 8; y <= ly + 10; y++) dirt(x, y);
      for (let y = ly + 8; y < ey; y++) for (let o = -1; o <= 1; o++) dirt(NORTH.avenue + o, y);
      out.track = ey - ly;
      keep(lx - 12, ly - 12, lx + 14, ly + 10);
      landmark('North Point Light', 'lighthouse', lx - 8, ly - 8, lx + 9, ly + 8);
    }
  }
  // 5. The Bluffs' rocks: basalt along the foot of the headland, where its beach meets the sea (every ~14 tiles of
  // shore, a few out in the surf)
  {
    const [x0, y0, x1, y1] = NORTH.bluffs;
    for (let y = y0; y < y1; y += 7) for (let x = x0; x < x1; x += 7) {
      if (hash(x, y, 921) > 0.5) continue;
      if (!m.inside(x, y) || m.tiles[m.idx(x, y)] !== T.SAND || m.dist[m.idx(x, y)] !== 54) continue;
      // (by the water: sea within 3 tiles)
      let wet = false;
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (sea(x + dx, y + dy)) wet = true;
      if (!wet) continue;
      const s = 40 + Math.floor(hash(x, y, 922) * 5) * 12;
      addProp(m, 'outcrop', (x + 0.5) * TILE, (y + 0.5) * TILE, 0, { w: s + 16, d: s, h: 28 + Math.floor(hash(x, y, 923) * 20), style: 'basalt', s: x + y });
      m.addSolidProp((x + 0.5) * TILE, (y + 0.5) * TILE, Math.round(s * 0.42));
      m.reserve[m.idx(x, y)] |= 4;
      out.rocks++;
    }
  }
  return out;
}
