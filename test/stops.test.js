// Small crimes and the 1-star police stop (task #405; server/systems/law.js smallCrime, server/systems/stops.js). The
// owner: "One punch with witnesses shouldn't bring a cop; it should take a fair number of small crimes before 1 star,
// unless done in front of an officer. At 1 star police pull up casually, investigate where it happened, walk up and
// talk; stand still for a warning or talk to them; run and they may or may not chase; outrun them too long and it
// becomes 2 stars (then aggressive). Tackling and hard arrests start at 2 stars; some officers try to arrest right
// away - variety by officer personality."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, straightRoad } from './helpers.js';
import { STAR_HEAT, T } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { PED } from '../shared/physics.js';
import { PED_BLOCK } from '../shared/map.js';
import { SUSPICION_STAR, SUSPICION_HOLD_S, SUSPICION_FADE_S, COP_TEMPER, STOP_OUTCOME, STOP_RAN, STOP_FINE, STOP_ESCALATE_S, STOP_LOOK_S } from '../shared/rules.js';
import * as law from '../server/systems/law.js';
import * as stops from '../server/systems/stops.js';
import * as combat from '../server/systems/combat.js';
import * as players from '../server/systems/players.js';
import * as phone from '../server/systems/phone.js';
import { nearestKerb } from '../server/systems/custody.js';
import { wildStyle } from '../server/systems/wildlife.js';
import { spawnNpc, walkInAt } from '../server/systems/npc.js';

function until(w, cond, seconds, each = null) { for (let i = 0; i < seconds * 20; i++) { if (each) each(i); w.step(); if (cond()) return true; } return false; }
// what each player is told
function listen(w) {
  const log = new Map(), notify = w.notify.bind(w);
  w.notify = (q, text, tone) => { if (q) { if (!log.has(q)) log.set(q, []); log.get(q).push(text); } return notify(q, text, tone); };
  return (q, re) => (log.get(q) || []).some((t) => re.test(t));
}
// the events the world emits
function hear(w) {
  const log = [], emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { log.push({ ...ev, at: w.time }); return emit(x, y, ev); };
  return log;
}
// a spot on the long straight avenue in Midtown, with no traffic cameras about (restored after: the map is shared)
function street(w) {
  const r = straightRoad(w.map, 1400), cams = w.map.cameras;
  w.map.cameras = [];
  return { x: r.x + 1200, y: r.y, road: r, restore: () => { w.map.cameras = cams; } };
}
// a spot in a park or on a plaza in town, a few hundred px from the nearest street and a clear walk from it
function offRoad(w) {
  const m = w.map;
  for (let ty = 40; ty < m.h - 40; ty += 5) for (let tx = 40; tx < m.w - 40; tx += 5) {
    const t = m.tiles[ty * m.w + tx], x = tx * 32 + 16, y = ty * 32 + 16;
    if ((t !== T.PLAZA && t !== T.GRASS) || wildStyle(m, x, y)) continue;
    const k = nearestKerb(m, x, y), d = Math.hypot(k.x - x, k.y - y);
    if (d < 280 || d > 420 || !m.los(k.x, k.y, x, y)) continue;
    let clear = true;
    for (let i = 1; i < 40 && clear; i++) clear = !PED_BLOCK[m.tileAtPx(k.x + (x - k.x) * i / 40, k.y + (y - k.y) * i / 40)];
    if (clear) return { x, y, kerb: k, d };
  }
  return null;
}
// two spots on the pavement either side of a building (no way straight through, no shop door to go in by)
function eitherSide(w) {
  const m = w.map;
  for (let ty = 60; ty < m.h - 60; ty += 3) for (let tx = 60; tx < m.w - 60; tx++) {
    if (m.tiles[ty * m.w + tx] !== T.SIDEWALK || !PED_BLOCK[m.tiles[ty * m.w + tx + 1]]) continue;
    let k = 2;
    while (k < 12 && PED_BLOCK[m.tiles[ty * m.w + tx + k]]) k++;
    if (k < 5 || k >= 12 || m.tiles[ty * m.w + tx + k] !== T.SIDEWALK) continue;
    const a = { x: tx * 32 + 16, y: ty * 32 + 16 }, b = { x: (tx + k) * 32 + 16, y: ty * 32 + 16 };
    if (!m.los(a.x, a.y, b.x, b.y) && !walkInAt(m, a.x, a.y) && !walkInAt(m, b.x, b.y) && !wildStyle(m, a.x, a.y)) return { a, b };
  }
  return null;
}
// a passer-by who saw it and always calls it in
function witness(w, ped, dx, dy) {
  const e = spawnNpc(w, 'executive', ped.x + dx, ped.y + dy, 'civ');
  e.a = Math.atan2(-dy, -dx); e.npc.snitch = 9; e.npc.state = 'idle'; e.npc.until = w.time + 1e9; e.npc.lookAt = w.time + 1e9;
  return e;
}
// someone right in front of you, and a punch at them (bare fists)
function punch(w, p, weapon = 'fists') {
  const v = spawnNpc(w, 'casual', p.ped.x + 20, p.ped.y, 'civ');
  v.hp = v.maxHp = 400; v.a = Math.PI;
  p.ped.weapon = weapon; p.ped.nextAttack = 0;
  assert.ok(combat.tryAttack(w, p.ped, 0) && v.hp < 400, 'the blow landed');
  w.remove(v);
}
// an officer walking a beat, close by, facing you; temper: theirs for the test
function beatCop(w, ped, dx, dy, temper) {
  const c = spawnNpc(w, 'cop', ped.x + dx, ped.y + dy, 'cop');
  c.npc.beat = true; c.npc.temper = temper; c.a = Math.atan2(-dy, -dx);
  return c;
}
const stand = (p) => p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 });

