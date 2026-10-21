// The ambience's beds (client/sound/ambience.js) at their levels everywhere (the owner, 2026-10-15, at Willow Valley
// station: "a random and loud ambient noise ... sounds like the ocean or wind ... playing nonstop and way louder than it's
// supposed to be ... I think it might be the rain sfx but there wasn't rain"). It was the leaves' rustle: a bed as loud
// at gain 1 as the rain, turned up to 0.35 on any grass in the country - over heavy rain, on every farm. The real
// Ambience runs here on a stand-in audio graph (each bed's gain recorded) over small maps made here: farmland, a forest, a
// river through the fields, a lake, the sea's shore, the city.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CityMap, WATER_D } from '../shared/mapcore.js';
import { T } from '../shared/constants.js';
import { mulberry32 } from '../shared/rng.js';

// (the ambience's gusts and swell wander at random: the same wander every run - Math.random seeded before it's loaded)
Math.random = mulberry32(2026);
const { Ambience, BED_DBA, BED_MAX } = await import('../client/sound/ambience.js');

const W = 120, H = 120, X = 60 * 32, Y = 60 * 32;
const RURAL = 49, WILD = 47, MIDTOWN = 1;   // (shared/mapcore.js: Willow Valley, Highland Woods' v3 district, Midtown)
// a map of one district and ground, with water where water(tx, ty) says (1 sea, 2 river, 3 lake) and the forest's
// terrain class where forest(tx, ty)
function makeMap({ d = RURAL, tile = T.FIELD, water = () => 0, forest = () => false }) {
  const m = new CityMap(1, W, H);
  m.lake ||= new Uint8Array(W * H);   // (a v3 map's lakes: the generator makes this layer)
  const cw = W / 4, cls = new Uint8Array(cw * (H / 4)).fill(1);
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const i = m.idx(tx, ty), q = water(tx, ty);
    if (q) { m.tiles[i] = q === 1 && Math.hypot(tx - 60, ty - 60) > 40 ? T.DEEP : T.WATER; m.dist[i] = q === 1 ? WATER_D : d; if (q > 1) m.river[i] = 1; if (q === 3) m.lake[i] = 1; }
    else { m.tiles[i] = tile; m.dist[i] = d; }
    if (forest(tx, ty)) cls[(ty >> 2) * cw + (tx >> 2)] = 2;
  }
  m.terrainCls = { cls, cw };
  return m;
}
function stubCtx() {
  const param = (v = 0) => ({ value: v, automationRate: 'k-rate', setTargetAtTime(x) { this.value = x; }, cancelScheduledValues() {}, setValueAtTime(x) { this.value = x; } });
  const node = (extra) => ({ connect() {}, disconnect() {}, ...extra });
  return { currentTime: 0, createBiquadFilter: () => node({ type: '', frequency: param(0), Q: param(0) }), createGain: () => node({ gain: param(0) }), createStereoPanner: () => node({ pan: param(0) }), createBufferSource: () => node({ buffer: null, loop: false, start() {}, stop() {} }) };
}
// a minute standing at (x, y): each bed's loudest and average gain, and the whole mix's loudest and its mean in dBA
// (BED_DBA: each bed measured alone at gain 1)
function listen(map, { x = X, y = Y, night = 0, rain = 0, inside = false } = {}) {
  const ctx = stubCtx();
  const E = { ctx, mix: { ambIn: { connect() {} }, ambLp: { frequency: { value: 0, setTargetAtTime() {} } } }, listener: { x, y }, buf: { white: { duration: 4 }, pink: { duration: 4 }, brown: { duration: 4 } }, play() {} };
  const A = new Ambience(E), S = { map, rainK: rain }, F = { clock: { dark: night }, vehs: [], peds: [], sub: false, ug: 0 };
  const max = {}, sum = {};
  let loud = -200, pw = 0;
  for (let k = 0; k < 240; k++) {
    ctx.currentTime = k * 0.25; A.next.scan = 0; A.update(F, S, 0.25, inside);
    let p = 0;
    for (const n in A.beds) { const v = A.beds[n].g.gain.value; max[n] = Math.max(max[n] || 0, v); sum[n] = (sum[n] || 0) + v / 240; if (v > 0) p += Math.pow(10, (BED_DBA[n] + 20 * Math.log10(v)) / 10); }
    loud = Math.max(loud, p ? 10 * Math.log10(p) : -200); pw += p / 240;
  }
  return { max, avg: sum, loud, mean: pw ? 10 * Math.log10(pw) : -200, k: A.k };
}
const CITY_DAY = BED_DBA.city + 20 * Math.log10(BED_MAX.city);   // (the city's hum by day: -32.8 dBA)
const HEAVY_RAIN = BED_DBA.rain + 20 * Math.log10(BED_MAX.rain);   // (-28.2)

