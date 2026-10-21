// Wildlife: the animals of the open country (shared/fauna.js says who they are), and what counts as the open
// country for the people and traffic systems.
//
// Where they live: each spawn point is read for its habitat (habitatAt: the redwoods, forest, meadow, scrub,
// desert, the mountains and their cliffs, farmland, the creeks, rivers, lakes and marshes, the kelp off the
// rocky coves, the beaver ponds) and an animal that belongs there comes in from out of sight - weighted by how
// much it likes the place and whether it is its time of day (deer and elk at dawn and dusk, raccoons and
// coyotes at night, the birds by day). They come as they live: a herd with a lead animal, a mother with her young
// (fawns, calves, cubs, kits, ducklings), a covey of quail (cock, hen and a string of chicks), a pair, alone.
// Now and then one is born pure white and glowing: a legendary animal, warier and tougher, worth a fortune.
//
// How they behave: they live a day - graze, browse, root and peck their way about their patch, wander off to
// drink, bed down when it isn't their hour - and they sense you: by sight (less at night, more if you move fast,
// almost not at all if you creep: walk slowly, aim and stalk), by sound (running, a car, a gunshot - not a bow),
// and by smell when you're upwind of them (world.wind). What they do about it is their temper (fauna.js):
// skittish ones freeze, then bolt with the herd; wary ones stare, then move off; curious ones watch and follow a
// little; elusive predators slink away; a sow with cubs, a moose, a goose with goslings warns, bluff-charges and
// attacks if you don't back off; a grizzly charges. Now and then, when the conditions are right (dusk or night,
// you alone and on foot), a cougar or a bear decides you're prey: it stalks you from behind, keeps out of your
// sight, and rushes you. Beavers work their pond (the dam, the lodge, gnawing down trees on the bank) and slap
// and dive when alarmed; otters swim and dive; ducks and geese paddle and take off; pheasants flush; quail
// scatter and call each other back to the hen; squirrels run up a tree.
//
// And they hunt each other (Nature-A2: "the hunt", below): a cougar creeps up on a deer and springs, a pack of wolves
// runs one down, a coyote or a bobcat goes after a rabbit, a fox pounces on mice in the long grass, a heron spears
// fish in the shallows, a bear grabs salmon in the white water under a falls, an otter dives for fish and eats them on
// the bank, an osprey drops into the lake and lifts off with one, an eagle stoops on a rabbit and carries it off. The
// prey watch for their hunters as they watch for you. Never a pet, the farms' stock, the park's ducks, a legend or a
// person - and never right in front of anyone: someone close by and it waits, or gives it up.
//
// Hit: they flinch, stagger, are knocked off their feet like people (reactions.js), limp when badly hurt and
// leave a blood trail you can follow; the dangerous ones may turn and come at you. Every hit is noted for the
// grade of the hide (fauna.js gradeOf; hunting.js). The farms' livestock (cows, sheep, horses, goats, pigs) just
// graze round the farms and lumber off.
import { K, T, TILE, PED_RADIUS } from '../../shared/constants.js';
import { PED_BLOCK, SWIM_BLOCK, WATER_T, DISTRICTS, wildBiome } from '../../shared/map.js';
import { pedStep, PED } from '../../shared/physics.js';
import { circleVsObb } from '../../shared/math.js';
import { sameLevel } from '../../shared/levels.js';
import { mulberry32 } from '../../shared/rng.js';
import { SPECIES, YOUNG_SCALE, APOSE, PREDATORS_OF, SIZE_ORDER, huntClass, gradeOf } from '../../shared/fauna.js';
import { inAnyView } from '../view.js';
import * as players from './players.js';
import * as combat from './combat.js';
import * as hunting from './hunting.js';
import * as events from './events.js';
import { FLY } from '../../shared/flight.js';   // (an aircraft up in the air: over all this, untouched)

const rng = mulberry32(5150);

// ---- the farms' livestock (not game: hunting.js) -----------------------------------------------------------------
export const LIVESTOCK = {
  cow:   { hp: 160, walk: 28, run: 120, alert: 80, herd: [2, 4], graze: true },
  sheep: { hp: 70, walk: 30, run: 150, alert: 110, herd: [3, 5], graze: true },
  horse: { hp: 150, walk: 40, run: 280, alert: 120, herd: [1, 3], graze: true },
  goat:  { hp: 60, walk: 35, run: 180, alert: 120, herd: [2, 3], graze: true },
  pig:   { hp: 90, walk: 25, run: 110, alert: 70, herd: [2, 3] },
};
// (the old table, still read by a few systems for hp and speeds)
export const WILD_KINDS = Object.fromEntries([...Object.entries(SPECIES).map(([k, S]) => [k, { hp: S.hp, walk: S.walk, run: S.run, alert: S.sense.sight * 0.6, herd: S.group.n }]), ...Object.entries(LIVESTOCK)]);

const TARGET = 11;          // animals round a player out in the wilds
const NEAR_R = 1500;        // ...counted within this
const MAX_WILD = 96;        // in the whole world
const DESPAWN_R = 2000;     // nobody this close (and nobody looking at it): cleared away
const CARCASS_S = 300;      // a carcass stays this long once nobody's looking (time to come back and skin it)
const LEASH = 420;          // a group keeps to its patch
const FARM_R = 640;         // livestock graze this close to a farm
const GROUND = new Set([T.GRASS, T.DIRT, T.SAND, T.FIELD]);
const SIZE_R = { tiny: 5, small: 8, medium: 11, large: 14, huge: 17 };
const BLEED_HP = { tiny: 0.6, small: 0.9, medium: 1.3, large: 1.9, huge: 2.4 };   // hp a second a bleeding animal loses
const SMALL_ISLES = new Set([15, 19, 20, 21, 22, 43, 44, 45]);   // Smuggler's Rock, the lighthouse rock, the islets, the Gull Isles, the cays
const KELP_SITES = ['cove', 'redwoodcove', 'tidepools', 'coastfalls', 'granitecove'];

// ---- the open country -----------------------------------------------------------------------------------------
// The wild style at (x, y) - 'wild' (woods, hills, islets), 'rural' (farmland and the country airstrip) or 'desert'
// - or null in town (and at the big airport, out on the water, on Smuggler's Rock).
export function wildStyle(map, x, y) {
  const d = map.districtAt(x, y), s = d && d.style;
  return s === 'wild' || s === 'rural' || s === 'desert' ? s : s === 'airport' && d.tier === 'rural' ? 'rural' : null;
}

// Where people belong out in the wilds (the map's country sites, its farms and farm fields, the homes, shops and
// filling stations out there, the country airstrip), worked out once per map: [{ kind, x, y }].
const SITE_KIND = { camp: 'camp', stop: 'stop', quarry: 'work', oil: 'work', wind: 'work', solar: 'work', mast: 'work', observatory: 'work', drivein: 'venue', raceway: 'venue' };
const POI_KIND = { farm: 'farm', home: 'home', convenience: 'shop', station: 'shop', delivery: 'shop', bank: 'shop', atm: 'shop', airport: 'air' };
export function wildPlaces(map) {
  if (map._wildPlaces) return map._wildPlaces;
  const out = [];
  for (const l of map.landmarks || []) { const k = SITE_KIND[l.type]; if (k) out.push({ kind: k, x: l.x + (l.w || 0) / 2, y: l.y + (l.h || 0) / 2 }); }
  for (const p of map.pois || []) { const k = POI_KIND[p.kind]; if (k && wildStyle(map, p.x, p.y)) out.push({ kind: k, x: p.x, y: p.y }); }
  for (const f of map.fields || []) if (wildStyle(map, f.x + f.w / 2, f.y + f.h / 2)) out.push({ kind: 'farm', x: f.x + f.w / 2, y: f.y + f.h / 2 });
  for (const q of map.natureSites || []) if (q.kind === 'pasture' && wildStyle(map, q.x, q.y)) out.push({ kind: 'farm', x: q.x, y: q.y });
  Object.defineProperty(map, '_wildPlaces', { value: out, enumerable: false, configurable: true });
  return out;
}
// the nearest farm within r (the map's farm POIs, listed once per map)
const FARMS = new WeakMap();
function farmNear(map, x, y, r) {
  let fs = FARMS.get(map);
  if (!fs) FARMS.set(map, fs = (map.pois || []).filter((q) => q.kind === 'farm'));
  let best = null, bd = r * r;
  for (const q of fs) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } }
  return best;
}
export function placeNear(map, x, y, r) {
  let best = null, bd = r * r;
  for (const q of wildPlaces(map)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } }
  return best;
}

// ---- habitat ----------------------------------------------------------------------------------------------------
// The habitat tags at a point (fauna.js HABITATS) - an object tag -> 1. On fresh water: river / creek / lake / pond
// / marsh; at sea: sea (and kelp off the rocky coves); on land: what the ground is, and what water and rock are near.
const at = (map, tx, ty) => (!map.inside(tx, ty) ? -1 : map.idx(tx, ty));
export function habitatAt(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), i = at(map, tx, ty);
  const tags = {};
  if (i < 0) return tags;
  const t = map.tiles[i], d = map.dist[i];
  if (WATER_T[t]) {
    if (map.lake[i]) { tags.water = 1; tags[lakeBig(map, tx, ty) ? 'lake' : 'pond'] = 1; if (marshy(map, tx, ty)) tags.marsh = 1; }
    else if (map.river[i]) { tags.water = 1; tags[narrow(map, tx, ty) ? 'creek' : 'river'] = 1; }
    else { tags.sea = 1; if (kelpAt(map, x, y)) tags.kelp = 1; }
    if (beaverAt(map, x, y)) tags.beaver = 1;
    return tags;
  }
  const style = wildStyle(map, x, y), D = DISTRICTS[d];
  if (!style) { if (D && D.style === 'park') tags.park = 1; return tags; }
  if (SMALL_ISLES.has(d)) tags.isle = 1;
  const cls = map.terrainCls && map.terrainCls.at ? wildBiome(d, map.terrainCls.at(tx, ty)) : 0;
  if (style === 'desert' || cls === 3) tags.desert = 1;
  else if (style === 'rural') tags.farm = 1;
  if (d === 33 || cls === 4 || cls === 9) tags.mountain = 1;   // (9: World v3's snowfields)
  if (cls === 2) { tags.forest = 1; if (d === 29 || d === 47) tags.redwood = 1; }   // (47: World v3's Highland Woods)
  else if (cls === 0 && style === 'wild') tags.meadow = 1;
  if (cls === 1) tags.scrub = 1;
  if (gladeAt(map, x, y)) { tags.glade = 1; tags.meadow = 1; }   // (World v3's woods' hidden glades: the deer and elk come to them)
  // water and rock round about (every other tile out to 8)
  let water = 0, rock = 0;
  for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) {
    const j = at(map, tx + dx, ty + dy);
    if (j < 0) continue;
    const tt = map.tiles[j];
    if (tt === T.WALL) rock++;
    else if (WATER_T[tt] && (map.lake[j] || map.river[j])) water++;
  }
  if (water) tags.water = 1;
  if (rock >= 4) tags.cliff = 1;
  if (beaverAt(map, x, y)) tags.beaver = 1;
  return tags;
}
function lakeBig(map, tx, ty) { let n = 0; for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) { const j = at(map, tx + dx, ty + dy); if (j >= 0 && map.lake[j]) n++; } return n >= 18; }
function narrow(map, tx, ty) { let n = 0; for (let k = -4; k <= 4; k++) { const a = at(map, tx + k, ty), b = at(map, tx, ty + k); if (a >= 0 && WATER_T[map.tiles[a]]) n++; if (b >= 0 && WATER_T[map.tiles[b]]) n++; } return n < 11; }
// a glade of the woods' (map.natureSites kind 'glade': shared/world3-trails.js) round (x, y) px
function gladeAt(map, x, y) {
  if (!map._glades) Object.defineProperty(map, '_glades', { value: (map.natureSites || []).filter((q) => q.kind === 'glade'), enumerable: false, configurable: true });
  for (const g of map._glades) if (Math.abs(g.x - x) < g.r && Math.abs(g.y - y) < g.r && Math.hypot(g.x - x, g.y - y) < g.r) return true;
  return false;
}
function marshy(map, tx, ty) { return (map.natureSites || []).some((q) => q.kind === 'marsh' && Math.hypot(q.x - tx * TILE, q.y - ty * TILE) < 900); }
function kelpAt(map, x, y) {
  if (!map._kelp) Object.defineProperty(map, '_kelp', { value: (map.natureSites || []).filter((q) => KELP_SITES.includes(q.kind)).map((q) => ({ x: q.x, y: q.y })), enumerable: false, configurable: true });
  return map._kelp.some((q) => Math.hypot(q.x - x, q.y - y) < 1100) && (map.distSea[map.idx(Math.floor(x / TILE), Math.floor(y / TILE))] | 0) === 0;
}
function beaverAt(map, x, y) { return (map.beaverPonds || []).some((b) => Math.hypot(b.x - x, b.y - y) < (b.r || 260)); }

// ---- time and light ---------------------------------------------------------------------------------------------
function phaseOf(world) {
  const c = world.clock, m = c.minutes;
  return { dark: c.dark, night: c.isNight, dawnDusk: (m > 330 && m < 470) || (m > 1080 && m < 1230) };
}
// how much a species is about at this hour (0..1)
function activity(S, ph) {
  switch (S.active) {
    case 'day': return ph.night ? 0.15 : 1;
    case 'night': return ph.night ? 1 : ph.dawnDusk ? 0.6 : 0.25;
    case 'dawn-dusk': return ph.dawnDusk ? 1 : ph.night ? 0.55 : 0.6;
    default: return 1;
  }
}

// ---- spawning ---------------------------------------------------------------------------------------------------
const isAnimal = (e) => e.kind === K.PED && !!e.wild && !e.removed;
function pick(list) {
  let total = 0;
  for (const [, w] of list) total += w;
  if (total <= 0) return null;
  let r = rng() * total;
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return list[0][0];
}
const ground = (map, x, y) => GROUND.has(map.tileAtPx(x, y)) && !PED_BLOCK[map.tileAtPx(x, y)];
const wet = (map, x, y) => WATER_T[map.tileAtPx(x, y)] === 1;

// Make one animal. o: { herd, young, legend, mother, tame (a town park's: used to people) }
export function spawnAnimal(world, kind, x, y, herd = 0, o = {}) {
  const S = SPECIES[kind], L = LIVESTOCK[kind];
  const young = !!o.young && !!S, legend = !!o.legend && !!S;
  const hp = S ? Math.round(S.hp * (young ? 0.4 : 1) * (legend ? 1.7 : 1)) : (L || LIVESTOCK.cow).hp;
  const a = world.spawnPed(x, y, { hp, archetype: `pet:${kind}${young ? ':y' : legend ? ':L' : ''}`, a: rng() * 6.28, app: { bd: 1 }, name: S ? (legend ? S.legend.name.replace(/^the /, 'The ') : `a ${S.name.toLowerCase()}`) : `a ${kind}` });
  a.r = S ? Math.round(SIZE_R[S.size] * (young ? 0.7 : 1)) : 12;
  a.bornAt = world.time;
  a.wild = {
    kind, state: 'idle', until: world.time + rng() * 4, wx: x, wy: y, hx: x, hy: y, herd, look: 0, fx: 0, fy: 0,
    aware: 0, threat: 0, pose: 0, hits: [], young, legend, mother: o.mother || 0, lead: !!o.lead, livestock: !S,
    think: world.time + rng() * 0.3, rest: false, predator: false, stalkOf: 0, nextBite: 0, bluffs: 0, tame: !!o.tame,
  };
  if (S && S.predatory && !young) a.wild.predator = rng() < S.predatory;   // (decided once: it may see a lone walker as prey)
  if (S && S.soars) { a.wild.state = 'soar'; a.wild.until = world.time + 20 + rng() * 25; a.wild.home = { x, y }; }   // (a bird of prey: up in the air)
  if (S && (S.hunts || S.fishes || S.mouses)) a.wild.nextHunt = world.time + 4 + rng() * 10;   // (just come: it settles in before it hunts)
  return a;
}

