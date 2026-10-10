// The search-and-rescue boat (task #409; the owner: "In the water they can't [reach you] - add a search-and-rescue boat
// when you call for help in the water"). Someone down in the water - a player who calls for help there, or a body near
// a dock while someone's about - is fetched by the rescue boat (shared/vehicles.js rescueboat: an orange and white
// rigid inflatable, two crew in orange) from the nearest harbour, marina or hire dock the water joins up with (docksOf:
// their berths). It runs out along a way through the water planned round the shore, the piers and the islands (wayTo),
// slows, and stops alongside them with them off its side (stopBeside); the crew member on that side leans over and pulls
// them in (PULL_S, as long as the paramedics take to treat someone). A player who called it comes round aboard on half
// health - revive.js charges the ambulance's fee - and is run back to the dock and set ashore there (they can go over the
// side sooner); anyone else is brought in and laid ashore by the dock, where an ambulance comes for them as for anyone
// lying on land. Then back to its berth, and gone once nobody's watching.
// ems.js sends it and runs it with the ambulances (world.ambulances, v.rescue). A player can take it like any boat: the
// crew go over the side and swim for it, and whoever called it can call another.
//   inWater(map, e)                 down in the water, where only a boat gets to them
//   dispatch(world, e, pid)         a boat for them (pid: the player who called it), or null when no dock near enough
//                                   joins up with the water they're in (RANGE, NPC_RANGE)
//   run(world, v, dt, now)          one boat, every tick
//   recall(world, v)                the one who called it cancelled: back to its berth, no charge
//   wayTo(map, a, b)                the way through the water from a to b (px points), or null
//   waterSpot(world, x, y)          (dev menu, tests) open water a boat from the dock nearest (x, y) can get to, or null
import { K, T, TILE } from '../../shared/constants.js';
import { BOAT_BLOCK, PED_BLOCK, isSwimming, nearestLand } from '../../shared/map.js';
import { angleDiff, clamp } from '../../shared/math.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { inAnyView } from '../view.js';
import * as vehicles from './vehicles.js';
import * as revive from './revive.js';

const RANGE = 7200;        // px as the crow flies: the docks a boat sets out from for a player who called it...
const NPC_RANGE = 2600;    // ...and for a body (an NPC drowned near a dock)
const TOP = 440;           // px/s out and back
const PULL_S = 3;          // leaning over the side and pulling them in
const REACH = 34;          // px from the hull's side: within reach of the crew
const MARGIN = 20;         // tiles round the two ends of a way the search may use...
const MAX_CELLS = 250 * 250;   // ...in a box no bigger than this
const MAX_POPS = 50000;
const HULL = 20;           // px a straightened way keeps off the land each side (the hull's half-width, near enough)

export const inWater = (map, e) => !e.vehId && isSwimming(map, e);

