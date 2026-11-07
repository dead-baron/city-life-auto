// A walk-in's front is drawn where its doorway is (the owner's 2026-11-03 report: Yards Urgent Care, "looks like this
// hospital might be backwards, door at the bottom doesn't work you have to go through the top part"). Its doorway is on
// the north - a hand plan facing a street there, or shared/map.js walkInSouth turning it round - and art v2's cutaway
// drew every room as if its door were on the south: the glass front and a gap in the south wall, the back wall's
// fittings on the north wall, the real doorway shut. Now (client/art2/game/statics.js makeCut, r.north) the wall with
// the doorway is open there and the other wall is shut, in every walk-in seen cut away; a clinic's glass front is on the
// doorway's side; and a walk-in turned round has no shopfront on its south wall (sectionsOf).
// And a clinic's doorway opens onto a street you can see it from (the owner's second 11-03 report: Northgate Clinic
// opened straight under the El - shared/world3-medics.js streetFront3).
// Builds World v3: run under the heavy lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { staticItems, makeStatic } from '../client/art2/game/statics.js';
import { loadProviders } from '../client/art2/game/chunkbake.js';
import { TILE, CHUNK_TILES } from '../shared/constants.js';
import { CLINICS3, POSTS3, streetFront3, overhead3, doorSouth3 } from '../shared/world3-medics.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });

const CUT = 18;   // (makeCut: the height a wall is cut down to)

// the side each wall of the room is drawn open at the doorway's columns: 'S', 'N', or '?' (both or neither)
function drawnFront(G, r, u) {
  const a = (x, Y, z) => { const row = G.ay - r.d + Y - z; return row >= 0 && row < G.h ? G.col[(row * G.w + x) * 4 + 3] : 0; };
  let openN = 0, openS = 0, n = 0;
  for (let x = Math.max(0, u.dx + 6); x < Math.min(r.w, u.dx + u.dw - 6); x++) {
    n++;
    if (!a(x, r.inY0, 8)) openN++;          // (the north wall's face, low down)
    if (!a(x, r.d - 4, CUT)) openS++;       // (the south wall's cap)
  }
  if (!n) return null;
  const N = openN > n / 2, S = openS > n / 2;
  return N && !S ? 'N' : S && !N ? 'S' : '?';
}
// a hospital's glass: on the south wall's face, or on the north wall's face between the sill and the transom
function glassSide(G, r, u) {
  const c = (x, Y, z) => { const row = G.ay - r.d + Y - z; if (row < 0 || row >= G.h) return null; const j = (row * G.w + x) * 4; return G.col[j + 3] ? [G.col[j], G.col[j + 1], G.col[j + 2]] : null; };
  const blue = (q) => !!q && q[2] - q[0] > 30;
  let gN = 0, gS = 0, n = 0;
  for (let x = Math.max(36, u.x0 + 8); x < Math.min(r.w - 36, u.x1 - 8); x++) {
    if (x >= u.dx - 4 && x < u.dx + u.dw + 4) continue;
    n++;
    if (blue(c(x, r.inY0, 37))) gN++;
    if (blue(c(x, r.d, 9))) gS++;
  }
  return !n ? null : gN > n / 2 && gS < n / 4 ? 'N' : gS > n / 2 && gN < n / 4 ? 'S' : '?';
}

