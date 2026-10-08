// Hunting: the wild animals (shared/fauna.js, wildlife.js) are game. Bring one down and stand over it: the action
// button field-dresses it - a few seconds kneeling still, longer for the big ones, quicker with a Hunting Knife -
// for its meat, its hide or pelt, and the parts the trappers pay for (antlers, horns, tusks, claws, fangs, castoreum,
// feathers). How it was taken decides what it's worth (fauna.js gradeOf: one clean shot with the right weapon gives a
// perfect hide; a pistol, a shotgun into a deer, several shots, a blade or fists give less; run over or blown up, the
// hide is ruined and much of the meat with it; roadkill's meat has spoiled). Skinning without a Hunting Knife tears
// the hide (a grade worse) and wastes meat. The rare pure white legendary animals give a legendary pelt. Arrows in a
// carcass come back when you dress it, and arrows that missed can be picked up off the ground. The young aren't worth
// dressing; a farmer's livestock is not game; the sea otters are protected (the wardens fine whoever shoots one).
// Raw meat cooks over any lit campfire: stand by the fire, press the action button, and everything raw in the bag
// comes off it cooked (fauna.js COOKS) - real food, and the big game makes hearty meals (economy.js: more health for
// a while). The Highland Hunting Lodge, the hunting camps and the trappers buy it all (shared/items.js SHOPS).
import { HUNT_REACH, HUNT_DRESS_S, HUNT_COOK_S, WARDEN_FINE, ARROW_PICKUP_PX, ARROW_KEEP_S } from '../../shared/rules.js';
import { ITEMS, peltOf, graded } from '../../shared/items.js';
import { SPECIES, COOKS, gradeOf, GRADE_NAME } from '../../shared/fauna.js';
import { K } from '../../shared/constants.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as events from './events.js';
import * as campfires from './campfires.js';

const rng = mulberry32(7741);
const MOVE_PX = 14;   // moving this far stops the work
const LIVESTOCK = new Set(['cow', 'sheep', 'horse', 'goat', 'pig']);
const DRESS_K = { tiny: 0.5, small: 0.7, medium: 1, large: 1.45, huge: 1.9 };   // how long dressing takes, by size
const KNIFE_K = 0.7;                                                               // ...with a hunting knife

// what each kind of game gives (fauna.js loot): [item, min, max, chance?]
export const GAME = Object.fromEntries(Object.entries(SPECIES).map(([k, S]) => [k, { name: S.name.toLowerCase(), loot: S.loot }]));

const hasKnife = (p) => p.profile.weapons.huntknife !== undefined;
const commonName = (c) => {
  const S = SPECIES[c.wild.kind];
  return S ? S.name.replace(/^(Black-tailed|Roosevelt|Ring-necked|California|Cottontail|Grey|Canada|Wild) /, '').toLowerCase() : c.wild.kind;
};

