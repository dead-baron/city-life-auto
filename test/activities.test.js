// People going about their lives (task #423, server/systems/activities.js): activity spots found on the map by rules,
// filled with people doing the activity near players (out of sight), holding their poses and props, scared off like
// anyone, and gone again when nobody's near.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { spotsOf, spotsNear, fill, ACT_NEAR, ACT_DROP } from '../server/systems/activities.js';
import { onGunfire } from '../server/systems/npc.js';
import { _descriptor } from '../server/net.js';

const w = makeWorld();
const m = w.map;
const S = spotsOf(m);
const of = (k) => S.list.filter((s) => s.k === k);
const clear = () => { for (const e of [...w.entities.values()]) if (e.kind === K.PED && !e.player) w.remove(e); w.acts = new Map(); w.actRest = new Map(); };
const people = (g) => g.ids.map((i) => w.get(i)).filter(Boolean);
const open = (x, y) => { const t = m.tileAtPx(x, y); return !PED_BLOCK[t] && t !== T.ROAD && t !== T.WATER && t !== T.DEEP; };

test('activity spots are found on the map by rules: piers, tables, blankets, landmarks', () => {
  for (const k of ['anglers', 'chess', 'picnic', 'painter']) assert.ok(of(k).length >= 2, `some ${k} spots (${of(k).length})`);
  for (const s of S.list) if (s.k !== 'carwash') assert.ok(open(s.x, s.y), `${s.k} at ${Math.round(s.x)},${Math.round(s.y)}: on open ground`);   // (a car wash's spot is the car's)
  for (const s of of('anglers')) {   // the water right beside them, the way they face
    const t = m.tileAtPx(s.x + Math.cos(s.a) * 60, s.y + Math.sin(s.a) * 60), t2 = m.tileAtPx(s.x + Math.cos(s.a) * 24, s.y + Math.sin(s.a) * 24), t3 = m.tileAtPx(s.x + Math.cos(s.a) * 40, s.y + Math.sin(s.a) * 40);
    assert.ok([t, t2, t3].some((q) => q === T.WATER || q === T.DEEP), 'anglers face the water');
  }
  for (const s of of('chess')) assert.ok(!s.wild, 'chess is played in town');
  // spots don't crowd each other, and the near query finds them
  const s0 = S.list[0];
  assert.ok(spotsNear(m, s0.x, s0.y, 50).includes(s0));
  assert.equal(new Set(S.list.map((s) => s.id)).size, S.list.length);
});

test('a spot fills with people doing the activity: placed, posed, their props on the wire', () => {
  clear();
  const ch = fill(w, of('chess')[0], { seen: true });
  assert.ok(ch && ch.ids.length >= 3, 'two players and someone watching');
  const [a, b, ...watch] = people(ch);
  assert.equal(a.gt, 'sit'); assert.equal(b.gt, 'sit'); assert.equal(a.pp, 'chess', 'the board');
  assert.ok(Math.abs(Math.cos(a.a) + Math.cos(b.a)) < 0.01, 'sat facing each other');
  for (const e of watch) assert.ok(!e.gt, 'the watchers stand');
  assert.equal(_descriptor(a).gt, 'sit'); assert.equal(_descriptor(a).pp, 'chess');
  const an = fill(w, of('anglers')[0], { seen: true });
  assert.ok(an && an.ids.length === 2, 'two anglers');
  for (const e of people(an)) assert.ok(e.fishing, 'rods out');
  assert.equal(people(an)[0].pp, 'cooler');
  const pi = fill(w, of('picnic').find((s) => !s.table) || of('picnic')[0], { seen: true });
  assert.ok(pi && people(pi).every((e) => e.gt === 'sitlow' || e.gt === 'sit'), 'sat on the blanket (round the table)');
  const pa = fill(w, of('painter')[0], { seen: true });
  assert.equal(people(pa)[0].pp, 'easel');
  assert.equal(fill(w, of('painter')[0], { seen: true }), null, 'a spot fills once');
  // they hold it: a few seconds on, everyone's still where they were, posed
  const { p } = joinPlayer(w);
  teleport(w, p.ped, a.x, a.y + 900);
  run(w, 3);
  for (const g of [ch, an, pi, pa]) for (const e of people(g)) {
    assert.ok(!e.removed && Math.hypot(e.x - e.npc.act.x, e.y - e.npc.act.y) < 6, `${g.k}: holding the spot`);
  }
  assert.ok(Math.abs(a.a - 0) < 0.01 && a.gt === 'sit', 'still sat at the board');
});

