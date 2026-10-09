// The look system (concept sheets CC1-CC10, CB1-CB5, CP1-CP4, SF/SM1-23) - all of it: shared/lookcore.js, re-exported
// (what a look is, the catalogue, the code on the wire, the art; see its header), and here what only the creator and the
// server use: randomLook(seed, base?, style?) -> a whole random look (Randomise; the city's people); STARTERS, the twelve
// CC9 starting looks; policeLook(look, rank) -> the uniform by rank on that body; lookFromOutfit(old) -> the look an
// old random outfit (server entities.js playerOutfit) migrates to. (Split 2026-10-09 so the game's renderer, which
// loads lookcore.js alone, doesn't carry these to every player's browser.)
import { mulberry32 } from './rng.js';
import { PIECES, SLOTS, STYLES, PATTERNS, SKIN_TONES, HAIR_COLORS, CLOTH, MAKEUP_COLORS, FACE_OPTS, HAIR_STYLES, FACIAL_HAIR, MAKEUP,
  TATTOO_AREAS, SCARS, emptyLook, validLook, item, fits, col, byName, clampI, hexRgb } from './lookcore.js';
export * from './lookcore.js';

// ---- random looks -------------------------------------------------------------------------------------------------------
const rint = (r, n) => Math.floor(r() * n) % n;
const rpick = (r, a) => a[rint(r, a.length)];
const pieceList = (slot, base, style) => PIECES.filter((p) => p && p.slot === slot && fits(p, base) && !p.d.issued && (!style || p.tags.includes(style)));   // (never an issued uniform)
const NEUTRAL = ['white', 'black', 'charcoal', 'grey', 'navy', 'denim', 'cream', 'khaki', 'brown', 'tan', 'olive'].map(col);
// A whole random look from a seed. base: 'm' | 'f' | null (either); style: a STYLES id to dress in (null: any).
export function randomLook(seed, base = null, style = null) {
  const r = mulberry32((seed >>> 0) ^ 0x5eed1001);
  base = base === 'm' || base === 'f' ? base : r() < 0.5 ? 'm' : 'f';
  const L = emptyLook(base);
  L.body = { base, build: rpick(r, [0, 1, 1, 1, 2, 2, 3, 4]), height: rpick(r, [0, 1, 2, 2, 2, 3, 4]), skin: rint(r, SKIN_TONES.length), age: rpick(r, [0, 0, 1, 1, 2, 3, 4, 5]) };
  for (const k of ['shape', 'eyes', 'brows', 'nose', 'lips']) L.face[k] = rint(r, FACE_OPTS[k].length);
  L.face.eyeColor = rpick(r, [0, 0, 1, 1, 2, 3, 4, 5, 6, 7]);
  L.face.freckles = r() < 0.15 ? 1 : 0; L.face.mole = r() < 0.12 ? 1 : 0; L.face.dimples = r() < 0.15 ? 1 : 0;
  const styles = HAIR_STYLES.map((h, i) => [h, i]).filter(([h]) => h[1].includes(base));
  L.hair.style = rpick(r, styles)[1];
  L.hair.color = L.body.age >= 4 && r() < 0.7 ? rpick(r, [12, 13]) : r() < 0.08 ? 14 + rint(r, 5) : rint(r, 12);
  L.hair.facial = base === 'm' && r() < 0.45 ? 1 + rint(r, FACIAL_HAIR.length - 1) : 0;
  if (base === 'f' && r() < 0.5) { L.extras.makeup = 1 + rint(r, MAKEUP.length - 1); L.extras.makeupColor = rint(r, MAKEUP_COLORS.length); }
  if (r() < 0.2) L.extras.tattoos = 1 + rint(r, (1 << TATTOO_AREAS.length) - 1) & 0b01111;
  if (r() < 0.25) L.extras.piercings = base === 'f' ? 1 | (r() < 0.3 ? 2 : 0) : rpick(r, [1, 2, 4, 8]);
  if (r() < 0.08) L.extras.scar = 1 + rint(r, SCARS.length - 1);
  const st = style || rpick(r, STYLES)[0];
  const pickPiece = (slot, chance = 1) => {
    if (r() > chance) return null;
    let list = pieceList(slot, base, st);
    if (!list.length) list = pieceList(slot, base, null).filter((p) => p.tags.includes('casual'));
    if (!list.length) return null;
    const P = rpick(r, list);
    const c = r() < 0.55 ? P.c : r() < 0.5 ? rpick(r, NEUTRAL) : rint(r, CLOTH.length);
    return { id: P.i, c, t: r() < 0.6 ? P.t : rint(r, CLOTH.length), p: P.d.p || (r() < 0.1 ? 1 + rint(r, PATTERNS.length - 1) : 0) };
  };
  const sets = pieceList('set', base, st).filter((p) => p.name !== 'Underwear');
  if (sets.length && r() < (base === 'f' ? 0.35 : 0.15)) L.outfit.set = pickPiece('set');
  if (!L.outfit.set || L.outfit.set && PIECES[L.outfit.set.id].name === 'Underwear') { L.outfit.set = null; L.outfit.top = pickPiece('top'); L.outfit.bottoms = pickPiece('bottoms'); }
  L.outfit.jacket = pickPiece('jacket', 0.4);
  L.outfit.shoes = pickPiece('shoes');
  L.outfit.hat = pickPiece('hat', 0.3);
  L.outfit.glasses = st === 'disguise' ? pickPiece('glasses', 0.6) : r() < 0.25 ? (() => { const l = pieceList('glasses', base, null).filter((p) => p.d.k === 'sun' || p.d.k === 'round'); const P = rpick(r, l); return { id: P.i, c: P.c, t: P.t, p: 0 }; })() : null;
  L.outfit.jewel = pickPiece('jewel', 0.25);
  L.outfit.bag = pickPiece('bag', 0.2);
  return validLook(L);
}

