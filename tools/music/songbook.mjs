// The songbook: the owner's song scores (tools/music/songs/*.js, written for tools/music/render.js) and the live synth's
// own little songs (client/sound/music.js SONGS: the club, the shop...) compiled into what the game's synth plays live -
// the boombox's tapes, the radio stations, the dancer's mat, the car radio (client/sound/stage.js). Each song becomes
// client/sound/songbook/<id>.json: its parts, each a voice (the live synth's instrument: lead, bass, brass, reed, keys,
// bells, pad, organ, pluck, flute, voco - or the kit) and its notes in milliseconds from the top (the swing and every
// tempo change already worked in), so the page needs no score reader; and shared/music-songs.js, the table the server
// and the screens time things by (each song's length, its tempo map for the beats, its key).
//   node tools/music/songbook.mjs          (run it again when a song changes; test/music.test.js checks they agree)
// Notes: [ms, length ms, MIDI note, velocity 1-100] four numbers each; the kit: [ms, drum, velocity] (DRUM below).
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as S from './score.js';
import { KIT } from './drums.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'client/sound/songbook');

// the score's instruments -> the live synth's voices (client/sound/stage.js VOICE)
const VOICE_OF = [
  [/Bass$|^upright$|^tuba$/, 'bass'], [/^(brassFat|bonesFat|trumpet|trombone|synthBrass)$/, 'brass'], [/Sax$/, 'reed'],
  [/^(epiano|dustyKeys|clav|warbleKeys)$/, 'keys'], [/^(glock|vibes|marimba|toyPiano)$/, 'bells'], [/Pad$|Strings$|^strings$/, 'pad'],
  [/[oO]rgan$/, 'organ'], [/Guitar$|^skank$|^harp$/, 'pluck'], [/^(flute|whistle)$/, 'flute'], [/^voco/, 'voco'], [/./, 'lead'],
];
const voiceOf = (inst) => VOICE_OF.find(([re]) => re.test(inst))[1];
// the kit's drums -> the live kit's (0 kick, 1 snare, 2 clap, 3 hat, 4 open hat, 5 tick, 6 shaker, 7 brush, 8-10 toms
// high to low, 11 hand drum, 12 cymbal, 13 timbale)
export const DRUM = (name) => /^kick/.test(name) ? 0 : /^snare/.test(name) ? 1 : /^clap/.test(name) ? 2 : /^(hat|pedal)/.test(name) ? 3 : /^ohat/.test(name) ? 4
  : /^(ride|crash)/.test(name) ? 12 : /^(rim|snap|clave|block|cowbell)$/.test(name) ? 5 : /^(shaker|tamb)$/.test(name) ? 6 : name === 'brush' ? 7
    : name === 'tomH' ? 8 : name === 'tomM' ? 9 : name === 'tomL' || name === 'timp' ? 10 : /^(conga|bongo)/.test(name) ? 11 : name === 'timbale' ? 13 : -1;

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
// a section's part as notes in beats (the same reading as tools/music/render.js)
function partEvents(part, sec, bpb, where) {
  if (part == null || part === false) return [];
  if (typeof part === 'string') part = { line: part };
  const total = sec.bars * bpb, chords = sectionChords(sec, bpb);
  let ev = [];
  if (part.line) { const line = S.parseLine(part.line, bpb, where); ev = loopTo(line, line.len, total); }
  else if (part.harmOf) {
    const src = sec[part.harmOf];
    const line = S.parseLine(typeof src === 'string' ? src : src.line, bpb, where);
    ev = S.harmonize(loopTo(line, line.len, total), chords, part);
  } else if (GENS.has(part.gen)) {
    const bars = sec.bars;
    if (part.gen === 'pad') ev = S.genPad(chords, part);
    else if (part.gen === 'comp') ev = S.genComp(chords, part.pattern, bars, bpb, part);
    else if (part.gen === 'strum') ev = S.genStrum(chords, part.pattern, bars, bpb, part);
    else if (part.gen === 'arp') ev = S.genArp(chords, part.pattern, bars, bpb, part);
    else if (part.gen === 'pick') ev = S.genArp(chords, part.pattern, bars, bpb, { ...part, pick: true });
    else ev = S.genBass(chords, part.pattern, bars, bpb, part);
  }
  const sh = 12 * (part.oct || 0) + (part.tr || 0), vol = part.vol ?? 1;
  return ev.map((e) => ({ ...e, m: e.m.map((x) => x + sh), v: e.v * vol }));
}
const vel = (v) => Math.max(1, Math.min(100, Math.round(v * 100)));

