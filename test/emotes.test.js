// Emotes (the owner, 2026-11-13: apart from chat, an emoji over the head instead of words, an animation on the body;
// Dance: "Ann started dancing" in the log of the people near). The messages (server/chat.js emote), the body's emote
// state (server/systems/emote.js: gt 'emote' and em on the descriptor for CHAT.emoteS seconds; moving, a button or a car
// cuts it short), Dance starting the dance button's dance, the dance button telling the people near, the poses
// (client/art2/dances.js, game/peds.js), the control on every device and the Guide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clock, fakeWorld, fakePlayer } from './launchkit.js';
import { makeWorld, joinPlayer, players } from './helpers.js';
import { store } from '../server/store.js';
import { createAccounts } from '../server/accounts.js';
import { createModeration } from '../server/moderation.js';
import { createChat } from '../server/chat.js';
import { filter } from '../server/chatfilter.js';
import * as emote from '../server/systems/emote.js';
import * as dance from '../server/systems/dance.js';
import { _descriptor } from '../server/net.js';
import { K } from '../shared/constants.js';
import { CHAT, EMOTES, DANCES, QUICK, RADIAL } from '../shared/chatdefs.js';
import { DANCE_PLAYER } from '../shared/dance.js';
import { BALLOONS } from '../client/emotes.js';
import '../client/art2/poses.js';
import { IN } from '../shared/input.js';
import { KB, PAD, TOUCH, ACTIONS, KEY_ACTION } from '../shared/controls.js';
import { guideSections } from '../shared/guide.js';
import { POSES } from '../client/art2/people.js';
import { pedSprite, personaPose, isEmote, emoteFrame } from '../client/art2/game/peds.js';

function setup(c = clock()) {
  for (const k of Object.keys(store.kept)) delete store.kept[k];
  const A = createAccounts({ store, secret: 'test-secret', now: c.now });
  const chat = createChat({ accounts: A, filter: filter(), mod: createModeration({ store, now: c.now }), now: c.now });
  const w = fakeWorld();
  const P = (o = {}) => { const p = fakePlayer(w, store, o); A.ensure(p.profile).kind = 'member'; return p; };
  const got = (p) => p.conn.sent.filter((m) => m.t === 'emote');
  return { c, chat, w, P, got };
}