// a group of a species at (x, y), as it lives
export function spawnGroup(world, kind, x, y, legendOk = false, tame = false) {
  const S = SPECIES[kind], G = S.group;
  const herd = (world.nextHerd = (world.nextHerd || 0) + 1);
  const n = G.n[0] + Math.floor(rng() * (G.n[1] - G.n[0] + 1));
  const legend = legendOk && S.legend && rng() < S.legend.p && !legendAbout(world, kind);
  // (on the water if it lives on it and was put there; else on dry ground)
  const onWater = S.swims === 'float' || (!!S.swims && wet(world.map, x, y));
  const okAt = (ax, ay) => (S.soars ? true : onWater ? wet(world.map, ax, ay) : ground(world.map, ax, ay));   // (a bird of prey: anywhere, up there)
  let made = 0, lead = null;
  const adults = legend ? 1 : n;
  for (let i = 0; i < adults * 4 && made < adults; i++) {
    const ax = x + (rng() - 0.5) * 80, ay = y + (rng() - 0.5) * 80;
    if (!okAt(ax, ay)) continue;
    const a = spawnAnimal(world, kind, ax, ay, herd, { legend: legend && made === 0, lead: made === 0, tame });
    a.wild.hx = x; a.wild.hy = y;
    if (made === 0) lead = a;
    made++;
  }
  // the young, close by their mother
  if (lead && G.young && !legend && rng() < (G.youngP || 0)) {
    const k = G.brood ? G.brood[0] + Math.floor(rng() * (G.brood[1] - G.brood[0] + 1)) : 1 + (rng() < 0.4 ? 1 : 0);
    for (let j = 0; j < k; j++) {
      const ax = lead.x + (rng() - 0.5) * 40, ay = lead.y + (rng() - 0.5) * 40;
      if (!okAt(ax, ay) && !ground(world.map, ax, ay)) continue;
      const y2 = spawnAnimal(world, kind, ax, ay, herd, { young: true, mother: lead.id, tame });
      y2.wild.hx = x; y2.wild.hy = y;
      made++;
    }
    lead.wild.withYoung = true;
  }
  if (legend && lead) {
    world.legendAt = { kind, id: lead.id, t: world.time };
    // word gets round: a sighting in the city feed (where, not exactly where)
    events.feed(world, { kind: 'news', text: `Hunters report a pure white ${S.name.toLowerCase()} - ${S.legend.name} - seen in the wilds`, x: x + (rng() - 0.5) * 900, y: y + (rng() - 0.5) * 900 });
  }
  return made;
}
const legendAbout = (world, kind) => world.legendAt && world.get(world.legendAt.id) && !world.get(world.legendAt.id).dead;

// ---- the town's ponds' ducks (2026-10-18, the owner: "ducks") -----------------------------------------------------
// The still water of the town's ponds and lakes (the Commons Pond, Greenfield Pond, the Stadium Ponds, ...), worked out
// once per map: every fourth tile of a lake or a pond in a town district (not a swimming pool), gathered by 24-tile
// patches - [{ x, y, pts }]
// (px: the patch's middle and up to eight of its water's tiles)
const PONDS = new WeakMap();
const TOWNISH = (D) => D && D.style !== 'wild' && D.style !== 'rural' && D.style !== 'desert';
export function parkPonds(map) {
  let out = PONDS.get(map);
  if (out) return out;
  const cells = new Map();
  if (map.lake) for (let ty = map.y0 | 0; ty < (map.y0 | 0) + map.h; ty += 4) for (let tx = map.x0 | 0; tx < (map.x0 | 0) + map.w; tx += 4) {
    const i = map.idx(tx, ty);
    if (!map.lake[i] || !WATER_T[map.tiles[i]] || !TOWNISH(DISTRICTS[map.dist[i]])) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if ((map.pools || []).some((r) => !r.ring && x >= r.x - 32 && x < r.x + r.w + 32 && y >= r.y - 32 && y < r.y + r.h + 32)) continue;   // (not a swimming pool)
    const k = Math.floor(ty / 24) * 65536 + Math.floor(tx / 24);
    let c = cells.get(k); if (!c) cells.set(k, c = { sx: 0, sy: 0, n: 0, pts: [] });
    c.sx += x; c.sy += y; c.n++;
    if (c.pts.length < 8) c.pts.push([x, y]);
  }
  out = [];
  for (const c of cells.values()) if (c.n >= 3) out.push({ x: c.sx / c.n, y: c.sy / c.n, pts: c.pts });
  PONDS.set(map, out);
  return out;
}
// round a player: the nearer ponds' patches, out of sight, get a pair or a few ducks, or a gaggle of geese, until there
// are a handful about the player and about each patch - tame ones (react: they don't take off at the sight of you); the
// count spawned
function parkDucks(world, q, anchors) {
  const near = [];
  for (const p of parkPonds(world.map)) { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < 1600 * 1600) near.push([d, p]); }
  if (!near.length) return 0;
  const isDuck = (e) => e.wild && !e.dead && (e.wild.kind === 'duck' || e.wild.kind === 'goose');
  if (world.query(q.x, q.y, 1700, K.PED).filter(isDuck).length >= 9) return 0;
  near.sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < near.length && k < 6; k++) {
    const p = near[k][1];
    if (world.query(p.x, p.y, 520, K.PED).filter(isDuck).length >= 4) continue;
    const pt = p.pts.find(([x, y]) => !inAnyView(world, x, y, 60) && !anchors.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < 300 * 300));
    if (pt) return spawnGroup(world, rng() < 0.75 ? 'duck' : 'goose', pt[0], pt[1], false, true);
  }
  return 0;
}

// livestock round a farm
function spawnLivestock(world, x, y) {
  const kind = pick([['cow', 4], ['sheep', 3], ['horse', 2], ['goat', 1.5], ['pig', 1.5]]), L = LIVESTOCK[kind];
  const n = L.herd[0] + Math.floor(rng() * (L.herd[1] - L.herd[0] + 1)), herd = (world.nextHerd = (world.nextHerd || 0) + 1);
  let made = 0;
  for (let i = 0; i < n * 3 && made < n; i++) {
    const ax = x + (rng() - 0.5) * 90, ay = y + (rng() - 0.5) * 90;
    if (!ground(world.map, ax, ay)) continue;
    const a = spawnAnimal(world, kind, ax, ay, herd);
    a.wild.hx = x; a.wild.hy = y;
    made++;
  }
  return made;
}

// What lives here now: [[kind, weight]] for a spawn point's habitat, the hour, and what's already about.
function faunaFor(world, tags, ph, counts) {
  const out = [];
  for (const [kind, S] of Object.entries(SPECIES)) {
    let w = 0;
    for (const [tag, v] of Object.entries(S.habitat)) if (tags[tag]) w = Math.max(w, v);
    if (!w) continue;
    if (tags.isle && !S.bird && kind !== 'seaotter') continue;                          // no deer on the little islands
    w *= activity(S, ph);
    // the predators and the big ones are few: one of a kind about at a time, round any one player
    const cap = S.few || (S.temper === 'elusive' && S.predatory ? 1 : S.size === 'huge' ? 1 : S.size === 'large' ? 2 : 6);
    if ((counts[kind] || 0) >= cap) continue;
    out.push([kind, w]);
  }
  return out;
}

// a spawn spot for a water animal near (x, y): open water of the right kind, or the bank beside it
function waterSpot(world, x, y, kind) {
  const map = world.map, S = SPECIES[kind];
  for (let k = 0; k < 14; k++) {
    const ax = x + (rng() - 0.5) * 520, ay = y + (rng() - 0.5) * 520;
    const tags = habitatAt(map, ax, ay);
    if (kind === 'seaotter' ? tags.kelp : kind === 'beaver' ? tags.beaver && (tags.water || wet(map, ax, ay)) : (tags.lake || tags.pond || tags.river || tags.creek || tags.marsh)) {
      if (S.swims === 'float' && !wet(map, ax, ay)) continue;
      return [ax, ay];
    }
  }
  return null;
}

function populate(world) {
  const now = world.time;
  let total = 0;
  const anchors = [];
  for (const p of world.players.values()) { const q = p.ped; if (q && !q.dead && !q.hidden && !q.sub && !q.interior) anchors.push(q); }
  for (const e of world.entities.values()) {
    if (!isAnimal(e) || e.ug) continue;   // (the cave's den bear comes and goes with the cave: underground.js)
    let near = false;
    for (const q of anchors) if ((q.x - e.x) ** 2 + (q.y - e.y) ** 2 < DESPAWN_R * DESPAWN_R) { near = true; break; }
    const gone = !near || (e.dead && now - e.deadAt > CARCASS_S) || e.wild.flewOff;
    if (gone && !inAnyView(world, e.x, e.y, 48)) { world.remove(e); continue; }
    total++;
  }
  if (total >= MAX_WILD || world.npcBudget <= 0) return; // (no NPCs at all: no animals either)
  const ph = phaseOf(world);
  for (const q of anchors) {
    // the town's ponds' ducks
    total += parkDucks(world, q, anchors);
    if (total >= MAX_WILD) return;
    // the rest only out in the open country (or right on its edge)
    if (!wildStyle(world.map, q.x, q.y)) {
      let edge = false;
      for (let k = 0; k < 8 && !edge; k++) edge = !!wildStyle(world.map, q.x + Math.cos(k * 0.785) * 900, q.y + Math.sin(k * 0.785) * 900);
      if (!edge) continue;
    }
    // a farm close by keeps its livestock about first (the wild things would otherwise fill the count round it): a
    // herd or two out round the farmhouse and its fields, come in from out of sight
    const farm = farmNear(world.map, q.x, q.y, 1500);
    if (farm) {
      let stock = 0;
      for (const e of world.query(farm.x, farm.y, 1100, K.PED)) if (e.wild && e.wild.livestock && !e.dead) stock++;
      if (stock < 5) for (let t = 0; t < 8; t++) {
        const ang = rng() * 6.28, d = 380 + rng() * 520, x = farm.x + Math.cos(ang) * d, y = farm.y + Math.sin(ang) * d;
        if (!ground(world.map, x, y) || inAnyView(world, x, y, 80) || anchors.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < 420 * 420)) continue;
        if (world.query(x, y, 220, K.PED).some((e) => e.wild && !e.dead)) continue;
        total += spawnLivestock(world, x, y);
        break;
      }
    }
    let n = 0;
    const counts = {};
    for (const e of world.query(q.x, q.y, NEAR_R, K.PED)) if (e.wild && !e.dead) { n++; counts[e.wild.kind] = (counts[e.wild.kind] || 0) + 1; }
    if (n >= TARGET) continue;
    for (let tries = 0; tries < 12; tries++) {
      const ang = rng() * 6.28, d = 600 + rng() * 700;
      const x = q.x + Math.cos(ang) * d, y = q.y + Math.sin(ang) * d;
      const style = wildStyle(world.map, x, y);
      const tags = habitatAt(world.map, x, y);
      if (!style && !tags.water && !tags.sea) continue;
      let close = false;
      for (const b of anchors) if ((b.x - x) ** 2 + (b.y - y) ** 2 < 480 * 480) { close = true; break; }
      if (close || inAnyView(world, x, y, 80)) continue; // they come in from off screen
      if (world.query(x, y, 280, K.PED).some((e) => e.wild && !e.dead)) continue; // not on top of another group
      // the farms' livestock round a farmhouse or a field
      if (style === 'rural') {
        const f = placeNear(world.map, x, y, FARM_R);
        if (f && (f.kind === 'farm' || f.kind === 'home') && ground(world.map, x, y) && rng() < 0.6) { total += spawnLivestock(world, x, y); break; }
      }
      const list = faunaFor(world, tags, ph, counts);
      const kind = pick(list);
      if (!kind) continue;
      const S = SPECIES[kind];
      let sx = x, sy = y;
      if (S.soars) { /* up over its country: anywhere */ }
      else if (S.wader) { const es = edgeSpot(world.map, x, y); if (!es) continue; [sx, sy] = es; }   // (a heron: on the bank)
      else if (S.swims === 'float' || kind === 'otter' || kind === 'beaver' || ((kind === 'duck' || kind === 'goose') && (tags.lake || tags.pond || tags.marsh || tags.river))) {
        const ws = waterSpot(world, x, y, kind);
        if (!ws) continue;
        [sx, sy] = ws;
      } else if (!ground(world.map, x, y)) continue;
      total += spawnGroup(world, kind, sx, sy, true);
      break;
    }
    if (total >= MAX_WILD) return;
  }
  if (world.tick % 400 === 9) roadkill(world, anchors);
}

// Now and then something has been hit on a country road ahead of you: a carcass on the verge (a poor hide, the meat
// spoiled - hunting.js).
function roadkill(world, anchors) {
  for (const q of anchors) {
    if (!wildStyle(world.map, q.x, q.y) || rng() > 0.25) continue;
    for (let tries = 0; tries < 10; tries++) {
      const ang = rng() * 6.28, d = 700 + rng() * 500, x = q.x + Math.cos(ang) * d, y = q.y + Math.sin(ang) * d;
      const t = world.map.tileAtPx(x, y);
      if (t !== T.ROAD || !wildStyle(world.map, x, y) || inAnyView(world, x, y, 60)) continue;
      // onto the verge beside it
      let vx = x, vy = y;
      for (let k = 1; k < 6 && world.map.tileAtPx(vx, vy) === T.ROAD; k++) { vx = x + Math.cos(ang + 1.57) * k * 18; vy = y + Math.sin(ang + 1.57) * k * 18; }
      if (!ground(world.map, vx, vy)) continue;
      const kind = pick([['deer', 3], ['raccoon', 3], ['rabbit', 2], ['coyote', 1], ['redfox', 1], ['squirrel', 1]]);
      const a = spawnAnimal(world, kind, vx, vy, 0);
      a.hp = 0; a.dead = true; a.deadAt = world.time; a.wild.roadkill = true; a.wild.grade = 1; a.wild.hits = [{ c: 'vehicle' }];
      world.emit(vx, vy, { e: 'death', x: vx, y: vy, a: rng() * 6.28, id: a.id, k: rng() < 0.5 ? 'side' : 'back' });
      break;
    }
  }
}

