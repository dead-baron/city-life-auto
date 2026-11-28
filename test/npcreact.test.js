// NPC reactions, part 1: civilians on foot climb a ladder instead of fight-or-flee (the owner, 11-25 00:33 and his go
// 11-27; server/systems/react.js, shared/rules.js REACT): back off / warn, run / hide / call, draw, fight - how far up by
// temperament, where they start by how bad it is, a step further the second time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, straightRoad } from './helpers.js';
import { K } from '../shared/constants.js';
import { REACT } from '../shared/rules.js';
import { spawnNpc, onAttacked, onGunfire, onCarjacked } from '../server/systems/npc.js';
import * as react from '../server/systems/react.js';

function setup() {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { weapons: { pistol: 200, bat: 1 } });
  const road = straightRoad(w.map, 1200);
  teleport(w, p.ped, road.x + 200, road.y);
  p.invincible = true;
  for (const e of [...w.entities.values()]) if (e.kind === K.PED && !e.player) w.remove(e);
  return { w, p, conn, road };
}
const says = (conn, from) => conn.sent.slice(from).map((m) => (typeof m === 'string' ? JSON.parse(m) : m)).flatMap((m) => (m && m.t === 'ev' ? m.l : [])).filter((e) => e.e === 'say');
function civ(w, arche, x, y, T) {
  const e = spawnNpc(w, arche, x, y);
  e.npc.temper = T; e.npc.keep = true; e.npc.persona = null; e.npc.act = null;
  return e;
}
const punch = (w, p, e) => { p.ped.weapon = 'fists'; onAttacked(w, e, p.ped); };

