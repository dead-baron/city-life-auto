// The city's people dressed from the wardrobe (shared/look.js, task #365): every civilian NPC wears a whole look - body,
// face, hair and an outfit from the catalogue - so they travel to clients as their look code (app.lk, like a player's)
// and are drawn and cached the same way.
//   RECIPES[archetype]   how that kind of person dresses: styles (STYLES ids, weighted), the share of women, an age spread
//                        (AGES 20s .. 70s), how much the district shades it, and fix(L, r): pieces they always wear
//                        (a construction worker's hard hat and hi-vis, a senior's cardigan or flat cap...)
//   SHADE[district style] what the district adds (the rich districts Preppy / High fashion / Business, the beach Beach,
//                        nightlife at night Nightclub, the rough districts Street / Punk / Alt, the suburbs Casual...)
//   dress(world, arche, x, y, night) -> { app, look, code, bi } | null    a look from the pool for that kind of person in
//                        that district at that hour (null: no recipe - SWAT, agents, soldiers, medics and the hooded
//                        stranger keep their old outfits; the police wear the catalogue's issued uniforms). bi: the combat build
//                        (entities.js BUILDS) the body was drawn for, so a big man fights like one.
// The variety is bounded for the renderer (each distinct look is a sprite set to bake): a pool of POOL_N seeded looks per
// kind of person and district (and day / night where that matters), drawn so that nobody near wears the same look.
import { randomLook, validLook, encodeLook, lookToApp, item, PIECES, HAIR_STYLES, policeLook } from '../../shared/look.js';
import { mulberry32 } from '../../shared/rng.js';
import { K } from '../../shared/constants.js';
import { rollBuild } from '../entities.js';

export const POOL_N = 20;
const NEAR_PX = 420;   // nobody within this of a new person wears their look

// "style:weight style:weight" -> [[style, weight]]
const W = (s) => s.split(' ').filter(Boolean).map((x) => { const [k, w] = x.split(':'); return [k, +(w || 1)]; });
const HS = {}; HAIR_STYLES.forEach((h, i) => { HS[h[0]] = i; });
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const wpick = (r, list) => { let t = 0; for (const [, w] of list) t += w; let x = r() * t; for (const [k, w] of list) { x -= w; if (x <= 0) return k; } return list[0][0]; };
const slotOf = (L, s) => (L.outfit[s] ? PIECES[L.outfit[s].id] : null);