// ---- the docks ------------------------------------------------------------------------------------------------------
// Where a rescue boat sets out from, once per map: the hire docks (map.rentals) and the harbours' moorings (map.marina -
// not the Syndicate's at Smuggler's Rock), berths close together as one dock: { x, y (its first berth), berths, land (the
// ground ashore by it, where whoever it brings back steps off toward), name ("the Sunset Beach docks") }.
const DOCKS = new WeakMap();
function docksOf(m) {
  let D = DOCKS.get(m);
  if (D) return D;
  D = [];
  const add = (b, near) => {
    if (BOAT_BLOCK[m.tileAtPx(b.x, b.y)]) return;
    const d0 = D.find((d) => Math.hypot(d.x - b.x, d.y - b.y) < 320);
    if (d0) { d0.berths.push({ x: b.x, y: b.y }); return; }
    const shore = nearestLand(m, near.x, near.y, 30);   // (past the end of a long pier, maybe)
    if (!shore) return;
    const dd = m.districtAt(shore.x, shore.y), place = dd ? dd.name.replace(/^The /, '') : 'harbour';
    D.push({ x: b.x, y: b.y, berths: [{ x: b.x, y: b.y }], land: near === b ? pierBy(m, b) || shore : { x: near.x, y: near.y }, name: `the ${place} docks` });
  };
  for (const r of m.rentals || []) for (const s of r.spots) add(s, r.dock);
  for (const b of m.marina || []) if (!b.gang) add(b, b);
  DOCKS.set(m, D);
  return D;
}
// the ground nearest a berth someone can step off onto - a pier's planks too - within 6 tiles
function pierBy(m, b) {
  const cx = Math.floor(b.x / TILE), cy = Math.floor(b.y / TILE);
  for (let r = 1; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const t = m.tileAt(cx + dx, cy + dy);
    if (!PED_BLOCK[t] && t !== T.BRIDGE) return { x: (cx + dx + 0.5) * TILE, y: (cy + dy + 0.5) * TILE };
  }
  return null;
}
// the solid things standing in water a boat can be on (the highway's pillars, posts, rocks), once per map
const PROPS = new WeakMap();
function propsIn(m) {
  let P = PROPS.get(m);
  if (!P) { P = []; for (const [i, ps] of m.solidProps || []) if (!BOAT_BLOCK[m.tiles[i]]) P.push(...ps); PROPS.set(m, P); }
  return P;
}
// the boats lying still near (x, y) within r (moored, drifting, wrecked): a way goes round them (wayTo avoid)
function stillBoats(world, x, y, r, not = null) {
  return world.query(x, y, r, K.VEH).filter((q) => q !== not && !q.removed && q.def.kind === 'boat' && !q.ferry && Math.hypot(q.vx, q.vy) < 30);
}
// a berth at the dock with room for the hull (not one of the jet skis' slots between two piers) and nobody tied up
// there - else open water near it - to set out from
function freeBerth(world, m, d) {
  const free = (x, y) => !world.query(x, y, 70, K.VEH).some((q) => !q.removed && Math.hypot(q.x - x, q.y - y) < 70);
  const room = (x, y, r) => { for (let dy = -r; dy <= r; dy += r / 2) for (let dx = -r; dx <= r; dx += r / 2) if (BOAT_BLOCK[m.tileAtPx(x + dx, y + dy)]) return false; return true; };
  for (const b of d.berths) if (room(b.x, b.y, 32) && free(b.x, b.y)) return b;
  for (let r = 80; r <= 400; r += 40) for (let k = 0; k < 12; k++) {
    const x = d.x + Math.cos(k * Math.PI / 6) * r, y = d.y + Math.sin(k * Math.PI / 6) * r;
    if (room(x, y, 40) && free(x, y)) return { x, y };
  }
  return d.berths[0];
}

