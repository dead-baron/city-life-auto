// Crews (the owner, 10-08: "friends and crews (up to 4): crew chat, crew events and heists" - server/systems/crews.js):
// asked in face to face and saying yes the same way, up to four, each other on the radar, no friendly fire, the quick
// lines to the crew, the Crew app (leaving, taking someone off), a heist's drawers split with the crew there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, straightRoad } from './helpers.js';
import { CREW, HEIST } from '../shared/rules.js';
import { vaultOf } from '../shared/heist.js';
import * as crews from '../server/systems/crews.js';
import * as heist from '../server/systems/heist.js';
import * as players from '../server/systems/players.js';
import * as combat from '../server/systems/combat.js';
import { store } from '../server/store.js';

function side(w, list, x, y) { list.forEach((q, i) => teleport(w, q.p.ped, x + i * 30, y)); }

test('a crew: asked in and saying yes, each other on the radar, no friendly fire, the quick lines', () => {
  const w = makeWorld();
  const A = joinPlayer(w), B = joinPlayer(w), C = joinPlayer(w);
  const x = A.p.ped.x, y = A.p.ped.y;
  side(w, [A, B], x, y);
  teleport(w, C.p.ped, x + 900, y);
  let a = crews.askPrompt(w, A.p);
  assert.ok(a && a.label === `Ask ${B.p.name} into your crew`, a && a.label);
  a.run();
  assert.equal(crews.askPrompt(w, A.p).label, `Asked ${B.p.name} into your crew...`);
  a = crews.joinPrompt(w, B.p);
  assert.ok(a && /Join .* crew/.test(a.label), a && a.label);
  a.run();
  assert.ok(crews.mates(A.p, B.p) && !crews.mates(A.p, C.p), 'in it together');
  assert.ok(store.kept.crews && Object.keys(store.kept.crews).length === 1, 'kept with the profiles');
  // each other on the radar (wherever), green name tags
  teleport(w, B.p.ped, x + 3000, y + 2000);
  const me = players.buildMe(w, A.p);
  const blip = me.radar.find((r) => r.k === 'crew');
  assert.ok(blip && blip.n === B.p.name && Math.abs(blip.x - B.p.ped.x) < 2, 'B on A\'s radar');
  assert.deepEqual(me.crew.ids, [B.p.ped.id]);
  assert.ok(!players.buildMe(w, C.p).radar.some((r) => r.k === 'crew'), 'not on an outsider\'s');
  // no friendly fire: a crewmate's blow does nothing; an outsider's does
  side(w, [A, B, C], x, y);
  const hp = B.p.ped.hp;
  assert.equal(combat.damage(w, B.p.ped, 20, A.p.ped, 'fists'), false);
  assert.equal(B.p.ped.hp, hp, 'unhurt by a crewmate');
  combat.damage(w, B.p.ped, 20, C.p.ped, 'fists');
  assert.ok(B.p.ped.hp < hp, 'hurt by an outsider');
  // the quick lines: to the crew only, not too fast
  for (const q of [A, B, C]) q.p.toasts.length = 0;
  assert.ok(crews.say(w, A.p, 0));
  assert.ok(!crews.say(w, A.p, 1), 'a moment between lines');
  const said = (q) => q.p.toasts.some((t) => t.text.includes(CREW.says[0]));
  assert.ok(said(B) && said(A) && !said(C), 'the crew heard it, nobody else');
  run(w, CREW.sayGapS + 0.2);
  assert.ok(crews.say(w, A.p, 1));
});

test('crewmates: no punch between them, no run-over; an asking that stands isn\'t talked over', () => {
  const w = makeWorld();
  const A = joinPlayer(w), B = joinPlayer(w), C = joinPlayer(w), D = joinPlayer(w);
  const x = A.p.ped.x, y = A.p.ped.y;
  side(w, [A, B, C, D], x, y);
  assert.ok(crews.invite(w, A.p, B.p));
  assert.ok(!crews.invite(w, C.p, B.p), 'A\'s asking stands');
  assert.equal(B.p.crewAsk.from, A.p.pid);
  assert.ok(!crews.invite(w, A.p, B.p), 'not asked again straight away');
  assert.ok(crews.accept(w, B.p));
  assert.equal(crews.joinPrompt(w, B.p), null, 'in a crew: nothing to join');
  // a swing at a crewmate passes them by (and lands on whoever's beyond)
  run(w, 4);
  teleport(w, A.p.ped, x, y); teleport(w, B.p.ped, x + 14, y); teleport(w, C.p.ped, x + 900, y); teleport(w, D.p.ped, x + 900, y + 60);
  for (const q of [A, B]) { q.p.ped.protectUntil = 0; q.p.ped.nextAttack = 0; }
  A.p.ped.weapon = 'fists';
  combat.tryAttack(w, A.p.ped, 0);
  assert.ok(!(B.p.ped.flinchUntil > w.time), 'no punch on a crewmate');
  // a crewmate at the wheel shoves you aside; an outsider's car hits you
  const road = straightRoad(w.map, 900);
  const hit = (driver) => {
    const v = w.spawnVehicle('sedan', road.x + 300, road.y, 0, { npcOwned: false });
    const d = driver.p.ped;
    d.vehId = v.id; d.seat = 0; v.seats[0] = d.id; d.hidden = true;
    teleport(w, B.p.ped, v.x + v.def.L / 2 + 4, road.y);
    B.p.ped.hp = 100; B.p.ped.downUntil = 0; B.p.ped.hitImmuneUntil = 0; B.p.ped.protectUntil = 0;
    v.vx = 320;
    run(w, 0.1);
    const r = { hp: B.p.ped.hp, down: B.p.ped.downUntil > w.time || !!B.p.ped.hoodOf || B.p.ped.dead };
    d.vehId = 0; v.seats[0] = 0; d.hidden = false; w.remove(v);
    if (B.p.ped.hoodOf) B.p.ped.hoodOf = 0;
    return r;
  };
  const mate = hit(A);
  assert.ok(mate.hp === 100 && !mate.down, `a crewmate's car: unhurt (${mate.hp}, ${mate.down})`);
  const out = hit(C);
  assert.ok(out.hp < 100 || out.down, `an outsider's car: hit (${out.hp}, ${out.down})`);
});