test('the open country (Willow Valley\'s farmland): a breeze under the city\'s hum, no leaves, no rain, no sea', () => {
  const r = listen(makeMap({}));
  assert.equal(r.max.leaves, 0, 'no trees, no rustle');
  assert.equal(r.max.rain, 0, 'no rain falling, no rain');
  assert.equal(r.max.sea, 0); assert.equal(r.max.surf, 0);
  assert.ok(r.loud < CITY_DAY - 2, `the loudest gust ${r.loud.toFixed(1)} dBA, under the city's hum (${CITY_DAY.toFixed(1)})`);
  // it was: the leaves at up to 0.35 (-25.7 dBA), over heavy rain (-28.2)
  assert.ok(BED_DBA.leaves + 20 * Math.log10(0.35) > HEAVY_RAIN, '(what it was)');
});

test('the woods rustle - softly; the leaves never over the city\'s hum, the rain only when it rains', () => {
  const woods = listen(makeMap({ d: WILD, tile: T.GRASS, forest: () => true }));
  assert.ok(woods.max.leaves > 0.05 && woods.max.leaves <= BED_MAX.leaves, `the leaves ${woods.max.leaves}`);
  assert.ok(BED_DBA.leaves + 20 * Math.log10(woods.max.leaves) < CITY_DAY, 'its loudest under the city\'s hum');
  assert.ok(woods.loud < HEAVY_RAIN, `the woods in a gale ${woods.loud.toFixed(1)} dBA, under heavy rain`);
  const half = listen(makeMap({ d: WILD, tile: T.GRASS, forest: (tx) => tx < 60 }));
  assert.ok(half.k.woods < woods.k.woods * 0.8 && half.k.woods > 0.3, `half woods, half meadow: less (${half.k.woods.toFixed(2)} of ${woods.k.woods.toFixed(2)})`);
  const wet = listen(makeMap({}), { rain: 1 });
  assert.ok(wet.max.rain > 0.15 && wet.max.rain <= BED_MAX.rain, 'rain when it rains');
});

test('a river or a lake isn\'t the sea: no swell, no surf, no gulls\' sea - a quiet babble by a river', () => {
  const river = listen(makeMap({ water: (tx) => (tx >= 56 && tx < 64 ? 2 : 0) }));
  assert.equal(river.max.sea, 0, 'no ocean swell by a river');
  assert.equal(river.max.surf, 0, 'no waves breaking on its banks');
  assert.ok(river.max.flow > 0 && river.max.flow < 0.1, `the river running by (${river.max.flow})`);
  const lake = listen(makeMap({ water: (tx, ty) => (Math.hypot(tx - 60, ty - 60) < 30 ? 3 : 0) }), { x: 60 * 32, y: 80 * 32 });
  assert.equal(lake.max.surf, 0, 'no surf on a lake');
  const sea = listen(makeMap({ water: (tx) => (tx >= 58 ? 1 : 0) }));
  assert.ok(sea.max.sea > 0.1 && sea.max.surf > 0.1, 'the sea\'s shore: the swell and the surf');
  assert.ok(lake.max.sea < sea.max.sea * 0.6, 'a lake laps, the sea swells');
});

// The falls and the white water (2026-10-21; the owner, 10-16: "stream or waterfall sound in the forest with no visible
// source"): a river off at the edge of hearing is barely there; a falls roars at its foot and fades as you walk away;
// a rapid's white water is heard, less.
test('a falls roars at its foot and fades away from it; a river 20 tiles off is barely heard; a rapid rushes', () => {
  const bank = listen(makeMap({ d: WILD, tile: T.GRASS, water: (tx) => (tx >= 56 && tx < 64 ? 2 : 0) }), { x: 66 * 32 });
  const off = listen(makeMap({ d: WILD, tile: T.GRASS, water: (tx) => (tx >= 56 && tx < 64 ? 2 : 0) }), { x: 84 * 32 });
  assert.ok(bank.max.flow > 0.03 && off.max.flow < bank.max.flow * 0.3, `the river from its bank (${bank.max.flow.toFixed(3)}) and from 20 tiles off (${off.max.flow.toFixed(3)})`);
  const fallsMap = () => { const m = makeMap({ d: WILD, tile: T.GRASS, water: (tx, ty) => (tx >= 52 && tx < 68 ? 2 : 0) }); m.natureSites = [{ kind: 'ledgefall', name: 'Test Falls', x: X, y: 50 * 32, falls: { x: X, y: 50 * 32 - 8, w: 16 * 32, drop: 60 } }]; return m; };
  const foot = listen(fallsMap(), { x: 70 * 32, y: 53 * 32 }), mid = listen(fallsMap(), { x: 70 * 32, y: 62 * 32 }), gone = listen(fallsMap(), { x: 70 * 32, y: 80 * 32 });
  assert.ok(foot.max.flow > bank.max.flow * 2 && foot.max.flow <= BED_MAX.flow, `the falls roaring at its foot (${foot.max.flow.toFixed(3)}, a river's bank ${bank.max.flow.toFixed(3)})`);
  assert.ok(mid.max.flow < foot.max.flow * 0.75 && mid.max.flow > bank.max.flow, `fading 12 tiles off (${mid.max.flow.toFixed(3)})`);
  assert.ok(gone.max.flow < bank.max.flow * 1.05, `30 tiles off, only the river (${gone.max.flow.toFixed(3)})`);
  const rapidMap = makeMap({ d: WILD, tile: T.GRASS, water: (tx) => (tx >= 56 && tx < 64 ? 2 : 0) });
  rapidMap.waters = { ch: [{ k: 'river', w: 8, pts: [[60, 20], [60, 100]], r: [[30, 50, 0.8]] }] };
  const rush = listen(rapidMap, { x: 66 * 32, y: 60 * 32 });
  assert.ok(rush.max.flow > bank.max.flow * 1.3 && rush.max.flow < foot.max.flow, `the white water (${rush.max.flow.toFixed(3)})`);
});