test('every walk-in seen cut away: its front - the doorway open, the glass - on its doorway\'s side, the wall opposite shut', async () => {
  await loadProviders();
  const CH = CHUNK_TILES * TILE;
  const all = M.walkIns.map((id) => M.buildings[id]).filter((b) => b && b.walkIn && !b.walkIn.units.some((u) => u.kind === 'bowling' || u.kind === 'cinema'));
  const north = all.filter((b) => !b.walkIn.south);
  const south = all.filter((b) => b.walkIn.south).filter((b, i) => i % 8 === 0 || b.walkIn.units.some((u) => u.kind === 'hospital'));   // (one in eight, and every clinic: its glass front looked at - a one-in-eight sample can miss them all when the list shifts)
  assert.ok(north.length >= 5, `walk-ins with their doorway on the north (${north.length})`);
  const bad = [], badGlass = [];
  let seen = 0, glass = 0, outside = 0;
  for (const b of [...north, ...south]) {
    const name = `${(M.pois[b.walkIn.units[0].poi] || {}).label || b.name} #${b.id}`, want = b.walkIn.south ? 'S' : 'N';
    const fy = b.walkIn.south ? b.ty + b.th - 1 : b.ty;   // (the front wall's row)
    const items = new Map(), outs = new Map();
    for (let cy = Math.floor(b.ty * TILE / CH); cy <= Math.floor(((b.ty + b.th) * TILE - 1) / CH); cy++) {
      for (let cx = Math.floor(b.tx * TILE / CH); cx <= Math.floor(((b.tx + b.tw) * TILE - 1) / CH); cx++) {
        for (const it of staticItems(M, cx, cy, { cutaway: b.id })) if (it.b === b.id && it.key.startsWith('cut:')) items.set(it.key, it);
        if (!b.walkIn.south) for (const it of staticItems(M, cx, cy, {})) if (it.b === b.id && it.door) outs.set(it.key, it);
      }
    }
    for (const it of items.values()) {
      const r = it.recipe, sty = Math.round((it.fp[1]) / TILE), sth = Math.round((it.fp[3] - it.fp[1]) / TILE);
      if (fy < sty || fy >= sty + sth) continue;   // (a section of a deep footprint without the front wall)
      const G = makeStatic(r);
      for (const u of r.units) {
        const side = drawnFront(G, r, u);
        if (side === null) continue;
        seen++;
        if (side !== want) bad.push(`${name}: doorway on the ${want}, drawn open on the ${side}`);
        if (u.kind === 'hospital') { glass++; const g = glassSide(G, r, u); if (g !== null && g !== want) badGlass.push(`${name}: glass on the ${g}`); }
      }
    }
    for (const it of outs.values()) { outside++; bad.push(`${name}: a door that opens drawn on its south front, its doorway on the north (${it.key})`); }
  }
  assert.ok(seen > 100, `doorways looked at (${seen})`);
  assert.ok(glass >= 3, `clinics and hospitals looked at (${glass})`);
  assert.deepEqual(bad, [], `the front drawn where the doorway is (${bad.length} of ${seen}, ${outside} doors outside)`);
  assert.deepEqual(badGlass, [], 'a clinic\'s glass front on its doorway\'s side');
});

test('every clinic, first-aid post and ranger station: its doorway on open street - nothing over it, no tracks', () => {
  const over = overhead3(M), bad = [];
  let n = 0;
  for (const name of [...CLINICS3.map((q) => q[1]), ...POSTS3.map((q) => q[0])]) {
    const p = M.pois.find((q) => q.kind === 'hospital' && q.label === name), b = p && p.b !== undefined ? M.buildings[p.b] : null;
    if (!b) continue;   // (a lifeguard tower's post: no building)
    n++;
    const south = b.walkIn ? b.walkIn.south : doorSouth3(M, b);
    if (!streetFront3(M, b, south, over)) bad.push(`${name} #${b.id}: its doorway on the ${south ? 'south' : 'north'}, not on open street`);
  }
  assert.ok(n >= CLINICS3.length, `clinics and posts looked at (${n})`);
  assert.deepEqual(bad, []);
  // (under the El: the street it stands over is no clinic's front)
  const ng = M.pois.find((q) => q.kind === 'hospital' && q.label === 'Northgate Clinic'), nb = M.buildings[ng.b];
  const fy = nb.walkIn.south ? nb.ty + nb.th : nb.ty - 1;
  for (let k = 0; k < 4; k++) for (let tx = nb.tx + 1; tx < nb.tx + nb.tw - 1; tx++) { const ty = fy + (nb.walkIn.south ? k : -k); assert.ok(!over(M.idx(tx, ty), tx, ty), `Northgate Clinic: nothing over its front (${tx}, ${ty})`); }
});
