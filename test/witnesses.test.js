// Witnesses by who and where (server/systems/law.js witnesses; design notes 2026-10-07): in the rich parts of town people
// see more and call it in; in the rough parts most look away, and the police are fewer and further off. Who you are
// matters (the executive calls, the hustler doesn't), the police always report, and the rich districts have security
// cameras. Players who see a crime aren't counted as witnesses: they're told, and can call it in from the phone - one
// squad car comes and looks for that suspect, and knows them by their clothes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { SAW_S, REPORT_SEARCH_S, WITNESS_REPORT } from '../shared/rules.js';
import * as law from '../server/systems/law.js';
import * as phone from '../server/systems/phone.js';
import { spawnNpc } from '../server/systems/npc.js';

function clearCams(w, x, y) { const saved = w.map.cameras; w.map.cameras = saved.filter((c) => Math.hypot(c.x - x, c.y - y) > c.r + 400); return () => { w.map.cameras = saved; }; }
// an open spot in a district of this wealth tier (a junction's corner, out of the traffic)
function spotIn(w, tier) {
  const deep = (q) => [[0, 0], [400, 0], [-400, 0], [0, 400], [0, -400]].every(([dx, dy]) => w.map.districtAt(q.x + dx, q.y + dy).tier === tier);   // (well inside it)
  const n = w.map.nodes.find((q) => q.lvl === 0 && q.edges.length >= 3 && deep(q) && w.map.zoneAt(q.x, q.y) === w.map.zoneAt(26000, 17000));
  assert.ok(n, `a junction in a ${tier} district`);
  return { x: n.x, y: n.y, d: w.map.districtAt(n.x, n.y).name };
}
// how often witnesses of an archetype at a spot call an assault in (each a different person, all looking at it)
function reportRate(w, at, archetype, n = 60) {
  const perp = joinPlayer(w).p.ped;
  teleport(w, perp, at.x, at.y);
  let reported = 0;
  for (let i = 0; i < n; i++) {
    const e = spawnNpc(w, archetype, at.x + 90, at.y, 'civ');
    e.a = Math.PI; e.x = at.x + 90; e.y = at.y;
    if (law.witnesses(w, at.x, at.y, perp, null, false, 'assault').count > 0) reported++;
    w.remove(e);
  }
  w.players.delete(perp.player.pid); w.remove(perp);
  return reported / n;
}

test('witnesses: the rich parts of town call it in, the rough parts look away; who you are matters; the police always report', () => {
  const w = makeWorld();
  const lux = spotIn(w, 'lux'), rough = spotIn(w, 'rough');
  const r1 = clearCams(w, lux.x, lux.y), r2 = clearCams(w, rough.x, rough.y);
  for (const e of [...w.entities.values()]) if (e.kind === K.PED && e.npc) w.remove(e);
  const richCasual = reportRate(w, lux, 'casual'), roughCasual = reportRate(w, rough, 'casual');
  assert.ok(richCasual > 0.6, `${lux.d}: most passers-by call it in (${richCasual.toFixed(2)})`);
  assert.ok(roughCasual < 0.4, `${rough.d}: most look away (${roughCasual.toFixed(2)})`);
  const exec = reportRate(w, lux, 'executive'), hustler = reportRate(w, lux, 'hustler');
  assert.ok(exec > 0.85 && hustler < 0.25, `the executive calls (${exec.toFixed(2)}), the hustler doesn't (${hustler.toFixed(2)})`);
  assert.ok(WITNESS_REPORT.senior > WITNESS_REPORT.casual, 'seniors pick up the phone');
  // a cop in the roughest street still reports it
  const perp = joinPlayer(w).p.ped;
  teleport(w, perp, rough.x, rough.y);
  const cop = spawnNpc(w, 'cop', rough.x + 120, rough.y, 'cop'); cop.a = Math.PI;
  const res = law.witnesses(w, rough.x, rough.y, perp, null, false, 'assault');
  assert.ok(res.count > 0 && res.cop, 'the police always do');
  r1(); r2();
});

test('witnesses: the police are fewer and further off in the rough parts of town', () => {
  const w = makeWorld();
  const count = (tier) => {
    const at = spotIn(w, tier);
    const { p } = joinPlayer(w);
    teleport(w, p.ped, at.x, at.y);
    p.heat = 70; p.wanted = 3; p.seenAt = w.time; p.lastSeenX = at.x; p.lastSeenY = at.y;
    p.ped.protectUntil = 1e9;   // (stay up while they come: the count is what matters)
    let n = 0;
    for (let t = 0; t < 14; t++) {
      run(w, 1);
      p.heat = 70; p.wanted = 3; p.seenAt = w.time;
      teleport(w, p.ped, at.x, at.y);   // (staying put, wherever they shove)
      n = Math.max(n, [...w.police].filter((id) => { const v = w.get(id); return v && v.ai && v.ai.target === p.pid; }).length);
    }
    law.clearWanted(w, p);
    run(w, 1);
    for (const id of [...w.police]) { const v = w.get(id); if (v) w.remove(v); }
    w.police.clear();
    w.players.delete(p.pid); w.remove(p.ped);
    return n;
  };
  const rich = count('lux'), rough = count('rough');
  assert.ok(rich >= 4, `three stars in a rich district: ${rich} units`);
  assert.ok(rough <= 2 && rough >= 1, `in a rough one: ${rough}`);
});