// ---- what each kind of person wears ---------------------------------------------------------------------------------
// styles: weighted STYLES ids; fem: the share of women; age: weights for 20s .. 70s; shade: how much the district counts
// (0: not at all - a uniform of sorts; 1: the district decides)
export const RECIPES = {
  // the police on the street (CC5): patrol officers in the navy shirt and the police cap, now and then a sergeant with
  // chevrons or a rookie in light blue under a ball cap; about a third in sunglasses (shared/look.js policeLook)
  cop: { styles: W('work:1'), fem: 0.3, age: [2, 3, 3, 2, 1, 0], shade: 0, pool: 24,
    fix(L, r) { const k = r(); L.outfit = policeLook(L, k < 0.14 ? 2 : 0, k > 0.84 ? 'rookie' : null, r() < 0.35).outfit; L.extras.piercings &= 1; L.extras.makeup = L.extras.makeup && r() < 0.5 ? 1 : 0; } },
  executive: { styles: W('business:6 formal:2 smart:2'), fem: 0.42, age: [1, 3, 3, 2, 1, 0], shade: 0.15,
    fix(L, r) { if (!L.outfit.shoes || !/Oxfords|Loafers|Heels|Ankle|Chelsea|Ballet/.test(slotOf(L, 'shoes').name)) L.outfit.shoes = item(L.body.base === 'f' && r() < 0.6 ? 'Heels' : 'Oxfords'); if (r() < 0.5) L.outfit.bag = item('Briefcase'); L.outfit.hat = null; } },
  socialite: { styles: W('hifashion:5 nightclub:2 smart:2 preppy:1'), fem: 0.75, age: [3, 3, 2, 1, 0, 0], shade: 0.3,
    fix(L, r) { if (r() < 0.5) L.outfit.glasses = item(L.body.base === 'f' && r() < 0.5 ? 'Cat-eye shades' : 'Sunglasses'); if (r() < 0.6) L.outfit.bag = item(L.body.base === 'f' ? 'Handbag' : 'Crossbody bag', r() < 0.5 ? undefined : pick(r, ['black', 'cream', 'red', 'tan'])); } },
  construction: { styles: W('work:1'), fem: 0.12, age: [2, 3, 3, 2, 1, 0], shade: 0,
    fix(L, r) { workwear(L, r); L.outfit.hat = item('Hard hat', pick(r, ['yellow', 'yellow', 'white', 'orange'])); L.outfit.top = item('Hi-vis vest', pick(r, ['hi-vis', 'orange']), 'charcoal'); } },
  sweeper: { styles: W('work:1'), fem: 0.3, age: [1, 2, 2, 2, 1, 0], shade: 0,
    fix(L, r) { L.outfit.set = item('Coveralls', 'orange', 'navy'); L.outfit.top = L.outfit.bottoms = L.outfit.jacket = null; L.outfit.shoes = item('Work boots', 'black'); L.outfit.hat = item('Baseball cap', 'navy'); L.outfit.bag = L.outfit.jewel = null; } },
  casual: { styles: W('casual:6 streetwear:2 smart:2 athletic:1 skater:1 retro:1 alt:1'), fem: 0.5, age: [3, 3, 2, 2, 1, 0.5], shade: 0.6 },
  athlete: { styles: W('athletic:1'), fem: 0.45, age: [4, 3, 1, 0.5, 0, 0], shade: 0.1,
    fix(L, r) { if (!slotOf(L, 'shoes') || !/Sneakers|Running/.test(slotOf(L, 'shoes').name)) L.outfit.shoes = item('Running shoes', pick(r, ['white', 'black', 'royal blue', 'red'])); L.outfit.jacket = null; } },
  senior: { styles: W('casual:3 smart:2 retro:2 preppy:2 winter:1'), fem: 0.55, age: [0, 0, 0, 0, 1, 1.2], shade: 0.2,
    fix(L, r) {
      const f = L.body.base === 'f';
      if (r() < 0.55) L.outfit.jacket = item(f ? pick(r, ['Cardigan', 'Cardigan', 'Wool coat', 'Trench coat']) : pick(r, ['Cardigan', 'Waistcoat', 'Wool coat']), pick(r, ['mustard', 'brown', 'grey', 'burgundy', 'navy', 'cream', 'olive', 'lavender']));
      if (!f && r() < 0.45) L.outfit.hat = item(r() < 0.6 ? 'Beret' : 'Fedora', pick(r, ['charcoal', 'brown', 'grey', 'khaki']));   // the flat cap
      else if (f && r() < 0.2) L.outfit.hat = item('Sun hat', 'cream');
      else L.outfit.hat = null;
      if (r() < 0.5) L.outfit.glasses = item(r() < 0.6 ? 'Reading glasses' : 'Round glasses');
      if (!L.outfit.shoes || /High-tops|Skate|Platform|Combat|Stilettos|Flip/.test(slotOf(L, 'shoes').name)) L.outfit.shoes = item(f ? 'Ballet flats' : 'Loafers', pick(r, ['brown', 'black']));
      if (L.outfit.set && /Mini|Slip|Bodysuit|Tracksuit/.test(slotOf(L, 'set').name)) { L.outfit.set = null; L.outfit.top = item(f ? 'Blouse' : 'Button-up shirt', pick(r, ['cream', 'white', 'sky', 'lavender'])); L.outfit.bottoms = item(f ? 'Skirt' : 'Chinos', pick(r, ['brown', 'grey', 'navy', 'khaki'])); }
      if (/Mini skirt|Ripped|Leather trousers|Leggings/.test((slotOf(L, 'bottoms') || {}).name || '')) L.outfit.bottoms = item(f ? 'Skirt' : 'Chinos', pick(r, ['brown', 'grey', 'navy']));
      L.extras.piercings &= 1; L.extras.tattoos = 0;
    } },
  hustler: { styles: W('street:4 streetwear:4 nightclub:1'), fem: 0.25, age: [4, 3, 1, 0.3, 0, 0], shade: 0.25,
    fix(L, r) { if (r() < 0.6) L.outfit.jewel = item(r() < 0.6 ? 'Gold chain' : 'Chain and watch'); } },
  drunk: { styles: W('casual:3 street:2 retro:1 lounge:1'), fem: 0.25, age: [1, 2, 2, 2, 1, 0], shade: 0.3,
    fix(L, r) { if (r() < 0.4 && L.body.base === 'm') L.hair.facial = pick(r, [1, 1, 3, 4]); L.outfit.glasses = null; L.outfit.bag = null; } },
  hiker: { styles: W('outdoors:1'), fem: 0.45, age: [3, 3, 2, 2, 1, 0], shade: 0,
    fix(L, r) { L.outfit.bag = item(r() < 0.6 ? 'Hiking pack' : 'Backpack', pick(r, ['forest', 'orange', 'navy', 'red'])); if (!/boots/.test((slotOf(L, 'shoes') || {}).name || '')) L.outfit.shoes = item('Hiking boots'); } },
  camper: { styles: W('outdoors:3 casual:2 winter:1'), fem: 0.45, age: [2, 3, 3, 2, 1, 0], shade: 0 },
  farmer: { styles: W('western:3 work:2 outdoors:1'), fem: 0.3, age: [1, 2, 3, 3, 2, 1], shade: 0,
    fix(L, r) { if (r() < 0.45) { L.outfit.set = item('Overalls', pick(r, ['denim', 'navy', 'brown'])); L.outfit.top = L.outfit.bottoms = null; } if (!L.outfit.hat && r() < 0.7) L.outfit.hat = item(r() < 0.5 ? 'Cowboy hat' : 'Trucker cap', pick(r, ['tan', 'cream', 'red', 'brown'])); if (!/boots/.test((slotOf(L, 'shoes') || {}).name || '')) L.outfit.shoes = item(r() < 0.5 ? 'Work boots' : 'Cowboy boots'); } },
  nomad: { styles: W('western:2 outdoors:2 festival:1'), fem: 0.35, age: [2, 3, 3, 2, 1, 0], shade: 0,
    fix(L, r) { L.outfit.glasses = item(r() < 0.6 ? 'Sunglasses' : 'Face bandana', r() < 0.5 ? undefined : pick(r, ['brown', 'rust', 'sand'])); if (!L.outfit.hat) L.outfit.hat = item(r() < 0.5 ? 'Cowboy hat' : 'Bucket hat', pick(r, ['tan', 'sand', 'brown'])); } },
  mugger: { styles: W('street:4 streetwear:1'), fem: 0.15, age: [4, 3, 1, 0, 0, 0], shade: 0,
    fix(L, r) { L.outfit.top = item('Hoodie', pick(r, ['black', 'charcoal', 'grey', 'navy'])); L.outfit.set = null; L.outfit.jacket = null; if (!L.outfit.bottoms) L.outfit.bottoms = item('Joggers', 'black'); L.outfit.hat = item(r() < 0.6 ? 'Hood up' : 'Beanie', 'black'); L.outfit.bag = L.outfit.jewel = null; } },
  // the Syndicate on their turf: their colours, black with red - vests, track pants, a bandana, a chain
  syndicate: { styles: W('street:1'), fem: 0.15, age: [4, 3, 2, 0, 0, 0], shade: 0,
    fix(L, r) {
      L.outfit.set = null;
      L.outfit.top = item(r() < 0.5 ? 'Plain tee' : 'Tank top', r() < 0.6 ? 'black' : 'white');
      L.outfit.jacket = r() < 0.6 ? item(r() < 0.5 ? 'Puffer vest' : 'Studded vest', 'black', 'red') : r() < 0.5 ? item('Track jacket', 'black', 'red') : null;
      L.outfit.bottoms = item(r() < 0.7 ? 'Joggers' : 'Black jeans', 'black', 'red');
      L.outfit.shoes = item(r() < 0.6 ? 'High-tops' : 'Sneakers', r() < 0.5 ? 'black' : 'white', 'red');
      L.outfit.hat = r() < 0.5 ? item('Head bandana', 'red') : r() < 0.5 ? item('Snapback', 'black', 'red') : null;
      L.outfit.glasses = r() < 0.45 ? item('Face bandana', 'red') : r() < 0.3 ? item('Sunglasses') : null;
      L.outfit.jewel = item(r() < 0.7 ? 'Gold chain' : 'Chain and watch'); L.outfit.bag = null;
      if (r() < 0.6) L.extras.tattoos |= 1 | (r() < 0.4 ? 4 : 0);
    } },
  // a nightclub's bouncers (nightclubs.js, task #432): big (now and then a woman) and all in black - a tee or a polo, a
  // bomber or a leather jacket, black trousers and boots - the hair cropped, now and then shades or a chain
  bouncer: { styles: W('nightclub:1'), fem: 0.1, age: [1, 3, 3, 1, 0, 0], shade: 0, pool: 12,
    fix(L, r) {
      L.body.build = 4;
      L.outfit.set = null;
      L.outfit.top = item(r() < 0.6 ? 'Plain tee' : 'Polo shirt', 'black');
      L.outfit.jacket = r() < 0.55 ? item(r() < 0.6 ? 'Bomber jacket' : 'Leather jacket', 'black') : null;
      L.outfit.bottoms = item(r() < 0.5 ? 'Black jeans' : 'Suit trousers', 'black');
      L.outfit.shoes = item(r() < 0.6 ? 'Combat boots' : 'Work boots', 'black');
      L.outfit.hat = null; L.outfit.bag = null;
      L.outfit.glasses = r() < 0.35 ? item('Sunglasses') : null;
      L.outfit.jewel = r() < 0.3 ? item('Silver chain') : null;
      L.hair.style = L.body.base === 'f' ? pick(r, [HS.Ponytail, HS['High bun'], HS['Buzz cut']]) : pick(r, [HS.Bald, HS['Buzz cut'], HS['Crew cut'], HS.Fade]);
    } },
};
function workwear(L, r) {
  L.outfit.set = null; L.outfit.jacket = null;
  L.outfit.bottoms = item(r() < 0.5 ? 'Work trousers' : r() < 0.5 ? 'Jeans' : 'Cargo pants', r() < 0.4 ? undefined : pick(r, ['charcoal', 'denim', 'khaki', 'navy']));
  L.outfit.shoes = item('Work boots', r() < 0.6 ? 'tan' : 'brown');
  L.outfit.bag = L.outfit.jewel = null; L.outfit.glasses = r() < 0.2 ? item('Sport shades') : null;
}