test('up to four; the Crew app: who\'s in it, taking someone off, leaving, a crew of one is none', () => {
  const w = makeWorld();
  const L = [0, 1, 2, 3, 4].map(() => joinPlayer(w));
  const [A, B, C, D, E] = L, x = A.p.ped.x, y = A.p.ped.y;
  for (const q of [B, C, D]) {
    side(w, [A, q], x, y);
    assert.ok(crews.invite(w, A.p, q.p));
    assert.ok(crews.accept(w, q.p));
  }
  side(w, [A, E], x, y);
  assert.equal(crews.askPrompt(w, A.p), null, 'full: nobody more asked');
  assert.ok(!crews.invite(w, A.p, E.p));
  assert.ok(!crews.invite(w, E.p, B.p), 'someone in a crew can\'t be asked into another');
  let P = crews.panel(w, A.p);
  assert.equal(P.crew.members.length, CREW.max);
  assert.ok(P.crew.lead && P.crew.members[0].lead && P.crew.members[0].me);
  // only whoever started it takes someone off
  crews.phone(w, B.p, { a: 'crewkick', k: 3 });
  assert.equal(crews.crewOf(A.p.pid).members.length, 4, 'B can\'t');
  P = crews.phone(w, A.p, { a: 'crewkick', k: 3 });
  assert.equal(P.crew.members.length, 3);
  assert.ok(!crews.mates(A.p, D.p), 'D off it');
  // leaving; down to one, it's broken up
  crews.phone(w, B.p, { a: 'crewleave' });
  assert.ok(!crews.mates(A.p, B.p) && crews.mates(A.p, C.p));
  crews.phone(w, A.p, { a: 'crewleave' });
  assert.equal(crews.crewOf(C.p.pid), null, 'a crew of one is none');
  assert.equal(Object.keys(store.kept.crews).length, 0);
  assert.equal(crews.panel(w, C.p).crew, null);
});

test('a heist with the crew there: the drawers split between them', () => {
  const w = makeWorld();
  const A = joinPlayer(w), B = joinPlayer(w);
  const b = w.map.walkIns.map((id) => w.map.buildings[id]).find((q) => q && vaultOf(q)), v = vaultOf(b);
  side(w, [A, B], v.sx, v.sy);
  crews.invite(w, A.p, B.p); crews.accept(w, B.p);
  A.prof.inventory.drill = 1;
  assert.ok(heist.start(w, A.p, b));
  for (const q of [A, B]) { q.p.heat = 0; q.p.wanted = 0; }
  const V = heist.stateOf(w, b.id);
  for (let k = 0; k < 400 && V.st === 'drill'; k++) { V.jammed = false; V.jamAt.length = 0; run(w, 0.5); }
  assert.equal(V.st, 'open');
  assert.ok(A.prof.hot > 0 && A.prof.hot === B.prof.hot, `split evenly (${A.prof.hot} / ${B.prof.hot})`);
  assert.ok(A.prof.hot < HEIST.cash * 2, 'a cut, not the whole');
});

test('a bounty collected with the crew there: split between them', async () => {
  const bounties = await import('../server/systems/bounties.js');
  const w = makeWorld();
  const H = joinPlayer(w), M = joinPlayer(w), T = joinPlayer(w), far = joinPlayer(w);
  side(w, [H, M, T], H.p.ped.x, H.p.ped.y);
  crews.invite(w, H.p, M.p); crews.accept(w, M.p);
  H.p.hunter = true; T.p.cityBounty = 1000;
  const hb = H.prof.bank, mb = M.prof.bank;
  assert.equal(bounties.collect(w, H.p, T.p, 'kill'), 1000);
  assert.equal(H.prof.bank - hb, 500); assert.equal(M.prof.bank - mb, 500, 'the crewmate\'s cut');
  // a crewmate far off gets none
  crews.invite(w, H.p, far.p); teleport(w, far.p.ped, H.p.ped.x + 20, H.p.ped.y); crews.invite(w, H.p, far.p); crews.accept(w, far.p);
  teleport(w, far.p.ped, H.p.ped.x + 5000, H.p.ped.y);
  T.p.cityBounty = 900;
  const h2 = H.prof.bank, f2 = far.prof.bank;
  bounties.collect(w, H.p, T.p, 'kill');
  assert.equal(far.prof.bank, f2, 'too far off for a cut');
  assert.equal(H.prof.bank - h2, 450);
});
