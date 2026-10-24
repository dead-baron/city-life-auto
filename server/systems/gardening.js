// Gardening at home (H61; the owner, 2026-10-11: "Have we added farm jobs and gardening mechanics yet?"). An owned
// home's yard has a few garden plots (GARDEN.plots), found from the built map - two tiles of open yard side by side, off
// the house, its door and its drive, a little bed of them in the front or side yard, where you see it from the street
// (never behind a house's picture: findSpots) (nothing is added to the map: the
// world's hash stays). At an empty plot of your own: plant the seeds you carry (seed_<crop>: the farm co-op, the market,
// the hardware store); at a growing one: water it (the rain waters them all). A watering lasts GARDEN.waterDays in-game
// days; a plant grows only while it's wet, ripe after its crop's days of wet growing (shared/rules.js GARDEN_CROPS); dry
// GARDEN.wiltDays it wilts (water perks it up - its prize is lost), dry GARDEN.dieDays it dies (clear it and sow again).
// A ripe one picked: its crop's yield in your bag (eat one: it heals; the grocery and the co-op buy them) - and now and
// then a prize one, worth GARDEN.prizeX times as much. The plots live with the home in the profile (prof.garden[homeId])
// and grow while you're away (stepped with the server; what passed while it was down caught up from the wall clock).
// The page only draws them: the 'garden' message lists the plots near you, anyone's (render/farmart.js).
import { TILE, T, WEATHER, DAY_LOOP_S } from '../../shared/constants.js';
import { GARDEN, GARDEN_CROPS } from '../../shared/rules.js';
import { ITEMS, GARDEN_CROP_NAMES } from '../../shared/items.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import { ownedHomes } from './homes.js';

const rng = mulberry32(6161);
export const CROP_IDS = Object.keys(GARDEN_CROPS);   // (the wire's crop index: render/farmart.js)
const DAY = DAY_LOOP_S;
const STEP_TICKS = 40;   // stepped every 2 s
const SEND_TICKS = 20;   // the plots near each player sent (when they changed) every second
const SEE_R = 900;       // px: the gardens a player is sent