test('small crimes add up: a punch people see is no star, several in a short while are - and the count fades if you stop', () => {
  const w = makeWorld(), told = listen(w);
  const { p } = joinPlayer(w);
  const at = street(w);
  try {
    teleport(w, p.ped, at.x, at.y);
    witness(w, p.ped, 150, -40);
    for (let i = 1; i < SUSPICION_STAR; i++) {
      punch(w, p); w.time += 2;
      assert.equal(p.wanted, 0, `${i} punch(es) seen: no star`);
      assert.equal(p.heat, 0, 'no heat either');
      assert.ok(Math.abs(law.suspicionOf(w, p) - i) < 0.01, `suspicion ${law.suspicionOf(w, p)}`);
    }
    assert.ok(told(p, /people saw that/), 'told people saw');
    assert.ok(told(p, /phones out/), 'and warned before the one that brings the police');
    punch(w, p);
    assert.equal(p.wanted, 1, `${SUSPICION_STAR} in a short while: a star`);
    assert.ok(law.soft(p), 'the kind that brings an officer for a word');
    assert.ok(p.heat >= STAR_HEAT[1] && p.heat < STAR_HEAT[2]);
    assert.ok(told(p, /called the police/));
    assert.ok(w.dispatch.some((d) => d.who === p.pid && d.l === 'Assault' && d.s === 1), 'on the police dispatch');
    // the count fades: three, a quiet while (one less every SUSPICION_FADE_S once SUSPICION_HOLD_S have passed)...
    law.clearWanted(w, p);
    for (let i = 0; i < SUSPICION_STAR - 1; i++) { punch(w, p); w.time += 1; }
    w.time += SUSPICION_HOLD_S + 2 * SUSPICION_FADE_S;
    assert.ok(Math.abs(law.suspicionOf(w, p) - (SUSPICION_STAR - 3)) < 0.05, `faded to ${law.suspicionOf(w, p).toFixed(2)}`);
    punch(w, p);
    assert.equal(p.wanted, 0, 'one more after the quiet: still no star');
    // a weapon is no small crime: a star at once, the usual kind (the chase - as before)
    law.clearWanted(w, p);
    p.profile.weapons.bat = 0;
    punch(w, p, 'bat');
    assert.equal(p.wanted, 1, 'a bat: called in at once');
    assert.ok(!law.soft(p), 'the usual kind');
    // which crimes are small: a punch, ramming a car, lifting a bike, felling a tree in town - not the serious ones
    for (const type of ['punch', 'ram', 'bikeTheft', 'treeFelling']) assert.ok(law.CRIMES[type].minor, `${type}: a small crime`);
    for (const type of ['assault', 'copAssault', 'theft', 'hitrun', 'carjack', 'bikejack', 'brandish', 'murder', 'vehKill', 'robbery']) assert.ok(!law.CRIMES[type].minor, `${type}: not a small crime`);
    law.clearWanted(w, p);
    const car = spawnNpc(w, 'casual', p.ped.x + 30, p.ped.y, 'civ');   // (whoever was at the wheel of the car you rammed)
    law.crime(w, p.ped, 'ram', car, car.x, car.y);
    assert.equal(p.wanted, 0, 'a ram people saw: no star');
    assert.ok(Math.abs(law.suspicionOf(w, p) - 1) < 0.01, 'it adds up like the rest');
  } finally { at.restore(); }
});