test('the car washed in the driveway (when one is parked there), neighbours chatting, pickers in the fields, miners', () => {
  clear();
  for (const k of ['carwash', 'chat', 'pickers']) assert.ok(of(k).length >= 2, `some ${k} spots (${of(k).length})`);
  const cw = of('carwash').find((s) => !w.query(s.x, s.y, 60, K.VEH).length);
  assert.equal(fill(w, cw, { seen: true }), null, 'no car, no car washing');
  const v = w.spawnVehicle('sedan', cw.x, cw.y, cw.a, { parked: true });
  const g = fill(w, cw, { seen: true });
  assert.ok(g, 'a car in the driveway: someone washing it');
  const [e] = people(g);
  assert.equal(e.pp, 'sponge');
  const d = Math.hypot(e.x - v.x, e.y - v.y);
  assert.ok(d > v.def.W / 2 && d < v.def.W / 2 + 16, `beside the car (${d.toFixed(1)})`);
  assert.ok(Math.cos(Math.atan2(v.y - e.y, v.x - e.x) - e.a) > 0.99, 'facing it');
  const ct = fill(w, of('chat')[0], { seen: true }), [n1, n2] = people(ct);
  assert.ok(Math.cos(n1.a - n2.a) < -0.99, 'face to face');
  assert.ok(Math.cos(Math.atan2(n2.y - n1.y, n2.x - n1.x) - n1.a) > 0.99, 'looking at each other');
  const pk = fill(w, of('pickers')[0], { seen: true });
  assert.ok(people(pk).every((e) => e.gt === 'kneel'), 'down at the plants');
  assert.equal(people(pk)[0].pp, 'crate');
  assert.equal(m.tileAtPx(pk.x, pk.y), T.FIELD, 'in the field');
  assert.ok(of('miners').length >= 2, `some miners' spots (${of('miners').length})`);
  const mn = fill(w, of('miners')[0], { seen: true });
  for (const e of people(mn)) { assert.equal(e.chop && e.chop.tool, 'pickaxe', 'a pickaxe swung'); assert.equal(_descriptor(e).ch, 5, 'the swing on the wire'); }
  w.remove(v);
});

test('a gunfight scatters them; it over, they go back to it', () => {
  clear();
  const s = of('chess')[1] || of('chess')[0], g = fill(w, s, { seen: true });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, s.x, s.y + 900);
  const a = people(g)[0];
  onGunfire(w, s.x + 40, s.y, p.ped);
  assert.ok(people(g).some((e) => e.npc.state === 'flee'), 'they run');
  run(w, 2);
  assert.ok(Math.hypot(a.x - a.npc.act.x, a.y - a.npc.act.y) > 10 || a.npc.state !== 'flee', 'off and away');
  assert.ok(!a.gt || Math.hypot(a.x - a.npc.act.x, a.y - a.npc.act.y) < 6, 'nobody sits in mid air away from the table');
  run(w, 30);
  const back = people(g).filter((e) => e.npc.act && Math.hypot(e.x - e.npc.act.x, e.y - e.npc.act.y) < 6);
  assert.ok(back.length >= 1, 'back at the board');
});

test('spots fill round a player out of sight, and empty when nobody is near', () => {
  clear();
  const s = of('painter')[0];
  const { p } = joinPlayer(w);
  w.npcBudget = 200;
  try {
    teleport(w, p.ped, s.x, s.y + 700);
    for (let i = 0; i < 12 && ![...(w.acts || new Map()).values()].some((g) => Math.hypot(g.x - p.ped.x, g.y - p.ped.y) < ACT_DROP); i++) { w.actRest = new Map(); run(w, 1); }
    const mine = () => [...w.acts.values()].filter((g) => Math.hypot(g.x - p.ped.x, g.y - p.ped.y) < ACT_DROP);
    assert.ok(mine().length >= 1, 'something going on nearby');
    for (const g of mine()) {
      assert.ok(Math.hypot(g.x - p.ped.x, g.y - p.ped.y) < ACT_NEAR + 1, 'near the player');
      assert.ok(Math.hypot(g.x - p.ped.x, g.y - p.ped.y) > 300, 'not right on top of them');
    }
    assert.ok(mine().length <= 4, 'a sensible number');
    const ids = mine().flatMap((g) => g.ids);
    teleport(w, p.ped, s.x + ACT_DROP * 3, s.y + ACT_DROP * 3);
    while (!open(p.ped.x, p.ped.y)) teleport(w, p.ped, p.ped.x + 64, p.ped.y);
    run(w, 2);
    for (const i of ids) { const e = w.get(i); assert.ok(!e || e.removed || !e.npc.act, 'gone when nobody is near'); }
  } finally { w.npcBudget = 0; }
});

test('the debug menu takes you to each kind, filled, a little way off', async () => {
  const { command } = await import('../server/dev.js');
  const { DEV_SECTIONS } = await import('../client/devcats.js');
  clear();
  const { p } = joinPlayer(w);
  const kinds = DEV_SECTIONS.flatMap((sec) => sec.items).filter(([, c]) => c === 'act').map(([, , x]) => x.k);
  assert.equal(kinds.length, 8);
  for (const k of kinds) {
    command(w, p, 'act', { k });
    const g = [...w.acts.values()].find((q) => q.k === k && Math.hypot(q.x - p.ped.x, q.y - p.ped.y) < 340);
    assert.ok(g && g.ids.length, `${k}: there, with its people`);
    assert.ok(!PED_BLOCK[m.tileAtPx(p.ped.x, p.ped.y)], `${k}: you on open ground`);
  }
});
