// The showers out in the world (nat5, the owner 2026-10-31: "Also can we add a few more bath houses and showers into the
// world?"): every outdoor shower on the map - the beaches', the boardwalk's, the pools' and the water park's (prop
// 'shower') and the campgrounds' shower blocks ('showerhut': shared/world3-showers.js lays the ones the places lacked) -
// works: on foot beside one, the action button puts you under it for BATH.outS s (stand still: a step away and you're
// out from under it); done, the wash (grime.js: the blood and the dirt off you, the bleeding stopped, a burn out, the red
// footprints gone) and BATH.outHeal health back, as a shower at home does. Everyone nearby sees the water run (the
// 'shw' event: client/main.js splashes the water at its foot).
//   p.outShower { until, x, y, i }: under the map's prop i since; bathhouse.js update calls update here every tick
import { BATH } from '../../shared/rules-play.js';
import * as grime from './grime.js';

const KINDS = { shower: { r: BATH.reach, word: 'the outdoor shower' }, showerhut: { r: BATH.reach + 24, word: 'the shower block' } };

// every shower prop's index (made once)
export function showerIdx(map) {
  if (map._showers) return map._showers;
  const out = [];
  (map.props || []).forEach((p, i) => { if (p && KINDS[p.t]) out.push(i); });
  Object.defineProperty(map, '_showers', { value: out, enumerable: false, configurable: true });
  return out;
}
// the nearest shower within its reach of (x, y): { i, p, d } or null
export function showerNear(world, x, y) {
  let best = null;
  for (const i of showerIdx(world.map)) {
    const p = world.map.props[i], K = KINDS[p.t];
    if (Math.abs(p.x - x) > K.r || Math.abs(p.y - y) > K.r) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < K.r && (!best || d < best.d)) best = { i, p, d };
  }
  return best;
}

// the action button (players.js findInteraction): on foot by a shower
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.carrying || ped.board) return null;
  if (p.outShower) return { label: 'Under the shower - stand still', passive: true, run: () => {} };
  const s = showerNear(world, ped.x, ped.y);
  if (!s) return null;
  const w = grime.grimeWord(ped);
  return { label: `Take a shower at ${KINDS[s.p.t].word}${w ? ` - wash off ${w}` : ''}`, run: () => start(world, p, s) };
}
function start(world, p, s) {
  const ped = p.ped;
  p.outShower = { until: world.time + BATH.outS, x: ped.x, y: ped.y, i: s.i };
  ped.vx = 0; ped.vy = 0; ped.bleeding = false;   // (the bleeding stops as you step under it)
  world.emit(s.p.x, s.p.y, { e: 'shw', x: Math.round(s.p.x), y: Math.round(s.p.y), s: BATH.outS });
  world.notify(p, 'The cold water runs over you...', 'info');
}

// every tick: a shower's done - or you stepped out from under it
export function update(world) {
  for (const p of world.players.values()) {
    const o = p.outShower;
    if (!o) continue;
    const ped = p.ped;
    if (!ped || ped.dead || ped.vehId || ped.hidden) { p.outShower = null; continue; }
    if (Math.hypot(ped.x - o.x, ped.y - o.y) > 14) { p.outShower = null; world.notify(p, 'You step out from under the shower.', 'info'); continue; }
    if (world.time < o.until) continue;
    p.outShower = null;
    ped.hp = Math.min(ped.maxHp, ped.hp + BATH.outHeal);
    world.notify(p, grime.wash(world, ped) ? 'The blood and the dirt washed off - fresh and clean.' : 'Fresh and clean.', 'good');
    p.meDirty = true;
  }
}