test('an officer who sees a small crime makes it a star at once, and comes over for a word himself; stand still - a warning', () => {
  const w = makeWorld(), told = listen(w), heard = hear(w);
  const { p } = joinPlayer(w);
  const at = street(w);
  try {
    teleport(w, p.ped, at.x, at.y);
    const cop = beatCop(w, p.ped, 220, 0, 'easy');
    punch(w, p);
    assert.equal(p.wanted, 1, 'a star at once');
    assert.ok(law.soft(p), 'one punch: a word, not a chase');
    assert.ok(told(p, /officer saw that/));
    assert.ok(until(w, () => p.stop && p.stop.cop, 2, () => stand(p)), 'a stop');
    assert.equal(p.stop.cop, cop.id, 'the officer who saw it deals with it');
    assert.equal(p.stop.car, 0, 'on foot - no car sent');
    // stand still: he walks up and has a word
    let fastest = 0;
    assert.ok(until(w, () => p.stop && p.stop.stage === 'talk', 20, () => { stand(p); fastest = Math.max(fastest, Math.hypot(cop.vx, cop.vy)); }), `a word (stage ${p.stop && p.stop.stage})`);
    assert.ok(fastest <= PED.walk * 1.15, `he walked up (${Math.round(fastest)} px/s)`);
    assert.ok(Math.hypot(cop.x - p.ped.x, cop.y - p.ped.y) < 70, 'face to face');
    assert.ok(heard.some((e) => e.e === 'say' && e.id === cop.id && /A word/.test(e.text)), 'he called out (a speech bubble)');
    const r0 = w.rand;
    w.rand = () => 0.01;   // (the roll: a warning)
    assert.ok(until(w, () => !p.stop, 5, () => stand(p)), 'the word done');
    w.rand = r0;
    assert.equal(p.wanted, 0, 'a warning: the star cleared');
    assert.ok(told(p, /warning/));
    assert.ok(heard.some((e) => e.e === 'say' && e.id === cop.id && /warning/.test(e.text)));
    assert.ok(!heard.some((e) => (e.e === 'knockdown' || e.e === 'struggle') && e.id === p.ped.id), 'no tackle, no struggle');
    assert.ok(!cop.npc.stop && cop.npc.beat, 'back to his beat');
    // already on that star, another small crime in front of an officer: 2 stars, the usual chase
    law.smallStar(w, p, 'punch', p.ped.x, p.ped.y, 'witness');
    assert.ok(law.soft(p));
    teleport(w, cop, p.ped.x + 200, p.ped.y); cop.a = Math.PI;
    punch(w, p);
    assert.equal(p.wanted, 2, 'again, in front of the police: 2 stars');
    assert.ok(!law.soft(p), 'the usual kind');
  } finally { at.restore(); }
});

