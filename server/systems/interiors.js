// Staff for walk-in buildings: a clerk behind every shop counter, a teller at the bank, a nurse at
// the hospital desk, a clerk at the courthouse and a desk sergeant at the police station. They
// only exist while a player is nearby, and a clerk who was hurt or killed is replaced a minute
// later.
import { spawnNpc, despawnNpc } from './npc.js';
import { inAnyView } from '../view.js';

const NEAR_PX = 1100, FAR_PX = 1500, REPLACE_S = 60;
const STAFF = {
  police: ['cop', 'cop'], hospital: ['medic', 'civ'], bank: ['executive', 'civ'], courthouse: ['executive', 'civ'],
  fence: ['hustler', 'civ'], pawn: ['hustler', 'civ'], gunshop: ['construction', 'civ'], club: ['hustler', 'civ'],
};
const DANCERS = 5; // clubbers on the floor of an open club (only while a player is near)
const TILE = 32;

export function update(world) {
  if (world.tick % 20 !== 13) return;
  world.clerks ??= new Map();
  const players = [...world.players.values()].filter((p) => p.ped && !p.ped.dead);
  const nearest = (x, y) => { let d = Infinity; for (const p of players) d = Math.min(d, Math.hypot(p.ped.x - x, p.ped.y - y)); return d; };
  for (const id of world.map.walkIns || []) {
    const b = world.map.buildings[id];
    b.walkIn.units.forEach((u, i) => {
      const key = id * 16 + i;
      const st = world.clerks.get(key) || { ped: 0, goneAt: -99 };
      world.clerks.set(key, st);
      const ped = st.ped ? world.get(st.ped) : null;
      const d = nearest(u.clerk.x, u.clerk.y);
      if (u.kind === 'club') clubbers(world, id, i, b, u, d);
      const onDuty = ped && !ped.dead && !ped.removed && ped.npc && ped.npc.desk;
      if (ped && !onDuty && !st.goneAt) st.goneAt = world.time; // hurt, fled or killed
      if (!onDuty && st.ped && (!ped || ped.removed)) st.ped = 0;
      if (onDuty && d > FAR_PX) { despawnNpc(world, ped); st.ped = 0; st.goneAt = 0; return; }
      if (onDuty || d > NEAR_PX) return;
      if (st.goneAt && world.time - st.goneAt < REPLACE_S) return;
      if (st.goneAt > 0 && inAnyView(world, u.clerk.x, u.clerk.y, 40)) return; // the replacement turns up while nobody's looking
      const [arch, role] = STAFF[u.kind] || ['casual', 'civ'];
      const c = spawnNpc(world, arch, u.clerk.x, u.clerk.y, role);
      c.npc.desk = { x: u.clerk.x, y: u.clerk.y, a: u.clerk.a };
      c.npc.keep = true; c.npc.clerkOf = key;
      c.a = u.clerk.a;
      if (role === 'cop') c.weapon = 'service';
      st.ped = c.id; st.goneAt = 0;
    });
  }
}

// A club after dark: a handful of people dancing between the bar and the doors (they sway on the
// spot - render/peds turn them); gone by day or when nobody's around.
function clubbers(world, bid, i, b, u, d) {
  world.dancers ??= new Map();
  const key = bid * 16 + i;
  const list = (world.dancers.get(key) || []).filter((id) => { const e = world.get(id); return e && !e.dead && !e.removed && e.npc && e.npc.desk; });
  const open = world.clock.isNight && d < NEAR_PX;
  if (!open || d > FAR_PX) {
    for (const id of list) { const e = world.get(id); if (e && !inAnyView(world, e.x, e.y, 30)) despawnNpc(world, e); }
    world.dancers.set(key, list.filter((id) => world.get(id)));
    return;
  }
  const dir = b.walkIn.south ? 1 : -1;
  const front = b.walkIn.south ? b.walkIn.y1 : b.walkIn.y0;
  const y0 = (u.counterRow + dir * 2) * TILE, y1 = (front - dir) * TILE;
  while (list.length < DANCERS) {
    const x = (u.x0 + 0.5 + Math.random() * (u.x1 - u.x0)) * TILE;
    const y = Math.min(y0, y1) + Math.random() * Math.max(8, Math.abs(y1 - y0));
    const arch = ['casual', 'hustler', 'executive', 'casual'][Math.floor(Math.random() * 4)];
    const c = spawnNpc(world, arch, x, y, 'civ');
    c.npc.desk = { x, y, a: Math.random() * 6.28 };
    c.npc.keep = true; c.npc.dancer = true;
    list.push(c.id);
  }
  world.dancers.set(key, list);
}
