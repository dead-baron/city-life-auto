// The people of the wilds (Nature-C4, 2026-10-20, from the concept sheet's twelve): the owner, "only appropriate NPCs in
// secluded natural areas". Each where they belong, doing what they came for, in their kit (client/art2/people.js draws
// it; client/render/actprops.js in the classic view):
//   ranger     a park ranger in the flat-brimmed hat, walking out from the ranger station (and from some trailheads) and
//              back, a word on the radio at each end; talk to one (the action button) and they tell you about the wilds
//              round here - where something worth finding is, what's protected, who hunts what, where the fish are
//   trail      backpackers with trekking poles and a tall pack, or a trail runner, setting off from a trailhead's map
//              board or fingerpost along the trail and back
//   birders    a birdwatcher at the water's edge (a lake, a marsh) with binoculars up, now and then a friend at a spotting
//              scope on its tripod
//   holds      an angler on a creek's, a river's or a lake's bank, the rod out over the water, the tackle box and the net
//              (a river's calm pockets' banks first: shared/world3-rapids.js)
//              at their side (the city's anglers are on the piers: activities.js)
//   kayakers   a kayaker in a life vest walking the shore of a lake with the kayak up on a shoulder and the paddle
//   climbers   two at the foot of a crag in the peaks or the canyons: one with the rope, its end run up the rock, the other
//              down on a knee by the kit (the rope's coil, a helmet, the chalk bag)
//   foragers   a forager with a basket going from one patch of mushrooms (berries, herbs) to the next, down on a knee at
//              each - for show: what's there is still there for you
//   campcook   a camper by the tent, sat in a folding chair cooking at a camp stove, now and then a friend stood by
// - and out on the dirt roads (traffic.js) the mountain bikers in their helmets and the dirt bikers in jersey and helmet;
// the hunter in blaze orange is activities.js's. They're found by rules from the map (wildSpots, once per map, with the
// rest of activities.js's spots), filled and emptied round players like any activity, and they're country folk (npc.js):
// trouble sends them off.
import { K, T, TILE } from '../../shared/constants.js';
import { item } from '../../shared/look.js';
import { FORAGE_KINDS } from '../../shared/foraging.js';
import { WARDEN_FINE } from '../../shared/rules.js';
import { SPECIES } from '../../shared/fauna.js';
import { wildStyle, habitatAt } from './wildlife.js';
import { isBare } from './foraging.js';
import { dress } from './npclooks.js';
import { BUILDS } from '../entities.js';

// day / night: the chance a spot is on when someone comes near (activities.js KINDS)
export const WILD_KINDS = {
  ranger: { day: 0.85, night: 0.3, cap: 1 },
  trail: { day: 0.7, night: 0.04 },
  birders: { day: 0.7, night: 0, cap: 1 },
  holds: { day: 0.7, night: 0.3 },
  kayakers: { day: 0.55, night: 0, cap: 1 },
  climbers: { day: 0.6, night: 0, cap: 1 },
  foragers: { day: 0.6, night: 0, cap: 1 },
  campcook: { day: 0.45, night: 0.6, cap: 1 },
};

