// The placement lint (test/placementlint.test.js; the owner, 2026-11-13: "catch some of these kinds of errors since we're
// seeing a fair amount of signs being partially covered or some visual issues like boats parked in rocks"). On a built
// map (World v3 as the server builds it), what's placed against what's round it - on the map's own data, no bake:
//   boats        a moored boat (m.marina), a hire craft's spot (m.rentals), a moored yacht or sailboat (props): its hull on
//                clear water - every point of it on WATER / DEEP, none on a rock's round (a sea stack, a seal rock, a
//                boulder, an outcrop); a rowboat or a canoe prop not up on a dock's planks or in a building
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
//   beachWater   dry ground (sand, grass, dirt) with no water by it beside planks the art takes for standing in water
//                (a DOCK that isn't shared/mapcore.js deckOnDry): the coastline's smoothing drew a
//                thin band of sea with waves along the pier or the boardwalk over the beach (the owner, 11-14: Sunset
//                Beach Pier, Sandpiper Bay's boardwalk)
//   skateWalk    a skate park's ledge, grind box, flat bar, rail or bench with nothing solid along it: walked straight
//                through on foot (the owner, 11-14 - shared/world3-skatesolids.js)
//   parked      a parking space (m.parking - not a home's driveway - and the car lots' spaces, m.dealerLots) whose car would
//                stand on a pavement, a promenade or a plaza, a lawn, the sand, a pier or a building (shared/parkcheck.js;
//                the owner, 2026-11-14: "parked vehicles must never sit on a promenade or a sidewalk"). The parked cars
//                leave such a space empty (server traffic.js badBay); the lint keeps the list so the data gets fixed
//   bigCanopy   a canopy over a building's door wider than CANOPY_MAX[0] or deeper than CANOPY_MAX[1] (a porte-cochere, a
//                hotel's or a hospital's canopy: the owner, 2026-11-14 - "these overhangs over building entrances ... just
//                block the entrance and take away too much from the front of buildings"); a filling station's over its
//                pumps is the station's own
//   alleyBlocked an opened-up block's alley, lane or passage (shared/world3-openblocks.js m.openAlleys) with no way
//                through on foot: somewhere along it, less than ALLEY_GAP px left clear between the solid props and walls
//   nameCovered  a building's own name on its front - a plaque, its shop sign, a blade sign - half hidden: under another
//                board on the same front (the owner, 11-14: Westside Clinic's name behind its EMERGENCY sign), or behind
//                something standing in front of it (a canopy, a shelter, a sign on posts: its drawn pixels over the board)
//   nameTwice    a building's name said twice on its fronts: two of its boards - its shop's sign, the portico's lettering,
//                a plaque, a neon name - saying the same name, on one front or on two sections of it (the owner, 11-15:
//                Canvas Savings Bank's portico CANVAS SAVINGS with a CANVAS SAVINGS BANK board under it). One name, one
//                board: statics.js oneName keeps the first
//   textClipped  a sign's words not whole on its front as the bake draws it at night: run off the facade's edge, painted
//                over by something drawn after it, or a glow showing through stone lettering (the owner, 11-15: First
//                Pixel Bank's portico BANK read BAN, then ANK - a lit window behind it). A sign whose words don't fit isn't
//                drawn at all (buildings.js portico; statics.js oneName: a portico off its front's edge loses its words)
//   bladeBiz     a blade sign naming another business than the building's (the owner, 11-14: HOTEL over a paint shop):
//                its words from the shop's sign, the building's names, or the trade of its places (BLADE_WORDS)
//   plantOnPath  a plant (a yard's bed, the ground cover, a map prop) over a house's path or driveway - the paved strip
//                across its lawn - or its door step (the owner, 11-14: shrubs and tall grass over a front path)
//   atmStray     an ATM not set into a building's wall nor inside one (the owner, 11-14: "never standing alone
//                mid-sidewalk")
//   festoons     a run of hanging lights (bistro bulbs, paper lanterns) with an end made fast to nothing, a post in the
//                road, a bracket with no wall, too straight or too slack, low over people's heads or one long span (the
//                owner, 11-16: "okay when they had something to hang from ... some slack": shared/festoon.js)
//   signCovered something over a front's sign - its name board's words or the OPEN in its window: a cash machine set in
//                the wall, a prop standing in front, a place's badge floating over it (the owner, 11-16: Egret Point Fish
//                Market's OPEN behind its ATM, its first letter under the machine's cap)
//   doorOnGrass  a business's or a home's door with no path to it: its step not on a pavement, a plaza, a lot, a dock,
//                a gravel or dirt track or the road, or that path not reaching a road (the owner, 11-16: "they just sit on
//                grass" - lists them all)
//   wallOnly     a business you'd walk into (a walk-in kind - shared/map.js WALK_IN - a charter office, a hand plan's
//                walk-in shop) used only at its wall: no room inside behind the door (the owner, 11-16: "they just have you
//                interact at the wall")
// spotWhy(M, e, def, want) is the same look for something put down while the game runs (a scene's vehicles and people)
// lint(M) -> { rows: { kind: [{ what, x, y, why }] }, seen: { boats, signs, props } }
//   node tools/placementlint.mjs   builds World v3 and prints the rows (the heavy lock)
import { doorSteps, doorBox, blockersOf, doorPoi, DOOR_EXTRA } from '../shared/world3-doorsteps.js';
import { sliverAt } from '../shared/world3-deckroots.js';
import { TILE, T } from '../shared/constants.js';
import { wildAt, TIDY3, homePaths3 } from '../shared/world3-tidy.js';
import { VEHICLES } from '../shared/vehicles.js';
import { layoutSign } from '../client/art2/signfont.js';
import { deckOnDry } from '../shared/mapcore.js';
import { parkWhy, parkExempt } from '../shared/parkcheck.js';
import { festoonWorld, festoonWhy } from '../shared/world3-festoons.js';
import { staticIndex, staticItems, makeStatic, STATIC_CHUNK, frontNames, sameName, floraHalf } from '../client/art2/game/statics.js';
import { makeBuilding, buildingH, plaqueBox, bladeBox } from '../client/art2/buildings.js';
import { textAudit } from './textaudit.mjs';
import { WALK_IN } from '../shared/map.js';
import { auditRows } from './audit/worldrows.mjs';
import { badgeOf } from '../client/art2/game/host.js';

