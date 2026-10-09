// Sound (client/sound/): the parts that run without a browser - the settings and how they're saved, what's
// underfoot, the voice pool's limits and priorities, where a sound sits, and the table of what every server event
// sounds like (it must know every kind the server emits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { T } from '../shared/constants.js';
import { SOUND_DEFAULTS, soundPrefs, setSoundPref, busGains, COMP } from '../client/sound/mixer.js';
import { SURFACES, STEP, surfaceOf, surfaceAt, woodsOf, woodsAt } from '../client/sound/surface.js';
import { VoicePool, spatial, RateLimit, PRI, Budget, BUDGET } from '../client/sound/pool.js';
import { TRIM_DB } from '../client/sound/levels.js';
import { loopSeam } from '../client/sound/engine.js';
import { eventHeard, VOICES } from '../client/sound/index.js';
import { EVENT_SOUNDS, gunSound, meleeHit, propSound } from '../client/sound/events.js';
import { INSTR, LEGACY } from '../client/sound/instruments.js';
import { SONGS } from '../client/sound/music.js';
import { ENGINE_CLASS } from '../client/sound/vehicles.js';
import { VEHICLES } from '../shared/vehicles.js';
import { WEAPONS } from '../shared/items.js';
import { closure } from '../tools/perf.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

test('the sound settings: their defaults, a bad or missing value as its default, and saved with the other settings', () => {
  assert.deepEqual(soundPrefs({}), { ...SOUND_DEFAULTS });
  assert.deepEqual(soundPrefs(null), { ...SOUND_DEFAULTS });
  assert.equal(SOUND_DEFAULTS.on, true); assert.equal(SOUND_DEFAULTS.music, true);
  for (const k of ['master', 'sfx', 'amb', 'mus']) assert.ok(SOUND_DEFAULTS[k] > 0 && SOUND_DEFAULTS[k] <= 1, `${k} starts audible`);
  const odd = soundPrefs({ sound: { master: 3, on: 'yes', sfx: NaN, amb: 0.3, mus: -1, music: false } });
  assert.equal(odd.master, 1, 'clamped'); assert.equal(odd.on, true, 'not a boolean: the default'); assert.equal(odd.sfx, SOUND_DEFAULTS.sfx);
  assert.equal(odd.amb, 0.3); assert.equal(odd.mus, 0); assert.equal(odd.music, false);
  // changing one saves the lot, under settings.sound, as client/input.js keeps them (JSON in localStorage)
  const settings = { kbDrive: 'tank' };
  let saves = 0;
  const save = () => { saves++; };
  setSoundPref(settings, 'master', 0.5, save);
  setSoundPref(settings, 'music', false, save);
  assert.equal(saves, 2);
  assert.equal(settings.kbDrive, 'tank', 'the other settings are left alone');
  const back = JSON.parse(JSON.stringify(settings));
  assert.deepEqual(soundPrefs(back), { ...SOUND_DEFAULTS, master: 0.5, music: false });
  assert.equal(setSoundPref(settings, 'nonsense', 1, save), null, 'not a setting');
  assert.equal(saves, 2, 'nothing saved for it');
  // the buses: off silences the master, music off the music; a slider is squared (even loudness along it)
  assert.equal(busGains({ ...SOUND_DEFAULTS, on: false }).master, 0);
  assert.equal(busGains({ ...SOUND_DEFAULTS, music: false }).mus, 0);
  assert.ok(Math.abs(busGains({ ...SOUND_DEFAULTS, master: 0.5 }).master - 0.25) < 1e-9);
});

