// The touch controls by slots (UI-2, the overhaul the owner approved on 2026-10-24; the aim stick kept - the owner, the
// same day): the slots' contents come from shared/controls.js's touch half for every state, each action has its
// button and its binding, the geometry keeps every slot and the aim stick's ring apart, 44 px or more, out of the move
// stick's left 40% and the middle on every screen; the stick aims without firing, pushed into its red ring it fires
// while FIRE ON is on (off, it doesn't), a tap of FIRE fires where the stick aims or at the auto-target
// (shared/touchcontrols.js touchAim) - in a real page too (test/hudpage.js measureDrag) - and the aim angle and the
// fire bits go out on the wire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOUCH_STATES, TOUCH_SLOTS, touchSlots, touchState, touchAim, pickTarget, AIM_KEEP_MS } from '../shared/touchcontrols.js';
import { IN, quantizeAngle, touchStick } from '../shared/input.js';
import { encodeInput, decodeInput } from '../shared/protocol.js';
import { slotGeometry, GEO, iconOf } from '../client/touchslots.js';
import { findChrome, measureDrag } from './hudpage.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('each state fills the slots with what it needs, from shared/controls.js (its touch half)', () => {
  assert.match(read('shared/controls.js'), /shared\/touchcontrols\.js/, 'controls.js names its touch half');
  const st = (f) => touchSlots(f), acts = (f) => Object.fromEntries(Object.entries(st(f).slots).filter(([k]) => k !== 'stick' && k !== 'u4').map(([k, v]) => [k, `${v.a}:${v.label}`]));   // (the stick and FIRE ON: below)
  assert.deepEqual(acts({}), { fire: 'fire:HIT', roll: 'dive:ROLL', act: 'action:ACT', car: 'vehicle:CAR' }, 'on foot, fists: no BLOCK without a guard, nothing in the bag, no light, no cop car');
  assert.equal(acts({ items: true }).u1, 'use:ITEMS', 'ITEMS with something in the bag');
  assert.equal(acts({ guard: true, light: true, call: true }).c1, 'block:BLOCK');
  assert.deepEqual(acts({ armed: true, light: true, items: true }), { fire: 'fire:FIRE', roll: 'dive:ROLL', act: 'action:ACT', car: 'vehicle:CAR', c2: 'reload:RELOAD', u1: 'use:ITEMS', u2: 'light:LIGHT' }, 'armed');
  assert.equal(acts({ carrying: true, armed: true }).fire, 'throw:THROW', 'a crate: THROW in FIRE\'s slot');
  assert.deepEqual(acts({ inVeh: true, driver: true, items: true }), { roll: 'dive:BRAKE', car: 'vehicle:EXIT', c1: 'horn:HORN', u1: 'use:ITEMS' }, 'at the wheel, unarmed: no FIRE, no ACT with nothing to do');
  assert.deepEqual(acts({ inVeh: true, driver: true, armed: true, shoot: true, prompt: true, siren: true, items: true }), { fire: 'fire:FIRE', roll: 'dive:BRAKE', act: 'action:ACT', car: 'vehicle:EXIT', c1: 'horn:SIREN', c2: 'reload:RELOAD', u1: 'use:ITEMS' }, 'a police car, a gun');
  assert.deepEqual(acts({ air: true, inVeh: true, driver: true, items: true }), { car: 'vehicle:EXIT', c1: 'descend:DOWN', c2: 'climb:CLIMB', u1: 'use:ITEMS' }, 'flying: the rocker');
  assert.equal(acts({ inVeh: true, driver: true, horse: true }).c1, 'sprint:GALLOP');
  assert.equal(acts({ inVeh: true, driver: true, horse: true }).car, 'vehicle:OFF');
  assert.deepEqual(acts({ board: true, items: true }), { fire: 'fire:TRICK', roll: 'dive:OLLIE', act: 'action:ACT', car: 'vehicle:OFF', u1: 'use:ITEMS' });
  assert.deepEqual(acts({ swim: true, armed: true, items: true }), { act: 'action:ACT', car: 'vehicle:CAR', u1: 'use:ITEMS' }, 'swimming: no FIRE, no ROLL');
  assert.equal(touchState({ inVeh: true, driver: true, boat: true }), 'boat');
  assert.equal(touchState({ inVeh: true }), 'ride');
  // the weapon button (UI-6): in WP whenever the page has something to switch (wpn), in every state but at home
  for (const f of [{}, { armed: true }, { carrying: true }, { inVeh: true, driver: true }, { air: true, inVeh: true }, { swim: true }, { board: true }]) assert.equal(acts({ ...f, wpn: true }).wp, 'nextw:WEAPON', JSON.stringify(f));
  assert.equal(acts({ armed: true }).wp, undefined, 'none with nothing to switch');
  assert.equal(acts({ home: true, wpn: true }).wp, undefined, 'none at home');
  assert.equal(touchState({ home: true, armed: true }), 'home');
  // fishing (UI-7, the owner 2026-10-26: "Fishing UI is hidden behind the weapons selection button"): a line out, only
  // ACT (cast, strike, reel) - the right-hand side clear for the fight's meter - whatever else you have, on foot or in a boat
  for (const f of [{}, { armed: true, guard: true, items: true, light: true, call: true, wpn: true }, { inVeh: true, driver: true, boat: true, shoot: true, wpn: true }]) {
    assert.equal(touchState({ ...f, fish: true }), 'fish', JSON.stringify(f));
    assert.deepEqual(touchSlots({ ...f, fish: true, prompt: true }).slots, { act: { a: 'action', label: 'ACT' } }, JSON.stringify(f));
  }
  assert.equal(touchState({ home: true, fish: true }), 'home');
  // the aim stick and FIRE ON beside it in every state but at home and fishing
  for (const [state, slots] of Object.entries(TOUCH_STATES)) {
    const none = state === 'home' || state === 'fish';
    assert.equal(!!slots.stick, !none, `${state}: the aim stick`);
    assert.equal(slots.u4 && slots.u4[0], none ? undefined : 'firetog', `${state}: FIRE ON with it`);
  }
  // the same role always in the same slot, in every state
  const slotOf = {};
  for (const [state, slots] of Object.entries(TOUCH_STATES)) for (const [slot, [a]] of Object.entries(slots)) {
    assert.ok(TOUCH_SLOTS.includes(slot), `${state}: ${slot} is a slot`);
    const role = a === 'throw' && slot === 'fire' ? 'fire' : a;
    if (slotOf[role]) assert.equal(slotOf[role], slot, `${a} sits in ${slotOf[role]} (${state}: ${slot})`);
    slotOf[role] = slot;
  }
});

