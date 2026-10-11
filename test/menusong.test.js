// The menu's second track (client/sound/music.js): the owner's "CLA Main Screen" rebuilt in the engine a layer at a
// time ("build the beat first to match it, then layer on the other instruments") - the beat (the recording's own drum
// stem cut into one-shots, client/sound/banks/menu.js, transcribed hit by hit), then the bass (measured from the
// recording's low end) - its sample bank fetched only when the song plays, and the mix's duck under the drums.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SONGS, MENU_BEAT, MENU_BASS, MENU_KEYS, MENU_LEAD, MENU_WAVES, MENU_TEMPO, menuScore, decodeBank, stepLen, Music } from '../client/sound/music.js';
import { BANK } from '../client/sound/banks/menu.js';
import { SoundEngine } from '../client/sound/engine.js';

const S = SONGS.menu, BAR = 16;
const evs = (bar, step, part) => S.score[bar * BAR + step].filter((e) => e.p === part);
const steps = (bar, part, what) => { const out = []; for (let s = 0; s < BAR; s++) for (const e of evs(bar, s, part)) if (!what || e.s === what) out.push(s); return out; };
const D2 = 38, G2 = 43, A2 = 45, D3 = 50;

test('the menu track: a two-bar loop - D minor, then A7 - eight times round, the tempo creeping from 86.1 to 87 BPM as the recording\'s does', () => {
  assert.equal(S.steps, BAR);
  assert.equal(S.bars, 16);
  assert.equal(S.score.length, BAR * 16);
  assert.equal(menuScore().length, S.score.length, 'built the same every time');
  assert.equal(MENU_TEMPO.length, 16, 'a tempo for each bar');
  for (let b = 1; b < 16; b++) assert.ok(MENU_TEMPO[b] > MENU_TEMPO[b - 1], 'creeping up');
  assert.ok(Math.abs(MENU_TEMPO[0] - 86.1) < 0.05 && Math.abs(MENU_TEMPO[15] - 87.04) < 0.05);
  assert.equal(stepLen(S, 0), 60 / MENU_TEMPO[0] / 4, 'a 16th of the first bar');
  assert.equal(stepLen(S, 15 * BAR + 3), 60 / MENU_TEMPO[15] / 4, 'and of the last');
  let L = 0;
  for (let i = 0; i < S.score.length; i++) L += stepLen(S, i);
  assert.ok(Math.abs(L - 44.36) < 0.01, `the loop is the recording's length (${L.toFixed(2)} s)`);
  // the A and B bars alternate, the same each time round
  for (let b = 2; b < 16; b++) assert.deepEqual(S.score.slice(b * BAR, (b + 1) * BAR), S.score.slice((b % 2) * BAR, (b % 2 + 1) * BAR), `bar ${b + 1}`);
  const PARTS = new Set(['hit', 'mbass', 'mkeys', 'mlead']);
  for (const step of S.score) for (const e of step) assert.ok(PARTS.has(e.p), e.p);
});

test('the beat: the recording\'s own one-shots, kick on the one, snare on 2 and 4, hats on the eighths, ghost notes dragged late after 2 and 3', () => {
  for (const [b, k] of [[0, 'A'], [1, 'B']]) {
    for (let s = 0; s < BAR; s++) for (const e of evs(b, s, 'hit')) {
      assert.ok(BANK[e.s], `${k} ${s}: ${e.s} is in the bank`);
      assert.ok(e.v > 0 && e.v < 1.5, `${k} ${s}: a gain (${e.v})`);
      assert.ok(Math.abs(e.late) < 1, 'late by less than a step');
    }
    assert.ok(steps(b, 'hit', 'kick').includes(0), `${k}: the kick on the one`);
    assert.deepEqual(steps(b, 'hit', 'snare'), [4, 12], `${k}: the snare on 2 and 4`);
    assert.ok([0, 2, 6, 8, 10, 14].every((s) => steps(b, 'hit', 'hat').includes(s)), `${k}: hats on the eighths (but under the snares)`);
    for (const s of [7, 9]) assert.ok(evs(b, s, 'hit').some((e) => e.s === 'ghost' && e.late > 0.05), `${k} ${s}: a ghost note, dragged late`);
  }
  assert.deepEqual(steps(0, 'hit', 'kick'), [0, 10, 14], 'A: kick on 1, the and of 3, the and of 4');
  assert.deepEqual(steps(1, 'hit', 'kick'), [0, 6, 10, 14], 'B: and the and of 2');
  // the score plays the transcription as it stands, hit for hit
  for (const [b, k] of [[0, 'A'], [1, 'B']]) {
    assert.deepEqual(S.score.slice(b * BAR, (b + 1) * BAR).flatMap((st, s) => st.filter((e) => e.p === 'hit').map((e) => [s, e.s, e.v, e.late])), MENU_BEAT[k]);
  }
});