// the nearest dead animal within reach (game or livestock), or null
function carcassNear(world, x, y) {
  let best = null, bd = HUNT_REACH;
  for (const e of world.query(x, y, HUNT_REACH + 10, K.PED)) {
    if (!e.wild || !e.dead || e.dressed) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// a lit campfire within reach (the map's campfire props, lit now: campfires.js), or null
function fireNear(world, x, y) {
  const f = campfires.fireNear(world, x, y, HUNT_REACH + 16, true);
  return f ? f.p : null;
}
const rawIn = (p) => Object.keys(COOKS).filter((id) => (p.profile.inventory[id] || 0) > 0);

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  if (ped.hunt) return { label: ped.hunt.kind === 'cook' ? 'Cooking over the fire... (stand still)' : 'Field dressing... (stand still)', passive: true, run: () => {} };
  const c = carcassNear(world, ped.x, ped.y);
  if (c) {
    const w = c.wild, S = SPECIES[w.kind];
    if (LIVESTOCK.has(w.kind)) return { label: "Somebody's livestock - not game", run: () => world.notify(p, 'That was a farmer\'s animal, not game. Hunt the wild animals out in the woods, hills, marshes and desert.', 'warn') };
    if (S && S.protected) return { label: `A dead ${commonName(c)} - protected`, run: () => world.notify(p, `${S.name}s are protected: nobody will buy any part of one.`, 'warn') };
    if (S && w.young) return { label: `A young ${commonName(c)} - nothing worth taking`, run: () => world.notify(p, 'Too young to be worth dressing. Hunters leave the young ones be.', 'warn') };
    if (S) return { label: w.legend ? `Skin ${S.legend.name.replace(/^the /, 'the ')}` : `Field dress the ${commonName(c)}`, run: () => begin(world, p, 'dress', c.id) };
  }
  const f = rawIn(p).length ? fireNear(world, ped.x, ped.y) : null;
  if (f) return { label: 'Cook your meat over the fire', run: () => begin(world, p, 'cook', 0) };
  return null;
}

export function begin(world, p, kind, id) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden) return 'Not right now.';
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return 'busy'; }
  let secs = HUNT_COOK_S;
  if (kind === 'dress') {
    const c = world.get(id), S = c && c.wild && SPECIES[c.wild.kind];
    secs = HUNT_DRESS_S * (S ? DRESS_K[S.size] || 1 : 1) * (hasKnife(p) ? KNIFE_K : 1);
  }
  ped.hunt = { kind, id, at: world.time, x: ped.x, y: ped.y, secs };
  ped.vx = 0; ped.vy = 0;
  world.notify(p, kind === 'cook' ? 'You set the meat over the coals... (stand still)' : hasKnife(p) ? 'You kneel and get to work with your hunting knife... (stand still)' : 'You kneel and get to work - no proper skinning knife, so it\'s rough going... (stand still)', 'info');
  p.meDirty = true;
  return null;
}

export function update(world) {
  if (world.tick % 2) return;
  const now = world.time;
  for (const p of world.players.values()) {
    const ped = p.ped, h = ped && ped.hunt;
    if (ped && !h && world.arrows && world.arrows.length && !ped.vehId && !ped.dead) pickUpArrows(world, p);
    if (!h) continue;
    const c = h.kind === 'dress' ? world.get(h.id) : null;
    const lost = h.kind === 'dress' ? !c || !c.dead || c.dressed : !fireNear(world, ped.x, ped.y) || !rawIn(p).length;
    if (ped.dead || ped.vehId || ped.hidden || now < ped.downUntil || (ped.lastHitAt || -99) > h.at || Math.hypot(ped.x - h.x, ped.y - h.y) > MOVE_PX || lost) {
      ped.hunt = null;
      if (!ped.dead) world.notify(p, h.kind === 'cook' ? 'You took the meat off the fire.' : 'You stopped.', 'warn');
      p.meDirty = true;
      continue;
    }
    if (now - h.at < (h.secs || (h.kind === 'cook' ? HUNT_COOK_S : HUNT_DRESS_S))) continue;
    ped.hunt = null;
    if (h.kind === 'dress') dress(world, p, c);
    else cook(world, p);
    p.meDirty = true;
    store.touch();
  }
  if (world.arrows && world.tick % 200 === 0) world.arrows = world.arrows.filter((a) => now - a.t < ARROW_KEEP_S);
}

// arrows lying where they came down: walk over one to pick it up (if you've a bow to shoot it from)
function pickUpArrows(world, p) {
  const ped = p.ped, prof = p.profile;
  if (prof.weapons.bow === undefined) return;
  let n = 0;
  world.arrows = world.arrows.filter((a) => {
    if (Math.abs(a.x - ped.x) > ARROW_PICKUP_PX || Math.abs(a.y - ped.y) > ARROW_PICKUP_PX || Math.hypot(a.x - ped.x, a.y - ped.y) > ARROW_PICKUP_PX) return true;
    n++;
    return false;
  });
  if (!n) return;
  prof.weapons.bow = (prof.weapons.bow || 0) + n;
  if (ped.weapon === 'bow' && !(ped.mag.bow > 0)) ped.mag.bow = 1;
  world.notify(p, `Picked up ${n > 1 ? n + ' arrows' : 'an arrow'}.`, 'info');
  p.meDirty = true;
}

// how it was brought down, from the hits noted on it (wildlife.noteHit)
function takenBy(c) {
  const hits = c.wild.hits || [];
  if (c.wild.roadkill) return 'roadkill';
  if (hits.some((h) => h.c === 'blast')) return 'blast';
  if (hits.some((h) => h.c === 'vehicle')) return 'vehicle';
  return 'hunt';
}

