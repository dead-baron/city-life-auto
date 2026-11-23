// The whole-game audit's world rows (2026-11-19, docs/audit/TASK.md; the owner's 11-17 notes, docs/audit/PREBETA-LIST.md
// sections A and C): each checks the built World v3 map for one class of the owner's notes, so a fix is a class fix and the
// count can only come down (test/placementlint.test.js keeps each row's count, tools/placementlint.mjs LINT_ALLOW).
//   plantOnWalk    a tree, shrub, bush or hedge (any part of it) on a sidewalk, a road, a plaza or a lot; a planter on a
//                  sidewalk or a road (the owner, 11-17: "still spawning over sidewalks")
//   northDoor      a business's or a public place's entrance on its building's north wall (walk-in unit facing north, its
//                  door or its place's spot on the building's north half): entrances face south, SE or SW
//   interiorOverlap a walk-in's room (its floor's tiles) under another building: that building's footprint, or its drawn
//                  front/roof standing up over the room (the Neon Strip casino: the next building's facade over its floor)
//   frontNames     a shop's sign naming none of the places behind it, or a trade word on it (PHARMACY, BAR, HOTEL...) none of
//                  its places is (a pharmacy under "Neon Nights")
//   lobbyDoor      a home's (an apartment's lobby) door at a shop front: the shop's sign over it, its spot beside the shop's
//                  place or under a shop sign with no place of its own (the 24-7 Market: "Into Southside Apt #3173's lobby")
//   rampCrossesRoad a freeway ramp below deck height over a ground-level road that isn't its own junction (an embankment
//                  across the street)
//   railOverWater  a railing or fence run whose span leaves the land: a stretch of it over open water, not on a dock or a
//                  bridge (the promenade's railings jutting out over the sea on a diagonal shore)
//   dockOverlap    two plank structures (boardwalks, piers, footbridges) over each other away from their ends (a crossing,
//                  a jetty poking through a walkway - the Egret Marsh boardwalk)
//   railOverWaterArt a railway's span over water (each run of track over WATER / DEEP), drawn as ground track: the art has
//                  no rail bridge yet - every span is a hit until it does (RAIL_BRIDGE_ART)
//   portalOnFlat   a tunnel's open mouth with no rise over the tunnel behind it: the ground over the bore no higher than
//                  the ground in front (a portal frame standing on open grass)
//   festoonDensity hanging-light runs crowded together: more than FESTOON_CAP runs within FESTOON_R of one another (the
//                  Neon alley's curtain of bistro lights)
//   cropInTown     a crop field, crop strip or orchard outside the farmland (in a city or town district) or by a beach
//   heliOffPad     a hospital with no helipad on the ground, or a ground helipad (where a helicopter parks) on a road, a
//                  sidewalk, the water or crowded by solid things
//   deadBoat       a boat prop a player can reach that isn't a vehicle and isn't stored (lifted on stands): a beached
//                  rowboat or canoe, a moored sailboat or yacht you can't get in
//   bigEmptyPlaza  open paving (plaza) with an empty stretch larger than about half a screen across: no prop, building or
//                  edge within EMPTY_R tiles of a spot ("no oversized empty plazas or lots", 11-14)
//   binBags        black bin bags away from any bin, outside the rough districts ("only a few, near cans or in rough
//                  alleys", 10-10)
//   drinkSign      a sign line pairing drink with riding or driving ("RIDE DRINK REPEAT", the owner 11-17)
import { emptySpots, EMPTY_R } from '../../shared/world3-plazafill.js';
import { TILE, T } from '../../shared/constants.js';
import { TIDY3, strayBags } from '../../shared/world3-tidy.js';
import { railWetRun } from '../../shared/world3-railtrim.js';
import { cropWhy } from '../../shared/world3-croptidy.js';
import { signWrong } from '../../shared/world3-signfix.js';
import { plantKind, plantWalkHit } from '../../shared/world3-walks.js';
import { airfields } from '../../shared/flight.js';
import { FLY } from '../../shared/flight.js';
import { staticIndex } from '../../client/art2/game/statics.js';
import { buildingH } from '../../client/art2/buildings.js';

export const FESTOON_R = 8 * TILE, FESTOON_CAP = 8, CROP_BEACH = 6;
export { EMPTY_R };
// whether the page draws railway spans over water as a bridge (client/render/trains.js, client/art2: no rail bridge art
// yet - the owner, 11-17 "it's the ground track drawn over the sea with brown curved girder stripes")
export const RAIL_BRIDGE_ART = false;