test('the bass: a long low D for half of bar A then quiet eighths an octave up; bar B a short A on the one, a rest, a long G (A7\'s seventh)', () => {
  const notes = (b) => { const out = []; for (let s = 0; s < BAR; s++) for (const e of evs(b, s, 'mbass')) out.push([s, e.n[0], e.len]); return out; };
  assert.deepEqual(notes(0).map(([s, n]) => [s, n]), [[0, D2], [8, D3], [10, D3], [12, D3], [14, D3]]);
  assert.deepEqual(notes(1).map(([s, n]) => [s, n]), [[0, A2], [6, G2]]);
  assert.equal(notes(0)[0][2], 8, 'the D for half the bar');
  assert.ok(notes(1)[1][2] >= 7.5 && notes(1)[1][2] <= 8, 'the G to the end of the bar');
  for (const b of [0, 1]) for (const [s, , len] of notes(b)) assert.ok(s + len <= BAR, 'each let go within its bar');
  // the long notes carry it: the short ones are far quieter (about 15 dB, as measured)
  const lv = (k, s) => MENU_BASS[k].find((x) => x[0] === s)[3];
  for (const s of [8, 10, 12, 14]) assert.ok(lv('A', s) < lv('A', 0) / 4, `A ${s}`);
  assert.ok(lv('B', 0) < lv('B', 6) / 3, 'B: the A under the G');
  assert.ok(lv('B', 6) < lv('A', 0) && lv('B', 6) > lv('A', 0) * 0.6, 'the G a little under the D');
  // tuned as the recording holds its notes (a few cents sharp); the mix ducks it under the snare, less under the kick
  assert.ok(S.tune > 0 && S.tune < 15);
  assert.ok(S.fx.duck.snare > S.fx.duck.kick && S.fx.duck.kick > 0 && S.fx.duck.snare < 0.7);
});

