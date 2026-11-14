// The placement lint (test/placementlint.test.js; the owner, 2026-11-13: "catch some of these kinds of errors since we're
// seeing a fair amount of signs being partially covered or some visual issues like boats parked in rocks"). On a built
// map (World v3 as the server builds it), what's placed against what's round it - on the map's own data, no bake:
//   boats        a moored boat (m.marina), a hire craft's spot (m.rentals), a moored yacht or sailboat (props): its hull on
//                clear water - every point of it on WATER / DEEP, none on a rock's round (a sea stack, a seal rock, a
//                boulder, an outcrop)
//   floats       a floating prop (a swim buoy, a ring float, a swim raft, a mooring) on the water and off the rocks
//   signOverSign two standing boards (the text signs, the picture boards, the billboards, the motels' signs) over each
//                other on screen
//   signOverFront a board standing in front of a building with its face over the building's ground floor - its door,
//                its name (the Harbor's HARBOR MARINA over the boat hire's Rentals)
//   dupName      two boards of the same words within DUP_R (about a screen), or a board within DUP_B of the building
//                whose own front says the same words
//   inBuilding   a plant inside a building's walls (up on its roof), a plaza's furniture inside a city block
//   wildNeon     a lit text sign in the wilds (a 'wild' district - on the water, the land's beside it: shared/world3-tidy.js
//                wildAt): there it's a trail sign (wood)
//   startOnCraft a race's start buoy within reach of a craft's spot: drawn over the boat, it hid it
// spotWhy(M, e, def, want) is the same look for something put down while the game runs (a scene's vehicles and people)
// lint(M) -> { rows: { kind: [{ what, x, y, why }] }, seen: { boats, signs, props } }
//   node tools/placementlint.mjs   builds World v3 and prints the rows (the heavy lock)
import { TILE, T } from '../shared/constants.js';
import { wildAt, TIDY3 } from '../shared/world3-tidy.js';
import { VEHICLES } from '../shared/vehicles.js';
import { layoutSign } from '../client/art2/signfont.js';

