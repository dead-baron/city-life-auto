// The scene director (shared/scenes/, server/systems/director.js, server/capture.js): the scripts are whole; the camera's
// shots; each scene played on a headless world; actors drawn as NPCs in the live world and as players only on the capture
// server; a player stepping in takes an actor off the script; the live scheduler's switches and caps; and a capture's
// take the same every run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { SCENE_LIST, SCENES, validateScene, camAt, pointOf, BEATS } from '../shared/scenes/index.js';
import { DIRECTOR } from '../shared/rules.js';
import { K } from '../shared/constants.js';
import { IN } from '../shared/input.js';

const { seedRandom } = await import('../server/capture.js');
seedRandom(7);   // (the same city every run of this file: its people, its traffic)
const director = await import('../server/systems/director.js');
const net = await import('../server/net.js');
const combat = await import('../server/systems/combat.js');
const bikers = await import('../server/systems/bikers.js');

const stepScene = (world, r, secs) => { for (let i = 0; i < secs * 20 && !r.over; i++) world.step(); };
const ent = (world, r, cid) => world.get(r.cast.get(cid).id);

test('every scene script is whole', () => {
  assert.ok(SCENE_LIST.length >= 3);
  for (const sc of SCENE_LIST) assert.deepEqual(validateScene(sc), [], sc.id);
  for (const k of ['walk', 'drive', 'enter', 'attack', 'shoot', 'say', 'emote', 'spawn', 'explode', 'crash', 'police', 'heli', 'club', 'wait']) assert.ok(BEATS[k], k);
  // a broken one is caught: an unknown beat, a cast id that isn't there, a shot on a beat that doesn't exist
  const bad = { ...SCENES.bikerbrawl, beats: [{ who: 'nobody', do: 'walk', to: 'door' }, { who: 'jax', do: 'teleport' }], cam: [{ on: 'nope', follow: 'jax' }] };
  const err = validateScene(bad).join('\n');
  assert.match(err, /no cast nobody/); assert.match(err, /no such beat/); assert.match(err, /no beat by that id/);
});

test('the camera: follows with its lead, glides between shots, cuts, moves, starts on a beat', () => {
  const sc = { cam: [{ at: 0, follow: 'a', z: 1.2, lead: 0.5 }, { at: 2, hold: [1000, 0], z: 0.8, ease: 1 }, { at: 5, move: [[0, 0], [100, 0]], dur: 2, z: [1, 2], cut: true }, { on: 'b', d: 1, between: ['a', 'c'], z: 1 }] };
  const ctx = { anchors: {}, beatAt: (id) => (id === 'b' ? 8 : undefined), ent: (id) => (id === 'a' ? { x: 0, y: 0, vx: 100, vy: 0 } : id === 'c' ? { x: 200, y: 100, vx: 0, vy: 0 } : null) };
  assert.deepEqual(camAt(sc, 1, ctx), { x: 50, y: 0, z: 1.2, i: 0, cut: true });
  const mid = camAt(sc, 2.5, ctx);   // (halfway into the glide)
  assert.ok(mid.x > 50 && mid.x < 1000 && !mid.cut, JSON.stringify(mid));
  assert.equal(camAt(sc, 3.5, ctx).x, 1000);
  const m0 = camAt(sc, 5, ctx), m1 = camAt(sc, 7, ctx);
  assert.equal(m0.x, 0); assert.ok(m0.cut); assert.equal(m1.x, 100); assert.equal(m1.z, 2);
  assert.equal(camAt(sc, 8.5, ctx).i, 2);   // (the beat began at 8: its shot 1 s after)
  assert.equal(camAt(sc, 10, ctx).x, 100); assert.equal(camAt(sc, 10, ctx).y, 50);
  assert.deepEqual(pointOf({ a: 'p', f: 10, s: 5 }, { anchors: { p: { x: 100, y: 100, a: 0 } } }), { x: 110, y: 105, a: 0 });
});

test('biker bar brawl: in the bar, the fight, out on a club bike, the clubs after him', () => {
  const world = makeWorld({ npcBudget: 120 });
  const { p } = joinPlayer(world);
  const r = director.start(world, 'bikerbrawl', { mode: 'dev', viewer: p }).run;
  assert.ok(r, 'started');
  assert.ok(r.anchors.door && r.anchors.bar && r.anchors.town);
  assert.ok(p.conn.sent.some((m) => m.t === 'dscene' && m.id === 'bikerbrawl' && m.cast.jax), 'the page is told');
  const jax = ent(world, r, 'jax'), mark = ent(world, r, 'mark');
  for (let i = 0; i < 24 * 20 && !jax.vehId; i++) world.step();
  stepScene(world, r, 1);
  assert.ok(mark.hp < mark.maxHp, 'he hit the biker');
  assert.ok(jax.vehId, 'on a bike');
  const bike = world.get(jax.vehId);
  assert.ok(bike.club, 'a club bike');
  const chasing = bikers.clubsOf(world).filter((c) => c.mode === 'chase' && c.target === jax.id);
  assert.ok(chasing.length >= 2, `the clubs after him (${chasing.length})`);
  assert.ok(p.dirCam && Number.isFinite(p.dirCam.x), 'the viewer\'s camera');
  const x0 = bike.x, y0 = bike.y;
  stepScene(world, r, 4);
  assert.ok(Math.hypot(bike.x - x0, bike.y - y0) > 300, 'riding away');
});