// what the test lets by, each explained (else what the lint found is fixed in the data)
// how many world px of a sprite G (its top left at ox, oy in the world) lie in the box X0, Y0 .. X1, Y1. A sprite made at the
// art pixel (G.ap2 = 2: the nature kit's plants and rocks, 11-21) covers 2 x 2 world px with each of its own.
const pxOver = (G, ox, oy, X0, Y0, X1, Y1) => {
  const ap = G.ap2 || 1;
  let n = 0;
  for (let y = Math.max(0, Math.ceil((Y0 - oy) / ap)); y < Math.min(G.h, Math.floor((Y1 - oy) / ap)); y++) for (let x = Math.max(0, Math.ceil((X0 - ox) / ap)); x < Math.min(G.w, Math.floor((X1 - ox) / ap)); x++) if (G.col[(y * G.w + x) * 4 + 3] > 128) n += ap * ap;
  return n;
};
export const LINT_ALLOW = {
  // four lake jetties whose roots sit on the bank a tile back from the water (a kink in the planks at the shoreline):
  // what shows there is the lake's own shore rounding off by the jetty, not a band along planks over a beach
  beachWater: 0,   // (11-22: the roots planked over - shared/world3-deckroots.js)
  // the spaces laid over a pavement or a plaza when this check came in (2026-11-14): a few districts' kerb bays and car
  // parks drawn a tile off (Pine Hills' street, the airport motel's, the trades row's). (A golf cart's stand on its cart
  // path is its place: not counted.) Left empty at run time (traffic.js badBay); fix them in the data and bring this down - never up.
  parked: 0,                // (11-22: taken off the list at the build - parkcheck.js badBays3)
  // the ATMs with no front wall in reach - the kiosks of the districts that are all houses or open ground (West Hills'
  // and Pine Hills' streets of houses, Gull Harbor's and Egret Point's greens, the beaches, a park), left at the back of
  // the pavement as their district's cash of its own, or where a move would leave a street out of the cash's reach
  // (shared/world3-shops.js seatAtms3; world3server.test.js): a shop front there takes one in - bring this down, never up
  atmStray: 52,
  // (11-22, the world batch: shared/world3-walks.js takes up any plant whose crown stands over a house's path - egret's two
  // included)
  plantOnPath: 0,
  // (11-16: the cash machine is lower now - props-kit.js atmWall - and the self storage's board clear of it)
  nameCovered: 0,
  // (the rows that came in 11-16 - the owner's Egret Point shots - each at what's left after the class fixes: bring them
  // down, never up)
  // the street's furniture standing in front of a shop's words - an el's piers, a shelter's or a stall's canopy, a phone
  // booth, a porch's posts, a lamp, a flag or power pole, a run of lights (shared/festoon.js's lint is its own) - and the
  // badge of a place at a wall over its window's OPEN
  signCovered: 158,   // (11-22: egret's 159, one fewer with the walkways cleared)
  // the doors with no path in reach that a straight one couldn't be laid to (shared/world3-doorpaths.js: something solid,
  // water, a field, a building or more than PATH_MAX tiles of lawn in the way; a courtyard's plaza closed in) - homes for
  // the most part (West Hills', Southside's, Old Town's lots)
  doorOnGrass: 89,
  // something solid on a door's step or the tile out past it (the owner, 11-23: the market hall's door behind a planter;
  // 60 at the check): shared/world3-doorsteps.js slides it along the wall or takes it up. Left: a hand plan's own solids
  // (Midtown's apartment row on the el, Midnight Pho, Westport PD) and the traffic signal poles at a corner door
  doorBlocked: 10,
  // the places you'd walk into still served at the wall: a building too shallow for a room (Pelican Key Charters, a few
  // of World v3's added shop rows), a row shared with a place that isn't a shop (Egret Marsh Outfitters' and the Marsh
  // Bait & Tackle's), a lot building with a home or a bay behind the same front, the hand-built Greenfield Park shops
  wallOnly: 10,   // (11-22 night: a walk-in may share its row with a counter at the wall - map.js WALL_POIS; 11-23: Greenfield Park's two shops)
  // (the owner's 11-17 notes, tools/audit/worldrows.mjs - what each row means is there)
  plantOnWalk: 0,           // trees (not a street tree in its grate, nor a boulevard median's), shrubs, bushes, hedges on a sidewalk, road, lot (a plaza outside the paved districts) - 2,914 at the audit; 0 since shared/world3-walks.js (11-22)
  planterOnWalk: 0,         // planters and pots on a sidewalk, a road or a lot, not set against a wall - 422 at the audit; 0 since 11-22
  northDoor: 19,            // (21 at the audit; 19 with egret, 11-22) a business's entrance on its north wall
  interiorOverlap: 24,      // a walk-in's room under another building's footprint or its drawn front (11-23: Old Downtown's fronts before the casinos drawn low - world3-tidy.js lowBeforeCasinos3)
  frontNames: 0,            // a shop's sign naming none of its places, or another trade (11-22: renamed at the build - world3-signfix.js)
  lobbyDoor: 161,           // an apartment's lobby door at a shop front
  rampCrossesRoad: 9,       // a ramp below deck height over a street that isn't its junction
  railOverWater: 0,       // a railing or fence run out over open water (11-22: moved back onto the shore or cut back - world3-railtrim.js; the rule: water under it and either side)
  dockOverlap: 5,           // boardwalks or piers over each other (the Egret Marsh boardwalk's bends)
  railOverWaterArt: 18,     // a railway span over water without real bridge art (piers, abutments)
  portalOnFlat: 0,        // a tunnel mouth with no hill over the bore (11-22: the arrival bores got their hill in the relief - world3-arrivals.js moundOf)
  festoonDensity: 0,        // more than FESTOON_CAP runs of lights within FESTOON_R (11-22: thinned at the build - world3-festoons.js festoonThin3)
  cropInTown: 0,            // a crop field, strip or orchard in a town or by a beach (11-22: the farms back from the beach, the scraps cleared - world3-croptidy.js)
  heliOffPad: 1,           // a hospital with no ground helipad, a helipad on a sidewalk or a road (11-22: the yard pads off the pavement, looked for further out - shared/flight.js PAD_YARD; left: one with no open ground near)
  deadBoat: 3,              // a boat prop you can reach that isn't a vehicle and isn't stored (11-22: every one a real boat - world3-boats.js; left: 3 with no water near)
  bigEmptyPlaza: 0,       // an empty stretch of paving 19+ tiles across (11-22: islands laid - shared/world3-plazafill.js)
  binBags: 0,               // bin bags away from any bin outside the rough districts (cleared by the build: world3-tidy.js strayBags3)
};
export const CANOPY_MAX = [4 * TILE, 2 * TILE], ALLEY_GAP = 26;
const CANOPIES = new Set(['porte', 'canopy', 'pergola']);
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
  const rows = { doorBlocked: [], boats: [], floats: [], signOverSign: [], signOverFront: [], dupName: [], inBuilding: [], wildNeon: [], startOnCraft: [], beachWater: [], skateWalk: [], parked: [], nameCovered: [], nameTwice: [], textClipped: [], bladeBiz: [], plantOnPath: [], atmStray: [], bigCanopy: [], alleyBlocked: [], festoons: [], signCovered: [], doorOnGrass: [], wallOnly: [] };
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
    if (p.t === 'rowboat' || p.t === 'canoe') {   // (drawn up on a beach or a bank is fine - not up on the planks or in a building)
      seen.boats++;
      const L = 64, ca = Math.cos(p.a || 0), sa = Math.sin(p.a || 0);
      for (let s2 = -L / 2 + 10; s2 <= L / 2 - 10; s2 += 8) { const t = tileAt(p.x + ca * s2, p.y + sa * s2); if (t === T.DOCK || t === T.BRIDGE || t === T.BUILDING) { rows.boats.push({ what: `a ${p.t} on the ${TN[t]}`, x: p.x, y: p.y }); break; } }
      return;
    }
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
  // planks the art takes for standing in water, beside dry ground with no water by it (a sliver of sea along them)
  {
    // (shared/world3-deckroots.js sliverAt: the rule the build lays planks over the dry tile by)
    for (const old of [true, false]) {
      const seenAt = new Set();
      for (let ty = M.y0 + 1; ty < M.y0 + M.h - 1; ty++) for (let tx = M.x0 + 1; tx < M.x0 + M.w - 1; tx++) {
        const t = M.tiles[M.idx(tx, ty)];
        if (t !== T.DOCK) continue;
        if (!old) seen.decks = (seen.decks || 0) + 1;
        const d = sliverAt(M, tx, ty, old);
        if (!d) continue;
        const key = `${tx >> 3},${ty >> 3}`;   // (one row a stretch of 8 tiles)
        if (seenAt.has(key)) continue;
        seenAt.add(key);
        if (old) seen.beachWaterOld = (seen.beachWaterOld || 0) + 1;
        else rows.beachWater.push({ what: `a ${TN[t]} tile taken for water beside dry ${TN[M.tiles[M.idx(d[0], d[1])]]}`, x: tx * TILE + 16, y: ty * TILE + 16 });
      }
    }
  }
  // a skate park's grind kit solid on foot
  {
    const KIT = new Set(['ledge', 'flatbar', 'bench_a', 'bench_b', 'bench_m', 'pbench', 'planter_fl', 'planter_g']);
    const solidBy = (x, y, r) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const arr = M.inside(tx + i, ty + j) && M.solidProps.get(M.idx(tx + i, ty + j)); if (arr) for (const e of arr) if (!e.off && Math.hypot(e.x - x, e.y - y) <= r + e.r) return true; } return false; };
    for (const q of M.skateSpots || []) {
      const X0 = q.x * TILE, Y0 = q.y * TILE, X1 = (q.x + q.w) * TILE, Y1 = (q.y + q.h) * TILE;
      for (const p of M.props) {
        if (!p || !KIT.has(p.t) || p.x < X0 || p.x > X1 || p.y < Y0 || p.y > Y1) continue;
        seen.skateKit = (seen.skateKit || 0) + 1;
        if (!solidBy(p.x, p.y, 4)) rows.skateWalk.push({ what: `${q.name}'s ${p.t}`, x: p.x, y: p.y, why: 'nothing solid along it' });
      }
    }
  }
  // the parking spaces: their car off the pavements, the promenades, the lawns
  const space = (what, sp, model) => { const V = VEHICLES[model] || VEHICLES.sedan, why = parkWhy(M, sp.x, sp.y, sp.a || 0, V.L, V.W); seen.spaces = (seen.spaces || 0) + 1; if (why) rows.parked.push({ what, x: sp.x, y: sp.y, why }); };
  for (const sp of M.parking || []) if (!parkExempt(sp)) space(`a parked ${sp.model || 'car'}${sp.kerb ? ' (kerb bay)' : ''}`, sp, sp.model);
  for (const L of M.dealerLots || []) for (const sp of L.slots || []) space('a car on a lot', sp, 'sedan');
  // the canopies over the doors: none over CANOPY_MAX (a filling station's over its pumps is its own)
  {
    const doors = [];
    for (const b of M.buildings) if (b && !b.gone && b.door) doors.push([(b.door.tx + 0.5) * TILE, (b.door.ty + 0.5) * TILE]);
    for (const p of M.pois) if (p && p.b !== undefined && Number.isFinite(p.x)) doors.push([p.x, p.y]);
    const pumps = [...(M.sitePumps || []), ...(M.pumps || [])];
    for (const p of M.props) {
      if (!p || !CANOPIES.has(p.t)) continue;
      seen.canopies = (seen.canopies || 0) + 1;
      const w = p.w || (p.t === 'porte' ? 300 : 150), d = p.d || (p.t === 'porte' ? 96 : 80);
      if (w <= CANOPY_MAX[0] + 8 && d <= CANOPY_MAX[1] + 8) continue;
      const x0 = p.x - w / 2, x1 = p.x + w / 2, y0 = p.y - d / 2, y1 = p.y + d / 2;
      if (pumps.some((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1)) continue;
      const door = doors.find(([x, y]) => x >= x0 - TILE && x <= x1 + TILE && y >= y0 - 1.5 * TILE && y <= y1 + 1.5 * TILE);
      if (door) rows.bigCanopy.push({ what: `a ${p.t} ${Math.round(w / TILE)} x ${Math.round(d / TILE)} tiles`, x: p.x, y: p.y, why: 'over a door' });
    }
  }
  // the opened-up blocks' alleys: a way through on foot all along each (ALLEY_GAP px clear across it everywhere)
  for (const a of M.openAlleys || []) {
    seen.alleys = (seen.alleys || 0) + 1;
    const ns = !!a.ns, len = (ns ? a.h : a.w) * TILE, A0 = (ns ? a.x : a.y) * TILE, A1 = A0 + (ns ? a.w : a.h) * TILE;
    let bad = null;
    for (let s = 4; s < len - 4 && !bad; s += 8) {
      const along = (ns ? a.y : a.x) * TILE + s, cuts = [];
      for (let c = Math.floor(A0 / TILE) - 1; c <= Math.floor(A1 / TILE); c++) {
        const tx = ns ? c : Math.floor(along / TILE), ty = ns ? Math.floor(along / TILE) : c;
        if (!M.inside(tx, ty)) continue;
        for (const e of M.solidProps.get(M.idx(tx, ty)) || []) {
          const da = Math.abs((ns ? e.y : e.x) - along);
          if (da >= e.r) continue;
          const half = Math.sqrt(e.r * e.r - da * da), cx = ns ? e.x : e.y;
          cuts.push([cx - half, cx + half]);
        }
      }
      cuts.sort((p, q) => p[0] - q[0]);
      let at = A0, best = 0;
      for (const [c0, c1] of cuts) { if (c0 > at) best = Math.max(best, Math.min(c0, A1) - at); at = Math.max(at, c1); }
      best = Math.max(best, A1 - at);
      if (best < ALLEY_GAP) bad = { x: ns ? (A0 + A1) / 2 : along, y: ns ? along : (A0 + A1) / 2, gap: Math.round(best) };
    }
    if (bad) rows.alleyBlocked.push({ what: `an opened-up block's ${ns ? 'alley' : 'lane'} (${a.w} x ${a.h})`, x: bad.x, y: bad.y, why: `${bad.gap} px clear` });
  }
  artRows(M, rows, seen);
  atmRows(M, rows, seen);
  doorRows(M, rows, seen);
  // doorBlocked: every door's step and the tile past it clear (the build's own answer: shared/world3-doorsteps.js)
  for (const d of doorSteps(M, doorPoi(WALK_IN))) { const e = blockersOf(M, doorBox(d))[0]; if (e) { const pr = e.pi >= 0 ? M.props[e.pi] : null; rows.doorBlocked.push({ what: `${d.p.label || d.b.name || d.p.kind}'s door (${d.p.kind})`, x: (d.steps[0][0] + 0.5) * TILE, y: (d.steps[0][1] + 0.5) * TILE, why: `${pr ? pr.t : 'a solid'} on its step` }); } }
  auditRows(M, rows, seen);   // (the whole-game audit's rows, 11-19: tools/audit/worldrows.mjs)
  // the hanging lights: each run made fast at both ends, slack, over people's heads (shared/festoon.js)
  const FW = festoonWorld(M);
  seen.festoons = 0;
  for (const f of M.props) {
    if (!f || f.t !== 'festoon') continue;
    seen.festoons++;
    const why = festoonWhy(FW, f);
    if (why) rows.festoons.push({ what: `${f.k === 'lantern' ? 'lanterns' : f.k === 'cable' ? 'a cable' : 'lights'} strung ${Math.round(Math.hypot(f.tx || 0, f.ty || 0) / TILE)} tiles`, x: f.x, y: f.y, why });
  }
  return { rows, seen };
}