// ---- the way through the water ----------------------------------------------------------------------------------------
// A* over the tiles a boat can be on, in a box round both ends, dearer next to the shore (a hull keeps off it where
// there's room) and never cutting a corner of land, round the boats in avoid (lying still: moored, drifting); then
// straightened - from each point on to the farthest one in a line that keeps HULL px of water either side. [{x, y}] from
// a to b with .len, or null (no way within the box: other water - a lake, a pool - or too far round). Searching from the
// end on the smaller water fails sooner.
let BUF = null;
const bufs = () => BUF || (BUF = { g: new Float32Array(MAX_CELLS), from: new Int32Array(MAX_CELLS), st: new Uint8Array(MAX_CELLS), blk: new Uint8Array(MAX_CELLS), hf: new Float32Array(MAX_POPS * 3), hi: new Int32Array(MAX_POPS * 3) });
export function wayTo(m, a, b, avoid = null) {
  const W = m.w, H = m.h, ax = Math.floor(a.x / TILE), ay = Math.floor(a.y / TILE), bx = Math.floor(b.x / TILE), by = Math.floor(b.y / TILE);
  if (BOAT_BLOCK[m.tileAt(ax, ay)] || BOAT_BLOCK[m.tileAt(bx, by)]) return null;
  let mg = MARGIN, x0, y0, w, h;
  for (;;) {
    x0 = Math.max(m.x0, Math.min(ax, bx) - mg); y0 = Math.max(m.y0, Math.min(ay, by) - mg);
    w = Math.min(m.x0 + W - 1, Math.max(ax, bx) + mg) - x0 + 1; h = Math.min(m.y0 + H - 1, Math.max(ay, by) + mg) - y0 + 1;
    if (w * h <= MAX_CELLS) break;
    if ((mg -= 4) < 2) return null;
  }
  const { g, from, st, blk, hf, hi } = bufs(), cap = hf.length;
  st.fill(0, 0, w * h); blk.fill(0, 0, w * h);
  const cell = (tx, ty) => (ty - y0) * w + (tx - x0);
  // what's in the water to go round: the boats (the tiles under each hull and a little round it) and the posts, pillars
  // and rocks standing in it (the tiles a hull's half-width round them) - not the ends' own tiles and those by them
  const mark = (x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx >= x0 && ty >= y0 && tx < x0 + w && ty < y0 + h && Math.max(Math.abs(tx - ax), Math.abs(ty - ay)) > 1 && Math.max(Math.abs(tx - bx), Math.abs(ty - by)) > 1) blk[cell(tx, ty)] = 1;
  };
  for (const q of avoid || []) {
    const c = Math.cos(q.a), s = Math.sin(q.a), hl = q.def.L / 2 + 10, hw = q.def.W / 2 + 10;
    for (let u = -hl; u <= hl; u += 12) for (let r = -hw; r <= hw; r += 12) mark(q.x + c * u - s * r, q.y + s * u + c * r);
  }
  for (const p of propsIn(m)) {
    if (p.off || p.x < (x0 - 2) * TILE || p.y < (y0 - 2) * TILE || p.x > (x0 + w + 2) * TILE || p.y > (y0 + h + 2) * TILE) continue;
    const R = p.r + HULL;
    for (let dy = -R; dy <= R; dy += 8) for (let dx = -R; dx <= R; dx += 8) if (dx * dx + dy * dy <= R * R) mark(p.x + dx, p.y + dy);
  }
  const wet = (tx, ty) => m.inside(tx, ty) && !BOAT_BLOCK[m.tiles[m.idx(tx, ty)]] && !(tx >= x0 && ty >= y0 && tx < x0 + w && ty < y0 + h && blk[cell(tx, ty)]);
  const shore = (tx, ty) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !wet(tx + dx, ty + dy)) return true; return false; };
  const hcost = (tx, ty) => { const dx = Math.abs(tx - bx), dy = Math.abs(ty - by); return (dx + dy - 0.586 * Math.min(dx, dy)) * 1.2; };   // (a little greedy)
  let n = 0;
  const push = (f, c) => { if (n >= cap) return; let k = n++; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hi[k] = hi[p]; k = p; } hf[k] = f; hi[k] = c; };
  const pop = () => { const top = hi[0], lf = hf[--n], li = hi[n]; let k = 0; for (;;) { const l = 2 * k + 1; if (l >= n) break; const r = l + 1, q = r < n && hf[r] < hf[l] ? r : l; if (hf[q] >= lf) break; hf[k] = hf[q]; hi[k] = hi[q]; k = q; } hf[k] = lf; hi[k] = li; return top; };
  const s0 = cell(ax, ay), goal = cell(bx, by);
  g[s0] = 0; from[s0] = -1; st[s0] = 1; push(hcost(ax, ay), s0);
  let pops = 0, found = false;
  while (n && pops++ < MAX_POPS) {
    const c = pop();
    if (st[c] === 2) continue;
    st[c] = 2;
    if (c === goal) { found = true; break; }
    const tx = x0 + (c % w), ty = y0 + ((c / w) | 0);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < x0 || ny < y0 || nx >= x0 + w || ny >= y0 + h || !wet(nx, ny)) continue;
      if (dx && dy && (!wet(tx + dx, ty) || !wet(tx, ty + dy))) continue;   // (no cutting a corner of land)
      const j = cell(nx, ny);
      if (st[j] === 2) continue;
      const cj = g[c] + (dx && dy ? 1.414 : 1) * (shore(nx, ny) ? 3 : 1);
      if (st[j] === 1 && cj >= g[j]) continue;
      g[j] = cj; from[j] = c; st[j] = 1; push(cj + hcost(nx, ny), j);
    }
  }
  if (!found) return null;
  const tiles = [];
  for (let c = goal; c >= 0; c = from[c]) { tiles.push({ x: (x0 + (c % w) + 0.5) * TILE, y: (y0 + ((c / w) | 0) + 0.5) * TILE }); if (c === s0) break; }
  tiles.reverse();
  const pts = [{ x: a.x, y: a.y }, ...tiles.slice(1, -1), { x: b.x, y: b.y }];
  const open = (x, y) => wet(Math.floor(x / TILE), Math.floor(y / TILE));
  const line = (p, q) => {
    const L = Math.hypot(q.x - p.x, q.y - p.y) || 1, k = Math.ceil(L / 12), nx = -(q.y - p.y) / L * HULL, ny = (q.x - p.x) / L * HULL;
    for (let i = 1; i < k; i++) { const x = p.x + (q.x - p.x) * i / k, y = p.y + (q.y - p.y) * i / k; if (!open(x, y) || !open(x + nx, y + ny) || !open(x - nx, y - ny)) return false; }
    return true;
  };
  const out = [pts[0]];
  for (let at = 0; at < pts.length - 1;) {
    let next = at + 1;
    for (let k = Math.min(pts.length - 1, at + 60); k > at + 1; k--) if (line(pts[at], pts[k])) { next = k; break; }
    out.push(pts[next]); at = next;
  }
  out.len = 0;
  for (let i = 1; i < out.length; i++) out.len += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
  return out;
}

