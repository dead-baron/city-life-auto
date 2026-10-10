// NPC street fights (task #395; server/systems/happenings.js, npc.js markBrawl, law.js brawling, police.js). The owner: "In
// NPC street fights, whoever started it (or both if equal) count as criminals; attacking them isn't a crime for you;
// police sometimes come and break it up - tackling, not shooting. Also patrolling police rarely run and tackle NPC
// criminals (a rare detail)."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T, STAR_HEAT } from '../shared/constants.js';
import { DISTRICTS } from '../shared/map.js';
import { mulberry32, hash2 } from '../shared/rng.js';
import { BRAWL_AFTER_S, PATROL_PURSUE, FIGHT_MUTUAL, FIGHT_POLICE } from '../shared/rules.js';
import * as law from '../server/systems/law.js';
import * as combat from '../server/systems/combat.js';
import * as happenings from '../server/systems/happenings.js';
import * as players from '../server/systems/players.js';
import { spawnNpc } from '../server/systems/npc.js';

// a pavement in the middle of Downtown
function downtown(w) {
  const m = w.map;
  let sx = 0, sy = 0, n = 0;
  const pts = [];
  for (let ty = 0; ty < m.h; ty += 2) for (let tx = 0; tx < m.w; tx += 2) {
    if (DISTRICTS[m.dist[ty * m.w + tx]].name !== 'Downtown') continue;
    sx += tx; sy += ty; n++;
    if (m.tiles[ty * m.w + tx] === T.SIDEWALK) pts.push([tx, ty]);
  }
  const cx = sx / n, cy = sy / n;
  pts.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cy) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2));
  return { x: pts[0][0] * 32 + 16, y: pts[0][1] * 32 + 16 };
}
function setup(seed) {
  const w = makeWorld(seed ? { rand: mulberry32(seed) } : {});
  const { p } = joinPlayer(w);
  const at = downtown(w), cams = w.map.cameras;
  w.map.cameras = [];   // (only the witnesses the test puts there; restored after: the map is shared)
  teleport(w, p.ped, at.x, at.y);
  w.nextHappenAt = 1e9; w.nextPetAt = 1e9;   // (only what the test starts)
  return { w, p, restore: () => { w.map.cameras = cams; } };
}
function listen(w) {
  const log = new Map(), notify = w.notify.bind(w);
  w.notify = (q, text, tone) => { if (q) { if (!log.has(q)) log.set(q, []); log.get(q).push(text); } return notify(q, text, tone); };
  return (q, re) => (log.get(q) || []).some((t) => re.test(t));
}
function hear(w) {
  const log = [], emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { log.push({ ...ev, at: w.time }); return emit(x, y, ev); };
  return log;
}
const fight = (w) => (w.happenings || []).filter((e) => e.kind === 'fight' && e.until > w.time).pop();   // (the latest)
// a player's blow at someone, from right beside them
function hit(w, p, t, weapon = 'fists') {
  teleport(w, p.ped, t.x - 20, t.y);
  p.ped.weapon = weapon; p.ped.nextAttack = 0;
  const hp = t.hp;
  combat.tryAttack(w, p.ped, Math.atan2(t.y - p.ped.y, t.x - p.ped.x));
  assert.ok(t.hp < hp, 'the blow landed');
}
// someone who sees everything and always calls it in
function witness(w, t) {
  const e = spawnNpc(w, 'executive', t.x + 140, t.y - 30, 'civ');
  e.a = Math.atan2(t.y - e.y, t.x - e.x); e.npc.snitch = 9; e.npc.state = 'idle'; e.npc.until = w.time + 1e9; e.npc.lookAt = w.time + 1e9;
  return e;
}

