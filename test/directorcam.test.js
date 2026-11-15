// The camera panel's shot list on the page (client/director.js; the owner, 2026-11-14: "the camera ... doesnt seem to
// follow the scene and the auto play scenes dont seem to work. When doing a tour it wont let me switch scenes and the
// camera doesnt really move"). The director runs here over a stand-in page (a few DOM calls, the server's messages
// played to it by hand), so each cause the owner hit is pinned:
//   - switching shots: the old scene's end ('off') made the page send 'unwatch', which reached the server after the next
//     scene had begun and took the camera off it - now the page sends nothing for the server's own 'off', and its own
//     'stop' names the scene (seq)
//   - a shot waits in black for this page's art at its place (the server holds it), then says 'go'
//   - the reel plays the next shot at the end of one; a tap on another switches to it; Next skips; Stop ends it
//   - any other key or touch hands the camera back where it is; the shot's time of day and weather are this screen's
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- a stand-in page -------------------------------------------------------------------------------------------------
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.style = {}; this.kids = []; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; this.dataset = {}; }
  append(...c) { this.kids.push(...c); } appendChild(c) { this.kids.push(c); return c; } addEventListener() {} setAttribute() {}
  querySelectorAll() { return []; } contains(e) { return e === this || this.kids.some((k) => k && k.contains && k.contains(e)); }
  blur() {} focus() {} scrollIntoView() {} remove() {} closest() { return null; } getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }
  set textContent(v) { this.kids = []; this._t = v; } get textContent() { return this._t || ''; }
  set innerHTML(v) { this._h = v; } get innerHTML() { return this._h || ''; }
}
const listeners = {};
let now = 1000;
globalThis.document = { createElement: (t) => new El(t), head: new El('head'), body: new El('body'), activeElement: null };
globalThis.addEventListener = (k, fn) => { (listeners[k] ||= []).push(fn); };
globalThis.localStorage = { getItem: () => null, setItem() {} };
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true });
const fire = (k, ev) => { for (const fn of listeners[k] || []) fn(ev); };

const { makeDirector, loopOf, shotsOf, moreOf, handsBack } = await import('../client/director.js');
const { SCENES, SCENE_LIST, SECTIONS, KEPT, viewScene } = await import('../shared/scenes/index.js');
const { TOD } = await import('../shared/scenes/shots.js');
const { camAt } = await import('../shared/scenes/index.js');

function page() {
  const sent = [], toasts = [];
  let warm = { ok: false, scrHave: 0, scr: 9 };
  const S = { cam: { x: 0, y: 0, zoom: 1, shake: 0 }, ents: new Map(), renderTick: 0, dev: true, map: null, me: null, wx: { stormForce: null }, art2: { warmth: () => warm } };
  const D = makeDirector(S, { input: {}, $: () => null, send: (m) => sent.push(m), selfPos: () => ({ x: 0, y: 0 }), size: () => [1280, 720], toast: (t) => toasts.push(t), grab() {} });
  const frame = (dt = 1 / 30, n = 1) => { for (let i = 0; i < n; i++) { now += dt * 1000; S.renderTick += dt * 20; D.cam(S.cam, dt, 0, 0); } };
  return { S, D, sent, toasts, frame, setWarm: (w) => { warm = w; } };
}
// the server's word that a shot began: its seq, the place's anchor 'here', held or not
const begin = (id, seq, held, tick0 = 0, here = [5000, 3000]) => ({ t: 'dscene', id, seq, tick0, cast: {}, anchors: { here: [...here, 0], start: [here[0], here[1], 0], end: [here[0] + 2000, here[1], 0], mid: [here[0] + 1000, here[1], 0], far: [here[0] + 3000, here[1], 0], p0: [...here, 0], p1: [...here, 0], p2: [...here, 0], p3: [...here, 0], in: [...here, 0], field: [...here, 0], shore: [...here, 0], door: [...here, 0], lot: [...here, 0], table: [...here, 0] }, bt: {}, held: held ? 1 : 0 });
const placeShots = SCENE_LIST.filter((q) => q.place.k === 'named' && !q.cast.length);

