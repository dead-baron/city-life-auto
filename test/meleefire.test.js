// Melee never sets anyone on fire (the owner, 11-15: "I was using a crowbar and hit a shop owner and they caught on fire
// ... when I got punched by a cop I also caught in fire then too" - inside a corner store, at night, in the rain). What
// sets people alight is burning.js's list (a blast, a fire arrow, the flamethrower, their vehicle going up, walking into
// fire); a blow - a fist, a crowbar, a baton, a knockdown against the counter - is none of them. What did it: a fire
// call's kitchen fire (firefighter.js - a corner store's is on its floor in front of the counter) outlived its call - a
// shift given up, a call run out of time, the debug menu's call dropped - and a spot fire never burns out by itself, so
// it burned on, lighting whoever was knocked or ran across it (and someone alight lights who's knocked into them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { K, WEATHER } from '../shared/constants.js';

const combat = await import('../server/systems/combat.js');
const { spawnNpc } = await import('../server/systems/npc.js');
const ff = await import('../server/systems/firefighter.js');
const phone = await import('../server/systems/phone.js');

const stepN = (w, s) => { for (let i = 0; i < s * 20; i++) w.step(); };

test('a crowbar on a shop\'s clerk, a cop\'s baton on you, knocked down by the counter: nobody catches fire', () => {
  const w = makeWorld();
  w.weather = WEATHER.RAIN;
  const ign = [];
  const emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { if (ev && ev.e === 'ignite') ign.push(ev); emit(x, y, ev); };
  const { p } = joinPlayer(w);
  const shops = [];
  for (const bid of w.map.walkIns) for (const u of w.map.buildings[bid].walkIn.units) if (u.kind === 'convenience' || u.kind === 'delivery' || u.kind === 'grocery') shops.push(u);
  assert.ok(shops.length >= 4, `corner stores to try (${shops.length})`);
  let hits = 0, clerks = 0;
  for (const u of shops.slice(0, 6)) {
    teleport(w, p.ped, u.clerk.x + 26, u.clerk.y);   // (behind the counter, beside the clerk)
    p.ped.hp = p.ped.maxHp; p.wanted = 0;
    stepN(w, 1.5);   // (the clerk turns up: interiors.js)
    const c = [...w.entities.values()].find((e) => e.kind === K.PED && e.npc && e.npc.clerkOf !== undefined && Math.hypot(e.x - u.clerk.x, e.y - u.clerk.y) < 60);
    if (!c) continue;
    clerks++;
    p.ped.weapon = 'crowbar'; p.profile.weapons.crowbar = 1;
    for (let k = 0; k < 40 && !c.dead; k++) {
      if (Math.hypot(c.x - p.ped.x, c.y - p.ped.y) > 30) teleport(w, p.ped, c.x + 20, c.y);
      p.ped.nextAttack = 0;
      if (combat.tryAttack(w, p.ped, Math.atan2(c.y - p.ped.y, c.x - p.ped.x))) hits++;
      stepN(w, 0.25);
      assert.ok(!(c.burnT > 0), `the clerk caught fire from a crowbar (${u.kind})`);
    }
    // an officer's baton and fists on you, by the counter, knocked about
    const cop = spawnNpc(w, 'cop', p.ped.x + 18, p.ped.y, 'cop');
    for (const wpn of ['baton', 'fists']) {
      cop.weapon = wpn;
      for (let k = 0; k < 10 && !p.ped.dead; k++) {
        cop.nextAttack = 0; cop.x = p.ped.x + 18; cop.y = p.ped.y;
        combat.tryAttack(w, cop, Math.atan2(p.ped.y - cop.y, p.ped.x - cop.x));
        stepN(w, 0.2);
        assert.ok(!(p.ped.burnT > 0), `a ${wpn} set you alight (${u.kind})`);
      }
      p.ped.hp = p.ped.maxHp;
    }
    stepN(w, 6);
    assert.ok(!(p.ped.burnT > 0) && !(c.burnT > 0), 'nor afterwards');
    w.remove(cop);
    if (p.ped.dead) { p.ped.dead = false; p.ped.hp = p.ped.maxHp; }
  }
  assert.ok(clerks >= 3 && hits >= 12, `clerks hit (${clerks}, ${hits} blows)`);
  assert.deepEqual(ign, [], 'no one went up');
});

test('a kitchen fire call given up at a corner store leaves no fire on its floor: a blow there lights nobody', () => {
  const w = makeWorld();
  const S = ff.sitesOf(w.map);
  const { p } = joinPlayer(w);
  const st = S.stations[0];
  teleport(w, p.ped, st.x + 20, st.y + 20);
  assert.equal(phone.handle(w, p, { a: 'take', id: 'fire' }).err, null, 'on the fire crew');
  p.job.nextAt = 1e9;
  const shop = w.map.walkIns.flatMap((bid) => w.map.buildings[bid].walkIn.units).find((u) => u.kind === 'convenience');
  const poi = w.map.pois[shop.poi], site = S.food.find((q) => Math.hypot(q.x - poi.x, q.y - poi.y) < 4);
  assert.ok(site, 'a corner store is a kitchen fire\'s place');
  const c = ff.callAt(w, p, 'kitchen', site);
  const [f] = ff.burningTiles(w, c.id);
  assert.ok(f, 'its kitchen alight, on the shop floor by the counter');
  phone.handle(w, p, { a: 'cancel' });   // (the shift given up)
  stepN(w, 1.2);
  assert.equal(ff.burningTiles(w).length, 0, 'out with its call');
  // a stray spot fire with no call (however it came to be): out at the next step
  const stray = ff.light(w, f.tx, f.ty, 2, 999999);
  assert.ok(stray, 'lit by hand');
  stepN(w, 1);
  assert.equal(ff.burningTiles(w).length, 0, 'no call, no fire');
  // knocked about right there by an officer: nothing to catch from
  teleport(w, p.ped, f.tx * 32 + 16, f.ty * 32 + 16);
  const cop = spawnNpc(w, 'cop', p.ped.x + 18, p.ped.y, 'cop');
  cop.weapon = 'baton';
  for (let k = 0; k < 8; k++) { cop.nextAttack = 0; cop.x = p.ped.x + 18; cop.y = p.ped.y; combat.tryAttack(w, cop, Math.PI); stepN(w, 0.2); }
  assert.ok(!(p.ped.burnT > 0), 'not alight');
});