// ---- senses -----------------------------------------------------------------------------------------------------
// The wind (where scent carries): a heading that wanders slowly, and its strength.
function windOf(world) {
  const t = world.time;
  return { a: Math.sin(t / 190) * 2.4 + Math.sin(t / 57) * 0.6, s: 0.55 + 0.35 * Math.sin(t / 83) };
}
// The senses in fauna.js are the animals' own; these scale them to the game's distances (a screen is ~40 m across).
const SIGHT_K = 1.6, HEAR_K = 1.8, SMELL_K = 1.4;
// How much noise someone makes moving (0 still .. 1 flat out). A creep - a gentle push of the stick, or the walk key -
// is next to silent; walking is heard a fair way off, running further, sprinting furthest.
function noiseOf(q) {
  if (q.vehId) return 1;
  const sp = Math.hypot(q.vx, q.vy);
  return sp < 20 ? 0 : sp < 65 ? 0.05 : sp < 100 ? 0.12 : sp < 150 ? 0.6 : sp < 205 ? 0.8 : 1;
}
// How much of its sight range catches you, by how you move: standing still or creeping you're hard to pick out
// (move while its head is down, freeze when it comes up, and you can get close); walking a fair way off; running
// and sprinting as far as it can see.
function eyeCatch(q) {
  const sp = Math.hypot(q.vx, q.vy);
  return sp < 20 ? 0.15 : sp < 65 ? 0.25 : sp < 100 ? 0.4 : sp < 150 ? 0.75 : sp < 205 ? 0.9 : 1;
}
// How well it can see from (ax, ay) to (bx, by), 0..1: rock and buildings in between block it, a trunk or a boulder in
// the way hides most of you, and someone standing among the trees and rocks is harder to pick out than in the open.
function viewOf(map, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 16);
  let v = 1, last = null;
  for (let k = 1; k < n; k++) {
    const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n, i = at(map, Math.floor(x / TILE), Math.floor(y / TILE));
    if (i < 0) continue;
    const t = map.tiles[i];
    if (t === T.WALL || t === T.BUILDING) return 0.08;
    const arr = map.solidProps.get(i);
    if (arr) for (const p of arr) if (p !== last && !p.off && p.r >= 6 && Math.hypot(p.x - x, p.y - y) < p.r + 5) { v *= 0.4; last = p; break; }
    if (v < 0.2) { v = 0.2; break; }
  }
  return v * (1 - 0.45 * coverAt(map, bx, by));
}
// how much cover there is round (x, y), 0..1: the trunks, logs and rocks within a stride or two
function coverAt(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  let n = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const k = at(map, tx + i, ty + j), arr = k >= 0 && map.solidProps.get(k);
    if (arr) for (const p of arr) if (!p.off && Math.hypot(p.x - x, p.y - y) < 52) n++;
  }
  return Math.min(1, n / 3);
}
// Its head is down (grazing, rooting, pecking, drinking, gnawing) between the looks round: it sees far less then.
// A careful hunter moves while the head is down and freezes when it comes up.
const HEAD_DOWN = new Set([APOSE.graze, APOSE.peck, APOSE.drink, APOSE.gnaw, APOSE.eat]);
const headDown = (w, now) => (w.state === 'idle' || w.state === 'work') && HEAD_DOWN.has(w.pose) && now >= (w.scanUntil || 0);
// The biggest threat this animal can sense right now, and how strongly (0..1+): people on foot, people in vehicles,
// and gunshots. Hunters creeping up from downwind in the half-light can get very close.
function sense(world, a, S, ph) {
  const w = a.wild, wind = world.wind || windOf(world), map = world.map;
  const sens = w.legend ? 1.25 : 1, resting = w.rest ? 0.45 : 1, head = headDown(w, world.time) ? 0.5 : 1;
  const light = 1 - 0.5 * ph.dark;
  let best = null, bestS = 0;
  const consider = (q, x, y, inVeh, beast = false) => {
    const dx = x - a.x, dy = y - a.y, d = Math.hypot(dx, dy) || 1;
    if (d > 900) return;
    let s = 0;
    // sight: wide-eyed prey see almost all round; anything moving catches the eye; the still and the creeping hardly.
    // A flashlight at night gives you away.
    const face = Math.cos(Math.atan2(dy, dx) - a.a);
    const cone = S.temper === 'elusive' || S.temper === 'aggressive' ? (face > -0.2 ? 1 : 0.35) : face > -0.6 ? 1 : 0.55;
    const lit = q.flashOn ? Math.max(light, 1.1) : light;
    const camo = !inVeh && q.player && (q.player.profile.inventory.camoCloak || 0) > 0 ? 0.62 : 1;   // (a ghillie cloak)
    const catches = inVeh ? 0.3 + 0.7 * Math.min(1, Math.hypot(q.vx, q.vy) / 200 + 0.1) : eyeCatch(q);
    let sightR = S.sense.sight * SIGHT_K * sens * resting * head * lit * cone * camo * catches * (inVeh ? 1.1 : 1);
    if (d < sightR) { sightR *= viewOf(map, a.x, a.y, x, y); if (d < sightR) s = Math.max(s, 1.25 - d / sightR); }
    // hearing: footsteps (none for a creep), engines
    const loud = inVeh ? 0.4 + Math.min(1, Math.hypot(q.vx, q.vy) / 250) : noiseOf(q);
    const hearR = S.sense.hear * HEAR_K * sens * resting * loud;
    if (d < hearR) s = Math.max(s, 1.1 - d / hearR);
    // smell: from straight downwind it carries a long way (not through cover scent)
    if (!inVeh && !beast && !(q.buffs && q.buffs.scent > world.time)) {
      const down = Math.cos(Math.atan2(-dy, -dx) - wind.a);   // the wind blows from them to it?
      if (down > 0.55) { const smR = S.sense.smell * SMELL_K * sens * down * wind.s; if (d < smR) s = Math.max(s, 1 - d / smR); }
    }
    // right on top of it, it knows
    if (d < 34 + (a.r || 10)) s = Math.max(s, 1.2);
    if (s > bestS) { bestS = s; best = { x, y, id: q.id, d, ped: inVeh ? null : q, veh: inVeh, beast }; }
  };
  const unseen = watcher(w, world.time);   // (dev.js huntScene: the one watching a hunt set up for them goes unnoticed)
  for (const p of world.players.values()) {
    const q = p.ped;
    if (!q || q.dead || q.hidden || q.sub || q.onTrain || q.id === unseen) continue;
    if (q.vehId) { const v = world.get(q.vehId); if (v && v.lz < 0.3 && v.def.kind !== 'boat') consider(v, v.x, v.y, true); continue; }
    consider(q, q.x, q.y, false);
  }
  // the people of the wilds (hikers, campers, hunters) are noticed too - at a shorter range
  for (const q of world.query(a.x, a.y, 260, K.PED)) {
    if (!q.npc || q.dead || q.vehId) continue;
    consider(q, q.x, q.y, false);
  }
  for (const v of world.query(a.x, a.y, 300, K.VEH)) {
    if (v.lz > 0.3 || v.def.kind === 'boat' || Math.hypot(v.vx, v.vy) < 60) continue;
    consider(v, v.x, v.y, true);
  }
  // its hunters (the hunt): seen and heard like anyone - a cougar creeping up low and slow is hard to make out, a pack
  // trotting in is seen a long way off; a bird of prey up soaring is no danger, one dropping on it is
  const P = PREDATORS_OF[w.kind];
  if (P && !w.tame) for (const q of world.query(a.x, a.y, 600, K.PED)) {
    const qw = q.wild;
    if (q === a || !qw || q.dead || q.hidden || qw.young || !P.has(qw.kind) || (AIRBORNE.has(qw.state) && qw.state !== 'stoop')) continue;
    consider(q, q.x, q.y, false, true);
  }
  // a gunshot (not an arrow) carries far
  for (const sh of world.shotLog) if (world.time - sh.t < 1.2) { const R = S.sense.hear * HEAR_K * 2, d = Math.hypot(sh.x - a.x, sh.y - a.y); if (d < R && 1.2 - d / R > bestS) { bestS = 1.2 - d / R; best = { x: sh.x, y: sh.y, id: 0, d, shot: true }; } }
  return best ? { ...best, s: bestS } : null;
}

// ---- decisions --------------------------------------------------------------------------------------------------
function setState(w, state, now, secs) { w.state = state; w.until = now + secs; }
function flee(world, a, fx, fy, now, secs = 2.5, urgent = false) {
  const w = a.wild;
  if (w.state === 'dive' || w.state === 'fly' || w.state === 'climb') return;
  // caught standing about (not already on its guard, not a shot or a car), it starts - head up, a turn - before it
  // goes; the run then builds up (moveLike)
  if (!urgent && (w.state === 'idle' || w.state === 'walk' || w.state === 'rest' || w.state === 'work') && (w.sp || 0) < 30) w.startle = now + 0.12 + rng() * 0.18;
  w.fx = fx; w.fy = fy; w.bias = 0; w.rest = false; w.fh = undefined; w.fhAt = 0;
  const S = SPECIES[w.kind];
  // a swimmer near its water takes to it and dives; a bird takes off (pheasants burst up; quail scatter on foot); a
  // squirrel goes up the nearest tree
  if (S && S.swims === 'dive' && nearWater(world.map, a.x, a.y, 140)) { divesFrom(world, a, now); return; }
  if (S && S.bird && (S.fly && !S.runner || (S.runner && Math.hypot(fx - a.x, fy - a.y) < 70))) { takeOff(world, a, fx, fy, now); return; }
  if (S && S.climbs && w.kind === 'squirrel') { const tr = treeNear(world.map, a.x, a.y, 200); if (tr) { w.tree = tr; setState(w, 'totree', now, 4); return; } }
  setState(w, 'flee', now, secs + rng() * 2);
  if (S && S.group.kind === 'covey') { w.state = 'scatter'; w.until = now + 1.6 + rng(); w.fx = fx + (rng() - 0.5) * 300; w.fy = fy + (rng() - 0.5) * 300; }
}
// the whole group bolts with it (a covey scatters; young run with their mother)
function alarmGroup(world, a, fx, fy, now) {
  const w = a.wild;
  if (!w.herd) return;
  for (const q of world.query(a.x, a.y, 340, K.PED)) {
    if (q === a || !q.wild || q.dead || q.wild.herd !== w.herd) continue;
    const qs = q.wild.state;
    if (qs === 'flee' || qs === 'scatter' || qs === 'fly' || qs === 'dive' || qs === 'charge' || qs === 'attack') continue;
    flee(world, q, fx, fy, now);
  }
}
function nearWater(map, x, y, r) { for (let k = 0; k < 16; k++) { const ang = k / 16 * 6.28; for (const d of [r * 0.3, r * 0.65, r]) if (wet(map, x + Math.cos(ang) * d, y + Math.sin(ang) * d)) return true; } return wet(map, x, y); }
function waterDir(map, x, y, r) { for (const d of [r * 0.3, r * 0.6, r]) for (let k = 0; k < 16; k++) { const ang = k / 16 * 6.28; if (wet(map, x + Math.cos(ang) * d, y + Math.sin(ang) * d)) return [x + Math.cos(ang) * (d + 20), y + Math.sin(ang) * (d + 20)]; } return null; }
function treeNear(map, x, y, r) {
  let best = null, bd = r;
  const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE), ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const arr = map.solidProps.get(map.idx(tx, ty));
    if (!arr) continue;
    for (const p of arr) { if (p.off || p.r < 9) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = { x: p.x, y: p.y, r: p.r }; } }
  }
  return best;
}
function divesFrom(world, a, now) {
  const w = a.wild, map = world.map;
  if (!wet(map, a.x, a.y)) { const t = waterDir(map, a.x, a.y, 160); if (t) { w.wx = t[0]; w.wy = t[1]; setState(w, 'towater', now, 3); return; } }
  if (w.kind === 'beaver') world.emit(a.x, a.y, { e: 'splash', x: a.x, y: a.y, big: 1 });   // the tail slap
  else world.emit(a.x, a.y, { e: 'splash', x: a.x, y: a.y });
  setState(w, 'dive', now, 5 + rng() * 6);
  a.hidden = true;
}
function takeOff(world, a, fx, fy, now) {
  const w = a.wild, ang = Math.atan2(a.y - fy, a.x - fx) + (rng() - 0.5) * 1.2;
  w.fa = ang; setState(w, 'fly', now, 3 + rng() * 2); w.fsp = 0;   // (it beats up to speed: the fly case)
  world.emit(a.x, a.y, { e: 'flush', x: a.x, y: a.y, id: a.id, k: w.kind });
}

function think(world, a, S, now, ph) {
  const w = a.wild;
  if (AIRBORNE.has(w.state) || w.state === 'dive' || w.state === 'attack' || a.hidden) return;   // (up in the air, under the water)
  if (w.calmUntil > now) return;   // (dev: spawned calm, to be looked at)
  const th = sense(world, a, S, ph);
  // awareness builds while it senses something and fades when it doesn't
  if (th) w.aware = Math.min(1.5, w.aware + th.s * (th.s > 1 ? 1.2 : 0.8));
  else w.aware = Math.max(0, w.aware - 0.12);
  if (th) { w.tx = th.x; w.ty = th.y; w.tid = th.id; w.td = th.d; }
  if (w.hurtRest) return;   // (bedded down wounded: it lies low - step(): it only bolts when you're right on it)
  // the young keep to their mother; the mother decides
  const mom = w.mother ? world.get(w.mother) : null;
  if (w.young && mom && !mom.dead) {
    const ms = mom.wild.state;
    if ((ms === 'flee' || ms === 'scatter' || ms === 'fly') && w.state !== 'flee') flee(world, a, mom.wild.fx, mom.wild.fy, now, 3);
    return;
  }
  if (w.young && (!mom || mom.dead) && th && w.aware > 0.6) { flee(world, a, th.x, th.y, now, 4); return; }
  if (w.state === 'stalk' || w.state === 'charge' || w.state === 'warn') return;   // (the predator's own loop)
  if (!th || w.aware < 0.25) {
    if (w.state === 'alert' && now > w.until) setState(w, 'idle', now, 1 + rng() * 2);
    // a predator that has decided someone is prey goes after them when the conditions are right
    if (w.predator && !w.young && preyCheck(world, a, S, ph, now)) return;
    // the hunters look about for something to hunt (the hunt)
    if (S.hunts && CALM.has(w.state)) huntCheck(world, a, S, ph, now);
    return;
  }
  // (how sure it is: th.s - a faint sound at the edge of hearing is ~0.1, someone in plain sight close by ~1)
  const d = th.d, temper = S.temper;
  const spooked = th.shot || th.veh && d < 260;
  // the park's ducks and geese are used to people: someone right on top of them is paddled (or waddled) away from; only
  // a shot or a car close by sends them up
  if (w.tame && !spooked) {
    if (th.ped && d < 70 && w.state !== 'flee' && w.state !== 'trotoff') { w.fx = th.x; w.fy = th.y; setState(w, 'trotoff', now, 1.6 + rng()); }
    return;
  }
  if (temper === 'skittish' || spooked) {
    if (w.aware > 0.7 || th.s > 0.85 || spooked) { flee(world, a, th.x, th.y, now, 2.5, spooked); alarmGroup(world, a, th.x, th.y, now); }
    else if (w.state !== 'flee') { setState(w, 'alert', now, 1.5); face(a, th.x, th.y); }
    return;
  }
  if (temper === 'wary') {
    if (th.s > 0.9 || w.aware > 1.1) { flee(world, a, th.x, th.y, now); alarmGroup(world, a, th.x, th.y, now); }
    else if (w.aware > 0.5 && d < 280 && w.state !== 'flee') { w.fx = th.x; w.fy = th.y; setState(w, 'trotoff', now, 3); alarmGroup(world, a, th.x, th.y, now); }
    else if (w.state !== 'flee' && w.state !== 'trotoff') { setState(w, 'alert', now, 2); face(a, th.x, th.y); }
    return;
  }
  if (temper === 'curious') {
    if (th.s > 0.95 || w.aware > 1.15) { flee(world, a, th.x, th.y, now); alarmGroup(world, a, th.x, th.y, now); }
    else if (w.state !== 'flee') { setState(w, d > 260 && noiseQ(world, th) < 0.3 ? 'follow' : 'alert', now, 2.5); face(a, th.x, th.y); }
    return;
  }
  if (temper === 'elusive') {
    if (w.predator && th.ped && preyCheck(world, a, S, ph, now)) return;
    if (w.aware > 0.45 || th.s > 0.6) { flee(world, a, th.x, th.y, now, 3.5); alarmGroup(world, a, th.x, th.y, now); }
    return;
  }
  // defensive / aggressive: hold the ground, warn, bluff, charge (not someone it found it can't get at: it stares)
  const warnAt = (S.warnAt || 120) * (w.withYoung ? 1.35 : 1), mad = temper === 'aggressive' || w.withYoung || w.hurtBy;
  if (th.ped && !canReach(w, th.id, now)) { if (w.state !== 'flee' && w.state !== 'alert') { setState(w, 'alert', now, 2); face(a, th.x, th.y); } }
  else if (th.ped && d < warnAt * (mad ? 1 : 0.7)) {
    if (w.state !== 'warn' && w.bluffs < 2) { w.warnOf = th.id; setState(w, 'warn', now, 1.4 + rng()); face(a, th.x, th.y); return; }
    if (rng() < (S.charges || 0.3) * (mad ? 1.3 : 0.8)) { charge(world, a, th.id, now, w.bluffs < 1 && !mad && rng() < 0.5); return; }
    flee(world, a, th.x, th.y, now, 2.5); alarmGroup(world, a, th.x, th.y, now);
  } else if (w.aware > 0.9 && !mad && d < 220) { flee(world, a, th.x, th.y, now); alarmGroup(world, a, th.x, th.y, now); }
  else if (w.state !== 'flee' && w.state !== 'alert') { setState(w, 'alert', now, 2); face(a, th.x, th.y); }
}
const noiseQ = (world, th) => (th.ped ? noiseOf(th.ped) : 1);
function face(a, x, y) { a.a = Math.atan2(y - a.y, x - a.x); }