// ---- the plots: where they are in a home's yard ----------------------------------------------------------------
const spotCache = new WeakMap();
export function plotSpots(map, h) {
  let per = spotCache.get(map);
  if (!per) spotCache.set(map, (per = new Map()));
  let s = per.get(h.id);
  if (!s) per.set(h.id, (s = findSpots(map, h)));
  return s;
}
const yardTile = (map, tx, ty) => map.inside(tx, ty) && (map.tiles[map.idx(tx, ty)] === T.GRASS || map.tiles[map.idx(tx, ty)] === T.DIRT);
// the props standing in yards (trees, sheds, fences...), bucketed once a map: a plot never goes on one
const propCache = new WeakMap();
function propBuckets(map) {
  let B = propCache.get(map);
  if (B) return B;
  B = new Map();
  for (const q of map.props || []) { if (!q) continue; const k = Math.floor(q.x / 128) * 65536 + Math.floor(q.y / 128); let a = B.get(k); if (!a) B.set(k, (a = [])); a.push(q); }
  propCache.set(map, B);
  return B;
}
function propNear(map, x, y, r) {
  const B = propBuckets(map);
  for (let bx = Math.floor((x - r) / 128); bx <= Math.floor((x + r) / 128); bx++) for (let by = Math.floor((y - r) / 128); by <= Math.floor((y + r) / 128); by++) {
    for (const q of B.get(bx * 65536 + by) || []) if (Math.abs(q.x - x) < r && Math.abs(q.y - y) < r) return true;
  }
  return false;
}
// (the owner, 2026-10-23: "gardening spaces or other home features shouldn't be placed behind the home, they should be
// out and easy to see and access for the home owner") The camera looks north at a 3/4 view: a building's walls and
// roof are drawn up over the ground north of its footprint, so a plot with a building just south of it - its own house
// when it's in the back yard, the next row's when the lots are tight - is behind that picture. HIDE_T tiles: about a
// two-storey house's walls and roof.
const HIDE_T = 5, YARD_PAD = 4;   // (YARD_PAD tiles: how far round its footprint a house's yard is looked for)
const builtAt = (map, tx, ty) => map.inside(tx, ty) && (map.bld[map.idx(tx, ty)] >= 0 || map.tiles[map.idx(tx, ty)] === T.BUILDING);
// how many tiles south of the two-tile bed at (tx, ty) the nearest building is (99: none within reach of hiding it)
function hiddenBy(map, tx, ty) {
  for (let dy = 1; dy <= HIDE_T + 4; dy++) for (let dx = 0; dx <= 1; dx++) if (builtAt(map, tx + dx, ty + dy)) return dy;
  return 99;
}
// a tile beside a street (its pavement or roadway): the lot's edge, its fence or hedge - no bed there
const STREETY = new Set([T.SIDEWALK, T.ROAD, T.BRIDGE]);
function byStreet(map, tx, ty) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 2; dx++) if (map.inside(tx + dx, ty + dy) && STREETY.has(map.tiles[map.idx(tx + dx, ty + dy)])) return true;
  return false;
}
function findSpots(map, h) {
  if (!h || h.gone || h.kind === 'apartment') return [];   // (an apartment has no yard)
  const b = h.b != null ? map.buildings[h.b] : null;
  if (!b) return [];
  const pf = b.prefab >= 0 && map.prefabs ? map.prefabs[b.prefab] : null;
  const mn = !pf && map.mansions ? map.mansions.find((q) => q.tx === b.tx && q.ty === b.ty) : null;
  const lot = pf || (mn && mn.lot) || { tx: b.tx - 3, ty: b.ty - 3, tw: b.tw + 6, th: b.th + 6 };
  const near = (tx, ty) => tx >= b.tx - 1 && tx < b.tx + b.tw + 1 && ty >= b.ty - 1 && ty < b.ty + b.th + 1;   // (a tile's clearance from the walls)
  // (a tile in from the lot's edge: the painted lots have their hedges and fences there)
  const inLot = (tx, ty) => ty >= lot.ty + 1 && ty < lot.ty + lot.th - 1 && tx >= lot.tx + 1 && tx < lot.tx + lot.tw - 2;
  // the house's own yard beyond its lot (a handcrafted house's lot is its footprint and forecourt; its lawns round it):
  // open ground nearer this house than any other building
  const bi = h.b;
  const ours = (tx, ty) => {
    const d = Math.max(b.tx - tx, tx - (b.tx + b.tw - 1), b.ty - ty, ty - (b.ty + b.th - 1), 0);
    for (let yy = ty - d + 1; yy <= ty + d - 1; yy++) for (let xx = tx - d + 1; xx <= tx + d; xx++) {
      if (!map.inside(xx, yy)) continue;
      const j = map.bld[map.idx(xx, yy)];
      if (j >= 0 && j !== bi) return false;
    }
    return true;
  };
  const cands = [];
  const x0 = Math.min(lot.tx + 1, b.tx - YARD_PAD), x1 = Math.max(lot.tx + lot.tw - 2, b.tx + b.tw + YARD_PAD);
  const y0 = Math.min(lot.ty + 1, b.ty - YARD_PAD), y1 = Math.max(lot.ty + lot.th - 1, b.ty + b.th + YARD_PAD);
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    if (!yardTile(map, tx, ty) || !yardTile(map, tx + 1, ty) || near(tx, ty) || near(tx + 1, ty)) continue;
    const lotTile = inLot(tx, ty) && inLot(tx + 1, ty);
    if (!lotTile && (byStreet(map, tx, ty) || !ours(tx, ty) || !ours(tx + 1, ty))) continue;
    const x = (tx + 1) * TILE, y = (ty + 0.5) * TILE;
    if (Math.hypot(x - h.x, y - h.y) < 96) continue;                                  // not by the door
    if (h.garage && Math.hypot(x - h.garage.x, y - h.garage.y) < 110) continue;        // not on the drive
    if (propNear(map, x, y, 26)) continue;
    // (how far you walk to it from the door: round the house to a yard on its far side)
    cands.push({ x, y, d: Math.abs(x - h.x) + Math.abs(y - h.y), hid: hiddenBy(map, tx, ty) });
  }
  if (!cands.length) return [];
  // in sight if the yard has room there (the front yard, a side yard, a back-to-the-camera house's yard to the south);
  // else (a yard that is all behind a house: a terrace's back yard) as far out from behind it as the yard goes
  const seen = cands.filter((c) => c.hid > HIDE_T), most = Math.max(...cands.map((c) => c.hid));
  const pool = seen.length ? seen : cands.filter((c) => c.hid === most);
  // a bed of them: the first the nearest walk from the door, the rest beside it
  pool.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x);
  const a = pool[0];
  pool.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y) || p.y - q.y || p.x - q.x);
  const out = [];
  for (const c of pool) {
    if (out.length >= GARDEN.plots) break;
    if (out.some((o) => Math.abs(o.x - c.x) < 68 && Math.abs(o.y - c.y) < 40)) continue;
    if (Math.hypot(c.x - a.x, c.y - a.y) > 260) break;
    out.push({ x: c.x, y: c.y });
  }
  return out;
}