test('footsteps: the surface from the map tile, the woods, and a sound for every surface', () => {
  const want = { [T.ROAD]: 'asphalt', [T.LOT]: 'asphalt', [T.SIDEWALK]: 'pavement', [T.PLAZA]: 'pavement', [T.GRASS]: 'grass', [T.FIELD]: 'grass', [T.DIRT]: 'dirt', [T.SAND]: 'sand', [T.DOCK]: 'wood', [T.BRIDGE]: 'metal', [T.WATER]: 'water', [T.DEEP]: 'deep', [T.FLOOR]: 'floor', [T.COUNTER]: 'floor' };
  for (const [t, s] of Object.entries(want)) assert.equal(surfaceOf(Number(t)), s, `tile ${t}`);
  for (const t of Object.values(T)) assert.ok(SURFACES.includes(surfaceOf(t)), `tile ${t} has a surface`);
  assert.equal(surfaceOf(T.GRASS, true), 'asphalt', 'up on the highway deck');
  for (const s of SURFACES) assert.ok(STEP[s], `${s} sounds like something`);
  // on a map
  const map = { tileAtPx: (x) => (x < 100 ? T.GRASS : x < 200 ? T.DOCK : T.ROAD), districtAt: (x, y) => ({ style: y < 100 ? 'wild' : 'commercial' }) };
  assert.equal(surfaceAt(map, 50, 0), 'grass'); assert.equal(surfaceAt(map, 150, 0), 'wood'); assert.equal(surfaceAt(map, 250, 0), 'asphalt');
  assert.equal(woodsAt(map, 50, 50), true, 'grass in the wild: the woods');
  assert.equal(woodsAt(map, 50, 500), false, 'a lawn in town is not');
  assert.equal(woodsAt(map, 250, 50), false, 'nor the road through the woods');
  assert.equal(woodsOf(T.DIRT, 'park'), true); assert.equal(woodsOf(T.DIRT, 'desert'), false); assert.equal(woodsOf(T.SAND, 'wild'), false);
});

test('the voice pool: never more than its voices; a weaker sound waits, a stronger one takes the weakest voice', () => {
  const pool = new VoicePool(4);
  for (let i = 0; i < 4; i++) assert.ok(pool.acquire(PRI.NORMAL, 0.5, 0, 1) >= 0);
  assert.equal(pool.active(0), 4);
  assert.equal(pool.acquire(PRI.AMBIENT, 1, 0.1, 1), -1, 'a footstep never cuts off the usual');
  assert.equal(pool.active(0.1), 4);
  pool.pri[2] = PRI.MINOR;   // one of them is a small sound
  const i = pool.acquire(PRI.MAJOR, 1, 0.2, 1);
  assert.equal(i, 2, 'an explosion takes the weakest voice');
  assert.equal(pool.stolen, true);
  assert.equal(pool.active(0.2), 4, 'still only four');
  // among equals, the quietest goes
  const q = new VoicePool(3);
  q.acquire(PRI.NORMAL, 0.9, 0, 1); q.acquire(PRI.NORMAL, 0.1, 0, 1); q.acquire(PRI.NORMAL, 0.6, 0, 1);
  assert.equal(q.acquire(PRI.NORMAL, 0.95, 0.01, 1), 1);
  assert.equal(q.acquire(PRI.NORMAL, 0.05, 0.02, 1), -1, 'a quieter one than all of them waits');
  // finished sounds free their voices
  let freed = 0;
  q.reap(5, () => { freed++; });
  assert.equal(freed, 3); assert.equal(q.active(5), 0);
  assert.ok(q.acquire(PRI.AMBIENT, 0.1, 5, 1) >= 0);
  assert.equal(q.stolen, false);
  // UI over everything
  const u = new VoicePool(1); u.acquire(PRI.MAJOR, 1, 0, 1);
  assert.ok(u.acquire(PRI.UI, 0.1, 0, 1) >= 0, 'the menus are always heard');
});

test('where a sound sits: louder and brighter close by, panned to its side, silent past its range; rate limits', () => {
  const o = {};
  spatial(0, 0, 1000, o); assert.equal(o.gain, 1); assert.equal(o.pan, 0);
  const near = spatial(200, 0, 1000, {}), far = spatial(800, 0, 1000, {});
  assert.ok(near.gain > far.gain && far.gain > 0);
  assert.ok(near.lp > far.lp, 'far sounds lose their highs');
  assert.ok(spatial(-300, 0, 1000, {}).pan < 0 && spatial(300, 0, 1000, {}).pan > 0);
  assert.equal(spatial(0, 1200, 1000, {}).gain, 0);
  const r = new RateLimit();
  assert.equal(r.ok('shot', 0.05, 0), true); assert.equal(r.ok('shot', 0.05, 0.01), false); assert.equal(r.ok('shot', 0.05, 0.06), true);
  assert.equal(r.ok('door', 0.05, 0.01), true, 'per name');
});

// every kind of event the server emits ({ e: '<kind>' } in server/ and shared/)
function emittedKinds() {
  const kinds = new Set();
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) for (const m of readFileSync(p, 'utf8').matchAll(/(?:^|[^a-zA-Z0-9_$])e:\s*'([a-zA-Z_]+)'/g)) kinds.add(m[1]);
    }
  };
  walk(join(ROOT, 'server')); walk(join(ROOT, 'shared'));
  return kinds;
}