test('the officer comes for a word: a car to where it happened, no siren, an easy pace; out, up to you at a walk; "Talk to the officer"; a warning, and off they go', () => {
  const w = makeWorld(), told = listen(w), heard = hear(w);
  const { p } = joinPlayer(w);
  const at = street(w);
  try {
    teleport(w, p.ped, at.x, at.y);
    law.smallStar(w, p, 'punch', at.x, at.y, 'witness');   // (people saw a few punches here: the star)
    teleport(w, p.ped, at.x + 260, at.y + 60);   // (a few steps on from where it happened)
    let car = null, sirens = false, carFastest = 0, walkFastest = 0, pulledUpAt = null;
    const watch = () => {
      stand(p);
      const s = p.stop;
      if (!s) return;
      if (s.car) car = w.get(s.car);
      if (car && car.sirenOn) sirens = true;
      const c = w.get(s.cop);
      if (s.stage === 'come' && car) carFastest = Math.max(carFastest, Math.hypot(car.vx, car.vy));
      if (c && !c.vehId && pulledUpAt === null) pulledUpAt = { x: c.x, y: c.y };
      if (c && !c.vehId && s.stage === 'walk') walkFastest = Math.max(walkFastest, Math.hypot(c.vx, c.vy));
    };
    assert.ok(until(w, () => p.stop && p.stop.stage === 'walk' && Math.hypot(w.get(p.stop.cop).x - p.ped.x, w.get(p.stop.cop).y - p.ped.y) < 85, 60, watch), `the officer walking up (stage ${p.stop && p.stop.stage})`);
    assert.ok(car && car.def.police, 'a police car came');
    assert.ok(!sirens, 'no siren');
    assert.ok(carFastest < 380, `an easy pace (${Math.round(carFastest)} px/s)`);
    assert.ok(Math.hypot(pulledUpAt.x - at.x, pulledUpAt.y - at.y) < 420 || Math.hypot(pulledUpAt.x - p.ped.x, pulledUpAt.y - p.ped.y) < 420, 'pulled up at the scene (or by them, seen on the way)');
    assert.ok(walkFastest <= PED.walk * 1.15, `walked up (${Math.round(walkFastest)} px/s)`);
    // the action button: a word, right now
    const act = players.findInteraction(w, p);
    assert.ok(act && act.label === 'Talk to the officer', `the prompt (${act && act.label})`);
    act.run();
    assert.equal(p.stop.stage, 'talk');
    assert.equal(players.findInteraction(w, p).label, 'Talking to the officer...');
    const r0 = w.rand;
    w.rand = () => 0.01;
    assert.ok(until(w, () => !p.stop, 5, watch));
    w.rand = r0;
    assert.equal(p.wanted, 0, 'a warning: the star cleared');
    assert.ok(told(p, /An officer wants a word/) && told(p, /warning/));
    assert.ok(!heard.some((e) => (e.e === 'knockdown' || e.e === 'struggle') && e.id === p.ped.id), 'no tackle');
    // and they go: back to the car and off
    const cop = w.get(heard.filter((e) => e.e === 'say').pop().id);
    assert.ok(until(w, () => !cop || cop.removed || cop.vehId, 15, () => stand(p)), 'back in the car');
    assert.ok(until(w, () => car.removed || Math.hypot(car.x - p.ped.x, car.y - p.ped.y) > 400, 30, () => stand(p)), 'and away');
  } finally { at.restore(); }
});

