// Report-only (security audit, money/items): drives the server's own handlers the way a page's messages do and prints
// what happened. Never fixes, never fails. node --max-old-space-size=3072 tools/audit/sec-econ-probe.mjs
import { makeWorld, joinPlayer, run, teleport, fakeConn, store, players } from '../../test/helpers.js';
const economy = await import('../../server/systems/economy.js');
const cargo = await import('../../server/systems/cargo.js');
const { createSession } = await import('../../server/session.js');
const world = makeWorld();
const say = (...a) => console.log(...a);
const poiOf = (k) => world.map.pois.find((q) => q.kind === k);

// 1. buy-low / sell-high at the same counter (fruit stand: apples 3 for $4, bought back at $5 each)
{
  const poi = poiOf('fruitstand') || poiOf('market');
  const { p, prof } = joinPlayer(world, { cash: 100, bank: 0 });
  if (!poi) say('1. no fruit stand / market in this city'); else {
    teleport(world, p.ped, poi.x, poi.y);
    const before = prof.cash + prof.bank;
    for (let i = 0; i < 20; i++) { economy.handleMenu(world, p, poi.id, 'i:apple:4:3'); }
    economy.handleMenu(world, p, poi.id, 's:apple');
    say(`1. ${poi.kind} "${poi.label}": 20 x "i:apple:4:3" then "s:apple": money ${before} -> ${prof.cash + prof.bank} (cash ${prof.cash}, bank ${prof.bank})`);
  }
}
// 2. the drop rule: a hello whose page build (cb) differs from the server's marks the session "updating" -> leaving
//    while wanted ends at once, no ghost body, nothing dropped
{
  world.build = 'B-real'; world.buildAt = Date.now();
  const conn = fakeConn();
  const prof = store.create('ffff00000000000000000001'); prof.cash = 5000; prof.inventory = { medkit: 3 };
  const s = createSession(world, conn, { seed: 1, maxPlayers: 99, login: () => ({ profile: prof, token: 't' }) });
  s.onMessage(JSON.stringify({ t: 'hello', token: 't', cb: 'not-the-build', cbt: 0 }), false);
  const p = world.players.get(prof.pid);
  p.ped.protectUntil = 0; p.wanted = 5; p.heat = 5;
  s.onClose();
  run(world, 1);
  say(`2. modified hello (cb != build), wanted 5, tab closed: still in world=${world.players.has(prof.pid)} ghostUntil=${p.ghostUntil}; profile cash ${prof.cash}, medkits ${prof.inventory.medkit || 0} (the drop rule would have left them in bags)`);
  const conn2 = fakeConn();
  const s2 = createSession(world, conn2, { seed: 1, maxPlayers: 99, login: () => ({ profile: prof, token: 't' }) });
  s2.onMessage(JSON.stringify({ t: 'hello', token: 't', cb: 'B-real', cbt: 0 }), false);
  const q = world.players.get(prof.pid);
  say(`   back in: wanted ${q.wanted}, cash ${prof.cash}`);
  // control: the same with the real build
  const prof2 = store.create('ffff00000000000000000002'); prof2.cash = 5000;
  const c3 = fakeConn(), s3 = createSession(world, c3, { seed: 1, maxPlayers: 99, login: () => ({ profile: prof2, token: 't' }) });
  s3.onMessage(JSON.stringify({ t: 'hello', token: 't', cb: 'B-real', cbt: 0 }), false);
  const p3 = world.players.get(prof2.pid); p3.ped.protectUntil = 0; p3.wanted = 5; p3.heat = 5;
  s3.onClose(); run(world, 35);
  say(`   control (honest build, wanted): in world=${world.players.has(prof2.pid)}, cash ${prof2.cash} (dropped)`);
  world.build = null;
}
// 3. the bag's Drop with odd ids (session.js passes msg.id.slice(0, 40), msg.n raw)
{
  const { p, prof } = joinPlayer(world, { inventory: { bandage: 2 } });
  for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const err = cargo.dropItem(world, p, id, 1, false);
    say(`3. drop "${id}": ${err || 'accepted'}; inventory own keys now: ${JSON.stringify(Object.keys(prof.inventory))} -> ${JSON.stringify(prof.inventory)}`);
  }
  const e1 = cargo.dropItem(world, p, 'bandage', -5, false), e2 = cargo.dropItem(world, p, 'bandage', 1e9, false);
  say(`   drop bandage n=-5: ${e1 || 'ok'}, n=1e9: ${e2 || 'ok'}; bandages left ${prof.inventory.bandage || 0}`);
  try { JSON.stringify(prof); economy.useItem(world, p, 'constructor'); say('   useItem("constructor") ran'); } catch (e) { say('   threw:', e.message); }
}
// 4. a shop's menu pick while far away / dead / in cuffs
{
  const poi = poiOf('convenience') || poiOf('pharmacy');
  const { p, prof } = joinPlayer(world, { cash: 500, bank: 0 });
  teleport(world, p.ped, poi.x + 2000, poi.y); economy.handleMenu(world, p, poi.id, 'i:bandage:30:1');
  say(`4. ${poi.kind} from 2000 px away: cash ${prof.cash} (500 = refused)`);
  teleport(world, p.ped, poi.x, poi.y); p.ped.cuffed = true; economy.handleMenu(world, p, poi.id, (economy.buildMenu(world, p, poi).opts.find((o) => o.id.startsWith('i:')) || {}).id || 'x');
  say(`   cuffed at the counter: cash ${prof.cash} (a buy went through if under 500)`);
}
// 5. the Guide's "Replay the arrival" ({ t: 'intro', a: 'replay' }) pays FTUE.reward again each time the goal is done
{
  const ftue = await import('../../server/systems/ftue.js');
  const fence = world.map.pois.find((q) => q.kind === 'fence') || world.map.pois.find((q) => q.kind === 'gang');
  const { p, prof } = joinPlayer(world, { cash: 0, bank: 0 });
  prof.ftue = { st: 'done', paid: 1, m: {}, tips: 0 };
  teleport(world, p.ped, fence.x + 30, fence.y);
  const v = world.spawnVehicle('sedan', fence.x + 90, fence.y, 0, { parked: true }); v.owner = p.pid; p.activeVehicle = v.id;
  for (let i = 0; i < 5; i++) {
    ftue.handle(world, p, { a: 'replay' });
    ftue.handle(world, p, { a: 'skip' });                    // the arrival skipped: the question
    economy.handleMenu(world, p, ftue.ASK_POI, 'hustle');     // "hustle": the goal is the nearest fence - the one we stand at
    run(world, 1.2);                                          // step 2 -> 3 (within goalR)
    economy.openMenu(world, p, fence);                        // Act at the fence: step 3 done
    run(world, 0.2);
  }
  say(`5. 5 x (replay, skip, answer "hustle", open the fence's menu) standing at "${fence.label}": cash 0 -> ${prof.cash} (ftue.st ${prof.ftue.st})`);
}
// 6. the city's bounty (law.js addHeat: 500 x stars at 4+) on a friend: collected by a licensed hunter, the friend revived
//    (their stars come back - revive.js), one more small crime and the city's bounty is back for the taking
{
  const law = await import('../../server/systems/law.js');
  const revive = await import('../../server/systems/revive.js');
  const { p: h, prof: hp } = joinPlayer(world, { bank: 0 });
  const { p: t } = joinPlayer(world, {});
  teleport(world, h.ped, 4000, 4000); teleport(world, t.ped, 4040, 4000);
  h.hunter = true;
  for (let i = 0; i < 3; i++) {
    law.addHeat(world, t, 1, t.ped.x, t.ped.y);
    if (!t.wanted || t.wanted < 4) law.addHeat(world, t, 500, t.ped.x, t.ped.y);
    const city = t.cityBounty;
    law.onKill(world, h.ped, t.ped, 'gun');
    players.onPedDeath(world, t.ped, h.ped, 'test');
    t.ped.dead = true;
    revive.revive(world, t.ped, { kit: true, by: h.ped });
    say(`6. round ${i + 1}: city bounty ${city} on the friend; hunter's bank now ${hp.bank}; friend back up with ${t.wanted} stars, hunter licence ${h.hunter}`);
  }
}