// ---- what the bake draws: the fronts' boards, the plants by a house's path (client/art2/game/statics.js' index) -------
// the words a blade may say by the trade of a place in the building (its POIs' kinds, its shop's kind; with no place of
// its own, the building's kind)
export const BLADE_WORDS = {
  hotel: 'HOTEL INN MOTEL', casino: 'CASINO', bar: 'BAR PUB LIVE JAZZ LOUNGE CLUB DANCE OPEN GIRLS POOL SALOON', club: 'CLUB DANCE LIVE OPEN BAR LOUNGE',
  arcade: 'ARCADE GAMES PLAY OPEN', diner: 'EAT DINER CAFE DELI FOOD NOODLES OYSTERS OPEN', cafe: 'CAFE COFFEE EAT', coffee: 'CAFE COFFEE EAT DINER DELI FOOD NOODLES OYSTERS OPEN',
  mart: 'DELI SHOP OPEN MART LIQUOR BEER WINE', convenience: 'DELI SHOP OPEN MART', liquor: 'LIQUOR BEER WINE OPEN DELI', gallery: 'ART PRINTS POTTERY', clothes: 'VINTAGE TAILOR SKATE SHOP',
  clothing: 'VINTAGE TAILOR SKATE SHOP', salon: 'HAIR', barber: 'HAIR', laundry: 'WASH', books: 'BOOKS', florist: 'FLOWERS', pawn: 'PAWN ANTIQUES', theatre: 'CINEMA THEATER SHOWS',
  cinema: 'CINEMA THEATER SHOWS', grandstand: 'GO', fishmarket: 'FISH', market: 'FISH', fence: 'CLUB', sports: 'SHOP',
};
const NOT_PLACES = new Set(['home', 'atm', 'vending', 'reception', 'evidence', 'delivery']);
const BADGELESS = new Set(['home', 'atm', 'station', 'ride', 'race', 'farm', 'sar', 'vending', 'reception', 'evidence', 'delivery']);   // (host.js SHOP_SKIP, and what has no badge)
function artRows(M, rows, seen) {
  const I = staticIndex(M);
  const hit2 = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const words = (t) => up(t).split(/[ &]+/).filter(Boolean);
  const placesOf = new Map();
  for (const p of M.pois) if (p && p.b !== undefined && p.b !== null) { let l = placesOf.get(p.b); if (!l) placesOf.set(p.b, (l = [])); l.push(p); }
  // the fronts: each building section's boards, in world px; their own overlaps; the blades' words
  const faces = [];
  seen.fronts = 0;
  for (const [bi, items] of I.byB) {
    const b = M.buildings[bi];
    const named = [];   // (the names its fronts' boards say, each with its section: nameTwice)
    for (const it of items) {
      const sp = it.recipe && it.recipe.t === 'b' && it.recipe.spec;
      if (!sp || !sp.w) continue;
      for (const q of frontNames(sp)) {
        const twin = named.find((o) => sameName(o.t, q.t) && (o.it === it || Math.abs(o.it.y - it.y) < 8));   // (one front: the same section, or another along the same face)
        if (twin) rows.nameTwice.push({ what: `${b.name || b.kind}: its ${twin.k} "${twin.t}" and its ${q.k} "${q.t}"`, x: it.x + sp.w / 2, y: it.y });
        else named.push({ ...q, it });
      }
      if ((sp.portico && sp.portico.text) || (sp.plaques && sp.plaques.length) || (sp.shop && sp.shop.sign && sp.shop.sign.text)) {
        seen.texts = (seen.texts || 0) + 1;
        for (const q of textAudit({ ...sp, night: 1 })) rows.textClipped.push({ what: `${b.name || b.kind}'s ${q.k} "${q.t}"`, x: it.x + sp.w / 2, y: it.y, why: q.why });
      }
      const H = buildingH(sp), bx = [], at = (r) => [it.x + r[0], it.y - r[3], it.x + r[2], it.y - r[1]];
      for (const p of sp.plaques || []) if (p && p.text && p.v !== undefined) bx.push({ t: p.text, r: at(plaqueBox(p, sp.w)) });
      for (const q of sp.blades || []) { const r = bladeBox(q, H); if (r) bx.push({ t: q.text, r: at(r), blade: true }); }
      const sgn = sp.shop && sp.shop.sign && sp.shop.sign.text && !sp.shop.sign.moved ? sp.shop.sign : null;   // (a sign moved up onto what stands in front - a false front, a porte-cochere: statics.js)
      if (!bx.length && !sgn && !(sp.shop && sp.shop.openSign)) continue;
      seen.fronts++;
      for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) if (hit2(bx[i].r, bx[j].r)) rows.nameCovered.push({ what: `"${bx[i].t}" and "${bx[j].t}" over each other on ${b.name || b.kind || 'a front'}`, x: it.x + sp.w / 2, y: it.y });
      faces.push({ it, b, bi, sp, bx, sgn });
      // a blade's words: the shop's sign, the building's names, the trade of its places
      const bl = bx.filter((q) => q.blade);
      if (!bl.length) continue;
      const ok = new Set([...words(sp.shop && sp.shop.sign && sp.shop.sign.text), ...words(b.name), ...(b.signs || []).flatMap((q) => words(q.text)), ...(sp.plaques || []).flatMap((q) => words(q.text))]);
      const pl = (placesOf.get(bi) || []).filter((p) => !NOT_PLACES.has(p.kind) || p.casino);
      const kinds = pl.length ? pl.map((p) => (p.casino ? 'casino' : p.kind)) : [b.kind];
      if (sp.shop && sp.shop.kind) kinds.push(sp.shop.kind);
      for (const k of kinds) for (const w of words(BLADE_WORDS[k] || '')) ok.add(w);
      for (const q of bl) if (words(q.t).some((w) => !ok.has(w))) rows.bladeBiz.push({ what: `a ${q.t} blade on ${b.name || b.kind} (${kinds.join(', ')}${sp.shop && sp.shop.sign ? `: ${sp.shop.sign.text}` : ''})`, x: q.r[0], y: it.y });
    }
  }
  // the things standing in front of a front: their drawn pixels over its boards (the shop's sign found by drawing the front)
  const SKIP = new Set(['b', 'f', 'flat']), THIN = new Set(['wire']);   // (an overhead wire across a sign: a line, not a cover)
  const sprites = new Map(), spr = (it) => { let G = sprites.get(it.key); if (G === undefined) { try { G = makeStatic(it.recipe); } catch { G = null; } sprites.set(it.key, G); } return G; };
  // a front's sign as drawn (makeBuilding: the board, a frame's width in - its words' panel - and the window's OPEN), world px
  const coversOf = (f) => {
    if (f.covers) return f.covers;
    const { it, sp } = f, out = [];
    if (sp.shop && ((sp.shop.sign && sp.shop.sign.text) || sp.shop.openSign)) {
      let G = null;
      try { G = makeBuilding(sp); } catch { G = null; }
      const at = (q, k) => [it.x - G.ax + q.x + k, it.y - G.ay + q.y + k, it.x - G.ax + q.x + q.w - k, it.y - G.ay + q.y + q.h - k];
      if (G && G.signBox && sp.shop.sign) {
        // (the words: as paintBoard centres them, after the trade's icon - not the board's empty ends)
        const B = G.signBox, L = B.lay, ix = L && L.icon ? 2 + 9 + 2 : 2, lx = L ? ix + Math.floor((L.w - 2 - ix - L.cw) / 2) : 1;
        const words = L ? { x: B.x + lx * 2, y: B.y, w: L.cw * 2, h: B.h } : B;
        out.push({ k: 'sign', t: sp.shop.sign.text, r: at(words, 2) });
      }
      if (G && G.openBox) out.push({ k: 'window sign', t: 'OPEN', r: at(G.openBox, 0) });
    }
    return (f.covers = out);
  };
  // the places' badges floating by the doors (client/art2/game/host.js shopMarks: a walk-in's under its door's lintel, any
  // other's 64 px over where you stand at it) over a front's sign
  {
    const doorOf = new Map();
    for (const id of M.walkIns || []) { const b = M.buildings[id]; for (const u of (b && b.walkIn && b.walkIn.units) || []) doorOf.set(u.poi, [(u.door.tx + u.door.w / 2) * TILE, (u.door.ty + 0.5) * TILE]); }
    for (const f of faces) {
      const pl = (placesOf.get(f.bi) || []).filter((p) => !BADGELESS.has(p.kind));
      if (!pl.length) continue;
      const cov = coversOf(f);
      for (const p of pl) {
        const d = doorOf.get(p.id), B = badgeOf(M, p, d ? { x: d[0], y: d[1] } : null), h = B.size / 2;
        const r = [B.x - h, B.y - h - 2, B.x + h, B.y + h + 2];   // (and its bob)
        for (const q of cov) if (hit2(q.r, r) && Math.min(r[2], q.r[2]) - Math.max(r[0], q.r[0]) >= 3 && Math.min(r[3], q.r[3]) - Math.max(r[1], q.r[1]) >= 3) rows.signCovered.push({ what: `${p.label || p.kind}'s badge over ${f.b.name || f.b.kind}'s ${q.k} "${q.t}"`, x: B.x, y: B.y });
      }
    }
  }
  const chunks = new Map();
  for (const f of faces) {
    const { it, sp } = f;
    for (let cy = Math.floor(it.y / STATIC_CHUNK); cy <= Math.floor((it.y + 260) / STATIC_CHUNK); cy++) for (let cx = Math.floor(it.x / STATIC_CHUNK); cx <= Math.floor((it.x + sp.w) / STATIC_CHUNK); cx++) { const k = cy * 4096 + cx; let l = chunks.get(k); if (!l) chunks.set(k, (l = [])); l.push(f); }
  }
  const hitOnce = new Set();
  for (const [k, fl] of chunks) {
    const cx = k % 4096, cy = Math.floor(k / 4096);
    for (const o of staticItems(M, cx, cy, { noCover: true })) {
      // (a plant: only for signCovered - a planter stood against the front, a tree before it: sightlines3 keeps the crowns
      // off the boards, nameCovered never counted them)
      const flora = !!o.recipe && o.recipe.t === 'f';
      if (!o.recipe || (SKIP.has(o.recipe.t) && !flora) || THIN.has(o.recipe.m || o.recipe.t) || o.b !== undefined) continue;
      for (const f of fl) {
        const { it, sp, b } = f;
        if (o.y <= it.y || o.y > it.y + 260 || o.x + o.ext[2] < it.x || o.x - o.ext[0] > it.x + sp.w) continue;
        const box = [o.x - o.ext[0], o.y - (o.z0 || 0) - o.ext[1], o.x + o.ext[2], o.y - (o.z0 || 0) + o.ext[3]];
        let bx = f.bx.filter((q) => hit2(q.r, box));
        // (signCovered: anything of it over the sign's words or the window's OPEN, however little - its drawn pixels)
        const cov = coversOf(f).filter((q) => hit2(q.r, box));
        if (cov.length) {
          const G = spr(o);
          if (G) {
            const ox = o.x - (G.ax || 0), oy = o.y - (o.z0 || 0) - (G.ay || 0);
            for (const q of cov) {
              const [X0, Y0, X1, Y1] = q.r;
              const n = pxOver(G, ox, oy, X0, Y0, X1, Y1);   // (art-pixel sprites too: pxOver)
              const id = `c|${f.bi}|${q.t}|${o.key}|${Math.round(o.x)}`;
              if (n >= 6 && !hitOnce.has(id)) { hitOnce.add(id); rows.signCovered.push({ what: `${o.recipe.m || o.recipe.sp || o.recipe.t} in front of ${b.name || b.kind}'s ${q.k} "${q.t}"`, x: o.x, y: o.y, why: `${n} px over it` }); }
            }
          }
        }
        if (flora) continue;
        if (f.sgn && box[1] < it.y - 30) {
          if (f.sign === undefined) { let sb = null; try { const G = makeBuilding(sp); if (G.signBox) sb = [it.x - G.ax + G.signBox.x, it.y - G.ay + G.signBox.y, it.x - G.ax + G.signBox.x + G.signBox.w, it.y - G.ay + G.signBox.y + G.signBox.h]; } catch { sb = null; } f.sign = sb; }
          if (f.sign && hit2(f.sign, box)) bx = bx.concat([{ t: f.sgn.text, r: f.sign }]);
        }
        if (!bx.length) continue;
        const G = spr(o);
        if (!G) continue;
        const ox = o.x - (G.ax || 0), oy = o.y - (o.z0 || 0) - (G.ay || 0);
        for (const q of bx) {
          const [X0, Y0, X1, Y1] = q.r, area = (X1 - X0) * (Y1 - Y0);
          let n = 0;
          n = pxOver(G, ox, oy, X0, Y0, X1, Y1);
          const id = `${f.bi}|${q.t}|${o.key}`;
          if (n >= Math.max(12, area * 0.1) && !hitOnce.has(id)) { hitOnce.add(id); rows.nameCovered.push({ what: `${o.recipe.m || o.recipe.t} "${o.key}" in front of ${b.name || b.kind}'s "${q.t}"`, x: o.x, y: o.y, why: `${Math.round(100 * n / area)}% of it` }); }
        }
      }
    }
  }
  plantRows(M, I, rows, seen);
}