// ---- their looks (npclooks.js dress: a pool of looks for each, so a few of them about don't all match) -----------------
const pk = (r, a) => a[Math.floor(r() * a.length) % a.length];
const clear = (L) => { L.outfit.set = null; for (const s of ['top', 'jacket', 'bottoms', 'shoes', 'hat', 'glasses', 'bag', 'jewel']) L.outfit[s] = null; };
const R = (fix, fem = 0.4, styles = [['outdoors', 1]]) => ({ styles, fem, age: [2, 3, 3, 2, 1, 0], shade: 0, builds: 'casual', pool: 8, fix });
export const WILD_LOOKS = {
  ranger: R((L, r) => {   // the khaki shirt, olive trousers, boots and the flat-brimmed hat; now and then the field vest, shades
    clear(L);
    L.outfit.top = item('Work shirt', pk(r, ['khaki', 'khaki', 'tan'])); L.outfit.jacket = r() < 0.35 ? item('Field vest', 'olive', 'khaki') : null;
    L.outfit.bottoms = item('Cargo pants', pk(r, ['olive', 'olive', 'brown'])); L.outfit.shoes = item('Hiking boots', 'brown');
    L.outfit.hat = item('Ranger hat', 'tan', 'brown'); L.outfit.glasses = r() < 0.3 ? item('Sunglasses') : null;
  }, 0.4, [['work', 1]]),
  backpacker: R((L, r) => {   // the tall trekking pack, boots, a sun hat or a cap
    clear(L);
    L.outfit.top = item(pk(r, ['Long-sleeve tee', 'Flannel shirt', 'Thermal top']), pk(r, ['red', 'forest', 'navy', 'mustard', 'teal', 'grey']), 'black');
    L.outfit.jacket = r() < 0.3 ? item(r() < 0.5 ? 'Rain jacket' : 'Puffer vest', pk(r, ['yellow', 'red', 'royal blue', 'forest'])) : null;
    L.outfit.bottoms = item(r() < 0.75 ? 'Cargo pants' : 'Shorts', pk(r, ['khaki', 'olive', 'charcoal', 'tan'])); L.outfit.shoes = item('Hiking boots', pk(r, ['brown', 'tan']));
    L.outfit.hat = r() < 0.6 ? item(r() < 0.5 ? 'Bucket hat' : 'Baseball cap', pk(r, ['khaki', 'tan', 'navy', 'red', 'sand'])) : null;
    L.outfit.bag = item('Trekking pack', pk(r, ['orange', 'forest', 'red', 'royal blue', 'teal']));
  }),
  runner: R((L, r) => {   // a vest or a tee, shorts, the running shoes, a visor or a headband, shades
    clear(L);
    L.outfit.top = item(r() < 0.5 ? 'Tank top' : 'Plain tee', pk(r, ['lime', 'hot pink', 'orange', 'sky', 'white', 'yellow']));
    L.outfit.bottoms = item(r() < 0.7 ? 'Shorts' : 'Leggings', pk(r, ['black', 'charcoal', 'navy'])); L.outfit.shoes = item('Running shoes', pk(r, ['royal blue', 'red', 'white', 'lime']));
    L.outfit.hat = r() < 0.6 ? item(r() < 0.5 ? 'Visor' : 'Headband', pk(r, ['white', 'black', 'red'])) : null; L.outfit.glasses = r() < 0.5 ? item('Sport shades') : null;
  }, 0.5, [['athletic', 1]]),
  birder: R((L, r) => {   // the pocketed field vest over a long-sleeve or a flannel, a bucket hat
    clear(L);
    L.outfit.top = item(r() < 0.5 ? 'Long-sleeve tee' : 'Flannel shirt', pk(r, ['olive', 'sand', 'forest', 'grey']), 'black');
    L.outfit.jacket = r() < 0.7 ? item('Field vest', pk(r, ['khaki', 'tan', 'olive']), 'olive') : null;
    L.outfit.bottoms = item(r() < 0.6 ? 'Cargo pants' : 'Chinos', pk(r, ['khaki', 'olive', 'brown'])); L.outfit.shoes = item('Hiking boots', 'brown');
    L.outfit.hat = item(r() < 0.65 ? 'Bucket hat' : 'Baseball cap', pk(r, ['olive', 'khaki', 'tan'])); L.outfit.glasses = r() < 0.35 ? item('Round glasses') : null;
  }, 0.5),
  kayaker: R((L, r) => {   // the life vest, quick-dry shorts, sandals, a visor or a cap, shades
    clear(L);
    L.outfit.top = item(r() < 0.6 ? 'Long-sleeve tee' : 'Tank top', pk(r, ['teal', 'sky', 'white', 'grey', 'navy']));
    L.outfit.jacket = item('Life vest', pk(r, ['orange', 'red', 'yellow']), 'black');
    L.outfit.bottoms = item('Shorts', pk(r, ['navy', 'black', 'khaki', 'teal'])); L.outfit.shoes = item('Sandals', pk(r, ['black', 'brown']));
    L.outfit.hat = r() < 0.6 ? item(r() < 0.5 ? 'Visor' : 'Baseball cap', pk(r, ['white', 'navy', 'khaki'])) : null; L.outfit.glasses = r() < 0.6 ? item('Sport shades') : null;
  }, 0.45, [['athletic', 1], ['outdoors', 1]]),
  climber: R((L, r) => {   // a vest or a tee, joggers, the climbing helmet, the chalk bag on the belt
    clear(L);
    L.outfit.top = item(r() < 0.5 ? 'Tank top' : 'Plain tee', pk(r, ['charcoal', 'sky', 'lime', 'red', 'white']));
    L.outfit.bottoms = item(r() < 0.6 ? 'Joggers' : 'Cargo pants', pk(r, ['slate', 'charcoal', 'olive', 'sand'])); L.outfit.shoes = item('Sneakers', pk(r, ['red', 'white', 'black', 'orange']));
    L.outfit.hat = item('Climbing helmet', pk(r, ['orange', 'yellow', 'red', 'white'])); L.outfit.bag = item('Belt bag', pk(r, ['red', 'black', 'royal blue']));
  }, 0.45, [['athletic', 1], ['outdoors', 1]]),
  forager: R((L, r) => {   // a flannel or a sweater, a vest, the rain boots or the hiking boots, a beanie
    clear(L);
    L.outfit.top = item(r() < 0.6 ? 'Flannel shirt' : 'Sweater', pk(r, ['mustard', 'burgundy', 'forest', 'cream', 'rust']), 'brown');
    L.outfit.jacket = r() < 0.5 ? item(r() < 0.5 ? 'Puffer vest' : 'Rain jacket', pk(r, ['forest', 'olive', 'navy', 'yellow'])) : null;
    L.outfit.bottoms = item(r() < 0.6 ? 'Cargo pants' : 'Jeans', pk(r, ['brown', 'olive', 'denim'])); L.outfit.shoes = item(r() < 0.5 ? 'Rain boots' : 'Hiking boots', pk(r, ['yellow', 'olive', 'brown']));
    L.outfit.hat = r() < 0.7 ? item(r() < 0.6 ? 'Beanie' : 'Bucket hat', pk(r, ['burgundy', 'mustard', 'forest', 'tan'])) : null;
  }, 0.55),
  // out on the dirt roads (traffic.js): the mountain biker's helmet and shades; the dirt biker's jersey, helmet and boots
  mtbiker: R((L, r) => {
    clear(L);
    L.outfit.top = item(r() < 0.6 ? 'Plain tee' : 'Long-sleeve tee', pk(r, ['lime', 'orange', 'sky', 'red', 'charcoal']));
    L.outfit.bottoms = item(r() < 0.7 ? 'Shorts' : 'Cargo pants', pk(r, ['charcoal', 'black', 'olive'])); L.outfit.shoes = item('Sneakers', pk(r, ['black', 'white', 'orange']));
    L.outfit.hat = item('Bike helmet', pk(r, ['red', 'black', 'white', 'lime', 'royal blue'])); L.outfit.glasses = r() < 0.7 ? item('Sport shades') : null;
    L.outfit.bag = r() < 0.4 ? item('Backpack', pk(r, ['black', 'charcoal', 'red'])) : null;
  }, 0.35, [['athletic', 1]]),
  dirtbiker: R((L, r) => {
    clear(L);
    const c = pk(r, [['red', 'white'], ['royal blue', 'white'], ['yellow', 'black'], ['orange', 'black'], ['lime', 'black'], ['black', 'red']]);
    L.outfit.top = item('MX jersey', c[0], c[1]); L.outfit.bottoms = item('Cargo pants', pk(r, ['black', 'charcoal', c[0]]));
    L.outfit.shoes = item('Biker boots', pk(r, ['black', 'white'])); L.outfit.hat = item('Moto helmet', pk(r, ['white', c[0], 'black']), c[1]);
  }, 0.2, [['athletic', 1]]),
};
// dress someone as one of the wilds' people (as activities.js dressAs; traffic.js for its riders)
export function dressWild(world, ped, look, rng) {
  const rec = WILD_LOOKS[look];
  if (!rec || !ped) return;
  const g = dress(world, 'w:' + look, ped.x, ped.y, !!(world.clock && world.clock.isNight), rng, rec);
  if (!g) return;
  const old = ped.build, nb = BUILDS[g.bi] || old;
  ped.app = g.app; ped.app.bd = g.bi; ped.appVer = (ped.appVer || 0) + 1;
  if (old && nb && nb !== old) { ped.maxHp = ped.hp = Math.max(20, Math.round(ped.maxHp / old.hp * nb.hp)); ped.build = nb; }
}
// the look for a country traffic rider (traffic.js): a mountain bike's, a dirt bike's (null: as they were)
export const riderLook = (model) => (model === 'mtb' ? 'mtbiker' : model === 'dirtbike' ? 'dirtbiker' : null);