// ---- the garden on the profile ------------------------------------------------------------------------------------
// prof.garden[homeId] = { at: the wall clock it was last stepped (ms), plots: [null | plot] }; a plot:
// { c: crop, g: growth 0..1 (ripe at 1), m: moisture 0..1, d: s dry, p: prize, dead }
export function gardenOf(prof, homeId, n = 0) {
  if (!prof) return null;
  const all = prof.garden || null;
  let gd = all && all[homeId];
  if (!gd && n > 0) { gd = { at: Date.now(), plots: [] }; (prof.garden ||= {})[homeId] = gd; }
  if (gd) while (gd.plots.length < n) gd.plots.push(null);
  return gd || null;
}
// A plant's day: wet, it grows (its crop's days of it to ripen) and dries out (a watering lasts GARDEN.waterDays); dry,
// it wilts and in the end dies. A ripe one waits to be picked. (dt in seconds: a tick's, or the hours the server was down)
export function stepPlot(q, dt, rain) {
  if (!q || q.dead || q.g >= 1 || dt <= 0) return;
  if (rain) { q.m = 1; q.d = 0; }
  const wetS = GARDEN.waterDays * DAY, grow = (GARDEN_CROPS[q.c] ? GARDEN_CROPS[q.c].days : 1.5) * DAY;
  const wet = Math.min(dt, q.m * wetS);
  q.g = Math.min(1, q.g + wet / grow);
  q.m = Math.max(0, q.m - dt / wetS);
  if (q.m <= 0) q.d += dt - wet; else q.d = 0;
  if (q.d >= GARDEN.wiltDays * DAY) q.p = false;   // (wilted: no prize)
  if (q.d >= GARDEN.dieDays * DAY) q.dead = true;
}
export const wilted = (q) => !!q && !q.dead && q.g < 1 && q.d >= GARDEN.wiltDays * DAY;
// 0 seed, 1 sprout, 2 young, 3 grown (in flower), 4 ripe
export const stageOf = (q) => (q.g >= 1 ? 4 : q.g < 0.12 ? 0 : q.g < 0.4 ? 1 : q.g < 0.75 ? 2 : 3);

function stepAll(world, dt, rain) {
  const now = Date.now();
  for (const [hid, pid] of world.homeOwner || []) {
    const prof = store.get(pid), gd = prof && prof.garden && prof.garden[hid];
    if (!gd) continue;
    for (const q of gd.plots) stepPlot(q, dt, rain);
    gd.at = now;
  }
}
// (tests and the dev menu: as if seconds passed)
export function advance(world, seconds, rain = false) { stepAll(world, seconds, rain); store.touch(); }

export function update(world) {
  if (world.tick % STEP_TICKS === 7) {
    if (world.gardenAt === undefined) {
      // the first step: what passed while the server was down, from each garden's wall clock (no rain then)
      const now = Date.now();
      for (const [hid, pid] of world.homeOwner || []) {
        const prof = store.get(pid), gd = prof && prof.garden && prof.garden[hid];
        if (gd && gd.at && now - gd.at > 10000) for (const q of gd.plots) stepPlot(q, (now - gd.at) / 1000, false);
      }
      world.gardenAt = world.time;
    }
    const dt = world.time - world.gardenAt;
    world.gardenAt = world.time;
    if (dt > 0) stepAll(world, dt, world.weather === WEATHER.RAIN);
  }
  if (world.tick % SEND_TICKS === 11) for (const p of world.players.values()) sendNear(world, p);
}