// A predator that has it in it: is anyone out here prey right now? (dusk or night, on foot, alone - nobody else
// within a long stone's throw - not in town, and it isn't hurt). Then it stalks them.
function preyCheck(world, a, S, ph, now) {
  const w = a.wild;
  if (now < (w.nextPrey || 0)) return false;
  w.nextPrey = now + 6;
  if (!(ph.night || ph.dawnDusk) || (a.hp < a.maxHp * 0.7)) return false;
  let best = null, bd = 760;
  for (const p of world.players.values()) {
    const q = p.ped;
    if (!q || q.dead || q.vehId || q.hidden || q.sub || !wildStyle(world.map, q.x, q.y) || !canReach(w, q.id, now)) continue;
    const d = Math.hypot(q.x - a.x, q.y - a.y);
    if (d > bd) continue;
    let crowd = false;
    for (const o of world.query(q.x, q.y, 380, K.PED)) if (o !== q && !o.dead && !o.wild && (o.player || o.npc)) { crowd = true; break; }
    if (crowd) continue;
    best = q; bd = d;
  }
  if (!best) return false;
  w.stalkOf = best.id; setState(w, 'stalk', now, 40 + rng() * 30); w.aware = 0.4;
  return true;
}
function charge(world, a, targetId, now, bluff) {
  const w = a.wild;
  w.chargeOf = targetId; w.bluff = bluff; setState(w, 'charge', now, bluff ? 1.1 : 4.5); w.bluffs++;
  world.emit(a.x, a.y, { e: 'roar', x: a.x, y: a.y, id: a.id, k: w.kind });
}

// ---- the hunt: animal against animal (Nature-A2, 2026-10-20) ------------------------------------------------------
// The hunters (fauna.js hunts) go after the wild things they live on: never a pet (they aren't wild), never the farms'
// livestock or the town ponds' tame ducks, never a legend, never a person (that's preyCheck: a cougar or a bear, and
// rarely). None of it starts with anyone close by - a person within PEOPLE_R of the hunter or its prey - and it's
// given up if someone comes close (or the hunter slinks off from them as it would: its temper, think). So it's seen
// from a little way off, as A2 draws it, and it's quick and clean: the prey goes down (no blood: reactions.js), the
// hunters feed on it, a bird of prey carries its catch off. The fishers (fauna.js fishes) and the foxes mousing go
// about it the same way: their own business, out of the way.
const PEOPLE_R = 240;
const AIRBORNE = new Set(['fly', 'soar', 'stoop', 'plunge', 'carry']);
const CALM = new Set(['idle', 'walk', 'alert']);
// anyone about (on foot, or in a vehicle on the move or with someone in it) within r of (x, y) - but for skip (the
// dev's watcher of a hunt set up for them: dev.js huntScene)
function peopleNear(world, x, y, r, skip = 0) {
  for (const q of world.query(x, y, r, K.PED)) if (!q.wild && !q.dead && (q.player || q.npc) && q.id !== skip) return true;
  for (const v of world.query(x, y, r, K.VEH)) if (!v.removed && !(v.lz > 0.3) && (Math.hypot(v.vx, v.vy) > 30 || (v.seats && v.seats.some((id) => id)))) return true;
  return false;
}
const watcher = (w, now) => (w.watchedBy && now < (w.watchUntil || 0) ? w.watchedBy : 0);   // (dev.js huntScene)
const preyOk = (q, H) => !!q.wild && !q.dead && !q.removed && !q.hidden && !q.ug && !q.wild.livestock && !q.wild.tame && !q.wild.legend && !q.wild.flewOff
  && H.prey.includes(q.wild.kind) && !AIRBORNE.has(q.wild.state) && q.wild.state !== 'climb' && q.wild.state !== 'dive' && q.wild.state !== 'totree';
// the nearest thing to hunt within H.r of (x, y) (the young sooner), with nobody about it
function preyNear(world, a, H, x, y) {
  let best = null, bs = Infinity;
  for (const q of world.query(x, y, H.r, K.PED)) {
    if (q === a || !preyOk(q, H)) continue;
    const d = Math.hypot(q.x - x, q.y - y) * (q.wild.young ? 0.6 : 1);
    if (d < bs && !peopleNear(world, q.x, q.y, PEOPLE_R, watcher(a.wild, world.time))) { bs = d; best = q; }
  }
  return best;
}
// A hunter at its ease, in its hours, not hurt and not fed lately: anything to hunt about?
function huntCheck(world, a, S, ph, now) {
  const w = a.wild, H = S.hunts;
  if (!H || H.how === 'stoop' || w.young || w.tame || now < (w.nextHunt || 0) || a.hp < a.maxHp * 0.6) return false;
  w.nextHunt = now + 5 + rng() * 6;
  if (w.herd && !w.lead && herdLead(world, a)) return false;   // (the pack's lead starts it; the rest go with it)
  if (activity(S, ph) < 0.5 || rng() > H.p || peopleNear(world, a.x, a.y, PEOPLE_R, watcher(w, now))) return false;
  const q = preyNear(world, a, H, a.x, a.y);
  return q ? startHunt(world, a, q, now) : false;
}
// Off after q: the stalk, the trot in (the pack with it, fanning out either side), or - a bird of prey - the stoop.
export function startHunt(world, a, q, now = world.time) {
  const w = a.wild, S = SPECIES[w.kind], H = S && S.hunts;
  if (!H || !q || !q.wild) return false;
  w.huntOf = q.id; w.rushAt = 0; w.flank = 0; w.feedOn = 0; w.rest = false;
  if (H.how === 'stoop') { setState(w, 'stoop', now, 7); return true; }
  setState(w, 'hunt', now, 45 + rng() * 25);
  if (H.how === 'pack' && w.herd) {
    let k = 0;
    for (const m of world.query(a.x, a.y, 700, K.PED)) {
      const mw = m.wild;
      if (m === a || !mw || m.dead || mw.herd !== w.herd || mw.young || AIRBORNE.has(mw.state)) continue;
      k++; mw.huntOf = q.id; mw.rushAt = 0; mw.feedOn = 0; mw.rest = false; mw.flank = k % 2 ? 1 : -1;
      setState(mw, 'hunt', now, w.until - now);
    }
  }
  return true;
}
function endHunt(world, a, now, why = '') {
  const w = a.wild;
  w.huntEnd = why; w.huntOf = 0; w.flank = 0; w.nextHunt = Math.max(w.nextHunt || 0, now + 35 + rng() * 45);
  if (SPECIES[w.kind] && SPECIES[w.kind].soars) { setState(w, 'soar', now, 15 + rng() * 15); return; }
  setState(w, 'idle', now, 2 + rng() * 3); w.hx = a.x; w.hy = a.y;
}
// how fast a hunted animal can still run: run hard for a few seconds it tires (the long chase of A2: the pack wears
// it down); just twisted out of a hunter's reach, a bound on it
function tired(w, now) {
  const burst = now < (w.burstUntil || 0) ? 1.12 : 1;
  if (!(now < (w.chasedUntil || 0))) return burst;
  return burst * Math.max(0.86, 1 - Math.max(0, now - (w.chasedSince || now) - 5) * 0.018);
}
// The way in and the rush: { mx, my, speed, pose, goal } for step()
function huntMove(world, a, w, S, now, limp) {
  const H = S.hunts, q = world.get(w.huntOf), out = { mx: 0, my: 0, speed: S.walk, pose: APOSE.auto, goal: Infinity };
  if (!H || !q || q.removed || q.hidden || now > w.until) { endHunt(world, a, now, !q ? 'lost' : q.removed ? 'removed' : q.hidden ? 'hidden' : 'time'); return out; }
  if (q.dead) { if (q.wild && q.wild.takenBy) feedOn(world, a, q, now); else endHunt(world, a, now, 'dead'); return out; }   // (the pack's kill: to it; someone else's: not theirs)
  if (!preyOk(q, H)) { endHunt(world, a, now, 'gone'); return out; }
  if (peopleNear(world, q.x, q.y, PEOPLE_R * 0.8, watcher(w, now))) { endHunt(world, a, now, 'people'); return out; }   // (someone's there now: not this time)
  const qw = q.wild, dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy) || 1;
  if (w.state === 'hunt') {
    const running = qw.state === 'flee' || qw.state === 'scatter' || qw.state === 'trotoff';
    if (d < H.spring || (H.how !== 'ambush' && running && d < H.spring * 2.4)) { setState(w, 'rush', now, w.until - now); w.rushAt = now; return out; }
    if (H.how === 'ambush') {
      if (running) { endHunt(world, a, now, 'seen'); return out; }   // (seen, and off: a cat doesn't run it down from out there)
      face(a, q.x, q.y); out.pose = APOSE.stalk;
      if (qw.state === 'alert' || now < (qw.scanUntil || 0) || (qw.aware > 0.45 && qw.tid === a.id)) return out;   // (frozen, crouched low, while it looks up)
      out.mx = dx / d; out.my = dy / d; out.speed = (S.stalk || S.walk * 0.7) * (d > H.spring * 3 ? 1.7 : 1) * limp; out.goal = d;
      return out;
    }
    let tx = q.x, ty = q.y;
    if (w.flank) { const o = Math.min(150, d * 0.45) * w.flank; tx += (-dy / d) * o; ty += (dx / d) * o; }   // (the pack fans out round it)
    const ex = tx - a.x, ey = ty - a.y, e = Math.hypot(ex, ey) || 1;
    out.mx = ex / e; out.my = ey / e; out.speed = S.trot * (d > H.spring * 2 ? 1 : 0.75) * limp; out.goal = e;
    return out;
  }
  // the rush: flat out at it, leading it a little; close enough, the take - or it twists away
  if (now - w.rushAt > H.chase) { endHunt(world, a, now, 'tired'); return out; }
  if (d > (H.how === 'pack' ? 950 : H.spring * 3.2)) { endHunt(world, a, now, 'away'); return out; }
  if (!(now < (qw.chasedUntil || 0))) qw.chasedSince = now;
  qw.chasedUntil = now + 0.8;
  const lead = Math.min(0.45, d / 500), tx = q.x + (q.vx || 0) * lead, ty = q.y + (q.vy || 0) * lead;
  const ex = tx - a.x, ey = ty - a.y, e = Math.hypot(ex, ey) || 1;
  out.mx = ex / e; out.my = ey / e; out.speed = S.run * limp * (now < (w.missUntil || 0) ? 0.45 : 1);
  out.pose = H.how === 'ambush' && d < 90 ? APOSE.attack : APOSE.charge;   // (a cat's spring: the pounce)
  if (d < (a.r || 10) + (q.r || 8) + 9 && now >= (w.missUntil || 0)) {
    const QS = SPECIES[qw.kind], big = SIZE_ORDER.indexOf(QS.size) >= SIZE_ORDER.indexOf(S.size);
    let p = big ? 0.42 : 0.55;
    if (H.how === 'pack') for (const m of world.query(q.x, q.y, 70, K.PED)) if (m !== a && m.wild && m.wild.herd === w.herd && m.wild.huntOf === q.id) p += 0.12;
    if (qw.young) p += 0.15;
    if (rng() < p) takeDown(world, a, q, now);
    else { w.missUntil = now + 0.9; qw.burstUntil = now + 1.1; }   // (it twists away: the hunter stumbles, the prey has a bound on it)
  }
  return out;
}
// the take: down it goes (quick, clean - no blood: reactions.js 'predator'); a bird of prey off with it, the others
// on it, the pack round it
function takeDown(world, a, q, now) {
  const w = a.wild, S = SPECIES[w.kind];
  q.vx *= 0.3; q.vy *= 0.3;
  combat.kill(world, q, a, 'predator', Math.atan2(q.y - a.y, q.x - a.x));
  if (!q.dead || !q.wild) return;
  q.wild.takenBy = w.kind; q.wild.grade = 1;   // (what's left of it after them: a poor hide at best - hunting.js)
  w.kills = (w.kills || 0) + 1;
  if (S.hunts && S.hunts.how === 'stoop') { world.remove(q); carryOff(world, a, w, 'game', now); return; }
  feedOn(world, a, q, now);
  if (w.herd) for (const m of world.query(q.x, q.y, 900, K.PED)) if (m !== a && m.wild && !m.dead && m.wild.herd === w.herd && m.wild.huntOf === q.id) feedOn(world, m, q, now);
}
function feedOn(world, a, q, now) {
  const w = a.wild, small = SIZE_ORDER.indexOf((SPECIES[q.wild.kind] || {}).size) <= 1;
  w.huntOf = 0; w.feedOn = q.id; w.flank = 0; w.nextHunt = now + 150 + rng() * 150;
  setState(w, 'feed', now, small ? 9 + rng() * 6 : 24 + rng() * 16);
}
// fed: a small kill is gone (eaten: cleared away once nobody's looking), a big one left; it lies up a while
function doneFeeding(world, a, w, q, now) {
  if (q && q.dead && q.wild && SIZE_ORDER.indexOf((SPECIES[q.wild.kind] || {}).size) <= 1) q.wild.flewOff = true;
  w.feedOn = 0; w.hx = a.x; w.hy = a.y;
  if (!SPECIES[w.kind].swims && rng() < 0.6) { w.rest = true; setState(w, 'rest', now, 25 + rng() * 35); }
  else setState(w, 'idle', now, 3 + rng() * 4);
}