// a score (tools/music/songs) -> { meta, parts }
export function compileScore(song) {
  const bpb = song.beatsPerBar || 4, placed = [];
  let tSec = 0, beat = 0;
  for (const name of song.form) {
    const sec = song.sections[name], bpm = sec.bpm || song.bpm, sw = sec.swing ?? song.swing ?? 0, unit = sec.swingUnit || song.swingUnit || 1;
    placed.push({ name, sec, startSec: tSec, beat0: beat, bpm, spb: 60 / bpm, sw, unit, s8: 0.5 + sw / 6 });
    tSec += sec.bars * bpb * 60 / bpm; beat += sec.bars * bpb;
  }
  const warp = (p, b) => { if (!p.sw) return b; const u = b / p.unit, base = Math.floor(u), f = u - base; return (base + (f < 0.5 ? f * (p.s8 / 0.5) : p.s8 + (f - 0.5) * ((1 - p.s8) / 0.5))) * p.unit; };
  const secIn = (p, b) => p.startSec + warp(p, b) * p.spb;
  const parts = [];
  for (const [tname, tr] of Object.entries(song.tracks)) {
    const n = [];
    if (tr.kit) {
      for (const p of placed) {
        const part = p.sec[tname];
        if (!part) continue;
        const grid = part.grid || Object.fromEntries(Object.entries(part).filter(([k]) => k !== 'vol'));
        for (const e of S.parseDrums(grid, p.sec.bars, bpb)) {
          const d = DRUM(e.name);
          if (d < 0) continue;
          const lvl = (KIT[e.name] || [0, 0.5])[1] * (tr.mix?.[e.name] ?? 1);
          n.push([Math.round(secIn(p, e.t) * 1000), d, vel(e.v * e.v * lvl * (part.vol ?? 1) * 1.6)]);
        }
      }
      n.sort((a, b) => a[0] - b[0]);
      if (n.length) parts.push({ v: 'kit', g: +(tr.vol ?? 1).toFixed(2), n: n.flat() });
      continue;
    }
    for (const p of placed) {
      for (const e of partEvents(p.sec[tname], p.sec, bpb, `${song.id}/${p.name}/${tname}`)) {
        const ts = secIn(p, e.t) + (e.dt || 0), te = secIn(p, e.t + e.d);
        const dur = Math.max(0.03, (te - ts) * (e.stac ? 0.45 : (tr.gate ?? 1)));
        for (const m of e.m) n.push([Math.round(ts * 1000), Math.round(dur * 1000), m + 12 * (tr.oct || 0), vel(e.v)]);
      }
    }
    n.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    if (n.length) parts.push({ v: voiceOf(tr.inst), g: +(tr.vol ?? 1).toFixed(2), pan: +(tr.pan || 0).toFixed(2), n: n.flat() });
  }
  // the key: the first chord's root (and whether it's minor), else the lowest bass note's
  const first = placed.find((p) => p.sec.chords);
  const ch = first ? S.parseChords(first.sec.chords, bpb)[0] : null;
  const tempo = [];
  for (const p of placed) if (!tempo.length || tempo[tempo.length - 1][1] !== p.bpm) tempo.push([+p.startSec.toFixed(3), p.bpm, p.beat0]);
  return {
    meta: { title: song.title, secs: +tSec.toFixed(2), beats: beat, tempo, key: ch ? 60 + ch.root : 60, minor: !!(ch && ch.iv[1] === 3) },
    parts,
  };
}