test('the shot list: the kept shots in their sections (Play all plays them), the rest under More; each 10-30 s with a camera move of its own', () => {
  assert.ok(SCENE_LIST.length >= 30, `${SCENE_LIST.length} shots`);
  assert.ok(KEPT.length >= 10 && KEPT.every((id) => SCENES[id]), 'about ten hero shots, every one a scene');
  assert.equal(shotsOf('').length, KEPT.length);
  assert.equal(shotsOf('').length + moreOf().length, SCENE_LIST.length);
  assert.ok(SECTIONS.filter(([g]) => shotsOf(g).length).length >= 5, 'kept shots across the sections');
  // the kept list's times of day: noon, golden hour, dusk and night each, and rain - never most of them at night
  const bands = KEPT.map((id) => TOD(SCENES[id].time));
  for (const b of ['day', 'golden hour', 'dusk', 'night']) assert.ok(bands.includes(b), `a ${b} shot kept`);
  assert.ok(bands.filter((b) => b === 'night').length <= KEPT.length / 3, `not all night: ${bands.join(', ')}`);
  assert.ok(KEPT.some((id) => SCENES[id].weather === 'rain'), 'a rain shot kept');
  for (const id of KEPT) assert.ok(!SCENES[id].note.includes('·') || SCENES[id].note.endsWith(TOD(SCENES[id].time)) || SCENES[id].note.includes(TOD(SCENES[id].time).split(' ')[0]) || /afternoon|noon|morning/.test(SCENES[id].note), `${SCENES[id].n}: says its time (${SCENES[id].note})`);
  for (const q of SCENE_LIST) {
    assert.ok(q.len >= 10 && q.len <= 31, `${q.n}: ${q.len} s`);
    assert.ok(q.note, `${q.n}: says what it is`);
    assert.ok(q.time !== undefined || q.tl, `${q.n}: its time of day`);
  }
  // a place shot's camera moves: it is somewhere else (or at another zoom) at the end than at the start
  for (const q of placeShots) {
    const ctx = { anchors: { here: { x: 0, y: 0, a: 0 } }, ent: () => null };
    const a = camAt(q, 0, ctx), b = camAt(q, q.len - 1.2, ctx);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 30 || Math.abs(a.z - b.z) > 0.2, `${q.n}: the camera moves`);
  }
});

test('a shot waits in black for the art at its place, then tells the server to go; its time and weather are this screen\'s', () => {
  const { D, S, sent, frame, setWarm } = page();
  const id = 'shotnightmarket', sc = SCENES[id];
  D.shot(id);
  assert.deepEqual(sent.at(-1), { t: 'dev', c: 'scene', id, hold: 1 });
  D.script(begin(id, 7, true));
  frame(1 / 30, 30);
  assert.ok(!sent.some((m) => m.k === 'go'), 'not while the art is still coming');
  assert.equal(D.mode, 'script');
  assert.ok(Math.abs(S.cam.x - 5000) < 700 && Math.abs(S.cam.y - 3000) < 700, `the camera on the shot's place (${S.cam.x}, ${S.cam.y})`);
  setWarm({ ok: true, scrHave: 9, scr: 9 });
  frame(1 / 30, 2);
  assert.deepEqual(sent.filter((m) => m.k === 'go'), [{ t: 'dev', c: 'scene', k: 'go', seq: 7 }]);
  assert.ok(Math.abs(D.lt - loopOf(sc.time)) < 1e-6, 'the shot\'s time of day');
  assert.equal(D.wx, 'clear');
});

test('switching shots: the old scene\'s end never takes the camera off the new one (no word back for the server\'s own off)', () => {
  const { D, S, sent, frame } = page();
  D.shot('shotnightmarket');
  D.script(begin('shotnightmarket', 1, false, 0, [1000, 1000]));
  frame(1 / 30, 20);
  D.shot('shotfog');   // (a tap on another shot mid-way)
  // what the server does: the old one ended ('afoot', then 'unwatch'), the new one begun
  D.script({ t: 'dscene', off: 1, seq: 1, why: 'stopped' });
  D.script({ t: 'dscene', off: 1, seq: 1 });
  D.script(begin('shotfog', 2, false, S.renderTick, [9000, 9000]));
  assert.ok(!sent.some((m) => m.k === 'unwatch' || m.k === 'stop'), `nothing sent back: ${JSON.stringify(sent.filter((m) => m.k))}`);
  // a late word about the old scene changes nothing either
  D.script({ t: 'dscene', off: 1, seq: 1 });
  frame(1 / 30, 40);
  assert.equal(D.mode, 'script');
  assert.ok(Math.hypot(S.cam.x - 9000, S.cam.y - 9000) < 800, `the camera on the new shot (${Math.round(S.cam.x)}, ${Math.round(S.cam.y)})`);
});