test('timid: hit, they never fight back - they run, hide or call it in; ordinary: first they back off, hands up, a word', () => {
  const { w, p, conn, road } = setup();
  const t = civ(w, 'senior', road.x + 240, road.y, 0);
  for (let i = 0; i < 3; i++) { punch(w, p, t); assert.ok(['flee', 'hide'].includes(t.npc.state), `timid: ${t.npc.state}`); }
  const c0 = conn.sent.length, o = civ(w, 'casual', road.x + 260, road.y + 40, 1);
  punch(w, p, o);
  assert.equal(o.npc.state, 'warn'); assert.ok(o.handsUp, 'hands up');
  w.step();
  assert.ok(says(conn, c0).some((e) => e.id === o.id && REACT.lines.warn.includes(e.text)), 'a word: "Whoa, easy!"');
  o.npc.fight = 0;
  punch(w, p, o);
  assert.ok(['flee', 'hide'].includes(o.npc.state), `the second time an ordinary one runs (or fights, if they're that kind): ${o.npc.state}`);
  assert.ok(!o.handsUp, 'hands down to run');
});
test('tough: a warning first ("Back off."), squared up - then the fists, the second time or if you step in', () => {
  const { w, p, road } = setup();
  const t = civ(w, 'construction', road.x + 240, road.y, 2);
  punch(w, p, t);
  assert.equal(t.npc.state, 'warn'); assert.ok(!t.handsUp && t.npc.squared, 'squared up, no hands up');
  punch(w, p, t);
  assert.equal(t.npc.state, 'fight'); assert.equal(t.npc.target, p.ped.id);
  const u = civ(w, 'construction', road.x + 400, road.y, 2);
  punch(w, p, u);
  teleport(w, p.ped, u.x - REACT.warnPx + 10, u.y);
  run(w, 0.3);
  assert.equal(u.npc.state, 'fight', 'stepped in on them: they swing');
});
test('armed: the weapon drawn and held on you - no shot - then lowered; the second time it\'s a fight', () => {
  const { w, p, road } = setup();
  const a = civ(w, 'hustler', road.x + 260, road.y, 1);
  a.weapon = 'pistol'; a.mag = { pistol: 12 };
  assert.equal(react.temper(w, a), 3, 'carrying a gun: armed');
  punch(w, p, a);
  assert.equal(a.npc.state, 'fight'); assert.ok(a.npc.holdFireUntil > a.npc.until, 'held, no shot');
  const m0 = a.mag.pistol;
  run(w, REACT.drawS[1] + 0.5);
  assert.equal(a.mag.pistol, m0, 'not a round fired');
  assert.notEqual(a.npc.state, 'fight', 'lowered and on their way');
  punch(w, p, a); punch(w, p, a);
  assert.equal(a.npc.state, 'fight'); assert.ok(!(a.npc.holdFireUntil > w.time), 'the second time: no holding back');
});
test('gunfire: people get down behind a parked car close by (crouched) or run - nobody stands there', () => {
  const { w, p, road } = setup();
  const hc = REACT.hideChance; REACT.hideChance = 1;   // (whoever has cover close by takes it: what's tested is that they can)
  const peds = [];
  for (let i = 0; i < 10; i++) {
    const x = road.x + 500 + i * 120, y = road.y + 60;
    const v = w.spawnVehicle('sedan', x, y + 40, 0, {}); v.ai = null; v.vx = 0; v.vy = 0;
    peds.push(civ(w, 'casual', x, y, 1));
  }
  onGunfire(w, road.x + 1040, road.y - 120, p.ped, 700);
  assert.ok(peds.every((e) => ['flee', 'hide'].includes(e.npc.state) || e.filming), peds.map((e) => e.npc.state).join(' '));
  const hid = peds.filter((e) => e.npc.state === 'hide');
  assert.ok(hid.length >= 3, `some get down behind the cars (${hid.length})`);
  run(w, 4);
  assert.ok(hid.some((e) => e.crouch), `crouched there (${hid.map((e) => Math.round(Math.hypot(e.npc.hx - e.x, e.npc.hy - e.y))).join(' ')} px off)`);
  assert.ok(peds.some((e) => e.phoneOut), 'and someone\'s on the phone');
  REACT.hideChance = hc;
});
test('a gun pointed at someone: hands up ("Don\'t shoot!") - an armed one draws back', () => {
  const { w, p, conn, road } = setup();
  const o = civ(w, 'casual', road.x + 380, road.y, 1);
  p.ped.weapon = 'pistol'; p.ped.a = Math.atan2(o.y - p.ped.y, o.x - p.ped.x); p.ped.aimUntil = w.time + 5;
  const c0 = conn.sent.length;
  run(w, 0.5);
  assert.equal(o.npc.state, 'warn'); assert.ok(o.handsUp);
  assert.ok(says(conn, c0).some((e) => e.id === o.id && REACT.lines.aim.includes(e.text)));
});
test('the timid run screaming from a carjacking; the tough come for you', () => {
  const { w, p, road } = setup();
  const t = civ(w, 'senior', road.x + 240, road.y, 0);
  onCarjacked(w, t, p.ped);
  assert.equal(t.npc.state, 'flee');
  const u = civ(w, 'construction', road.x + 300, road.y, 2);
  onCarjacked(w, u, p.ped);
  assert.ok(['warn', 'fight'].includes(u.npc.state), u.npc.state);
});
test('temperament: by kind of person, a notch bolder in rough districts and more timid in rich ones; each their own', () => {
  const dist = new Uint8Array(4); dist[0] = 6; dist[1] = 4;   // (Southside: rough; Downtown: lux)
  const map = { inside: () => true, idx: (tx) => tx, dist };
  const W = { map, rand: Math.random };
  const mean = (tx, arche) => { let s = 0; for (let id = 1; id <= 400; id++) s += react.temper(W, { id, x: tx * 32 + 8, y: 8, weapon: 'fists', npc: { archetype: arche } }); return s / 400; };
  assert.ok(mean(0, 'casual') > mean(1, 'casual') + 0.4, `rough ${mean(0, 'casual')} vs rich ${mean(1, 'casual')}`);
  assert.ok(mean(1, 'senior') < mean(1, 'construction'), 'a senior more timid than a builder');
});