// ---- what the page draws: the plots near you (anyone's) ---------------------------------------------------------------
// [x, y, crop (CROP_IDS; -1 empty), stage, flags: 1 dry, 2 wilted, 4 dead, 8 a prize one (ripe)]
export function nearPlots(world, x, y, r = SEE_R) {
  const out = [];
  for (const [hid, pid] of world.homeOwner || []) {
    const h = world.map.homes[hid];
    if (!h || Math.abs(h.x - x) > r + 300 || Math.abs(h.y - y) > r + 300) continue;
    const spots = plotSpots(world.map, h);
    if (!spots.length) continue;
    const prof = store.get(pid), gd = prof && prof.garden && prof.garden[hid];
    spots.forEach((s, i) => {
      const q = gd && gd.plots[i];
      if (!q) { out.push([s.x, s.y, -1, 0, 0]); return; }
      const fl = (q.m <= 0 ? 1 : 0) | (wilted(q) ? 2 : 0) | (q.dead ? 4 : 0) | (q.p && q.g >= 1 ? 8 : 0);
      out.push([s.x, s.y, CROP_IDS.indexOf(q.c), stageOf(q), fl]);
    });
  }
  return out;
}
function sendNear(world, p) {
  const ped = p.ped;
  if (!p.conn || !ped) return;
  const list = ped.hidden ? [] : nearPlots(world, ped.x, ped.y);
  const sig = list.length ? JSON.stringify(list) : '';
  if (sig === (p.gardenSig || '')) return;
  p.gardenSig = sig;
  p.conn.sendJSON({ t: 'garden', g: list });
}

// ---- working a plot ---------------------------------------------------------------------------------------------------
// your own plot within reach of you on foot: { h, i, s (its spot), gd }
export function plotNear(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden) return null;
  let best = null, bd = GARDEN.reach;
  for (const h of ownedHomes(world, p.profile)) {
    if (!h || Math.abs(h.x - ped.x) > 700 || Math.abs(h.y - ped.y) > 700) continue;
    plotSpots(world.map, h).forEach((s, i) => { const d = Math.hypot(s.x - ped.x, s.y - ped.y); if (d < bd) { bd = d; best = { h, i, s }; } });
  }
  if (best) best.gd = gardenOf(p.profile, best.h.id, plotSpots(world.map, best.h).length);
  return best;
}
// the seeds you'd plant: the first kind you carry
const seedsHeld = (prof) => CROP_IDS.find((c) => (prof.inventory[`seed_${c}`] || 0) > 0) || null;
const cropName = (c) => (GARDEN_CROP_NAMES[c] || c).toLowerCase();

export function interaction(world, p) {
  const at = plotNear(world, p);
  if (!at) return null;
  const q = at.gd.plots[at.i];
  if (!q) {
    const c = seedsHeld(p.profile);
    return c ? { label: `Plant ${cropName(c)} seeds`, run: () => plant(world, p, c) } : { label: 'An empty garden plot - buy seeds at the farm co-op', run: () => world.notify(p, 'Seeds: the farm co-op\'s counter, the Old Town market or the hardware store. Plant them here, water them, and they grow over a day or two.', 'info') };
  }
  const name = cropName(q.c);
  if (q.dead) return { label: `Clear the dead ${name}`, run: () => clearPlot(world, p) };
  if (q.g >= 1) return { label: q.p ? `Pick the ${name} - a prize one!` : `Pick the ${name}`, run: () => harvest(world, p) };
  if (q.m < 0.5) return { label: wilted(q) ? `Water the wilting ${name}` : `Water the ${name}`, run: () => water(world, p) };
  return { label: `${GARDEN_CROP_NAMES[q.c] || name} growing - ${Math.round(q.g * 100)}% (watered)`, run: () => world.notify(p, `It's watered - it grows while it's wet, rain or shine. Ripe in about ${Math.max(1, Math.round((1 - q.g) * GARDEN_CROPS[q.c].days * DAY / 60))} minutes of growing.`, 'info') };
}

function face(p, s) { const ped = p.ped; ped.a = Math.atan2(s.y - ped.y, s.x - ped.x); }
function done(world, p) { p.meDirty = true; p.gardenSig = null; store.touch(); }

export function plant(world, p, crop = null) {
  const at = plotNear(world, p);
  if (!at) return 'Stand at one of your garden plots.';
  if (at.gd.plots[at.i]) return 'Something is growing there already.';
  const inv = p.profile.inventory, c = crop && (inv[`seed_${crop}`] || 0) > 0 ? crop : seedsHeld(p.profile);
  if (!c) { world.notify(p, 'You have no seeds - the farm co-op sells them.', 'warn'); return 'no seeds'; }
  inv[`seed_${c}`]--;
  at.gd.plots[at.i] = { c, g: 0, m: 0.6, d: 0, p: rng() < GARDEN.prize, dead: false };
  at.gd.at = Date.now();
  face(p, at.s);
  world.notify(p, `You sow the ${cropName(c)} seeds. Keep them watered (or let the rain) - ripe in about ${Math.round(GARDEN_CROPS[c].days * DAY / 60)} minutes of growing.`, 'good');
  done(world, p);
  return null;
}