// ---- what the district adds ---------------------------------------------------------------------------------------------
// by the district's style (shared/map.js DISTRICTS); { day, night } where the hour matters
export const SHADE = {
  towers: { day: W('business:6 smart:2 hifashion:1'), night: W('smart:2 nightclub:2 business:2 hifashion:1') },
  luxury: W('preppy:3 hifashion:3 smart:2 business:1'),
  commercial: W('casual:3 smart:2 streetwear:2 athletic:1'),
  apartments: W('casual:3 streetwear:2 athletic:1 lounge:1 skater:1'),
  industrial: W('work:3 street:2 casual:1'), factory: W('work:4 casual:1 street:1'), harbor: W('work:3 casual:1 outdoors:1'),
  southside: W('street:3 streetwear:2 punk:1 alt:1'), rocky: W('street:3 punk:1 outdoors:1'),
  nightlife: { day: W('streetwear:2 alt:2 festival:1 casual:1'), night: W('nightclub:6 alt:1 punk:1') },
  redlight: { day: W('alt:2 street:2 nightclub:1'), night: W('nightclub:5 alt:2 punk:1') },
  beach: W('beach:7 casual:1 athletic:1 festival:1'),
  park: W('athletic:3 casual:2 outdoors:1'),
  houses: W('casual:4 preppy:2 athletic:1 lounge:1'),
  oldtown: W('retro:2 alt:2 casual:2 smart:1'),
  civic: { day: W('business:2 smart:2 casual:2'), night: W('casual:2 smart:1 street:1') },
  rural: W('western:3 work:2 outdoors:1'), wild: W('outdoors:4 winter:1'), airport: W('business:2 casual:2 smart:1'),
};
const shadeOf = (style, night) => { const s = SHADE[style] || SHADE.commercial; return Array.isArray(s) ? s : night ? s.night : s.day; };
const timely = (style) => !Array.isArray(SHADE[style] || []);