// Open water out from the dock nearest (x, y) - 500 to 1300 px off, with room round it, and a way there from the dock -
// to go down in (the dev menu; tests).
export function waterSpot(world, x, y) {
  const m = world.map, D = docksOf(m).slice().sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y));
  const wet = (px, py) => { for (const [dx, dy] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]]) if (BOAT_BLOCK[m.tileAtPx(px + dx, py + dy)] || !isSwimming(m, { x: px + dx, y: py + dy })) return false; return true; };
  for (const d of D.slice(0, 3)) {
    for (let r = 500; r <= 1300; r += 200) for (let k = 0; k < 16; k++) {
      const px = d.x + Math.cos(k * Math.PI / 8) * r, py = d.y + Math.sin(k * Math.PI / 8) * r;
      if (wet(px, py) && wayTo(m, freeBerth(world, m, d), { x: px, y: py })) return { x: px, y: py, dock: d.name };
    }
  }
  return null;
}

// ---- sending one ----------------------------------------------------------------------------------------------------------
export function dispatch(world, e, pid = null) {
  const m = world.map;
  if (BOAT_BLOCK[m.tileAtPx(e.x, e.y)]) return null;
  const range = pid ? RANGE : NPC_RANGE;
  const cands = docksOf(m).map((d) => ({ d, r: Math.hypot(d.x - e.x, d.y - e.y) })).filter((c) => c.r < range).sort((p, q) => p.r - q.r);
  // the nearest by water: the nearest few as the crow flies, while one could still be nearer than the best way found
  // (each searched from the dock: a lake's hire dock is soon found to be on other water)
  let best = null;
  for (let k = 0; k < cands.length && k < 3; k++) {
    if (best && cands[k].r >= best.way.len) break;
    const d = cands[k].d, at = freeBerth(world, m, d);
    const way = wayTo(m, at, e, stillBoats(world, (at.x + e.x) / 2, (at.y + e.y) / 2, Math.hypot(at.x - e.x, at.y - e.y) / 2 + 300));
    if (way && (!best || way.len < best.way.len)) best = { d, way };
  }
  if (!best) return null;
  const { d, way } = best, now = world.time, at = way[0];
  const v = world.spawnVehicle('rescueboat', at.x, at.y, Math.atan2(way[1].y - at.y, way[1].x - at.x), {});
  v.despawnable = false; v.npcOwned = true; v.sirenOn = true; v.rescue = true;
  const crew = [0, 1].map((s) => {
    const c = spawnNpc(world, 'rescue', v.x, v.y, 'medic');
    c.vehId = v.id; c.seat = s; v.seats[s] = c.id;
    return c.id;
  });
  v.ai = { kind: 'rescue', body: e.id, paid: pid, mode: 'out', way: rest(way), back: way.slice().reverse(), from: d.name, dock: d, berth: at, crew, since: now, replans: 0 };
  e.emsAssigned = v.id;
  (world.ambulances ??= new Set()).add(v.id);
  return v;
}

// ---- running it ----------------------------------------------------------------------------------------------------------
export function run(world, v, dt, now) {
  const ai = v.ai;
  if (!ai || v.wreckAt || v.dead) { cleanup(world, v); return; }
  const drv = v.seats[0] ? world.get(v.seats[0]) : null;
  if (drv && drv.player) { taken(world, v, ai); return; }
  const crew = ai.crew.map((id) => world.get(id)).filter((c) => c && !c.dead && c.vehId === v.id);
  if (!crew.length) { cleanup(world, v); return; }
  // the one at the wheel shot or gone: the other takes it
  if (!drv) { const c = crew.find((q) => q.seat > 0); if (c) { v.seats[c.seat] = 0; c.seat = 0; v.seats[0] = c.id; } }
  const body = world.get(ai.body);
  if (ai.mode === 'out') out(world, v, ai, body, now);
  else if (ai.mode === 'pull') pull(world, v, ai, body, crew, now);
  else if (ai.mode === 'ashore') ashore(world, v, ai, now);
  else home(world, v, ai, now);
}

