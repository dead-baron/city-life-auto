// Dancing (task #394): the dance moves as poses (art v2: client/art2/people.js; the frames and the spin: shared/dance.js),
// the clubs' dancers (server/systems/nightclubs.js: moves, couples, the drop at the peak; the floor and the line through
// the night) and the player's dance button (IN.DANCE over the wire; the phone's Dance button; server/systems/dance.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { DAY_PART_S, DAY_LOOP_S } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { encodeInput, decodeInput } from '../shared/protocol.js';
import { KB, PAD, TOUCH, ACTIONS, KEY_ACTION } from '../shared/controls.js';
import { DANCE_MOVES, DANCE_SOLO, DANCE_COUPLES, DANCE_JUMP, DANCE_PLAYER, COUPLE_PX, danceFrame, danceDir } from '../shared/dance.js';
import { CLUB_DANCERS, CLUB_DANCERS_MAX, CLUB_FIGHT } from '../shared/rules.js';
import { POSES } from '../client/art2/people.js';
import { pedSprite, personaPose, DANCE_POSE, isDance } from '../client/art2/game/peds.js';
import * as nightclubs from '../server/systems/nightclubs.js';
import * as phone from '../server/systems/phone.js';
import { _descriptor } from '../server/net.js';
import { mulberry32 } from '../shared/rng.js';

const PEAK_T = DAY_PART_S + 0.45 * (DAY_LOOP_S - DAY_PART_S);   // (about half past midnight)
const sum = (G) => { let h = 0; for (let i = 0; i < G.col.length; i += 3) h = (Math.imul(h, 31) + G.col[i]) | 0; return h + ':' + G.w + 'x' + G.h; };

test('the dance moves are poses: four frames each, every frame different, the spin goes round', () => {
  assert.equal(DANCE_MOVES.length, 12);
  const man = { s: 2, h: 1, hc: '#3a2414', t: 4, tc: '#a02a2a', tc2: '#eee', l: '#2a3a5a', sh: '#eee', bd: 1 };
  const woman = { s: 3, h: 2, hc: '#2a1a10', t: 5, tc: '#c8262b', tc2: '#eee', l: '#222', sh: '#111', bd: 1 };
  for (const pose of DANCE_POSE) {
    assert.equal(POSES[pose], 4, `${pose}: four frames`);
    assert.ok(isDance(pose));
    for (const app of [man, woman]) {
      const frames = [0, 1, 2, 3].map((f) => sum(pedSprite(app, pose, 0, f, 0, { ar: 'casual' })));
      assert.ok(new Set(frames).size >= 3, `${pose}: it moves (${new Set(frames).size} different frames)`);
    }
  }
  // the frame goes round with the clock, on the beat
  const seen = new Set();
  for (let t = 0; t < 2; t += 0.05) seen.add(danceFrame(0, 7, t));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
  assert.equal(danceFrame(7, 3, 1.2), danceFrame(7, 11, 1.2), 'a couple on the beat together');
  assert.deepEqual([0, 1, 2, 3].map((f) => danceDir(4, 0, f)), [0, 2, 4, 6], 'the spin: front, side, back, side');
  assert.equal(danceDir(0, 3, 2), 3, 'everyone else faces their way');
  // the descriptor -> the pose: standing, the move; walking over to the spot, the walk
  assert.equal(personaPose({ gt: 'dance', dm: 5 }, 'idle'), 'drobot');
  assert.equal(personaPose({ gt: 'dance', dm: 5 }, 'walk0'), 'walk0');
  assert.equal(personaPose({ gt: 'dance' }, 'idle'), 'dance', '(a street dancer: the wild dance as before)');
});

// a hot club at the peak with a player near (out of sight of its door): the floor full, the line out the door
function peakClub(seed) {
  nightclubs.setRng(mulberry32(seed));
  const w = makeWorld();
  w.loopTime = PEAK_T;
  const c = nightclubs.clubs(w).find((q) => q.line.length >= 3 && q.posts.length === 2);
  c.hot = true;
  const a = joinPlayer(w);
  teleport(w, a.p.ped, c.door.x, c.door.y + c.s * 700);
  run(w, 3);
  return { w, c, a };
}