test('the keys: D minor seven in bar A (a low D an octave over the bass, the chord on 1 and 3), A seven in bar B (struck on 1, the and of 2, the e of 4), warm', () => {
  const notes = (b, part) => { const out = []; for (let s = 0; s < BAR; s++) for (const e of evs(b, s, part)) out.push([s, e.n[0], e.len, e.v, e.late || 0]); return out; };
  // every note is the chord's (by pitch class): Dm7 = D F A C; A7 = A C# E G, with the G# and B the recording's keys
  // ring over it and a high D in the stabs
  const PC = { 0: [2, 5, 9, 0], 1: [9, 1, 4, 7, 8, 11, 2] };
  for (const b of [0, 1]) for (const [s, n, len, v, late] of notes(b, 'mkeys')) {
    assert.ok(PC[b].includes(n % 12), `${'AB'[b]} ${s}: ${n} is in the chord`);
    assert.ok(s + late + len <= BAR, `${'AB'[b]} ${s}: let go within its bar`);
    assert.ok(v > 0.005 && v < 0.15, `${'AB'[b]} ${s}: a level (${v})`);
    assert.ok(n >= 50 && n <= 86, 'from D3 to D6');
  }
  const at = (b, s) => notes(b, 'mkeys').filter((x) => x[0] === s).map((x) => x[1]).sort((a, c) => a - c);
  assert.deepEqual(at(0, 0), [D3, 69, 74, 81, 84], 'A on 1: the low D, then A, D, A, C round the lead\'s F');
  assert.deepEqual(at(0, 8), [69, 74, 81, 84], 'and again on 3 (the bass brings the low D there)');
  assert.ok(notes(0, 'mkeys').find((x) => x[1] === D3)[2] >= 7.5, 'the low D held through half the bar');
  assert.deepEqual(at(1, 0).slice(0, 2), [57, 64], 'B on 1: a low A and E');
  for (const s of [0, 6, 13]) assert.ok(at(1, s).includes(73) && at(1, s).includes(69), `B ${s}: the C# and A struck`);
  // the stabs after the snares are short and quiet; the chords' notes are let go after about an eighth (or held to the
  // next strike on the second half)
  for (const s of [4, 12]) for (const [, , len, v, late] of notes(0, 'mkeys').filter((x) => x[0] === s)) { assert.ok(len < 0.5 && late > 0, `A ${s}: a short stab just after the snare`); assert.ok(v < 0.03); }
  // warm, not nasal: the fundamental carries it, each harmonic quieter than the one below, the octave 20 dB down
  for (const H of [MENU_WAVES.keys, MENU_WAVES.lead]) {
    assert.equal(H[1], 1);
    for (let k = 2; k < H.length; k++) assert.ok(H[k] < H[k - 1] && H[k] <= 0.1, `harmonic ${k}: ${H[k]}`);
  }
  const norm = (x) => [x[0], x[1], x[2], x[3], x[4] || 0];
  for (const [b, k] of [[0, 'A'], [1, 'B']]) assert.deepEqual(notes(b, 'mkeys'), MENU_KEYS[k].map(norm), `${k}: the score plays the measured keys as they stand`);
});

test('the lead: the top of the chord sung over it - F on 1 and 3 of bar A, E on 1, the and of 2 and the e of 4 of bar B - louder than any key', () => {
  const lead = (b) => { const out = []; for (let s = 0; s < BAR; s++) for (const e of evs(b, s, 'mlead')) out.push([s, e.n[0], e.len, e.v, e.late]); return out; };
  assert.deepEqual(lead(0).map(([s, n]) => [s, n]), [[0, 77], [8, 77]]);
  assert.deepEqual(lead(1).map(([s, n]) => [s, n]), [[0, 76], [6, 76], [13, 76]]);
  for (const b of [0, 1]) for (const [s, n, len, v, late] of lead(b)) {
    assert.ok(s + late + len <= BAR, 'let go within its bar');
    for (const [k, m, , kv] of MENU_KEYS['AB'[b]]) if (k === s) assert.ok(v > kv, `${'AB'[b]} ${s}: the lead (${v}) over the key ${m} (${kv})`);
  }
  assert.ok(lead(0)[1][2] > lead(0)[0][2], 'the F on 3 held longer than the one on 1');
  assert.deepEqual(MENU_LEAD.A.map((x) => x[1]), [77, 77]);
});