// still someone to fetch: down in the water - for the player who called it, still down (not revived, finished or woken up
// at a hospital)
const wanted = (ai, b) => !!(b && b.dead && !b.removed && (!ai.paid || revive.isDowned(b)));
// the one who called it doesn't wake up at a hospital while it's nearly there or pulling them in
function holdClock(ai, b, now) {
  const p = ai.paid && b && b.player;
  if (p && revive.isDowned(b) && p.respawnAt < now + 3) { p.respawnAt = now + 3; p.meDirty = true; }
}
// how far (x, y) is from the hull (0: under it)
function gap(v, x, y) {
  const c = Math.cos(v.a), s = Math.sin(v.a), dx = x - v.x, dy = y - v.y;
  return Math.hypot(Math.max(0, Math.abs(dx * c + dy * s) - v.def.L / 2), Math.max(0, Math.abs(-dx * s + dy * c) - v.def.W / 2));
}

// Out to them along the way, siren on; near them, the way's end becomes the place to stop beside them.
function out(world, v, ai, b, now) {
  v.sirenOn = true; v.beaconOn = false;
  if (!wanted(ai, b)) { goHome(world, v, ai); return; }
  const db = Math.hypot(b.x - v.x, b.y - v.y);
  if (db < 900) holdClock(ai, b, now);
  if (!ai.stop && db < 800) {
    ai.stop = stopBeside(world.map, v, ai.way, b);
    // the way's last stretch: in toward them, straight on to the stop alongside them (a boat turns no tighter than about
    // its own length, so it comes in lined up)
    while (ai.way.length && Math.hypot(ai.way[ai.way.length - 1].x - b.x, ai.way[ai.way.length - 1].y - b.y) < 260) ai.way.pop();
    const S = ai.stop, ax = S.x - Math.cos(S.a) * 160, ay = S.y - Math.sin(S.a) * 160;
    if (Math.hypot(ax - v.x, ay - v.y) > 100) ai.way.push({ x: ax, y: ay });
    ai.way.push({ x: S.x, y: S.y });
  }
  const left = sail(v, ai.way, TOP, ai.stop ? 350 : 0);
  const g = gap(v, b.x, b.y), sp = Math.hypot(v.vx, v.vy), S = ai.stop, c = Math.cos(v.a), s = Math.sin(v.a);
  // past the stop (it came in wide): pull up here if they're within reach, else round again for another run in
  const past = S && left < 140 && (S.x - v.x) * c + (S.y - v.y) * s < 0;
  // them right ahead of the bow: stop before it's over them (and pull them in from there)
  const along = (b.x - v.x) * c + (b.y - v.y) * s, ahead = along > 0 && Math.abs(-(b.x - v.x) * s + (b.y - v.y) * c) < v.def.W / 2 + 8 && along - v.def.L / 2 < 14 + sp * sp / 500;
  // there: at the stop beside them, or alongside them and slow
  if ((S && left < 26) || (g < REACH && sp < 70) || ahead || (past && g < REACH + 16)) { ai.mode = 'pull'; ai.pullAt = 0; halt(v); return; }
  if (past) { ai.stop = null; ai.way = [{ x: b.x, y: b.y }]; }
  // no nearer along the way for a while: a new way from here (twice), then pull them in if they're within reach, or give up
  if (progress(world, ai, left) > 6 || now - ai.since > 160) {
    if (g < 70) { ai.mode = 'pull'; ai.pullAt = 0; return; }
    const w2 = ai.replans < 2 && now - ai.since <= 160 ? wayTo(world.map, v, b, stillBoats(world, v.x, v.y, db / 2 + 300, v)) : null;
    ai.replans++; ai.bestD = undefined;
    if (w2) { ai.way = rest(w2); ai.stop = null; } else { if (ai.paid) revive.helpLost(world, ai.paid, v.id); goHome(world, v, ai); }
  }
}

