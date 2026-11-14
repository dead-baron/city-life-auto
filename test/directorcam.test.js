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

const { makeDirector, loopOf, shotsOf, handsBack } = await import('../client/director.js');
const { SCENES, SCENE_LIST, SECTIONS } = await import('../shared/scenes/index.js');
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

test('the shot list: every section has shots, 30 or more in all, each 10-30 s with a camera move of its own', () => {
  assert.ok(SCENE_LIST.length >= 30, `${SCENE_LIST.length} shots`);
  for (const [g, n] of SECTIONS) assert.ok(shotsOf(g).length >= 4, `${n}: ${shotsOf(g).length}`);
  assert.equal(shotsOf('').length, SCENE_LIST.length);
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
  const ids = shotsOf('city');
  const t0 = D.lt;
  D.play('city');
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
  const ids = shotsOf('coast');
  D.play('coast');
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