// the live synth's own songs (client/sound/music.js SONGS: steps per bar, patterns) -> the same
export function compileSynth(id, Sg, CH) {
  const hold = -1, sd = 60 / Sg.bpm / (Sg.steps / 4), total = Sg.steps * Sg.bars, P = {};
  const add = (v, t, d, m, ve) => (P[v] ||= []).push([Math.round(t * 1000), Math.round(d * 1000), m, vel(ve)]);
  const kit = [];
  const DK = { kick: 0, snare: 1, clap: 2, hat: 3, tick: 5, shaker: 6, brush: 7 };
  for (let i = 0; i < total; i++) {
    const bar = Math.floor(i / Sg.steps), s = i % Sg.steps, t = i * sd + (Sg.swing && s % 2 ? sd * Sg.swing * 4 : 0);
    if (Sg.lead) { const nn = Sg.lead.notes, m = nn[i % nn.length]; if (m > 0) { let len = 1; while (nn[(i + len) % nn.length] === hold && len < 16) len++; add(Sg.lead.inst === 'vibes' ? 'bells' : 'lead', t, len * sd * 0.95, m, 0.8); } }
    const chord = Sg.chords ? CH[Sg.chords[bar % Sg.chords.length]] : null;
    if (chord) {
      const [root, tones] = chord;
      if (Sg.bassPat && Sg.bassPat[s]) add('bass', t, sd * (Sg.bassInst ? 0.8 : 1.6), Sg.bassPat[s] === 2 ? root + 7 : Sg.bassPat[s] === 3 ? root + 12 : root, 0.8);
      if (Sg.arpPat && Sg.arpPat[s]) add('lead', t, sd * 0.9, tones[(Sg.arpPat[s] - 1) % tones.length] + 12, 0.35);
      if (Sg.compPat && Sg.compPat[s]) for (const m of tones) add('keys', t, sd * 1.6, m, 0.45);
      if (Sg.stabPat && Sg.stabPat[s]) for (const m of tones) add('brass', t, sd * 0.5, m + 12, 0.5);
      if (Sg.padVol && s === 0) for (const m of tones) add('pad', t, sd * Sg.steps * 0.98, m, 0.5);
    }
    if (Sg.drums) for (const k in Sg.drums) { const pat = Sg.drums[k]; if (pat[s % pat.length] === 'x' && DK[k] !== undefined) kit.push([Math.round(t * 1000), DK[k], vel((Sg.drumVol || 0.6) * (k === 'kick' ? 1 : 0.7))]); }
  }
  const parts = Object.entries(P).map(([v, n]) => ({ v, g: 1, pan: 0, n: n.flat() }));
  if (kit.length) parts.push({ v: 'kit', g: 1, n: kit.flat() });
  const ch0 = Sg.chords ? CH[Sg.chords[0]] : null, secs = +(total * sd).toFixed(2);
  return { meta: { title: id, secs, beats: total / (Sg.steps / 4), tempo: [[0, Sg.bpm, 0]], key: ch0 ? 48 + (ch0[0] % 12) + 12 : 60, minor: !!(ch0 && Sg.chords[0].startsWith('Am')) }, parts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(OUT, { recursive: true });
  const table = {};
  for (const f of readdirSync(join(ROOT, 'tools/music/songs')).filter((x) => x.endsWith('.js')).sort()) {
    const song = (await import(pathToFileURL(join(ROOT, 'tools/music/songs', f)).href)).default;
    const { meta, parts } = compileScore(song);
    writeFileSync(join(OUT, song.id + '.json'), JSON.stringify({ id: song.id, secs: meta.secs, parts }));
    table[song.id] = meta;
  }
  const M = await import(pathToFileURL(join(ROOT, 'client/sound/music.js')).href);
  for (const id of ['club', 'shop', 'lobby', 'drivein']) {
    const { meta, parts } = compileSynth(id, M.SONGS[id], M.CH);
    writeFileSync(join(OUT, id + '.json'), JSON.stringify({ id, secs: meta.secs, parts }));
    table[id] = meta;
  }
  const lines = Object.entries(table).map(([id, m]) => `  ${JSON.stringify(id)}: ${JSON.stringify(m)},`);
  writeFileSync(join(ROOT, 'shared/music-songs.js'), `// Made by tools/music/songbook.mjs from the song scores (tools/music/songs/*.js) and the live synth's songs (client/sound/
// music.js SONGS) - edit those, then run it again. Each song as the game times it: its length (secs), its beats, its
// tempo map ([from s, bpm, at beat]), its key (MIDI note of the tonic) and whether it's minor.
export const SONGS = {
${lines.join('\n')}
};
`);
  console.log('songbook:', Object.keys(table).length, 'songs');
}
