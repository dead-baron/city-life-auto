// Recorded music (client/sound/track.js, tracks.js; cut by tools/music/make-loop.py): the title's loop as delivered -
// its files, their sizes and names, the loop on its bar lines - and the player on a stand-in AudioContext: one
// download (Opus, or the MP3 where Opus won't do), the loop points, the fades, the decoded audio let go when it falls
// silent, and the old tune taking over when the track can't play. (Decoding both files in a real browser and checking
// the seam: python3 tools/sound/bench.py --only tracks.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TRACKS } from '../client/sound/tracks.js';
import { Track, pickFile, loopPoints, trackGain, TARGET_LUFS, FREE_AFTER } from '../client/sound/track.js';

const ROOT = new URL('..', import.meta.url).pathname;
const T = TRACKS.title;

test('the title\'s loop: an Opus file and an MP3, small, named by their contents, 16 bars of the owner\'s track', () => {
  assert.ok(T, 'a title track');
  for (const k of ['opus', 'mp3']) {
    const f = T[k], bytes = readFileSync(ROOT + f);
    assert.match(f, new RegExp(`^assets/music/title-[0-9a-f]{8}\\.${k}$`));
    assert.equal(statSync(ROOT + f).size, T.bytes[k], `${k}: the size recorded`);
    assert.equal(f.slice(-8 - k.length - 1, -k.length - 1), createHash('sha1').update(bytes).digest('hex').slice(0, 8), `${k}: named by its contents (a new cut is a new name, never a stale cached copy)`);
    assert.ok(bytes.length < 800 * 1024, `${k}: under 800 KB (${Math.round(bytes.length / 1024)} KB)`);
  }
  assert.ok(T.bytes.opus < T.bytes.mp3, 'the Opus, which nearly everyone gets, is the smaller');
  assert.equal(T.channels, 1, 'mono: the owner\'s track is (left and right 99% alike), and mono halves the download and the memory');
  assert.equal(T.bars, 16);
  const bpm = (60 * 4 * T.bars) / T.loop;
  assert.ok(bpm > 85 && bpm < 88, `16 bars at the track's tempo (${bpm.toFixed(2)} BPM)`);
  assert.ok(T.margin >= 0.2, 'a wrap-around margin each side');
  const mem = (T.loop + 2 * T.margin) * 48000 * T.channels * 4 / 1048576;
  assert.ok(mem < 10, `under 10 MB once decoded (${mem.toFixed(1)} MB)`);
  assert.ok(Number.isFinite(T.lufs) && T.lufs < -10 && T.lufs > -30);
});

test('which file, where the loop runs, and how loud', () => {
  assert.equal(pickFile(T, true), T.opus);
  assert.equal(pickFile(T, false), T.mp3);
  assert.deepEqual(loopPoints({ margin: 0.25, loop: 40 }), { start: 0.25, end: 40.25 });
  // every track comes to the same loudness: a mono file reads 3 dB quieter than it plays on two speakers
  assert.ok(Math.abs(20 * Math.log10(trackGain({ lufs: TARGET_LUFS, channels: 2 }))) < 1e-9);
  assert.ok(Math.abs(20 * Math.log10(trackGain({ lufs: TARGET_LUFS - 3, channels: 1 }))) < 1e-9);
  assert.ok(Math.abs(20 * Math.log10(trackGain({ lufs: -20, channels: 2 })) - (TARGET_LUFS + 20)) < 1e-9);
});