test('the clubs fill up through the night, the most at the hot ones; the line out the door is theirs at the peak', () => {
  const w = makeWorld();
  assert.equal(nightclubs.busyness(30), 1, 'half past midnight: the peak');
  assert.ok(nightclubs.busyness(20 * 60) < 0.5 && nightclubs.busyness(5 * 60 + 30) < 0.5, 'early and late: quiet');
  assert.ok(nightclubs.busyness(22 * 60) > nightclubs.busyness(20 * 60), 'filling up');
  const list = nightclubs.clubs(w);
  assert.ok(list.some((c) => c.hot) && list.some((c) => !c.hot), 'some hot, some not');
  const c = list[0], at = (h) => { w.loopTime = DAY_PART_S + ((h < 12 ? h + 24 : h) - 20) / 10 * (DAY_LOOP_S - DAY_PART_S); w.step(); return nightclubs.floorCap(w, c); };
  assert.ok(at(20.2) < at(0.5), 'more on the floor at the peak');
  const pop = c.pop;
  c.pop = 0; const quiet = at(0.5); c.pop = 1; const busy = at(0.5); c.pop = pop;
  assert.ok(quiet >= CLUB_DANCERS - 1 && busy > quiet && busy <= CLUB_DANCERS_MAX, `the busiest club's floor fuller (${quiet} / ${busy})`);
  // a hot club at the peak: the line's the rope's length; the same club quiet, early: one waiting at most
  const { w: w2, c: c2 } = peakClub(11);
  assert.equal(c2.queue.length, c2.line.length, 'a full line out the door');
  const dancers = c2.dancers.length;
  assert.ok(dancers >= nightclubs.floorCap(w2, c2) - 2, `a packed floor (${dancers})`);
});

test('the dancers dance moves - their own, a couple now and then, the whole floor jumping at the peak - and change them', () => {
  const { w, c } = peakClub(12);
  const D = () => c.dancers.map((id) => w.get(id)).filter(Boolean);
  const first = new Map(D().map((e) => [e.id, e.dm]));
  for (const e of D()) {
    assert.equal(e.gt, 'dance');
    assert.ok(Number.isInteger(e.dm) && e.dm >= 0 && e.dm < DANCE_MOVES.length, 'a move');
    const d = _descriptor(e);
    assert.equal(d.gt, 'dance'); assert.equal(d.dm, e.dm, 'on the wire');
  }
  let changed = 0, couple = null, jumped = 0;
  for (let t = 0; t < 150 * 20; t++) {
    w.step();
    if (t % 20) continue;
    for (const e of D()) {
      if (first.has(e.id) && first.get(e.id) !== e.dm) changed++;
      if (e.npc.partner && !couple && DANCE_COUPLES.some(([l]) => l === e.dm)) {
        const q = w.get(e.npc.partner);
        if (q && Math.hypot(q.x - q.npc.desk.x, q.y - q.npc.desk.y) < 8 && Math.hypot(e.x - e.npc.desk.x, e.y - e.npc.desk.y) < 8) {
          couple = { lead: e.dm, mate: q.dm, d: Math.hypot(e.x - q.x, e.y - q.y), facing: Math.cos(e.a - Math.atan2(q.y - e.y, q.x - e.x)) };
        }
      }
    }
    const solo = D().filter((e) => !e.npc.partner);
    if (solo.length >= 3 && solo.every((e) => e.dm === DANCE_JUMP)) jumped++;
  }
  assert.ok(changed > 0, 'they change moves');
  assert.ok(couple, 'a couple paired up');
  const pairOf = DANCE_COUPLES.find(([l]) => l === couple.lead);
  assert.equal(couple.mate, pairOf[1], 'the partner dances the same dance');
  assert.ok(Math.abs(couple.d - COUPLE_PX) < 10, `face to face, close (${couple.d | 0} px)`);
  assert.ok(couple.facing > 0.9, 'the lead faces the partner');
  assert.ok(jumped > 0, 'the drop: the whole floor jumping');
  // nobody on their own does a couple's half
  for (const e of D()) if (!e.npc.partner) assert.ok(DANCE_SOLO.includes(e.dm) || e.dm === DANCE_JUMP);
});

test("the player's dance button over the wire: start, the next move each press, everyone sees it; walking off stops it", () => {
  assert.ok(ACTIONS.includes('dance') && KB.dance === 'G' && PAD.dance && TOUCH.dance && KEY_ACTION.G === 'dance', 'on every device');
  assert.equal(decodeInput(new DataView(encodeInput(1, IN.DANCE, 0, 0, 0))).bits, IN.DANCE, 'the input bit survives the wire');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ped = p.ped;
  let seq = 0;
  const send = (bits, mx = 0, my = 0) => { players.queueInput(p, { seq: p.ack + 1 + (seq++ % 3), bits, mx, my, aim: 0 }); w.step(); };
  send(0); send(IN.DANCE); send(0);
  assert.equal(ped.gt, 'dance'); assert.equal(ped.dm, DANCE_PLAYER[0], 'dancing: the first move');
  const d = _descriptor(ped);
  assert.equal(d.gt, 'dance'); assert.equal(d.dm, DANCE_PLAYER[0], 'everyone sees it');
  const v = ped.appVer;
  send(IN.DANCE); send(0);
  assert.equal(ped.dm, DANCE_PLAYER[1], 'the next move');
  assert.ok(ped.appVer > v, '(the descriptor goes out again)');
  for (let k = 2; k < DANCE_PLAYER.length; k++) { send(IN.DANCE); send(0); assert.equal(ped.dm, DANCE_PLAYER[k]); }
  send(IN.DANCE); send(0);
  assert.ok(!ped.gt && ped.dm === undefined, 'after the last move: stopped');
  send(IN.DANCE); send(0);
  assert.equal(ped.gt, 'dance');
  send(0, 1, 0);
  assert.ok(!ped.gt && !ped.dancing, 'walking off stops it');
  // the phone's Dance button
  phone.handle(w, p, { a: 'dance' });
  assert.equal(ped.gt, 'dance'); assert.equal(ped.dm, DANCE_PLAYER[0]);
  send(IN.FIRE); send(0);
  assert.ok(!ped.dancing, 'a punch stops it');
});