// what the test lets by, each explained (none yet: what the lint found is fixed in the data)
export const LINT_ALLOW = {};
const DUP_R = 20 * TILE, DUP_B = 4.5 * TILE, FRONT_H = 64, START_R = 2.5 * TILE;   // (DUP_R: about a screen - two of one name in one glance)
const ROCKS = { seastack: (p) => p.r || 24, sealrock: () => 22, boulder: (p) => (p.s || 52) * 0.5, outcrop: (p) => Math.max(24, p.r || 0), redstack: (p) => p.r || 24, rstack: (p) => p.r || 24 };
const FLOATS = new Set(['swimbuoy', 'ringfloat', 'swimraft']);
const BOARDS = new Set(['textsign', 'picboard', 'billboard', 'motelsign']);
const up = (t) => String(t || '').toUpperCase().replace(/[/:]/g, '-').replace(/[^A-Z0-9 &'!$+.-]/g, ' ').replace(/\s+/g, ' ').trim();

// a text sign's board on screen (world px): as client/art2/game/statics.js makeSignBoard lays it out
function boardOf(p) {
  if (p.t === 'textsign') {
    const t = up(p.text).slice(0, 24), L0 = layoutSign(t, 200, { face: 'civic', lines: 1 }), L = layoutSign(t, L0.cw + (p.wood ? 6 : 4), { face: 'civic', lines: 1 });
    const hw = L.w, h = L.h * 2 + (p.wood ? 4 : 0), z = p.z || 40;
    return [p.x - hw, p.y - z - h, p.x + hw, p.y - z];
  }
  if (p.t === 'picboard') { const z = p.z || 40; return [p.x - 40, p.y - z - 70, p.x + 40, p.y - z]; }
  if (p.t === 'billboard') return [p.x - 70, p.y - 150, p.x + 70, p.y - 40];
  if (p.t === 'motelsign') { const z = p.z || 60; return [p.x - 34, p.y - z - 160, p.x + 34, p.y - z]; }
  return null;
}
const hit = (a, b, pad = 0) => a[0] < b[2] - pad && b[0] < a[2] - pad && a[1] < b[3] - pad && b[1] < a[3] - pad;

export function lint(M) {
  const rows = { boats: [], floats: [], signOverSign: [], signOverFront: [], dupName: [], inBuilding: [], wildNeon: [], startOnCraft: [] };
  const seen = { boats: 0, signs: 0, props: 0 };
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return M.inside(tx, ty) ? M.tiles[M.idx(tx, ty)] : -1; };
  const wet = (x, y) => { const t = tileAt(x, y); return t === T.WATER || t === T.DEEP; };
  const TN = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
  // the rocks, in a grid of 4-tile cells
  const rocks = new Map(), RC = 4 * TILE;
  M.props.forEach((p) => { if (!p || !ROCKS[p.t]) return; const r = ROCKS[p.t](p), k = `${Math.floor(p.x / RC)},${Math.floor(p.y / RC)}`; let l = rocks.get(k); if (!l) rocks.set(k, (l = [])); l.push({ x: p.x, y: p.y, r, t: p.t }); });
  const rockAt = (x, y, pad) => { const cx = Math.floor(x / RC), cy = Math.floor(y / RC); for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) for (const q of rocks.get(`${cx + i},${cy + j}`) || []) if (Math.hypot(q.x - x, q.y - y) < q.r + pad) return q; return null; };
  // a hull: points along it and across it, each on clear water and off the rocks
  const hull = (what, x, y, a, len, wid) => {
    seen.boats++;
    const ca = Math.cos(a), sa = Math.sin(a), bad = [];
    for (let s = -len / 2 + 10; s <= len / 2 - 10; s += 8) for (const w of [-wid / 2 + 10, 0, wid / 2 - 10]) {   // (a hull's very edge may touch a finger pier: alongside is moored)
      const px = x + ca * s - sa * w, py = y + sa * s + ca * w;
      if (!wet(px, py)) { bad.push(`on ${TN[tileAt(px, py)] || 'nothing'}`); break; }
      const r = rockAt(px, py, 2);
      if (r) { bad.push(`in a ${r.t}`); break; }
    }
    if (bad.length) rows.boats.push({ what, x, y, why: bad[0] });
  };
  for (const b of M.marina || []) { const V = VEHICLES[b.kind]; if (V) hull(`moored ${b.kind}`, b.x, b.y, b.a || 0, V.L, V.W); }
  for (const r of M.rentals || []) { const V = VEHICLES[(r.models || ['jetski'])[0]] || VEHICLES.jetski; for (const s of r.spots || []) hull(`${r.name}'s ${(r.models || ['craft'])[0]}`, s.x, s.y, s.a || 0, V.L, V.W); }
  M.props.forEach((p) => {
    if (!p) return;
    if (p.lift) return;   // (up on its stands in a boatyard: world3-harbor.js's dry stack)
    if (p.t === 'sailboat') hull('a moored sailboat', p.x, p.y, p.a || 0, p.len || 118, 40);
    else if (p.t === 'yacht') hull('a moored yacht', p.x, p.y, p.a || 0, 110, 40);
    else if (FLOATS.has(p.t)) { const r = rockAt(p.x, p.y, 4); if (!wet(p.x, p.y) || r) rows.floats.push({ what: `a ${p.t}`, x: p.x, y: p.y, why: r ? `in a ${r.t}` : `on ${TN[tileAt(p.x, p.y)]}` }); }
  });
  // the boards
  const boards = [];
  M.props.forEach((p, pi) => { if (p && BOARDS.has(p.t)) { const r = boardOf(p); if (r) boards.push({ p, pi, r }); } });
  seen.signs = boards.length;
  for (let i = 0; i < boards.length; i++) for (let j = i + 1; j < boards.length; j++) {
    const A = boards[i], B = boards[j];
    if (Math.abs(A.p.x - B.p.x) > 400 || Math.abs(A.p.y - B.p.y) > 400) continue;
    if (hit(A.r, B.r, 2)) rows.signOverSign.push({ what: `${A.p.t} "${A.p.text || A.p.pic || ''}" and ${B.p.t} "${B.p.text || B.p.pic || ''}"`, x: A.p.x, y: A.p.y });
  }
  // the buildings near each board: a front under it; a building saying the same name
  const bgrid = new Map(), BC = 16 * TILE;
  M.buildings.forEach((b) => { if (!b || b.tw === undefined) return; for (let cy = Math.floor(b.ty * TILE / BC); cy <= Math.floor((b.ty + b.th) * TILE / BC); cy++) for (let cx = Math.floor(b.tx * TILE / BC); cx <= Math.floor((b.tx + b.tw) * TILE / BC); cx++) { const k = `${cx},${cy}`; let l = bgrid.get(k); if (!l) bgrid.set(k, (l = [])); l.push(b); } });
  const bNear = (x, y, r) => { const out = new Set(); for (let cy = Math.floor((y - r) / BC); cy <= Math.floor((y + r) / BC); cy++) for (let cx = Math.floor((x - r) / BC); cx <= Math.floor((x + r) / BC); cx++) for (const b of bgrid.get(`${cx},${cy}`) || []) out.add(b); return [...out]; };
  // (what a building's front says: its signs' words - the shop's board, the name signs on its face)
  const says = (b) => new Set([...(b.signs || []).map((q) => up(q.text)), ...(b.art && b.art.shop && b.art.shop.sign && b.art.shop.sign.text ? [up(b.art.shop.sign.text)] : [])]);
  for (const { p, r } of boards) {
    if (p.t !== 'textsign') continue;   // (a motel's pole sign, a picture board: tall, in front by design)
    for (const b of bNear(p.x, p.y, 200)) {
      const x0 = b.tx * TILE, x1 = (b.tx + b.tw) * TILE, yg = (b.ty + b.th) * TILE;
      if (p.y < yg + 2) continue;   // (a board behind or on the building: visaudit's)
      if (hit(r, [x0 + 6, yg - FRONT_H, x1 - 6, yg - 4])) rows.signOverFront.push({ what: `${p.t} "${p.text || p.pic || ''}" over ${b.name || b.kind || 'a building'}'s front`, x: p.x, y: p.y });
    }
  }
  const named = boards.filter((q) => q.p.t === 'textsign' && up(q.p.text).length >= 6 && !/\d/.test(q.p.text));
  for (let i = 0; i < named.length; i++) {
    const A = named[i], ta = up(A.p.text);
    for (let j = i + 1; j < named.length; j++) { const B = named[j]; if (up(B.p.text) === ta && Math.hypot(A.p.x - B.p.x, A.p.y - B.p.y) < DUP_R) rows.dupName.push({ what: `two "${ta}" boards`, x: A.p.x, y: A.p.y, why: `${Math.round(B.p.x / TILE)}, ${Math.round(B.p.y / TILE)}` }); }
    for (const b of bNear(A.p.x, A.p.y, DUP_B + 16 * TILE)) if (says(b).has(ta)) { const dx = Math.max(b.tx * TILE - A.p.x, 0, A.p.x - (b.tx + b.tw) * TILE), dy = Math.max(b.ty * TILE - A.p.y, 0, A.p.y - (b.ty + b.th) * TILE); if (Math.hypot(dx, dy) > DUP_B) continue; rows.dupName.push({ what: `a "${ta}" board by ${b.name}, whose front says it`, x: A.p.x, y: A.p.y, why: `${(Math.hypot(dx, dy) / TILE).toFixed(1)} tiles off it` }); break; }
  }
  // props inside a building's walls: what grows (never on a roof), a plaza's furniture inside a city block
  M.props.forEach((p) => {
    if (!p) return;
    seen.props++;
    const plant = TIDY3.PLANT.test(p.t);
    if (!plant && !TIDY3.STREET.test(p.t)) return;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (!M.inside(tx, ty)) return;
    const b = M.buildings[M.bld[M.idx(tx, ty)]];
    if (!b || !(plant || (b.kind === 'roof' && !b.hand))) return;
    // (a step in: the building's edge row is its wall line - something set against it is fine)
    if (tx <= b.tx || tx >= b.tx + b.tw - 1 || ty <= b.ty || ty >= b.ty + b.th - 1) return;
    rows.inBuilding.push({ what: `a ${p.t} inside ${b.name || b.kind || 'a building'}`, x: p.x, y: p.y });
  });
  // a lit board in the wilds
  for (const { p } of boards) {
    if (p.t !== 'textsign' || p.wood || p.lit) continue;   // (p.lit: a board chosen lit - the water park's)
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (!M.inside(tx, ty)) continue;
    if (wildAt(M, p.x, p.y)) rows.wildNeon.push({ what: `a lit "${p.text}"`, x: p.x, y: p.y, why: 'a wild district' });
  }
  // a race's start over a craft
  const crafts = [...(M.marina || []), ...(M.rentals || []).flatMap((r) => r.spots || [])];
  for (const race of M.races || []) for (const c of crafts) if (Math.hypot(c.x - race.start.x, c.y - race.start.y) < START_R) { rows.startOnCraft.push({ what: `${race.name}'s start`, x: race.start.x, y: race.start.y }); break; }
  return { rows, seen };
}

