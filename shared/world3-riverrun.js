// The Redwood River Run (the nature program, 2026-10-21: the GDD's "a raft or kayak run"; with the rivers' current,
// shared/flow.js). The river that leaves Highland Woods to the north runs some 400 tiles to the bay at Northshore,
// through two stretches of white water - one above the road's bridge, one below it down to the beach. Now there's a
// kayak hire at a put-in in the woods where it starts - a plank landing, the kayaks waiting along it, a sign - and a
// take-out at its last bend before the bay to hand the kayak back (any rental dock takes it: server/systems/rentals.js).
// The current carries you down; the rapids sweep you through. And it's a race: in a kayak at the put-in's landing you're
// entered, then gate to gate down the river to the take-out, first one home taking the prize (server/systems/races.js).
// For the whole-world build only (shared/world3-world.js's done hook, after the ledge falls). Deterministic: arithmetic.
import { TILE, T } from './constants.js';

// at: the river's point nearest which the landing goes (tiles); jetty: tiles out into the water; models: what's for hire
export const RIVERRUN3 = {
  name: 'Redwood River Run',
  put: { at: [2357, 1128], label: 'Redwood River Run - Kayak Hire', sign: 'RIVER RUN - PUT-IN', note: 'The current takes you down to the bay at Northshore - the white water too. Hand it in at the take-out.' },
  take: { at: [2480, 811], label: 'Redwood River Run - Take-out', sign: 'RIVER RUN - TAKE-OUT', note: 'The end of the Redwood River Run: hand your kayak in here.' },
  jetty: 6, models: ['kayak'],
  gate: 45, prize: 250,   // (the race: a gate every this many tiles down the river; the prize, as the races' - server/systems/races.js)
};

