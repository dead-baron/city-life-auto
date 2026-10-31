// Feeding the ducks (the owner's notes part 2: "Feed ducks grapes and it gives you good samaritan points (has a daily
// cap but still significant, have to buy the grapes)"). The town ponds' tame ducks and geese (wildlife.js parkDucks)
// within DUCKS.reach of you, a Bunch of Grapes in your bag (a corner store, a gas station, the market - or picked in
// the vineyard): the action button throws them in. The nearest few paddle over to where they land and eat
// (wildlife.js 'tograpes', 'nibble'), and you're a good Samaritan for it: DUCKS.sam points a feed, up to DUCKS.dayCap a
// day (the real day: profile.duckDay / duckSam) - after that they still eat, and you get a kind word. A feed every
// DUCKS.gapS at most. Everyone near sees the grapes thrown ('duckfeed': client/leisure/stage.js).
import { K } from '../../shared/constants.js';
import { DUCKS } from '../../shared/rules-leisure.js';
import { setState } from './wildlife.js';
import { store } from '../store.js';

export const dayKey = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const isDuck = (e) => e.wild && e.wild.tame && !e.dead && !e.removed && !e.hidden && !e.wild.flewOff && (e.wild.kind === 'duck' || e.wild.kind === 'goose') && e.wild.state !== 'fly' && e.wild.state !== 'flee';

export function ducksNear(world, x, y, r = DUCKS.reach) {
  return world.query(x, y, r, K.PED).filter((e) => isDuck(e) && Math.hypot(e.x - x, e.y - y) < r).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
}
// today's Samaritan points from the ducks so far
export function today(p) {
  const prof = p.profile, k = dayKey();
  if (prof.duckDay !== k) { prof.duckDay = k; prof.duckSam = 0; }
  return prof.duckSam || 0;
}

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying || ped.hidden || ped.interior) return null;
  const near = ducksNear(world, ped.x, ped.y);
  if (!near.length) return null;
  if ((p.profile.inventory.grapes || 0) <= 0) {
    if (!p.duckHint) { p.duckHint = 1; world.notify(p, 'The ducks look hungry. A bunch of grapes would do - corner stores and gas stations sell them.', 'info'); }
    return null;
  }
  return { label: `Feed the ${near[0].wild.kind === 'goose' ? 'geese' : 'ducks'} some grapes`, run: () => feed(world, p) };
}

export function feed(world, p) {
  const ped = p.ped, inv = p.profile.inventory, now = world.time;
  if (!ped || ped.dead || (inv.grapes || 0) <= 0) return false;
  if (now - (p.duckFedAt ?? -99) < DUCKS.gapS) { world.notify(p, 'They\'re still busy with the last lot.', 'info'); return false; }
  const near = ducksNear(world, ped.x, ped.y);
  if (!near.length) return false;
  inv.grapes--;
  p.duckFedAt = now;
  // where the grapes land: between you and the nearest duck, a little short of it
  const d0 = near[0], dx = d0.x - ped.x, dy = d0.y - ped.y, dd = Math.hypot(dx, dy) || 1, k = Math.min(dd, Math.max(24, dd * 0.6));
  const tx = ped.x + dx / dd * k, ty = ped.y + dy / dd * k;
  world.emit(ped.x, ped.y, { e: 'duckfeed', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), tx: Math.round(tx), ty: Math.round(ty) });
  near.slice(0, DUCKS.ducks).forEach((a, i) => {
    const w = a.wild, an = i * 2.1;
    w.wx = tx + Math.cos(an) * (i ? 8 : 0); w.wy = ty + Math.sin(an) * (i ? 6 : 0);
    w.aware = 0;
    setState(w, 'tograpes', now, 8);
    a.a = Math.atan2(w.wy - a.y, w.wx - a.x);
  });
  const had = today(p), got = Math.max(0, Math.min(DUCKS.sam, DUCKS.dayCap - had));
  const who = near[0].wild.kind === 'goose' ? 'geese' : 'ducks';
  if (got > 0) {
    p.profile.samaritan = (p.profile.samaritan || 0) + got;
    p.profile.duckSam = had + got;
    world.notify(p, `The ${who} gobble up the grapes. +${got} Samaritan (${had + got}/${DUCKS.dayCap} from the ducks today).`, 'good');
  } else world.notify(p, `The ${who} gobble up the grapes. You've done them proud today - no more Samaritan points from the ducks until tomorrow.`, 'info');
  p.meDirty = true;
  store.touch();
  return true;
}