// Alongside them: held still while the crew member on their side leans over and pulls them in. A player who called it is
// back on their feet aboard (half health, the fee: revive.js) and is run back to the dock; anyone else is taken away.
function pull(world, v, ai, b, crew, now) {
  halt(v); v.vx *= 0.9; v.vy *= 0.9;
  v.sirenOn = false; v.beaconOn = true;
  if (!wanted(ai, b)) { if (b) b.reviving = 0; goHome(world, v, ai); return; }
  holdClock(ai, b, now);
  if (gap(v, b.x, b.y) > 70) { ai.mode = 'out'; ai.stop = null; ai.way = [{ x: b.x, y: b.y }]; b.reviving = 0; return; }   // (drifted off them)
  // the crew member on their side, kneeling at the side facing them (the client draws it: PF.KNEEL)
  const side = Math.sign(-(b.x - v.x) * Math.sin(v.a) + (b.y - v.y) * Math.cos(v.a)) || 1, crewAt = v.def.crew || [];
  const c = crew.find((q) => Math.sign((crewAt[q.seat] || [0, 0])[1]) === side) || crew[crew.length - 1];
  c.kneelUntil = now + 0.5; c.a = Math.atan2(b.y - v.y, b.x - v.x);
  if (!ai.pullAt) { ai.pullAt = now; b.reviving = now; world.emit(b.x, b.y, { e: 'revive', x: b.x, y: b.y, id: b.id }); }
  if (now - ai.pullAt < PULL_S) return;
  b.reviving = 0; b.emsAssigned = 0;
  world.emit(b.x, b.y, { e: 'splash', x: b.x, y: b.y, n: 10 });
  if (b.player) {
    world.bodies.delete(b);
    revive.revive(world, b, { ambulance: true, boat: true });
    const s = v.seats.findIndex((q, k) => k > 1 && !q);
    if (s > 0) {
      b.vehId = v.id; b.seat = s; v.seats[s] = b.id; b.vx = 0; b.vy = 0;
      b.player.meDirty = true;
      ai.rider = b.id; ai.mode = 'ashore'; ai.shoreAt = now; ai.bestD = undefined; ai.replans = 0;
      ai.way = rest(ai.back);
      return;
    }
  } else {
    // anyone else is brought in to the dock and laid on the pier, where an ambulance comes for them as for anyone lying
    // on land (ems.js; ashore, landBody) - with no back seat free, taken away
    world.bodies.delete(b);
    const s = v.seats.findIndex((q, k) => k > 1 && !q);
    if (s > 0) {
      b.vehId = v.id; b.seat = s; v.seats[s] = b.id; b.vx = 0; b.vy = 0;
      ai.rider = b.id; ai.mode = 'ashore'; ai.shoreAt = now; ai.bestD = undefined; ai.replans = 0;
      ai.way = rest(ai.back);
      return;
    }
    if (b.npc) despawnNpc(world, b); else world.remove(b);
  }
  goHome(world, v, ai);
}
// a body brought in, laid on the ground ashore by the dock: one to fetch like anyone lying there (ems.js dispatch) -
// or, the boat stuck far from the dock, taken away
function landBody(world, v, b, ai, now) {
  v.seats[b.seat] = 0; b.vehId = 0; b.seat = undefined;
  const at = ai.dock.land;
  if (Math.hypot(at.x - v.x, at.y - v.y) > 400) { if (b.npc) despawnNpc(world, b); else world.remove(b); return; }
  b.x = at.x; b.y = at.y; world.place(b);
  b.deadAt = now - 3; b.emsAssigned = 0; b.rescueTry = now;
  world.bodies.add(b);
}

// Back to the dock with the one it pulled out, and set them ashore there - or, stuck on the way, wherever it is (over
// the side, if it's still out on the water).
function ashore(world, v, ai, now) {
  v.sirenOn = false; v.beaconOn = true;
  const r = world.get(ai.rider);
  if (!r || r.removed || r.vehId !== v.id) { goHome(world, v, ai); return; }   // (got out on the way)
  const left = sail(v, ai.way, TOP * 0.8);
  let stuck = progress(world, ai, left) > 8 || now - ai.shoreAt > 120;
  // no nearer for a while (turning round by the shore): a new way from here to its berth (twice) before it gives up
  if (stuck && left > 30 && ai.replans < 2 && now - ai.shoreAt <= 120) {
    const to = ai.berth, w2 = wayTo(world.map, v, to, stillBoats(world, v.x, v.y, Math.hypot(to.x - v.x, to.y - v.y) / 2 + 300, v));
    ai.replans++; ai.bestD = undefined;
    if (w2) { ai.way = rest(w2); return; }
  }
  if (left > 30 && !stuck) return;
  halt(v);
  if (Math.abs(vehForwardSpeed(v)) > 30 && !stuck) return;
  if (r.dead) { landBody(world, v, r, ai, now); goHome(world, v, ai); return; }
  vehicles.ejectPed(world, r, false, ai.dock.land);
  if (r.player) world.notify(r.player, inWater(world.map, r) ? 'The rescue boat can\'t get you any nearer - swim for it.' : `You're ashore at ${ai.from}.`, 'good');
  goHome(world, v, ai);
}