// ---- the spots (activities.js spotsOf: once per map) -------------------------------------------------------------------
const WATER = (t) => t === T.WATER || t === T.DEEP;
const PI = Math.PI;
// which way fresh water lies from (x, y) - a river or a creek ('river'), a lake or a pond ('lake') - in a stride or two,
// or null
function bankAt(map, x, y, kind) {
  for (const r of [28, 46, 66]) for (let k = 0; k < 16; k++) {
    const a = k * PI / 8, tx = Math.floor((x + Math.cos(a) * r) / TILE), ty = Math.floor((y + Math.sin(a) * r) / TILE);
    if (!map.inside(tx, ty)) continue;
    const i = map.idx(tx, ty);
    if (WATER(map.tiles[i]) && (kind === 'river' ? map.river[i] : map.lake[i])) return a;
  }
  return null;
}
const wildAt = (map, x, y) => { const s = wildStyle(map, x, y); return s === 'wild' || s === 'desert' ? s : null; };   // (the open country - not the farms)
// h: activities.js's helpers { walkable, freeAt, clearWalk, hsh, clear }; list, taken: its spots
export function wildSpots(map, list, taken, h) {
  const KG = new Map(), KC = 1024;   // (the wild spots by kind, in 1024 px cells: room's look-up)
  const add = (s) => { list.push(s); taken.push({ x: s.x, y: s.y }); const key = s.k + ':' + Math.floor(s.x / KC) + ':' + Math.floor(s.y / KC); let a = KG.get(key); if (!a) KG.set(key, (a = [])); a.push(s); };
  const ok = (x, y) => h.walkable(map, x, y) && h.freeAt(map, x, y, 10);
  // room for one of kind k at (x, y): nothing else right there, none of its own kind within r
  const room = (k, x, y, r) => {
    for (let cy = Math.floor((y - r) / KC); cy <= Math.floor((y + r) / KC); cy++) for (let cx = Math.floor((x - r) / KC); cx <= Math.floor((x + r) / KC); cx++) for (const q of KG.get(k + ':' + cx + ':' + cy) || []) if (Math.hypot(q.x - x, q.y - y) < r) return false;
    return h.clear(x, y, 90);
  };
  const W = map.w * TILE, H = map.h * TILE, X0 = map.x0 * TILE, Y0 = map.y0 * TILE;
  // a patrol's other end: a clear walk of 160-300 px from (x, y)
  const legFrom = (x, y, seed) => {
    for (let i = 0; i < 24; i++) {
      const a = h.hsh(x, y, seed + i) * PI * 2, d = 160 + h.hsh(x, y, seed + i + 50) * 140, x2 = x + Math.cos(a) * d, y2 = y + Math.sin(a) * d;
      if (ok(x2, y2) && h.clearWalk(map, x, y, x2, y2)) return { x: x2, y: y2 };
    }
    return null;
  };
  // the rangers: out from the ranger stations' fronts, and from about a third of the trailheads' map boards
  for (const b of map.buildings || []) {
    if (!b || b.kind !== 'ranger') continue;
    const cx = (b.tx + b.tw / 2) * TILE, cy = (b.ty + b.th) * TILE;
    if (!wildStyle(map, cx, cy)) continue;
    let s = null;
    for (const [dx, dy] of [[0, 22], [24, 22], [-24, 22], [0, 46], [48, 30], [-48, 30]]) if (!s && ok(cx + dx, cy + dy)) s = { x: cx + dx, y: cy + dy };
    const e = s && legFrom(s.x, s.y, 300);
    if (e && room('ranger', s.x, s.y, 600)) add({ k: 'ranger', x: s.x, y: s.y, a: Math.atan2(e.y - s.y, e.x - s.x), x2: e.x, y2: e.y, wild: true });
  }
  // the trailheads: a map board, a fingerpost - backpackers and runners along the trail, now and then a ranger
  for (const p of map.props || []) {
    if ((p.t !== 'mapboard' && p.t !== 'fingerpost') || !wildStyle(map, p.x, p.y)) continue;
    let s = null;
    for (const [dx, dy] of [[0, 22], [18, 18], [-18, 18], [0, 34], [26, 0], [-26, 0]]) if (!s && ok(p.x + dx, p.y + dy)) s = { x: p.x + dx, y: p.y + dy };
    if (!s || !h.clear(s.x, s.y, 90)) continue;
    if (p.t === 'mapboard' && h.hsh(p.x, p.y, 311) < 0.35) {
      const e = legFrom(s.x, s.y, 320);
      if (e) { add({ k: 'ranger', x: s.x, y: s.y, a: Math.atan2(e.y - s.y, e.x - s.x), x2: e.x, y2: e.y, wild: true, board: true }); continue; }
    }
    const route = trailRoute(map, s.x, s.y, h);
    if (route) add({ k: 'trail', x: s.x, y: s.y, a: Math.atan2(route[1].y - s.y, route[1].x - s.x), route, wild: true });
  }
  // the banks and the shores: the edge of every creek, river, lake and pond out in the wild country - a tile of the water
  // with open ground two tiles off it, the spot on that ground facing the water (every other tile looked at, in a
  // hashed order so they don't all line up from the top left)
  const holds = [], shores = [];
  // (a river's calm pockets - shared/world3-rapids.js ch.p, tiles: the anglers take their banks first)
  const PK = ((map.waters && map.waters.ch) || []).flatMap((c) => c.p || []);
  const byPocket = (tx, ty) => PK.some((q) => (q[0] - tx) * (q[0] - tx) + (q[1] - ty) * (q[1] - ty) < (q[2] + 2) * (q[2] + 2));
  for (let ty = map.y0; ty < map.y0 + map.h; ty += 2) for (let tx = map.x0 + (ty & 2 ? 1 : 0); tx < map.x0 + map.w; tx += 2) {
    const i = map.idx(tx, ty);
    if (!WATER(map.tiles[i]) || !(map.river[i] || map.lake[i])) continue;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const lx = tx + dx * 2, ly = ty + dy * 2;
      if (!map.inside(lx, ly) || WATER(map.tiles[map.idx(lx, ly)]) || !map.inside(tx + dx, ty + dy)) continue;
      const x = (lx + 0.5) * TILE + dx * 6, y = (ly + 0.5) * TILE + dy * 6;
      if (!wildAt(map, x, y) || !ok(x, y)) continue;
      const q = { x, y, a: Math.atan2(-dy, -dx), r: h.hsh(x, y, 403) - (PK.length && byPocket(tx, ty) ? 1 : 0) };
      (map.lake[i] ? shores : holds).push(q);
      break;
    }
  }
  holds.sort((p, q) => p.r - q.r); shores.sort((p, q) => p.r - q.r);
  // (the ledge falls' plunge pools - shared/world3-ledgefalls.js: an angler on the bank below each, early)
  for (const f of map.natureSites || []) {
    if (f.kind !== 'ledgefall' || !f.falls || map.natureSites.some((g) => g.kind === 'ledgefall' && g.name === f.name && g.step > f.step)) continue;   // (the last ledge's: its pool)
    const fx = Math.floor(f.falls.x / TILE), fy = Math.floor(f.falls.y / TILE), hw = Math.ceil(f.falls.w / 2 / TILE) + 4;
    let got = null;
    for (let dy = 3; dy <= 10 && !got; dy++) for (const side of [1, -1]) {
      const ty = fy + dy;
      let tx = fx;
      while (Math.abs(tx - fx) < hw && map.inside(tx, ty) && WATER(map.tiles[map.idx(tx, ty)])) tx -= side;   // (out from the middle to the bank)
      if (!map.inside(tx, ty) || !map.inside(tx + side, ty) || WATER(map.tiles[map.idx(tx, ty)]) || !WATER(map.tiles[map.idx(tx + side, ty)])) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (!wildAt(map, x, y) || !ok(x, y)) continue;
      got = { x, y, a: side > 0 ? 0 : Math.PI, r: -1.5 }; break;
    }
    if (got) holds.unshift(got);
  }
  // (the coasts' rock fishing points: an angler on each first - shared/world3-coast.js)
  for (const s of map.natureSites || []) if (s.kind === 'fishpoint' && ok(s.x, s.y)) holds.unshift({ x: s.x, y: s.y, a: s.a ?? Math.PI, r: -2 });
  for (const q of shores) if (q.r < 0.5) holds.push(q);   // (a lake's bank: the anglers' too, now and then)
  for (const q of shores) if (room('birders', q.x, q.y, 1500)) add({ k: 'birders', x: q.x, y: q.y, a: q.a, wild: true });
  for (const q of shores) {   // a kayaker's walk along the shore (square to the water), clear end to end
    if (!room('kayakers', q.x, q.y, 1300)) continue;
    for (const side of [1, -1]) {
      const x2 = q.x - Math.sin(q.a) * 130 * side, y2 = q.y + Math.cos(q.a) * 130 * side;
      if (ok(x2, y2) && h.clearWalk(map, q.x, q.y, x2, y2)) { add({ k: 'kayakers', x: q.x, y: q.y, a: Math.atan2(y2 - q.y, x2 - q.x), x2, y2, wild: true }); break; }
    }
  }
  for (const q of holds) if (room('holds', q.x, q.y, 1000)) add({ k: 'holds', x: q.x, y: q.y, a: q.a, wild: true });
  // the coin telescopes out at the viewpoints: a birder by each
  for (const p of map.props || []) {
    if (p.t !== 'scope' || !wildStyle(map, p.x, p.y)) continue;
    for (const [dx, dy] of [[22, 6], [-22, 6], [0, 24]]) if (ok(p.x + dx, p.y + dy) && room('birders', p.x + dx, p.y + dy, 900)) { add({ k: 'birders', x: p.x + dx, y: p.y + dy, a: Math.PI / 2, wild: true, view: true }); break; }
  }
  // the climbers' own crags first (Eagle Crag: shared/world3-tarn.js), at the gear at its foot, facing the rock
  for (const s of map.natureSites || []) if (s.kind === 'crag' && ok(s.x, s.y) && ok(s.x + 24, s.y + 4) && room('climbers', s.x, s.y, 1800)) add({ k: 'climbers', x: s.x, y: s.y, a: -PI / 2, wild: true });
  // the crags: the cliffs and the big outcrops of the peaks and the canyons, the climbers at their feet facing the rock
  for (const p of map.props || []) {
    if (p.t !== 'cliff' && p.t !== 'cliffwall' && p.t !== 'outcrop') continue;
    const st = wildAt(map, p.x, p.y);
    if (!st) continue;
    const hab = habitatAt(map, p.x, p.y + 40);
    if (st !== 'desert' && !hab.mountain && !hab.desert) continue;
    const d = (p.d || p.s || 40) / 2, x = p.x + (h.hsh(p.x, p.y, 501) - 0.5) * Math.min(40, (p.w || p.s || 40) * 0.4), y = p.y + d + 16;
    if (!ok(x, y) || !ok(x + 24, y + 4) || !room('climbers', x, y, 1800)) continue;
    add({ k: 'climbers', x, y, a: -PI / 2, wild: true });
  }
  // the foragers' rounds: three patches of mushrooms (berries, herbs) close together in the woods
  const F = map.forage || [], PATCH = new Set(['goldTrumpet', 'bunCap', 'shelfOyster', 'redcap', 'berries', 'herbs']);
  for (let i = 0; i < F.length; i++) {
    const f = F[i];
    if (!PATCH.has(f.k) || !wildAt(map, f.x, f.y) || !room('foragers', f.x, f.y, 1500)) continue;
    const at = (q) => ({ x: q.x + 4, y: q.y + 10 }), near = [];
    for (let j = 0; j < F.length && near.length < 2; j++) { const g = F[j]; if (j !== i && PATCH.has(g.k) && Math.hypot(g.x - f.x, g.y - f.y) < 320 && Math.hypot(g.x - f.x, g.y - f.y) > 60) near.push(g); }
    if (near.length < 2) continue;
    const route = [f, ...near].map(at);
    if (!route.every((q) => ok(q.x, q.y)) || !h.clearWalk(map, route[0].x, route[0].y, route[1].x, route[1].y) || !h.clearWalk(map, route[1].x, route[1].y, route[2].x, route[2].y)) continue;
    add({ k: 'foragers', x: route[0].x, y: route[0].y, a: 0, route, wild: true });
  }
  // the campers' tents: sat out in front of one, the stove going
  for (const p of map.props || []) {
    if (p.t !== 'tent' || !wildStyle(map, p.x, p.y)) continue;
    let s = null;
    for (const [dx, dy] of [[26, 30], [-26, 30], [0, 40], [34, 10]]) if (!s && ok(p.x + dx, p.y + dy) && ok(p.x + dx + 14, p.y + dy)) s = { x: p.x + dx, y: p.y + dy };
    if (s && room('campcook', s.x, s.y, 500)) add({ k: 'campcook', x: s.x, y: s.y, a: 0, wild: true });
  }
}
// a trail from a trailhead: on along the dirt in steps of ~72 px, keeping its line, 5-14 points (or null: no trail here)
function trailRoute(map, x, y, h) {
  const pts = [{ x, y }];
  let cx = x, cy = y, head = null;
  for (let n = 0; n < 14; n++) {
    let best = null, bs = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = k * PI / 8, nx = cx + Math.cos(a) * 72, ny = cy + Math.sin(a) * 72;
      if (map.tileAtPx(nx, ny) !== T.DIRT || !h.walkable(map, nx, ny)) continue;
      if (pts.some((q) => Math.hypot(q.x - nx, q.y - ny) < 60)) continue;
      if (!h.clearWalk(map, cx, cy, nx, ny)) continue;
      const turn = head === null ? 0 : Math.abs(Math.atan2(Math.sin(a - head), Math.cos(a - head)));
      if (turn > 1.6) continue;
      const sc = -turn + h.hsh(nx, ny, 77) * 0.3;
      if (sc > bs) { bs = sc; best = { x: nx, y: ny, a }; }
    }
    if (!best) break;
    pts.push({ x: best.x, y: best.y }); head = best.a; cx = best.x; cy = best.y;
  }
  return pts.length >= 5 ? pts : null;
}

