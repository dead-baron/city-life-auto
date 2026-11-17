// The map's places, looked up fast on the server. Every player's prompt (players.js findInteraction, 5 times a second)
// asks which place they're standing at and looks through a few kinds of place - over World v3's thousands of places,
// once a list each, it was most of the server's per-player time (11-17: 0.4 ms a player a tick at 100 players).
// Kept here, beside the map, not in it (shared/mapcore.js is part of the world's and the art's hashes; the map's fields
// are its data): each is made once per places' array, and again if its length changes.

// The nearest place whose circle (x, y) is in - the first of equals - as CityMap.poiNear (shared/mapcore.js), through a
// grid of the places' circles: each place's index in every CELL cell its circle touches (a very wide one in .big,
// looked at always).
const CELL = 256, BIG = 2048;
const GRIDS = new WeakMap();
function gridOf(pois) {
  let G = GRIDS.get(pois);
  if (G && G.n === pois.length) return G;
  G = { n: pois.length, cells: new Map(), big: [] };
  for (let i = 0; i < pois.length; i++) {
    const p = pois[i];
    if (!p || !(p.r >= 0)) continue;   // (no radius: never anyone's place - as poiNear)
    if (p.r > BIG) { G.big.push(i); continue; }
    const x0 = Math.floor((p.x - p.r) / CELL), x1 = Math.floor((p.x + p.r) / CELL);
    const y0 = Math.floor((p.y - p.r) / CELL), y1 = Math.floor((p.y + p.r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = cx * 65536 + cy;
      let L = G.cells.get(k);
      if (!L) G.cells.set(k, (L = []));
      L.push(i);
    }
  }
  GRIDS.set(pois, G);
  return G;
}
export function poiAt(m, x, y, kind = null) {
  const pois = m.pois, G = gridOf(pois);
  let best = null, bd = Infinity, bi = Infinity;
  const look = (L) => {
    for (let j = 0; j < L.length; j++) {
      const i = L[j], p = pois[i];
      if (!p || (kind && p.kind !== kind)) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d <= p.r * p.r && (d < bd || (d === bd && i < bi))) { bd = d; best = p; bi = i; }
    }
  };
  const L = G.cells.get(Math.floor(x / CELL) * 65536 + Math.floor(y / CELL));
  if (L) look(L);
  if (G.big.length) look(G.big);
  return best;
}

// The places that pass a test (key: a name for the test), worked out once per map. The list is shared: never sort or
// change it (copy it first).
const LISTS = new WeakMap();
export function poisWhere(m, key, test) {
  const pois = m.pois;
  let C = LISTS.get(pois);
  if (!C || C.n !== pois.length) LISTS.set(pois, (C = { n: pois.length, lists: new Map() }));
  let L = C.lists.get(key);
  if (!L) C.lists.set(key, (L = pois.filter((q) => q && test(q))));
  return L;
}
export const poisKind = (m, kind) => poisWhere(m, 'kind:' + kind, (q) => q.kind === kind);