test('the reel: one after another, Next skips, a tap on a shot jumps there, Stop ends it and puts the screen back', async () => {
  const { D, sent, frame } = page();
  const ids = shotsOf('');
  const t0 = D.lt;
  D.play('');
  assert.equal(sent.at(-1).id, ids[0]);
  D.script(begin(ids[0], 1, false));
  frame(1 / 30, 5);
  D.script({ t: 'dscene', off: 1, seq: 1, why: 'done' });   // (its end)
  await new Promise((r) => setTimeout(r, 750));
  assert.equal(sent.at(-1).id, ids[1], 'the next one asked for');
  D.script(begin(ids[1], 2, false));
  D.next(1);
  assert.equal(sent.at(-1).id, ids[2], 'Next');
  D.script(begin(ids[2], 3, false));
  D.shot(ids[4]);
  assert.equal(sent.at(-1).id, ids[4], 'a tap on another');
  D.script(begin(ids[4], 4, false));
  D.next(1);
  assert.equal(sent.at(-1).id, ids[5], 'and on from there');
  D.script(begin(ids[5], 5, false));
  D.stop(true);
  assert.deepEqual(sent.at(-1), { t: 'dev', c: 'scene', k: 'stop', seq: 5 });
  assert.equal(D.mode, 'follow');
  assert.equal(D.lt, t0, 'the screen\'s own time back');
});

test('a shot that can\'t be set up here moves on (it never leaves the screen black)', () => {
  const { D, sent, frame } = page();
  const ids = shotsOf('');
  D.play('');
  frame(1 / 10, 130);   // (13 s: nothing from the server)
  assert.equal(sent.at(-1).id, ids[1]);
});

test('any other key or a touch hands the camera back where it is: the free camera; Esc back to you', () => {
  const { D, S, sent, frame } = page();
  assert.ok(handsBack('KeyW') && handsBack('Space') && !handsBack('KeyQ') && !handsBack('F2') && !handsBack('KeyN'));
  D.shot('shotfog');
  D.script(begin('shotfog', 3, false, 0, [7000, 2000]));
  frame(1 / 30, 30);
  const at = [S.cam.x, S.cam.y];
  D.key('KeyQ', true);
  assert.equal(D.mode, 'script', 'the zoom is the camera\'s own');
  D.key('KeyW', true);
  assert.equal(D.mode, 'drone');
  assert.deepEqual(sent.at(-1), { t: 'dev', c: 'scene', k: 'stop', seq: 3 });
  frame(1 / 30, 1);
  assert.ok(Math.hypot(S.cam.x - at[0], S.cam.y - at[1]) < 40, 'where it was');
  D.key('KeyW', false);
  // a touch on the world during a shot does the same; the panel's own buttons don't
  D.shot('shotrain');
  D.script(begin('shotrain', 4, false, S.renderTick, [7000, 2000]));
  frame(1 / 30, 5);
  assert.equal(D.wx, 'rain', 'the shot\'s weather');
  fire('pointerdown', { target: { closest: (q) => (q.includes('#cine-ctl') ? {} : null) }, pointerId: 1 });
  assert.equal(D.mode, 'script');
  fire('pointerdown', { target: { closest: () => null }, pointerId: 1, clientX: 0, clientY: 0 });
  assert.equal(D.mode, 'drone');
  D.key('Escape', true);
  assert.equal(D.mode, 'follow');
});

test('Stop while a shot is still being set up: when it comes, it\'s let go - the camera stays yours', () => {
  const { D, sent } = page();
  D.shot('shotgull');
  D.stop(true);
  D.script(begin('shotgull', 9, true));
  assert.deepEqual(sent.at(-1), { t: 'dev', c: 'scene', k: 'stop', seq: 9 });
  assert.equal(D.mode, 'follow');
});

