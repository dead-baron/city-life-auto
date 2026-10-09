// What's under the ground (shared/underground.js, server/systems/underground.js): the sewers under the city's streets
// (down one manhole, along the tunnel, up another; a passage to the subway), the police losing a suspect who goes down
// unseen, the cave under the Granite Peaks (its chambers joined from the way in, dark but for lights and glowing
// things), its bats, the den bear and the falling rocks, and the boat on the underground river.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { undergroundOf, ugMapOf, cellAtPx, openAt, lightAt, ugLos, UG, C } from '../shared/underground.js';
import { pedStep, vehStep } from '../shared/physics.js';
import * as vehicles from '../server/systems/vehicles.js';
import { TILE, T, K } from '../shared/constants.js';
import { STAR_HEAT } from '../shared/constants.js';
import { POLICE_FOLLOW_S, ROCKFALL_WARN_S, ROCKFALL_DMG } from '../shared/rules.js';
import * as players from '../server/systems/players.js';
import * as law from '../server/systems/law.js';
import * as ug from '../server/systems/underground.js';
import { spawnNpc } from '../server/systems/npc.js';

// the open cells reachable from (x, y) underground (4-connected, over walkways, floors, streams, shafts and water)
function reach(L, x, y) {
  const seen = new Set(), q = [[Math.floor(x / TILE), Math.floor(y / TILE)]];
  const key = (tx, ty) => ty * 4096 + tx;
  seen.add(key(q[0][0], q[0][1]));
  while (q.length) {
    const [tx, ty] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx, ny = ty + dy, k = key(nx, ny);
      if (seen.has(k) || !openAt(L, (nx + 0.5) * TILE, (ny + 0.5) * TILE)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return (px, py) => seen.has(key(Math.floor(px / TILE), Math.floor(py / TILE)));
}
const act = (w, p) => { const a = players.findInteraction(w, p); return a; };

test('sewers: manholes over a few routes, down one, through the tunnel, up another; a route reaches the subway', () => {
  const w = makeWorld();
  const L = undergroundOf(w.map);
  assert.ok(L.routes.length >= 2, `two or three sewer routes (${L.routes.length})`);
  for (const r of L.routes) {
    assert.ok(r.manholes.length >= 2, 'each route has manholes at both ends at least');
    const ok = reach(L, r.manholes[0].x, r.manholes[0].y);
    for (const m of r.manholes) assert.ok(ok(m.x, m.y), 'every manhole of a route is joined to the others underground');
    for (const m of r.manholes) assert.notEqual(w.map.tileAtPx(m.x, m.y), T.BUILDING, 'the covers are out on the street');
  }
  const linked = L.routes.filter((r) => r.door);
  assert.ok(linked.length >= 1, 'at least one route joins a subway station');
  const r0 = linked[0], ok0 = reach(L, r0.manholes[0].x, r0.manholes[0].y);
  assert.ok(ok0(r0.door.x, r0.door.y), 'the station door is reachable along the tunnel');
  assert.ok(w.map.rail.stations[r0.door.st].under, '...and it is a subway station');
  // the layout is the same however often it's worked out (the client works it out too)
  assert.deepEqual(undergroundOf({ ...w.map }).routes.map((r) => r.manholes), L.routes.map((r) => r.manholes));

  // down one manhole...
  const { p } = joinPlayer(w);
  const A = r0.manholes[0], B = r0.manholes[r0.manholes.length - 1];
  teleport(w, p.ped, A.x, A.y);
  const down = act(w, p);
  assert.ok(down && /manhole/i.test(down.label), `the action at a manhole climbs down (${down && down.label})`);
  down.run();
  assert.equal(p.ped.ug, UG.SEWER); assert.ok(p.ped.sub, 'underground: the subway\'s level');
  // ...the physics walks you through the tunnels and stops you at the brick
  const s = { x: A.x, y: A.y, a: 0, vx: 0, vy: 0, stamina: 100, rollT: 0, rdx: 0, rdy: 0, prevBits: 0, ug: UG.SEWER };
  for (let i = 0; i < 200; i++) pedStep(s, { bits: 0, mx: 1, my: 0, aim: 0 }, 0.05, w.map, { canMove: true, canSprint: false, speedMul: 1, staminaMax: 100, analog: true });
  assert.ok(openAt(L, s.x, s.y), 'walking about down there keeps you in the tunnels');
  assert.equal(ugMapOf(w.map).tileAtPx(A.x, A.y - 400) === T.WALL || openAt(L, A.x, A.y - 400), true);
  // ...along to the far end, and up the ladder there
  teleport(w, p.ped, B.x, B.y);
  const up = act(w, p);
  assert.ok(up && /ladder/i.test(up.label), `a ladder up at the next manhole (${up && up.label})`);
  up.run();
  assert.equal(p.ped.ug, 0); assert.ok(!p.ped.sub, 'back up on the street');
  assert.ok(Math.hypot(p.ped.x - B.x, p.ped.y - B.y) < 2, 'out of the cover at the other end');
  // the service door into the station
  teleport(w, p.ped, A.x, A.y); act(w, p).run();
  teleport(w, p.ped, r0.door.x, r0.door.y);
  const door = act(w, p);
  assert.ok(door && /station/i.test(door.label), `the service door into the station (${door && door.label})`);
  door.run();
  const st = w.map.rail.stations[r0.door.st];
  assert.ok(!p.ped.ug && Math.hypot(p.ped.x - st.platform.x, p.ped.y - st.platform.y) < 2, 'up the station\'s stairs');
});

test('sewers: the police lose a suspect who goes down unseen; officers who saw it climb down after them', () => {
  const w = makeWorld();
  const L = undergroundOf(w.map), r = L.routes[0], A = r.manholes[0];
  const { p } = joinPlayer(w);
  teleport(w, p.ped, A.x, A.y);
  law.addHeat(w, p, STAR_HEAT[1] + 2, A.x, A.y);
  assert.ok(p.wanted >= 1);
  // nobody about: down you go, and the street can't see you
  const far = spawnNpc(w, 'cop', A.x + 900, A.y, 'cop');
  act(w, p).run();
  assert.ok(!far.ugFollow, 'an officer too far off never saw it');
  const street = spawnNpc(w, 'cop', A.x + 40, A.y, 'cop');   // standing right over the cover, up on the street
  p.seenAt = w.time - 10;
  law.update(w, 0.05);
  assert.ok(w.time - p.seenAt > 5, 'an officer on the street right over you doesn\'t see you down there');
  w.remove(street); w.remove(far);
  for (let i = 0; i < 1200 && p.wanted > 0; i++) law.update(w, 0.05);
  assert.equal(p.wanted, 0, 'the trail goes cold: lost the cops');

  // seen going down: they come down after you and can see you down there
  ug.climbUp(w, p, A);
  law.addHeat(w, p, STAR_HEAT[2] + 2, A.x, A.y);
  const cop = spawnNpc(w, 'cop', A.x + 120, A.y, 'cop');
  cop.npc.beat = true;
  assert.ok(w.map.los(cop.x, cop.y, A.x, A.y), 'a clear view of the cover');
  act(w, p).run();
  assert.ok(cop.ugFollow, 'he saw you go down');
  run(w, POLICE_FOLLOW_S + 0.5);
  assert.equal(cop.ug, UG.SEWER, 'and climbed down after you');
  p.seenAt = w.time - 10;
  law.update(w, 0.05);
  assert.ok(w.time - p.seenAt < 1, 'down there he sees you along the tunnel');
});

test('the cave: chambers joined from the way in; dark but for lights and glowing things', () => {
  const w = makeWorld();
  const L = undergroundOf(w.map), K2 = L.cave;
  assert.ok(K2, 'a cave under the Granite Peaks');
  assert.ok(K2.chambers.length >= 6, 'several chambers');
  const ok = reach(L, K2.inside.x, K2.inside.y);
  for (const c of K2.chambers) assert.ok(ok(c.x, c.y) || ok(c.x, c.y + 60) || ok(c.x - 60, c.y), `${c.name} is reachable from the way in`);
  assert.ok(ok(K2.den.x, K2.den.y), 'the den too');
  assert.equal(cellAtPx(L, K2.boat.x, K2.boat.y), C.RIVER, 'the boat waits on the river');
  // in through the adit, out again
  const { p } = joinPlayer(w);
  teleport(w, p.ped, K2.mouth.x, K2.mouth.y);
  const a = act(w, p);
  assert.ok(a && /cave/i.test(a.label), `the adit leads into the cave (${a && a.label})`);
  a.run();
  assert.equal(p.ped.ug, UG.CAVE);
  const out = act(w, p);
  assert.ok(out && /out of the cave/i.test(out.label), 'and out again by the way in');
  // dark: only lights and glowing things light it
  let dark = null;
  for (const c of K2.chambers) {
    if (c.glow) continue;
    if (K2.glow.every((g) => Math.hypot(g.x - c.x, g.y - c.y) > g.r)) { dark = c; break; }
  }
  assert.ok(dark, 'a chamber with nothing glowing in it');
  assert.equal(lightAt(L, dark.x, dark.y, []), 0, 'pitch dark with no light');
  assert.ok(lightAt(L, dark.x, dark.y, [{ x: dark.x + 20, y: dark.y, r: 200, k: 1 }]) > 0.5, 'a flashlight lights it');
  const gl = K2.glow[0];
  assert.ok(lightAt(L, gl.x, gl.y, []) > 0.2, 'glowing mushrooms and worms give their own light');
  assert.ok(K2.glow.some((g) => g.kind === 'worms') && K2.glow.some((g) => g.kind === 'mush'), 'glow worms and mushrooms both');
});

test('the cave: bats burst out at a light, the den bear drives you off, rocks fall after a trickle of dust', () => {
  const w = makeWorld();
  const L = undergroundOf(w.map), K2 = L.cave;
  const { p } = joinPlayer(w);
  p.profile.inventory.flashlight = 1;
  teleport(w, p.ped, K2.mouth.x, K2.mouth.y);
  ug.enterCave(w, p);
  const evs = [];
  const emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { evs.push(ev); return emit(x, y, ev); };
  // bats: walk under a roost with the light on
  const r = K2.roosts[0];
  p.ped.flashOn = true;
  teleport(w, p.ped, r.x + 30, r.y);
  run(w, 0.3);
  assert.ok(evs.some((e) => e.e === 'bats'), 'the bats burst out at the light');
  const n = evs.filter((e) => e.e === 'bats').length;
  run(w, 2);
  assert.equal(evs.filter((e) => e.e === 'bats').length, n, '...and don\'t come back for a while');
  // the den bear: asleep in its den; come close and it's on you
  const bear = w.get(w.cave.bear);
  assert.ok(bear && bear.wild && bear.ug === UG.CAVE, 'a bear in the den while someone is down here');
  assert.ok(Math.hypot(bear.x - K2.den.x, bear.y - K2.den.y) < 30, 'asleep in its den');
  const hp0 = p.ped.hp;
  teleport(w, p.ped, K2.den.x + (K2.den.x > K2.ch.den.x ? -60 : 60), K2.den.y);
  p.ped.protectUntil = 0;
  run(w, 3);
  assert.equal(bear.wild.state, 'chase', 'it wakes and comes at you');
  assert.ok(p.ped.hp < hp0, 'and bites');
  // falling rocks: dust first, then the rock, hurting whoever's under it
  const rock = K2.rocks[0];
  p.ped.hp = p.ped.maxHp; p.ped.dead = false;
  teleport(w, p.ped, rock.x, rock.y);
  w.cave.rocks[0].next = w.time; w.cave.rocks[0].fallAt = 0;
  evs.length = 0;
  run(w, 0.2);
  assert.ok(evs.some((e) => e.e === 'dust'), 'a trickle of dust first');
  const before = p.ped.hp;
  assert.ok(!evs.some((e) => e.e === 'rockfall'), 'the rock waits');
  run(w, ROCKFALL_WARN_S + 0.2);
  assert.ok(evs.some((e) => e.e === 'rockfall'), 'then down it comes');
  assert.ok(p.ped.hp < before - ROCKFALL_DMG / 4 || p.ped.dead, `and hurts you if you stayed under it (${Math.round(before)} -> ${Math.round(p.ped.hp)})`);
});

test('the cave: a boat on the underground river, and it floats along it', () => {
  const w = makeWorld();
  const L = undergroundOf(w.map), K2 = L.cave;
  const { p } = joinPlayer(w);
  teleport(w, p.ped, K2.mouth.x, K2.mouth.y);
  ug.enterCave(w, p);
  run(w, 0.2);
  const boat = w.get(w.cave.boat);
  assert.ok(boat && boat.def.kind === 'boat' && boat.ug === UG.CAVE && boat.sub, 'a motorboat moored on the river, underground');
  // aboard (from the water beside it), and along the river
  teleport(w, p.ped, boat.x, boat.y + 44);
  vehicles.tryEnter(w, p.ped);
  assert.equal(p.ped.vehId, boat.id, 'you can climb aboard');
  const s = { x: boat.x, y: boat.y, a: 0, vx: 0, vy: 0, av: 0, slip: 0, spin: 0, launch: 0, ug: UG.CAVE }, x0 = s.x;
  for (let i = 0; i < 60; i++) vehStep(s, { throttle: 1, steer: 0, hb: false }, 0.05, w.map, boat.def, { rain: false });
  assert.ok(s.x > x0 + 60, `it moves off down the river (${Math.round(s.x - x0)} px)`);
  assert.equal(cellAtPx(L, s.x, s.y), C.RIVER, 'still on the water');
  for (let i = 0; i < 400; i++) vehStep(s, { throttle: 1, steer: 0, hb: false }, 0.05, w.map, boat.def, { rain: false });
  assert.equal(cellAtPx(L, s.x, s.y), C.RIVER, 'the rock holds it on the river');
  // nobody on the street sees a boat down there
  assert.ok(ugLos(L, boat.x, boat.y, boat.x + 40, boat.y), 'the river hall is open');
});