const NOT_PLACES = new Set(['home', 'atm', 'vending', 'reception', 'evidence', 'delivery']);
const TREES = /^(tree_[ab]|palm_[abcds]|redwood|mangrove|bamboo|topiary)$/, BUSHES = /^(shrub_[ab]|bush_[abc]|cactus)$/;
const PLANTERS = /^(planter_(sq|fl|g)|potted)$/;
const WALK_T = new Set([T.SIDEWALK, T.ROAD, T.PLAZA, T.LOT, T.BRIDGE]);
const FENCES = new Set(['rail', 'crail', 'fenceline', 'yfence', 'chainfence', 'pierrail', 'creekrail']);
const PLANKS = new Set(['boardwalk', 'pier', 'fbridge', 'logbridge', 'ropebridge']);
const BOATS = new Set(['rowboat', 'canoe', 'fishboat', 'sailboat', 'yacht']);
const FARM_STYLES = new Set(['rural', 'wild', 'desert', 'rocky', 'farm', 'forest', 'mountain']);
const TRADE = {   // a word on a sign -> the kinds of place that may carry it
  PHARMACY: 'pharmacy hospital', CLINIC: 'pharmacy hospital', HOSPITAL: 'hospital', BAR: 'club bar roadhouse diner snack coffee',
  PUB: 'club bar roadhouse', TAVERN: 'club bar roadhouse', SALOON: 'club bar roadhouse', CLUB: 'club fence clubhouse',
  CAFE: 'coffee snack diner', COFFEE: 'coffee snack diner', DINER: 'diner snack coffee', BANK: 'bank', SAVINGS: 'bank',
  HOTEL: 'reception', MOTEL: 'reception', INN: 'reception', GUNS: 'gunshop', PAWN: 'pawn', BARBER: 'barber', TATTOO: 'tattoo',
  LIQUOR: 'convenience grocery', MARKET: 'convenience grocery market fishmarket', MART: 'convenience grocery gasstation',
  DELI: 'convenience grocery snack coffee', GROCERY: 'grocery convenience', HARDWARE: 'hardware', TACKLE: 'tackle',
  CASINO: 'casino', CINEMA: 'cinema', THEATER: 'cinema', BOWL: 'bowling', LANES: 'bowling', ARCADE: 'arcade', POLICE: 'police',
  GAS: 'gasstation', FUEL: 'gasstation', SPORTS: 'sports', BOUTIQUE: 'clothing', APPAREL: 'clothing', THREADS: 'clothing',
};