// ---- the twelve starting looks (CC9) ---------------------------------------------------------------------------------------
// CC9's own twelve, by name and line (2026-10-09; the first set only shared its idea): the skater, the beachgoer, the
// rancher, the club-goer, the executive, the barista, the punk, the jogger, the outdoorsy, the local, the blue-collar, the
// trendsetter - five women and seven men, as drawn
const mk = (name, sub, base, body, face, hair, extras, outfit) => {
  const L = emptyLook(base);
  Object.assign(L.body, body); Object.assign(L.face, face); Object.assign(L.hair, hair); Object.assign(L.extras, extras);
  for (const [k, v] of Object.entries(outfit)) L.outfit[k] = v;
  return { name, sub, look: validLook(L) };
};
export const STARTERS = [
  mk('The Skater', 'Street kid', 'm', { build: 1, skin: 1 }, { eyeColor: 1 }, { style: 6, color: 3 }, {}, { top: item('Plain tee', 'white'), jacket: item('Puffer jacket', 'red', 'black'), bottoms: item('Black jeans', 'black'), shoes: item('High-tops', 'white', 'white'), glasses: item('Sunglasses') }),
  mk('The Beachgoer', 'Sun chaser', 'f', { build: 3, skin: 11 }, { eyeColor: 1, lips: 2 }, { style: 20, color: 2 }, {}, { top: item('Tank top', 'black'), bottoms: item('Sarong', 'teal', 'lime', 4), shoes: item('Flip-flops', 'black'), glasses: item('Sunglasses'), jewel: item('Hoop earrings', 'gold') }),
  mk('The Rancher', 'Country roots', 'm', { build: 4, skin: 7, age: 4 }, { shape: 2, brows: 5 }, { style: 3, color: 3, facial: 3 }, {}, { top: item('Flannel shirt', 'red', 'black'), jacket: item('Bib overalls', 'denim', 'gold'), bottoms: item('Jeans'), shoes: item('Work boots', 'brown'), hat: item('Cowboy hat', 'tan') }),
  mk('The Club-goer', 'Night owl', 'f', { build: 0, skin: 9 }, { eyes: 4, lips: 2 }, { style: 26, color: 15 }, { makeup: 2, makeupColor: 1 }, { top: item('Crop top', 'black'), bottoms: item('Denim shorts', 'denim'), shoes: item('Skate shoes', 'black', 'white'), hat: item('Baseball cap', 'black'), jewel: item('Bangles', 'silver') }),
  mk('The Executive', 'Big ambitions', 'm', { build: 1, skin: 1, age: 1 }, { shape: 3 }, { style: 7, color: 3, facial: 1 }, {}, { set: item('Business suit', 'black', 'navy'), shoes: item('Oxfords', 'black'), glasses: item('Sunglasses'), bag: item('Briefcase', 'brown'), jewel: item('Watch', 'silver') }),
  mk('The Barista', 'Local favourite', 'f', { build: 1, skin: 8 }, { eyeColor: 4, freckles: 1 }, { style: 21, color: 9 }, {}, { top: item('Plain tee', 'black'), jacket: item('Apron', 'forest', 'cream'), bottoms: item('Chinos', 'black'), shoes: item('High-tops', 'black', 'white'), bag: item('Coffee to go') }),
  mk('The Punk', 'Outsider', 'm', { build: 2, skin: 1 }, { brows: 2 }, { style: 10, color: 14, facial: 1 }, { tattoos: 0b00101, piercings: 0b0001 }, { top: item('Tank top', 'black'), jacket: item('Studded vest', 'black', 'silver'), bottoms: item('Ripped jeans', 'black'), shoes: item('Combat boots', 'black'), jewel: item('Watch', 'black') }),
  mk('The Jogger', 'Disciplined', 'f', { build: 2, skin: 10 }, { shape: 4 }, { style: 20, color: 1 }, {}, { top: item('Sports bra', 'hot pink'), bottoms: item('Leggings', 'plum'), shoes: item('Running shoes', 'white', 'white'), jewel: item('Hoop earrings', 'gold') }),
  mk('The Outdoorsy', 'Hard worker', 'm', { build: 2, skin: 13 }, { shape: 2 }, { style: 1, color: 0, facial: 2 }, {}, { top: item('Hi-vis vest', 'hi-vis', 'black'), bottoms: item('Cargo pants', 'black'), shoes: item('Work boots', 'brown'), hat: item('Beanie', 'black') }),
  mk('The Local', 'Good vibes', 'm', { build: 4, skin: 0, age: 4 }, { shape: 1 }, { style: 8, color: 13, facial: 3 }, {}, { top: item('Hawaiian shirt', 'royal blue', 'orange'), bottoms: item('Shorts', 'khaki'), shoes: item('Flip-flops', 'navy'), glasses: item('Sunglasses') }),
  mk('The Blue-collar', 'Keeps it real', 'm', { build: 2, skin: 2, age: 1 }, { shape: 2 }, { style: 2, color: 1, facial: 2 }, {}, { top: item('Work shirt', 'royal blue', 'navy'), bottoms: item('Work trousers', 'royal blue'), shoes: item('Work boots', 'brown'), hat: item('Baseball cap', 'navy', 'orange'), bag: item('Tool bag', 'red') }),
  mk('The Trendsetter', 'Ahead of the curve', 'f', { build: 0, skin: 15 }, { eyes: 1, lips: 4 }, { style: 24, color: 0 }, {}, { top: item('Crop top', 'black'), bottoms: item('Cargo pants', 'tan'), shoes: item('Sneakers', 'white'), jewel: item('Bangles', 'gold') }),
];