test('tanker into the hideout: the driver bails, the tanker goes up, the cars after it', () => {
  const world = makeWorld({ npcBudget: 60 });
  const { p } = joinPlayer(world);
  const r = director.start(world, 'tankerhideout', { mode: 'dev', ref: { x: p.ped.x, y: p.ped.y } }).run;
  assert.ok(r);
  stepScene(world, r, 14);
  const tanker = ent(world, r, 'tanker'), deke = ent(world, r, 'deke');
  assert.ok(tanker.wreckAt, 'the tanker went up');
  assert.ok(!deke.vehId && !deke.dead, 'the driver got out alive');
  assert.ok(['car1', 'car2', 'van'].filter((c) => { const v = ent(world, r, c); return v.wreckAt || v.dead; }).length >= 2, 'the cars went up too');
});

test('helicopter pursuit: through the roadblock, the cruisers and the air unit after him, out and running', () => {
  const world = makeWorld({ npcBudget: 60 });
  const { p } = joinPlayer(world);
  const r = director.start(world, 'helipursuit', { mode: 'dev', ref: { x: p.ped.x, y: p.ped.y } }).run;
  assert.ok(r);
  const car = ent(world, r, 'getaway');
  for (let i = 0; i < 10 * 20 && !r.beatAt.flee; i++) world.step();
  stepScene(world, r, 1);
  assert.ok([...world.policeAir.values()].some((u) => u.npc === ent(world, r, 'vince').id), 'the air unit is up after him');
  assert.ok(['rb1', 'rb2'].some((c) => { const v = ent(world, r, c); return v.ai && v.ai.vehTarget === car.id; }), 'the cruisers are after the car');
  stepScene(world, r, 7);
  assert.ok(car.dead, 'the car is wrecked');
  const vince = ent(world, r, 'vince');
  assert.ok(!vince || !vince.vehId, 'out of it');
});

test('live, actors are ordinary NPCs - drawn as players only on the capture server', () => {
  const world = makeWorld({ npcBudget: 0 });
  joinPlayer(world);
  const live = director.start(world, 'bikerbrawl', { mode: 'live' }).run;
  const jaxLive = ent(world, live, 'jax');
  const d = net._descriptor(jaxLive);
  assert.equal(d.pl, false, 'no player flag');
  assert.equal(d.n, '', 'no name tag');
  assert.ok(!jaxLive.asPlayer);
  director.end(world, live);
  const cap = director.start(world, 'bikerbrawl', { mode: 'capture' }).run;
  const dc = net._descriptor(ent(world, cap, 'jax'));
  assert.equal(dc.pl, true); assert.equal(dc.n, 'JaxRider77'); assert.equal(dc.ar, 'player');
  assert.ok(dc.app && dc.app.lk, 'a player\'s look');
  // the bikers picked from the club stay NPCs either way
  assert.equal(net._descriptor(ent(world, cap, 'mark')).pl, false);
});

test('a player who hurts or aims at an actor takes them off the script: the city\'s AI from then', () => {
  const world = makeWorld({ npcBudget: 0 });
  const { p } = joinPlayer(world);
  const r = director.start(world, 'bikerbrawl', { mode: 'dev' }).run;
  stepScene(world, r, 1);
  const A = r.cast.get('jax'), jax = world.get(A.id);
  assert.ok(A.scripted && jax.npc.driven);
  p.ped.x = jax.x + 20; p.ped.y = jax.y; world.place(p.ped);
  combat.damage(world, jax, 5, p.ped, 'melee', 0);
  world.step();
  assert.equal(A.scripted, false); assert.equal(jax.npc.driven, false);
  assert.ok(['fight', 'flee'].includes(jax.npc.state), jax.npc.state);
  // aiming: the tanker's driver at the wheel
  const r2 = director.start(world, 'tankerhideout', { mode: 'dev', ref: { x: p.ped.x, y: p.ped.y } }).run;
  stepScene(world, r2, 1);
  const B = r2.cast.get('deke'), deke = world.get(B.id), tk = world.get(deke.vehId);
  p.ped.x = tk.x + 150; p.ped.y = tk.y; world.place(p.ped);
  p.inputQ.push({ seq: p.ack + 1, bits: IN.AIMING, mx: 0, my: 0, aim: Math.atan2(tk.y - p.ped.y, tk.x - p.ped.x) });   // (aiming right at it)
  world.step();
  assert.equal(B.scripted, false, 'off the script');
  assert.equal(r2.cast.get('tanker').scripted, false, 'its vehicle too');
});

