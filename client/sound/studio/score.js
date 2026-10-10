// Writing music down. A part is a line of notes, a progression of chords turned into a pad, a comp, a strum, an
// arpeggio, a picked pattern or a bass line, or a drum grid. Times are in beats (a quarter note is 1); bar lines in a
// line are checked, so a wrong duration is caught where it was written, not heard three bars later.
//
// Notes:   C4 is middle C. A token is [!|?]PITCH[/DUR][']...  - ! accent, ? soft; PITCH a note (F#3, Bb5), a chord of
//          notes joined by + (C4+E4+G4), r for a rest or _ to hold the note before a little longer; DUR 1 2 4 8 16 32,
//          with . (dotted) or t (triplet), and + to add (4+8 is a quarter tied to an eighth); the last DUR carries on
//          when left out. A ' after it plays it short; a ~ slides into the next note. :a / :o / :u / :i / :e sets the
//          vowel for a sung part. | is a bar line.
// Chords:  'Am7 D9 | Gmaj7 | C . . G' - a bar per |, the chords in a bar share it evenly (. holds the one before), or
//          take a length with a colon (Am7:3 D7:1). Slash chords name their bass (C/E).
// Drums:   { kick: 'x...x...', snare: '....x...' } - one string per bar (| between bars), its length the grid
//          (16 = sixteenths), X loud, x normal, o soft; a part shorter than its section repeats.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteToMidi(s) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`not a note: ${s}`);
  return 12 * (Number(m[3]) + 1) + PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function parseDur(s) {
  let beats = 0;
  for (const part of s.split('+')) {
    const m = /^(\d+)(\.|t)?$/.exec(part);
    if (!m) throw new Error(`not a length: ${s}`);
    let b = 4 / Number(m[1]);
    if (m[2] === '.') b *= 1.5;
    if (m[2] === 't') b *= 2 / 3;
    beats += b;
  }
  return beats;
}

// A line of notes -> [{ t, d, m: [midi...] | null, v, stac, slide, vowel }]
export function parseLine(str, beatsPerBar = 4, where = '') {
  const out = [];
  let t = 0, dur = 1, bar = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') {
      bar++;
      if (Math.abs(t - bar * beatsPerBar) > 1e-6) throw new Error(`${where}: bar ${bar} ends at beat ${(t - (bar - 1) * beatsPerBar).toFixed(3)} of ${beatsPerBar} (${str.slice(0, 60)}...)`);
      continue;
    }
    const m = /^([!?]?)([A-Ga-g][#b]?-?\d(?:\+[A-Ga-g][#b]?-?\d)*|r|_)(?:\/([0-9.t+]+))?([~']*)(?::([a-z]+))?$/.exec(tok);
    if (!m) throw new Error(`${where}: can't read "${tok}"`);
    if (m[3]) dur = parseDur(m[3]);
    if (m[2] === '_') { const last = out[out.length - 1]; if (last) last.d += dur; t += dur; continue; }
    const v = m[1] === '!' ? 1 : m[1] === '?' ? 0.5 : 0.78;
    out.push({ t, d: dur, m: m[2] === 'r' ? null : m[2].split('+').map(noteToMidi), v, stac: m[4].includes("'"), slide: m[4].includes('~'), vowel: m[5] || null });
    t += dur;
  }
  const notes = out.filter((e) => e.m);
  notes.len = t;
  return notes;
}