// ---- part 2: cover (step 5) ----------------------------------------------------------------------------------------
import { startFight } from '../server/systems/npc.js';
test('cover: someone fighting with a gun gets behind a car first, crouched, and fires over it in bursts; against fists, no cover', () => {
  const { w, p, conn, road } = setup();
  p.ped.weapon = 'pistol';
  const g = civ(w, 'hustler', road.x + 520, road.y + 30, 1);
  g.weapon = 'pistol'; g.mag = { pistol: 99 };
  const v = w.spawnVehicle('sedan', road.x + 470, road.y + 40, Math.PI / 2, {}); v.ai = null; v.vx = 0; v.vy = 0;
  startFight(w, g, p.ped, 30);
  let crouched = 0, up = 0;
  const c0 = conn.sent.length;
  for (let i = 0; i < 20 * 8; i++) { w.step(); if (g.npc.cover && g.npc.cover.in) { if (g.crouch) crouched++; else up++; } }
  const shots = conn.sent.slice(c0).map((m) => (typeof m === 'string' ? JSON.parse(m) : m)).flatMap((m) => (m && m.t === 'ev' ? m.l : [])).filter((e) => e.e === 'shot' && e.id === g.id);
  assert.ok(g.npc.cover && g.npc.cover.car === v.id, 'behind the car');
  const far = ((g.x - v.x) * (p.ped.x - v.x) + (g.y - v.y) * (p.ped.y - v.y)) < 0;
  assert.ok(far, 'on its far side from them');
  assert.ok(crouched > 10 && up > 10, `ducking and coming up (${crouched} / ${up} ticks)`);
  assert.ok(shots.length > 0, `firing over it when up (${shots.length} shots)`);
  // a fight with someone with no gun: no cover, straight at them
  const h = civ(w, 'hustler', road.x + 900, road.y + 30, 1);
  h.weapon = 'pistol'; h.mag = { pistol: 99 };
  w.spawnVehicle('sedan', road.x + 860, road.y + 40, Math.PI / 2, {}).ai = null;
  const q = civ(w, 'casual', road.x + 1100, road.y, 1);
  startFight(w, h, q, 10);
  run(w, 1);
  assert.ok(!h.npc.cover, 'no cover from someone unarmed');
});
test('cover works both ways: crouched behind the car the shots hit the car; up and firing over it, they can be hit', async () => {
  const combat = await import('../server/systems/combat.js');
  const { w, p, road } = setup();
  const v = w.spawnVehicle('sedan', road.x + 400, road.y, Math.PI / 2, {}); v.ai = null; v.vx = 0; v.vy = 0;
  const g = civ(w, 'hustler', road.x + 400 + v.def.W / 2 + 16, road.y, 1);
  g.npc.coverCar = v.id; g.npc.cover = { car: v.id, in: true }; g.npc.keep = true; g.maxHp = g.hp = 1e6;
  teleport(w, p.ped, road.x + 250, road.y);
  const shoot = (n) => { for (let i = 0; i < n; i++) { p.ped.weapon = 'pistol'; p.ped.mag.pistol = 99; p.ped.nextAttack = 0; p.ped.reloadUntil = 0; p.wanted = 0; p.heat = 0; combat.tryAttack(w, p.ped, Math.atan2(g.y - p.ped.y, g.x - p.ped.x)); } };
  g.crouch = true; const h0 = g.hp, vh0 = v.hp;
  shoot(6);
  assert.equal(g.hp, h0, 'crouched: not touched'); assert.ok(v.hp < vh0, 'the car took it');
  g.crouch = false; shoot(6);
  assert.ok(g.hp < h0, 'up: hit');
});

