// A song to sound: lays its sections end to end, turns each part into notes (score.js), plays every note through its
// instrument (voices.js, drums.js) into the part's own channel, runs the channel's effects (EQ, drive, chorus), pans
// it, sends some to the song's one echo (the SNES's signature space), and masters the lot: an optional tape-lo-fi
// stage, a gentle glue compressor, the SNES's soft top end, and a matched loudness so no song jumps out of another.
// Deterministic: the same song renders the same samples every time.

import { SR, TAU, rng, hashStr, mtof, SVF, Biquad, soft, mixInto, clamp, compress, room } from './dsp.js';
import { VOICES, PRESETS } from './voices.js';
import { DRUMS, KIT } from './drums.js';
import * as S from './score.js';

const GENS = new Set(['pad', 'comp', 'strum', 'arp', 'pick', 'bass']);

function loopTo(events, len, total) {
  if (!len || len >= total - 1e-9) return events.filter((e) => e.t < total - 1e-9);
  const out = [];
  for (let k = 0; k * len < total - 1e-9; k++) for (const e of events) { const t = e.t + k * len; if (t < total - 1e-9) out.push({ ...e, t }); }
  return out;
}

function sectionChords(sec, bpb) {
  if (!sec.chords) return null;
  const ch = S.parseChords(sec.chords, bpb), total = sec.bars * bpb;
  return ch.len >= total - 1e-9 ? ch : loopTo(ch, ch.len, total);
}

function partEvents(part, sec, bpb, where, parts) {
  if (part == null || part === false) return [];
  if (typeof part === 'string') part = { line: part };
  const total = sec.bars * bpb, chords = sectionChords(sec, bpb);
  let ev = [];
  if (part.line) { const line = S.parseLine(part.line, bpb, where); ev = loopTo(line, line.len, total); }
  else if (part.harmOf) {
    const src = parts[part.harmOf];
    const line = S.parseLine(typeof src === 'string' ? src : src.line, bpb, where);
    ev = S.harmonize(loopTo(line, line.len, total), chords, part);
  } else if (GENS.has(part.gen)) {
    if (!chords) throw new Error(`${where}: ${part.gen} needs the section's chords`);
    const bars = sec.bars;
    if (part.gen === 'pad') ev = S.genPad(chords, part);
    else if (part.gen === 'comp') ev = S.genComp(chords, part.pattern, bars, bpb, part);
    else if (part.gen === 'strum') ev = S.genStrum(chords, part.pattern, bars, bpb, part);
    else if (part.gen === 'arp') ev = S.genArp(chords, part.pattern, bars, bpb, part);
    else if (part.gen === 'pick') ev = S.genArp(chords, part.pattern, bars, bpb, { ...part, pick: true });
    else ev = S.genBass(chords, part.pattern, bars, bpb, part);
  }
  const sh = 12 * (part.oct || 0) + (part.tr || 0);
  const vol = part.vol ?? 1;
  return ev.map((e) => ({ ...e, m: e.m.map((x) => x + sh), v: e.v * vol }));
}

function chorus(mono, depth = 0.5, rate = 0.5) {
  const n = mono.length, L = new Float32Array(n), R = new Float32Array(n), D = 0.014 * SR, M = 0.003 * SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const tap = (off, ph) => { const d = D + off + M * Math.sin(TAU * rate * t + ph), j = i - d; if (j < 1) return 0; const k = j | 0, f = j - k; return mono[k] * (1 - f) + mono[k + 1] * f; };
    const x = mono[i];
    L[i] = x + depth * tap(0, 0);
    R[i] = x + depth * tap(0.004 * SR, Math.PI / 2);
  }
  return [L, R];
}