export function auditRows(M, rows, seen) {
  const add = (k, r) => (rows[k] || (rows[k] = [])).push(r);
  for (const k of ['plantOnWalk', 'planterOnWalk', 'northDoor', 'interiorOverlap', 'frontNames', 'lobbyDoor', 'rampCrossesRoad', 'railOverWater', 'dockOverlap', 'railOverWaterArt', 'portalOnFlat', 'festoonDensity', 'cropInTown', 'heliOffPad', 'deadBoat', 'bigEmptyPlaza', 'binBags', 'drinkSign']) rows[k] = rows[k] || [];
  const TN = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
  const tileT = (tx, ty) => (M.inside(tx, ty) ? M.tiles[M.idx(tx, ty)] : -1);
  const tileAt = (x, y) => tileT(Math.floor(x / TILE), Math.floor(y / TILE));
  const wetT = (t) => t === T.WATER || t === T.DEEP;
  const up = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9 &']/g, ' ').replace(/\s+/g, ' ').trim();
  const placesOf = new Map();
  for (const p of M.pois) if (p && p.b !== undefined && p.b !== null) { let l = placesOf.get(p.b); if (!l) placesOf.set(p.b, (l = [])); l.push(p); }
  const bizOf = (bi) => (placesOf.get(bi) || []).filter((p) => !NOT_PLACES.has(p.kind) || p.casino);

  // ---- plantOnWalk ----
  // (the same test the world's own pass clears with: shared/world3-walks.js plantWalkHit - a boulevard median's palms, a
  // street tree in its grate and a pot set against a wall are kept, as decided 11-19)
  seen.plants = 0;
  for (const p of M.props) {
    const kind = plantKind(p);
    if (!kind) continue;
    seen.plants++;
    const bad = plantWalkHit(M, p, kind), pl = kind === 'planter';
    if (bad < 0) continue;
    add(pl ? 'planterOnWalk' : 'plantOnWalk', { what: `a ${p.t}${p.sp ? ` (${p.sp})` : ''}`, x: p.x, y: p.y, why: `on ${TN[bad]}` });
  }

  // ---- northDoor ----
  seen.bizDoors = 0; seen.northHomes = 0;
  for (const b of M.buildings) {
    if (!b || b.gone || b.tw === undefined) continue;
    const biz = bizOf(b.id), midY = (b.ty + b.th / 2) * TILE;
    const homes = (placesOf.get(b.id) || []).filter((p) => p.kind === 'home');
    if (!biz.length) { if (homes.length && homes.every((p) => p.y < midY) && b.door && b.door.ty < b.ty + b.th / 2) seen.northHomes++; continue; }
    seen.bizDoors++;
    let north = false, why = '';
    if (b.walkIn && b.walkIn.south === false) { north = true; why = 'its walk-in faces north'; }
    else if (!b.walkIn) {
      const spots = biz.map((p) => p.outside || p);
      if (spots.every((s) => s.y < midY)) { north = true; why = 'its places on the north wall'; }
    }
    if (north) add('northDoor', { what: `${b.name || b.kind} (${[...new Set(biz.map((p) => (p.casino ? 'casino' : p.kind)))].join(', ')})`, x: (b.tx + b.tw / 2) * TILE, y: b.ty * TILE, why });
  }

  // ---- interiorOverlap ----
  const I = staticIndex(M);
  const drawn = [];   // every building section as drawn: [x0, top, x1, foot, bi]
  for (const [bi, items] of I.byB) for (const it of items) { const sp = it.recipe && it.recipe.t === 'b' && it.recipe.spec; if (!sp || !sp.w) continue; let H = 0; try { H = buildingH(sp); } catch { H = 0; } const b = M.buildings[bi], top = b ? Math.min(b.ty * TILE, it.y - (sp.d || 0)) - H : it.y - H; drawn.push([it.x, top, it.x + sp.w, it.y, bi]); }
  const DC = 512, dgrid = new Map();
  drawn.forEach((d, i) => { for (let cy = Math.floor(d[1] / DC); cy <= Math.floor(d[3] / DC); cy++) for (let cx = Math.floor(d[0] / DC); cx <= Math.floor(d[2] / DC); cx++) { const k = cy * 100000 + cx; let l = dgrid.get(k); if (!l) dgrid.set(k, (l = [])); l.push(i); } });
  seen.rooms = 0;
  for (const id of M.walkIns || []) {
    const b = M.buildings[id], W = b && b.walkIn;
    if (!W) continue;
    seen.rooms++;
    const rx0 = W.x0 * TILE, rx1 = (W.x1 + 1) * TILE, ry0 = W.y0 * TILE, ry1 = (W.y1 + 1) * TILE;
    const others = new Map();
    for (let ty = W.y0; ty <= W.y1; ty++) for (let tx = W.x0; tx <= W.x1; tx++) { if (!M.inside(tx, ty)) continue; const o = M.bld[M.idx(tx, ty)]; if (o >= 0 && o !== id) others.set(o, (others.get(o) || 0) + 1); }
    for (const [o, n] of others) add('interiorOverlap', { what: `${b.name || b.kind}'s room under ${M.buildings[o].name || M.buildings[o].kind}`, x: (rx0 + rx1) / 2, y: (ry0 + ry1) / 2, why: `${n} tiles of its footprint` });
    const seenO = new Set(others.keys());
    for (let cy = Math.floor(ry0 / DC); cy <= Math.floor(ry1 / DC); cy++) for (let cx = Math.floor(rx0 / DC); cx <= Math.floor(rx1 / DC); cx++) for (const i of dgrid.get(cy * 100000 + cx) || []) {
      const d = drawn[i];
      if (d[4] === id || seenO.has(d[4])) continue;
      const ox = Math.min(d[2], rx1) - Math.max(d[0], rx0), oy = Math.min(d[3], ry1) - Math.max(d[1], ry0);
      if (ox < TILE || oy < TILE || d[3] <= ry0 + TILE) continue;   // (a building north of the room, drawn up away from it: not over it)
      seenO.add(d[4]);
      add('interiorOverlap', { what: `${b.name || b.kind}'s room under ${M.buildings[d[4]].name || M.buildings[d[4]].kind}'s drawn front`, x: (rx0 + rx1) / 2, y: (ry0 + ry1) / 2, why: `${Math.round(ox / TILE)} x ${Math.round(oy / TILE)} tiles of it over the floor` });
    }
  }

  // ---- frontNames, lobbyDoor ----
  const sig = (s) => up(s).split(' ').filter((w) => w.length >= 4 && !/^(THE|AND|SHOP|STORE|CO|CORNER|PLACE|STREET)$/.test(w));
  seen.shopFronts = 0;
  for (const b of M.buildings) {
    if (!b || b.gone || b.tw === undefined) continue;
    const shopSign = b.art && b.art.shop && b.art.shop.sign && b.art.shop.sign.text;
    const texts = [shopSign, ...(b.signs || []).map((q) => q.text)].filter(Boolean);
    if (!texts.length) continue;
    const biz = bizOf(b.id), homes = (placesOf.get(b.id) || []).filter((p) => p.kind === 'home');
    if (shopSign) seen.shopFronts++;
    if (biz.length) {   // (shared/world3-signfix.js signWrong: the build renames a wrong shop sign by the same rule)
      for (const t of new Set(texts.map(up))) {
        const w = signWrong(t, biz, b, t === up(shopSign));
        if (!w) continue;
        const kinds = new Set(biz.map((p) => (p.casino ? 'casino' : p.kind))), wrongTrade = t.split(' ').filter((x) => TRADE[x] && !TRADE[x].split(' ').some((k) => kinds.has(k)));
        add('frontNames', { what: `"${t}" over ${biz.map((p) => `${p.label} (${p.kind})`).join(', ')}`, x: (b.tx + b.tw / 2) * TILE, y: (b.ty + b.th) * TILE, why: w === 'trade' ? `${wrongTrade.join(', ')} on the sign` : 'the sign names none of its places' });
      }
    }
    if (shopSign && homes.length) {
      const foot = (b.ty + b.th) * TILE;
      for (const h of homes) {
        if (h.y < foot - TILE) continue;   // (a lobby at the side or the back: right)
        const near = biz.find((p) => Math.abs(p.x - h.x) < 3 * TILE && Math.abs(p.y - h.y) < 2 * TILE);
        if (near || !biz.length) add('lobbyDoor', { what: `${h.label}'s lobby door at "${up(shopSign)}"`, x: h.x, y: h.y, why: near ? `beside ${near.label} (${near.kind})` : 'a shop front with no place of its own' });
      }
    }
  }

  // ---- rampCrossesRoad ----
  {
    const RC = 512, sg = new Map();
    M.roads.forEach((r, ri) => { if (!r || r.lvl !== 0 || !r.pts) return; for (let i = 0; i + 1 < r.pts.length; i++) { const a = r.pts[i], c = r.pts[i + 1]; const x0 = Math.min(a.x, c.x) - r.hw, x1 = Math.max(a.x, c.x) + r.hw, y0 = Math.min(a.y, c.y) - r.hw, y1 = Math.max(a.y, c.y) + r.hw; for (let cy = Math.floor(y0 / RC); cy <= Math.floor(y1 / RC); cy++) for (let cx = Math.floor(x0 / RC); cx <= Math.floor(x1 / RC); cx++) { const k = cy * 100000 + cx; let l = sg.get(k); if (!l) sg.set(k, (l = [])); l.push([ri, i]); } } });
    const dSeg = (x, y, a, c) => { const dx = c.x - a.x, dy = c.y - a.y, L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)); return Math.hypot(x - a.x - dx * t, y - a.y - dy * t); };
    const hitOnce = new Set();
    seen.rampSegs = 0;
    for (const s of M.levels.segs) {
      if (!s.ramp) continue;
      seen.rampSegs++;
      const own = M.roads[s.edge], ends = own ? new Set([own.a, own.b]) : new Set();
      for (let u = 0; u <= s.len; u += 16) {
        const z = s.za + (s.zb - s.za) * (u / (s.len || 1));
        if (z >= 0.9) continue;
        const x = s.ax + s.ux * u, y = s.ay + s.uy * u;
        for (const [ri, i] of sg.get(Math.floor(y / RC) * 100000 + Math.floor(x / RC)) || []) {
          const r = M.roads[ri];
          if (ri === s.edge || ends.has(r.a) || ends.has(r.b)) continue;
          if (dSeg(x, y, r.pts[i], r.pts[i + 1]) > r.hw - 8) continue;
          const key = `${s.edge}|${ri}`;
          if (hitOnce.has(key)) continue;
          hitOnce.add(key);
          add('rampCrossesRoad', { what: `${own ? own.name || own.kind : 'a ramp'} at ${z.toFixed(2)} of deck height over ${r.name || r.kind}`, x, y, why: `${r.kind} lvl 0` });
        }
      }
    }
  }

  // ---- railOverWater ----
  seen.fences = 0;
  for (const p of M.props) {
    if (!p || !FENCES.has(p.t)) continue;
    seen.fences++;
    let dx = 0, dy = 0;
    if (p.t === 'yfence') { dx = p.x1 - p.x; dy = p.y1 - p.y; } else if (p.t === 'crail') { dx = p.len || 0; } else { dx = p.tx || 0; dy = p.ty || 0; }
    const L = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(L / 8));
    const worst = railWetRun(M, p);   // (shared/world3-railtrim.js: water under it and either side - the build's rule too)
    if (worst >= 2) add('railOverWater', { what: `a ${p.t}${p.kind ? ` (${p.kind})` : ''} ${Math.round(L / TILE)} tiles`, x: p.x + dx / 2, y: p.y + dy / 2, why: `${worst * 8} px of it over open water` });
  }

  // ---- dockOverlap ----
  {
    const pl = M.props.filter((p) => p && PLANKS.has(p.t)).map((p) => { const a = p.a || 0, L = p.len || 128, w = p.w || 48; return { p, a, L, w, ux: Math.cos(a), uy: Math.sin(a) }; });
    seen.planks = pl.length;
    // (a run's x, y is its middle: world3-marsh.js lays each leg's boardwalk at the leg's midpoint, len along a)
    const inside = (q, x, y) => { const rx = x - q.p.x, ry = y - q.p.y, s = rx * q.ux + ry * q.uy, c = -rx * q.uy + ry * q.ux; return Math.abs(s) <= q.L / 2 + 2 && Math.abs(c) <= q.w / 2; };
    for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) {
      const A = pl[i], B = pl[j];
      if (Math.hypot(A.p.x - B.p.x, A.p.y - B.p.y) > (A.L + B.L) / 2 + 48) continue;
      let n = 0, sx = 0, sy = 0;
      for (let s = -A.L / 2; s <= A.L / 2; s += 8) for (const c of [-A.w / 2 + 4, 0, A.w / 2 - 4]) { const x = A.p.x + A.ux * s - A.uy * c, y = A.p.y + A.uy * s + A.ux * c; if (inside(B, x, y)) { n++; sx += x; sy += y; } }
      if (n < 3) continue;
      const cx = sx / n, cy = sy / n, along = (q) => (cx - q.p.x) * q.ux + (cy - q.p.y) * q.uy;
      const atEnd = (q) => Math.abs(along(q)) > q.L / 2 - q.w * 1.2;
      // (end to end in line: one walk; end to end at an angle: a bend whose two runs' ends cross over each other - their
      // rails and planks drawn twice - with no landing there; anywhere else: one run through the other)
      const turn = Math.abs(Math.atan2(Math.sin(A.a - B.a), Math.cos(A.a - B.a)));
      const bend = Math.min(turn, Math.PI - turn);
      if (atEnd(A) && atEnd(B) && bend < 0.35) continue;
      add('dockOverlap', { what: `a ${A.p.t} and a ${B.p.t} over each other`, x: cx, y: cy, why: atEnd(A) && atEnd(B) ? `a ${Math.round(bend * 180 / Math.PI)} degree bend, their ends crossed, no landing` : 'one through the other, away from their ends' });
    }
    // the marsh's and the shore's planks as tiles: a DOCK run crossing another (a + of planks with no landing) is drawn by
    // the deck layer; nothing to measure there beyond the props
  }

  // ---- railOverWaterArt ----
  seen.railSpans = 0;
  for (const r of M.rails || []) {
    if (r.subway) { /* a subway's line is underground but for its portals */ }
    let start = -1;
    const flush = (i) => {
      if (start < 0) return;
      const a = r.pts[start], b = r.pts[i - 1], len = b.s - a.s;
      start = -1;
      if (len < 2 * TILE) return;
      seen.railSpans++;
      if (/the other way/.test(r.name)) return;   // (the double track's twin: one span, one row)
      if (!RAIL_BRIDGE_ART) add('railOverWaterArt', { what: `${r.service || r.name} over the water, ${Math.round(len / TILE)} tiles`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, why: 'drawn as ground track (no rail bridge art)' });
    };
    // (over the water the track's tiles are BRIDGE: a span over water is a run of bridge points with water beside them -
    // a bridge over a road or a gully isn't counted)
    const wetBy = (q) => { const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE); for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (wetT(tileT(tx + i, ty + j))) return true; return false; };
    for (let i = 0; i < r.pts.length; i++) { const q = r.pts[i]; const t = tileAt(q.x, q.y); const w = !q.tunnel && !q.under && !q.subway && (wetT(t) || (t === T.BRIDGE && wetBy(q))); if (w && start < 0) start = i; else if (!w) flush(i); }
    flush(r.pts.length);
  }

  // ---- portalOnFlat ----
  seen.mouths = 0;
  const relief = M.relief;
  const rel = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return M.inside(tx, ty) && relief ? relief[M.idx(tx, ty)] : 0; };
  for (const tn of M.tunnels || []) for (const mo of tn.mouths || []) {
    if (mo.closed) continue;
    seen.mouths++;
    const inn = [], out = [];
    for (let d = 2; d <= 6; d++) { inn.push(rel(mo.x - mo.ox * d * TILE, mo.y - mo.oy * d * TILE)); out.push(rel(mo.x + mo.ox * d * TILE, mo.y + mo.oy * d * TILE)); }
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length, rise = avg(inn) - avg(out);
    const ground = tileAt(mo.x - mo.ox * 3 * TILE, mo.y - mo.oy * 3 * TILE);
    if (rise < 1) add('portalOnFlat', { what: `${tn.kind} tunnel ${tn.id}${tn.arrival ? ' (an arrival train\'s)' : ''} mouth${mo.blind ? ' (blind end)' : ''}`, x: mo.x, y: mo.y, why: `ground over the bore ${TN[ground] || '?'}, relief rise ${rise.toFixed(1)}` });
  }

  // ---- festoonDensity ----
  {
    const fs = M.props.filter((p) => p && p.t === 'festoon').map((p) => ({ p, x: p.x + (p.tx || 0) / 2, y: p.y + (p.ty || 0) / 2 }));
    const cells = new Set();
    for (const f of fs) {
      const near = fs.filter((g) => Math.abs(g.x - f.x) < FESTOON_R && Math.abs(g.y - f.y) < FESTOON_R && Math.hypot(g.x - f.x, g.y - f.y) < FESTOON_R);
      if (near.length <= FESTOON_CAP) continue;
      const key = `${Math.floor(f.x / (FESTOON_R * 2))},${Math.floor(f.y / (FESTOON_R * 2))}`;
      if (cells.has(key)) continue;
      cells.add(key);
      add('festoonDensity', { what: `${near.length} runs of ${f.p.k === 'lantern' ? 'lanterns' : 'lights'} within ${FESTOON_R / TILE} tiles`, x: f.x, y: f.y, why: `cap ${FESTOON_CAP}` });
    }
  }

  // ---- cropInTown ---- (shared/world3-croptidy.js cropWhy: the build clears the scraps by the same test)
  {
    const why = (x, y) => cropWhy(M, x, y);
    const seenT = new Uint8Array(M.w * M.h);
    seen.fieldPatches = 0;
    for (let ty = M.y0; ty < M.y0 + M.h; ty++) for (let tx = M.x0; tx < M.x0 + M.w; tx++) {
      const i0 = M.idx(tx, ty);
      if (seenT[i0] || M.tiles[i0] !== T.FIELD) continue;
      const q = [tx, ty]; seenT[i0] = 1; let n = 0, sx = 0, sy = 0, wy = null;
      for (let h = 0; h < q.length; h += 2) {
        const x = q[h], y = q[h + 1]; n++; sx += x; sy += y;
        if (!wy) wy = why((x + 0.5) * TILE, (y + 0.5) * TILE);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!M.inside(nx, ny)) continue; const j = M.idx(nx, ny); if (!seenT[j] && M.tiles[j] === T.FIELD) { seenT[j] = 1; q.push(nx, ny); } }
      }
      seen.fieldPatches++;
      if (wy) add('cropInTown', { what: `a crop field (${n} tiles)`, x: (sx / n + 0.5) * TILE, y: (sy / n + 0.5) * TILE, why: wy });
    }
    for (const p of M.props) if (p && (p.t === 'cropstrip' || p.t === 'vinerow')) { const w = why(p.x, p.y); if (w) add('cropInTown', { what: `a ${p.t}${p.k ? ` (${p.k})` : ''}`, x: p.x, y: p.y, why: w }); }
    for (const o of M.orchards || []) { const w = why(o.x + o.w / 2, o.y + o.h / 2); if (w) add('cropInTown', { what: `an ${o.k || 'orchard'} ${Math.round(o.w / TILE)} x ${Math.round(o.h / TILE)}`, x: o.x + o.w / 2, y: o.y + o.h / 2, why: w }); }
  }

  // ---- heliOffPad ----
  {
    const af = airfields(M), ground = af.pads.filter((p) => !p.roof);
    seen.pads = ground.length;
    for (const h of M.hospitals || []) {
      const pad = ground.find((p) => p.kind === 'hospital' && p.name === `${h.name} helipad`);
      if (!pad) add('heliOffPad', { what: `${h.name}: no helipad on the ground`, x: h.x, y: h.y, why: 'no clear spot found for one (shared/flight.js findPadSpot)' });
    }
    for (const p of ground) {
      const bad = [];
      for (const [dx, dy] of [[0, 0], [FLY.PAD_R * 0.7, 0], [-FLY.PAD_R * 0.7, 0], [0, FLY.PAD_R * 0.7], [0, -FLY.PAD_R * 0.7]]) { const t = tileAt(p.x + dx, p.y + dy); if (t === T.ROAD || t === T.SIDEWALK || wetT(t) || t === T.BUILDING || t === T.WALL) bad.push(TN[t]); }
      if (bad.length) add('heliOffPad', { what: p.name, x: p.x, y: p.y, why: `the pad's round on ${[...new Set(bad)].join(', ')}` });
    }
  }

  // ---- deadBoat ----
  seen.boatProps = 0;
  for (const p of M.props) {
    if (!p || !BOATS.has(p.t) || p.lift) continue;
    seen.boatProps++;
    const t = tileAt(p.x, p.y);
    add('deadBoat', { what: `a ${p.t} prop`, x: p.x, y: p.y, why: wetT(t) ? 'moored on the water, not a vehicle' : `on ${TN[t]} (beached), not a vehicle` });
  }

  // ---- bigEmptyPlaza ---- (shared/world3-plazafill.js emptySpots: the rule the build fills them by)
  for (const sp of emptySpots(M, EMPTY_R)) add('bigEmptyPlaza', { what: `an empty stretch of paving ${2 * sp.d - 1}+ tiles across`, x: (sp.tx + 0.5) * TILE, y: (sp.ty + 0.5) * TILE, why: `nothing within ${sp.d - 1} tiles` });

  // ---- binBags ---- (shared/world3-tidy.js strayBags: the same rule the build clears with)
  for (const p of strayBags(M)) { const D = M.districtAt(p.x, p.y); add('binBags', { what: 'bin bags', x: p.x, y: p.y, why: `no bin within 3 tiles (${D ? D.tier : '?'} district)` }); }


  // ---- drinkSign ----
  {
    const bad = (t) => /DRINK|BOOZE|BEER|SHOTS/.test(up(t)) && /\bRIDE|DRIVE|ROAD|THROTTLE|MOTOR/.test(up(t));
    for (const p of M.props) if (p && p.text && bad(p.text)) add('drinkSign', { what: `a ${p.t} "${p.text}"`, x: p.x, y: p.y });
    for (const b of M.buildings) {
      if (!b || !b.art) continue;
      const sp = b.art.spec || {}, ts = [b.art.shop && b.art.shop.sign && b.art.shop.sign.text, ...(sp.blades || []).map((q) => q.text), ...(sp.plaques || []).map((q) => q.text), ...(b.signs || []).map((q) => q.text)];
      for (const t of ts) if (t && bad(t)) add('drinkSign', { what: `${b.name}'s "${t}"`, x: (b.tx + b.tw / 2) * TILE, y: (b.ty + b.th) * TILE });
    }
  }
  return rows;
}