test('an emote: the body first; a balloon only where it means something, a log line only for dancing and lasting poses', () => {
  for (const [k, E] of Object.entries(EMOTES)) {
    assert.ok(E.n && E.text && E.me, `${k}: its name and its lines`);
    assert.ok(!E.emoji, `${k}: no Unicode emoji over heads any more`);
    if (E.b) assert.ok(BALLOONS.includes(E.b), `${k}: its balloon is drawn (client/emotes.js)`);
    if (E.hold) assert.ok(E.log, `${k}: a lasting pose goes in the log`);
  }
  for (const k of ['laugh', 'angry', 'love', 'huh', 'wow', 'sorry', 'sleep']) assert.ok(EMOTES[k].b, `${k}: a balloon`);
  for (const k of ['dance', 'sit', 'lie', 'faceplant', 'phone', 'wave']) assert.ok(!EMOTES[k].b, `${k}: no balloon`);
  assert.deepEqual(Object.keys(EMOTES).filter((k) => EMOTES[k].hold).sort(), ['crouch', 'kneel', 'lean', 'lie', 'phone', 'sit', 'sleep']);
  assert.equal(DANCES.length, DANCE_PLAYER.length, 'a Dances tab tile each move');
  const S = setup();
  const a = S.P({ x: 0, y: 0, name: 'Ann' }), b = S.P({ x: 100, y: 0 }), far = S.P({ x: 5000, y: 0 });
  assert.equal(S.chat.handle(S.w, a, { t: 'emote', e: 'wave' }), null);
  assert.equal(a.ped.gt, 'emote'); assert.equal(a.ped.em, 'wave');
  assert.equal(S.got(b).length, 0, 'a wave: the body says it - no message, no log spam');
  assert.deepEqual([_descriptor({ ...a.ped, kind: K.PED }).gt, _descriptor({ ...a.ped, kind: K.PED }).em], ['emote', 'wave'], 'everyone sees it on the body');
  // a laugh: its balloon to the people near (you too), no log line
  S.c.add(CHAT.emoteGapS * 1000);
  assert.ok(S.chat.emote(S.w, a, 'laugh'));
  assert.deepEqual(S.got(b).map((m) => [m.e, m.eid, m.n, m.b, m.lg]), [['laugh', a.ped.id, 'Ann', 'haha', undefined]]);
  assert.equal(S.got(a).length, 1, 'and you');
  assert.equal(S.got(far).length, 0, 'not far off');
  // not too fast (the gap)
  S.chat.handle(S.w, a, { t: 'emote', e: 'cheer' });
  assert.equal(a.ped.em, 'laugh', 'the gap between emotes');
  S.w.time += CHAT.emoteS; emote.tick(S.w, a.ped);
  assert.ok(!a.ped.gt && a.ped.em === undefined && _descriptor({ ...a.ped, kind: K.PED }).em === undefined, 'over after its seconds');
  // a longer one: its own seconds
  S.c.add(CHAT.emoteGapS * 1000); assert.ok(S.chat.emote(S.w, a, 'pushups'));
  S.w.time += CHAT.emoteS; emote.tick(S.w, a.ped);
  assert.equal(a.ped.em, 'pushups', 'push-ups run longer');
  S.w.time += EMOTES.pushups.s; emote.tick(S.w, a.ped);
  assert.ok(!a.ped.gt);
  // a lasting pose: held until you move; "Ann sat down" in the log of the people near
  S.c.add(CHAT.emoteGapS * 1000);
  assert.ok(S.chat.emote(S.w, a, 'sit'));
  assert.deepEqual([S.got(b).at(-1).e, S.got(b).at(-1).lg, S.got(b).at(-1).b], ['sit', 1, undefined]);
  S.w.time += 600; emote.tick(S.w, a.ped);
  assert.equal(a.ped.em, 'sit', 'still sat after ten minutes');
  emote.input(S.w, a, a.ped, { mx: 1, my: 0, bits: 0 });
  assert.ok(!a.ped.gt, 'walking off: up again');
  // asleep: the Zzz now and then (chat.update), no new log line
  S.c.add(CHAT.emoteGapS * 1000); assert.ok(S.chat.emote(S.w, a, 'sleep'));
  assert.deepEqual([S.got(b).at(-1).b, S.got(b).at(-1).lg], ['zzz', 1]);
  const n = S.got(b).length;
  S.c.add(CHAT.zzzS * 1000); S.chat.update(S.w, 1);
  assert.equal(S.got(b).length, n + 1); assert.deepEqual([S.got(b).at(-1).b, S.got(b).at(-1).lg], ['zzz', undefined], 'the Zzz again, no line');
  emote.input(S.w, a, a.ped, { mx: 0, my: 0, bits: IN.FIRE });
  assert.ok(!a.ped.gt, 'a punch: awake');
  // in a vehicle (not free to move): the balloon alone
  S.c.add(CHAT.emoteGapS * 1000); a.ped.vehId = 7;
  assert.ok(S.chat.emote(S.w, a, 'love'));
  assert.ok(!a.ped.gt && S.got(b).at(-1).b === 'heart', 'in a car: the balloon, the body as it is');
  a.ped.vehId = 0;
  assert.equal(S.chat.emote(S.w, a, 'nope'), false);
  assert.equal(S.chat.emote(S.w, a, '__proto__'), false);
});