// ---- part 3: skill tiers for the police and guards -----------------------------------------------------------------
import { COP_LEVEL, GUARD_AIM } from '../shared/rules.js';
test('tiers: rookies (1-2 stars) slow to draw, loose and never in cover; SWAT (5) quick, tight and always - each star between', () => {
  for (let s = 2; s <= 5; s++) {
    const a = COP_LEVEL[s - 1], b = COP_LEVEL[s];
    assert.ok(b.aim <= a.aim && b.drawS <= a.drawS && b.cover >= a.cover && b.gap[1] <= a.gap[1], `star ${s} no worse than ${s - 1}`);
  }
  assert.equal(COP_LEVEL[1].cover, 0); assert.equal(COP_LEVEL[5].cover, 1);
  assert.ok(GUARD_AIM.mall > 1 && GUARD_AIM.armored < 1, 'a mall guard a rookie, an armored truck\'s crew veterans');
});
test('an NPC\'s own aim: a loose shooter hits less often than a tight one at the same range', async () => {
  const combat = await import('../server/systems/combat.js');
  const hits = (aimK) => {
    const { w, road } = setup();
    const s = civ(w, 'hustler', road.x + 300, road.y, 1), t = civ(w, 'casual', road.x + 640, road.y, 1);
    t.maxHp = t.hp = 1e9; s.weapon = 'pistol'; s.mag = { pistol: 999 }; s.npc.aimK = aimK;
    let n = 0;
    for (let i = 0; i < 120; i++) { const h0 = t.hp; s.nextAttack = 0; s.reloadUntil = 0; combat.tryAttack(w, s, Math.atan2(t.y - s.y, t.x - s.x)); if (t.hp < h0) n++; teleport(w, t, road.x + 640, road.y); t.vx = t.vy = 0; }
    return n;
  };
  const loose = hits(COP_LEVEL[1].aim), tight = hits(COP_LEVEL[5].aim);
  assert.ok(tight > loose, `SWAT ${tight} hits of 120, a rookie ${loose}`);
});

// ---- part 4: the road ------------------------------------------------------------------------------------------------
import { onVehicleHit } from '../server/systems/npc.js';
function driving(w, arche, x, y, T, weapon = 'fists') {
  const v = w.spawnVehicle('sedan', x, y, 0, {}); v.ai = { kind: 'idle' }; v.vx = v.vy = 0;   // (a driver at the wheel - not routed: the reaction is what's tested)
  const e = civ(w, arche, x, y, T); e.weapon = weapon; v.seats[0] = e.id; e.vehId = v.id; e.seat = 0;
  return { v, e };
}
test('the road: bumped, a timid driver honks and floors it; most stop, honk and have a word - again and they drive off', () => {
  const { w, p, conn, road } = setup();
  const a = driving(w, 'senior', road.x + 400, road.y, 0);
  onVehicleHit(w, a.v, p.ped, 'bump');
  assert.ok(a.v.ai.panicUntil > w.time && a.v.hornUntil > w.time, 'off in a panic, the horn');
  const b = driving(w, 'casual', road.x + 700, road.y, 1), c0 = conn.sent.length;
  onVehicleHit(w, b.v, p.ped, 'bump');
  assert.ok(b.v.ai.holdUntil > w.time && !(b.v.ai.panicUntil > w.time), 'stopped to have a word');
  w.step();
  assert.ok(says(conn, c0).some((q) => q.id === b.e.id && REACT.lines.road.includes(q.text)), '"Hey! Watch it!"');
  w.time += 2; onVehicleHit(w, b.v, p.ped, 'bump');
  assert.ok(b.v.ai.panicUntil > w.time && b.e.vehId === b.v.id, 'again: off they go, still in it');
});
test('the road: a tough one bumped twice gets out to have it out; an armed one whose car you shoot gets out and draws', () => {
  const { w, p, road } = setup();
  const t = driving(w, 'construction', road.x + 400, road.y, 2);
  onVehicleHit(w, t.v, p.ped, 'bump'); w.time += 2; onVehicleHit(w, t.v, p.ped, 'bump');
  assert.ok(!t.e.vehId && ['warn', 'fight'].includes(t.e.npc.state), `out of the car: ${t.e.npc.state}`);
  const g = driving(w, 'hustler', road.x + 800, road.y, 1, 'pistol');
  onVehicleHit(w, g.v, p.ped, 'weapon');
  assert.ok(!g.e.vehId && g.e.npc.state === 'fight' && g.e.npc.holdFireUntil > g.e.npc.until, 'out and drawn, not firing yet');
});