function dress(world, p, c) {
  const w = c.wild, S = SPECIES[w.kind], G = GAME[w.kind], inv = p.profile.inventory, got = [];
  const knife = hasKnife(p), how = takenBy(c);
  let grade = w.legend ? 3 : w.grade || gradeOf(w.kind, w.hits);
  if (!knife) grade = Math.max(1, grade - 1);
  const pelt = peltOf(w.kind);
  const meatK = how === 'roadkill' ? 0 : how === 'blast' ? 0.3 : how === 'vehicle' ? 0.6 : 1;
  const notes = [];
  for (const [id, lo, hi, chance] of G.loot) {
    const it = ITEMS[id];
    if (!it) continue;
    let n = lo + Math.floor(rng() * (hi - lo + 1)), out = id;
    if (id === pelt) {
      if (w.legend) out = 'legend_' + w.kind;
      else out = graded(id, grade);
    } else if (it.sell !== undefined && !it.pelt && COOKS[id]) {   // the meat
      n = Math.round(n * meatK * (knife ? 1 : 0.7));
      if (n <= 0) continue;
    } else {   // the parts: antlers, horns, tusks, claws... (a legend always has its trophy; a ruined carcass rarely)
      const p0 = chance === undefined ? 1 : chance * (grade === 3 ? 1.3 : grade === 1 ? 0.6 : 1);
      if (!w.legend && (how === 'blast' || rng() >= p0)) continue;
    }
    inv[out] = (inv[out] || 0) + n;
    got.push(`${n > 1 ? n + ' ' : ''}${ITEMS[out].name.toLowerCase()}`);
  }
  if (how === 'roadkill') notes.push('the meat has spoiled');
  else if (how === 'blast') notes.push('not much of it left');
  else if (how === 'vehicle') notes.push('bruised and broken');
  if (!knife && !w.legend) notes.push('a Hunting Knife would have taken the hide off whole');
  // the arrows in it come back
  if (c.arrows && p.profile.weapons.bow !== undefined) {
    p.profile.weapons.bow = (p.profile.weapons.bow || 0) + c.arrows;
    got.push(`${c.arrows > 1 ? c.arrows + ' arrows' : 'your arrow'} back`);
  }
  c.dressed = true;
  world.remove(c);
  const head = w.legend ? `${S.legend.name.replace(/^the /, 'The ')}: ` : `From the ${commonName(c)}${GRADE_NAME[grade] && pelt ? ` (${GRADE_NAME[grade].toLowerCase()} hide)` : ''}: `;
  world.notify(p, `${head}${got.join(', ') || 'nothing worth keeping'}${notes.length ? ' - ' + notes.join('; ') : ''}. The Highland Hunting Lodge and the trappers pay best.`, got.length ? 'good' : 'warn');
}

function cook(world, p) {
  const inv = p.profile.inventory, done = [];
  for (const raw of rawIn(p)) {
    const n = inv[raw], out = COOKS[raw];
    delete inv[raw];
    inv[out] = (inv[out] || 0) + n;
    done.push(`${n} ${ITEMS[out].name.toLowerCase()}`);
  }
  world.notify(p, `Cooked: ${done.join(', ')}. Eat it from your bag for health - the big game makes a hearty meal - or sell it at the lodge.`, 'good');
}

// wildlife.onKilled: a protected animal shot by a player brings the wardens' fine; a legend brought down is news
export function onKilled(world, a, attacker) {
  const w = a.wild, S = SPECIES[w.kind];
  const p = attacker && attacker.player;
  if (!S || !p) return;
  if (S.protected && !w.roadkill) {
    const prof = p.profile, fine = WARDEN_FINE;
    const fromCash = Math.min(prof.cash, fine);
    prof.cash -= fromCash; prof.bank = Math.max(0, prof.bank - (fine - fromCash));
    world.notify(p, `${S.name}s are protected. The wildlife wardens fine you $${fine}.`, 'bad');
    p.meDirty = true;
    store.touch();
  }
  if (w.legend) events.feed(world, { kind: 'news', text: `${p.name} brought down ${S.legend.name}`, x: a.x, y: a.y });
}