// ---- the police's uniform (CC5) --------------------------------------------------------------------------------------------
// A look in the uniform by rank (shared/rules.js POLICE_RANKS: 0 Officer .. 5 Chief of Police), keeping the body, face and
// hair: the patrol shirt and the police cap; a sergeant's chevrons; from lieutenant the dress uniform and the braided cap;
// the chief's white gloves. kind 'rookie': a light blue shirt and a ball cap; 'k9': a tactical vest over the shirt and a
// ball cap. shades: sunglasses (half the street's officers wear them).
export function policeLook(L, rank = 0, kind = null, shades = false) {
  const V = validLook(L) || emptyLook('m'), O = V.outfit;
  for (const s of SLOTS) O[s] = null;
  if (rank >= 3) {
    O.set = item('Dress uniform'); O.hat = item("Officer's cap"); O.shoes = item('Oxfords', 'black');
    if (rank >= 5) O.jewel = item('Dress gloves');
  } else {
    O.top = item(rank >= 2 ? "Sergeant's shirt" : 'Uniform shirt', kind === 'rookie' ? 'sky' : 'navy', 'gold');
    O.bottoms = item('Uniform trousers', 'navy');
    O.shoes = item('Work boots', 'black');
    O.hat = kind === 'rookie' || kind === 'k9' ? item('Baseball cap', 'navy', 'gold') : item('Police cap');
    if (kind === 'k9') O.jacket = item('Tactical vest', 'black');
  }
  if (shades) O.glasses = item('Sunglasses');
  return validLook(V);
}

