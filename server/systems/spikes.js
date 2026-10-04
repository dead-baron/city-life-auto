// Spike strips: an on-duty officer throws one across the road ahead; any vehicle driven over it
// gets its tyres shredded (slow, slithery - see shared/physics.js) until a garage fits new ones.
// Strips are plain world state, announced to nearby clients as events (and re-announced every few
// seconds so anyone arriving later sees them too).
import { K, T } from '../../shared/constants.js';
import { SPIKE_STRIP_S } from '../../shared/rules.js';
import { segDist } from '../../shared/geom.js';

const HALF = 64;          // half the strip's length (px)
const AHEAD = 70;         // thrown this far in front of you
const ANNOUNCE_S = 3;
let nextId = 1;

const announce = (world, s) => world.emit(s.x, s.y, { e: 'spikes', id: s.id, x: Math.round(s.x), y: Math.round(s.y), a: +s.a.toFixed(3), half: HALF, left: Math.max(0, Math.round(s.until - world.time)) });

export function deploy(world, ped, aim) {
  world.spikes ||= [];
  const p = ped.player;
  if (p && !p.badge) { world.notify(p, 'Spike strips are police equipment.', 'warn'); return false; }
  if (ped.vehId || (ped.lz || 0) > 0.3 || ped.sub) { if (p) world.notify(p, 'Get out on the road to lay a spike strip.', 'warn'); return false; }
  const x = ped.x + Math.cos(aim) * AHEAD, y = ped.y + Math.sin(aim) * AHEAD;
  const t = world.map.tileAtPx(x, y);
  if (t === T.WATER || t === T.DEEP || t === T.BUILDING || t === T.WALL) { if (p) world.notify(p, 'No room to lay the strip there.', 'warn'); return false; }
  // one strip per officer: the old one is picked up
  for (const s of world.spikes) if (s.by === ped.id) world.emit(s.x, s.y, { e: 'spikesgone', id: s.id });
  world.spikes = world.spikes.filter((s) => s.by !== ped.id);
  const s = { id: nextId++, x, y, a: aim + Math.PI / 2, until: world.time + SPIKE_STRIP_S, by: ped.id, said: world.time };
  world.spikes.push(s);
  announce(world, s);
  if (p) world.notify(p, `Spike strip down - it stays ${SPIKE_STRIP_S}s.`, 'good');
  return true;
}

export function update(world) {
  const list = world.spikes;
  if (!list || !list.length || world.tick % 2) return;
  const now = world.time;
  for (const s of list) {
    if (now >= s.until) { world.emit(s.x, s.y, { e: 'spikesgone', id: s.id }); continue; }
    if (now - s.said >= ANNOUNCE_S) { s.said = now; announce(world, s); }
    const ax = s.x - Math.cos(s.a) * HALF, ay = s.y - Math.sin(s.a) * HALF;
    const bx = s.x + Math.cos(s.a) * HALF, by = s.y + Math.sin(s.a) * HALF;
    for (const v of world.query(s.x, s.y, HALF + 70, K.VEH)) {
      if (v.flat || v.wreckAt || v.def.kind === 'boat' || (v.lz || 0) > 0.3 || Math.hypot(v.vx, v.vy) < 40) continue;
      if (segDist({ x: v.x, y: v.y }, { x: ax, y: ay }, { x: bx, y: by }) > v.def.W / 2 + 6) continue;
      v.flat = true;
      world.emit(v.x, v.y, { e: 'pop', x: v.x, y: v.y });
      const drv = world.get(v.seats[0]);
      if (drv && drv.player) world.notify(drv.player, 'Spike strip! Your tyres are shredded - a garage can fit new ones.', 'bad');
    }
  }
  world.spikes = list.filter((s) => now < s.until);
}