// ---- a stand-in AudioContext and fetch: what was fetched, decoded, started and stopped ----
function rig({ opusDecodes = true, fetchFails = false } = {}) {
  const log = { fetched: [], decoded: 0, sources: [], stopped: 0 };
  const param = (v = 0) => ({ value: v, setTargetAtTime(x) { this.target = x; }, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = (x = {}) => ({ connect() {}, disconnect() {}, ...x });
  const ctx = {
    currentTime: 0,
    createGain: () => node({ gain: param(1) }),
    createBufferSource: () => { const s = node({ loop: false, loopStart: 0, loopEnd: 0, start(t, off) { this.at = t; this.off = off; }, stop() { log.stopped++; } }); log.sources.push(s); return s; },
    decodeAudioData(bytes, ok, bad) {
      log.decoded++;
      const kind = new TextDecoder().decode(new Uint8Array(bytes).slice(0, 4));
      if (kind === 'opus' && !opusDecodes) { const e = new Error('EncodingError'); bad && bad(e); return Promise.reject(e); }
      const b = { kind, duration: T.loop + 2 * T.margin };
      ok && ok(b);
      return Promise.resolve(b);
    },
  };
  const fetchFn = async (u) => {
    log.fetched.push(u.split('/').pop());
    if (fetchFails) return { ok: false, status: 404 };
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(u.endsWith('.opus') ? 'opus' : 'mp3!').buffer };
  };
  const E = { ctx, mix: { mus: node() } };
  return { ctx, log, E, fetchFn };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('the title track: one Opus download, decoded and looped from margin to margin + loop on the music bus, faded in', async () => {
  const { ctx, log, E, fetchFn } = rig();
  const tr = new Track(E, 'title', { fetchFn, opus: true });
  assert.equal(tr.set(0.7), true);
  await tr.loading; await settle();
  assert.deepEqual(log.fetched, [T.opus.split('/').pop()], 'only the Opus');
  assert.equal(tr.state, 'ready');
  const s = log.sources[0];
  assert.equal(s.loop, true);
  assert.equal(s.loopStart, T.margin);
  assert.equal(s.loopEnd, T.margin + T.loop);
  assert.equal(s.off, T.margin, 'it starts at the loop\'s start');
  assert.ok(Math.abs(tr.g.gain.target - 0.7 * trackGain(T)) < 1e-9, 'faded up to its level');
  // the title closes: it fades, plays on silent a few seconds, then stops and lets the decoded audio go
  tr.set(0);
  assert.equal(tr.g.gain.target, 0);
  ctx.currentTime = FREE_AFTER / 2; tr.set(0);
  assert.ok(tr.src, 'not straight away');
  ctx.currentTime = FREE_AFTER + 1; tr.set(0);
  assert.equal(tr.src, null);
  assert.equal(tr.buf, null, 'the decoded audio let go');
  assert.equal(log.stopped, 1);
  // back to the title: decoded again from the bytes it kept - no second download
  tr.set(0.7);
  await tr.loading; await settle();
  assert.equal(log.fetched.length, 1, 'no new download');
  assert.equal(log.decoded, 2);
  assert.equal(log.sources.length, 2, 'playing again');
});

test('the MP3 where the browser can\'t play Opus, or where the Opus won\'t decode; the old tune if nothing will', async () => {
  { // no Opus at all: straight to the MP3
    const { log, E, fetchFn } = rig();
    const tr = new Track(E, 'title', { fetchFn, opus: false });
    tr.set(0.7); await tr.loading; await settle();
    assert.deepEqual(log.fetched, [T.mp3.split('/').pop()]);
    assert.equal(tr.state, 'ready');
  }
  { // the browser said maybe, and couldn't: the MP3 after all
    const { log, E, fetchFn } = rig({ opusDecodes: false });
    const tr = new Track(E, 'title', { fetchFn, opus: true });
    tr.set(0.7); await tr.loading; await settle();
    assert.deepEqual(log.fetched, [T.opus.split('/').pop(), T.mp3.split('/').pop()]);
    assert.equal(tr.state, 'ready');
    assert.equal(log.sources.length, 1);
  }
  { // nothing to be had (offline on a first visit): the track says so, and the caller plays the old tune
    const { E, fetchFn } = rig({ fetchFails: true });
    const origWarn = console.warn; console.warn = () => {};
    const tr = new Track(E, 'title', { fetchFn, opus: true });
    tr.set(0.7); await tr.loading; await settle();
    console.warn = origWarn;
    assert.equal(tr.state, 'failed');
    assert.equal(tr.set(0.7), false);
  }
  { // nothing wanted, nothing fetched (the music switched off)
    const { log, E, fetchFn } = rig();
    const tr = new Track(E, 'title', { fetchFn, opus: true });
    tr.set(0); await settle();
    assert.deepEqual(log.fetched, []);
  }
});