// a house's path and driveway (shared/world3-tidy.js homePaths3: the strips from its door and its car's spot to the street)
function plantRows(M, I, rows, seen) {
  const path = homePaths3(M), chunks = new Set();
  seen.paths = path.size;
  for (const h of M.homes || []) { const b = h && h.kind === 'house' ? M.buildings[h.b] : null; if (b) chunks.add(Math.floor((b.ty + b.th) * TILE / STATIC_CHUNK) * 4096 + Math.floor((b.tx + b.tw / 2) * TILE / STATIC_CHUNK)); }
  const over = (x, y, hw) => { for (let tx = Math.floor((x - hw) / TILE); tx <= Math.floor((x + hw) / TILE); tx++) for (const ty of [Math.floor((y - 4) / TILE), Math.floor((y + 4) / TILE)]) if (M.inside(tx, ty)) { const h = path.get(M.idx(tx, ty)); if (h) return h; } return null; };
  const seenAt = new Set();
  for (const k of chunks) {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      for (const o of staticItems(M, (k % 4096) + i, Math.floor(k / 4096) + j)) {
        if (!o.recipe || o.recipe.t !== 'f') continue;
        const id = `${o.key}@${o.x},${o.y}`;
        if (seenAt.has(id)) continue;
        seenAt.add(id);
        const h = over(o.x, o.y, Math.max(4, floraHalf(o.recipe.sp, o.recipe.k || 1) * 0.5));   // (half the plant's own half-width - not its item's room, which the nature kit made a size roomier, 11-21)
        if (h) rows.plantOnPath.push({ what: `a ${o.recipe.sp} on ${h.name}'s path`, x: o.x, y: o.y });
      }
    }
  }
  for (const p of M.props) if (p && TIDY3.PLANT.test(p.t)) { const h = over(p.x, p.y, 14); if (h) rows.plantOnPath.push({ what: `a ${p.t} (the map's) on ${h.name}'s path`, x: p.x, y: p.y }); }
}