test('Dance: a move from the Dances tab, "started dancing" to the people near once; the dance button tells them too', () => {
  const S = setup();
  const a = S.P({ x: 0, y: 0, name: 'Ann' }), b = S.P({ x: 100, y: 0 });
  assert.ok(S.chat.emote(S.w, a, 'dance'));
  assert.ok(a.ped.dancing && a.ped.gt === 'dance' && a.ped.dm !== undefined, 'dancing, the first move');
  assert.deepEqual([S.got(b).at(-1).e, S.got(b).at(-1).lg], ['dance', 1]);
  S.c.add(CHAT.emoteGapS * 1000);
  assert.equal(S.chat.emote(S.w, a, 'dance'), false, 'already dancing: nothing');
  // a move by the picker's Dances tab: that move, no second line
  const n = S.got(b).length;
  assert.ok(S.chat.handle(S.w, a, { t: 'emote', e: 'dance', m: 6 }) === null && a.ped.dm === DANCE_PLAYER[6], 'the robot');
  assert.equal(S.got(b).length, n, 'switching moves: nothing to say');
  S.c.add(CHAT.emoteGapS * 1000);
  assert.equal(S.chat.emote(S.w, a, 'dance', 6), false, 'the same move again: nothing');
  assert.equal(S.chat.emote(S.w, a, 'dance', 99), false, 'no such move');
  // another emote while dancing: the dance stops, the emote plays
  assert.ok(S.chat.emote(S.w, a, 'wave'));
  assert.ok(!a.ped.dancing && a.ped.gt === 'emote');
  // the dance button (or the phone's): world.track 'danced' (server/launch.js -> chat.announce)
  const told = [];
  S.w.track = (kind, p) => { told.push(kind); if (kind === 'danced') S.chat.announce(S.w, p, 'dance'); };
  S.c.add(CHAT.emoteGapS * 1000); emote.stop(a.ped);
  const m = S.got(b).length;
  dance.next(S.w, a);
  assert.deepEqual(told, ['danced']);
  assert.equal(S.got(b).length, m + 1, 'the people near told');
  dance.next(S.w, a);
  assert.deepEqual(told, ['danced'], 'the next move: not again');
});

test('the typing dots: to the people near while you type, off when you say it or stop; a long line goes to the log only', () => {
  const S = setup();
  const a = S.P({ x: 0, y: 0, name: 'Ann' }), b = S.P({ x: 100, y: 0 }), far = S.P({ x: 5000, y: 0 });
  const typ = (p) => p.conn.sent.filter((m) => m.t === 'typing').map((m) => m.on);
  S.chat.handle(S.w, a, { t: 'typing', on: 1 });
  assert.deepEqual(typ(b), [1]); assert.deepEqual(typ(far), []); assert.deepEqual(typ(a), [], 'not to yourself');
  S.chat.handle(S.w, a, { t: 'typing', on: 1 });
  assert.deepEqual(typ(b), [1], 'still typing: not again');
  S.chat.handle(S.w, a, { t: 'chat', ch: 'near', text: 'hi there' });
  assert.deepEqual(typ(b), [1, 0], 'said: the dots go');
  const said = b.conn.sent.filter((m) => m.t === 'chat');
  assert.equal(said.at(-1).bb, 1, 'a short line: a bubble');
  // no word for a while: the server ends them
  S.chat.handle(S.w, a, { t: 'typing', on: 1 });
  S.c.add(CHAT.typingS * 1000 + 1); S.chat.update(S.w, 1);
  assert.deepEqual(typ(b), [1, 0, 1, 0]);
  // a long line: the log only; a quick line always bubbles
  S.c.add(CHAT.dupS * 1000);
  S.chat.handle(S.w, a, { t: 'chat', ch: 'near', text: 'x'.repeat(CHAT.bubbleMax + 1) });
  assert.equal(b.conn.sent.filter((m) => m.t === 'chat').at(-1).bb, undefined, 'a long line: no bubble');
  S.c.add(CHAT.dupS * 1000);
  S.chat.handle(S.w, a, { t: 'chat', ch: 'near', text: QUICK.near[0] });
  assert.equal(b.conn.sent.filter((m) => m.t === 'chat').at(-1).bb, 1);
});

