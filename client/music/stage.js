// Music out in the world, as the page sees it (server/systems/music.js decides it all; main.js loads this at the start and
// hands it every server event - ev() - and calls draw(g, F) over either view): the boomboxes, pocket radios, car radios,
// mats, hats and gigs (the 'mus' event's records), kept here for
//   - the sound (client/sound/stage.js asks sources(): what's playing, where, which song and how far into it - the
//     server's start time or the station's clock, through this page's estimate of the server's clock);
//   - the drawing, in world space: a boombox on the ground (its lights on the beat) or up on a shoulder, a pocket radio on
//     the hip, the cardboard mat, the upturned hat and the coins in it, a wreck in pieces; notes drifting up from what
//     plays and from anyone playing an instrument ('jamn');
//   - the music games (client/music/play.js: the rhythm game, the jam): the server's word on a set (res, go) goes there.
// It also puts the music items in the bag (shared/music.js registers them into shared/items.js ITEMS; their icons here).
import { TRACKS, KINDS, stationAt, tapePos, trackSecs, songOf, beatAt } from '../../shared/music.js';
import { MUSIC_GEAR } from '../../shared/rules-music.js';
import { DT } from '../../shared/constants.js';
import { ITEM_ICON } from '../inventory.js';

export let current = null;
const NOTE_GLYPH = ['♪', '♫', '♪', '♬'];
const TICK_S = DT;   // (the server's tick)