test('whoever started a street fight is fair game: hitting them is no crime - hitting the other one is; killing them still is', () => {
  assert.ok(FIGHT_MUTUAL > 0 && FIGHT_MUTUAL < 0.5 && FIGHT_POLICE > 0 && FIGHT_POLICE < 1);
  const { w, p, restore } = setup();
  const told = listen(w);
  try {
    assert.ok(happenings.startNow(w, 'fight', p, { both: false, cops: false }));
    const ev = fight(w), a = w.get(ev.a), b = w.get(ev.b);
    assert.deepEqual(ev.by, [a.id], 'one of them started it');
    assert.ok(law.brawling(w, a) && !law.brawling(w, b), 'the one who started it is a criminal; the other isn\'t');
    assert.ok(told(p, new RegExp(`the one in the ${law.colourName(a.app.tc)} top started it`)), 'the players near are told who');
    // a punch at the one who started it: nothing - seen or not
    witness(w, a);
    hit(w, p, a);
    assert.equal(p.wanted, 0); assert.equal(law.suspicionOf(w, p), 0, 'no crime at all');
    // at the other one: a small crime like any (people saw it)
    hit(w, p, b);
    assert.equal(law.suspicionOf(w, p), 1, 'the other one: an assault people saw');
    // killing the one who started it is still a killing
    p.profile.weapons.pistol = 50; p.ped.mag.pistol = 12;
    combat.damage(w, a, 9999, p.ped, 'gun', 0);
    assert.ok(a.dead);
    assert.ok(p.wanted >= 2 && p.heat >= STAR_HEAT[2], `murder: ${p.wanted} stars`);
    // both of them, as bad as each other
    law.clearWanted(w, p);
    w.lastHappening = null;
    assert.ok(happenings.startNow(w, 'fight', p, { both: true, cops: false }));
    const ev2 = fight(w), c = w.get(ev2.a), d = w.get(ev2.b);
    assert.ok(law.brawling(w, c) && law.brawling(w, d), 'both criminals');
    assert.ok(told(p, /both of them asked for it/));
    // broken up: still fair game a little while after, then not
    teleport(w, p.ped, c.x + 30, c.y);
    const act = players.findInteraction(w, p);
    assert.ok(act && /Break up the fight/.test(act.label));
    act.run();
    assert.ok(law.brawling(w, c) && law.brawling(w, d), 'just after: still');
    w.time += BRAWL_AFTER_S + 0.5;
    assert.ok(!law.brawling(w, c) && !law.brawling(w, d), `${BRAWL_AFTER_S} s later: not any more`);
  } finally { restore(); }
});

test('the debug menu: a street fight the police are called to', async () => {
  const dev = await import('../server/dev.js');
  const { w, p, restore } = setup();
  try {
    dev.command(w, p, 'happen', { k: 'fight', cops: 1 });
    const ev = fight(w);
    assert.ok(ev && ev.by.length >= 1, 'a fight');
    assert.ok(w.fightCalls && w.fightCalls.length === 1 && w.fightCalls[0].ids.join() === ev.by.join(), 'the police called, for whoever started it');
  } finally { restore(); }
});

test('a passer-by who lays into someone who never hit them started it; hitting back is no crime of theirs', () => {
  const { w, p, restore } = setup();
  try {
    const x = spawnNpc(w, 'casual', p.ped.x + 200, p.ped.y, 'civ'), y = spawnNpc(w, 'casual', p.ped.x + 220, p.ped.y, 'civ');
    combat.damage(w, y, 4, x, 'melee', 0);
    assert.ok(law.brawling(w, x), 'struck first: a criminal');
    combat.damage(w, x, 4, y, 'melee', Math.PI);
    assert.ok(!law.brawling(w, y), 'hitting back: not');
    // the police don't count
    const cop = spawnNpc(w, 'cop', p.ped.x + 260, p.ped.y, 'cop');
    combat.damage(w, y, 1, cop, 'melee', 0);
    assert.ok(!law.brawling(w, cop));
  } finally { restore(); }
});

test('the police break up a street fight: a squad car, the one who did not start it backs off, the one who did is tackled - no guns, no tasers - and taken in', () => {
  const { w, p, restore } = setup(395);
  const heard = hear(w);
  try {
    assert.ok(happenings.startNow(w, 'fight', p, { both: false, cops: true }));
    const ev = fight(w), a = w.get(ev.a), b = w.get(ev.b);
    let unit = null, targets = null, onFoot = false, bFought = false;
    const done = (() => {
      for (let i = 0; i < 20 * 90; i++) {
        p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 });
        w.step();
        if (!unit) for (const id of w.police) { const v = w.get(id); if (v && v.ai && v.ai.npcTargets) { unit = v; targets = [...v.ai.npcTargets]; } }
        if (unit && unit.ai && unit.ai.mode === 'foot') onFoot = true;
        if (onFoot && !b.removed && b.npc.state === 'fight' && b.npc.target === a.id && heard.some((e) => e.e === 'knockdown' && e.id === a.id)) bFought = true;
        if (a.removed) return true;
      }
      return false;
    })();
    assert.ok(unit && unit.def.police, 'a squad car came');
    assert.ok(w.dispatch.some((d) => d.l === 'Street fight' && !d.who), 'on the police dispatch (player officers see it)');
    assert.deepEqual(targets, [a.id], 'for the one who started it');
    assert.ok(onFoot, 'the officers got out');
    assert.ok(done, 'the one who started it was taken in');
    assert.ok(heard.some((e) => e.e === 'knockdown' && e.id === a.id), 'brought down with a tackle');
    assert.ok(!heard.some((e) => e.e === 'shot' || e.e === 'taser'), 'no shots, no tasers');
    assert.ok(!b.removed && !b.dead, 'the other one wasn\'t taken in');
    assert.ok(!bFought, 'and stopped fighting once the police were on it');
    assert.equal(p.wanted, 0);
  } finally { restore(); }
});