// ---- the fishers -----------------------------------------------------------------------------------------------
const freshAt = (map, x, y) => { const i = at(map, Math.floor(x / TILE), Math.floor(y / TILE)); return i >= 0 && WATER_T[map.tiles[i]] === 1 && !!(map.lake[i] || map.river[i]); };
// shallow fresh water: not the deep, with land within a stride or two
function shallowAt(map, x, y) {
  if (!freshAt(map, x, y) || map.tileAtPx(x, y) !== T.WATER) return false;
  for (let k = 0; k < 8; k++) { const ang = k * 0.785; for (const r of [24, 44]) if (!WATER_T[map.tileAtPx(x + Math.cos(ang) * r, y + Math.sin(ang) * r)]) return true; }
  return false;
}
// a spot on the bank near (x, y): open ground with fresh water a stride off (where a heron comes in)
export function edgeSpot(map, x, y) {
  for (let k = 0; k < 30; k++) {
    const ax = x + (rng() - 0.5) * 560, ay = y + (rng() - 0.5) * 560;
    if (!ground(map, ax, ay)) continue;
    for (let j = 0; j < 8; j++) { const ang = j * 0.785; if (freshAt(map, ax + Math.cos(ang) * 40, ay + Math.sin(ang) * 40)) return [ax, ay]; }
  }
  return null;
}
// the falls near (x, y) (where the salmon leap: the nature sites' falls, as shared/ledges.js reads them)
function fallsNear(map, x, y, r) {
  const out = [];
  for (const s of map.natureSites || []) if (s.falls && Number.isFinite(s.falls.x) && Math.hypot(s.falls.x - x, s.falls.y - y) < r) out.push({ x: s.falls.x, y: s.falls.y, w: s.falls.w || 64, drop: s.falls.drop || 40 });
  return out;
}
// where a fisher fishes from, near where it is: [x, y, atFalls] (null: no water near)
function fishSpot(world, a, S) {
  const map = world.map, how = S.fishes.how;
  if (how === 'swipe') for (const f of fallsNear(map, a.x, a.y, 1100)) for (let k = 0; k < 10; k++) {
    const x = f.x + (rng() - 0.5) * f.w * 0.8, y = f.y + f.drop + 24 + rng() * 60;   // (the white water at the foot of the falls)
    if (freshAt(map, x, y)) return [x, y, true];
  }
  for (let k = 0; k < 28; k++) {
    const ang = rng() * 6.28, r = (how === 'strike' ? 20 + rng() * 170 : 50 + rng() * 320) * (k < 14 ? 1 : 1.6), x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r;   // (a heron: the shallows close by)
    if (how === 'dive' ? freshAt(map, x, y) : shallowAt(map, x, y)) return [x, y, false];
  }
  return null;
}
// Off to fish: down into the shallows (a heron, a bear: the falls' white water if there's a falls near), into the
// river (an otter)
export function startFishing(world, a, now = world.time) {
  const w = a.wild, S = SPECIES[w.kind];
  if (!S || !S.fishes || S.soars) return false;
  const spot = fishSpot(world, a, S);
  if (!spot) {   // (a heron put up from the water and landed away from it: it flies back to the shallows)
    if (!S.wader) return false;
    for (let k = 0; k < 40; k++) {
      const ang = rng() * 6.28, r = 200 + rng() * 800, x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r;
      if (!shallowAt(world.map, x, y)) continue;
      w.fa = ang; setState(w, 'fly', now, r / (S.fly || 220)); w.fsp = 0; w.backTo = [x, y];
      return true;
    }
    return false;
  }
  w.wx = spot[0]; w.wy = spot[1]; w.atFalls = spot[2]; w.rest = false;
  setState(w, 'tofish', now, 6 + Math.hypot(spot[0] - a.x, spot[1] - a.y) / (S.walk * 0.7));
  return true;
}
function beginFishing(world, a, w, S, now) {
  const map = world.map;
  if (!nearWater(map, a.x, a.y, 50)) { setState(w, 'idle', now, 2); return; }
  setState(w, 'fish', now, (S.fishes.how === 'dive' ? 45 : 50) + rng() * 40);
  w.fishA = w.atFalls ? -Math.PI / 2 + (rng() - 0.5) * 0.7 : waterward(map, a.x, a.y);   // (at the falls: facing up into the white water)
  w.nextStrike = now + 2 + rng() * 4; w.strikeUntil = 0; w.holdUntil = 0; w.underUntil = 0; w.diveAt = now + 1 + rng() * 2; w.edgeAt = now + 5 + rng() * 6; w.edgeTo = null;
}
// which way the open water lies from (x, y)
function waterward(map, x, y) {
  let best = 0, bn = -1;
  for (let k = 0; k < 16; k++) {
    const ang = k / 16 * 6.28;
    let n = 0;
    for (const r of [20, 40, 64, 96]) if (WATER_T[map.tileAtPx(x + Math.cos(ang) * r, y + Math.sin(ang) * r)]) n++;
    if (n > bn) { bn = n; best = ang; }
  }
  return best;
}
// the nearest dry ground from (x, y) out to r: a point a little way onto it
function landDir(map, x, y, r) {
  for (const d of [r * 0.25, r * 0.5, r * 0.75, r]) for (let k = 0; k < 16; k++) {
    const ang = k / 16 * 6.28, px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
    if (ground(map, px, py) && ground(map, px + Math.cos(ang) * 12, py + Math.sin(ang) * 12)) return [px + Math.cos(ang) * 12, py + Math.sin(ang) * 12];
  }
  return null;
}
// Fishing: { mx, my, speed, pose, goal } for step(). The heron and the bears stand and watch, strike now and then -
// a splash, and sometimes a fish (held a moment in the bill, the jaws, and swallowed); a heron edges along the
// shallows between strikes. The otter paddles about, dives (gone under), comes up - with a fish, out onto the bank to
// eat it (eatfish).
function fishMove(world, a, w, S, now) {
  const out = { mx: 0, my: 0, speed: S.walk, pose: APOSE.auto, goal: Infinity }, map = world.map, F = S.fishes;
  if (F.how === 'dive') {
    if (now < w.underUntil) {   // under, after one
      out.pose = APOSE.dive;
      const ang = (w.fishA || 0) + Math.sin(now * 0.7 + a.id) * 1.2;
      if (freshAt(map, a.x + Math.cos(ang) * 24, a.y + Math.sin(ang) * 24)) { out.mx = Math.cos(ang); out.my = Math.sin(ang); out.speed = (S.swim || 90) * 0.35; }
      return out;
    }
    if (a.hidden) {   // up again
      a.hidden = false; world.place(a); world.emit(a.x, a.y, { e: 'splash', x: a.x, y: a.y });
      if (rng() < F.p) { const t = landDir(map, a.x, a.y, 280); if (t) { w.wx = t[0]; w.wy = t[1]; w.fishCaught = (w.fishCaught || 0) + 1; setState(w, 'tobank', now, 10); return out; } }
      w.diveAt = now + 1.5 + rng() * 3;
    }
    if (now > w.until || !wet(map, a.x, a.y)) { setState(w, 'idle', now, 2 + rng() * 2); w.nextFish = now + 30 + rng() * 30; return out; }
    if (now >= (w.diveAt || 0)) { w.underUntil = now + 3 + rng() * 3.5; w.fishA = rng() * 6.28; world.emit(a.x, a.y, { e: 'splash', x: a.x, y: a.y }); a.hidden = true; world.place(a); out.pose = APOSE.dive; return out; }
    out.pose = APOSE.swim;
    return out;
  }
  if (now > w.until && now > w.holdUntil) { setState(w, 'idle', now, 3 + rng() * 4); w.hx = a.x; w.hy = a.y; w.nextFish = now + (S.wader ? 8 + rng() * 15 : 40 + rng() * 50); return out; }   // (a heron is back at it soon: fishing is what it does)
  // a heron edging along the shallows a step or two (not mid-strike, nor with a fish)
  if (S.bird && w.edgeTo && now >= w.strikeUntil && now >= w.holdUntil) {
    const dx = w.edgeTo[0] - a.x, dy = w.edgeTo[1] - a.y, d = Math.hypot(dx, dy);
    if (d < 5 || now > w.edgeAt + 6) { w.edgeTo = null; w.edgeAt = now + 6 + rng() * 8; w.fishA = waterward(map, a.x, a.y); w.nextStrike = Math.max(w.nextStrike, now + 1.5 + rng() * 2); }
    else { out.mx = dx / d; out.my = dy / d; out.speed = S.walk * 0.45; out.goal = d; out.pose = APOSE.stalk; return out; }
  }
  a.a = w.fishA; w.hd = w.fishA;
  if (now < w.holdUntil) { out.pose = APOSE.fish; return out; }   // (the fish in its bill, its jaws: swallowed)
  if (now < w.strikeUntil) { out.pose = APOSE.strike; return out; }
  if (now >= w.nextStrike) {   // the strike: the spear, the grab - a splash - and now and then a fish
    w.strikeUntil = now + (S.bird ? 0.45 : 0.6);
    const bx = a.x + Math.cos(a.a) * ((a.r || 10) + 12), by = a.y + Math.sin(a.a) * ((a.r || 10) + 12);
    world.emit(bx, by, { e: 'splash', x: bx, y: by, big: S.bird ? 0 : 1 });
    w.holdUntil = 0;
    if (rng() < F.p) { w.holdUntil = w.strikeUntil + (S.bird ? 2.4 : 3.6); w.fishCaught = (w.fishCaught || 0) + 1; }
    w.nextStrike = Math.max(w.strikeUntil, w.holdUntil) + 3 + rng() * 6;
    out.pose = APOSE.strike;
    return out;
  }
  // waiting, watching the water: the heron's neck coiled, poised; the bear stood looking down into the white water
  out.pose = S.bird ? APOSE.stalk : APOSE.alert;
  if (S.bird && now >= w.edgeAt && !w.edgeTo) {
    for (let k = 0; k < 6 && !w.edgeTo; k++) {
      const ang = w.fishA + (rng() - 0.5) * 2.6, r = 18 + rng() * 30, x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r;
      if (shallowAt(map, x, y) || (ground(map, x, y) && nearWater(map, x, y, 30))) w.edgeTo = [x, y];
    }
    if (!w.edgeTo) w.edgeAt = now + 6 + rng() * 6;
  }
  return out;
}

// ---- the foxes mousing ------------------------------------------------------------------------------------------
// In the long grass: still, listening, the head cocked - a leap, nose first into the grass - and now and then up with
// a mouse (fish: in its jaws a moment). Turns to the next sound and listens again.
const mousingAt = (map, x, y) => { const t = map.tileAtPx(x, y); return (t === T.GRASS || t === T.FIELD) && !!wildStyle(map, x, y); };
export function startMousing(world, a, now = world.time) {
  const w = a.wild;
  w.rest = false; setState(w, 'mouse', now, 22 + rng() * 22);
  w.nextPounce = now + 1.5 + rng() * 2.5; w.pounceUntil = 0; w.holdUntil = 0; w.listenA = a.a;
  return true;
}
function mouseMove(world, a, w, S, now) {
  const out = { mx: 0, my: 0, speed: S.walk, pose: APOSE.alert };
  if (now > w.until && now > w.holdUntil) { setState(w, 'idle', now, 2 + rng() * 3); w.nextMouse = now + 40 + rng() * 50; return out; }
  if (now < w.holdUntil && now >= w.pounceUntil) { out.pose = APOSE.fish; return out; }   // (a mouse in its jaws)
  if (now < w.pounceUntil) {   // the leap: up and over, nose first into the grass
    out.pose = APOSE.pounce;
    if (w.pounceUntil - now > 0.3) { out.mx = Math.cos(a.a); out.my = Math.sin(a.a); out.speed = 95; }
    return out;
  }
  if (now >= w.nextPounce) {
    w.pounceUntil = now + 0.75; w.holdUntil = 0;
    if (rng() < 0.4) { w.holdUntil = w.pounceUntil + 2.6; w.mice = (w.mice || 0) + 1; }
    w.nextPounce = Math.max(w.pounceUntil, w.holdUntil) + 2.5 + rng() * 3.5;
    w.listenA = a.a + (rng() - 0.5) * 1.6;
    out.pose = APOSE.pounce;
    return out;
  }
  a.a = w.listenA ?? a.a; w.hd = a.a;   // (listening: turned to the rustle)
  return out;
}

// ---- the birds of prey: up in the air ---------------------------------------------------------------------------
// Soaring: circling over its country (now and then moving the circle on, never far from where it came), looking down;
// a stoop onto a rabbit (takeDown: off with it), a plunge into the water feet first - the splash - and up again with a
// fish or without; carrying it off over the trees, gone (cleared away once out of sight).
function airMove(world, a, w, S, dt, now) {
  const top = S.fly || 300;
  let h = a.a, sp = top * 0.4;
  switch (w.state) {
    case 'soar': {
      if (w.soarR === undefined) { w.soarR = 160 + rng() * 120; w.soarDir = rng() < 0.5 ? 1 : -1; w.soarA = Math.atan2(a.y - w.hy, a.x - w.hx); }
      w.soarA += (sp / w.soarR) * dt * w.soarDir;
      const tx = w.hx + Math.cos(w.soarA + 0.35 * w.soarDir) * w.soarR, ty = w.hy + Math.sin(w.soarA + 0.35 * w.soarDir) * w.soarR;
      h = turnTo(a.a, Math.atan2(ty - a.y, tx - a.x), 1.6 * dt);
      w.pose = APOSE.soar;
      if (now > w.until) {
        const H0 = w.home || { x: w.hx, y: w.hy }, ang = rng() * 6.28, r = rng() * 600;
        w.hx = H0.x + Math.cos(ang) * r; w.hy = H0.y + Math.sin(ang) * r; setState(w, 'soar', now, 20 + rng() * 25);
      }
      if (now >= (w.lookAt || 0)) { w.lookAt = now + 0.8 + rng() * 0.6; raptorLook(world, a, S, now); }
      break;
    }
    case 'stoop': {   // dropping on it, wings folded
      const q = world.get(w.huntOf);
      if (!q || q.removed || q.dead || now > w.until || !preyOk(q, S.hunts) || peopleNear(world, q.x, q.y, PEOPLE_R * 0.8, watcher(w, now))) { endHunt(world, a, now, 'stoop'); return; }
      const dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy) || 1;
      h = Math.atan2(dy, dx); sp = Math.min(top * 1.2, d / dt);
      w.pose = APOSE.stoop;
      if (d < 16) {
        if (rng() < 0.6) { takeDown(world, a, q, now); return; }
        w.huntOf = 0; w.nextHunt = now + 20 + rng() * 20; setState(w, 'soar', now, 12 + rng() * 10);   // (missed: up again)
      }
      break;
    }
    case 'plunge': {   // down onto the water feet first - the splash - and up again
      if (w.splashAt) {
        a.vx = a.vy = 0; w.sp = 0; w.pose = APOSE.dive;
        if (now - w.splashAt > 0.8) {
          w.splashAt = 0;
          if (rng() < S.fishes.p) { w.fishCaught = (w.fishCaught || 0) + 1; carryOff(world, a, w, 'fish', now); }
          else { setState(w, 'soar', now, 12 + rng() * 12); w.nextHunt = now + 8 + rng() * 8; }
        }
        return;
      }
      if (now > w.until) { setState(w, 'soar', now, 12); return; }
      const dx = w.px - a.x, dy = w.py - a.y, d = Math.hypot(dx, dy) || 1;
      if (d < 8) { w.splashAt = now; world.emit(a.x, a.y, { e: 'splash', x: a.x, y: a.y, big: 1 }); return; }
      h = Math.atan2(dy, dx); sp = Math.min(top * 1.1, d / dt);
      w.pose = APOSE.stoop;
      break;
    }
    case 'carry': {   // off with it, over the trees and away
      sp = top * 0.55; h = w.fa;
      w.pose = w.carry === 'fish' ? APOSE.carryFish : APOSE.carryGame;
      if (now > w.until) w.flewOff = true;
      break;
    }
    default: break;
  }
  a.x += Math.cos(h) * sp * dt; a.y += Math.sin(h) * sp * dt;
  a.vx = Math.cos(h) * sp; a.vy = Math.sin(h) * sp; a.a = h; w.sp = sp; w.hd = h;
  world.place(a);
}
const turnTo = (from, to, max) => { const e = wrapA(to - from); return Math.abs(e) <= max ? to : from + Math.sign(e) * max; };
function carryOff(world, a, w, what, now) {
  w.carry = what; w.huntOf = 0; w.splashAt = 0; w.nextHunt = now + 200;
  // away from whoever's about (off out of their sight), else on the way it was going
  let ang = a.a, best = 1600;
  for (const p of world.players.values()) { const q = p.ped; if (!q || q.dead) continue; const d = Math.hypot(q.x - a.x, q.y - a.y); if (d < best) { best = d; ang = Math.atan2(a.y - q.y, a.x - q.x) + (rng() - 0.5) * 0.8; } }
  w.fa = ang; setState(w, 'carry', now, 7 + rng() * 4);
}
// up there, looking down: a rabbit in the open (the eagle); a fish near the surface below (the osprey, the eagle)
function raptorLook(world, a, S, now) {
  const w = a.wild;
  if (now < (w.nextHunt || 0) || peopleNear(world, a.x, a.y, PEOPLE_R, watcher(w, now))) return;
  w.nextHunt = now + 2.5 + rng() * 3;
  if (S.hunts && rng() < S.hunts.p) { const q = preyNear(world, a, S.hunts, a.x, a.y); if (q) { startHunt(world, a, q, now); return; } }
  if (S.fishes && rng() < (S.hunts ? 0.3 : 0.55)) for (let k = 0; k < 10; k++) {
    const ang = rng() * 6.28, r = 40 + rng() * 170, x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r;
    if (freshAt(world.map, x, y) || (wet(world.map, x, y) && kelpAt(world.map, x, y))) { w.px = x; w.py = y; w.splashAt = 0; setState(w, 'plunge', now, 5); return; }
  }
}
// dev / tests: a bird of prey drops into the water at (x, y)
export function startPlunge(world, a, x, y, now = world.time) { const w = a.wild; w.px = x; w.py = y; w.splashAt = 0; setState(w, 'plunge', now, 6); return true; }