// Back to its berth and tied up there, lights off; gone once nobody's watching (or a while after, out of sight).
function goHome(world, v, ai) {
  const b = world.get(ai.body);
  if (b && b.emsAssigned === v.id) b.emsAssigned = 0;
  ai.mode = 'home'; ai.body = 0; ai.paid = null; ai.stop = null; ai.bestD = undefined;
  const to = ai.berth, d = Math.hypot(to.x - v.x, to.y - v.y), w2 = d > 60 && wayTo(world.map, v, to, stillBoats(world, v.x, v.y, d / 2 + 300, v));
  ai.way = w2 ? rest(w2) : [{ x: to.x, y: to.y }];
}
function home(world, v, ai, now) {
  v.sirenOn = false; v.beaconOn = false;
  let seen = inAnyView(world, v.x, v.y, 120);
  if (!seen) for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - v.x, p.ped.y - v.y) < 900) { seen = true; break; }
  if (!seen || (now - ai.since > 300 && !inAnyView(world, v.x, v.y, 40))) { cleanup(world, v); return; }
  const left = sail(v, ai.way, TOP * 0.6);
  if (left < 30 || progress(world, ai, left) > 10) halt(v);
}

// Taken by a player: the crew go over the side and swim for it (npc.js), and whoever called it can call another (a
// body it was bringing in is taken away).
function taken(world, v, ai) {
  const r = world.get(ai.rider);
  if (r && r.dead && r.vehId === v.id) { v.seats[r.seat] = 0; r.vehId = 0; if (r.npc) despawnNpc(world, r); else world.remove(r); }
  for (const id of ai.crew) { const c = world.get(id); if (c && c.npc) { if (c.vehId === v.id) vehicles.ejectPed(world, c, true); c.npc.role = 'civ'; c.npc.state = 'wander'; } }
  const b = world.get(ai.body); if (b && b.emsAssigned === v.id) b.emsAssigned = 0;
  if (ai.paid) revive.helpLost(world, ai.paid, v.id);
  world.ambulances.delete(v.id);
  v.ai = null; v.rescue = false; v.despawnable = true; v.sirenOn = false; v.beaconOn = false;
}

export function recall(world, v) {
  const ai = v.ai;
  if (!ai || ai.mode === 'ashore' || ai.mode === 'home') return;
  const b = world.get(ai.body);
  if (b) b.reviving = 0;
  goHome(world, v, ai);
}

function cleanup(world, v) {
  const ai = v.ai;
  if (ai) for (const id of ai.crew) { const c = world.get(id); if (c && c.npc) despawnNpc(world, c); }
  for (const sid of v.seats) if (sid) { const c = world.get(sid); if (c && c.npc) despawnNpc(world, c); }
  if (ai) { const b = world.get(ai.body); if (b && b.emsAssigned === v.id) b.emsAssigned = 0; }
  world.ambulances.delete(v.id);
  v.beaconOn = false; v.sirenOn = false; v.rescue = false;
  if (!v.seats.some((s) => s && world.get(s)?.player)) world.remove(v);
  else { v.ai = null; v.despawnable = true; }
}

