// Hit reactions: bullets stagger people or knock them off their feet and slide them back; runners trip into
// a roll or a faceplant; a shotgun at close range throws people back and almost always kills; explosions
// throw people through the air; bodies cut down on the run slide on; the knocked down get up limping and
// the worst hurt crawl away on their stomachs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, straightRoad } from './helpers.js';
import { K, PF } from '../shared/constants.js';
import { SHOTGUN_CLOSE_PX } from '../shared/rules.js';
import * as combat from '../server/systems/combat.js';
import * as players from '../server/systems/players.js';
import { spawnNpc } from '../server/systems/npc.js';

function setup() {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { weapons: { pistol: 500, shotgun: 200, bat: 1 } });
  const road = straightRoad(w.map, 1200);
  teleport(w, p.ped, road.x + 300, road.y);
  p.invincible = true; // (the shooter gets punched too)
  return { w, p, conn };
}
const events = (conn, from) => conn.sent.slice(from).map((m) => (typeof m === 'string' ? JSON.parse(m) : m)).flatMap((m) => (m && m.t === 'ev' ? m.l : []));
function fire(w, p, weapon, target) {
  p.ped.weapon = weapon; p.ped.mag[weapon] = 99; p.ped.nextAttack = 0; p.ped.reloadUntil = 0;
  p.ped.stunUntil = 0; p.ped.downUntil = 0; p.wanted = 0; p.heat = 0; // (no police tasing the shooter mid-test)
  combat.tryAttack(w, p.ped, Math.atan2(target.y - p.ped.y, target.x - p.ped.x));
  w.step(); // (the events go out with the tick)
}
function clear(w) { for (const e of [...w.entities.values()]) if (e.kind === K.PED && !e.player) w.remove(e); }
// a tough bystander who survives a pistol shot
function tough(w, p, dx, dy) { const q = spawnNpc(w, 'casual', p.ped.x + dx, p.ped.y + dy, 'civ'); q.hp = q.maxHp = 500; q.build = { ...q.build, poise: 1 }; return q; }

test('a bullet staggers people or knocks them off their feet; runners trip or faceplant; up again limping', () => {
  const { w, p, conn } = setup();
  const seen = { stagger: 0, slide: 0, roll: 0, face: 0 };
  let limping = 0, knocked = 0;
  for (let i = 0; i < 40; i++) {
    clear(w);
    const q = tough(w, p, 150, 0), n0 = conn.sent.length;
    fire(w, p, 'pistol', q);
    for (const e of events(conn, n0)) if (e.id === q.id) { if (e.e === 'react') seen.stagger++; if (e.e === 'fling') { seen[e.k]++; knocked++; if (q.limpUntil > w.time) limping++; } }
  }
  assert.ok(seen.stagger >= 8, `staggered back (${JSON.stringify(seen)})`);
  assert.ok(seen.slide >= 6, `knocked off their feet, sliding back (${JSON.stringify(seen)})`);
  assert.equal(limping, knocked, 'everyone knocked down gets up limping');
  // running away: some trip into a roll or go down on their face and slide
  const run0 = { roll: 0, face: 0 };
  for (let i = 0; i < 40; i++) {
    clear(w);
    const q = tough(w, p, 150, 0), n0 = conn.sent.length;
    q.vx = 190; q.vy = 0; q.a = 0;
    fire(w, p, 'pistol', q);
    for (const e of events(conn, n0)) if (e.id === q.id && e.e === 'fling') run0[e.k] = (run0[e.k] || 0) + 1;
  }
  assert.ok(run0.roll >= 4 && run0.face >= 4, `runners trip and faceplant (${JSON.stringify(run0)})`);
  // the client is told how long the stagger lasts and which way the shot went
  clear(w);
  const q = tough(w, p, 150, 0);
  let st = null, aim = 0;
  for (let i = 0; i < 30 && !st; i++) { const n0 = conn.sent.length; q.downUntil = 0; q.vx = 0; q.vy = 0; q.hp = q.maxHp; aim = Math.atan2(q.y - p.ped.y, q.x - p.ped.x); fire(w, p, 'pistol', q); st = events(conn, n0).find((e) => e.e === 'react' && e.id === q.id); }
  assert.ok(st && st.d > 0.2 && Math.abs(Math.atan2(Math.sin(st.a - aim), Math.cos(st.a - aim))) < 0.15, `${JSON.stringify(st)} vs aim ${aim.toFixed(2)}`);
});

test('a charging attacker shot once keeps coming after the stagger', () => {
  const { w, p } = setup();
  let kept = 0;
  for (let i = 0; i < 10; i++) {
    clear(w);
    const q = tough(w, p, 160, 0);
    q.npc.state = 'fight'; q.npc.target = p.ped.id; q.npc.until = w.time + 30;
    q.vx = -170; q.a = Math.PI;
    fire(w, p, 'pistol', q);
    run(w, 2.2);
    if (q.npc.state === 'fight' && Math.hypot(q.x - p.ped.x, q.y - p.ped.y) < 150) kept++;
  }
  assert.ok(kept >= 7, `${kept}/10 still coming`);
});