test('every event the server emits has its sound (or is marked as data), and every sound it plays exists', () => {
  const kinds = emittedKinds();
  assert.ok(kinds.size > 50, `found the server's events (${kinds.size})`);
  const missing = [...kinds].filter((k) => !Object.prototype.hasOwnProperty.call(EVENT_SOUNDS, k));
  assert.deepEqual(missing, [], `events with no sound (client/sound/events.js EVENT_SOUNDS): ${missing.join(', ')}`);
  // play every one with a plausible event, through a stand-in for the engine: no throw, and only real recipes
  const map = {
    props: [{ t: 'hydrant', x: 10, y: 10, lit: 1 }, { t: 'vend_soda', x: 20, y: 20 }], homes: [{ garageDoor: { x: 1, y: 1 } }], bays: [{ tx: 1, ty: 1, tw: 2, th: 2 }],
    gates: [{ x: 1, y: 1 }], cameras: [{ x: 1, y: 1 }], rail: { crossings: [{ x: 1, y: 1 }] }, forage: [{ x: 1, y: 1 }],
    tileAtPx: () => T.ROAD, districtAt: () => ({ style: 'commercial' }),
  };
  const S = { map, ents: new Map([[1, { id: 1, kind: 1, rx: 100, ry: 100, extra: 7 }]]), myPedId: 1, loopClock: 10 };
  const played = [];
  const A = { S, at: (n) => played.push(n), ui: (n) => played.push(n), mute: () => {}, surf: () => 'pavement' };
  const base = { x: 100, y: 100, x1: 100, y1: 100, x2: 300, y2: 120, w: WEAPONS.shotgun.i, p: 0.7, r: 110, n: 3, i: 0, id: 1, home: 0, lit: 1, a: 0.5, s: 2, in: 1, sw: 1, up: 0, k: 'stab', tone: 'good', text: 'hi', g: 1 };
  for (const k of Object.keys(EVENT_SOUNDS)) {
    const fn = EVENT_SOUNDS[k];
    if (fn === null) continue;
    assert.equal(typeof fn, 'function', k);
    assert.doesNotThrow(() => fn({ ...base, e: k }, A), k);
  }
  assert.ok(played.length > 60);
  for (const n of played) assert.ok(INSTR[n], `"${n}" is a recipe (client/sound/instruments.js)`);
  // the guns, the blades and the props each pick one
  for (const w of Object.values(WEAPONS)) { assert.ok(INSTR[gunSound(w)]); assert.ok(INSTR[meleeHit(w)]); }
  for (const t of ['hydrant', 'tree_oak', 'bench', 'cone', 'lamp', 'trash', 'atm', 'mystery']) for (const n of propSound(t)) assert.ok(INSTR[n], t);
});