// ---- who's there (activities.js members) -----------------------------------------------------------------------------
// (as activities.js: { x, y, a, arche, look, gt, pp, fish, patrol, route, pace, kneel, ranger, chat, watch })
export function wildMembers(s, rng) {
  const c = Math.cos(s.a), sn = Math.sin(s.a), out = [];
  if (s.k === 'ranger') out.push({ x: s.x, y: s.y, a: s.a, arche: 'hiker', look: 'ranger', patrol: [{ x: s.x, y: s.y }, { x: s.x2, y: s.y2 }], ranger: true });
  else if (s.k === 'trail') {
    if (rng() < 0.4) out.push({ x: s.x, y: s.y, a: s.a, arche: 'hiker', look: 'runner', route: s.route, pace: 1, leg: rng() < 0.5 ? 0 : 1 });   // (a runner: out along the trail and back at a run)
    else {
      const n = rng() < 0.45 ? 2 : 1;
      for (let i = 0; i < n; i++) out.push({ x: s.x - c * 16 * i, y: s.y - sn * 16 * i, a: s.a, arche: 'hiker', look: 'backpacker', pp: 'poles', route: s.route, pace: 0.42, leg: 0, lag: i });
    }
  } else if (s.k === 'birders') {
    out.push({ x: s.x, y: s.y, a: s.a, arche: 'hiker', look: 'birder', pp: 'binoculars' });
    if (rng() < 0.45) out.push({ x: s.x - sn * 22, y: s.y + c * 22, a: s.a, arche: 'hiker', look: 'birder', pp: 'tripod' });
  } else if (s.k === 'holds') {
    out.push({ x: s.x, y: s.y, a: s.a, arche: 'casual', look: 'fisher', fish: true, pp: 'tackle' });
    if (rng() < 0.3) out.push({ x: s.x - sn * 22, y: s.y + c * 22, a: s.a, arche: 'casual', look: 'fisher', fish: true });
  } else if (s.k === 'kayakers') out.push({ x: s.x, y: s.y, a: s.a, arche: 'hiker', look: 'kayaker', pp: 'kayak', patrol: [{ x: s.x, y: s.y }, { x: s.x2, y: s.y2 }] });
  else if (s.k === 'climbers') {
    out.push({ x: s.x, y: s.y, a: s.a, arche: 'hiker', look: 'climber', pp: 'rope' });
    out.push({ x: s.x + 24, y: s.y + 4, a: s.a + 0.5, arche: 'hiker', look: 'climber', gt: 'kneel', pp: 'climbkit' });
  } else if (s.k === 'foragers') out.push({ x: s.x, y: s.y, a: 0, arche: 'hiker', look: 'forager', pp: 'basket', route: s.route, pace: 0.4, kneel: true, leg: 0 });
  else if (s.k === 'campcook') {
    out.push({ x: s.x, y: s.y, a: 0, arche: 'camper', gt: 'sit', pp: 'campstove' });
    if (rng() < 0.5) out.push({ x: s.x + 34, y: s.y + 6, a: Math.PI, arche: 'camper', chat: true });
  }
  return out;
}

