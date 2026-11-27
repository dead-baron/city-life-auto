// Security audit (chat safety), report-only: what gets past the word filter (chatfilter.js check) and the contact masking
// (chatfilter.js contact) once a line has been through chat.js send's own clean-up (control and bidi characters to
// spaces). The listed words are never printed: each is shown as its category and list, the outcome per disguise counted.
// Prints what happened; never asserts, never fixes.   node --max-old-space-size=3072 tools/audit/sec-acct-chatfilter.mjs
import { readFileSync } from 'node:fs';
import { filter, contact } from '../../server/chatfilter.js';

// chat.js:157 - what send() does to a line before the filters
const clean = (t) => t.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
const F = filter();
const words = JSON.parse(readFileSync(new URL('../../server/chatwords.json', import.meta.url), 'utf8'));

// look-alikes that chatfilter.js FOLD doesn't know and NFKD doesn't take apart
const ALT = { a: 'ɑ', c: 'ϲ', e: 'ҽ', i: 'ı', o: 'օ', s: 'ꜱ', u: 'ս', g: 'ց', n: 'ո', h: 'һ', k: 'ᴋ', r: 'ʀ', t: 'ᴛ', y: 'ʏ', p: 'ᴘ', d: 'ԁ', l: 'ӏ', b: 'ʙ', f: 'ꞙ', m: 'ᴍ', w: 'ᴡ', x: 'х', v: 'ᴠ', z: 'ᴢ', j: 'ϳ', q: 'ԛ' };
const swapOne = (w) => { for (let i = 0; i < w.length; i++) if (ALT[w[i]]) return w.slice(0, i) + ALT[w[i]] + w.slice(i + 1); return w; };
const DISGUISE = {
  plain: (w) => `you ${w}`,
  'letters spaced': (w) => `you ${w.split('').join(' ')}`,
  'split in two': (w) => `you ${w.slice(0, 2)} ${w.slice(2)}`,
  'dots between': (w) => `you ${w.split('').join('.')}`,
  'zero-width U+200B': (w) => `you ${w.split('').join('​')}`,
  'word joiner U+2060': (w) => `you ${w.split('').join('⁠')}`,
  'soft hyphen U+00AD': (w) => `you ${w.split('').join('­')}`,
  'Hangul filler U+3164': (w) => `you ${w.split('').join('ㅤ')}`,
  fullwidth: (w) => `you ${[...w].map((ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).join('')}`,
  'one unmapped look-alike': (w) => `you ${swapOne(w)}`,
  'combining mark on each': (w) => `you ${w.split('').join('̶')}`,
  reversed: (w) => `you ${[...w].reverse().join('')}`,
};
const out = {};
for (const cat of ['hate', 'sexual']) for (const k of ['sub', 'word', 'pre']) for (const w0 of words[cat][k] || []) {
  const w = String(w0).toLowerCase();
  if (!/^[a-z]{4,}$/.test(w)) continue;
  for (const [d, f] of Object.entries(DISGUISE)) {
    const line = clean(f(w)), r = F.check(line);
    const o = (out[d] ||= { tried: 0, through: 0 });
    o.tried++; if (!r.hits.length) o.through++;
  }
}
console.log('WORD FILTER (hate + sexual lists, words of 4+ letters): lines that came through unmasked');
for (const [d, o] of Object.entries(out)) console.log(`  ${(d + ' '.repeat(26)).slice(0, 26)} ${o.through}/${o.tried} unmasked`);

const CONTACT = [
  ['phone, plain', 'call me 555 123 4567'],
  ['phone, dashes', 'text 555-123-4567'],
  ['phone, fullwidth digits', 'call me ５５５ １２３ ４５６７'],
  ['phone, Arabic-Indic digits', 'call ٥٥٥١٢٣٤٥٦٧'],
  ['phone, word joiners', 'call 555⁠123⁠4567'],
  ['phone, letters between', 'call 555a123b4567'],
  ['phone, words + digits', 'call five five five 123 4567'],
  ['phone, two lines', '555 123'],
  ['phone, O for 0', 'call 555 1O3 4567'],
  ['email, plain', 'mail me bob99@gmail.com'],
  ['email, no tld', 'mail me bob99@gmail'],
  ['email, "at" no dot', 'bob99 at gmail'],
  ['email, spaced letters', 'b o b 9 9 @ g m a i l . c o m'],
  ['email, fullwidth @', 'bob99＠gmail.com'],
  ['email, " at  gmail dot com"', 'bob99 at gmail dot com'],
  ['email, (at) [dot]', 'bob99 (at) gmail [dot] com'],
  ['url, plain', 'go to https://evil.example/x'],
  ['domain, .com', 'see evil.com'],
  ['domain, spaced dot', 'see evil . com'],
  ['domain, "dot" word', 'see evil dot com'],
  ['domain, fullwidth dot', 'see evil．com'],
  ['discord invite', 'join discord.gg/abc123'],
  ['discord invite, spaced', 'join discord . gg / abc123'],
  ['discord invite, "dot"', 'join discord dot gg slash abc123'],
  ['handle, snap: x', 'my snap: bob_99'],
  ['handle, snap x (plain)', 'add my snap bobby'],
  ['handle, sn@p', 'sn@p bob_99'],
  ['handle, s n a p', 's n a p bob_99'],
  ['handle, insta is', 'my insta is bobby'],
  ['handle, @ alone', 'follow @bobby99'],
  ['handle, discord tag', 'add bobby#1234'],
  ['handle, discord new name', 'discord: bobby.99'],
  ['handle, "dc"', 'dc bobby99'],
  ['address', 'i live at 221 Baker Street'],
  ['address, no street word', 'i live at 221 Baker'],
];
console.log('\nCONTACT MASKING (chatfilter.js contact): what the other player sees');
for (const [what, t] of CONTACT) {
  const line = clean(t), r = contact(line, ['https://discord.gg/zuVSkbfjg']);
  console.log(`  ${(what + ' '.repeat(30)).slice(0, 30)} ${r.hits.length ? 'masked  ' : 'THROUGH '} ${JSON.stringify(r.text)}`);
}