// ---- chords ---------------------------------------------------------------------------------------------------------
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim: [0, 3, 6],
  dim7: [0, 3, 6, 9], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], 11: [0, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 14, 17], 13: [0, 4, 7, 10, 14, 21], '7#9': [0, 4, 7, 10, 15], '7b9': [0, 4, 7, 10, 13], mMaj7: [0, 3, 7, 11],
  '7#11': [0, 4, 7, 10, 18], 'maj7#11': [0, 4, 7, 11, 18], '6/9': [0, 4, 7, 9, 14], m6add9: [0, 3, 7, 9, 14], '7b13': [0, 4, 7, 10, 20],
};
export function parseChord(s) {
  const [main, slash] = s.split('/');
  const m = /^([A-G])([#b]?)(.*)$/.exec(main);
  if (!m || !(m[3] in QUAL)) throw new Error(`not a chord: ${s}`);
  const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  let bass = root;
  if (slash) { const b = /^([A-G])([#b]?)$/.exec(slash); if (!b) throw new Error(`not a bass note: ${s}`); bass = (PC[b[1]] + (b[2] === '#' ? 1 : b[2] === 'b' ? -1 : 0) + 12) % 12; }
  return { name: s, root, iv: QUAL[m[3]], bass };
}
export function parseChords(str, beatsPerBar = 4) {
  const out = [];
  let t = 0, prev = null;
  for (const barStr of str.split('|').map((b) => b.trim()).filter(Boolean)) {
    const toks = barStr.split(/\s+/);
    const fixed = toks.reduce((s, x) => s + (x.includes(':') ? Number(x.split(':')[1]) : 0), 0), free = toks.filter((x) => !x.includes(':')).length;
    const each = free ? (beatsPerBar - fixed) / free : 0;
    for (const tok of toks) {
      const [name, len] = tok.split(':');
      const d = len ? Number(len) : each;
      if (name === '.' && prev) prev.d += d;
      else { prev = { t, d, ...parseChord(name) }; out.push(prev); }
      t += d;
    }
  }
  out.len = t;
  return out;
}
export function chordAt(chords, t) { let c = chords[0]; for (const x of chords) if (x.t <= t + 1e-9) c = x; return c; }

// the chord's tones as pitch classes, the root first
function tonesPC(c) { return c.iv.map((i) => (c.root + i) % 12); }

// a voicing in [lo, hi] closest to the one before (smooth voice leading). size = how many notes: a fuller chord
// loses its fifth first, then its root (the bass has it); a smaller one doubles its lowest tone an octave up.
export function voice(c, lo, hi, prev, size) {
  let pcs = [...new Set(tonesPC(c))];
  if (size && pcs.length > size && pcs.length >= 3) pcs = pcs.filter((_, i) => i !== 2);
  if (size && pcs.length > size) pcs = pcs.slice(1);
  if (size && pcs.length > size) pcs = pcs.slice(0, size);
  const cands = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = pcs.slice(inv).concat(pcs.slice(0, inv));
    for (let base = lo; base < lo + 12; base++) {
      if (base % 12 !== order[0]) continue;
      const notes = [base];
      for (let k = 1; k < order.length; k++) { let n = notes[k - 1] + 1; while (n % 12 !== order[k]) n++; notes.push(n); }
      while (size && notes.length < size) notes.push(notes[notes.length - pcs.length] + 12);
      if (notes[notes.length - 1] <= hi) cands.push(notes);
    }
  }
  if (!cands.length) return pcs.map((pc) => { let n = lo; while (n % 12 !== pc) n++; return n; }).sort((a, b) => a - b);
  const mid = (lo + hi) / 2, centre = (v) => (v[0] + v[v.length - 1]) / 2;
  if (!prev) return cands.sort((a, b) => Math.abs(centre(a) - mid) - Math.abs(centre(b) - mid))[0];
  const p = prev.slice().sort((a, b) => a - b);
  const cost = (v) => { let s = 0; for (let k = 0; k < v.length; k++) s += Math.abs(v[k] - p[Math.min(k, p.length - 1)]); return s + Math.abs(centre(v) - mid) * 0.3; };
  return cands.sort((a, b) => cost(a) - cost(b))[0];
}

// a guitar's voicing: the bass note low, then the chord stacked as an open chord might lie (E2-G4)
export function guitarVoicing(c, lo = 40) {
  let b = lo; while (b % 12 !== c.bass) b++;
  const out = [b];
  const pcs = tonesPC(c);
  const fifth = (c.root + (c.iv.includes(7) ? 7 : c.iv.includes(6) ? 6 : c.iv.includes(8) ? 8 : 7)) % 12;
  let n = b + 1; while (n % 12 !== fifth) n++; out.push(n);
  const upper = [c.root, pcs[1] ?? c.root, fifth, ...pcs.slice(3)];
  let last = n;
  for (const pc of upper) { let m = last + 1; while (m % 12 !== pc) m++; if (m <= 72) { out.push(m); last = m; } }
  return out;
}

function steps(pattern, bars, beatsPerBar) {
  // a pattern string per bar ('|' between bars), cycled over the section's bars -> [{ t, ch, step }]
  const parts = pattern.split('|').map((p) => p.replace(/\s+/g, ''));
  const out = [];
  for (let b = 0; b < bars; b++) {
    const p = parts[b % parts.length], n = p.length, dt = beatsPerBar / n;
    for (let i = 0; i < n; i++) out.push({ t: b * beatsPerBar + i * dt, ch: p[i], dt });
  }
  return out;
}
const VEL = { X: 1, x: 0.78, o: 0.45, D: 0.85, U: 0.6, d: 0.55, u: 0.4 };
function lengthOf(st, k) { let d = st[k].dt; for (let j = k + 1; j < st.length && st[j].ch === '-'; j++) d += st[j].dt; return d; }

export function genPad(chords, o) {
  let prev = null;
  return chords.map((c) => { const v = voice(c, o.lo ?? 52, o.hi ?? 74, prev, o.size); prev = v; return { t: c.t, d: c.d, m: v, v: o.vel ?? 0.7 }; });
}
export function genComp(chords, pattern, bars, bpb, o) {
  const st = steps(pattern, bars, bpb), out = [];
  let prev = null;
  st.forEach((s, k) => {
    if (!(s.ch in VEL)) return;
    const c = chordAt(chords, s.t), v = voice(c, o.lo ?? 55, o.hi ?? 76, prev, o.size); prev = v;
    out.push({ t: s.t, d: lengthOf(st, k) * (o.gate ?? 0.85), m: v, v: VEL[s.ch] });
  });
  return out;
}
export function genStrum(chords, pattern, bars, bpb, o) {
  const st = steps(pattern, bars, bpb), out = [], spread = o.spread ?? 0.022;
  st.forEach((s, k) => {
    if (!(s.ch in VEL)) return;
    const c = chordAt(chords, s.t), gv = guitarVoicing(c, o.lo ?? 40), up = s.ch === 'U' || s.ch === 'u';
    const strings = up ? gv.slice(-4).reverse() : gv;
    const d = lengthOf(st, k) * (o.gate ?? 0.95);
    strings.forEach((m, j) => out.push({ t: s.t, dt: j * spread, d, m: [m], v: VEL[s.ch] * (1 - j * 0.04) }));
  });
  return out;
}
export function genArp(chords, pattern, bars, bpb, o) {
  const st = steps(pattern, bars, bpb), out = [];
  let prev = null;
  st.forEach((s, k) => {
    if (s.ch === '.' || s.ch === '-') return;
    const c = chordAt(chords, s.t);
    const base = o.pick ? guitarVoicing(c, o.lo ?? 40) : (prev = voice(c, o.lo ?? 60, (o.lo ?? 60) + 14, prev, o.size));
    const notes = o.pick ? base : base.concat(base.map((n) => n + 12), base.map((n) => n + 24));
    const idx = parseInt(s.ch, 36);
    if (Number.isNaN(idx)) return;
    out.push({ t: s.t, d: lengthOf(st, k) * (o.gate ?? 0.9), m: [notes[Math.min(idx, notes.length - 1)]], v: o.vel ?? 0.7 });
  });
  return out;
}
export function genBass(chords, pattern, bars, bpb, o) {
  const st = steps(pattern, bars, bpb), out = [];
  const lo = o.lo ?? 33;   // (A1: the bass register is [lo, lo + 11])
  const rootIn = (pc) => { let n = lo; while (n % 12 !== pc) n++; return n; };
  st.forEach((s, k) => {
    const ch = s.ch;
    if (ch === '.' || ch === '-') return;
    const c = chordAt(chords, s.t), r = rootIn(c.bass);
    const cr = rootIn(c.root);
    const has = (iv) => c.iv.includes(iv);
    let m;
    if (ch === 'R' || ch === 'x') m = r;
    else if (ch === '5') m = cr + (has(6) ? 6 : has(8) ? 8 : 7);
    else if (ch === '3') m = cr + (has(3) ? 3 : has(5) ? 5 : 4);
    else if (ch === '7') m = cr + (has(10) ? 10 : has(11) ? 11 : 12);
    else if (ch === '8') m = r + 12;
    else if (ch === '2') m = cr + 2;
    else if (ch === '4') m = cr + 5;
    else if (ch === '6') m = cr + 9;
    else if (ch === 'a' || ch === 'A') { const nx = chordAt(chords, s.t + s.dt + 1e-6); const nr = rootIn(nx.bass); m = ch === 'a' ? nr - 1 : nr + 1; }
    else if (ch === 'L') m = r - 12;
    else return;
    const short = ch === 'x';
    out.push({ t: s.t, d: short ? s.dt * 0.4 : lengthOf(st, k) * (o.gate ?? 0.9), m: [m], v: short ? 0.4 : (k % (st.length / bars) === 0 ? 0.9 : 0.75) });
  });
  return out;
}

// a second line under a tune: the chord tone (or, failing that, the scale tone) a third or so below each note
export function harmonize(line, chords, o = {}) {
  const lo = o.min ?? 3, hi = o.max ?? 9;
  return line.map((e) => {
    const top = Math.max(...e.m), c = chordAt(chords, e.t), pcs = tonesPC(c);
    let best = null;
    for (let d = lo; d <= hi && best === null; d++) if (pcs.includes(((top - d) % 12 + 12) % 12)) best = top - d;
    if (best === null) best = top - (o.fallback ?? 4);
    return { ...e, m: [best], v: e.v * (o.vel ?? 0.85) };
  });
}

// a drum grid -> [{ t, name, v, f }] ('timp@D2' carries its pitch)
export function parseDrums(spec, bars, bpb) {
  const out = [];
  for (const [key, pat] of Object.entries(spec)) {
    const [name, note] = key.split('@');
    for (const s of steps(pat, bars, bpb)) {
      if (!(s.ch in VEL)) continue;
      out.push({ t: s.t, name, v: VEL[s.ch], note: note ? noteToMidi(note) : null });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