export function water(world, p) {
  const at = plotNear(world, p), q = at && at.gd.plots[at.i];
  if (!q || q.dead || q.g >= 1) return 'Nothing here needs water.';
  const was = wilted(q);
  q.m = 1; q.d = 0;
  face(p, at.s);
  world.emit(at.s.x, at.s.y, { e: 'splash', x: at.s.x, y: at.s.y, n: 4 });
  world.notify(p, was ? `The ${cropName(q.c)} perk up with a drink.` : `You water the ${cropName(q.c)}.`, 'good');
  done(world, p);
  return null;
}

export function harvest(world, p) {
  const at = plotNear(world, p), q = at && at.gd.plots[at.i];
  if (!q || q.dead || q.g < 1) return 'Nothing ripe here.';
  const n = GARDEN_CROPS[q.c].yield, inv = p.profile.inventory;
  const id = q.p ? `prize_${q.c}` : q.c;
  inv[id] = (inv[id] || 0) + (q.p ? 1 : n);
  if (q.p && n > 1) inv[q.c] = (inv[q.c] || 0) + n - 1;
  at.gd.plots[at.i] = null;
  face(p, at.s);
  world.notify(p, q.p ? `A prize ${cropName(q.c)}! ${ITEMS[id].name} - worth $${ITEMS[id].sell} at the grocery or the co-op${n > 1 ? `, and ${n - 1} more besides` : ''}.` : `You pick ${n} ${ITEMS[q.c].name}${n > 1 ? 's' : ''}. Eat one for a little health, or sell them at the grocery or the farm co-op.`, 'good');
  done(world, p);
  return null;
}

export function clearPlot(world, p) {
  const at = plotNear(world, p), q = at && at.gd.plots[at.i];
  if (!q) return 'Nothing to clear.';
  at.gd.plots[at.i] = null;
  face(p, at.s);
  world.notify(p, 'You pull up the dead plant. The plot is ready for new seeds.', 'info');
  done(world, p);
  return null;
}

// ---- dev ('garden'): a garden of your own - the nearest house with a yard bought for you, its plots planted at every
// stage (a seed, a sprout, one in flower, one ripe and a prize); msg.k 'ripe': everything in your gardens ripe
export function devGarden(world, p, msg, buy) {
  const ped = p.ped, prof = p.profile;
  if (!ped) return 'no body';
  if (msg && msg.k === 'ripe') {
    for (const h of ownedHomes(world, prof)) { const gd = gardenOf(prof, h.id); if (gd) for (const q of gd.plots) if (q && !q.dead) { q.g = 1; q.m = 1; q.d = 0; } }
    p.gardenSig = null;
    return null;
  }
  if (ped.vehId || ped.hidden) return 'Get out of the vehicle first (and outside).';   // (it takes you to the plots: a seated body moved without its vehicle - H69)
  let h = ownedHomes(world, prof).find((q) => plotSpots(world.map, q).length >= 3 && Math.hypot(q.x - ped.x, q.y - ped.y) < 3000);
  if (!h) {
    h = world.map.homes.filter((q) => q && !q.gone && !world.homeOwner.has(q.id) && plotSpots(world.map, q).length >= 3).sort((a, b) => Math.hypot(a.x - ped.x, a.y - ped.y) - Math.hypot(b.x - ped.x, b.y - ped.y))[0];
    if (!h) return 'no free house with a yard';
    const err = buy(world, p, h, () => true);
    if (err) return err;
  }
  const spots = plotSpots(world.map, h), gd = gardenOf(prof, h.id, spots.length);
  const set = [['tomato', 0.05, 1, false], ['carrot', 0.3, 1, false], ['tomato', 0.9, 1, false], ['pumpkin', 1, 1, true]];
  spots.forEach((s, i) => { const [c, g, m, pz] = set[i % set.length]; gd.plots[i] = { c, g, m, d: 0, p: pz, dead: false }; });
  if (spots.length >= 3) gd.plots[1] = { c: 'lettuce', g: 0.6, m: 0, d: GARDEN.wiltDays * DAY, p: false, dead: false };   // (a wilting one)
  for (const c of CROP_IDS) prof.inventory[`seed_${c}`] = (prof.inventory[`seed_${c}`] || 0) + 2;
  ped.x = spots[0].x; ped.y = spots[0].y + 30; world.place(ped);
  p.gardenSig = null;
  world.notify(p, `[dev] ${h.name}'s garden: ${spots.length} plots, planted at every stage, and seeds in your bag.`, 'info');
  return null;
}