// ---- how they go about it (activities.js steer): a route walked out and back (a pause now and then; a forager down on a
// knee at each patch), the ranger's beat with a word on the radio at each end -> { inp, factor } or null (off: on their way)
export function wildSteer(world, ped, now, x) {
  const n = ped.npc, a = n.act;
  if (a.route) {
    const Rt = a.route, L = Rt.length;
    let near = Infinity;
    for (const q of Rt) near = Math.min(near, Math.hypot(q.x - ped.x, q.y - ped.y));
    if (near > 420) { x.pose(ped, false); n.act = null; n.state = 'wander'; n.until = 0; return null; }   // (scared off it)
    if (n.state !== 'idle') { n.state = 'idle'; n.until = now + 9999; }
    if (now < (n.holdTo || 0)) { ped.vx = ped.vy = 0; x.pose(ped, true); return { inp: x.NO_INPUT, factor: 0.55 }; }
    if (a.gt === 'kneel') { a.gt = null; x.pose(ped, true); }   // (up off the knee and on)
    const P = 2 * L - 2, idx = ((a.leg % P) + P) % P, j = idx < L ? idx : P - idx, t = Rt[j];
    if (Math.hypot(t.x - ped.x, t.y - ped.y) < 10) {
      a.leg++;
      if (a.kneel) { a.gt = 'kneel'; n.holdTo = now + 6 + x.rng() * 7; ped.a = x.rng() * Math.PI * 2; }   // (down at the patch, picking)
      else if (j === 0 || j === L - 1) n.holdTo = now + (a.pace >= 1 ? 1 + x.rng() * 2 : 4 + x.rng() * 6);   // (the far end: a breather, a look at the view)
      else if (x.rng() < 0.06) n.holdTo = now + 2 + x.rng() * 3;
      x.pose(ped, true);
      return { inp: x.NO_INPUT, factor: 0.55 };
    }
    x.pose(ped, true);
    return { inp: x.seekTo(ped, t.x, t.y, 1), factor: a.pace || 0.5 };
  }
  if (a.ranger) {   // the beat: out to the far end and back, a word on the radio and a look about at each end
    const P0 = a.patrol;
    if (Math.hypot(a.x - ped.x, a.y - ped.y) > 420 && Math.hypot(P0[1].x - ped.x, P0[1].y - ped.y) > 420) { a.pp = null; x.pose(ped, false); n.act = null; n.state = 'wander'; return null; }
    if (n.state !== 'idle') { n.state = 'idle'; n.until = now + 9999; }
    if (now < (n.holdTo || 0)) {
      ped.vx = ped.vy = 0;
      if (n.talkTo) { const q = world.get(n.talkTo); if (q && !q.dead) ped.a = Math.atan2(q.y - ped.y, q.x - ped.x); a.pp = null; }
      else if (now >= (n.lookAt || 0)) { n.lookAt = now + 1.5 + x.rng() * 2; if (x.rng() < 0.5) ped.a += (x.rng() - 0.5) * 1.6; a.pp = x.rng() < 0.45 ? 'radio' : null; }
      x.pose(ped, true);
      return { inp: x.NO_INPUT, factor: 0.55 };
    }
    n.talkTo = 0;
    const t = P0[a.leg % 2];
    if (Math.hypot(t.x - ped.x, t.y - ped.y) < 8) { a.leg++; n.holdTo = now + 4 + x.rng() * 6; n.lookAt = 0; return { inp: x.NO_INPUT, factor: 0.55 }; }
    if (a.pp) { a.pp = null; }
    x.pose(ped, true);
    return { inp: x.seekTo(ped, t.x, t.y, 0.8), factor: 0.4 };
  }
  return undefined;   // (not one of these: activities.js's own)
}