// ---- moving -----------------------------------------------------------------------------------------------------
// A heading near ang that's open for a few tiles (water is open to swimmers; birds fly over everything).
function steer(map, a, ang, swims, dist = 70) {
  for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.9, -1.9, 2.6, -2.6]) {
    const t = ang + off;
    let ok = true;
    for (const f of [0.5, 1]) {
      const tt = map.tileAtPx(a.x + Math.cos(t) * dist * f, a.y + Math.sin(t) * dist * f);
      if (tt === T.WALL || tt === T.BUILDING || (!swims && WATER_T[tt])) { ok = false; break; }
    }
    if (ok) return t;
  }
  return ang + Math.PI;
}

function step(world, a, dt, now, ph) {
  const w = a.wild, S = SPECIES[w.kind], map = world.map;
  if (!S) return stepLivestock(world, a, dt, now);
  // wounded and bleeding (an arrow, a knife, a shot that didn't kill): it bleeds out over a minute or two, leaving
  // a trail; once it's weak it beds down somewhere - follow the blood and finish it
  if (a.bleeding) {
    a.hp -= BLEED_HP[S.size] * dt;
    if (a.hp <= 0) { combat.kill(world, a, world.get(a.lastHitBy), 'bleed', a.a); return; }
    if (a.hp < a.maxHp * 0.22 && w.state !== 'rest' && w.state !== 'charge' && w.state !== 'attack' && w.state !== 'dive' && w.state !== 'fly' && !S.swims) {
      w.rest = true; w.hurtRest = true; setState(w, 'rest', now, 999); w.aware = 0.3;
    }
  }
  if (now >= w.think) { w.think = now + 0.22 + rng() * 0.08; think(world, a, S, now, ph); }
  // (a heron wades; a bear goes into the river to fish; anything stood in the water can get out of it)
  let mx = 0, my = 0, speed = S.walk, pose = APOSE.auto, swim = !!S.swims || !!S.wader || w.state === 'fish' || w.state === 'tofish' || wet(map, a.x, a.y), goal = Infinity;   // (goal: how far off where it's going is)
  const limp = a.hp < a.maxHp * 0.5 && !w.young ? 0.65 : 1;
  switch (w.state) {
    case 'flee': case 'scatter': case 'trotoff': {
      if (now > w.until) {
        if (w.state === 'scatter') { setState(w, 'regroup', now, 6); break; }
        setState(w, 'idle', now, 2 + rng() * 4); w.hx = a.x; w.hy = a.y; w.aware *= 0.5; break;   // settles where it ran to
      }
      if (now < (w.startle || 0)) { pose = APOSE.alert; face(a, w.fx, w.fy); break; }   // (the start: head up, a look)
      let ang = fleeAngle(world, a, w, swim && w.kind !== 'deer', now) + (w.bias || 0);
      if (S.zig && w.state === 'flee') ang += Math.sin(now * 7 + a.id) * 0.7;   // a rabbit jinks
      mx = Math.cos(ang); my = Math.sin(ang);
      speed = (w.state === 'trotoff' ? S.trot : S.run) * limp * (w.young ? 0.85 : 1) * tired(w, now);
      break;
    }
    case 'regroup': {   // the covey calls back to the hen
      const mom = w.mother ? world.get(w.mother) : herdLead(world, a);
      if (!mom || mom === a || now > w.until) { setState(w, 'idle', now, 2); break; }
      const dx = mom.x - a.x, dy = mom.y - a.y, d = Math.hypot(dx, dy);
      if (d > 26) { mx = dx / d; my = dy / d; speed = S.trot; goal = d; } else setState(w, 'idle', now, 2);
      if (!w.young && rng() < 0.02) pose = APOSE.call;
      break;
    }
    case 'alert': pose = APOSE.alert; if (now > w.until) setState(w, 'idle', now, 1 + rng() * 2); break;
    case 'follow': {   // curious: keeps its distance, trailing after you
      const q = world.get(w.tid);
      if (!q || now > w.until) { setState(w, 'idle', now, 2); break; }
      const dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy);
      if (d > 300) { mx = dx / d; my = dy / d; speed = S.walk * 1.2; goal = d; } else { pose = APOSE.alert; face(a, q.x, q.y); }
      break;
    }
    case 'warn': {   // stands its ground: rears, huffs, hisses, stamps
      const q = world.get(w.warnOf);
      pose = w.kind === 'blackbear' || w.kind === 'grizzly' ? APOSE.rear : APOSE.warn;
      if (q) face(a, q.x, q.y);
      if (now > w.until) {
        const d = q ? Math.hypot(q.x - a.x, q.y - a.y) : 999;
        // backed off: it settles; still coming on: it charges (or turns away)
        if (!q || q.dead || d > (S.warnAt || 120) * 1.15) { setState(w, 'alert', now, 3); w.bluffs = Math.max(0, w.bluffs - 1); }
        else if (!canReach(w, q.id, now)) setState(w, 'alert', now, 2);   // (across a fence from it: it stares)
        else if (rng() < (S.charges || 0.3) + (w.withYoung ? 0.25 : 0)) charge(world, a, q.id, now, w.bluffs < 1 && rng() < 0.55);
        else { flee(world, a, q.x, q.y, now, 2.5); }
      }
      break;
    }
    case 'charge': {
      const q = world.get(w.chargeOf);
      if (!q || q.dead || q.hidden || q.vehId || now > w.until) { setState(w, 'alert', now, 2); break; }
      const dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy);
      pose = APOSE.charge;
      if (w.bluff && d < 70) { setState(w, 'warn', now, 1.5); w.warnOf = q.id; break; }   // a bluff: it pulls up short
      mx = dx / d; my = dy / d; speed = S.run * limp; goal = d;
      if (d < (a.r || 12) + 20) { setState(w, 'attack', now, 2.5 + rng() * 2); w.attackOf = q.id; }
      break;
    }
    case 'attack': {
      const q = world.get(w.attackOf);
      if (!q || q.dead || q.hidden || q.vehId || now > w.until) {
        // done: it backs off and goes (a predator over its prey stays a moment)
        if (q && q.dead && w.predator) { setState(w, 'eat', now, 8 + rng() * 6); break; }
        flee(world, a, q ? q.x : a.x - Math.cos(a.a) * 30, q ? q.y : a.y - Math.sin(a.a) * 30, now, 3); w.stalkOf = 0; break;
      }
      const dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy);
      face(a, q.x, q.y); pose = APOSE.attack;
      if (d > (a.r || 12) + 30) { mx = dx / d; my = dy / d; speed = S.run * 0.8; goal = d; }
      else if (now >= w.nextBite) bite(world, a, q, S, now);
      break;
    }
    case 'eat': pose = APOSE.eat; if (now > w.until) setState(w, 'idle', now, 3); break;
    case 'stalk': {
      // keeps behind its prey and out of its sight, closes in while it's turned away, freezes when it looks round,
      // and rushes it from close in; gives up at daybreak or if the prey gets company or a car
      const q = world.get(w.stalkOf);
      if (!q || q.dead || q.vehId || q.hidden || now > w.until || (!ph.night && !ph.dawnDusk)) { w.stalkOf = 0; setState(w, 'idle', now, 4); w.nextPrey = now + 90; break; }
      const dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy);
      const watched = Math.cos(Math.atan2(-dy, -dx) - q.a) > 0.5 && d < 520;   // in front of them
      face(a, q.x, q.y);
      if (watched && d < 380) { pose = APOSE.alert; if (d < 200 && rng() < 0.012) { flee(world, a, q.x, q.y, now, 3); w.nextPrey = now + 120; } }   // seen: freeze (and maybe slip away)
      else if (d > 130) { mx = dx / d; my = dy / d; speed = (S.stalk || S.walk * 0.7) * (d > 420 ? 1.8 : 1); pose = APOSE.stalk; goal = d; }
      else { charge(world, a, q.id, now, false); }
      break;
    }
    // ---- the hunt (below) ----
    case 'hunt': case 'rush': { const h = huntMove(world, a, w, S, now, limp); mx = h.mx; my = h.my; speed = h.speed; pose = h.pose; goal = h.goal; break; }
    case 'feed': {   // on its kill, head down; the pack round it
      const q = world.get(w.feedOn);
      if (!q || q.removed || !q.dead || now > w.until) { doneFeeding(world, a, w, q, now); break; }
      const dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy) || 1, near = (a.r || 10) + (q.r || 8) + 2;
      if (d > near + 6) { mx = dx / d; my = dy / d; speed = S.trot * 0.6; goal = d - near; }
      else { face(a, q.x, q.y); pose = APOSE.eat; }
      break;
    }
    case 'tofish': {   // down to its fishing spot (into the shallows, the white water under the falls)
      const dx = w.wx - a.x, dy = w.wy - a.y, d = Math.hypot(dx, dy);
      if (d < 12 || now > w.until) { beginFishing(world, a, w, S, now); break; }
      mx = dx / d; my = dy / d; speed = S.walk * (S.bird ? 0.8 : 1); goal = d;
      break;
    }
    case 'fish': { const f = fishMove(world, a, w, S, now); mx = f.mx; my = f.my; speed = f.speed; pose = f.pose; goal = f.goal; break; }
    case 'tobank': {   // an otter with its fish, out onto the bank to eat it
      const dx = w.wx - a.x, dy = w.wy - a.y, d = Math.hypot(dx, dy);
      if (d < 10 || now > w.until || (ground(map, a.x, a.y) && d < 40)) { setState(w, 'eatfish', now, 8 + rng() * 5); break; }
      mx = dx / d; my = dy / d; speed = wet(map, a.x, a.y) ? (S.swim || 90) * 0.6 : S.walk; goal = d;
      break;
    }
    case 'eatfish': pose = APOSE.eat; if (now > w.until) { setState(w, 'idle', now, 3 + rng() * 3); w.nextFish = now + 25 + rng() * 30; } break;
    case 'mouse': { const f = mouseMove(world, a, w, S, now); mx = f.mx; my = f.my; speed = f.speed; pose = f.pose; break; }
    case 'soar': case 'stoop': case 'plunge': case 'carry': airMove(world, a, w, S, dt, now); return;
    case 'towater': {
      const dx = w.wx - a.x, dy = w.wy - a.y, d = Math.hypot(dx, dy);
      if (d < 10 || wet(map, a.x, a.y) || now > w.until) { divesFrom(world, a, now); break; }
      mx = dx / d; my = dy / d; speed = S.run; goal = d;
      break;
    }
    case 'dive': {   // under the water: gone from sight, moving away under the surface; comes up again later
      pose = APOSE.dive;
      const ang = steer(map, a, Math.atan2(a.y - (w.fy || a.y), a.x - (w.fx || a.x)), true, 40);
      if (wet(map, a.x + Math.cos(ang) * 30, a.y + Math.sin(ang) * 30)) { mx = Math.cos(ang); my = Math.sin(ang); speed = (S.swim || 80) * 0.5; }
      if (now > w.until) { a.hidden = false; setState(w, 'idle', now, 3); w.aware = 0.3; world.emit(a.x, a.y, { e: 'splash', x: a.x, y: a.y }); }
      break;
    }
    case 'fly': {   // up and away over everything (beating up to speed); lands somewhere out of the way (or keeps going)
      const top = S.fly || 260, fsp = w.fsp = Math.min(top, Math.max(top * 0.35, (w.fsp || 0) + top * 2.2 * dt));
      a.x += Math.cos(w.fa) * fsp * dt; a.y += Math.sin(w.fa) * fsp * dt;
      a.vx = Math.cos(w.fa) * fsp; a.vy = Math.sin(w.fa) * fsp; a.a = w.fa;
      world.place(a);
      w.pose = APOSE.fly;
      if (now > w.until && S.soars) { setState(w, 'soar', now, 15 + rng() * 15); w.hx = a.x; w.hy = a.y; return; }   // (a bird of prey: back up to soaring, away from you)
      if (now > w.until) {
        const okLand = w.kind === 'duck' || w.kind === 'goose' ? (wet(map, a.x, a.y) || ground(map, a.x, a.y)) : S.wader ? ground(map, a.x, a.y) || shallowAt(map, a.x, a.y) : ground(map, a.x, a.y);   // (a heron: on the bank or in the shallows)
        // (it glides in: moveLike brings it down from its flying speed)
        if (okLand && (rng() < 0.7 || w.backTo)) { setState(w, 'idle', now, 3); w.hx = a.x; w.hy = a.y; w.hd = w.fa; w.sp = Math.min(fsp, (S.run || 150) * 1.2); if (S.wader) { w.backTo = null; w.nextFish = 0; w.until = now + 1; } }
        else if (now > w.until + 4) w.flewOff = true;   // gone: cleared away once out of sight (populate)
      }
      return;
    }
    case 'totree': {   // a squirrel up a tree: on the trunk, round the far side
      const tr = w.tree;
      if (!tr || now > w.until) { setState(w, 'idle', now, 2); break; }
      // (up it once it's at the trunk: its body - PED_RADIUS to the trunk's solid circle - never gets nearer than that;
      // it used to run at the bark for good, task #422)
      const dx = tr.x - a.x, dy = tr.y - a.y, d = Math.hypot(dx, dy);
      if (d > tr.r + PED_RADIUS + 5) { mx = dx / d; my = dy / d; speed = S.run; }
      else { setState(w, 'climb', now, 8 + rng() * 8); a.x = tr.x + (rng() - 0.5) * 6; a.y = tr.y + 2; a.vx = a.vy = 0; w.sp = 0; w.pose = APOSE.climb; world.place(a); return; }
      break;
    }
    case 'climb': {   // up the trunk - off the ground, where nothing pushes it about - until it's sure it's safe
      pose = APOSE.climb;
      if (now > w.until && w.aware < 0.5) { setState(w, 'idle', now, 2); a.y += tr0(w) + 10; break; }
      a.vx = a.vy = 0; w.sp = 0; w.pose = pose; world.place(a);
      return;
    }
    case 'walk': {
      const dx = w.wx - a.x, dy = w.wy - a.y, d = Math.hypot(dx, dy);
      if (d < 8 || now > w.until) { setState(w, 'idle', now, 2 + rng() * 6); w.act = w.drink && d < 8 ? APOSE.drink : activityPose(w, S, map, a); break; }
      mx = dx / d; my = dy / d; speed = w.slow ? S.walk * 0.7 : S.walk; goal = d;
      break;
    }
    case 'work': {   // a beaver at its pond: off to a tree on the bank to gnaw, back to the dam with a branch, into the lodge
      const dx = w.wx - a.x, dy = w.wy - a.y, d = Math.hypot(dx, dy);
      if (d > 12) { mx = dx / d; my = dy / d; speed = wet(map, a.x, a.y) ? S.swim * 0.5 : S.walk; }
      else { pose = APOSE.gnaw; if (now > w.until) setState(w, 'idle', now, 1 + rng() * 2); }
      break;
    }
    case 'rest': {
      pose = APOSE.rest;
      // (bedded down hurt, it only gets up and staggers off when someone's right on it)
      const up = w.hurtRest ? w.aware > 1.2 && rng() < 0.3 : now > w.until || w.aware > 0.4;
      if (up) { w.rest = false; w.hurtRest = false; if (w.tx !== undefined && w.aware > 0.4) flee(world, a, w.tx, w.ty, now, 2); else setState(w, 'idle', now, 1); }
      break;
    }
    default: {   // idle: whatever it does when it's standing about, and every so often somewhere else to go
      if (S.soars) { setState(w, 'soar', now, 15 + rng() * 15); w.hx = a.x; w.hy = a.y; return; }   // (a bird of prey stays up)
      pose = w.act || APOSE.auto;
      // head down feeding, it looks up and round every few seconds (warier when it has young, and the legends)
      if (HEAD_DOWN.has(pose)) {
        if (now >= (w.scanAt || 0)) { w.scanUntil = now + 0.8 + rng() * 0.9; w.scanAt = w.scanUntil + (w.withYoung || w.legend ? 1.2 : 2) + rng() * 5; }
        if (now < w.scanUntil) pose = APOSE.alert;
      }
      if (now > w.until) wander(world, a, S, now, ph);
      // the young and the flock keep near their leader (not while a fence or a wall is in the way: herdOff, giveUp)
      const lead = w.mother ? world.get(w.mother) : (!w.lead && w.herd ? herdLead(world, a) : null);
      if (lead && lead !== a && !lead.dead && now >= (w.herdOff || 0)) {
        const dx = lead.x - a.x, dy = lead.y - a.y, d = Math.hypot(dx, dy), keep = w.young ? 34 : 90;
        if (d > keep) { mx = dx / d; my = dy / d; speed = d > keep * 3 ? S.trot : S.walk; pose = APOSE.auto; goal = d - keep * 0.5; }
      }
    }
  }
  // round whatever's in its way - or, boxed in, it gives up what it was doing (task #422). (Not up a tree or to a beaver's
  // tree on the bank: there it's the trunk it's going for. Under the water it keeps to the water: dive.)
  if ((mx || my) && w.state !== 'totree' && w.state !== 'work' && w.state !== 'dive' && !a.hidden) [mx, my] = wayRound(world, a, w, mx, my, swim, goal, now);
  if (S.swims === 'float' && wet(map, a.x, a.y) && pose === APOSE.auto && Math.hypot(mx, my) < 0.1) pose = APOSE.float;
  w.pose = pose;
  const mv = moveLike(a, w, S.size, S.run, mx, my, speed, dt, now);
  const mods = players.pedMods(world, a);
  mods.speedMul = mv[2] / PED.walk; mods.canSprint = false; mods.canSwim = swim;
  pedStep(a, { bits: 0, mx: mv[0], my: mv[1], aim: a.a }, dt, map, mods);
  world.place(a);
  unstick(world, a, w, now);
}
// How an animal moves (between what it means to do and the legs): it turns at its own rate - quick for the small,
// ponderous for the big - and speeds up and slows down instead of going from standing to flat out in a step; it
// slows into a sharp turn and turns about on the spot from a stand. Returns [mx, my, speed] for pedStep.
const AGILITY = { tiny: [11, 6], small: [8.5, 4.5], medium: [6, 3], large: [4.2, 2.2], huge: [3.4, 1.7] };   // turn (rad/s), acceleration (x its run speed, /s)
function moveLike(a, w, size, run, mx, my, speed, dt, now) {
  const ag = AGILITY[size] || AGILITY.medium, ml = Math.hypot(mx, my);
  let hd = w.hd ?? a.a, sp = w.sp || 0, tgt = ml > 0.05 ? speed * Math.min(1, ml) : 0;
  if (sp < 6) hd = a.a;   // (standing: it starts from the way it faces)
  if (ml > 0.05) {
    const want = Math.atan2(my, mx), err = wrapA(want - hd), turn = ag[0] * (w.state === 'flee' && sp < 60 ? 1.6 : 1) * dt;   // (a bolting animal spins round)
    hd = Math.abs(err) <= turn ? want : hd + Math.sign(err) * turn;
    tgt *= 0.3 + 0.7 * Math.max(0, Math.cos(err));
  }
  const acc = Math.max(run, 120) * ag[1] * dt;
  sp = tgt > sp ? Math.min(tgt, sp + acc) : Math.max(tgt, sp - acc * 1.6);
  w.hd = hd; w.sp = sp;
  return sp > 0.5 ? [Math.cos(hd), Math.sin(hd), sp] : [0, 0, 0];
}
const wrapA = (x) => { while (x > Math.PI) x -= Math.PI * 2; while (x < -Math.PI) x += Math.PI * 2; return x; };
// Going nowhere for half a second while it means to move (whatever wayRound didn't see coming: a corner, another
// animal, a car that pulled up): it gives that up (giveUp). (From an amble too: the farm animals walk at under 30 px/s,
// and a cow that walked into its pasture's fence used to lean on it until it got bored - task #422.)
function unstick(world, a, w, now) {
  const P = w.prog || (w.prog = { x: a.x, y: a.y, t: now, exp: 0 });
  if ((w.sp || 0) > 12) {
    P.exp += (w.sp || 0) * (now - (P.last ?? now));
    if (now - P.t > 0.5) {
      if (Math.hypot(a.x - P.x, a.y - P.y) < P.exp * 0.3) giveUp(world, a, w, now);
      else w.stuck = 0;
      P.x = a.x; P.y = a.y; P.t = now; P.exp = 0;
    }
  } else { P.x = a.x; P.y = a.y; P.t = now; P.exp = 0; }
  P.last = now;
}
// Blocked where it means to go (wayRound: boxed in, no nearer for going round, or right up against what's between it
// and where it's going; unstick: going nowhere), it gives that up instead of pushing on into the wall (task #422):
// that way is kept off for a while (fleeAngle takes another); a walk ends there (it picks somewhere it can get to
// next: wander); a charge, an attack or a stalk on someone it can't get at is given up, and it won't come at them again
// for UNREACH_S (it stares across at them instead); keeping up with its herd or its mother, it stays where it is a
// while.
const UNREACH_S = 8;
const canReach = (w, id, now) => !(id && w.unreach === id && now < (w.unreachUntil || 0));
function giveUp(world, a, w, now) {
  w.blockA = w.hd ?? a.a; w.blockUntil = now + 1.5; w.fhAt = 0; w.stuck = (w.stuck || 0) + 1;
  switch (w.state) {
    case 'walk': case 'regroup': case 'follow': case 'work': case 'towater': case 'totree': case 'tofish': case 'tobank':
      setState(w, 'idle', now, 0.4 + rng() * 0.8); break;
    case 'hunt': case 'rush':   // (a trunk in the way: a stumble round it; still stuck - the far side of a fence or a river from it - not this one)
      if (w.stuck > 4) endHunt(world, a, now, 'blocked'); else w.missUntil = now + 0.4;
      break;
    case 'charge': case 'attack': case 'stalk': {
      w.unreach = w.state === 'charge' ? w.chargeOf : w.state === 'attack' ? w.attackOf : w.stalkOf;
      w.unreachUntil = now + UNREACH_S;
      if (w.state === 'stalk') { w.stalkOf = 0; w.nextPrey = now + 45; }
      setState(w, 'alert', now, 1.5 + rng());
      break;
    }
    case 'idle': w.herdOff = now + 4 + rng() * 4; break;
    default: break;   // (running away: fleeAngle keeps off that way)
  }
}
// A walk that has come right up against what's between it and where it was going (the water's edge it came down to
// drink at): that's as near as it gets - it's there.
function arrive(world, a, w, now) {
  const S = SPECIES[w.kind];
  setState(w, 'idle', now, S ? 2 + rng() * 6 : 3 + rng() * 9);
  if (S) w.act = w.drink ? APOSE.drink : activityPose(w, S, world.map, a);
}

