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

// ---- Contact details and personal-info fishing (the owner, 11-15: the beta is open to players 13+) ----------------------
// contact(text, links) masks with * what would take a talk out of the game or find someone at home: phone numbers (7+
// digits with separators, 10+ run together, or spelled out: "five five five ..."), email addresses ("at" / "dot" spelled
// too), links and bare domains (except our own: deadbaron.com, and `links` - the Discord invite, the Ko-fi page), street
// addresses (a house number, a name, a street word) and handles in context ("my snap is ...", "insta: ...", "discord
// Name#1234"). Game talk stays: "$5000", "3 stars", "10:30", "1,000,000", "5 blocks down the road".
// -> { text, hits: ['phone' | 'email' | 'link' | 'address' | 'handle', ...] }
const TLD = 'com|net|org|io|gg|tv|xyz|app|info|biz|ly|link|site|online|club|live|chat|fun|ru|de|uk|ca|au|cc|nl|pl|br|jp|eu|edu|gov|store|shop|ee|tk';
const TLD_WEAK = 'me|co|to|in|be|us|it|is|so|at|ai|ws|fm|im|sh|gl|gd|dev|page|gs';
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const RX = {
  email: new RegExp(`[a-z0-9._%+-]+\\s*(?:@|\\(at\\)|\\[at\\])\\s*${LABEL}(?:\\s*(?:\\.|\\(dot\\)|\\[dot\\])\\s*${LABEL})*\\s*(?:\\.|\\(dot\\)|\\[dot\\])\\s*[a-z]{2,}`, 'gi'),
  emailWords: new RegExp(`[a-z0-9._%+-]{2,}\\s+at\\s+${LABEL}\\s+dot\\s+(?:${TLD}|${TLD_WEAK})\\b`, 'gi'),
  url: /\b(?:https?:\/\/|www\.)[^\s]+/gi,
  domain: new RegExp(`(?<![@\\w.])${LABEL}(?:\\.${LABEL})*\\.(?:${TLD})\\b(?:\\/[^\\s]*)?`, 'gi'),
  domainWeak: new RegExp(`(?<![@\\w.])${LABEL}(?:\\.${LABEL})*\\.(?:${TLD_WEAK})\\/[^\\s]*`, 'gi'),
  domainSpaced: /\b([a-z0-9-]{2,})\s*(?:\s\.\s*|\.\s+|\(dot\)|\[dot\]|\sdot\s)\s*(?:com|net|org|gg|io)\b/gi,
  phone: /(?<![\w$#£€.,])\+?\(?\d[\d\s().\-]{5,}\d(?![\w%])/g,
  tag: /(?<![\w#])[a-z][\w.]{2,31}#\d{4}\b/gi,
};
const NOT_DOMAIN = new Set(['the', 'a', 'that', 'this', 'like', 'some', 'any', 'no']);
const DIGIT_WORD = { zero: 1, oh: 1, one: 1, two: 1, three: 1, four: 1, five: 1, six: 1, seven: 1, eight: 1, nine: 1 };
const STREET = /^(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|terrace|highway|hwy|parkway|pkwy|crescent|cres)\.?$/i;
const STREET_CAP = /^(Way|Place|Circle|Plaza|Square|Close|Row)\.?$/;
// (words that say a number is a count, not a house number: "5 blocks down the road", "10 min drive", "2 more lanes")
const COUNTS = new Set(['more', 'other', 'hours', 'hour', 'hrs', 'hr', 'minutes', 'minute', 'mins', 'min', 'seconds', 'second', 'secs', 'sec', 'times', 'time', 'km', 'miles', 'mile', 'mi', 'm', 'meters', 'metres', 'of', 'the', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'at', 'for', 'with', 'my', 'your', 'ur', 'our', 'their', 'his', 'her', 'stars', 'star', 'cops', 'people', 'guys', 'players', 'lap', 'laps', 'blocks', 'block', 'cars', 'car', 'kills', 'down', 'up', 'from', 'off', 'is', 'are', 'was', 'lol', 'hit', 'wanted', 'lanes', 'lane', 'mph', 'kph', 'way', 'ways', 'u', 'you', 'we', 'i', 'it', 'by', 'left', 'right', 'turn', 'whole', 'long', 'short', 'big', 'little']);
const PLATFORMS = 'snapchat|snap|insta|instagram|ig|tiktok|discord|whatsapp|telegram|kik|twitter|facebook|fb|skype|wechat|roblox|psn|xbox|steam|twitch|youtube';
const HANDLE_RX = new RegExp(`(\\b(?:my|ur|your|his|her)\\s+)?\\b(?:${PLATFORMS})\\b(\\s*(?:[:=-]|\\b(?:is|its|it's|name|username|user|handle|id|tag)\\b)?[\\s:=-]*)(@?)([a-z0-9_][a-z0-9_.]{2,31}(?:#\\d{4})?)`, 'gi');
const NOT_HANDLE = new Set(['me', 'you', 'too', 'and', 'the', 'later', 'now', 'pls', 'please', 'plz', 'lol', 'bro', 'server', 'account', 'app', 'chat', 'call', 'group', 'link', 'not', 'yes', 'yeah', 'nah', 'cool', 'maybe', 'then', 'tho', 'though', 'sometime', 'tonight', 'tomorrow', 'today', 'tmrw', 'instead', 'right', 'also', 'one', 'name', 'username', 'handle', 'acc', 'dms', 'dm', 'story', 'stories', 'videos', 'video', 'live', 'stream', 'channel', 'friend', 'friends', 'game', 'games', 'with', 'for', 'about', 'any', 'down', 'back', 'out', 'yet', 'ok', 'okay']);
const ourLink = (s, links) => {
  const k = (x) => String(x || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/.]+$/, '');
  const v = k(s);
  if (/^([a-z0-9-]+\.)*deadbaron\.com(\/|$)/.test(v)) return true;
  return links.some((l) => { const w = k(l); return w && (v === w || v.startsWith(w + '/') || v.startsWith(w + '?')); });
};

export function contact(text, links = []) {
  const s = String(text), spans = [], hits = new Set();
  const add = (a, b, kind) => { spans.push([a, b]); hits.add(kind); };
  const taken = (a, b) => spans.some(([x, y]) => a < y && x < b);
  let m;
  for (const re of [RX.email, RX.emailWords]) { re.lastIndex = 0; while ((m = re.exec(s))) add(m.index, m.index + m[0].length, 'email'); }
  for (const re of [RX.url, RX.domain, RX.domainWeak]) {
    re.lastIndex = 0;
    while ((m = re.exec(s))) {
      const a = m.index, b = a + m[0].replace(/[.,!?)]+$/, '').length;
      if (taken(a, b) || ourLink(s.slice(a, b), links)) continue;
      if (!/[a-z]/i.test(s.slice(a, b).split('.')[0])) continue;   // ("3.de" isn't a link)
      add(a, b, 'link');
    }
  }
  RX.domainSpaced.lastIndex = 0;
  while ((m = RX.domainSpaced.exec(s))) { if (!NOT_DOMAIN.has(m[1].toLowerCase()) && !taken(m.index, m.index + m[0].length) && !ourLink(m[0].replace(/\s+|\(dot\)|\[dot\]|\sdot\s/gi, '.').replace(/\.+/g, '.'), links)) add(m.index, m.index + m[0].length, 'link'); }
  // phone numbers: 7-15 digits with separators, or 10+ run together; not money ($5000), thousands (1.000.000) or a time
  RX.phone.lastIndex = 0;
  while ((m = RX.phone.exec(s))) {
    const t = m[0], digits = t.replace(/\D/g, '').length, a = m.index, b = a + t.length;
    if (digits < 7 || digits > 15 || taken(a, b)) continue;
    if (/^\d{1,3}([.,]\d{3})+$/.test(t)) continue;
    if (/^\d+$/.test(t) && digits < 10) continue;
    add(a, b, 'phone');
  }
  // spelled out: seven or more digits as words (and digit groups) in a row
  {
    const toks = [], re = /[a-z0-9]+/gi;
    while ((m = re.exec(s))) toks.push({ a: m.index, b: m.index + m[0].length, w: m[0].toLowerCase(), gap: s.slice(toks.length ? toks[toks.length - 1].b : 0, m.index) });
    let i = 0;
    while (i < toks.length) {
      const isD = (t) => DIGIT_WORD[t.w] || /^\d+$/.test(t.w);
      if (!isD(toks[i])) { i++; continue; }
      let j = i, n = 0, words = 0;
      while (j < toks.length && isD(toks[j]) && (j === i || /^[\s,.\-]*$/.test(toks[j].gap))) { n += DIGIT_WORD[toks[j].w] ? 1 : toks[j].w.length; if (DIGIT_WORD[toks[j].w]) words++; j++; }
      if (n >= 7 && words >= 3 && !taken(toks[i].a, toks[j - 1].b)) add(toks[i].a, toks[j - 1].b, 'phone');
      i = Math.max(j, i + 1);
    }
  }
  // street addresses: a house number, one to three words, a street word ("221 Baker Street", "12 n main st")
  {
    const words = [], re = /\S+/g;
    while ((m = re.exec(s))) words.push({ a: m.index, b: m.index + m[0].length, w: m[0].replace(/[,;!?]+$/, '') });
    for (let i = 0; i < words.length; i++) {
      if (!/^\d{1,5}[a-z]?$/i.test(words[i].w)) continue;
      for (let k = 2; k <= 4 && i + k < words.length; k++) {
        const mid = words.slice(i + 1, i + k), last = words[i + k];
        if (!(STREET.test(last.w) || STREET_CAP.test(last.w))) continue;
        if (mid.some((x) => COUNTS.has(x.w.toLowerCase()) || !/^([a-z][a-z'.-]*|\d+(st|nd|rd|th))$/i.test(x.w))) break;
        if (!taken(words[i].a, last.b)) add(words[i].a, last.a + last.w.length, 'address');
        break;
      }
    }
  }
  // handles: after a platform's name, with a ":" "is" "name" or "@" - or one that looks like a handle (digits, _ or .)
  HANDLE_RX.lastIndex = 0;
  while ((m = HANDLE_RX.exec(s))) {
    const poss = !!m[1], sep = m[2] || '', at = m[3], h = m[4];
    const hs = m.index + m[0].length - h.length, he = hs + h.length;
    if (NOT_HANDLE.has(h.toLowerCase()) || !/[a-z]/i.test(h) || taken(hs - at.length, he)) { HANDLE_RX.lastIndex = m.index + 1; continue; }
    const strong = !!at || /[0-9_.#]/.test(h) || /[:=@]|\b(name|username|user|handle|id|tag)\b/i.test(sep) || (poss && /\b(is|its|it's)\b/i.test(sep));
    if (strong) add(hs - at.length, he, 'handle');
    else HANDLE_RX.lastIndex = m.index + 1;
  }
  RX.tag.lastIndex = 0;
  while ((m = RX.tag.exec(s))) if (!taken(m.index, m.index + m[0].length)) add(m.index, m.index + m[0].length, 'handle');
  if (!spans.length) return { text: s, hits: [] };
  const out = s.split('');
  for (const [a, b] of spans) for (let i = a; i < b; i++) if (/\S/.test(out[i])) out[i] = '*';
  return { text: out.join(''), hits: [...hits] };
}

// fishing(text) -> the kind of personal info a line asks for ('age' | 'home' | 'school' | 'name' | 'photo' | 'apps' |
// 'secret') or null. Not blocked, not masked: the line goes to the staff's Review list (server/chat.js). "Where are you?"
// (in the game) and "what's your name" (it's over your head) aren't fishing.
const U = '(?:you|u|ya|yu)', UR = '(?:your|ur|yo)', R = '(?:are|r)';
const APPS = 'snap|snapchat|insta|instagram|ig|tiktok|discord|whatsapp|telegram|kik|twitter|facebook|fb|skype|wechat';
const FISH = [
  ['age', new RegExp(`\\bhow old ${R} ${U}\\b|\\bhow old ru\\b|\\basl\\b|\\bwhat(?:'?s| is) ${UR} age\\b|\\b${UR} age\\b|(?:^|\\s)age\\s*\\?|\\b${R} ${U} (?:a )?minor\\b|\\b${R} ${U} (?:under|over) (?:18|eighteen|13|16)\\b|\\b${R} ${U} (?:a )?(?:boy|girl) or (?:a )?(?:boy|girl)\\b|\\bwhat(?:'?s| is) ${UR} (?:birthday|bday|dob)\\b`)],
  ['home', new RegExp(`\\bwhere (?:do |d )?${U} live\\b|\\bwhat (?:city|town|state|country|street) (?:do |d )?${U} live\\b|\\bwhere(?:'?s| is) ${UR} (?:house|home)\\b|\\bwhat(?:'?s| is) ${UR} (?:address|addy)\\b|\\b${UR} (?:home |house )?(?:address|addy)\\b|\\bsend (?:me )?${UR} (?:location|address|addy)\\b|\\bwhere(?:'?s| is) ${UR} (?:location)\\b`)],
  ['school', new RegExp(`\\b(?:what|which) school\\b|\\bwhere (?:do |d )?${U} go to school\\b|\\bwhat grade ${R} ${U}\\b|\\b${UR} school\\b|\\bwhat year ${R} ${U} in\\b`)],
  ['name', new RegExp(`\\b${UR} (?:real|irl|actual|full|last) name\\b|\\bwhat(?:'?s| is) ${UR} name irl\\b|\\breal name\\s*\\?`)],
  ['photo', new RegExp(`\\bsend (?:me )?(?:a |an |some |ur |your |more )?(?:pic|pics|picture|pictures|photo|photos|selfie|selfies|nude|nudes|feet pics)\\b|\\b(?:pic|picture|photo|selfie)s? of ${U}(?:rself)?\\b|\\bshow me ${U}(?:rself)?\\b|\\bwhat do ${U} look like\\b|\\bturn on ${UR} (?:cam|camera)\\b`)],
  ['apps', new RegExp(`\\b(?:add|dm|text|message|msg|hmu|hit me up|follow|call|find|talk to|chat with) (?:me )?(?:on|at|in) (?:${APPS})\\b|\\b(?:what(?:'?s| is)|whats|give me|send me|drop|got|do ${U} have|${U} have|${U} got) (?:${UR} |a )?(?:${APPS}|number|phone number|cell|digits)\\b|\\b${UR} (?:phone )?(?:number|digits|cell|${APPS})\\b(?! of)`)],
  ['secret', new RegExp(`\\bdon'?t tell (?:${UR}|anyone|any1|anybody|nobody) ?(?:parents|mom|mum|dad)?|\\bkeep (?:it|this) (?:a )?secret\\b|\\bour (?:little )?secret\\b|\\b${R} ${UR} parents (?:home|around|there|watching|awake)\\b|\\b${U} home alone\\b|\\b${R} ${U} alone\\b`)],
];
export function fishing(text) {
  const t = ` ${String(text).toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9'?#\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  for (const [k, re] of FISH) if (re.test(t)) return k;
  return null;
}
