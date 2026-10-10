// The title song (client/sound/music.js): the owner's own track ("CLA Main Screen") transcribed into the engine - its
// form, its riff, its turns and its drums as measured from the owner's MP3 - and its tape (the hiss and the wow's
// wavers) running only while the song plays, on a stand-in AudioContext.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, TITLE_FORM, TITLE_RIFF, titleScore, Music } from '../client/sound/music.js';
import { SoundEngine } from '../client/sound/engine.js';

const S = SONGS.title, BAR = 16;
const evs = (bar, step, part) => S.score[bar * BAR + step].filter((e) => e.p === part);
const roots = (bar, part = 'vox') => { const out = []; for (let s = 0; s < BAR; s++) for (const e of evs(bar, s, part)) out.push([s, e.n[0]]); return out; };
const F2 = 41, G2 = 43, Ab2 = 44, C3 = 48, Db3 = 49;

test('the title is the owner\'s track: F minor at 92 BPM, 20 bars - the riff alone, then the drums twice through eight', () => {
  assert.equal(S.bpm, 92);
  assert.equal(S.steps, BAR);
  assert.equal(S.bars, 20);
  assert.equal(S.score.length, S.steps * S.bars, 'a step for every 16th of every bar');
  assert.equal(TITLE_FORM, 'IIITGGGFGGGBGGGFGGGE');
  const loop = (S.score.length * 60) / S.bpm / 4;
  assert.ok(Math.abs(loop - 52.17) < 0.01, `the loop is the owner's length (${loop.toFixed(2)} s)`);
  assert.equal(titleScore().length, S.score.length, 'built the same every time');
  // every event is one the player knows, its notes real notes, its length at least a step
  const PARTS = new Set(['open', 'vox', 'sub', 'kick', 'snare', 'ghost', 'hat', 'tick', 'crash']);
  for (const step of S.score) {
    for (const e of step) {
      assert.ok(PARTS.has(e.p), e.p);
      if (e.n) { assert.ok(e.n.length >= 1 && e.n.every((m) => Number.isInteger(m) && m >= 20 && m <= 80), JSON.stringify(e)); assert.ok(e.len >= 1); }
      if (e.v !== undefined) assert.ok(e.v > 0 && e.v <= 1.2);
    }
  }
});

test('the riff: a rest, F, A♭, F, then G-A♭-F twice, in every bar of the intro and the groove; F on the one after a turn', () => {
  const RIFF = [[2, F2], [4, Ab2], [6, F2], [8, G2], [9, Ab2], [10, F2], [12, G2], [13, Ab2], [14, F2]];
  assert.deepEqual(TITLE_RIFF.map(([s, n]) => [s, n]), RIFF);
  for (let b = 0; b < 20; b++) {
    const k = TITLE_FORM[b];
    if (k !== 'I' && k !== 'G') continue;
    const after = b === 0 || !'IG'.includes(TITLE_FORM[b - 1]);
    assert.deepEqual(roots(b), after ? [[0, F2], ...RIFF] : RIFF, `bar ${b + 1}`);
  }
  // the fifth over F once the drums are in (its power), the intro's F alone
  assert.deepEqual(evs(1, 2, 'vox')[0].n, [F2]);
  assert.deepEqual(evs(5, 2, 'vox')[0].n, [F2, C3]);
});

test('every fourth bar turns D♭ to C, the bass with it; the riff opens up once the drums come in', () => {
  for (const b of [3, 7, 11, 15, 19]) {
    assert.deepEqual(roots(b), [[0, Db3], [8, C3]], `bar ${b + 1}`);
    assert.deepEqual(roots(b, 'sub').map(([s, n]) => [s, n % 12]), [[0, 1], [8, 0]], `bar ${b + 1}: the bass D♭ then C`);
  }
  for (let b = 0; b < 20; b++) {
    const o = evs(b, 0, 'open');
    assert.equal(o.length, 1);
    assert.equal(o[0].o, b < 4 ? 0 : 1, `bar ${b + 1}`);
  }
});