test('an emote over the wire: the body stops it when you walk off', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ped = p.ped;
  let seq = 0;
  const send = (bits, mx = 0, my = 0) => { players.queueInput(p, { seq: p.ack + 1 + (seq++ % 3), bits, mx, my, aim: 0 }); w.step(); };
  send(0);
  assert.ok(emote.play(w, p, 'salute'));
  send(0); send(0);
  assert.equal(ped.gt, 'emote', 'standing: it plays');
  send(0, 1, 0);
  assert.ok(!ped.gt, 'walking off: stopped');
  assert.ok(emote.play(w, p, 'shrug'));
  for (let i = 0; i < Math.ceil(CHAT.emoteS * 20) + 2; i++) send(0);
  assert.ok(!ped.gt, 'its time up: stopped');
});

const sum = (G) => { let h = 0; for (let i = 0; i < G.col.length; i += 3) h = (Math.imul(h, 31) + G.col[i]) | 0; return h + ':' + G.w + 'x' + G.h; };
test('the emotes are poses: four frames each, moving; the descriptor picks them', () => {
  const man = { s: 2, h: 1, hc: '#3a2414', t: 4, tc: '#a02a2a', tc2: '#eee', l: '#2a3a5a', sh: '#eee', bd: 1 };
  const idle = sum(pedSprite(man, 'idle', 0, 0, 0, { ar: 'casual' }));
  for (const k of Object.keys(EMOTES)) {
    const pose = personaPose({ gt: 'emote', em: k }, 'idle');
    if (k === 'dance') { assert.equal(pose, 'idle', 'Dance: no pose of its own'); continue; }
    assert.equal(pose, 'em' + k); assert.ok(isEmote(pose)); assert.equal(POSES[pose], 4, `${pose}: four frames`);
    const frames = [0, 1, 2, 3].map((f) => sum(pedSprite(man, pose, 0, f, 0, { ar: 'casual' })));
    if (!EMOTES[k].hold) assert.ok(new Set(frames).size >= 2, `${pose}: it moves`);
    assert.ok(frames.every((f) => f !== idle), `${pose}: not standing still`);
  }
  assert.equal(personaPose({ gt: 'emote', em: 'wave' }, 'walk0'), 'walk0', 'walking: the walk');
  const seen = new Set();
  for (let t = 0; t < 2; t += 0.05) seen.add(emoteFrame('emwave', t));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
  assert.equal(emoteFrame('emfaceplant', 5), 3, 'a faceplant: down, and staying down');
});

test('the emotes on every device, and the Guide', () => {
  assert.ok(ACTIONS.includes('emote') && KB.emote === 'B' && KEY_ACTION.B === 'emote' && PAD.emote && TOUCH.emote, 'on every device');
  assert.equal(PAD.emote[0], 'HOLD LB', 'a pad: the quick radial'); assert.equal(PAD.wpnwheel[0], 'HOLD RB', 'the weapon wheel on RB');
  assert.ok(RADIAL.includes('type') && RADIAL.some((k) => k.startsWith('q:')) && RADIAL.some((k) => k.startsWith('e:')), 'the radial: Type, quick lines, emotes');
  for (const k of RADIAL) if (k.startsWith('e:')) assert.ok(EMOTES[k.slice(2)], k); else if (k.startsWith('q:')) assert.ok(QUICK.near[+k.slice(2)], k);
  const e = guideSections().flatMap((s) => s.entries).find((x) => x.id === 'emotes');
  assert.ok(e && e.b.includes('[[emote]]') && e.b.includes('[[dance]]'), 'the Guide teaches it by its control');
  const c = guideSections().flatMap((s) => s.entries).find((x) => x.id === 'chat');
  assert.ok(!/hold it for the emotes/.test(c.b), 'chat no longer carries them');
});