// ---- getting round things (task #422) ---------------------------------------------------------------------------
// What's in an animal's way: the tiles it can't cross (walls and cliffs, buildings, the water for one that doesn't
// swim, a highway's embankment: physics.js), the fences, trunks and rocks (solid props), and the vehicles standing
// still (parked, a wreck; one on the move gets out of the way). Its body is as wide as physics.js makes everyone
// (PED_RADIUS) - or its own size if that's bigger (what the cars push it by: vehicles.js).
const bodyR = (a) => Math.max(PED_RADIUS, a.r || 10);
function solidAt(map, x, y, block) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), lb = map.lvl0Block;
  return !!block[map.tileAt(tx, ty)] || (!!lb && map.inside(tx, ty) && lb[map.idx(tx, ty)] === 1);
}
function propAt(map, x, y, r, minR = 0) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const arr = map.solidProps.get(map.idx(tx + i, ty + j));
    if (arr) for (const p of arr) if (!p.off && p.r >= minR && Math.hypot(p.x - x, p.y - y) < p.r + r) return true;
  }
  return false;
}
// the vehicles standing still within reach of it (null: none)
function parkedNear(world, a, reach) {
  let out = null;
  for (const v of world.query(a.x, a.y, reach + 130, K.VEH)) if (!v.removed && !v.fly && !((v.alt || 0) > FLY.HIGH) && Math.abs(v.vx) + Math.abs(v.vy) < 40 && sameLevel(a.lz, v.lz)) (out ||= []).push(v);   // (a helicopter hovering over it: not in its way)
  return out;
}
const carAt = (cars, x, y, r) => { if (cars) for (const v of cars) if (circleVsObb(x, y, r, v.x, v.y, v.a, v.def.L / 2, v.def.W / 2)) return true; return false; };
// How far its body can go along heading t before it touches any of that (px, in 8 px steps up to max): the tiles under
// its nose and either flank, and the props and cars round its middle.
function clearRun(map, a, t, swims, max, cars = null) {
  const c = Math.cos(t), s = Math.sin(t), R = bodyR(a), f = R - 2, block = swims ? SWIM_BLOCK : PED_BLOCK;
  for (let d = 8; d <= max + 0.1; d += 8) {
    const x = a.x + c * d, y = a.y + s * d;
    if (solidAt(map, x + c * f, y + s * f, block) || solidAt(map, x - s * f, y + c * f, block) || solidAt(map, x + s * f, y - c * f, block)
      || propAt(map, x, y, R - 1) || carAt(cars, x, y, R - 1)) return d - 8;
  }
  return max;
}
// Round what's in its way: blocked within `look` px, it turns along the obstacle - a wall, a fence, a building, a
// trunk, a parked car - the first time toward whichever side is nearer where it means to go, then keeping to that
// side until it's round (no dithering at a flat wall: the other side only if this one is shut). Boxed in every way it
// could take (up to ~140 degrees off either side): null.
function detour(map, a, w, ang, swims, look, now, cars) {
  if (clearRun(map, a, ang, swims, look, cars) >= look) { if (now > (w.sideUntil || 0)) w.side = 0; return ang; }
  // (no side yet: the smaller turn, either way; a side taken: that side first, the other only if it's shut)
  for (let n = 0; n < 16; n++) {
    const k = w.side ? 1 + (n & 7) : 1 + (n >> 1), sd = w.side ? (n < 8 ? w.side : -w.side) : (n & 1 ? -1 : 1), t = ang + sd * k * 0.3;
    if (clearRun(map, a, t, swims, look, cars) >= look) { w.side = sd; w.sideUntil = now + 1.2; return t; }
  }
  return null;
}
// Its way (mx, my) toward somewhere `goal` px off (Infinity: just a heading - running away) round what's in it.
// Walking somewhere and right up against what's between it and the spot (the water's edge it came down to drink at),
// it's there (arrive). Boxed in, or going round for 3 s without getting any nearer (a fence too long to go round - its
// herd on the far side of it, someone it was charging over a wall), it gives up what it was doing (giveUp) and stops.
// Returns [mx, my].
function wayRound(world, a, w, mx, my, swims, goal, now) {
  const ml = Math.hypot(mx, my);
  if (ml < 0.05) return [mx, my];
  const look = Math.min(goal, 24 + Math.min(40, (w.sp || 0) * 0.15));
  if (look < 6) return [mx, my];
  const map = world.map, cars = parkedNear(world, a, look + 40), ang = Math.atan2(my, mx);
  if (w.state === 'walk') {
    const run = clearRun(map, a, ang, swims, look, cars);
    if (run < look && goal - run <= bodyR(a) + 8) { w.slideAt = 0; arrive(world, a, w, now); return [0, 0]; }   // (as near as it gets)
  }
  const t = detour(map, a, w, ang, swims, look, now, cars);
  if (t !== null && t !== ang && goal < Infinity) {
    if (!w.slideAt || goal < w.slideBest - 20) { w.slideAt = now; w.slideBest = goal; }
    else if (now - w.slideAt > 3) { w.slideAt = 0; giveUp(world, a, w, now); return [0, 0]; }
  } else w.slideAt = 0;
  if (t === null) { giveUp(world, a, w, now); return [0, 0]; }
  return [Math.cos(t) * ml, Math.sin(t) * ml];
}
// a straight walk from where it is to (x, y), with nothing in the way and room for it there
function openTo(world, a, x, y, swims) {
  const d = Math.hypot(x - a.x, y - a.y);
  return d < 12 || clearRun(world.map, a, Math.atan2(y - a.y, x - a.x), swims, d - 4, parkedNear(world, a, d)) >= d - 4;
}
// Which way to run: open ground (the tiles, the trunks and rocks and the cars standing along the way, ~200 px out)
// mostly away from the threat, holding its line (no dithering), not back into a way it just found blocked, and not
// straight back past the threat while it's close. Cornered - no way open away from it (a pocket of rocks, a fence
// corner, the shore) - it takes the way out, past the threat at an angle if it must, and keeps to it until it's out.
// Re-chosen four times a second (cornered: once it has had time to get out).
const FLEE_CLEAR = new Float32Array(16);
function fleeAngle(world, a, w, swims, now) {
  if (w.fh !== undefined && now < (w.fhAt || 0)) return w.fh;
  const map = world.map, cars = parkedNear(world, a, 200);
  const away = Math.atan2(a.y - w.fy, a.x - w.fx), dTh = Math.hypot(a.x - w.fx, a.y - w.fy);
  let openAway = 0;
  for (let k = 0; k < 16; k++) {
    const t = away + (k / 16) * Math.PI * 2;
    FLEE_CLEAR[k] = clearAlong(map, a, t, swims, 200, cars);
    if (Math.cos(t - away) > 0.3) openAway = Math.max(openAway, FLEE_CLEAR[k]);
  }
  const cornered = openAway < 100;
  if (cornered) { w.trapX = a.x; w.trapY = a.y; w.trapUntil = now + 4; }   // (and once out, it doesn't go back in)
  const trap = !cornered && now < (w.trapUntil || 0) ? Math.atan2(w.trapY - a.y, w.trapX - a.x) : null;
  let best = away, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const t = away + (k / 16) * Math.PI * 2, clear = FLEE_CLEAR[k], c = Math.cos(t - away);
    let sc;
    if (cornered) sc = (clear / 200) * 2.2 + Math.abs(Math.sin(t - away)) * 0.5 + c * 0.2;   // (the way out, past it at an angle)
    else { sc = (clear / 200) * 1.6 + c; if (dTh < 150 && c < -0.75) sc -= 1.5; }
    if (w.fh !== undefined) sc += Math.cos(t - w.fh) * (cornered ? 0.6 : 0.35);
    if (now < (w.blockUntil || 0) && Math.cos(t - w.blockA) > 0.75) sc -= 2.5;
    if (trap !== null && Math.cos(t - trap) > 0.4) sc -= 2;
    if (clear < 30) sc -= 2.5;   // (blocked right there: never, if anything else is open)
    if (sc > bs) { bs = sc; best = t; }
  }
  w.fh = best; w.fhAt = now + (cornered ? 1.2 : 0.25);
  return best;
}
// how far it can go along heading t before something stops it (px, in 20 px steps up to max)
function clearAlong(map, a, t, swims, max, cars = null) {
  const c = Math.cos(t), s = Math.sin(t), r = (a.r || 10) + 3, block = swims ? SWIM_BLOCK : PED_BLOCK;
  for (let d = 20; d <= max; d += 20) {
    const x = a.x + c * d, y = a.y + s * d;
    if (solidAt(map, x, y, block) || propAt(map, x, y, r, 5) || carAt(cars, x, y, r)) return d - 20;
  }
  return max;
}
const tr0 = (w) => (w.tree ? w.tree.r : 0);
function herdLead(world, a) {
  const w = a.wild;
  if (w.leadId) { const L = world.get(w.leadId); if (L && !L.dead) return L; }
  for (const q of world.query(a.x, a.y, 500, K.PED)) if (q.wild && q.wild.herd === w.herd && q.wild.lead && !q.dead) { w.leadId = q.id; return q; }
  return null;
}
// what it does standing about (by what it eats, and where it is)
function activityPose(w, S, map, a) {
  if (S.swims === 'float' && wet(map, a.x, a.y)) return APOSE.float;
  if (S.wader) return rng() < 0.35 ? APOSE.alert : APOSE.auto;   // (a heron between its fishing: stood still, the neck up)
  if (w.kind === 'turkey' && !w.young && !(a.id & 1) && rng() < 0.3) return APOSE.call;   // (a tom struts: the fan up, the wings down - AN2)
  if (S.swims && wet(map, a.x, a.y)) return S.diet === 'dabble' && rng() < 0.4 ? APOSE.dabble : APOSE.swim;   // (a duck up-ended, feeding)
  switch (S.diet) {
    case 'graze': case 'browse': return rng() < 0.75 ? APOSE.graze : APOSE.auto;
    case 'root': case 'peck': case 'dabble': return rng() < 0.7 ? (S.bird ? APOSE.peck : APOSE.graze) : APOSE.auto;
    case 'forage': return rng() < 0.5 ? APOSE.graze : rng() < 0.3 && S.size === 'large' ? APOSE.rear : APOSE.auto;
    case 'gnaw': return APOSE.gnaw;
    case 'fish': return rng() < 0.4 ? APOSE.eat : APOSE.sit;
    default: return rng() < 0.3 ? APOSE.sit : APOSE.auto;
  }
}
// where to next: somewhere nearby on its kind of ground, never far from its patch, not out on the road; now and then
// down to drink, or (out of its hours) bedded down
function wander(world, a, S, now, ph) {
  const w = a.wild, map = world.map;
  if (w.young || (!w.lead && w.herd && herdLead(world, a))) { w.until = now + 2 + rng() * 3; w.act = activityPose(w, S, map, a); return; }
  if (activity(S, ph) < 0.5 && !S.swims && rng() < 0.5) { w.rest = true; setState(w, 'rest', now, 20 + rng() * 40); return; }
  // a beaver's work
  if (S.works) {
    const bp = (map.beaverPonds || []).find((b) => Math.hypot(b.x - a.x, b.y - a.y) < 400);
    if (bp) { const tgt = rng() < 0.5 && bp.trees && bp.trees.length ? bp.trees[Math.floor(rng() * bp.trees.length)] : rng() < 0.5 ? bp.dam : bp.lodge; if (tgt) { w.wx = tgt.x + (rng() - 0.5) * 16; w.wy = tgt.y + (rng() - 0.5) * 16; setState(w, 'work', now, 10 + rng() * 8); return; } }
  }
  // the fishers go fishing (a heron mostly does nothing else); a fox goes mousing in the long grass (the hunt)
  if (S.fishes && !S.soars && now >= (w.nextFish || 0) && rng() < (S.wader ? 0.8 : S.swims ? 0.45 : 0.3) && activity(S, ph) >= 0.5) {
    w.nextFish = now + 20 + rng() * 25;
    if (startFishing(world, a, now)) return;
  }
  if (S.mouses && now >= (w.nextMouse || 0) && rng() < 0.35 && mousingAt(map, a.x, a.y)) { startMousing(world, a, now); return; }
  // thirsty: down to the water's edge - the shore that way, its nose at the water (it used to make for a spot out in the
  // water, and wade into the edge of it until it gave up and drank where it stood: task #422)
  if (!S.swims && rng() < 0.12) {
    const t = waterDir(map, a.x, a.y, 260);
    if (t) {
      const ang = Math.atan2(t[1] - a.y, t[0] - a.x), c = Math.cos(ang), s = Math.sin(ang), nose = bodyR(a) + 4;
      let d = 0;
      while (d < 300 && !wet(map, a.x + c * (d + nose), a.y + s * (d + nose))) d += 6;
      if (d < 300 && openTo(world, a, a.x + c * d, a.y + s * d, false)) { w.wx = a.x + c * d; w.wy = a.y + s * d; w.state = 'walk'; w.until = now + 10; w.act = APOSE.drink; w.drink = true; return; }
    }
  }
  for (let k = 0; k < 8; k++) {
    const ang = rng() * 6.28, r = 40 + rng() * 170;
    let tx = a.x + Math.cos(ang) * r, ty = a.y + Math.sin(ang) * r;
    if (Math.hypot(tx - w.hx, ty - w.hy) > LEASH) { tx = a.x + (w.hx - a.x) * 0.4; ty = a.y + (w.hy - a.y) * 0.4; }
    const okT = S.swims === 'float' ? wet(map, tx, ty) : S.swims ? (wet(map, tx, ty) || ground(map, tx, ty)) : ground(map, tx, ty);
    if (!okT) continue;
    if (map.tileAtPx((a.x + tx) / 2, (a.y + ty) / 2) === T.ROAD && rng() < 0.85) continue;
    if (!openTo(world, a, tx, ty, !!S.swims)) continue;   // (not the far side of a fence or a wall: task #422)
    w.wx = tx; w.wy = ty; w.state = 'walk'; w.until = now + 9; w.slow = rng() < 0.5; w.drink = false;
    return;
  }
  w.until = now + 2;
}

