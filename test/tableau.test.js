// A handcrafted place's people (server/systems/activities.js 'tableau': map.tableaus - shared/world3-downtown.js and
// world3-dtcraft.js lay them, the craft pass of 2026-11-15): a queue at a window, someone at their post, the guards at an
// armored van, people sat at a plaza's tables, two at a rail, a word on a square, someone waiting at a bus stop - placed
// as the place says and posed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import { World } from '../server/world.js';
import { T, TILE } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { spotsOf, fill } from '../server/systems/activities.js';
import { joinPlayer, run, teleport } from './helpers.js';

const m = generateCity(1337);
// open paving to put them on: a run of plaza or pavement tiles
let at = null;
for (let ty = 40; ty < m.h - 40 && !at; ty++) for (let tx = 40; tx < m.w - 40 && !at; tx++) {
  let ok = true;
  for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -6; dx <= 6 && ok; dx++) { const t = m.tileAt(tx + dx, ty + dy); if (t !== T.PLAZA) ok = false; }
  if (ok) at = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}
const { x, y } = at;
m.tableaus = [
  { v: 'queue', x, y: y - 60, a: -Math.PI / 2 },
  { v: 'staff', look: 'valet', x: x - 80, y, x2: x - 40, y2: y, a: Math.PI / 2 },
  { v: 'guards', x: x + 80, y, a: Math.PI, x2: x + 100, y2: y + 40, x3: x + 140, y3: y + 40 },
  { v: 'sit', x, y: y + 60, seats: [[x - 15, y + 60, 0], [x + 15, y + 60, Math.PI]] },
  { v: 'view', x: x - 120, y: y + 60, a: 0 },
  { v: 'chat', x: x + 120, y: y - 60 },
  { v: 'wait', x: x - 120, y: y - 60, a: Math.PI / 2 },
];
const w = new World(m, { npcBudget: 0, throwErrors: true });
const S = spotsOf(m);
const of = (v) => S.list.find((s) => s.k === 'tableau' && s.v === v);
const people = (g) => g.ids.map((i) => w.get(i)).filter(Boolean);

test('a handcrafted place\'s people are where it put them, doing what it said', () => {
  assert.equal(S.list.filter((s) => s.k === 'tableau').length, 7, 'every one a spot');
  const q = fill(w, of('queue'), { seen: true });
  assert.ok(q && q.ids.length >= 2 && q.ids.length <= 4, 'two to four in the queue');
  for (const e of people(q)) assert.ok(Math.abs(e.a + Math.PI / 2) < 1e-6, 'facing the window');
  const ys = people(q).map((e) => e.y);
  assert.ok(ys.every((v, i) => !i || v > ys[i - 1]), 'in a line back from it');
  const st = fill(w, of('staff'), { seen: true });
  assert.equal(st.ids.length, 2, 'the two doormen');
  const sit = fill(w, of('sit'), { seen: true });
  assert.ok(sit.ids.length >= 1 && people(sit).every((e) => e.gt === 'sit'), 'sat at the tables');
  const gd = fill(w, of('guards'), { seen: true });
  const [watch, carry] = people(gd);
  assert.ok(!watch.pp && carry.pp === 'crate' && carry.npc.act.patrol, 'one on watch, one carrying the boxes to and fro');
  const wt = fill(w, of('wait'), { seen: true });
  assert.equal(people(wt)[0].gt, 'sit', 'sat in the shelter');
  for (const v of ['view', 'chat']) assert.ok(fill(w, of(v), { seen: true }).ids.length >= 2, v);
  for (const g of w.acts.values()) for (const e of people(g)) assert.ok(!PED_BLOCK[m.tileAtPx(e.x, e.y)], 'on open ground');
});

test('they hold their places; the carrier walks the boxes over', () => {
  const { p } = joinPlayer(w);
  teleport(w, p.ped, x, y + 700);
  run(w, 4);
  for (const g of w.acts.values()) {
    if (g.k !== 'tableau') continue;
    for (const e of people(g)) if (!e.npc.act.patrol) assert.ok(Math.hypot(e.x - e.npc.act.x, e.y - e.npc.act.y) < 6, 'held');
  }
  const g = [...w.acts.values()].find((q) => q.k === 'tableau' && people(q).some((e) => e.npc.act.patrol));
  const c = people(g).find((e) => e.npc.act.patrol);
  const x0 = c.x;
  run(w, 8);
  assert.ok(Math.abs(c.x - x0) > 10 || c.npc.holdTo, 'the carrier on the move between the van and the door');
});
