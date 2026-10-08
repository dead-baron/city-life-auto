// The wanderer: once in a long while, at night, a hooded stranger stands somewhere quiet out in the wilds - the old
// mission ruins, the Sentinel Stones, Fern Gorge, the summit tarn, the canyon oasis, the wreck on Wreck Island, the
// Giants Loop, the hot springs - with no blip on the map, no light, easy to walk past in the dark. He sells one thing,
// the plasma blade (shared/items.js), to anyone who finds him and can pay, and never draws it himself. Hit him and he's
// gone in a flash, not to be seen again for a long while. All the city hears is that someone saw a stranger out there.
import { T } from '../../shared/constants.js';
import { PED_BLOCK, WATER_T } from '../../shared/map.js';
import { PLASMA_PRICE, WANDERER_CHANCE, WANDERER_GONE_S } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as npc from './npc.js';
import * as events from './events.js';
import * as combat from './combat.js';
import * as economy from './economy.js';

const rng = mulberry32(4471);
const SITES = ['mission', 'stones', 'gorge', 'tarn', 'oasis', 'wreck', 'springs', 'trail', 'redwoodcove', 'desertcamp', 'cove'];
const STAY_S = 420;        // he stays this long (unless dawn comes first, and never while someone's watching)
const REACH = 48;          // stand this close to talk to him
const GREET_PX = 150;      // ...and he speaks when you come this close

// a quiet spot near one of the sites: open ground, not water, not on a road
function spotNear(world, x, y) {
  const m = world.map;
  for (let k = 0; k < 40; k++) {
    const a = rng() * Math.PI * 2, r = 60 + rng() * 220, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    const t = m.tileAtPx(px, py);
    if (PED_BLOCK[t] || WATER_T[t] || t === T.ROAD) continue;
    return { x: px, y: py };
  }
  return null;
}

// He appears: at one of the sites (or, for the debug menu, near (at.x, at.y)).
export function appear(world, at = null) {
  if (world.wanderer && world.get(world.wanderer.id)) return world.get(world.wanderer.id);
  let spot = null, site = '';
  if (at) spot = spotNear(world, at.x, at.y) || at;
  else {
    const list = (world.map.natureSites || []).filter((q) => SITES.includes(q.kind));
    for (let k = 0; k < 6 && !spot && list.length; k++) { const s = list[Math.floor(rng() * list.length)]; spot = spotNear(world, s.x, s.y); site = s.name; }
  }
  if (!spot) return null;
  const ped = npc.spawnNpc(world, 'wanderer', spot.x, spot.y, 'wanderer');
  ped.npc.desk = { x: spot.x, y: spot.y, a: rng() * Math.PI * 2 };
  ped.npc.keep = true;
  ped.name = 'a hooded stranger';
  world.wanderer = { id: ped.id, until: world.time + STAY_S, site, greeted: new Set() };
  if (!at) events.feed(world, { kind: 'news', text: 'Campers tell of a hooded stranger walking the wilds tonight' });
  return ped;
}

// He goes: quietly when nobody's about, or in a flash of blue light (struck: not back for a long while).
function leave(world, ped, flash) {
  if (flash) { world.emit(ped.x, ped.y, { e: 'poof', x: ped.x, y: ped.y, k: 'plasma' }); world.wandererNext = world.time + WANDERER_GONE_S; }
  npc.despawnNpc(world, ped);
  world.wanderer = null;
}
const watched = (world, ped) => { for (const p of world.players.values()) if (p.ped && !p.ped.dead && Math.hypot(p.ped.x - ped.x, p.ped.y - ped.y) < 900) return true; return false; };

// combat.damage: anyone who strikes at him finds nothing there
export function struck(world, ped, attacker) {
  if (attacker && attacker.player) world.notify(attacker.player, 'The stranger is gone in a flash of blue light.', 'warn');
  leave(world, ped, true);
}

export function update(world) {
  if (world.tick % 20 !== 13) return;   // (once a second)
  const now = world.time, w = world.wanderer, night = !!(world.clock && world.clock.isNight);
  if (w) {
    const ped = world.get(w.id);
    if (!ped || ped.dead) { world.wanderer = null; return; }
    // he greets whoever comes near, once
    for (const p of world.players.values()) {
      const q = p.ped;
      if (!q || q.dead || w.greeted.has(p.pid) || Math.hypot(q.x - ped.x, q.y - ped.y) > GREET_PX) continue;
      w.greeted.add(p.pid);
      ped.npc.desk.a = Math.atan2(q.y - ped.y, q.x - ped.x);
      world.emit(ped.x, ped.y, { e: 'say', id: ped.id, x: ped.x, y: ped.y, text: p.profile.weapons.plasma !== undefined ? 'Still carrying it, I see.' : 'You came a long way to find me.' });
    }
    if ((now > w.until || !night) && !watched(world, ped)) leave(world, ped, false);
    return;
  }
  if (!night) { world.wandererNight = false; return; }   // (a fresh chance every night)
  if (world.wandererNight || now < (world.wandererNext || 0) || !world.players.size) return;
  world.wandererNight = true;
  if (rng() < WANDERER_CHANCE) appear(world, null);
}

export function interaction(world, p) {
  const w = world.wanderer, ped = p.ped;
  if (!w || !ped || ped.vehId) return null;
  const s = world.get(w.id);
  if (!s || Math.hypot(s.x - ped.x, s.y - ped.y) > REACH) return null;
  if (p.profile.weapons.plasma !== undefined) return { label: 'The hooded stranger nods to you', run: () => world.emit(s.x, s.y, { e: 'say', id: s.id, x: s.x, y: s.y, text: 'Use it well.' }) };
  return { label: `Speak to the hooded stranger (Plasma Blade $${PLASMA_PRICE.toLocaleString('en-US')})`, run: () => buy(world, p, s) };
}

function buy(world, p, s) {
  if (!economy.payFrom(p, PLASMA_PRICE)) {
    world.emit(s.x, s.y, { e: 'say', id: s.id, x: s.x, y: s.y, text: 'Come back when you have the means.' });
    world.notify(p, `The stranger wants $${PLASMA_PRICE.toLocaleString('en-US')} for the blade.`, 'warn');
    return;
  }
  p.profile.weapons.plasma = 0;
  if (p.ped) combat.selectWeapon(world, p.ped, 'plasma');
  world.emit(s.x, s.y, { e: 'say', id: s.id, x: s.x, y: s.y, text: 'It chose you. Do not make me regret it.' });
  world.notify(p, 'The Plasma Blade is yours. It cuts through most people in one stroke, and turns a bullet aside now and then.', 'good');
  p.meDirty = true;
  store.touch();
}