test('nobody found where it happened (in a park): the car pulls up at the kerb, the officer walks over, looks round a while and leaves; the star holds while they look, then fades', () => {
  const w = makeWorld(), heard = hear(w);
  const { p } = joinPlayer(w);
  const at = offRoad(w), cams = w.map.cameras;
  assert.ok(at, 'a park or a plaza off the street');
  w.map.cameras = [];
  try {
    teleport(w, p.ped, at.x, at.y);
    law.smallStar(w, p, 'punch', at.x, at.y, 'witness');
    teleport(w, p.ped, at.x + 3000, at.y + 60);   // (long gone)
    const heat = p.heat;
    let out = null;   // (where the officer got out of the car)
    assert.ok(until(w, () => p.stop && p.stop.stage === 'look', 60, () => {
      stand(p);
      const c = p.stop && p.stop.car && w.get(p.stop.cop);
      if (c && !c.vehId && !out) out = { x: c.x, y: c.y };
    }), 'the officer at the scene, looking round');
    assert.ok(out && Math.hypot(out.x - at.kerb.x, out.y - at.kerb.y) < 160, `the car pulled up at the kerb (${out && Math.round(Math.hypot(out.x - at.kerb.x, out.y - at.kerb.y))} px from it)`);
    assert.ok(Math.hypot(out.x - at.x, out.y - at.y) > at.d - 160, 'not driven into the park');
    const c = w.get(p.stop.cop), looked = w.time;
    assert.ok(Math.hypot(c.x - at.x, c.y - at.y) < 260, 'walked over to the scene');
    assert.ok(p.wanted === 1 && p.heat === heat, 'the star holds while they look');
    assert.ok(until(w, () => !p.stop, STOP_LOOK_S + 3, () => stand(p)), 'gave up');
    assert.ok(w.time - looked >= STOP_LOOK_S - 0.1, 'after a good look round');
    assert.ok(heard.some((e) => e.e === 'say' && /Nobody about/.test(e.text)));
    assert.ok(until(w, () => p.wanted === 0, 20, () => stand(p)), 'the star fades');
    run(w, 3);
    assert.ok(!p.stop, 'no other stop for that star');
  } finally { w.map.cameras = cams; }
});

test('an officer who can\'t get any nearer the scene (a building in the way: no path finding on foot) looks round from there, then leaves', () => {
  const w = makeWorld(), heard = hear(w);
  const { p } = joinPlayer(w);
  const at = eitherSide(w);
  assert.ok(at, 'a building with pavement either side');
  const cop = spawnNpc(w, 'cop', at.a.x, at.a.y, 'cop');
  cop.npc.beat = true; cop.npc.temper = 'easy';
  teleport(w, p.ped, at.b.x, at.b.y);
  law.smallStar(w, p, 'punch', at.b.x, at.b.y, 'officer', cop.id);   // (he saw it from round the corner)
  teleport(w, p.ped, at.b.x + 3000, at.b.y);   // (long gone)
  assert.ok(until(w, () => p.stop && p.stop.stage === 'look', 15, () => stand(p)), `looking round where he got to (stage ${p.stop && p.stop.stage})`);
  assert.equal(p.stop.cop, cop.id);
  assert.ok(cop.x < at.b.x - 40, 'never got through the building');
  assert.ok(until(w, () => !p.stop, STOP_LOOK_S + 3, () => stand(p)), 'and gave up');
  assert.ok(heard.some((e) => e.e === 'say' && e.id === cop.id && /Nobody about/.test(e.text)));
  assert.ok(until(w, () => p.wanted === 0, 12, () => stand(p)), 'the star fades');
  assert.ok(!cop.npc.stop && cop.npc.beat, 'back on his beat');
});

