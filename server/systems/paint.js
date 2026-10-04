// Spray & Go paint shops. Drive into the bay and stop: if you're wanted and anyone (a passer-by,
// a cop or a traffic camera) can see you, the shutter stays up. Otherwise it rolls down, the car
// comes out a new colour - not repaired - and the police lose your description.
import { K } from '../../shared/constants.js';
import { PAINTS } from '../../shared/vehicles.js';
import { PAINT_PRICE, PAINT_TIME_S } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as law from './law.js';

const rng = mulberry32(2718);
const TILE = 32;

function inBay(b, v) {
  return v.x > b.tx * TILE && v.x < (b.tx + b.tw) * TILE && v.y > b.ty * TILE && v.y < (b.ty + b.th) * TILE;
}

function pay(p, amount) {
  const prof = p.profile;
  if (prof.cash + prof.bank < amount) return false;
  const c = Math.min(prof.cash, amount);
  prof.cash -= c; prof.bank -= amount - c;
  return true;
}

export function update(world) {
  const bays = world.map.bays || [];
  if (!bays.length) return;
  world.bayState ??= bays.map(() => ({ closedUntil: 0, v: 0, warnAt: -99 }));
  const now = world.time;
  bays.forEach((b, i) => {
    const st = world.bayState[i];
    if (st.closedUntil) {
      if (now < st.closedUntil) return;
      finish(world, b, i, st);
      return;
    }
    if (world.tick % 4 !== i % 4) return;
    const here = world.query((b.tx + 1.5) * TILE, (b.ty + 1.5) * TILE, 70, K.VEH).filter((v) => inBay(b, v));
    if (st.done && !here.some((v) => v.id === st.done)) st.done = 0; // fresh paint drove off
    for (const v of here) {
      if (v.wreckAt || v.def.kind === 'boat' || v.id === st.done) continue;
      if (Math.abs(v.vx) + Math.abs(v.vy) > 30) continue;
      const d = v.seats[0] ? world.get(v.seats[0]) : null;
      const p = d && d.player;
      if (!p) continue;
      if (p.wanted > 0) {
        const w = law.witnesses(world, v.x, v.y, d, null);
        const chased = now - (p.seenAt || -99) < 2;
        if (w.count > 0 || chased) {
          if (now - st.warnAt > 6) { st.warnAt = now; world.notify(p, `Spray & Go: "Not with ${w.cop || chased ? 'the cops' : w.cam ? 'that camera' : 'people'} watching - lose them first."`, 'warn'); }
          continue;
        }
      }
      if (v.cargo.some((c) => c)) { if (now - st.warnAt > 6) { st.warnAt = now; world.notify(p, 'Spray & Go: "Unload the cargo first."', 'warn'); } continue; }
      if (!pay(p, PAINT_PRICE)) { if (now - st.warnAt > 6) { st.warnAt = now; world.notify(p, `A respray costs $${PAINT_PRICE}.`, 'warn'); } continue; }
      st.closedUntil = now + PAINT_TIME_S; st.v = v.id;
      v.vx = 0; v.vy = 0; v.input = { throttle: 0, steer: 0, hb: true };
      world.broadcast({ e: 'baydoor', i, open: false });
      world.notify(p, 'The shutter rolls down... hold tight.', 'info');
      p.meDirty = true;
      store.touch();
      break;
    }
  });
}

function finish(world, b, i, st) {
  const v = world.get(st.v);
  st.closedUntil = 0; st.done = st.v; st.v = 0; // one coat per visit: drive out and back in for another
  world.broadcast({ e: 'baydoor', i, open: true });
  if (!v) return;
  v.paint = (v.paint + 1 + Math.floor(rng() * (PAINTS.length - 1))) % PAINTS.length;
  v.variant = Math.floor(rng() * 1000);
  v.bloody = false; v.descVer = (v.descVer || 0) + 1;
  const d = v.seats[0] ? world.get(v.seats[0]) : null;
  const p = d && d.player;
  if (!p) return;
  if (p.wanted > 0) { law.clearWanted(world, p); world.notify(p, 'Fresh paint! The cops lost your description.', 'good'); }
  else world.notify(p, 'Fresh paint job. Looking good.', 'good');
  p.meDirty = true;
}

// welcome packet: which shutters are down right now
export function closedBays(world) { return (world.bayState || []).map((s, i) => (s.closedUntil ? i : -1)).filter((i) => i >= 0); }