export function riverRun3(m, H3) {
  const out = { put: null, take: null, race: null };
  const V = m.waters;
  if (!V || !Array.isArray(V.ch) || !H3 || !H3.addProp || !m.rentals || !m.pois) return out;
  const R = RIVERRUN3, W = m.w, HH = m.h, inF = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < HH - 1, idx = (x, y) => y * W + x;
  const wet = (x, y) => inF(x, y) && (m.tiles[idx(x, y)] === T.WATER || m.tiles[idx(x, y)] === T.DEEP);
  const openLand = (x, y) => { if (!inF(x, y)) return false; const i = idx(x, y), t = m.tiles[i]; return m.land[i] && (t === T.GRASS || t === T.DIRT || t === T.SAND) && !(m.bld && m.bld[i] >= 0) && !(m.reserve[i] & (16 | 32)); };
  const P = [], clear = new Set();
  const landing = (E, key) => {
    // the river's centre line nearest the spot, its way there, and out to the banks either side
    let best = null;
    for (const c of V.ch) {
      if ((c.k !== 'river' && c.k !== 'creek') || !Array.isArray(c.pts)) continue;
      for (let j = 0; j < c.pts.length - 1; j++) {
        const [ax, ay] = c.pts[j], [bx, by] = c.pts[j + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((E.at[0] - ax) * dx + (E.at[1] - ay) * dy) / l2)), px = ax + dx * u, py = ay + dy * u, d = (px - E.at[0]) * (px - E.at[0]) + (py - E.at[1]) * (py - E.at[1]);
        if (!best || d < best.d) { const l = Math.sqrt(l2); best = { d, px, py, ux: dx / l, uy: dy / l }; }
      }
    }
    if (!best || best.d > 30 * 30) return null;
    const ax = Math.abs(best.uy) > Math.abs(best.ux), nx = ax ? -Math.sign(best.uy) : 0, ny = ax ? 0 : Math.sign(best.ux);   // (square to the bank along the grid: the planks run straight)
    best.ux = ax ? 0 : Math.sign(best.ux); best.uy = ax ? Math.sign(best.uy) : 0;
    for (const sd of [1, -1]) {
      let k = 0;
      while (k < 40 && wet(Math.round(best.px + nx * sd * (k + 1)), Math.round(best.py + ny * sd * (k + 1)))) k++;
      const bx = Math.round(best.px + nx * sd * (k + 1)), by = Math.round(best.py + ny * sd * (k + 1));
      let ok = k >= R.jetty + 3 && openLand(bx, by), bad = 0;   // (the bank and most of the ground behind it open: a slanting shore takes a corner off)
      for (let a = 0; a <= 4 && ok; a++) for (let b = -3; b <= 3; b++) if (!openLand(Math.round(bx + nx * sd * a + best.ux * b), Math.round(by + ny * sd * a + best.uy * b))) bad++;
      if (bad > 7) ok = false;
      if (!ok) continue;
      // the landing: planks two wide from the bank out into the water, square to it
      const tiles = [];
      for (let k2 = 1; k2 <= R.jetty; k2++) for (const w of [0, 1]) {
        const x = Math.round(bx - nx * sd * k2 + best.ux * w), y = Math.round(by - ny * sd * k2 + best.uy * w);
        if (wet(x, y)) tiles.push(idx(x, y));
      }
      if (tiles.length < R.jetty * 1.5) continue;
      for (const i of tiles) { m.tiles[i] = T.DOCK; m.reserve[i] |= 32 | 4; }
      const shore = { x: (bx + 0.5 + best.ux * 0.5) * TILE, y: (by + 0.5 + best.uy * 0.5) * TILE };
      const end = { x: (bx - nx * sd * R.jetty + 0.5) * TILE, y: (by - ny * sd * R.jetty + 0.5) * TILE };
      for (let a = -1; a <= 4; a++) for (let b = -4; b <= 4; b++) clear.add(idx(Math.round(bx + nx * sd * a + best.ux * b), Math.round(by + ny * sd * a + best.uy * b)));
      // the hire's desk on the bank, the kayaks waiting downstream of the planks, a sign, a lamp at the end
      const door = { x: shore.x + nx * sd * 1.4 * TILE, y: shore.y + ny * sd * 1.4 * TILE };
      const poi = { id: m.pois.length, kind: 'rental', label: E.label, x: door.x, y: door.y, r: 48 };
      m.pois.push(poi);
      const spots = [];
      for (let k2 = 2; k2 <= R.jetty - 1; k2 += 2) spots.push({ x: (bx - nx * sd * k2 + 0.5 - best.ux * 1.6) * TILE, y: (by - ny * sd * k2 + 0.5 - best.uy * 1.6) * TILE, a: Math.atan2(best.uy, best.ux) });
      m.rentals.push({ poi: poi.id, name: E.label, spots, models: R.models, dock: door, note: E.note });
      P.push(['textsign', door.x + best.ux * 2.4 * TILE, door.y + best.uy * 2.4 * TILE, 0, { text: E.sign, bg: '#5a3a22', fg: [250, 230, 180], z: 30 }]);
      P.push(['lamp', end.x, end.y, 0, null]);
      for (let k2 = 0; k2 < 2; k2++) P.push(['canoe', door.x - best.ux * (1.6 + k2 * 0.9) * TILE + nx * sd * 0.8 * TILE, door.y - best.uy * (1.6 + k2 * 0.9) * TILE + ny * sd * 0.8 * TILE, 0, { a: Math.atan2(best.uy, best.ux), c: k2 + 1 }]);   // (two more kayaks pulled up on the bank)
      return { [key]: [bx, by], poi: poi.id, spots: spots.length };
    }
    return null;
  };
  out.put = landing(R.put, 'shore');
  out.take = landing(R.take, 'shore');
  if (clear.size && H3.removeProps) H3.removeProps(m, (x, y) => clear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, ex] of P) H3.addProp(m, t, Math.round(x), Math.round(y), r, ex);
  // the race (server/systems/races.js, kind 'kayak'): from the put-in's landing down the river through a gate every
  // `gate` tiles of the centre line - from channel to channel where one runs into the next - to the take-out
  if (out.put && out.take) {
    const near = (x, y) => { let b = null; V.ch.forEach((c, ci) => { if ((c.k !== 'river' && c.k !== 'creek') || !Array.isArray(c.pts)) return; c.pts.forEach((q, j) => { const d = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y); if (!b || d < b.d) b = { d, ci, j }; }); }); return b; };
    const a = near(out.put.shore[0], out.put.shore[1]), z = near(out.take.shore[0], out.take.shore[1]), pts = [];
    let ci = a.ci, j = a.j;
    for (let hop = 0; hop < 8; hop++) {
      const c = V.ch[ci];
      if (ci === z.ci) { for (let k = j; k <= z.j; k++) pts.push(c.pts[k]); break; }
      for (let k = j; k < c.pts.length; k++) pts.push(c.pts[k]);
      const [ex, ey] = c.pts[c.pts.length - 1];
      let nx = -1;
      V.ch.forEach((c2, k2) => { if (k2 !== ci && (c2.k === 'river' || c2.k === 'creek') && c2.pts.length && (c2.pts[0][0] - ex) * (c2.pts[0][0] - ex) + (c2.pts[0][1] - ey) * (c2.pts[0][1] - ey) < 100) nx = k2; });
      if (nx < 0) break;
      ci = nx; j = 0;
    }
    // (a gate on the open water: past a bridge's deck or a ledge's lip to the next point that's wet; the last gate - the
    // finish - takes the place of one just before it)
    const cps = [];
    let run = 0;
    for (let k = 1; k < pts.length; k++) {
      run += Math.sqrt((pts[k][0] - pts[k - 1][0]) * (pts[k][0] - pts[k - 1][0]) + (pts[k][1] - pts[k - 1][1]) * (pts[k][1] - pts[k - 1][1]));
      const last = k === pts.length - 1;
      if (run < R.gate && !last) continue;
      const gx = Math.round(pts[k][0]), gy = Math.round(pts[k][1]);
      if (!wet(gx, gy)) continue;
      if (last && cps.length && run < R.gate / 2) cps.pop();
      cps.push({ x: Math.round((gx + 0.5) * TILE), y: Math.round((gy + 0.5) * TILE) });
      run = 0;
    }
    if (cps.length >= 4 && m.races) {
      const st = m.rentals.find((q) => q.poi === out.put.poi).spots[0];
      const race = { id: m.races.length, name: R.name, kind: 'kayak', start: { x: Math.round(st.x), y: Math.round(st.y) }, cps, prize: R.prize, where: 'the put-in\'s landing in the woods' };
      m.races.push(race);
      m.pois.push({ id: m.pois.length, kind: 'race', label: R.name, x: race.start.x, y: race.start.y, r: 60 });
      out.race = { id: race.id, gates: cps.length };
    }
  }
  if (out.put && out.take) {
    m.natureSites.push({ kind: 'riverrun', name: R.name, x: Math.round((out.put.shore[0] + 0.5) * TILE), y: Math.round((out.put.shore[1] + 0.5) * TILE), to: { x: Math.round((out.take.shore[0] + 0.5) * TILE), y: Math.round((out.take.shore[1] + 0.5) * TILE) } });
    if (!(m.landmarks || []).some((l) => l.name === R.name)) m.landmarks.push({ name: R.name, type: 'marina', x: (out.put.shore[0] - 8) * TILE, y: (out.put.shore[1] - 8) * TILE, w: 16 * TILE, h: 16 * TILE });
  }
  return out;
}