test('by temper: laid back mostly warns, by the book mostly fines, now and then the cuffs - cuffed where you stand, no tackle', () => {
  // the tempers: shared out as COP_TEMPER, the same officer always the same
  const n = { easy: 0, book: 0, hot: 0 };
  for (let id = 1; id <= 4000; id++) n[stops.temper({ id, npc: {} })]++;
  for (const k of Object.keys(COP_TEMPER)) assert.ok(Math.abs(n[k] / 4000 - COP_TEMPER[k]) < 0.03, `${k}: ${n[k] / 40}%`);
  assert.equal(stops.temper({ id: 777, npc: {} }), stops.temper({ id: 777, npc: {} }), 'stable');
  // the verdicts, by temper (and less of a warning for having run)
  const shares = (tm, ran) => { const o = { warn: 0, fine: 0, arrest: 0 }; for (let i = 0; i < 1000; i++) o[stops.outcome(tm, ran, (i + 0.5) / 1000)]++; return [o.warn / 1000, o.fine / 1000, o.arrest / 1000]; };
  for (const tm of ['easy', 'book']) shares(tm, false).forEach((v, i) => assert.ok(Math.abs(v - STOP_OUTCOME[tm][i]) < 0.002, `${tm}: ${shares(tm, false)}`));
  assert.ok(COP_TEMPER.easy > 0.5 && COP_TEMPER.hot < COP_TEMPER.book, 'most are laid back, a few hotheads');
  assert.ok(shares('easy', false)[0] > 0.7 && shares('easy', false)[2] < 0.05, 'laid back: mostly a warning, hardly ever the cuffs');
  assert.ok(shares('book', false)[1] > 0.5 && shares('book', false)[2] < 0.2, 'by the book: mostly a fine');
  assert.ok(Math.abs(shares('easy', true)[0] - STOP_OUTCOME.easy[0] * STOP_RAN) < 0.002, 'ran first: less of a warning');
  // a fine, in the world: cash first, then the bank
  const w = makeWorld(), told = listen(w), heard = hear(w);
  const at = street(w);
  try {
    const word = (p, temper, roll) => {
      teleport(w, p.ped, at.x, at.y);
      const cop = beatCop(w, p.ped, 120, 0, temper);
      law.smallStar(w, p, 'punch', p.ped.x, p.ped.y, 'officer', cop.id);
      assert.ok(until(w, () => p.stop && p.stop.stage === 'talk', 20, () => stand(p)), 'a word');
      const r0 = w.rand;
      w.rand = () => roll;
      until(w, () => !p.stop, 5, () => stand(p));
      w.rand = r0;
      return cop;
    };
    const a = joinPlayer(w, { cash: 30, bank: 500 }).p;
    word(a, 'book', 0.6);
    assert.equal(a.wanted, 0, 'fined: the star cleared');
    assert.equal(a.profile.cash, 0, 'the cash first...');
    assert.equal(a.profile.bank, 500 - (STOP_FINE - 30), '...then the bank');
    assert.ok(told(a, /fined you \$100/));
    players.leave(w, a); w.players.delete(a.pid); w.remove(a.ped);
    // the cuffs: where you stand, no tackle
    const b = joinPlayer(w).p;
    const n0 = heard.length;
    const cop = word(b, 'book', 0.97);
    assert.ok(b.custody && b.custody.stage === 'held' && b.ped.cuffed, 'cuffed');
    assert.equal(b.custody.holder, cop.id, 'by the officer who had the word');
    assert.ok(!heard.slice(n0).some((e) => (e.e === 'knockdown' || e.e === 'struggle') && e.id === b.ped.id), 'no tackle, no struggle');
    assert.ok(heard.slice(n0).some((e) => e.e === 'say' && /coming with me/.test(e.text)));
    // an officer off his beat with a prisoner: he kneels by them till the car comes, he doesn't wander off (npc.js holding)
    run(w, 1);
    for (let i = 0; i < 40; i++) {
      stand(b); w.step();
      assert.ok(cop.kneelUntil > w.time && Math.hypot(cop.x - b.ped.x, cop.y - b.ped.y) < 30, `kneeling by his prisoner (${Math.round(Math.hypot(cop.x - b.ped.x, cop.y - b.ped.y))} px)`);
    }
    assert.ok(b.custody && b.custody.holder === cop.id, 'still holding them');
  } finally { at.restore(); }
});