test('live events: off by default; on, a scene near a player within the caps - never by someone in their first minutes', () => {
  const world = makeWorld({ npcBudget: 0 });
  assert.equal(DIRECTOR.live, false); assert.ok(Object.values(DIRECTOR.scenes).every((s) => !s.on));
  assert.equal(director.anyLive(), false);
  const { p, prof } = joinPlayer(world);
  prof.ftue = { st: 'done', m: {} };
  assert.equal(director.tryLive(world, 'helipursuit'), null, 'switched off');
  const keep = { live: DIRECTOR.live, on: DIRECTOR.scenes.helipursuit.on, max: DIRECTOR.maxActors };
  try {
    DIRECTOR.live = true; DIRECTOR.scenes.helipursuit.on = true;
    const r = director.tryLive(world, 'helipursuit');
    assert.ok(r && r.mode === 'live', 'one started');
    const d = Math.hypot(r.at.x - p.ped.x, r.at.y - p.ped.y);
    assert.ok(d >= DIRECTOR.nearPx[0] && d <= DIRECTOR.nearPx[1] + 1500, `near, not on top of them (${Math.round(d)})`);
    assert.equal(director.tryLive(world, 'helipursuit'), null, 'one at a time');
    director.end(world, r);
    world.director.cool = {};
    DIRECTOR.maxActors = 3;
    assert.equal(director.tryLive(world, 'helipursuit'), null, 'over the actors cap');
    DIRECTOR.maxActors = keep.max;
    // someone new arriving near: no scene there
    const { p: q, prof: qp } = joinPlayer(world);
    qp.ftue = { st: 'goal', m: {} };
    q.ped.x = p.ped.x + 10; q.ped.y = p.ped.y; world.place(q.ped);
    assert.equal(director.tryLive(world, 'helipursuit'), null, 'never by a player in their FTUE');
  } finally { DIRECTOR.live = keep.live; DIRECTOR.scenes.helipursuit.on = keep.on; DIRECTOR.maxActors = keep.max; }
  // a live scene nobody's near any more is over
  DIRECTOR.live = true; DIRECTOR.scenes.helipursuit.on = true;
  try {
    world.director.cool = {};
    const { p: z } = joinPlayer(world); void z;
    for (const pl of world.players.values()) { if (pl.profile) pl.profile.ftue = { st: 'done', m: {} }; }
    const r = director.tryLive(world, 'helipursuit');
    assert.ok(r);
    for (const pl of world.players.values()) { pl.ped.x += 40000; world.place(pl.ped); }
    run(world, DIRECTOR.goneS + 3);
    assert.ok(r.over && (r.why === 'gone' || r.why === 'done'), r.why);
  } finally { DIRECTOR.live = false; DIRECTOR.scenes.helipursuit.on = false; }
});

test('a capture take is the same every run (two runs, the same positions at the same ticks)', () => {
  const file = fileURLToPath(new URL('./scenerun.js', import.meta.url));
  const a = execFileSync(process.execPath, [file, 'bikerbrawl', '10'], { encoding: 'utf8', timeout: 240000 });
  const b = execFileSync(process.execPath, [file, 'bikerbrawl', '10'], { encoding: 'utf8', timeout: 240000 });
  const A = JSON.parse(a.trim().split('\n').pop()), B = JSON.parse(b.trim().split('\n').pop());
  assert.ok(Object.keys(A).length >= 4, a.slice(0, 300));
  assert.deepEqual(A, B);
});
void K;

test('autoplay: the panel\'s staged scenes and Showcase spots name scripts that exist; each autoplay scene plays on its own', async () => {
  const { SCENES: STAGED } = await import('../client/director.js').catch(() => ({ SCENES: null }));
  const { SHOWCASE } = await import('../client/showcase.js');
  if (STAGED) {
    const autos = STAGED.filter((q) => q.auto);
    assert.ok(autos.length >= 4, 'a handful converted');
    for (const q of autos) assert.ok(SCENES[q.auto], `${q.n}: ${q.auto}`);
  }
  const shows = SHOWCASE.filter((q) => q.auto);
  assert.ok(shows.length >= 3);
  for (const q of shows) { assert.ok(SCENES[q.auto], q.auto); assert.equal(SCENES[q.auto].place.k, 'named'); assert.equal(SCENES[q.auto].cast.length, 0, 'the camera alone'); }
  const world = makeWorld({ npcBudget: 40 });
  const { p } = joinPlayer(world);
  for (const [id, subject] of [['autochase', 'car'], ['autorace', 'r1'], ['autoshootout', 'boss'], ['autodust', 'duster']]) {
    const r = director.start(world, id, { mode: 'dev', ref: { x: p.ped.x, y: p.ped.y }, viewer: p }).run;
    assert.ok(r, id);
    const e = ent(world, r, subject), x0 = e.x, y0 = e.y;
    stepScene(world, r, 1);
    assert.ok(p.dirCam, `${id}: the camera`);
    stepScene(world, r, 5);
    assert.ok(Math.hypot(e.x - x0, e.y - y0) > (id === 'autoshootout' ? 0 : 300), `${id}: ${subject} on the move`);
    director.end(world, r);
  }
  assert.equal(world.errorCounts ? world.errorCounts.size : 0, 0);
});