test('no bed ever over its level: country, woods, shore, river, city, open sea - day and night, dry and in rain, outdoors and in', () => {
  const inland = [makeMap({}), makeMap({ d: WILD, tile: T.GRASS, forest: () => true }), makeMap({ water: (tx) => (tx >= 56 && tx < 64 ? 2 : 0) }), makeMap({ d: MIDTOWN, tile: T.SIDEWALK })];
  const maps = [...inland, makeMap({ water: (tx) => (tx >= 58 ? 1 : 0) }), makeMap({ d: WATER_D, water: () => 1 })];
  for (const m of maps) for (const night of [0, 1]) for (const rain of [0, 1]) for (const inside of [false, true]) {
    const r = listen(m, { night, rain, inside });
    for (const n in r.max) assert.ok(r.max[n] <= BED_MAX[n] + 1e-9, `${n} ${r.max[n]} over ${BED_MAX[n]}`);
    if (!rain) assert.equal(r.max.rain, 0, 'the rain only when it rains');
    // (dry, away from the sea: about the city's hum by day - the woods' rustle and the wind in the gusts a little over
    // it; a storm at sea, in the wild: a few dB over the rain)
    if (!rain && inland.includes(m)) assert.ok(r.mean <= CITY_DAY + 2 && r.loud <= CITY_DAY + 3, `the whole mix ${r.mean.toFixed(1)} dBA, ${r.loud.toFixed(1)} at its loudest: over the city's hum`);
    assert.ok(r.loud <= HEAVY_RAIN + 4.5, `the whole mix ${r.loud.toFixed(1)} dBA`);
  }
});

// A train's rumble (client/sound/vehicles.js trains): its speed from how far it moved this frame over the frame's time,
// not over the audio clock's step - a phone's audio clock moves in big steps or not at all between two frames, and a
// train creeping into a station at 30 px/s rumbled as if it were doing 500.
test('a train creeping into a station rumbles as one creeping, whatever the audio clock does', async () => {
  const { VehicleSounds } = await import('../client/sound/vehicles.js');
  const ctx = stubCtx();
  ctx.createOscillator = () => ({ frequency: { value: 0, automationRate: 'k-rate', setTargetAtTime(x) { this.value = x; } }, type: '', start() {}, stop() {}, connect() {}, disconnect() {}, setPeriodicWave() {} });
  const E = { ctx, buf: { white: {}, pink: {}, brown: {} }, waves: {}, mix: { sfx: { connect() {} } }, listener: { x: 0, y: 0 }, play() {} };
  const V = new VehicleSounds(E);
  const car = { rx: 60, ry: 0, fdx: 30 / 60, fdy: 0 };   // (30 px/s at 60 frames a second)
  for (let k = 0; k < 120; k++) { ctx.currentTime = Math.floor(k / 3) * 0.05; V.trains({ cars: [car], dt: 1 / 60, sub: false }, {}, k % 3 ? 0.001 : 0.05, ctx.currentTime); }
  const g = V.train.g.gain.value, want = Math.pow(1 - 60 / 1400, 1.6) * (0.15 + 30 / 900);
  assert.ok(Math.abs(g - want) < 0.01, `the rumble ${g.toFixed(3)} (a train at 30 px/s: ${want.toFixed(3)}; at full speed 0.55)`);
});