test('walk off or run: they call out and may come after you - no tackle at 1 star; out of their reach too long and it is 2 stars, the usual chase', () => {
  const w = makeWorld(), told = listen(w), heard = hear(w);
  const at = street(w);
  try {
    const flee = (p, i) => p.inputQ.push({ seq: p.ack + 1, bits: i % 30 < 24 ? IN.SPRINT : 0, mx: 1, my: 0, aim: 0 });   // (away along the avenue)
    // by the book: after you
    const { p } = joinPlayer(w);
    teleport(w, p.ped, at.x, at.y);
    const cop = beatCop(w, p.ped, -240, 0, 'book');
    law.smallStar(w, p, 'punch', p.ped.x, p.ped.y, 'officer', cop.id);
    assert.ok(until(w, () => p.stop && p.stop.called && Math.hypot(cop.x - p.ped.x, cop.y - p.ped.y) < 200, 20, () => stand(p)), 'he called out');
    p.stop.chase = true;   // (this one comes after you: STOP_CHASE)
    let ranAt = 0;
    const n0 = heard.length;
    const twoStars = until(w, () => p.wanted >= 2, STOP_ESCALATE_S * 2 + 8, (i) => { flee(p, i); if (!ranAt && p.stop && p.stop.stage === 'run') ranAt = w.time; });
    assert.ok(ranAt, 'they saw you go');
    assert.ok(heard.slice(n0).some((e) => e.e === 'say' && /Stop right there/.test(e.text)), '"Stop right there!"');
    assert.ok(twoStars, `out of their reach long enough: 2 stars (still ${p.wanted}, ${p.stop && p.stop.outT.toFixed(1)} s out of reach)`);
    assert.ok(w.time - ranAt >= STOP_ESCALATE_S - 0.1, `not before ${STOP_ESCALATE_S} s (${(w.time - ranAt).toFixed(1)})`);
    assert.ok(!law.soft(p) && !p.stop, 'the usual kind: the stop is over');
    assert.ok(!heard.slice(n0).some((e) => (e.e === 'knockdown' || e.e === 'struggle') && e.id === p.ped.id) && !p.struggle, 'no tackle at 1 star');
    assert.ok(told(p, /after you for real/));
    assert.ok(w.dispatch.some((d) => d.who === p.pid && d.l === 'Ran from an officer' && d.s === 2), 'radioed in');
    assert.equal(cop.npc.pursue, p.ped.id, 'and he keeps after you - on foot, tackles from here');
    // 2 stars: stop, and down you go (a dive, or wrestled down: the struggle) - tackles start at 2 stars
    const k0 = heard.length;
    assert.ok(until(w, () => !!p.struggle || heard.slice(k0).some((e) => e.e === 'knockdown' && e.id === p.ped.id), 20, () => stand(p)), 'tackled at 2 stars');
    law.clearWanted(w, p);
    run(w, 1);
    // laid back: lets you go, and the star fades once you're gone
    const q = joinPlayer(w).p;
    teleport(w, q.ped, at.x + 4000, at.y);
    const easy = beatCop(w, q.ped, -240, 0, 'easy');
    law.smallStar(w, q, 'punch', q.ped.x, q.ped.y, 'officer', easy.id);
    assert.ok(until(w, () => q.stop && q.stop.called && Math.hypot(easy.x - q.ped.x, easy.y - q.ped.y) < 200, 20, () => stand(q)));
    q.stop.chase = false;
    const m0 = heard.length;
    assert.ok(until(w, () => !q.stop, 6, (i) => flee(q, i)), 'let go');
    assert.ok(heard.slice(m0).some((e) => e.e === 'say' && /forget it/.test(e.text)));
    assert.ok(told(q, /let you go/));
    const seen = Math.hypot(easy.x - q.ped.x, easy.y - q.ped.y) < 400 && w.map.los(easy.x, easy.y, q.ped.x, q.ped.y);
    assert.ok(until(w, () => q.wanted === 0, 12, () => stand(q)), `the star fades - standing there${seen ? ', in his sight' : ''}`);
    assert.ok(told(q, /let it go/));
    assert.ok(!easy.npc.pursue && !easy.npc.stop, 'he never came after you');
  } finally { at.restore(); }
});

test('a hothead goes for the arrest at once, even at 1 star: no word, a tackle - fight back or be cuffed', () => {
  const w = makeWorld(), told = listen(w), heard = hear(w);
  const { p } = joinPlayer(w);
  const at = street(w);
  try {
    teleport(w, p.ped, at.x, at.y);
    const cop = beatCop(w, p.ped, 160, 0, 'hot');
    punch(w, p);
    assert.ok(law.soft(p), '1 star from a punch he saw');
    assert.ok(until(w, () => p.stop && p.stop.stage === 'hot', 3, () => stand(p)), 'he goes for the arrest');
    assert.ok(heard.some((e) => e.e === 'say' && e.id === cop.id && /ground/.test(e.text)));
    assert.ok(told(p, /going for the arrest/));
    assert.ok(!/Talk/.test((players.findInteraction(w, p) || {}).label || ''), 'no word to be had');
    assert.ok(until(w, () => !!p.custody, 25, () => stand(p)), 'lying there: cuffed');
    assert.ok(heard.some((e) => e.e === 'knockdown' && e.id === p.ped.id), 'tackled');
    assert.equal(p.custody.holder, cop.id);
  } finally { at.restore(); }
});