export class Stage {
  constructor(S, send) {
    this.S = S; this.send = send; this.recs = new Map(); this.off = null; this.fx = []; this.play = null; this.puff = 0;
    current = this;
    Object.assign(ITEM_ICON, { boombox: '📻', radio: '📻', dancemat: '🟫', guitar: '🎸', keytar: '🎹', bucketdrum: '🥁', sax: '🎷', violin: '🎻' });
    for (const t of TRACKS) if (t.tape) ITEM_ICON[`tape_${t.id}`] = '📼';
    if (S.welcomed) send({ t: 'mus', a: 'list' });   // (loaded after coming in: the list again)
  }
  // the server's clock, as this page reckons it: each 'mus' event carries the server's time, which is tied to the snapshot
  // it came with (its tick, 20 a second) - so the reckoning follows the server's own pace, slow or not, from the latest
  // snapshot on (plus half the ping: the server's that far ahead of what's arrived)
  clock(now) {
    const S = this.S;
    this.tickNow();
    if (S.latestTick) this.base = now - S.latestTick * TICK_S;
    const est = now + (S.rtt || 80) / 2000 - performance.now() / 1000;
    this.off = this.off === null || Math.abs(est - this.off) > 1 ? est : this.off + (est - this.off) * 0.2;
  }
  tickNow() { const k = this.S.latestTick; if (k && k !== this.tk) { this.tk = k; this.tkAt = performance.now() / 1000; } }
  now() {
    const S = this.S, t = performance.now() / 1000;
    this.tickNow();
    if (this.base !== undefined && this.tk) return this.base + this.tk * TICK_S + Math.min(0.25, t - this.tkAt) + (S.rtt || 80) / 2000;
    return t + (this.off ?? 0);
  }
  ev(ev) {
    if (ev.e === 'jamn') { this.noteFx(ev.x, ev.y - 22, ev.n.length > 1 ? 3 : 0); return; }
    if (ev.e !== 'mus') return;
    if (ev.now !== undefined) this.clock(ev.now);
    if (ev.all) { this.recs.clear(); for (const r of ev.all) this.set(r, true); }
    if (ev.s) for (const r of ev.s) this.set(r, false);
    if (ev.off) for (const id of ev.off) this.recs.delete(id);
    if ((ev.res || ev.go) && this.play) this.play.server(ev);
  }
  set(r, quiet) {
    const old = this.recs.get(r.id), t = performance.now() / 1000;
    r.kind = KINDS[r.k];
    r.brAt = r.br ? (old && old.brAt !== null && old.brAt !== undefined ? old.brAt : quiet ? t - 99 : t) : null;
    if (r.br && old && !old.br && !quiet) this.smash(r);
    this.recs.set(r.id, r);
  }
  // where it is: on the ground, or with whoever (whatever) has it
  at(r) {
    if (r.a) { const e = this.S.ents.get(r.a); if (e && e.rx !== undefined) return { x: e.rx, y: e.ry, e }; }
    return { x: r.x, y: r.y, e: null };
  }
  // for the sound: what's playing - { id, kind, x, y, att, track, pos (s into it; < 0 before a set starts), brAt }
  sources() {
    const out = [], now = this.now(), t = performance.now() / 1000;
    for (const r of this.recs.values()) {
      if (!r.on || r.kind === 'hat') continue;
      if (r.br && t - r.brAt > MUSIC_GEAR.windS) continue;
      let track = null, pos = 0;
      if (r.st >= 0) { const a = stationAt(r.st, now); track = a.track; pos = a.pos; }
      else if (r.tr >= 0 && TRACKS[r.tr]) { track = TRACKS[r.tr].id; pos = now < r.t0 ? now - r.t0 : tapePos(track, r.t0, now); }
      if (!track) continue;
      const p = this.at(r);
      out.push({ id: r.id, kind: r.kind, x: p.x, y: p.y, att: r.a, track, pos, brAt: r.br ? r.brAt : null });
    }
    return out;
  }
  // a beat's flash, 0-1, for what's playing on r (the boombox's lights)
  beat(r) {
    const s = this.sources().find((q) => q.id === r.id);
    if (!s || s.pos < 0) return 0;
    const b = beatAt(songOf(s.track), s.pos % trackSecs(s.track));
    return Math.max(0, 1 - (b % 1) * 2.5);
  }
  // anyone standing on the mat: their legs shown through it (the overlay's above the art v2 world - the mat cut away
  // round their feet, so they stand on it, not under it)
  feet(g, x, y) {
    const S = this.S;
    if (!S.art2 || !S.art2.ready) return;
    for (const e of S.ents.values()) {
      if (e.kind !== 1 || e.rx === undefined || Math.abs(e.rx - x) > 24 || Math.abs(e.ry - y) > 18) continue;
      g.clearRect(Math.round(e.rx) - 8, Math.round(e.ry) - 20, 16, 23);
    }
  }
  noteFx(x, y, k = 0) {
    if (this.fx.length > 40) this.fx.shift();
    this.fx.push({ x: x + (Math.random() - 0.5) * 10, y, t0: performance.now() / 1000, g: NOTE_GLYPH[k] || NOTE_GLYPH[(Math.random() * 4) | 0], c: ['#ffe28a', '#9ae8ff', '#ff9ad8', '#b4ff9a'][(Math.random() * 4) | 0] });
  }
  smash(r) {
    const fx = this.S.fx;
    if (!fx) return;
    for (let k = 0; k < 10; k++) { const a = Math.random() * 6.28, sp = 40 + Math.random() * 90; fx.spawn(1, r.x, r.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.5, 1.5 + Math.random() * 1.5, k & 1 ? '#2a2a30' : '#8a8e96', 0, 40); }
    if (fx.sparks) fx.sparks(r.x, r.y, 6);
  }
  draw(g, F) {
    const v = F.view, t = performance.now() / 1000;
    if (!this.recs.size && !this.fx.length) return;
    const puff = t - this.puff > 0.55;
    if (puff) this.puff = t;
    g.save();
    for (const r of this.recs.values()) {
      const p = this.at(r);
      if (v && (p.x < v.x0 - 40 || p.x > v.x1 + 40 || p.y < v.y0 - 40 || p.y > v.y1 + 40)) continue;
      const x = Math.round(p.x), y = Math.round(p.y);
      if (r.kind === 'mat') { drawMat(g, x, y); this.feet(g, x, y); }
      else if (r.kind === 'hat') drawHat(g, x, y, r.c);
      else if (r.kind === 'boombox') { if (r.br) drawWreck(g, x, y); else if (p.e) drawBoombox(g, x + 6, y - 20, 0.7, r.on ? this.beat(r) : -1); else drawBoombox(g, x, y, 1, r.on ? this.beat(r) : -1); }
      else if (r.kind === 'radio') { if (r.br) drawWreck(g, x, y, 0.55); else drawRadio(g, p.e ? x + 6 : x, p.e ? y - 8 : y, r.on); }
      if (puff && r.on && !r.br && r.kind !== 'hat' && (r.kind !== 'mat' || r.tr >= 0) && Math.random() < 0.8) this.noteFx(p.x, p.y - (r.kind === 'car' ? 16 : 24), (Math.random() * 4) | 0);
    }
    // notes drifting up and fading
    g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
    this.fx = this.fx.filter((n) => t - n.t0 < 1.6);
    for (const n of this.fx) {
      const a = (t - n.t0) / 1.6;
      g.globalAlpha = 1 - a;
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillText(n.g, n.x + 1 + Math.sin(a * 9) * 4, n.y - a * 30 + 1);
      g.fillStyle = n.c; g.fillText(n.g, n.x + Math.sin(a * 9) * 4, n.y - a * 30);
    }
    g.globalAlpha = 1;
    g.restore();
  }
}