// ---- a word with the ranger (players.js findInteraction) ------------------------------------------------------------
const TALK_R = 46;
export function rangerNear(world, ped, r = TALK_R) {
  for (const e of world.query(ped.x, ped.y, r, K.PED)) if (e !== ped && !e.dead && e.npc && e.npc.act && e.npc.act.ranger && (e.npc.state === 'idle' || e.npc.state === 'wander')) return e;
  return null;
}
export function interaction(world, p) {
  const ped = p.ped, r = ped && !ped.vehId && rangerNear(world, ped);
  if (!r) return null;
  return { label: 'Talk to the ranger', run: () => talk(world, p, r) };
}
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];   // (y down: the screen's north is up)
export const compass = (dx, dy) => COMPASS[((Math.round(Math.atan2(dy, dx) / (PI / 4)) % 8) + 8) % 8];
const howFar = (d) => (d < 450 ? 'just' : d < 1100 ? 'a short walk' : d < 2000 ? 'a fair walk' : 'a good hike');
// what the ranger tells you of a find (Nature-D1's kinds, shared/foraging.js)
const FIND_SAY = {
  berries: 'berry bushes - blackberries, blueberries', herbs: 'wild herbs in the grass - sage and mint', hive: 'a wild bees\' nest in an old tree - mind the stings by day',
  truffle: 'truffle ground under the trees - you\'ll want a trowel', geode: 'geodes in the rock - bring a pickaxe', fossil: 'fossils in the shale - a pickaxe splits it',
  arrowhead: 'old arrowheads in the sand - they turn up after the wind', mussels: 'a mussel bed in the river - a pearl in one now and then', goldpan: 'gold in the creek\'s gravel - a gold pan gets it out',
  antler: 'a shed antler - the deer drop them in the woods', feather: 'an eagle\'s feather - nobody may buy one, but it fletches a fine arrow',
  goldTrumpet: 'golden trumpets under the giants - the market pays for those', bunCap: 'bun caps by the old trees', shelfOyster: 'shelf oysters on the logs', redcap: 'redcaps - pretty, and poison: leave them',
};
export function tipsFor(world, p, r) {
  const ped = p.ped, out = [];
  // the nearest find worth the trip, not picked bare, within a good hike
  const F = world.map.forage || [];
  let best = -1, bd = 2600;
  for (let i = 0; i < F.length; i++) { const f = F[i]; if (!FIND_SAY[f.k] || f.k === 'redcap' || isBare(world, i)) continue; const d = Math.hypot(f.x - ped.x, f.y - ped.y); if (d < bd && d > 120) { bd = d; best = i; } }
  if (best >= 0) { const f = F[best]; out.push(`There's ${FIND_SAY[f.k]} - ${howFar(bd)} ${compass(f.x - ped.x, f.y - ped.y)} of here.`); }
  const hab = habitatAt(world.map, r.x, r.y), prot = Object.values(SPECIES).filter((S) => S.protected).map((S) => S.name.toLowerCase() + 's');
  out.push(`${prot.slice(0, -1).join(', ')} and ${prot[prot.length - 1]} are protected out here. Shoot one and the wardens fine you $${WARDEN_FINE}.`.replace(/^./, (c) => c.toUpperCase()));
  if (hab.forest) out.push('Wolves run the deer down in these woods - in packs. They\'ll leave you be. Mostly.');
  if (hab.mountain) out.push('There\'s a mountain lion up in the high country. It stalks the deer and the goats - keep your dog close at dusk.');
  if (hab.desert || wildStyle(world.map, r.x, r.y) === 'desert') out.push('Coyotes and bobcats take the rabbits out here at dawn and dusk. Carry water.');
  out.push('Trout hold in the creeks\' current, bass and bluegill under the docks. When the salmon run, the bears come down to the falls for them.');
  out.push('Leave a campfire burning and the woods go up with it. Put it out when you leave.');
  return out;
}
function talk(world, p, r) {
  const n = r.npc, now = world.time;
  n.holdTo = Math.max(n.holdTo || 0, now + 5); n.talkTo = p.ped.id;
  r.a = Math.atan2(p.ped.y - r.y, p.ped.x - r.x); r.vx = r.vy = 0;
  if (now < (p.rangerTalkAt || 0)) return;
  p.rangerTalkAt = now + 1.5;
  const tips = tipsFor(world, p, r), k = (p.rangerTip = ((p.rangerTip ?? -1) + 1)) % tips.length;
  world.notify(p, `Ranger: "${tips[k]}"`, 'info');
}
// a protected animal shot with a ranger in sight (hunting.js onKilled): they saw it
export function rangerSaw(world, x, y) { return [...world.query(x, y, 900, K.PED)].some((e) => !e.dead && e.npc && e.npc.act && e.npc.act.ranger); }