test('hit the officer who came for a word: 2 stars at once, the word is off and he comes after you himself', () => {
  const w = makeWorld(), told = listen(w);
  const { p } = joinPlayer(w);
  const at = street(w);
  try {
    teleport(w, p.ped, at.x, at.y);
    const cop = beatCop(w, p.ped, 200, 0, 'easy');
    law.smallStar(w, p, 'punch', p.ped.x, p.ped.y, 'officer', cop.id);
    assert.ok(until(w, () => p.stop && p.stop.cop === cop.id && p.stop.stage === 'talk', 20, () => stand(p)), 'he came over for a word');
    teleport(w, p.ped, cop.x - 20, cop.y);   // (a step up to him)
    p.ped.weapon = 'fists'; p.ped.nextAttack = 0;
    assert.ok(combat.tryAttack(w, p.ped, Math.atan2(cop.y - p.ped.y, cop.x - p.ped.x)) && cop.hp < cop.maxHp, 'a punch at him');
    assert.ok(p.wanted >= 2 && !law.soft(p), `assaulting an officer: ${p.wanted} stars`);
    assert.ok(told(p, /Assaulting an officer/));
    stand(p); w.step();
    assert.ok(!p.stop && !cop.npc.stop, 'the word is off');
    assert.equal(cop.npc.pursue, p.ped.id, 'he comes after you himself');
  } finally { at.restore(); }
});

test('the debug menu: 1 star from small crimes on the spot (an officer comes for a word); 2 stars the usual kind', async () => {
  const dev = await import('../server/dev.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  dev.command(w, p, 'wanted', { soft: 1 });
  assert.ok(p.wanted === 1 && law.soft(p), 'a word');
  dev.command(w, p, 'wanted', { n: 2 });
  assert.ok(p.wanted === 2 && !law.soft(p), 'the chase');
});

test('a small crime a player calls in: the car that finds you wants a word, not a chase', () => {
  const w = makeWorld();
  const at = street(w);
  try {
    const A = joinPlayer(w, { cash: 0 }).p, B = joinPlayer(w, { cash: 0 }).p;
    teleport(w, A.ped, at.x, at.y);
    teleport(w, B.ped, at.x + 140, at.y + 20);
    const v = spawnNpc(w, 'casual', at.x + 20, at.y, 'civ'); v.npc.snitch = 0;   // (the only witness is B)
    A.ped.weapon = 'fists'; A.ped.nextAttack = 0;
    combat.tryAttack(w, A.ped, 0);
    assert.equal(A.wanted, 0);
    const saw = phone.boardFor(w, B).saw[0];
    assert.ok(saw && saw.label === 'Assault', 'B saw it');
    assert.ok(!phone.handle(w, B, { a: 'report', id: saw.id }).err, 'called in');
    let unit = null;
    for (let t = 0; t < 60 && !A.stop; t++) {
      teleport(w, A.ped, A.ped.x, A.ped.y);
      run(w, 1);
      for (const id of w.police) { const u = w.get(id); if (u && u.ai && (u.ai.call || u.ai.target === A.pid)) unit = u; }
      if (unit && !A.wanted) { teleport(w, A.ped, unit.x + 90, unit.y); A.ped.vx = 0; A.ped.vy = 0; }
    }
    assert.ok(A.wanted === 1 && law.soft(A), 'found: 1 star, the kind for a word');
    assert.ok(A.stop && A.stop.car === unit.id, 'the car that found them has the word');
    assert.ok(!unit.sirenOn, 'no siren');
  } finally { at.restore(); }
});