// Where something a scene puts down stands (test/world3scenes.test.js: the cinematic mode's staged scenes and the scene
// director's casts on World v3): null when it's on the right ground, else why not.
//   want 'water'  a boat: every point of its hull on open water
//   want 'road'   a road vehicle on the street: on a road tile, within its road's width
//   want 'pad'    an aircraft: on a helipad on the ground (within its round), or up in the air
//   want 'strip'  a plane: on a runway or an airstrip, or up in the air
//   want 'ground' anything else on land: open ground - not in a building's walls, not in the water
// spotWhy(M, { x, y, a, alt }, def, want, airfields?) - airfields: shared/flight.js airfields(M), for 'pad' and 'strip'
export function spotWhy(M, e, def, want, af = null) {
  const TN = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return M.inside(tx, ty) ? M.tiles[M.idx(tx, ty)] : -1; };
  const t = tileAt(e.x, e.y), name = TN[t] || 'nothing';
  if ((e.alt || 0) > 8 && def && def.kind === 'air') return null;   // (already up, flying: an autoplay's aircraft)
  if (want === 'water') {
    const ca = Math.cos(e.a || 0), sa = Math.sin(e.a || 0);
    for (let s = -def.L / 2 + 6; s <= def.L / 2 - 6; s += 8) for (const w of [-def.W / 2 + 4, 0, def.W / 2 - 4]) { const q = tileAt(e.x + ca * s - sa * w, e.y + sa * s + ca * w); if (q !== T.WATER && q !== T.DEEP) return `its hull on ${TN[q] || 'nothing'}`; }
    return null;
  }
  if (want === 'road') {
    if (t !== T.ROAD && t !== T.BRIDGE) return `on ${name}, not the road`;
    return null;
  }
  if (want === 'pad') {
    const pads = (af && af.pads) || [];
    return pads.some((q) => !q.roof && Math.hypot(q.x - e.x, q.y - e.y) <= 72) ? null : `not on a helipad (on ${name})`;
  }
  if (want === 'strip') {
    const S = (af && af.strips) || [];
    return S.some((s) => e.x >= s.x && e.x <= s.x + s.w && e.y >= s.y && e.y <= s.y + s.h) ? null : `not on a runway (on ${name})`;
  }
  if (t === T.WATER || t === T.DEEP) return 'in the water';
  if (t === T.WALL || t === T.BUILDING || t === T.COUNTER || t < 0) return `in ${name}`;
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { buildWorld3 } = await import('../server/world3.js');
  const { map } = await buildWorld3(1337, { log: () => {} });
  const L = lint(map);
  for (const [k, l] of Object.entries(L.rows)) { console.log(`${k}: ${l.length}`); for (const r of l) console.log(`  ${r.what} at ${Math.round(r.x / TILE)}, ${Math.round(r.y / TILE)}${r.why ? ` (${r.why})` : ''}`); }
  console.log(JSON.stringify(L.seen));
}