// ---- the pictures (world px, pixel by pixel) -------------------------------------------------------------------------
function drawMat(g, x, y) {   // a flattened box: corrugated cardboard, a crease, packing tape, a scuffed middle
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x - 18, y - 10, 38, 24);
  g.fillStyle = '#b4834f'; g.fillRect(x - 19, y - 12, 38, 24);
  g.fillStyle = '#c99a62'; g.fillRect(x - 17, y - 10, 34, 20);
  g.fillStyle = '#9a6c3e'; g.fillRect(x - 19, y - 1, 38, 1); for (let k = -15; k < 17; k += 4) g.fillRect(x + k, y - 10, 1, 1);
  g.fillStyle = 'rgba(232,220,190,.7)'; g.fillRect(x - 4, y - 12, 8, 24);
  g.fillStyle = 'rgba(80,50,30,.25)'; g.fillRect(x - 8, y - 5, 16, 10);
}
function drawHat(g, x, y, c) {   // an upturned hat, a few coins and notes in it
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 8, y + 2, 17, 3);
  g.fillStyle = '#26262c'; g.fillRect(x - 8, y - 2, 16, 5);
  g.fillStyle = '#3a3a44'; g.fillRect(x - 6, y - 4, 12, 6);
  g.fillStyle = '#12121a'; g.fillRect(x - 5, y - 3, 10, 3);
  const n = Math.min(7, Math.ceil((c || 0) / 3));
  for (let k = 0; k < n; k++) { g.fillStyle = k % 3 === 2 ? '#7ac87a' : '#f0c838'; g.fillRect(x - 4 + (k * 3) % 9, y - 3 + (k & 1), 2, 1); }
}
function drawBoombox(g, x, y, s, beat) {   // black box, two speaker cones, the tape deck between, the handle; lights on the beat
  const R = (dx, dy, w, h) => g.fillRect(Math.round(x + dx * s), Math.round(y + dy * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  g.fillStyle = 'rgba(0,0,0,.3)'; if (s === 1) R(-10, 4, 21, 3);
  g.fillStyle = '#1c1c22'; R(-10, -8, 20, 12);
  g.fillStyle = '#3a3a44'; R(-7, -12, 14, 1); R(-7, -12, 1, 4); R(6, -12, 1, 4);
  g.fillStyle = '#5a5e68'; R(-9, -6, 6, 6); R(3, -6, 6, 6);
  g.fillStyle = '#2a2a30'; R(-8, -5, 4, 4); R(4, -5, 4, 4);
  g.fillStyle = '#8a8e96'; R(-7, -4, 2, 2); R(5, -4, 2, 2);
  g.fillStyle = '#4a4e58'; R(-2, -6, 4, 3);
  if (beat >= 0) { g.fillStyle = beat > 0.4 ? '#ff4a5a' : '#6a2a30'; R(-2, -2, 1, 1); g.fillStyle = beat > 0.2 ? '#5ae87a' : '#2a5a3a'; R(0, -2, 1, 1); g.fillStyle = '#ffd24a'; R(1, -2, 1, 1); }
}
function drawRadio(g, x, y, on) {   // a little transistor radio, its aerial up
  g.fillStyle = '#c8b48a'; g.fillRect(x - 4, y - 5, 8, 6);
  g.fillStyle = '#6a5a3e'; for (let k = 0; k < 3; k++) g.fillRect(x - 3 + k * 2, y - 4, 1, 4);
  g.fillStyle = on ? '#ff6a3a' : '#5a3a2a'; g.fillRect(x + 2, y - 4, 1, 1);
  g.fillStyle = '#b8bcc4'; g.fillRect(x + 3, y - 11, 1, 6);
}
function drawWreck(g, x, y, s = 1) {   // in pieces: the case split and tilted, a cone out, bits round it
  const R = (dx, dy, w, h) => g.fillRect(Math.round(x + dx * s), Math.round(y + dy * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  g.fillStyle = 'rgba(0,0,0,.3)'; R(-12, 3, 24, 3);
  g.fillStyle = '#1c1c22'; R(-11, -5, 9, 8); R(1, -3, 10, 6);
  g.fillStyle = '#5a5e68'; R(-9, -3, 5, 4);
  g.fillStyle = '#2a2a30'; R(4, -2, 4, 3);
  g.fillStyle = '#8a8e96'; R(-15, 2, 3, 2); R(13, -1, 2, 2); R(6, 5, 2, 1);
  g.fillStyle = '#3a3a44'; R(-3, -7, 1, 5); R(-2, -8, 4, 1);
  g.fillStyle = '#c8a050'; R(9, 4, 4, 1);
}
