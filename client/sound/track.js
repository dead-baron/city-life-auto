// Recorded music: a loop of one of the owner's own tracks (client/sound/tracks.js, cut on its bar lines by
// tools/music/make-loop.py), played on the audio clock so the seam never shows. The title screen plays one.
//   - One download: the compressed file is fetched the first time the track is wanted - Ogg Opus where the browser
//     says it can play it, MP3 where it can't (older Safari), and the MP3 after all if the Opus won't decode. Never
//     both, and nothing when the music is off.
//   - Decoded only while it plays: a minute of mono music at 48 kHz is some 11 MB once decoded, so the decoded audio
//     is let go a few seconds after the track falls silent (the compressed bytes are kept: next time it decodes again
//     in a moment, with no download).
//   - The loop: the file holds the loop with a wrap-around margin each side, so it repeats itself across both seams;
//     the player loops from margin to margin + loop, exactly the loop's length - right even where a decoder adds or
//     trims a few samples at the start.
//   - Its level: every track is brought to the same loudness (TARGET at level 1, before the music and master
//     sliders), and it plays on the music bus, so the music slider and the music switch apply.
import { setp } from './engine.js';
import { TRACKS } from './tracks.js';

export const TARGET_LUFS = -15;   // at level 1: the title (0.7), with the default sliders, about -28 LUFS at the speakers
export const FREE_AFTER = 4;      // s of silence before the decoded audio is let go

// the file to fetch first (pure): Opus where the browser may play it
export function pickFile(t, opus) { return opus ? t.opus : t.mp3; }
// can this browser play Ogg Opus? (an <audio>'s answer: '', 'maybe' or 'probably')
export function canOpus() {
  try { return typeof Audio !== 'undefined' && !!new Audio().canPlayType('audio/ogg; codecs="opus"'); } catch { return false; }
}
// where the loop runs on the decoded file, in s (the first play starts at the loop's start)
export function loopPoints(t) { return { start: t.margin, end: t.margin + t.loop }; }
// the gain that brings a track to the target loudness at level 1 (a mono file plays on both speakers: 3 dB louder
// than its own reading)
export function trackGain(t) { return Math.pow(10, (TARGET_LUFS - (t.lufs + (t.channels === 1 ? 3 : 0))) / 20); }

export class Track {
  constructor(E, name, { fetchFn = null, opus = null } = {}) {
    this.E = E; this.ctx = E.ctx; this.name = name; this.t = TRACKS[name] || null;
    this.fetch = fetchFn || ((u) => fetch(u));
    this.opus = opus;                  // (null: ask the browser)
    this.bytes = null;                 // the compressed file, kept
    this.buf = null; this.src = null; this.g = null;
    this.state = this.t ? 'idle' : 'failed';
    this.want = 0; this.quietAt = null; this.loading = null; this.err = '';   // (quietAt: when it fell silent)
    this.file = '';
  }
  url(f) { return new URL('../../' + f, import.meta.url).href; }
  decode(bytes) {
    const ctx = this.ctx;
    return new Promise((res, rej) => {
      try { const p = ctx.decodeAudioData(bytes.slice(0), res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }   // (a copy: decoding detaches the bytes it's given)
    });
  }
  async get(f) {
    const r = await this.fetch(this.url(f));
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.arrayBuffer();
  }
  load() {
    if (this.loading || this.buf || this.state === 'failed') return this.loading;
    this.state = 'loading';
    this.loading = (async () => {
      let buf = null;
      if (this.bytes) buf = await this.decode(this.bytes);
      else {
        const opus = this.opus ?? canOpus();
        if (opus) {
          try { const b = await this.get(this.t.opus); buf = await this.decode(b); this.bytes = b; this.file = this.t.opus; } catch { buf = null; }   // (it said it might, and it couldn't: the MP3)
        }
        if (!buf) { const b = await this.get(this.t.mp3); buf = await this.decode(b); this.bytes = b; this.file = this.t.mp3; }
      }
      this.buf = buf; this.state = 'ready'; this.loading = null;
      this.sync();
    })().catch((e) => { this.state = 'failed'; this.loading = null; this.err = String((e && e.message) || e); console.warn('[sound] track', this.name, e); });
    return this.loading;
  }
  // how loud it should be (0: fade out; a few seconds later it stops and the decoded audio goes). False if it can't
  // play at all (no such track, or it failed to load or decode): the caller plays something else.
  set(level) {
    if (this.state === 'failed') return false;
    this.want = level;
    if (level > 0.001 && !this.buf) this.load();
    this.sync();
    return true;
  }
  sync() {
    const t = this.ctx.currentTime;
    if (this.want > 0.001) {
      this.quietAt = null;
      if (!this.src && this.buf) this.start(t);
      if (this.g) setp(this.g.gain, this.want * trackGain(this.t), t, 0.6);
      return;
    }
    if (this.g) setp(this.g.gain, 0, t, 0.5);
    if (!this.src && !this.buf) return;
    if (this.quietAt === null) this.quietAt = t;
    else if (t - this.quietAt > FREE_AFTER) this.stop();
  }
  start(t) {
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), lp = loopPoints(this.t);
    s.buffer = this.buf; s.loop = true; s.loopStart = lp.start; s.loopEnd = lp.end;
    g.gain.value = 0;
    s.connect(g); g.connect(this.E.mix.mus);
    s.start(t + 0.03, lp.start);
    this.src = s; this.g = g;
  }
  stop() {
    try { this.src.stop(); } catch { /* not started */ }
    for (const n of [this.src, this.g]) { try { if (n) n.disconnect(); } catch { /* gone */ } }
    this.src = null; this.g = null; this.buf = null; this.quietAt = null;
    if (this.state === 'ready') this.state = 'idle';
  }
  // for the debug menu
  status() { return `${this.name}: ${this.state}${this.file ? ' (' + this.file.split('.').pop() + ')' : ''}${this.err ? ' - ' + this.err : ''}`; }
}