test('the drums: none in the intro or the loop\'s last bar; boom-bap in the groove (kick 1 and 3, snare 2 and 4, hats off the beat, ghosts dragging late); fills and pickups where the owner has them', () => {
  const hits = (b, part) => { const out = []; for (let s = 0; s < BAR; s++) if (evs(b, s, part).length) out.push(s); return out; };
  const DRUMS = ['kick', 'snare', 'ghost', 'hat', 'tick', 'crash'];
  for (const b of [0, 1, 2, 19]) assert.deepEqual(DRUMS.flatMap((d) => hits(b, d)), [], `bar ${b + 1}: no drums`);
  for (let b = 0; b < 20; b++) {
    if (TITLE_FORM[b] !== 'G') continue;
    assert.deepEqual(hits(b, 'kick'), [0, 8]);
    assert.deepEqual(hits(b, 'snare'), [4, 12]);
    assert.deepEqual(hits(b, 'hat'), [2, 6, 10, 14]);
    assert.deepEqual(hits(b, 'ghost'), [3, 7, 11]);
    for (const s of [3, 7, 11]) assert.equal(evs(b, s, 'ghost')[0].late, 0.5, 'half a 16th late');
  }
  // the pickup into the drums (bar 4) and back in after the break (bar 12): a snare and a crash on 4
  for (const b of [3, 11]) { assert.deepEqual(hits(b, 'snare'), [12]); assert.deepEqual(hits(b, 'crash'), [12]); assert.deepEqual(hits(b, 'kick'), []); }
  // the fills (bars 8 and 16): a snare roll into beat 2
  for (const b of [7, 15]) assert.deepEqual(hits(b, 'snare'), [0, 1, 2, 3, 4, 12]);
});

// ---- a stand-in AudioContext: enough of the API for the engine and the music, noting what starts and stops ----
function fakeCtx() {
  const log = { started: [], stopped: new Set() };
  const param = (v = 0) => ({ value: v, automationRate: 'a-rate', setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect(to) { return to; }, disconnect() {}, ...extra });
  const src = (extra) => { const n = node({ start() { log.started.push(n); }, stop() { log.stopped.add(n); }, ...extra }); return n; };
  const ctx = {
    currentTime: 0, sampleRate: 48000, state: 'running',
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
    createDelay: () => node({ delayTime: param(0) }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createStereoPanner: () => node({ pan: param(0) }),
    createOscillator: () => src({ type: 'sine', frequency: param(440), detune: param(0), setPeriodicWave() {} }),
    createBufferSource: () => src({ buffer: null, loop: false, playbackRate: param(1) }),
    createPeriodicWave: () => ({}),
    createBuffer: (ch, len, sr) => { const d = new Float32Array(len); return { duration: len / sr, length: len, getChannelData: () => d }; },
  };
  return { ctx, log };
}

test('the title\'s tape - the hiss and the wavers behind the wow - runs only while the song plays, and its notes come', () => {
  const { ctx, log } = fakeCtx();
  const bus = { connect() {}, disconnect() {} };
  const E = new SoundEngine(ctx, { sfx: bus, echo: bus, mus: bus }, { voices: 4 });
  const M = new Music(E);
  const run = (from, to) => { for (let t = from; t < to; t += 0.05) { ctx.currentTime = t; M.tick(); E.reap(t); } };
  M.set('title', 0.7);
  const p = M.players.title;
  const tape = p.fx.src.filter((n) => n.start);
  assert.equal(tape.length, 4, 'three wavers (the wow and its flutter) and the hiss');
  assert.ok(tape.every((n) => log.started.includes(n) && !log.stopped.has(n)));
  const before = log.started.length;
  run(0, 6);
  assert.ok(log.started.length - before > 40, `the riff's notes and the bass were played (${log.started.length - before} sources: two bars and a bit of the intro)`);
  // the title screen closes: the song fades, and a few seconds later its tape stops with it
  M.set('title', 0);
  run(6, 11.5);
  assert.equal(p.on, false);
  assert.ok(tape.every((n) => log.stopped.has(n)), 'the hiss and the wavers stopped');
  assert.equal(p.fx.src.length, 0);
  // back to the title: a fresh tape, from the top
  M.set('title', 0.7);
  assert.equal(p.fx.src.filter((n) => n.start).length, 4);
  assert.equal(p.step, 0);
});