// ---- steering ------------------------------------------------------------------------------------------------------------
// a way to sail from its first point (where it is now): the rest of it, the first as the last point passed
const rest = (w) => { const r = w.slice(1); r.prev = w[0]; return r; };
// Along a way (its points passed are dropped; way.prev the last of them), at up to top px/s - a crawl over the last
// `slow` px of it - slowing for its bends (the sharper, the slower: a boat at speed turns wide) and to stop at its end.
// It steers for a point a little way on along the line from where it is beside it, so it keeps to the line it was
// given (the water either side of it is clear) instead of cutting across to the next point. Returns how far it has to go.
function sail(v, way, top, slow = 0) {
  while (way.length > 1) {
    const p = way[0], q = way[1], d = Math.hypot(p.x - v.x, p.y - v.y);
    const past = (v.x - p.x) * (q.x - p.x) + (v.y - p.y) * (q.y - p.y) > 0;
    if (d < 48 || (past && d < 160)) way.prev = way.shift(); else break;
  }
  const end = way[way.length - 1];
  let left = Math.hypot(way[0].x - v.x, way[0].y - v.y);
  for (let i = 1; i < way.length; i++) left += Math.hypot(way[i].x - way[i - 1].x, way[i].y - way[i - 1].y);
  if (way.length === 1 && Math.hypot(end.x - v.x, end.y - v.y) < 14) { halt(v); return 0; }
  // where it is beside the stretch it's on (from the last point passed to the next)
  let px = v.x, py = v.y;
  const a = way.prev, b = way[0];
  if (a) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((v.x - a.x) * dx + (v.y - a.y) * dy) / L2));
    px = a.x + dx * t; py = a.y + dy * t;
  }
  let look = Math.min(150, 40 + Math.abs(vehForwardSpeed(v)) * 0.25), tx = end.x, ty = end.y;
  for (const q of way) { const d = Math.hypot(q.x - px, q.y - py); if (d >= look) { tx = px + (q.x - px) * look / d; ty = py + (q.y - py) * look / d; break; } look -= d; px = q.x; py = q.y; }
  // the bends ahead: through each at a speed for how sharp it is, braking for it in time
  let sp = Math.min(top, left < slow ? 140 : top, 24 + Math.sqrt(2 * 150 * Math.max(0, left - 12)));
  let d = Math.hypot(way[0].x - v.x, way[0].y - v.y);
  for (let i = 0; i + 1 < way.length && i < 4; i++) {
    const p0 = i ? way[i - 1] : v, p1 = way[i], p2 = way[i + 1];
    const turn = Math.abs(angleDiff(Math.atan2(p1.y - p0.y, p1.x - p0.x), Math.atan2(p2.y - p1.y, p2.x - p1.x)));
    const vc = 120 + 320 * Math.max(0, 1 - turn / 1.2);
    sp = Math.min(sp, Math.sqrt(vc * vc + 2 * 200 * d));
    d += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  steer(v, tx, ty, sp);
  return left;
}
function steer(v, tx, ty, speed) {
  const fwd = vehForwardSpeed(v), diff = angleDiff(v.a, Math.atan2(ty - v.y, tx - v.x));
  // the way on well round to one side or behind it and it's (nearly) stopped - just pulled someone in, or nosed into
  // the shore: it backs round toward it for a moment (up to 1.5 s: v.backN, ticks)
  if (!(v.backN > 0) && ((Math.abs(diff) > 1.1 && Math.abs(fwd) < 20) || (Math.abs(diff) > 2 && fwd < 60))) v.backN = 30;
  if (v.backN > 0) {
    v.backN--;
    if (Math.abs(diff) > 0.5) { v.input = { throttle: -0.7, steer: -Math.sign(diff), hb: false }; return; }
    v.backN = 0;
  }
  const sp = Math.abs(diff) > 1.1 ? Math.min(speed, 150) : speed;
  v.input = { throttle: clamp((sp - fwd) / 90, -1, 1), steer: clamp(diff * 2.4 - (v.av || 0) * 0.15, -1, 1), hb: false };
}
function halt(v) {
  const fwd = vehForwardSpeed(v);
  v.input = { throttle: fwd > 6 ? -1 : fwd < -6 ? 1 : 0, steer: 0, hb: false };
}
// seconds since d (how far it has left to go) last came down by 20 px
function progress(world, ai, d) {
  if (ai.bestD === undefined || d < ai.bestD - 20) { ai.bestD = d; ai.bestAt = world.time; }
  return world.time - ai.bestAt;
}

// Where to stop for them: alongside, facing the way it came in, with them off its left side (where the crew member who
// isn't driving sits) if there's water for the hull there, else off its right; failing both, short of them with the bow
// to them (among rocks: it gets as near as it can, and pulls them in if they're within reach).
function stopBeside(m, v, way, b) {
  let fx = v.x, fy = v.y;
  for (let i = way.length - 1; i >= 0; i--) if (Math.hypot(way[i].x - b.x, way[i].y - b.y) > 170) { fx = way[i].x; fy = way[i].y; break; }
  const L = Math.hypot(b.x - fx, b.y - fy) || 1, ux = (b.x - fx) / L, uy = (b.y - fy) / L, a = Math.atan2(uy, ux), def = v.def;
  const room = (x, y) => {
    for (const [lx, ly] of [[0, 0], [def.L / 2, 0], [-def.L / 2, 0], [def.L / 2 - 8, def.W / 2], [def.L / 2 - 8, -def.W / 2], [-def.L / 2, def.W / 2], [-def.L / 2, -def.W / 2], [0, def.W / 2], [0, -def.W / 2]]) {
      if (BOAT_BLOCK[m.tileAtPx(x + ux * lx - uy * ly, y + uy * lx + ux * ly)]) return false;
    }
    return true;
  };
  const off = def.W / 2 + 16;
  for (const sd of [1, -1]) {   // (its middle off to their right of the way in: they're off its left)
    const x = b.x - ux * def.L * 0.12 - uy * off * sd, y = b.y - uy * def.L * 0.12 + ux * off * sd;
    if (room(x, y)) return { x, y, a };
  }
  return { x: b.x - ux * (def.L / 2 + 22), y: b.y - uy * (def.L / 2 + 22), a };
}