function stepLivestock(world, a, dt, now) {
  const w = a.wild, L = LIVESTOCK[w.kind] || LIVESTOCK.cow, map = world.map;
  if (now >= w.look) {
    w.look = now + 0.25 + rng() * 0.1;
    for (const p of world.players.values()) {
      const q = p.ped;
      if (!q || q.dead || q.hidden || q.sub) continue;
      const r = q.vehId ? L.alert * 1.25 : L.alert;
      if (Math.hypot(q.x - a.x, q.y - a.y) < r) { if (w.state !== 'flee') { w.startle = now + 0.15 + rng() * 0.25; w.fh = undefined; } w.state = 'flee'; w.fx = q.x; w.fy = q.y; w.until = now + 2.2 + rng() * 2; alarmGroup(world, a, q.x, q.y, now); break; }
    }
    for (const s of world.shotLog) if (now - s.t < 1.2 && Math.hypot(s.x - a.x, s.y - a.y) < 560) { w.state = 'flee'; w.fx = s.x; w.fy = s.y; w.until = now + 3; w.startle = 0; break; }
  }
  let mx = 0, my = 0, speed = L.walk, goal = Infinity;
  if (w.state === 'flee') {
    if (now > w.until) { w.state = 'idle'; w.until = now + 2 + rng() * 5; w.hx = a.x; w.hy = a.y; }
    else if (now < (w.startle || 0)) face(a, w.fx, w.fy);   // (a start: the head comes up)
    else { const ang = fleeAngle(world, a, w, false, now); mx = Math.cos(ang); my = Math.sin(ang); speed = L.run; }
  } else if (w.state === 'walk') {
    const dx = w.wx - a.x, dy = w.wy - a.y, d = Math.hypot(dx, dy);
    if (d < 8 || now > w.until) { w.state = 'idle'; w.until = now + 3 + rng() * 9; } else { mx = dx / d; my = dy / d; goal = d; }
  } else if (now > w.until) {
    for (let k = 0; k < 8; k++) {
      const ang = rng() * 6.28, r = 40 + rng() * 140;
      let tx = a.x + Math.cos(ang) * r, ty = a.y + Math.sin(ang) * r;
      if (Math.hypot(tx - w.hx, ty - w.hy) > LEASH) { tx = a.x + (w.hx - a.x) * 0.4; ty = a.y + (w.hy - a.y) * 0.4; }
      if (!ground(map, tx, ty) || map.tileAtPx((a.x + tx) / 2, (a.y + ty) / 2) === T.ROAD) continue;
      if (!openTo(world, a, tx, ty, false)) continue;   // (not through the pasture's fence: task #422)
      w.wx = tx; w.wy = ty; w.state = 'walk'; w.until = now + 8;
      break;
    }
    if (w.state !== 'walk') w.until = now + 2;
  }
  if (mx || my) [mx, my] = wayRound(world, a, w, mx, my, false, goal, now);   // (round what's in its way: task #422)
  w.pose = w.state === 'idle' && L.graze ? APOSE.graze : w.state === 'flee' && now < (w.startle || 0) ? APOSE.alert : APOSE.auto;
  const mv = moveLike(a, w, w.kind === 'cow' || w.kind === 'horse' ? 'large' : 'medium', L.run, mx, my, speed, dt, now);
  const mods = players.pedMods(world, a);
  mods.speedMul = mv[2] / PED.walk; mods.canSprint = false; mods.canSwim = false;
  pedStep(a, { bits: 0, mx: mv[0], my: mv[1], aim: a.a }, dt, map, mods);
  world.place(a);
  unstick(world, a, w, now);
}

// A bite, a swipe, a gore, a kick: hurt and knocked back.
function bite(world, a, q, S, now) {
  const w = a.wild;
  w.nextBite = now + 0.9 + rng() * 0.5;
  const dir = Math.atan2(q.y - a.y, q.x - a.x);
  const dmg = (S.bite || (S.size === 'huge' ? 34 : S.size === 'large' ? 24 : 14)) * (w.legend ? 1.4 : 1) * (0.8 + rng() * 0.4);
  q.vx += Math.cos(dir) * 170; q.vy += Math.sin(dir) * 170;
  world.emit(q.x, q.y, { e: 'blood', x: q.x, y: q.y, a: dir, n: 6 });
  world.emit(a.x, a.y, { e: 'maul', x: a.x, y: a.y, id: a.id, t: q.id, a: +dir.toFixed(2) });
  combat.damage(world, q, dmg, a, 'claw', dir);
  if (S.size === 'huge' || (S.size === 'large' && rng() < 0.5) || w.kind === 'cougar') q.downUntil = Math.max(q.downUntil || 0, now + 0.9);   // knocked flat
}

// ---- hit and killed ---------------------------------------------------------------------------------------------
// combat.damage notes every hit (the grade of the hide) before the damage lands
export function noteHit(world, a, attacker, cause) {
  if (!a.wild || a.wild.livestock) return;
  const c = huntClass(attacker && attacker.weapon, cause);
  if (c) a.wild.hits.push({ c });
}
// A shot or a knock it lives through: it runs - or turns on whoever did it (combat.js calls this instead of the
// people's reactions and the law). Badly hurt, it limps and bleeds (a trail to follow).
export function onHurt(world, a, attacker) {
  if (!a.wild || a.dead) return;
  const w = a.wild, now = world.time, S = SPECIES[w.kind];
  w.aware = 1.5; w.rest = false;
  if (a.hidden) return;
  const src = attacker || a;
  const sx = attacker ? src.x : a.x - Math.cos(a.a) * 20, sy = attacker ? src.y : a.y - Math.sin(a.a) * 20;
  world.emit(a.x, a.y, { e: 'react', id: a.id, k: 'h', d: 0.3, a: +Math.atan2(a.y - sy, a.x - sx).toFixed(2), x: a.x, y: a.y });
  if (!S) { w.state = 'flee'; w.fx = sx; w.fy = sy; w.until = now + 3; alarmGroup(world, a, sx, sy, now); return; }
  // the dangerous ones may turn on you
  const turn = attacker && attacker.kind === K.PED && !attacker.vehId && (S.hurtCharge || ((S.temper === 'defensive' || S.temper === 'aggressive' || w.predator) ? (S.charges || 0.3) : S.size === 'large' ? (S.charges || 0) * 0.5 : 0));
  if (turn && rng() < turn && a.hp > a.maxHp * 0.25 && w.state !== 'fly' && w.state !== 'dive' && canReach(w, attacker.id, now)) { w.hurtBy = attacker.id; charge(world, a, attacker.id, now, false); alarmGroup(world, a, sx, sy, now); return; }
  flee(world, a, sx, sy, now, 3.5, true);
  alarmGroup(world, a, sx, sy, now);
  if (a.hp < a.maxHp * 0.5) a.limpUntil = now + 999;   // (the limp: the client's blood trail and a slower run)
}
// combat.kill: grade the carcass; the group bolts; a downed bird falls out of the air
export function onKilled(world, a, attacker, cause) {
  const w = a.wild;
  if (!w) return;
  w.state = 'dead'; a.hidden = false;
  if (!w.livestock) w.grade = w.legend ? 3 : gradeOf(w.kind, w.hits);
  w.killedBy = attacker && attacker.player ? attacker.id : 0;
  alarmGroup(world, a, attacker ? attacker.x : a.x, attacker ? attacker.y : a.y, world.time);
  if (world.legendAt && world.legendAt.id === a.id) world.legendAt = null;
  hunting.onKilled(world, a, attacker, cause);
}

export function update(world, dt) {
  if (world.tick % 20 === 9) populate(world);
  if (world.tick % 40 === 3) world.wind = world.windHold || windOf(world);   // (windHold: a test, or the dev panel)
  const now = world.time, ph = phaseOf(world);
  for (const e of world.entities.values()) {
    if (!isAnimal(e) || e.dead || e.ug) continue;   // (the cave's den bear: server/systems/underground.js drives it)
    step(world, e, dt, now, ph);
  }
}

export function animals(world) {
  const out = [];
  for (const e of world.entities.values()) if (isAnimal(e)) out.push(e);
  return out;
}
// what the client draws it doing (net.js: the extra byte)
export function poseOf(e) { return (e.wild && e.wild.pose) || 0; }
export { YOUNG_SCALE };