test('hurt while dancing - hit, shot, burned, run over, knocked down - the dance stops (the player)', async () => {
  const combat = await import('../server/systems/combat.js');
  const { spawnNpc } = await import('../server/systems/npc.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ped = p.ped;
  const thug = spawnNpc(w, 'casual', ped.x + 30, ped.y, 'civ');
  let seq = 0;
  const send = (bits) => { players.queueInput(p, { seq: p.ack + 1 + (seq++ % 3), bits, mx: 0, my: 0, aim: 0 }); w.step(); };
  for (const [what, hurt] of [
    ['a punch', () => combat.damage(w, ped, 4, thug, 'melee', 0)],
    ['a shot', () => combat.damage(w, ped, 6, thug, 'gun', 0)],
    ['burned', () => combat.damage(w, ped, 3, null, 'fire', 0)],
    ['run over', () => combat.damage(w, ped, 8, thug, 'vehicle', 0)],
    ['knocked down', () => { ped.downUntil = w.time + 1.5; send(0); }],
  ]) {
    ped.hp = ped.maxHp; ped.downUntil = 0; ped.bleeding = false;
    send(0); send(IN.DANCE); send(0);
    assert.equal(ped.gt, 'dance', `dancing before ${what}`);
    hurt();
    assert.ok(!ped.dancing && ped.gt !== 'dance', `${what} stops the dance`);
  }
});

test("a dancer hurt on a club's floor stops and flees or fights; the floor round them reacts to the fight", async () => {
  const combat = await import('../server/systems/combat.js');
  const { w, c, a } = peakClub(11);
  const D = () => c.dancers.map((id) => w.get(id)).filter((e) => e && !e.dead);
  for (const fight of [0, 1]) {
    const list = D();
    const v = list.find((e) => list.some((o) => o !== e && Math.hypot(o.x - e.x, o.y - e.y) < CLUB_FIGHT.near));
    assert.ok(v, 'two dancers close together');
    const near = list.filter((o) => o !== v && Math.hypot(o.x - v.x, o.y - v.y) < CLUB_FIGHT.near);
    const far = list.filter((o) => Math.hypot(o.x - v.x, o.y - v.y) > CLUB_FIGHT.r);
    const rest = list.filter((o) => o !== v && !near.includes(o));
    v.npc.fight = fight;
    teleport(w, a.p.ped, v.x + 20, v.y);
    combat.damage(w, v, 3, a.p.ped, 'melee', 0);
    assert.ok(v.gt !== 'dance' && !v.npc.dancer && !v.npc.desk, 'the hurt dancer stops and leaves their spot');
    assert.ok(!c.dancers.includes(v.id), '...off the floor');
    assert.equal(v.npc.state, fight ? 'fight' : 'flee', `by temperament: ${fight ? 'fights back' : 'runs'}`);
    for (const o of near) assert.ok(o.gt !== 'dance' && o.npc.state === 'flee', 'the nearest step back out of it');
    for (const o of far) assert.equal(o.gt, 'dance', 'the far side of the floor dances on');
    assert.ok(rest.length < 2 || rest.some((o) => o.gt === 'dance'), 'most of the floor dances on');
    run(w, 1);
  }
  // someone dancing in the street (a persona) stops for good
  const { spawnNpc } = await import('../server/systems/npc.js');
  const s = spawnNpc(w, 'casual', a.p.ped.x + 40, a.p.ped.y, 'civ');
  s.gt = 'dance'; s.npc.persona = 'dancer'; s.npc.spot = { x: s.x, y: s.y };
  combat.damage(w, s, 2, null, 'fire', 0);
  assert.ok(s.gt !== 'dance' && s.npc.danceOff && s.npc.state === 'flee', 'burned: stops and gets away from it');
});