test('the bank: each one-shot at its own rate, decoded at the scale its gains are on; fetched only when the song plays', () => {
  const made = [];
  const ctx = { createBuffer: (ch, len, sr) => { const d = new Float32Array(len); const b = { duration: len / sr, length: len, sampleRate: sr, getChannelData: () => d }; made.push(b); return b; } };
  const B = decodeBank(ctx, BANK);
  assert.deepEqual(Object.keys(B).sort(), ['ghost', 'hat', 'kick', 'snare']);
  for (const k in B) {
    const o = BANK[k], buf = B[k];
    assert.ok([16000, 24000, 32000, 48000].includes(o.rate), k);
    assert.equal(buf.sampleRate, o.rate);
    assert.ok(buf.duration > 0.08 && buf.duration < 0.4, `${k}: a one-shot (${buf.duration.toFixed(3)} s)`);
    let pk = 0;
    for (const v of buf.getChannelData(0)) pk = Math.max(pk, Math.abs(v));
    assert.ok(Math.abs(pk - o.norm) < 0.002, `${k}: stored at full scale, brought back by norm (${pk.toFixed(4)} vs ${o.norm})`);
  }
  assert.ok(BANK.kick.norm > 1, 'the kick given back its sub peaks above the scale its gains were fitted on');
  // the page doesn't carry it: music.js fetches it with a dynamic import when the song first plays
  const src = readFileSync(new URL('../client/sound/music.js', import.meta.url), 'utf8');
  assert.ok(src.includes("import('./banks/menu.js')"));
  assert.ok(!/^import .*banks\//m.test(src), 'no static import of a bank');
});

test('playing it: the song waits for its one-shots, then the hits and the bass come, ducking the bass under the snares; the tape stops with it', async () => {
  const { ctx, log } = fakeCtx();
  const bus = { connect() {}, disconnect() {} };
  const E = new SoundEngine(ctx, { sfx: bus, echo: bus, mus: bus }, { voices: 4 });
  const M = new Music(E);
  const run = (from, to) => { for (let t = from; t < to; t += 0.05) { ctx.currentTime = t; M.tick(); E.reap(t); } };
  M.set('menu', 0.7);
  const p = M.players.menu;
  assert.ok(p.fx.ton, 'everything but the drums through its own gain, to be ducked');
  const before = log.started.length;
  run(0, 0.5);
  assert.equal(log.started.length, before, 'nothing until the bank is here');
  await M.load('menu');
  run(0.5, 6.2);
  const played = log.started.slice(before);
  const hits = played.filter((n) => 'buffer' in n && n.buffer), oscs = played.filter((n) => 'frequency' in n);
  assert.ok(hits.length >= 28, `the beat's hits (${hits.length} in two bars)`);
  assert.ok(oscs.length >= 6 + 41 + 5, `the bass, the keys and the lead (${oscs.length})`);
  assert.ok(oscs.filter((o) => o.frequency.value === 6.3).length >= 5, 'each lead note with its vibrato');
  assert.ok(p.fx.ton.gain.ducks >= 4, `ducked under the kicks and snares (${p.fx.ton.gain.ducks})`);
  M.set('menu', 0);
  run(6.2, 12);
  assert.equal(p.on, false, 'faded out and stopped');
});

// ---- a stand-in AudioContext: enough of the API for the engine and the music, noting what starts and stops (and the
// ducks: each drop of a gain toward below 1 with setTargetAtTime) ----
function fakeCtx() {
  const log = { started: [], stopped: new Set() };
  const param = (v = 0) => { const pr = { value: v, ducks: 0, automationRate: 'a-rate', setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(x) { if (x < 1 && x > 0.3) pr.ducks++; }, cancelScheduledValues() {} }; return pr; };
  const node = (extra = {}) => ({ connect(to) { return to; }, disconnect() {}, ...extra });
  const src = (extra) => { const n = node({ start() { log.started.push(n); }, stop() { log.stopped.add(n); }, ...extra }); return n; };
  const ctx = {
    currentTime: 0, sampleRate: 48000, state: 'running',
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
    createDelay: () => node({ delayTime: param(0) }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createDynamicsCompressor: () => node({ threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createStereoPanner: () => node({ pan: param(0) }),
    createOscillator: () => src({ type: 'sine', frequency: param(440), detune: param(0), setPeriodicWave() {} }),
    createBufferSource: () => src({ buffer: null, loop: false, playbackRate: param(1) }),
    createPeriodicWave: () => ({}),
    createBuffer: (ch, len, sr) => { const d = new Float32Array(len); return { duration: len / sr, length: len, getChannelData: () => d }; },
  };
  return { ctx, log };
}