// The doors: a path to every business's and home's door; a room behind the door of every place you'd walk into
//   doorOnGrass  its step (the tile outside the door) not on what a path is made of, or that path not reaching a road
//                within DOOR_REACH steps
//   doorBlocked  something solid (a planter, a bin, a bench...) on the door's step or the tile out past it
//   wallOnly     a walk-in kind's place (WALK_IN, a charter office, a hand plan's walk-in shop) with no walk-in room
export const PATH_T = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.DOCK, T.ROAD, T.BRIDGE, T.DIRT, T.FLOOR]);
export const ENTER_KINDS = new Set([...WALK_IN, 'charter']);
const DOOR_KINDS = new Set([...ENTER_KINDS, ...DOOR_EXTRA]);   // (one list with the build's: world3-doorsteps.js)
const DOOR_REACH = 400;
function doorRows(M, rows, seen) {
  const TN = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
  const tileOf = (tx, ty) => (M.inside(tx, ty) ? M.tiles[M.idx(tx, ty)] : -1);
  const unitOf = new Map();
  for (const id of M.walkIns || []) { const b = M.buildings[id]; for (const u of (b && b.walkIn && b.walkIn.units) || []) unitOf.set(u.poi, { b, u }); }
  // from the step's tiles over path tiles to a road (cached per tile: a whole plaza is walked once)
  const reach = new Map();
  const toRoad = (starts) => {
    const seenT = new Map(), q = [];
    for (const [x, y] of starts) { const i = M.idx(x, y); if (reach.has(i)) return reach.get(i); seenT.set(i, 0); q.push(x, y); }
    let ok = false;
    for (let h = 0; h < q.length && !ok; h += 2) {
      const x = q[h], y = q[h + 1], i = M.idx(x, y), d = seenT.get(i), t = M.tiles[i];
      if (t === T.ROAD || t === T.BRIDGE || reach.get(i) === true) { ok = true; break; }
      if (d >= DOOR_REACH) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!M.inside(nx, ny)) continue;
        const j = M.idx(nx, ny);
        if (seenT.has(j) || !PATH_T.has(M.tiles[j]) || (M.tiles[j] === T.FLOOR)) continue;
        seenT.set(j, d + 1); q.push(nx, ny);
      }
    }
    if (ok) for (const i of seenT.keys()) reach.set(i, true);
    return ok;
  };
  seen.doors = 0; seen.enter = 0;
  const done = new Set();
  for (const p of M.pois) {
    if (!p || p.b === undefined || p.b === null || !(DOOR_KINDS.has(p.kind) || p.walk)) continue;
    const b = M.buildings[p.b];
    if (!b || b.gone || b.tw === undefined) continue;
    const U = unitOf.get(p.id);
    // wallOnly: a place you'd walk into, with no room behind its door
    if (ENTER_KINDS.has(p.kind) || p.walk) { seen.enter++; if (!U) rows.wallOnly.push({ what: `${p.label || p.kind} (${p.kind}${p.walk ? `, ${p.store || 'walk'}` : ''})`, x: p.x, y: p.y, why: `${b.prefab < 0 ? 'a hand-built' : 'a lot'} building, no walk-in room` }); }
    // the door's step: a walk-in unit's doorway's row outside; a building's own door; else the place's spot (stepped out
    // of the wall when it's on it)
    let steps;
    if (U) { const fy = U.u.door.ty + (U.b.walkIn.south ? 1 : -1); steps = []; for (let k = 0; k < (U.u.door.w || 2); k++) steps.push([U.u.door.tx + k, fy]); }
    else {
      const at = p.outside || p;
      let tx = Math.floor(at.x / TILE), ty = Math.floor(at.y / TILE);
      if (tileOf(tx, ty) === T.BUILDING || tileOf(tx, ty) === T.WALL) ty += at.y >= (b.ty + b.th / 2) * TILE ? 1 : -1;
      steps = [[tx, ty]];
    }
    const key = `${steps[0][0]},${steps[0][1]}`;
    if (done.has(key)) continue;
    done.add(key);
    seen.doors++;
    const on = steps.map(([x, y]) => tileOf(x, y)), paved = steps.filter((q, k) => PATH_T.has(on[k]) && on[k] !== T.FLOOR);
    const what = `${p.label || b.name || p.kind}'s door (${p.kind})`, x = (steps[0][0] + 0.5) * TILE, y = (steps[0][1] + 0.5) * TILE;
    if (!paved.length) rows.doorOnGrass.push({ what, x, y, why: `its step on ${TN[on[0]] || 'nothing'}` });
    else if (!toRoad(paved)) rows.doorOnGrass.push({ what, x, y, why: `its path (${TN[on[0]]}) reaches no road within ${DOOR_REACH} steps` });
  }
}

// every ATM against a building's wall (its machine's back on the building) or inside one
function atmRows(M, rows, seen) {
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return M.inside(tx, ty) ? M.tiles[M.idx(tx, ty)] : -1; };
  const wall = (t) => t === T.BUILDING || t === T.WALL;
  const props = M.props.filter((p) => p && p.t === 'atmw');
  seen.atms = 0;
  for (const a of M.pois) {
    if (!a || a.kind !== 'atm') continue;
    seen.atms++;
    const pr = props.find((p) => Math.abs(p.x - a.x) < 6 && a.y - p.y > 10 && a.y - p.y < 40);
    if (pr && pr.inside !== undefined) continue;
    const wy = pr ? pr.y - 5 : a.y - 26;   // (a machine set in the wall: its foot 5 px out from it; a painted one: 26 px)
    if ([-12, 0, 12].every((dx) => wall(tileAt(a.x + dx, wy - 8)))) continue;
    rows.atmStray.push({ what: `an ATM${pr && pr.v ? ` (${pr.v})` : ''} on its own`, x: a.x, y: a.y, why: `behind it ${Object.keys(T).find((k) => T[k] === tileAt(a.x, wy - 8)) || 'nothing'}` });
  }
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