test('main.js\'s own sfx names all still sound (or now come from the frame), and every recipe is well formed', () => {
  const src = readFileSync(join(ROOT, 'client/main.js'), 'utf8');
  const names = new Set([...src.matchAll(/sfx\('([a-z]+)'/g)].map((m) => m[1]));
  for (const m of src.matchAll(/sfx\([^)]*\? '([a-z]+)' : '([a-z]+)'/g)) { names.add(m[1]); names.add(m[2]); }
  assert.ok(names.size > 20);
  for (const n of names) {
    const to = n in LEGACY ? LEGACY[n] : n;
    assert.ok(to === null || INSTR[to], `sfx('${n}')`);
  }
  for (const [n, I] of Object.entries(INSTR)) {
    assert.equal(typeof I.play, 'function', n);
    assert.ok(I.pri === undefined || (I.pri >= PRI.AMBIENT && I.pri <= PRI.UI), `${n}: a priority`);
  }
});

test('every vehicle has an engine class, every song is whole, and the sound stays out of the page\'s first load', () => {
  for (const id of Object.keys(VEHICLES)) assert.ok(ENGINE_CLASS[id], `${id}: its engine`);
  for (const [name, s] of Object.entries(SONGS)) {
    if (s.lead) assert.equal(s.lead.notes.length, s.steps * s.bars, `${name}: a note per step`);
    for (const pat of Object.values(s.drums || {})) assert.equal(s.steps % pat.length, 0, `${name}: drum bars`);
  }
  const page = closure(['client/main.js']);
  assert.ok(page.includes('client/audio.js'), 'the front is in the page');
  assert.ok(!page.some((f) => f.startsWith('client/sound/')), 'client/sound/ loads later (a dynamic import)');
});

test('the voice pool: yours is never cut off, the background never cuts anything off and keeps to its share', () => {
  // yours: a sound that matters can't take your voice, even when yours is the quietest
  const p = new VoicePool(3);
  const mine = p.acquire(PRI.MINOR, 0.05, 0, 1, true);
  p.acquire(PRI.NORMAL, 0.5, 0, 1); p.acquire(PRI.NORMAL, 0.6, 0, 1);
  const i = p.acquire(PRI.MAJOR, 1, 0.1, 1);
  assert.ok(i >= 0 && i !== mine, 'it takes someone else\'s voice');
  assert.equal(p.stolen, true);
  assert.equal(p.mine[mine], 1, 'yours plays on');
  // all voices yours: nothing is cut off for someone else's sound
  const q = new VoicePool(2);
  q.acquire(PRI.AMBIENT, 0.2, 0, 1, true); q.acquire(PRI.AMBIENT, 0.2, 0, 1, true);
  assert.equal(q.acquire(PRI.MAJOR, 1, 0.1, 1), -1);
  // and yours gets a voice even from a stronger sound that isn't yours
  const r = new VoicePool(2);
  r.acquire(PRI.MAJOR, 1, 0, 1); r.acquire(PRI.MAJOR, 0.9, 0, 1);
  assert.ok(r.acquire(PRI.AMBIENT, 0.3, 0.1, 1, true) >= 0, 'your footstep');
  // the background: only free voices, only up to its share (half), never a cut
  const b = new VoicePool(6);
  assert.equal(b.bgMax, 3);
  for (let k = 0; k < 3; k++) assert.ok(b.acquire(PRI.AMBIENT, 1, 0, 1) >= 0);
  assert.equal(b.acquire(PRI.AMBIENT, 1, 0, 1), -1, 'the background\'s share is full');
  assert.equal(b.why, 'bg');
  assert.ok(b.acquire(PRI.MINOR, 0.2, 0, 1) >= 0, 'a voice left for what matters');
  for (let k = 0; k < 2; k++) b.acquire(PRI.NORMAL, 0.5, 0, 1);
  assert.equal(b.active(0), 6);
  assert.equal(b.acquire(PRI.AMBIENT, 1, 0.1, 1), -1, 'a full pool drops a new background sound');
  assert.equal(b.stolen, false, 'without cutting anything off');
  const j = b.acquire(PRI.NORMAL, 0.8, 0.1, 1);
  assert.ok(j >= 0 && b.stolen, 'something that matters takes the weakest voice');
  assert.equal(j, 0, 'the weakest: a background sound');
  // the counts the game uses: room for a phone
  assert.ok(VOICES.phone <= 12 && VOICES.computer <= 24 && VOICES.enginesPhone <= 2 && VOICES.enginesComputer <= 4);
});

test('the background\'s budgets: so many a second of each, a short burst then the rate', () => {
  const b = new Budget({ drop: 6, step: 12 });
  let n = 0;
  for (let k = 0; k < 100; k++) if (b.ok('drop', 0)) n++;
  assert.equal(n, 6, 'a burst of six at once');
  n = 0;
  for (let t = 0.01; t <= 10; t += 0.01) if (b.ok('drop', t)) n++;
  assert.ok(n >= 58 && n <= 61, `six a second over ten seconds (${n})`);
  assert.equal(b.ok('gun_pistol', 0), true, 'no budget: no limit');
  for (const k of ['step', 'drop', 'cricket', 'crackle', 'leaves']) assert.ok(BUDGET[k] > 0 && BUDGET[k] <= 12, k);
  for (const k of Object.keys(BUDGET)) assert.ok(INSTR[k], `${k} is a recipe`);
  // the rate limit is per place: two shooters across the street are both heard
  const r = new RateLimit();
  assert.equal(r.ok('gun_pistol', 0.03, 0, 100, 100), true);
  assert.equal(r.ok('gun_pistol', 0.03, 0.01, 105, 100), false, 'the same gun again too soon');
  assert.equal(r.ok('gun_pistol', 0.03, 0.02, 600, 100), true, 'another gun over there');
});

test('every instrument\'s loudness, measured (tools/sound/bench.py --levels), is trimmed into its category\'s range', () => {
  const fx = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/sound-levels.json'), 'utf8'));
  const C = fx.categories, I = fx.instruments;
  // the order of things: explosions loudest, then guns, the usual, the menus, footsteps, the world around
  const order = ['boom', 'gun', 'fx', 'ui', 'step', 'amb'];
  for (let k = 1; k < order.length; k++) assert.ok(C[order[k - 1]].target > C[order[k]].target, `${order[k - 1]} over ${order[k]}`);
  for (const name of Object.keys(INSTR)) {
    const m = I[name];
    assert.ok(m, `${name} was measured (run tools/sound/bench.py --levels)`);
    const c = C[m.cat];
    assert.ok(c, `${name}: a category`);
    assert.equal(TRIM_DB[name], m.trim, `${name}: client/sound/levels.js has the measured trim`);
    assert.ok(m.trim >= fx.trimLimits[0] && m.trim <= fx.trimLimits[1], `${name}: trim ${m.trim} within its limits`);
    assert.ok(Math.abs(m.loud + m.trim - m.after) < 0.11, `${name}: after = measured + trim`);
    assert.ok(m.after >= c.low && m.after <= c.high, `${name}: ${m.after} dBA within ${m.cat}'s ${c.low}..${c.high}`);
    assert.ok(m.peak + m.trim <= fx.peakMax + 0.05, `${name}: its peak ${m.peak + m.trim} dBFS no higher than ${fx.peakMax}`);
  }
  for (const name of Object.keys(TRIM_DB)) assert.ok(INSTR[name], `${name}: a trim for a recipe that exists`);
});

test('the buses leave headroom and the master\'s compressor is gentle', () => {
  const g = busGains(SOUND_DEFAULTS), db = (x) => 20 * Math.log10(x);
  assert.ok(db(g.master) <= -1 && db(g.master) >= -9, `master ${db(g.master).toFixed(1)} dB`);
  assert.ok(db(g.master * g.sfx) <= -5, 'the effects at least 5 dB under full scale before the compressor');
  assert.ok(g.amb < g.sfx && g.mus < g.sfx * 1.01, 'the ambience and the music under the effects');
  assert.ok(COMP.threshold >= -12 && COMP.threshold <= -8, `threshold ${COMP.threshold}`);
  assert.ok(COMP.ratio >= 2 && COMP.ratio <= 3, `ratio ${COMP.ratio}`);
  assert.ok(COMP.attack >= 0.005 && COMP.attack <= 0.02, `attack ${COMP.attack}`);
  assert.ok(COMP.release >= 0.15 && COMP.release <= 0.4, `release ${COMP.release}`);
  assert.ok(COMP.knee >= 0 && COMP.knee <= 12);
  assert.ok(COMP.makeupDb >= 0 && COMP.makeupDb <= 6, 'the compressor\'s own make-up gain, taken back off after it');
});

test('an event\'s sound that was dropped lets the old sound play instead; one that started (or was out of earshot) keeps it quiet', () => {
  assert.equal(eventHeard(null, 0, 0, 0), true, 'data only: nothing to hear');
  assert.equal(eventHeard(() => {}, 1, 0, 0), true, 'it started');
  assert.equal(eventHeard(() => {}, 1, 0, 2), true, 'one of its sounds started');
  assert.equal(eventHeard(() => {}, 0, 0, 1), false, 'dropped (no voice, a rate limit): the old sfx plays');
  assert.equal(eventHeard(() => {}, 0, 1, 1), false, 'dropped, the rest too far: the old sfx plays');
  assert.equal(eventHeard(() => {}, 0, 2, 0), true, 'simply too far off to hear');
  assert.equal(eventHeard(() => {}, 0, 0, 0), true, 'nothing to play (your own swing, played as you pressed)');
});

test('the noise loops have no seam: the sample after the last is the one that would have come next', () => {
  // a brown-ish random walk: a jump at the seam would be a click every loop
  const n = 20000, X = 1024, d = new Float32Array(n + X);
  let b = 0, seed = 7;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; d[i] = b * 3.2; }
  let step = 0;
  for (let i = 1; i < d.length; i++) step = Math.max(step, Math.abs(d[i] - d[i - 1]));
  const s = loopSeam(d, X);
  assert.equal(s.length, n);
  assert.ok(Math.abs(s[0] - s[n - 1]) <= step * 1.01, `the seam ${Math.abs(s[0] - s[n - 1]).toFixed(4)} is no bigger than a step (${step.toFixed(4)})`);
});