test('now and then an officer on foot who sees a crook runs them down: a purse snatcher tackled and taken in, the purse dropped; most let it go', () => {
  // which officers go after which crook: a rare thing, the same answer for the same pair
  let yes = 0;
  for (let i = 0; i < 4000; i++) if (hash2(1000 + (i % 63), 5000 + i, 395) < PATROL_PURSUE) yes++;
  assert.ok(PATROL_PURSUE <= 0.35 && Math.abs(yes / 4000 - PATROL_PURSUE) < 0.03, `${yes / 40}% of sightings`);
  const { w, p, restore } = setup(7);
  const heard = hear(w);
  try {
    const cop = spawnNpc(w, 'cop', p.ped.x + 150, p.ped.y, 'cop');
    cop.npc.beat = true;
    // a mugger with a purse, running: one this officer goes after (and one they'd let go)
    const mugger = (go) => {
      for (let k = 0; k < 200; k++) {
        const m = spawnNpc(w, 'mugger', cop.x + 160, cop.y + 20, 'mugger');
        if ((hash2(cop.id, m.id, 395) < PATROL_PURSUE) === go) return m;
        w.remove(m);
      }
      return null;
    };
    const no = mugger(false);
    no.npc.flagged = true; no.npc.hasPurse = true; no.npc.state = 'idle'; no.npc.until = w.time + 1e9;
    w.step(); w.time += 1; run(w, 1.1);
    assert.ok(!cop.npc.pursue, 'this one he lets go');
    w.remove(no);
    const m = mugger(true);
    m.npc.flagged = true; m.npc.hasPurse = true; m.npc.keep = true;
    m.npc.state = 'mug'; m.npc.target = 0; m.npc.fx = p.ped.x; m.npc.fy = p.ped.y; m.npc.until = w.time + 60;
    assert.ok(law.brawling(w, m) === false && m.npc.flagged, 'a crook');
    let pursued = false;
    for (let i = 0; i < 20 * 40 && !m.removed; i++) { w.step(); if (cop.npc.pursue === m.id) pursued = true; }
    assert.ok(pursued, 'he went after them');
    assert.ok(heard.some((e) => e.e === 'say' && e.id === cop.id && /Stop/.test(e.text)), '"Police! Stop right there!"');
    assert.ok(m.removed, 'taken in');
    assert.ok(heard.some((e) => e.e === 'knockdown' && e.id === m.id), 'tackled');
    assert.ok([...w.entities.values()].some((e) => e.kind === K.BAG && e.items && e.items.purse), 'the purse dropped');
    assert.ok(!cop.npc.pursue && !heard.some((e) => e.e === 'shot' || e.e === 'taser'), 'no guns, no tasers; back on the beat');
  } finally { restore(); }
});

test('an officer whose unit is done here runs down a crook he sees; the car waits for him, and he walks back to it', () => {
  const { w, p, restore } = setup(11);
  try {
    // a squad car whose job here is done (whoever it came for long gone), one officer still out on foot a way off from it
    const v = w.spawnVehicle('police', p.ped.x - 250, p.ped.y, 0, {});
    v.despawnable = false;
    const cop = spawnNpc(w, 'cop', p.ped.x + 150, p.ped.y, 'cop');
    cop.npc.unit = v.id; cop.weapon = 'baton';
    v.ai = { kind: 'police', target: 'gone', mode: 'foot', route: null, routeAt: 0, force: 'police', downSince: w.time - 35 };   // (about to go)
    (w.police ??= new Set()).add(v.id);
    // a purse snatcher running past, one this officer goes after
    let m = null;
    for (let k = 0; k < 200 && !m; k++) {
      const q = spawnNpc(w, 'mugger', cop.x + 160, cop.y + 20, 'mugger');
      if (hash2(cop.id, q.id, 395) < PATROL_PURSUE) m = q; else w.remove(q);
    }
    m.npc.flagged = true; m.npc.hasPurse = true; m.npc.keep = true;
    m.npc.state = 'mug'; m.npc.target = 0; m.npc.fx = p.ped.x; m.npc.fy = p.ped.y; m.npc.until = w.time + 60;
    let pursued = false, carGone = false;
    for (let i = 0; i < 20 * 40 && !m.removed; i++) { w.step(); if (cop.npc.pursue === m.id) pursued = true; if (v.removed) carGone = true; }
    assert.ok(pursued, 'he went after them');
    assert.ok(m.removed, 'and took them in');
    assert.ok(!carGone && !cop.removed, 'the car waited for him (it was about to go)');
    let boarded = false;
    for (let i = 0; i < 20 * 30 && !boarded && !v.removed; i++) { w.step(); boarded = cop.vehId === v.id; }
    assert.ok(boarded, 'back to the car and in');
  } finally { restore(); }
});