export function renderSong(song, opt = {}) {
  const t0 = Date.now();
  const bpb = song.beatsPerBar || 4, spb = 60 / song.bpm;
  // the time map: each section at its own tempo and swing (a song can change gear part way through)
  const placed = [];
  let tSec = 0;
  for (const name of song.form) {
    const sec = song.sections[name];
    if (!sec) throw new Error(`${song.id}: no section "${name}"`);
    const bpm = sec.bpm || song.bpm, sw = sec.swing ?? song.swing ?? 0, unit = sec.swingUnit || song.swingUnit || 1;
    placed.push({ name, sec, startSec: tSec, spb: 60 / bpm, sw, unit, s8: 0.5 + sw / 6 });
    tSec += sec.bars * bpb * 60 / bpm;
  }
  const warp = (p, b) => { if (!p.sw) return b; const u = b / p.unit, base = Math.floor(u), f = u - base; return (base + (f < 0.5 ? f * (p.s8 / 0.5) : p.s8 + (f - 0.5) * ((1 - p.s8) / 0.5))) * p.unit; };
  const secIn = (p, b) => p.startSec + warp(p, b) * p.spb;   // (beat b of placed section p, in seconds)
  void spb;
  const endSec = tSec, n = Math.ceil((endSec + (song.tail ?? 3.5)) * SR);
  const L = new Float32Array(n), Rch = new Float32Array(n), eL = new Float32Array(n), eR = new Float32Array(n);
  const R = rng(hashStr(song.id || 'song'));
  const stats = {}, levels = {};
  // (a part's level before the master, over the stretches it plays: for balancing a mix)
  const rmsDb = (a, b, g = 1) => { let s2 = 0, k = 0; for (let i = 0; i < n; i += 4) { const v = b ? (Math.abs(a[i]) + Math.abs(b[i])) / 2 : Math.abs(a[i]) * g; if (v > 1e-4) { s2 += v * v; k++; } } return k ? +(10 * Math.log10(s2 / k)).toFixed(1) : -99; };

  const kicks = [];   // (when each kick lands, in seconds: for the parts that duck under it)
  const order = Object.entries(song.tracks).sort((a, b) => (b[1].kit ? 1 : 0) - (a[1].kit ? 1 : 0));   // (drums first)
  for (const [tname, tr] of order) {
    const human = tr.human ?? 0.004;
    if (tr.kit) {
      // ---- a drum kit: each hit placed where the kit sits ----
      const dL = new Float32Array(n), dR = new Float32Array(n);
      let hits = 0;
      for (const p of placed) {
        const part = p.sec[tname];
        if (!part) continue;
        const grid = part.grid || Object.fromEntries(Object.entries(part).filter(([k]) => k !== 'vol'));
        const ev = S.parseDrums(grid, p.sec.bars, bpb), vol = part.vol ?? 1;
        ev.forEach((e, k) => {
          const fn = DRUMS[e.name];
          if (!fn) throw new Error(`${song.id}/${p.name}/${tname}: no drum "${e.name}"`);
          const at = Math.max(0, Math.round((secIn(p, e.t) + (R() - 0.5) * 2 * human) * SR));
          const vel = clamp(e.v + (R() - 0.5) * 0.1, 0.05, 1);
          let x = fn(vel, R, e.note != null ? mtof(e.note) : undefined);
          { let pk = 1e-9; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i])); const g = 1 / pk; for (let i = 0; i < x.length; i++) x[i] *= g; }   // (every hit at full scale: the kit's levels set the balance)
          if (e.name === 'ohat') {   // (choked by the next closed hat or pedal)
            const nx = ev.slice(k + 1).find((q) => q.name === 'hat' || q.name === 'pedal');
            if (nx) { const cut = Math.round((secIn(p, nx.t) - secIn(p, e.t)) * SR); if (cut < x.length) { x = x.slice(0, cut + 160); for (let i = 0; i < 160; i++) x[cut + i] *= 1 - i / 160; } }
          }
          const [pan, lvl] = KIT[e.name] || [0, 0.5];
          mixInto(dL, dR, x, at, lvl * vel * vel * vol * (tr.vol ?? 1) * (tr.mix?.[e.name] ?? 1), clamp(pan * (tr.width ?? 1), -1, 1));
          if (e.name.startsWith('kick')) kicks.push(at / SR);
          hits++;
        });
      }
      if (tr.crunch) { for (const ch of [dL, dR]) for (let i = 0; i < n; i++) ch[i] = soft(Math.round(ch[i] * tr.crunch) / tr.crunch, 0.5); }
      if (tr.lp) { const a = new Biquad('lp', tr.lp, 0.7), b = new Biquad('lp', tr.lp, 0.7); a.apply(dL); b.apply(dR); }
      if (tr.drive) for (const ch of [dL, dR]) for (let i = 0; i < n; i++) ch[i] = soft(ch[i], tr.drive);
      if (tr.room) room(dL, dR, tr.room, tr.roomSize || 1);
      if (tr.comp) compress([dL, dR], tr.comp);
      const send = tr.echo || 0;
      for (let i = 0; i < n; i++) { L[i] += dL[i]; Rch[i] += dR[i]; if (send) { eL[i] += dL[i] * send; eR[i] += dR[i] * send; } }
      stats[tname] = hits;
      levels[tname] = rmsDb(dL, dR);
      continue;
    }
    // ---- a pitched part ----
    const preset = { ...(PRESETS[tr.inst] || {}), ...(tr.set || {}) };
    const fn = VOICES[preset.voice];
    if (!fn) throw new Error(`${song.id}/${tname}: no instrument "${tr.inst}"`);
    const bus = new Float32Array(n);
    let notes = 0;
    for (const p of placed) {
      const ev = partEvents(p.sec[tname], p.sec, bpb, `${song.id}/${p.name}/${tname}`, p.sec);
      ev.sort((a, b) => a.t - b.t);
      let prevF = 0, prevSlide = false;
      for (const e of ev) {
        const ts = secIn(p, e.t) + (e.dt || 0) + (R() - 0.5) * 2 * human, te = secIn(p, e.t + e.d);
        const dur = Math.max(0.03, (te - ts) * (e.stac ? 0.45 : (tr.gate ?? 1)));
        for (const m of e.m) {
          const f = mtof(m + 12 * (tr.oct || 0));
          const x = fn({ f, dur, vel: e.v, fPrev: prevSlide ? prevF : 0, vowel: e.vowel }, prevSlide && !preset.glide ? { ...preset, glide: 0.07 } : preset, R);
          const g = Math.pow(clamp(e.v + (R() - 0.5) * 0.06, 0.05, 1.2), 1.4) * (preset.gain ?? 1);
          const at = Math.round(ts * SR);
          const k0 = Math.max(0, -at), k1 = Math.min(x.length, n - at);
          for (let k = k0; k < k1; k++) bus[at + k] += x[k] * g;
          notes++;
        }
        prevF = mtof(Math.max(...e.m) + 12 * (tr.oct || 0)); prevSlide = e.slide;
      }
    }
    // the channel: filters and EQ, drive, then into stereo (chorus or a pan) and the echo
    if (tr.hp) new Biquad('hp', tr.hp, 0.7).apply(bus);
    if (tr.lp) new Biquad('lp', tr.lp, 0.7).apply(bus);
    for (const q of tr.eq || []) new Biquad(q.type || 'peak', q.f, q.q || 1, q.g).apply(bus);
    if (tr.drive) for (let i = 0; i < n; i++) bus[i] = soft(bus[i], tr.drive);
    if (tr.comp) compress([bus], tr.comp);
    if (tr.duck && kicks.length) {   // (pumping under the kick: down at each one, back up over duckRel s)
      const ks = kicks.slice().sort((a, b) => a - b), rel = tr.duckRel || 0.18;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        while (k + 1 < ks.length && ks[k + 1] <= t) k++;
        const since = t - ks[k];
        if (since >= 0) bus[i] *= 1 - tr.duck * Math.exp(-since / rel) * Math.min(1, since / 0.004 + 0.3);
      }
    }
    const vol = tr.vol ?? 0.5, send = tr.echo || 0;
    if (tr.chorus) {
      const [cl, cr] = chorus(bus, tr.chorus, tr.chorusRate || 0.5);
      for (let i = 0; i < n; i++) { const l = cl[i] * vol, r = cr[i] * vol; L[i] += l; Rch[i] += r; if (send) { eL[i] += l * send; eR[i] += r * send; } }
    } else {
      const a = (clamp(tr.pan || 0, -1, 1) + 1) * Math.PI / 4, gl = Math.cos(a) * Math.SQRT2 * vol, gr = Math.sin(a) * Math.SQRT2 * vol;
      for (let i = 0; i < n; i++) { const l = bus[i] * gl, r = bus[i] * gr; L[i] += l; Rch[i] += r; if (send) { eL[i] += l * send; eR[i] += r * send; } }
    }
    stats[tname] = notes;
    levels[tname] = rmsDb(bus, null, vol);
  }

  // ---- the echo: one for the song, filtered as it repeats, a little ping-pong ----
  const E = song.echo || { time: 0.75 * spb, fb: 0.35, mix: 0.3 };
  if (E && E.mix) {
    const tL = Math.max(1, Math.round((E.beats ? E.beats * spb : E.time) * SR)), tR = Math.max(1, Math.round(tL * (E.spread ?? 1.333)));
    const bL = new Float32Array(tL), bR = new Float32Array(tR);
    let iL = 0, iR = 0, lpL = 0, lpR = 0, hL = 0, hR = 0;
    const a = 1 - Math.exp(-TAU * (E.lp || 3200) / SR), ah = 1 - Math.exp(-TAU * (E.hp || 260) / SR), fb = E.fb ?? 0.35, pp = E.pingpong ?? 0.35;
    for (let i = 0; i < n; i++) {
      const yL = bL[iL], yR = bR[iR];
      lpL += a * (yL - lpL); lpR += a * (yR - lpR);
      hL += ah * (eL[i] - hL); hR += ah * (eR[i] - hR);
      bL[iL] = (eL[i] - hL) + fb * ((1 - pp) * lpL + pp * lpR);
      bR[iR] = (eR[i] - hR) + fb * ((1 - pp) * lpR + pp * lpL);
      if (++iL >= tL) iL = 0;
      if (++iR >= tR) iR = 0;
      L[i] += lpL * E.mix; Rch[i] += lpR * E.mix;
    }
  }

  // ---- tape lo-fi (wow and flutter, saturation, hiss, a duller top, fewer bits) ----
  if (song.lofi) {
    const Lf = song.lofi;
    if (Lf.wow || Lf.flutter) {
      const sL = L.slice(), sR = Rch.slice(), D0 = 0.02 * SR;
      for (let i = 0; i < n; i++) {
        const t = i / SR, d = D0 + (Lf.wow || 0) * SR * Math.sin(TAU * 0.55 * t) + (Lf.flutter || 0) * SR * Math.sin(TAU * 6.3 * t + 1.1 * Math.sin(TAU * 0.7 * t));
        const j = i - d;
        if (j < 1) { L[i] = 0; Rch[i] = 0; continue; }
        const k = j | 0, f = j - k;
        L[i] = sL[k] * (1 - f) + sL[k + 1] * f; Rch[i] = sR[k] * (1 - f) + sR[k + 1] * f;
      }
    }
    if (Lf.drive) for (const ch of [L, Rch]) for (let i = 0; i < n; i++) ch[i] = soft(ch[i], Lf.drive);
    if (Lf.lp) { new Biquad('lp', Lf.lp, 0.6).apply(L); new Biquad('lp', Lf.lp, 0.6).apply(Rch); }
    if (Lf.bits) { const q = Math.pow(2, Lf.bits - 1); for (const ch of [L, Rch]) for (let i = 0; i < n; i++) ch[i] = Math.round(ch[i] * q) / q; }
    if (Lf.hiss) { const h = new SVF(4000, 0.5); for (let i = 0; i < n; i++) { h.run(R() * 2 - 1); const z = h.hp * Lf.hiss; L[i] += z; Rch[i] += z * 0.9; } }
  }

  // ---- master: weight and tape warmth, glue compression, the SNES's soft top, matched loudness, a soft ceiling ----
  const M = song.master || {};
  if (M.low) { new Biquad('low', 100, 0.7, M.low).apply(L); new Biquad('low', 100, 0.7, M.low).apply(Rch); }
  if (M.tape) { let pk = 1e-9; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rch[i])); const g = 0.9 / pk; for (const ch of [L, Rch]) for (let i = 0; i < n; i++) ch[i] = soft(ch[i] * g, M.tape) / g; }
  {
    const ratio = M.ratio ?? 2.2, at = Math.exp(-1 / (0.012 * SR)), rl = Math.exp(-1 / (0.16 * SR));
    let env = 0;
    // (the threshold sits a few dB over the mix's own level, so every song is glued the same however loud it came out)
    let ss = 0; for (let i = 0; i < n; i++) ss += L[i] * L[i] + Rch[i] * Rch[i];
    const rms0 = Math.sqrt(ss / (2 * n)) || 1e-6, rel = rms0 * Math.pow(10, (M.thrRel ?? 5) / 20);
    for (let i = 0; i < n; i++) {
      const lvl = Math.max(Math.abs(L[i]), Math.abs(Rch[i]));
      env = lvl > env ? at * env + (1 - at) * lvl : rl * env + (1 - rl) * lvl;
      const g = env > rel ? Math.pow(env / rel, 1 / ratio - 1) : 1;
      L[i] *= g; Rch[i] *= g;
    }
  }
  for (const ch of [L, Rch]) { new Biquad('lp', M.top ?? 11500, 0.6).apply(ch); new Biquad('hp', 28, 0.7).apply(ch); }
  // loudness: the loud parts (the top 40% of half-second blocks) brought to the target
  const blk = Math.round(0.5 * SR), lv = [];
  for (let i = 0; i + blk <= n; i += blk) { let s2 = 0; for (let k = i; k < i + blk; k++) s2 += L[k] * L[k] + Rch[k] * Rch[k]; lv.push(Math.sqrt(s2 / (2 * blk))); }
  lv.sort((a, b) => b - a);
  const loud = lv.slice(0, Math.max(1, Math.round(lv.length * 0.4)));
  const rmsLoud = Math.sqrt(loud.reduce((s2, x) => s2 + x * x, 0) / loud.length) || 1e-6;
  const gain = Math.pow(10, (M.loudness ?? -14) / 20) / rmsLoud;
  let peak = 0;
  for (const ch of [L, Rch]) for (let i = 0; i < n; i++) {
    let x = ch[i] * gain;
    const ax = Math.abs(x);
    if (ax > 0.82) x = Math.sign(x) * (0.82 + 0.16 * Math.tanh((ax - 0.82) / 0.16));
    ch[i] = x; if (Math.abs(x) > peak) peak = Math.abs(x);
  }
  // trim the silence after the last sound, with a short fade
  let last = n - 1;
  while (last > 0 && Math.abs(L[last]) < 3e-4 && Math.abs(Rch[last]) < 3e-4) last--;
  const end = Math.min(n, last + Math.round(0.25 * SR)), fade = Math.round(0.2 * SR);
  for (let i = Math.max(0, end - fade); i < end; i++) { const g = (end - i) / fade; L[i] *= g; Rch[i] *= g; }
  return {
    L: L.subarray(0, end), R: Rch.subarray(0, end), sr: SR, seconds: end / SR, peak, ms: Date.now() - t0, stats, levels,
    sections: placed.map((p) => ({ name: p.name, at: +p.startSec.toFixed(3) })), loopAt: song.loop != null ? placed[song.loop].startSec : null, endAt: endSec,
  };
}