// The owner, 11-14 20:21: "They're all the same nighttime scene" - a shot's time of day was put on the screen once, at its
// start; now it is the screen's every frame the shot plays: held in black, after 'go', through a time-lapse, between shots
// of a reel - whatever else set the screen's clock - unless he picks a time himself during it.
test('a shot shows exactly its own time and weather, every frame: held, playing, after anything resets the clock, into the next shot', () => {
  const { D, S, frame, setWarm } = page();
  const want = (id) => loopOf(SCENES[id].time);
  const ids = shotsOf('');
  const noon = ids.find((id) => TOD(SCENES[id].time) === 'day'), night = ids.find((id) => TOD(SCENES[id].time) === 'night'), rain = ids.find((id) => SCENES[id].weather === 'rain');
  D.play('', noon);
  D.script(begin(noon, 11, true));
  for (let k = 0; k < 20; k++) { frame(1 / 30); assert.ok(Math.abs(D.lt - want(noon)) < 1e-6, 'held: its time'); }
  setWarm({ ok: true, scrHave: 9, scr: 9 });
  frame(1 / 30, 3);
  D.script({ t: 'dscene', seq: 11, held: 0, tick0: S.renderTick });
  D.lt = null; D.ti = 0;   // (anything that puts the world's own hour back: the panel's Live, a stray reset)
  frame(1 / 30, 1);
  assert.ok(Math.abs(D.lt - want(noon)) < 1e-6, 'its time again the next frame');
  assert.equal(D.wx, 'clear');
  // the next shot of the reel: its own time from its first frame (never the world's between them)
  D.shot(night);
  assert.ok(D.lt !== null, 'never the world\'s hour while the next is coming');
  D.script(begin(night, 12, false, S.renderTick));
  frame(1 / 30, 2);
  assert.ok(Math.abs(D.lt - want(night)) < 1e-6, 'the night shot\'s time');
  D.shot(rain);
  D.script(begin(rain, 13, false, S.renderTick));
  frame(1 / 30, 2);
  assert.equal(D.wx, 'rain', 'its weather');
  // a time-lapse runs its clock on through the shot
  const tl = SCENE_LIST.find((q) => q.tl);
  D.shot(tl.id);
  D.script(begin(tl.id, 14, false, S.renderTick));
  frame(1 / 30, 3);
  const a = D.lt;
  frame(1 / 10, 60);
  assert.ok(D.lt > a, 'the time-lapse on');
  D.stop(true);
});

test('a shot keeps every roof drawn (no cutaway flicker as its camera passes over buildings) - but an interior shot lifts its roof', () => {
  const { D, frame } = page();
  assert.equal(D.roofAt(), null, 'your own camera: as ever');
  D.shot('shotmarina');
  D.script(begin('shotmarina', 21, false));
  frame(1 / 30, 3);
  assert.equal(D.roofAt(), false, 'a shot: no roof lifted');
  D.shot('shotpool');
  D.script(begin('shotpool', 22, false));
  frame(1 / 30, 3);
  assert.ok(D.roofAt() && Number.isFinite(D.roofAt().x), 'the pool shot inside the bar');
  D.stop(true);
  assert.equal(D.roofAt(), null);
});

test('saved views: where the camera is, the time and the weather saved to the server; listed, gone to, played as a shot', () => {
  const { D, S, sent, frame } = page();
  S.loopTime = loopOf(720); S.weather = 0;
  D.views({ t: 'views', list: [], can: true });
  const cur = D.curView();
  assert.deepEqual([cur.x, cur.y, cur.t, cur.w], [0, 0, 720, 'clear']);
  // it's the screen's own hour when the camera panel has set one
  D.shot('shotboardwalk');
  D.script(begin('shotboardwalk', 31, false, S.renderTick, [4000, 2500]));
  frame(1 / 30, 10);
  const v = D.curView();
  assert.equal(v.t, SCENES.shotboardwalk.time, 'the shot\'s time');
  assert.ok(Math.abs(v.x - S.cam.x) <= 1 && Math.abs(v.y - S.cam.y) <= 1);
  D.stop(true);
  const saved = { id: 'vabc', n: 'Pier at golden hour', note: 'push in on the wheel', x: 4100, y: 2600, z: 1.2, t: 1110, w: 'rain' };
  D.views({ t: 'views', list: [saved], can: true });
  assert.equal(D.viewList().length, 1);
  D.goView(saved);
  assert.equal(D.mode, 'drone');
  frame(1 / 30, 1);
  assert.ok(Math.hypot(S.cam.x - 4100, S.cam.y - 2600) < 2, 'the free camera there');
  assert.ok(Math.abs(D.lt - loopOf(1110)) < 1e-6 && D.wx === 'rain' && Math.abs(D.zoomK - 1.2) < 1e-6, 'its time, weather and zoom');
  D.playView(saved);
  assert.deepEqual(sent.at(-1), { t: 'dev', c: 'scene', view: 'vabc', hold: 1 });
  D.script({ ...begin('view', 32, false, S.renderTick, [4100, 2600]), view: saved });
  frame(1 / 30, 5);
  assert.equal(D.mode, 'script');
  assert.ok(Math.abs(D.lt - loopOf(1110)) < 1e-6, 'played at its time');
  assert.ok(Math.hypot(S.cam.x - 4100, S.cam.y - 2600) < 60, 'and its place');
  const sc = viewScene(saved);
  assert.ok(sc.cam[0].z[1] > sc.cam[0].z[0], 'pushing in slowly');
  D.stop(true);
});