// ---- the old random outfit (server entities.js playerOutfit) -> a look -----------------------------------------------------
function nearest(list, hex) {
  const [r, g, b] = hexRgb(hex);
  let best = 0, bd = Infinity;
  list.forEach((e, i) => { const [R, G, B] = hexRgb(Array.isArray(e) ? e[0] : e); const d = (r - R) * (r - R) + (g - G) * (g - G) + (b - B) * (b - B); if (d < bd) { bd = d; best = i; } });
  return best;
}
export const nearestCloth = (hex) => nearest(CLOTH, hex);
export function lookFromOutfit(o) {
  o = o || {};
  const fem = o.h === 2 || o.h === 5 || o.t === 5;
  const base = fem ? 'f' : 'm';
  const L = emptyLook(base);
  L.body.skin = clampI(o.s, 0, 5, 1);
  L.body.build = [0, 1, 2, 4][clampI(o.bd, 0, 3, 1)];
  L.hair.color = nearest(HAIR_COLORS, o.hc || '#3b2414');
  L.hair.style = fem ? [19, 20, 16, 21, 17, 21][clampI(o.h, 0, 5, 0)] : [2, 6, 16, 0, 5, 20][clampI(o.h, 0, 5, 0)];
  const tc = nearestCloth(o.tc || '#888888'), tc2 = nearestCloth(o.tc2 || '#ffffff');
  const topName = ['Plain tee', 'Business suit', 'Hoodie', 'Hi-vis vest', 'Cardigan', 'Slip dress', 'Work shirt', 'Fur coat'][clampI(o.t, 0, 7, 0)];
  const P = PIECES[byName(topName)];
  if (P.slot === 'set') L.outfit.set = { id: P.i, c: tc, t: tc2, p: 0 };
  else if (P.slot === 'jacket') { L.outfit.jacket = { id: P.i, c: tc, t: tc2, p: 0 }; L.outfit.top = item('Plain tee', tc2); }
  else L.outfit.top = { id: P.i, c: tc, t: tc2, p: 0 };
  if (!L.outfit.set) L.outfit.bottoms = { id: byName(nearestCloth(o.l || '#2a4a8a') === col('denim') ? 'Jeans' : 'Chinos'), c: nearestCloth(o.l || '#2a4a8a'), t: 0, p: 0 };
  const sh = nearestCloth(o.sh || '#222222');
  L.outfit.shoes = { id: byName(sh === col('white') ? 'Sneakers' : fem && o.t === 5 ? 'Heels' : 'Oxfords'), c: sh, t: 0, p: 0 };
  const ht = clampI(o.ht, 0, 5, 0);
  if (ht) L.outfit.hat = { id: byName(['', 'Baseball cap', 'Hard hat', fem ? 'Sun hat' : 'Fedora', 'Beanie', 'Bike helmet'][ht]), c: nearestCloth(o.htc || '#222222'), t: 0, p: 0 };
  if (o.b === 1) L.outfit.bag = item('Briefcase');
  else if (o.b === 2 && fem) L.outfit.bag = item('Handbag');
  else if (o.b === 3) L.outfit.bag = item('Duffel bag');
  else if (o.b === 4) L.outfit.glasses = item('Sunglasses');
  return validLook(L);
}
// a preset for a brand-new player (until they pick their own): one of the starters, by their id
export function starterFor(n) { return STARTERS[(n >>> 0) % STARTERS.length].look; }