test('a shotgun blast at close range throws people back and almost always kills - players too', () => {
  const { w, p } = setup();
  let dead = 0, thrown = 0;
  for (let i = 0; i < 10; i++) {
    const { p: v } = joinPlayer(w);
    teleport(w, v.ped, p.ped.x + 50, p.ped.y);
    const x0 = v.ped.x;
    fire(w, p, 'shotgun', v.ped);
    run(w, 1.2);
    if (v.ped.dead) dead++;
    if (v.ped.x - x0 > 50) thrown++;
    teleport(w, v.ped, p.ped.x - 3000 - i * 200, p.ped.y);
  }
  assert.ok(dead >= 9, `${dead}/10 killed by a point-blank blast`);
  assert.ok(thrown >= 9, `${thrown}/10 thrown back`);
  // well out of close range it's an ordinary hit
  const { p: v } = joinPlayer(w);
  teleport(w, v.ped, p.ped.x + SHOTGUN_CLOSE_PX + 90, p.ped.y);
  fire(w, p, 'shotgun', v.ped);
  assert.ok(!v.ped.dead, 'at range a player survives a blast');
});

test('explosions throw people through the air - and the dead', () => {
  const { w, p } = setup();
  clear(w);
  const q = tough(w, p, 80, 0); q.hp = q.maxHp = 3000;
  const body = tough(w, p, 0, 70); combat.damage(w, body, 9999, null, 'gun', 0);
  run(w, 1.5);
  const x0 = q.x, b0 = { x: body.x, y: body.y };
  q.downUntil = 0; q.vx = 0; q.vy = 0;
  combat.blast(w, q.x - 40, q.y, 110, 130, null);
  assert.ok(w.time < q.airUntil, 'in the air');
  run(w, 2.5);
  assert.ok(q.x - x0 > 150, `thrown ${Math.round(q.x - x0)} px`);
  assert.ok(Math.hypot(body.x - b0.x, body.y - b0.y) > 60, 'the body is thrown too');
});

test('shot dead on the run, the body slides on; the death event says how it lies', () => {
  const { w, p, conn } = setup();
  const lies = new Set();
  let slid = 0;
  for (let i = 0; i < 24; i++) {
    clear(w);
    const q = tough(w, p, 150, 0); q.hp = 5;
    const running = i < 12;
    q.vx = running ? 190 : 0; q.vy = 0; q.a = 0;
    const x0 = q.x, n0 = conn.sent.length;
    fire(w, p, 'pistol', q);
    run(w, 1.5);
    assert.ok(q.dead);
    if (running && q.x - x0 > 25) slid++;
    const d = events(conn, n0).find((e) => e.e === 'death' && e.id === q.id);
    assert.ok(d && ['face', 'back', 'side'].includes(d.k), JSON.stringify(d));
    if (!running) lies.add(d.k);
  }
  assert.ok(slid >= 10, `${slid}/12 slid on`);
  assert.ok(lies.has('back') && lies.has('face'), `standing, knocked onto the back or crumpled face down (${[...lies]})`);
});

test('a bat hit on a runner trips them; the badly hurt crawl away on their stomachs', () => {
  const { w, p, conn } = setup();
  let tripped = 0;
  for (let i = 0; i < 10; i++) {
    clear(w);
    const q = tough(w, p, 24, 0);
    q.vx = 200; q.vy = 0; q.a = 0;
    p.ped.weapon = 'bat'; p.ped.nextAttack = 0;
    const n0 = conn.sent.length;
    combat.tryAttack(w, p.ped, 0);
    w.step();
    if (events(conn, n0).some((e) => e.e === 'fling' && e.id === q.id && (e.k === 'face' || e.k === 'roll'))) tripped++;
  }
  assert.ok(tripped >= 4, `${tripped}/10 runners tripped by a bat`);
  // crawling: down and rolling on the wire, slow, away from whoever hurt them
  let crawler = null;
  for (let i = 0; i < 12 && !crawler; i++) {
    clear(w);
    const q = spawnNpc(w, 'casual', p.ped.x + 120, p.ped.y, 'civ');
    q.hp = q.maxHp * 0.1; q.npc.state = 'limp'; q.npc.fx = p.ped.x; q.npc.fy = p.ped.y; q.npc.until = w.time + 30;
    run(w, 0.3);
    if (q.npc.state === 'crawl') crawler = q;
  }
  assert.ok(crawler, 'someone crawls');
  const f = players.pedFlags(w, crawler);
  assert.ok((f & PF.DOWN) && (f & PF.ROLL), 'sent as down + rolling (the crawl)');
  const d0 = Math.hypot(crawler.x - p.ped.x, crawler.y - p.ped.y);
  run(w, 3);
  const d1 = Math.hypot(crawler.x - p.ped.x, crawler.y - p.ped.y);
  assert.ok(d1 > d0 + 10, 'away from you');
  assert.ok(d1 - d0 < 3 * 45, `slowly (${Math.round(d1 - d0)} px in 3 s)`);
});
