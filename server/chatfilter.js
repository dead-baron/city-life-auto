// The chat and username filter (the owner, 11-03: "a word filter that masks hate and sexual terms and catches leetspeak,
// spacing and repeats"). The words live in server/chatwords.json (hate, sexual, profanity, allow). A message is
// read as a skeleton - lower case, accents and look-alike letters folded, everything but letters and the leetspeak
// digits and signs dropped - so "N 1 g g 3 r", "f.u.c.k" and "fuuuuck" read as the words they are; each listed word is
// matched letter by letter, a letter standing for itself repeated or its leet forms ("4" or "@" for a). Matches are
// masked with * in the original text; a match inside an allowed word ("therapist", "cocktail") is left alone.
import { readFileSync } from 'node:fs';

const LEET = { a: 'a4@', b: 'b8', e: 'e3', g: 'g9', i: 'i1!|l', l: 'l1|i', o: 'o0', s: 's5$z', t: 't7+', z: 'z2' };
// look-alikes from other scripts (Cyrillic, Greek) and a few symbols folded to Latin
const FOLD = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'к': 'k', 'м': 'm', 'н': 'h', 'т': 't', 'в': 'b', 'α': 'a', 'ο': 'o', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', '€': 'e', '£': 'l', '¡': 'i' };
const KEEP = /[a-z0-9@$!|+]/;
const escRe = (s) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

// letters (and the leet signs) of a text, with where each came from in the original
export function skeleton(text) {
  const out = [], at = [];
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    let c = s[i].toLowerCase();
    c = FOLD[c] || c.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    for (const ch of c) if (KEEP.test(ch)) { out.push(ch); at.push(i); }
  }
  return { s: out.join(''), at };
}
// a word -> a pattern over skeletons: each letter its leet forms, repeated; a doubled letter at least twice
function pattern(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  let re = '';
  for (let i = 0; i < w.length;) {
    let n = 1;
    while (w[i + n] === w[i]) n++;
    const cls = `[${escRe(LEET[w[i]] || w[i])}]`, last = i + n >= w.length;
    // (repeats anywhere but the last letter: "fuuuck" yes, and the word ends where the listed one does - "slut there"
    // masks "slut", not the t of "there")
    re += n > 1 ? `${cls}{${n}${last ? '' : ','}}` : last ? cls : `${cls}+`;
    i += n;
  }
  return re;
}

export function createFilter(data) {
  const cats = {};
  for (const cat of ['hate', 'sexual', 'profanity']) {
    const d = data[cat] || {};
    cats[cat] = {
      sub: (d.sub || []).map((w) => ({ w, re: new RegExp(pattern(w), 'g') })),
      word: (d.word || []).map((w) => ({ w, re: new RegExp(`^${pattern(w)}$`) })),
      pre: (d.pre || []).map((w) => ({ w, re: new RegExp(`^${pattern(w)}`) })),
    };
  }
  const allow = (data.allow || []).map((w) => w.toLowerCase());

  // the tokens of a text: its words, and runs of single letters read as one ("f u c k"), each with its span
  function tokens(text) {
    const words = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) words.push({ a: m.index, b: m.index + m[0].length, t: m[0] });
    const out = words.slice();
    for (let i = 0; i < words.length;) {
      if (skeleton(words[i].t).s.length !== 1) { i++; continue; }
      let j = i;
      while (j + 1 < words.length && skeleton(words[j + 1].t).s.length === 1) j++;
      if (j > i) out.push({ a: words[i].a, b: words[j].b, t: words.slice(i, j + 1).map((w) => w.t).join('') });
      i = j + 1;
    }
    return out;
  }
  // which spans of the original text are listed words, by category: [{ cat, w, a, b }]
  function find(text, which) {
    const hits = [];
    const sk = skeleton(text);
    // allowed words, found in the plain letters (no leet), as spans of the original
    const plain = String(text).toLowerCase();
    const okSpans = [];
    for (const w of allow) { let i = plain.indexOf(w); while (i >= 0) { okSpans.push([i, i + w.length]); i = plain.indexOf(w, i + 1); } }
    const allowed = (a, b) => okSpans.some(([x, y]) => a >= x && b <= y);
    const toks = tokens(text);
    for (const cat of which) {
      const C = cats[cat];
      for (const { w, re } of C.sub) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(sk.s))) {
          let end = m.index + m[0].length;
          while (end < sk.s.length && sk.s[end] === sk.s[end - 1] && sk.at[end] === sk.at[end - 1] + 1) end++;   // (the last letter held on: "niggerrr" whole)
          const a = sk.at[m.index], b = sk.at[end - 1] + 1;
          if (!allowed(a, b)) hits.push({ cat, w, a, b });
          if (m[0].length === 0) re.lastIndex++;
        }
      }
      for (const tok of toks) {
        const ts = skeleton(tok.t).s;
        if (!ts) continue;
        for (const { w, re } of C.word) if (re.test(ts) && !allowed(tok.a, tok.b)) hits.push({ cat, w, a: tok.a, b: tok.b });
        for (const { w, re } of C.pre) if (re.test(ts) && !allowed(tok.a, tok.b)) hits.push({ cat, w, a: tok.a, b: tok.b });
      }
    }
    return hits;
  }
  // chat: -> { text (masked), hits: [{ cat, w }], hate: bool }
  function check(text) {
    const s = String(text);
    const hits = find(s, ['hate', 'sexual']);
    if (!hits.length) return { text: s, hits: [], hate: false };
    const chars = [...s];
    // (indices are UTF-16 code units; map them through the code points)
    const cu = []; { let k = 0; for (let i = 0; i < chars.length; i++) { cu.push(k); k += chars[i].length; } cu.push(k); }
    const mask = new Set();
    for (const h of hits) for (let i = 0; i < chars.length; i++) if (cu[i] >= h.a && cu[i] < h.b && /\S/.test(chars[i])) mask.add(i);
    const out = chars.map((c, i) => (mask.has(i) ? '*' : c)).join('');
    return { text: out, hits: hits.map(({ cat, w }) => ({ cat, w })), hate: hits.some((h) => h.cat === 'hate') };
  }
  // usernames: nothing hateful, sexual or profane in them, run together or not
  function nameOk(name) {
    const s = String(name);
    if (find(s, ['hate', 'sexual', 'profanity']).length) return false;
    // a name is read as one word too ("Big_D1ck" -> "bigd1ck"): every listed word anywhere in it
    const flat = skeleton(s).s;
    for (const cat of ['hate', 'sexual', 'profanity']) {
      const C = cats[cat];
      for (const { w, re } of [...C.word, ...C.pre]) {
        if (w.length < 4) continue;   // (three letters turn up inside ordinary names: Cassandra, Sexton)
        const loose = new RegExp(re.source.replace(/^\^/, '').replace(/\$$/, ''));
        if (loose.test(flat) && !allow.some((w) => flat.includes(w))) return false;
      }
    }
    return true;
  }
  return { check, nameOk, find };
}

let shared = null;
export function filter() {
  if (!shared) shared = createFilter(JSON.parse(readFileSync(new URL('./chatwords.json', import.meta.url), 'utf8')));
  return shared;
}