// the styles a person of this recipe dresses in, in this district: the recipe's own, shaded by the district's
export function styleMix(recipe, dstyle, night) {
  const k = recipe.shade || 0, own = recipe.styles, sh = shadeOf(dstyle, night);
  const tot = (l) => l.reduce((t, [, w]) => t + w, 0), to = tot(own), ts = tot(sh), m = new Map();
  for (const [s, w] of own) m.set(s, (m.get(s) || 0) + (1 - k) * w / to);
  if (k > 0) for (const [s, w] of sh) m.set(s, (m.get(s) || 0) + k * w / ts);
  return [...m];
}

// combat build (entities.js BUILDS: frail, average, tough, brute) <-> the look's body build (Slim, Average, Athletic, Curvy, Big)
const LOOK_BUILD = (bi, r, fem) => (bi === 0 ? 0 : bi === 2 ? 2 : bi === 3 ? 4 : r() < (fem ? 0.3 : 0.15) ? 3 : 1);
export const COMBAT_BUILD = [0, 1, 2, 1, 3];

// one look of a recipe, from a seed: (the variety a pool draws from)
export function recipeLook(arche, seed, dstyle = 'commercial', night = false, recipe = RECIPES[arche]) {
  if (!recipe) return null;
  const r = mulberry32((seed >>> 0) ^ 0x9e3779b9);
  const base = r() < (recipe.fem ?? 0.5) ? 'f' : 'm';
  const style = wpick(r, styleMix(recipe, dstyle, night));
  const L = randomLook(Math.floor(r() * 4294967296), base, style);
  L.body.age = recipe.age ? wpickI(r, recipe.age) : L.body.age;
  const bi = rollBuild(r, recipe.builds || arche);
  L.body.build = LOOK_BUILD(bi, r, base === 'f');
  // hair that suits the age (the dyed colours and the wilder cuts mostly on the young), greys with the years
  if (L.body.age >= 4 && /Mohawk|Space buns|Pigtails|Spiky|Cornrows|Mullet/.test(HAIR_STYLES[L.hair.style][0])) L.hair.style = base === 'f' ? pick(r, [HS.Bob, HS['High bun'], HS['Shoulder length'], HS.Pixie]) : pick(r, [HS['Short back & sides'], HS['Side part'], HS.Bald, HS['Crew cut']]);
  if (L.body.age >= 3 && L.hair.color >= 14 && r() < 0.8) L.hair.color = pick(r, [12, 13, 2, 3]);
  if (L.body.age >= 4 && L.hair.color < 12 && r() < 0.75) L.hair.color = pick(r, [12, 13, 13]);
  if (base === 'm' && L.body.age >= 3 && r() < 0.25 && L.hair.style !== HS.Bald) L.hair.style = r() < 0.5 ? HS.Bald : HS['Short back & sides'];
  if (L.outfit.glasses && slotOf(L, 'glasses').d.nostreet) L.outfit.glasses = null;   // (no masks, goggles or eye patches out walking: the catalogue's nostreet)
  if (recipe.fix) recipe.fix(L, r);
  if (!L.outfit.set) { if (!L.outfit.top) L.outfit.top = item(L.body.base === 'f' ? 'Tank top' : 'Plain tee', pick(r, ['white', 'black', 'grey', 'navy'])); if (!L.outfit.bottoms) L.outfit.bottoms = item(r() < 0.5 ? 'Jeans' : 'Cargo pants'); }
  if (!L.outfit.shoes) L.outfit.shoes = item('Sneakers', pick(r, ['white', 'black']));
  return { look: validLook(L), bi };
}
function wpickI(r, w) { let t = 0; for (const x of w) t += x; let v = r() * t; for (let i = 0; i < w.length; i++) { v -= w[i]; if (v <= 0) return i; } return 0; }