test('every action a slot can hold has its button, its binding, its icon and a README row', () => {
  const html = read('index.html'), inp = read('client/input.js'), readme = read('README.md');
  const tb = html.slice(html.indexOf('<div id="tbtns">'), html.indexOf('<div id="interior"'));
  for (const a of new Set(Object.values(TOUCH_STATES).flatMap((s) => Object.values(s).map((e) => e[0])))) {
    // (the weapon button: the HUD's weapon plate, placed in its slot on touch - UI-6)
    if (a === 'nextw') assert.match(html, /<div id="weapon">/, 'the weapon plate for nextw');
    else assert.match(tb, new RegExp(`data-b="${a}"`), `a #tbtns button for ${a}`);
    assert.notEqual(iconOf(a, ''), undefined);
  }
  // held: FIRE, BLOCK, GALLOP, CLIMB / DOWN; the aim stick with its ring and the FIRE ON toggle and setting as before
  assert.match(tb, /<div id="stick-r" class="stick" data-b="stick"><div class="ring"><\/div>/);
  assert.match(tb, /<button data-b="firetog" id="firetog" class="lit"[^>]*>FIRE ON<\/button>/);
  assert.match(inp, /settings = \{[^}]*touchEdgeFire: true/, 'the ring fires by default');
  assert.match(inp, /name === 'firetog'\) \{ settings\.touchEdgeFire = !settings\.touchEdgeFire; saveSettings\(\); input\.showFireToggle\(\);/);
  assert.match(read('client/main.js'), /settings\.touchEdgeFire = e\.target\.checked; saveSettings\(\); input\.showFireToggle\?\.\(\)/);
  assert.match(html, /id="s-edgefire"/);
  assert.doesNotMatch(inp, /delete settings\.touchEdgeFire/, 'a kept setting stays');
  assert.match(inp, /tb\.has\('block'\)/); assert.match(inp, /tb\.has\('sprint'\)/); assert.match(inp, /tb\.has\('climb'\)/);
  assert.doesNotMatch(tb, /data-b="aim"/, 'no AIM button: the stick aims');
  assert.doesNotMatch(read('client/style.css'), /#tbtns \.\w+ \{[^}]*right: calc/, 'no per-button calc() offsets: the slots place them');
  const touchCol = readme.split('\n').filter((l) => /^\| (Aim|Fire \/ punch|Block)/.test(l)).map((l) => l.split('|').slice(-2, -1)[0]);
  assert.ok(touchCol.length >= 3 && touchCol.every((c) => /aim stick|FIRE|BLOCK/i.test(c) && !/drag FIRE|drag it/i.test(c)), `the README's Touch column: ${touchCol}`);
});

// every phone and tablet size, both ways round, with and without safe areas
const SIZES = [[844, 390], [740, 360], [667, 375], [932, 430], [1024, 768], [1280, 720], [390, 844], [360, 780], [375, 667], [430, 932], [768, 1024]];
test('the slots: apart, 44 px or more, out of the left 40% and the middle, upright right of the middle, inside the safe areas', () => {
  const on = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  const bad = [];
  // (the safe areas a phone with a notch has: on its side both edges and the home bar, upright the top and the home bar)
  for (const [W, H] of SIZES) for (const safe of [{}, H > W ? (H >= 780 ? { t: 47, b: 34 } : {}) : W >= 800 && H < 500 ? { r: 47, b: 21, l: 47 } : {}]) {
    const g = slotGeometry(W, H, safe), tag = `${W}x${H} ${JSON.stringify(safe)}`, ks = Object.keys(g).filter((k) => k !== 'rk');
    const mid = { x: W / 2 - W / 6, y: H / 2 - H / 8, w: W / 3, h: H / 4 };
    for (const [i, a] of ks.entries()) for (const b of ks.slice(i + 1)) if (on(g[a], g[b])) bad.push(`${tag}: ${a} on ${b}`);
    for (const k of Object.keys(g)) {
      const b = g[k];
      if (b.w < 44 || b.h < (k === 'rk' ? 88 : 44)) bad.push(`${tag}: ${k} ${b.w}x${b.h}`);
      if (b.x < W * 0.4) bad.push(`${tag}: ${k} in the left 40%`);
      if (H > W && b.x < W / 2) bad.push(`${tag}: ${k} left of the middle`);
      if (on(b, mid) && !(H > W && H < 740)) bad.push(`${tag}: ${k} over the middle`);   // (an old 667 px phone upright: no room under the middle for all of it)
      if (b.x + b.w > W - (safe.r || 0) || b.y + b.h > H - (safe.b || 0) || b.y < (safe.t || 0)) bad.push(`${tag}: ${k} outside the safe area`);
    }
    // the rocker in C1 / C2's stead (they're never shown with it), clear of what shows in the air (the stick, FIRE, ACT, CAR, ITEMS, FIRE ON)
    for (const k of ['stick', 'fire', 'act', 'car', 'u1', 'u4']) if (on(g.rk, g[k])) bad.push(`${tag}: the rocker on ${k}`);
  }
  assert.deepEqual(bad, [], bad.slice(0, 20).join('\n'));
  assert.deepEqual(Object.keys(GEO.land).sort(), Object.keys(GEO.port).sort());
});

test('the aim stick aims without firing, its ring fires with FIRE ON (not with it off); FIRE taps where it aims, else at the auto-target', () => {
  // the stick itself (as before UI-2): a fifth of the way out it aims; into the ring it fires, only with FIRE ON
  assert.deepEqual(touchStick(0.5, false, true), { firing: false, aiming: true, guard: true }, 'short of the ring: aims (and guards)');
  assert.deepEqual(touchStick(0.95, false, true), { firing: true, aiming: true, guard: false }, 'into the ring, FIRE ON: fires');
  assert.equal(touchStick(0.85, true, true).firing, true, 'stays firing just inside the edge');
  assert.deepEqual(touchStick(1, false, false), { firing: false, aiming: true, guard: true }, 'FIRE OFF: never fires');
  const view = (o = {}) => ({ lastAim: 0.25, face: 0.5, armed: true, inVehicle: false, target: () => 1.2, ...o });
  const t = (o = {}) => ({ fire: false, stick: null, ring: false, last: 0, lastAt: -1e9, ...o });
  const now = 10000;
  let r = touchAim(t({ stick: 2 }), view(), now);
  assert.deepEqual(r, { bits: IN.AIMING, aim: 2 }, 'the stick held: its angle, no fire');
  r = touchAim(t({ stick: 2, ring: true }), view(), now);
  assert.deepEqual(r, { bits: IN.AIMING | IN.FIRE, aim: 2 }, 'into the ring (FIRE ON): fires that way');
  r = touchAim(t({ stick: 2, fire: true }), view(), now);
  assert.deepEqual(r, { bits: IN.AIMING | IN.FIRE, aim: 2 }, 'FIRE with the stick held: where it aims, not the auto-target');
  r = touchAim(t({ fire: true }), view(), now);
  assert.equal(r.bits, IN.FIRE | IN.AIMING); assert.equal(r.aim, 1.2, 'a tap alone: at the auto-target');
  r = touchAim(t({ fire: true }), view({ target: () => null }), now);
  assert.equal(r.bits, IN.FIRE, 'nobody to aim at on foot: it fires where you face (the server takes ped.a)');
  r = touchAim(t({ fire: true }), view({ target: () => null, inVehicle: true }), now);
  assert.equal(r.bits, IN.FIRE | IN.AIMING); assert.equal(r.aim, 0.5, 'a drive-by needs an aim: straight ahead');
  r = touchAim(t({ last: -2, lastAt: now - AIM_KEEP_MS / 2 }), view(), now);
  assert.deepEqual(r, { bits: IN.AIMING, aim: -2 }, 'the stick let go: the aim stays a moment with a gun out, no fire');
  r = touchAim(t({ fire: true, last: -2, lastAt: now - AIM_KEEP_MS / 2 }), view(), now);
  assert.equal(r.aim, -2, 'and FIRE straight after uses it');
  r = touchAim(t({ last: -2, lastAt: now - AIM_KEEP_MS * 2 }), view(), now);
  assert.equal(r.bits, 0, 'then nothing');
  // golf, hoops, bowling: no auto-target (client/touchslots.js target) - the swing keeps its aim (at the flag) unless the stick aims it
  r = touchAim(t({ fire: true }), view({ armed: false, target: () => null }), now);
  assert.deepEqual(r, { bits: IN.FIRE, aim: 0.25 });
  r = touchAim(t({ fire: true, stick: 1 }), view({ armed: false, target: () => null }), now);
  assert.deepEqual(r, { bits: IN.FIRE | IN.AIMING, aim: 1 }, 'the stick aims the swing, as before');
  // and on the wire: the bits and the angle as sent
  const d = decodeInput(new DataView(encodeInput(7, IN.FIRE | IN.AIMING, 0, 0, quantizeAngle(-2))));
  assert.equal(d.bits, IN.FIRE | IN.AIMING);
  assert.ok(Math.abs(Math.atan2(Math.sin(d.aim + 2), Math.cos(d.aim + 2))) < 0.001, 'the angle sent');
});

test('the auto-target: the nearest person ahead in reach, all round at the wheel, never you, your crew, the down or aboard', () => {
  const P = (id, x, y, flags = 0) => ({ kind: 1, id, rx: x, ry: y, flags });
  const ents = [P(1, 0, 0), P(2, 100, 10), P(3, 60, -200), P(4, -80, 0), P(5, 50, 0, 1), P(6, 30, 30), P(7, 20, 0, 256), { kind: 2, id: 8, rx: 40, ry: 0, flags: 0 }];
  assert.equal(pickTarget(0, 0, 0, ents, 300, 1, [6, 7]), Math.atan2(10, 100), 'ahead: 2 (5 is down, 6 crew, 3 off the cone, 8 a car)');
  assert.equal(pickTarget(0, 0, 0, ents, 300, 1, [6]), 0, 'on foot a driver in front counts');
  assert.equal(pickTarget(0, 0, Math.PI, ents, 300, 1), Math.atan2(0, -80), 'behind you, facing back: 4');
  assert.equal(pickTarget(0, 0, 0, ents, 50, 1, [6, 7]), null, 'out of reach');
  assert.equal(pickTarget(0, 0, null, ents, 300, 1, [6]), Math.atan2(0, -80), 'at the wheel all round - not 7 in the car with you');
});

test('the aim stick and FIRE in a real page: the stick aims without firing, its ring fires with FIRE ON and not with it off, FIRE taps', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const r = await measureDrag();
  const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.01;
  assert.equal(r.aim.bits & (IN.FIRE | IN.AIMING), IN.AIMING, 'short of the ring: aimed, not firing'); assert.ok(near(r.aim.aim, Math.PI / 2), `its way (${r.aim.aim})`);
  assert.equal(r.ring.bits & (IN.FIRE | IN.AIMING), IN.FIRE | IN.AIMING, 'into the ring with FIRE ON: fires'); assert.ok(near(r.ring.aim, Math.atan2(-1, -1)));
  assert.ok(!(r.ringAfter.bits & IN.FIRE), 'let go: no more');
  assert.deepEqual(r.toggle, { on: false, label: 'FIRE OFF' }, 'the toggle: off, and says so');
  assert.equal(r.ringOff.bits & (IN.FIRE | IN.AIMING), IN.AIMING, 'FIRE OFF: the ring only aims');
  assert.equal(r.fireStick.bits & (IN.FIRE | IN.AIMING), IN.FIRE | IN.AIMING); assert.ok(near(r.fireStick.aim, -Math.PI / 2), 'FIRE with the stick held: where it aims');
  assert.equal(r.tap.bits & (IN.FIRE | IN.AIMING), IN.FIRE | IN.AIMING, 'a tap alone fires, aimed'); assert.ok(near(r.tap.aim, 1), 'at the auto-target');
  assert.ok(!(r.tapAfter.bits & IN.FIRE), 'and stops');
  assert.equal(r.tapNone.bits & (IN.FIRE | IN.AIMING), IN.FIRE, 'nobody about: it fires where you face');
});