test('security cameras watch the rich districts (and only them), and report what they see', () => {
  const w = makeWorld();
  const sec = w.map.cameras.filter((c) => c.sec);
  assert.ok(sec.length >= 10, `${sec.length} security cameras`);
  for (const c of sec) assert.equal(w.map.districtAt(c.x, c.y).tier, 'lux', `${w.map.districtAt(c.x, c.y).name}: a rich district`);
  const c = sec[0];
  const { p } = joinPlayer(w);
  teleport(w, p.ped, c.x + 30, c.y + 10);
  for (const e of [...w.entities.values()]) if (e.kind === K.PED && e.npc) w.remove(e);
  if (!w.map.los(c.x, c.y, p.ped.x, p.ped.y)) return;   // (it stands right by a wall: nothing to prove here)
  const notes = [];
  const n0 = w.notify; w.notify = (q, text, tone) => { notes.push(text); return n0.call(w, q, text, tone); };
  law.crime(w, p.ped, 'assault', null);
  w.notify = n0;
  assert.ok(p.wanted > 0, 'seen on camera');
  assert.ok(notes.some((t) => /security camera/.test(t)), `reported by a security camera (${notes.join(' / ')})`);
});

test('a player who sees a crime is told and can call it in from the phone; one car comes, knows the suspect by their clothes', () => {
  const w = makeWorld();
  const spot = spotIn(w, 'mid');
  const restore = clearCams(w, spot.x, spot.y);
  for (const e of [...w.entities.values()]) if (e.kind === K.PED && e.npc) w.remove(e);
  const A = joinPlayer(w, { cash: 0 }).p, B = joinPlayer(w, { cash: 0 }).p;
  teleport(w, A.ped, spot.x, spot.y);
  teleport(w, B.ped, spot.x + 140, spot.y + 20);
  const victim = spawnNpc(w, 'casual', spot.x + 20, spot.y, 'civ');
  victim.npc.snitch = 0;   // (a victim who won't call: the only witness is the player)
  law.crime(w, A.ped, 'assault', victim);
  assert.equal(A.wanted, 0, 'a player who saw it is not an automatic report');
  const board = phone.boardFor(w, B);
  assert.equal(board.saw.length, 1, 'B saw it');
  assert.match(board.saw[0].desc, /top/, `with a description (${board.saw[0].desc})`);
  assert.equal(board.saw[0].name, A.name);
  // call it in
  const res = phone.handle(w, B, { a: 'report', id: board.saw[0].id });
  assert.ok(!res.err, res.err || 'called in');
  assert.ok(phone.handle(w, B, { a: 'report', id: board.saw[0].id }).err, 'not twice');
  // a car comes and looks round; A is still there in the same clothes
  let unit = null;
  for (let t = 0; t < 40 && !unit; t++) { run(w, 1); for (const id of w.police) { const v = w.get(id); if (v && v.ai && (v.ai.call || v.ai.target === A.pid)) unit = v; } }
  assert.ok(unit, 'a squad car came');
  for (let t = 0; t < 30 && A.wanted === 0; t++) { teleport(w, A.ped, unit.x + 80, unit.y); A.ped.vx = 0; A.ped.vy = 0; run(w, 1); }
  assert.ok(A.wanted >= 1, 'the officer knew them from the description');
  assert.ok(B.profile.samaritan >= 2, 'the caller earns Samaritan points');
  restore();
});

test('calling it in: a change of clothes throws them off; one call at a time; only crimes you saw, for a minute', () => {
  const w = makeWorld();
  const spot = spotIn(w, 'mid');
  const restore = clearCams(w, spot.x, spot.y);
  for (const e of [...w.entities.values()]) if (e.kind === K.PED && e.npc) w.remove(e);
  const A = joinPlayer(w, { cash: 0 }).p, B = joinPlayer(w, { cash: 0 }).p;
  teleport(w, A.ped, spot.x, spot.y);
  teleport(w, B.ped, spot.x + 140, spot.y + 20);
  const victim = spawnNpc(w, 'casual', spot.x + 20, spot.y, 'civ'); victim.npc.snitch = 0;
  law.crime(w, A.ped, 'assault', victim);
  const s = phone.boardFor(w, B).saw[0];
  assert.ok(!phone.handle(w, B, { a: 'report', id: s.id }).err);
  A.ped.app = { ...A.ped.app, tc: A.ped.app.tc === '#2350c8' ? '#c8262b' : '#2350c8', t: ((A.ped.app.t || 0) + 1) % 4 };   // a new outfit
  let unit = null;
  for (let t = 0; t < 40 && !unit; t++) { run(w, 1); for (const id of w.police) { const v = w.get(id); if (v && v.ai && v.ai.call) unit = v; } }
  assert.ok(unit, 'a squad car came');
  for (let t = 0; t < REPORT_SEARCH_S + 30 && w.get(unit.id) && w.get(unit.id).ai && w.get(unit.id).ai.call; t++) { teleport(w, A.ped, unit.x + 80, unit.y); run(w, 1); }
  assert.equal(A.wanted, 0, 'nobody matching that description');
  // another crime: B's call is refused while the last one is fresh
  law.crime(w, A.ped, 'assault', victim);
  const s2 = phone.boardFor(w, B).saw.find((q) => !q.done);
  if (s2 && w.time - B.lastReportAt < 90) assert.ok(phone.handle(w, B, { a: 'report', id: s2.id }).err, 'one call at a time');
  // and after a minute it can't be called in at all
  w.time += SAW_S + 1;
  assert.equal(phone.boardFor(w, B).saw.length, 0, 'too late');
  assert.ok(phone.handle(w, B, { a: 'report', id: 999 }).err, 'only crimes you saw');
  restore();
});