// ---- the pools -------------------------------------------------------------------------------------------------------------
// key -> [{ code, look, app, bi }]; made on first use, kept (a few hundred looks at most across the city)
const POOLS = new Map();
export function poolFor(arche, dstyle, night, recipe = RECIPES[arche], n = POOL_N) {
  const t = timely(dstyle) && (recipe.shade || 0) > 0;
  const key = `${arche}|${(recipe.shade || 0) > 0 ? dstyle : '-'}|${t && night ? 'n' : 'd'}`;
  let pool = POOLS.get(key);
  if (pool) return pool;
  pool = [];
  let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const seen = new Set();
  for (let i = 0; pool.length < n && i < n * 3; i++) {
    const g = recipeLook(arche, (h + i * 7919) >>> 0, dstyle, night, recipe);
    const code = encodeLook(g.look);
    if (seen.has(code)) continue;
    seen.add(code);
    pool.push({ code, look: g.look, app: lookToApp(g.look, code), bi: COMBAT_BUILD[g.look.body.build] ?? g.bi });
  }
  POOLS.set(key, pool);
  return pool;
}
export const poolCount = () => POOLS.size;

// A look for a new NPC of this kind here: from the pool, not worn by anyone near. Returns { app (a copy: systems may
// change a ped's app), look, code, bi } or null when this kind keeps the old appearance (uniforms).
export function dress(world, arche, x, y, night = !!(world.clock && world.clock.isNight), rng = Math.random, recipe = RECIPES[arche]) {
  if (!recipe) return null;
  const d = world.map && world.map.districtAt ? world.map.districtAt(x, y) : null;
  const pool = poolFor(arche, d ? d.style : 'commercial', night, recipe, recipe.pool || POOL_N);
  const near = new Set();
  if (world.query) for (const e of world.query(x, y, NEAR_PX, K.PED)) if (e.app && e.app.lk) near.add(e.app.lk);
  let i = Math.floor(rng() * pool.length) % pool.length;
  for (let k = 0; k < pool.length && near.has(pool[i].code); k++) i = (i + 1) % pool.length;
  const P = pool[i];
  return { app: { ...P.app }, look: P.look, code: P.code, bi: P.bi };
}
