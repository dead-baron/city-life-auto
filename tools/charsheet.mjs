// The people's review sheets (docs/tasks/CHARACTERS.md, docs/characters/): the game's own people (client/art2/people.js,
// dressed by the look system) as the game bakes them - one art pixel = 2 x 2 world px (gbuf.js downsample2) - on a flat
// ground, at game scale and 4x. No browser and no dependencies: Node writes the PNG itself.
//   node tools/charsheet.mjs before            -> docs/characters/before.png      (today's people)
//   node tools/charsheet.mjs after             -> docs/characters/after.png       (the polish pass switched on)
//   node tools/charsheet.mjs side              -> docs/characters/side-<name>.png (before | after, one per archetype)
//   node tools/charsheet.mjs grounds           -> docs/characters/grounds.png     (before over after on pavement, grass, sand, night, rain)
//   node tools/charsheet.mjs faces             -> docs/characters/faces.png       (heads at 8x, before over after: every eye, brow, nose and lip option)
//   options: --out file.png, --rows 0,3 (which archetypes), --zoom 4 (the big figures)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { deflateSync, inflateSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { person, setPolish } from '../client/art2/people.js';
import { packGBuf, downsample2 } from '../client/art2/gbuf.js';
import * as LK from '../shared/look.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), mode = argv[0] || 'before';
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const ZOOM = +arg('zoom', 4);

// ---- the eight: men and women of every build, from the look system's starting looks (shared/look.js STARTERS) ----
const start = (name) => structuredClone(LK.STARTERS.find((s) => s.name === name).look);
const withBody = (L, body) => { Object.assign(L.body, body); return LK.validLook(L); };
export const EIGHT = [
  ['slim-man', 'SLIM MAN', withBody(start('The Skater'), { build: 0 })],
  ['slim-woman', 'SLIM WOMAN', withBody(start('The Club-goer'), { build: 0 })],
  ['average-man', 'AVERAGE MAN', withBody(start('The Executive'), { build: 1 })],
  ['average-woman', 'AVERAGE WOMAN', withBody(start('The Barista'), { build: 1 })],
  ['athletic-man', 'ATHLETIC MAN', withBody(start('The Punk'), { build: 2 })],
  ['athletic-woman', 'ATHLETIC WOMAN', withBody(start('The Jogger'), { build: 2 })],
  ['curvy-woman', 'CURVY WOMAN', withBody(start('The Beachgoer'), { build: 3 })],
  ['big-man', 'BIG MAN', withBody(start('The Rancher'), { build: 4 })],
];
const rowsArg = arg('rows', null), ROWS = rowsArg ? rowsArg.split(',').map(Number) : EIGHT.map((_, i) => i);
const DIRS = [[0, 'S'], [1, 'SE'], [2, 'E'], [4, 'N']];

// ---- a canvas of RGB, sprites as the game bakes them ----
let POLISH = null;
async function polish(on) {
  if (on && !POLISH) POLISH = (await import('../client/art2/peoplepolish.js')).POLISH;
  setPolish(on ? POLISH : null);
}
const baked = (A, dir, pose, frame, opt = {}) => downsample2(packGBuf(person(A, dir, pose, frame, { tight: true, ...opt })));
class Sheet {
  constructor(w, h, bg = [107, 111, 120]) { this.w = w; this.h = h; this.d = Buffer.alloc(w * h * 3); this.rect(0, 0, w, h, bg); }
  rect(x, y, w, h, c) { for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) { const o = (j * this.w + i) * 3; this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; } }
  // a baked sprite, its anchor (the feet) at x, y, an art pixel k screen px; tint multiplies (night), shadow an oval under the feet
  sprite(s, x, y, k, tint = null, shadow = true) {
    if (shadow) for (let j = -2 * k; j < 2 * k; j++) for (let i = -6 * k; i < 6 * k; i++) if ((i / (6 * k)) ** 2 + (j / (2 * k)) ** 2 < 1) this.mul(x + i, y + j, 0.72);
    const x0 = x - s.ax * k, y0 = y - s.ay * k;
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const q = (j * s.w + i) * 4; if (s.p0[q + 3] < 128) continue;
      const c = [s.p0[q], s.p0[q + 1], s.p0[q + 2]];
      this.rect(x0 + i * k, y0 + j * k, k, k, tint ? c.map((v, n) => Math.round(v * tint[n])) : c);
    }
  }
  mul(x, y, f) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const o = (y * this.w + x) * 3; for (let c = 0; c < 3; c++) this.d[o + c] *= f; }
  text(t, x, y, k = 2, c = [240, 240, 240]) {
    for (const ch of String(t).toUpperCase()) {
      const g = FONT[ch];
      if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '#') this.rect(x + i * k, y + j * k, k, k, c);
      x += 4 * k;
    }
  }
  save(file) {
    mkdirSync(dirname(file), { recursive: true });
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) this.d.copy(raw, y * (this.w * 3 + 1) + 1, y * this.w * 3, (y + 1) * this.w * 3);
    const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)) >>> 0, 8 + data.length); return b; };
    const hd = Buffer.alloc(13); hd.writeUInt32BE(this.w, 0); hd.writeUInt32BE(this.h, 4); hd[8] = 8; hd[9] = 2;
    writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
    console.log(file, `${this.w} x ${this.h}`);
  }
}
const G = (s) => s.replace(/\s/g, '');
const FONT = Object.fromEntries(Object.entries({
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.', E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#', I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..', Q: '.#. #.# #.# ### .##', R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.', U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###', 0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '##. ..# .#. #.. ###', 3: '##. ..# .#. ..# ##.',
  4: '#.# #.# ### ..# ..#', 5: '### #.. ##. ..# ##.', 6: '.## #.. ### #.# ###', 7: '### ..# .#. .#. .#.', 8: '### #.# ### #.# ###', 9: '### #.# ### ..# ##.',
  '-': '... ... ### ... ...', '|': '.#. .#. .#. .#. .#.', ':': '... .#. ... .#. ...', '.': '... ... ... ... .#.', '/': '..# ..# .#. #.. #..', '+': '... .#. ### .#. ...',
}).map(([k, v]) => [k, G(v)]));

// ---- one archetype's strip: 4 facings, standing and 2 walk frames each, at game scale (an art pixel = 2 x 2 screen px,
// the game at zoom 1); then standing and walking at ZOOM times that ----
const KG = 2, KB = 2 * ZOOM, CELL = 40, BCELL = 21 * KB + 6;
const stripWidth = () => 8 + 12 * CELL + 20 + 8 * BCELL + 8;
const stripH = () => 29 * KB + 22;
function strip(sh, x, y, A, tint = null) {
  const feet = y + stripH() - 10;
  let cx = x + 8 + CELL / 2;
  for (const [d] of DIRS) for (const [pose, f] of [['idle', 0], ['walk0', 1], ['walk0', 4]]) { sh.sprite(baked(A, d, pose, f), cx, feet, KG, tint); cx += CELL; }
  cx += 20 + BCELL / 2 - CELL / 2;
  for (const [pose, f] of [['idle', 0], ['walk0', 1]]) for (const [d] of DIRS) { sh.sprite(baked(A, d, pose, f), cx, feet, KB, tint); cx += BCELL; }
}
function heading(sh, x, y) {
  let cx = x + 8;
  for (const [, n] of DIRS) { sh.text(`${n}: STAND, WALK, WALK`, cx + 4, y, 1, [215, 215, 220]); cx += CELL * 3; }
  cx += 20;
  for (const p of ['STANDING', 'WALKING']) for (const [, n] of DIRS) { sh.text(`${p} ${n}`, cx + 6, y, 2); cx += BCELL; }
}

async function lineup(on, out, title) {
  await polish(on);
  const W = stripWidth() + 110, H = 44 + ROWS.length * stripH();
  const sh = new Sheet(W, H);
  sh.text(`${title} - GAME SCALE, THEN ${ZOOM}X`, 8, 6, 3);
  heading(sh, 110, 30);
  ROWS.forEach((r, i) => { const [, name, L] = EIGHT[r], y = 44 + i * stripH(); sh.text(name.split(' ')[0], 6, y + stripH() / 2 - 8, 2); sh.text(name.split(' ')[1], 6, y + stripH() / 2 + 6, 2); strip(sh, 110, y, LK.lookArt(L)); });
  sh.save(out);
}
async function sides(outDir) {
  for (const r of ROWS) {
    const [id, name, L] = EIGHT[r], A = LK.lookArt(L), W = stripWidth(), H = 56 + 2 * stripH() + 4 * KB;
    const sh = new Sheet(W, H);
    sh.text(`${name}: BEFORE`, 8, 6, 2); heading(sh, 0, 22);
    await polish(false); strip(sh, 0, 26, A);
    sh.text(`${name}: AFTER - THE POLISH PASS`, 8, 32 + stripH(), 2); heading(sh, 0, 48 + stripH());
    await polish(true); strip(sh, 0, 52 + stripH(), A);
    sh.save(join(outDir, `side-${id}.png`));
  }
}
// the eight over the grounds they walk on (flat colours taken from the game's ground art), by day, at night, in rain
async function grounds(out) {
  const GR = [['PAVEMENT', [150, 146, 140], null], ['ASPHALT', [78, 80, 88], null], ['GRASS', [92, 140, 70], null], ['SAND', [214, 196, 150], null], ['NIGHT', [34, 38, 62], [0.5, 0.52, 0.72]], ['RAIN', [84, 90, 100], [0.78, 0.8, 0.86]]];
  const CW = 40, PW = 16 + ROWS.length * CW, GC = 3, W = 8 + GC * (PW + 8), RH = 70, BH = 2 * (2 * RH + 14), H = 22 + 2 * BH;
  const sh = new Sheet(W, H);
  sh.text('GAME SCALE ON THE GROUNDS THEY WALK: STANDING SE, WALKING N', 8, 6, 2);
  for (const [k, on] of [[0, false], [1, true]]) {
    await polish(on);
    GR.forEach(([name, bg, tint], g) => {
      const x = 8 + (g % GC) * (PW + 8), y = 22 + Math.floor(g / GC) * BH + k * (2 * RH + 8);
      sh.rect(x, y, PW, 2 * RH, bg); sh.text(`${name} - ${on ? 'AFTER' : 'BEFORE'}`, x + 4, y + 3, 1);
      if (name === 'RAIN') for (let i = 0; i < 90; i++) { const rx = x + (i * 53) % PW, ry = y + (i * 97) % (2 * RH - 6); sh.rect(rx, ry, 1, 5, [150, 160, 176]); }
      ROWS.forEach((r, i) => { const A = LK.lookArt(EIGHT[r][2]); sh.sprite(baked(A, 1, 'idle', 0), x + 8 + CW / 2 + i * CW, y + RH - 8, KG, tint); sh.sprite(baked(A, 4, 'walk0', 1), x + 8 + CW / 2 + i * CW, y + 2 * RH - 8, KG, tint); });
    });
  }
  sh.save(out);
}
// heads close up: every option of the look system's eyes, brows, noses and lips - a man facing S, a woman facing SE -
// before over after, on six skins; the last column the same man in profile (E)
async function faces(out) {
  const K = 2 * +arg('zoom', 3), CW = 18 * K + 4, RH = 20 * K + 2, opts = (arg('only', null) ? [arg('only')] : ['eyes', 'brows', 'nose', 'lips']).map((k) => [k, LK.FACE_OPTS[k]]);
  const n = Math.min(+arg('cols', 9), Math.max(...opts.map((o) => o[1].length))), W = 64 + (n * 2 + 1) * CW + 8, H = 22 + opts.length * (2 * RH + 16);
  const sh = new Sheet(W, H);
  sh.text(`HEADS AT ${K / 2}X GAME SCALE: EACH OPTION ON A MAN (S) AND A WOMAN (SE); LAST COLUMN A PROFILE`, 8, 6, 2);
  const head = (base, key, i, d) => {
    const L = LK.emptyLook(base);
    L.face = { ...L.face, [key]: i, eyeColor: 1 + i % 4 }; L.body.skin = [1, 3, 9, 12, 5, 14][i % 6]; L.hair = { ...L.hair, style: base === 'f' ? 5 : 1, color: 1 + (i % 3) };
    L.outfit.top = LK.STARTERS[0].look.outfit.top;
    const s = baked(LK.lookArt(LK.validLook(L)), d, 'idle', 0, { region: 'head' });
    return { ...s, ax: s.w >> 1, ay: s.h };   // (placed by its box, not the feet)
  };
  let y = 22;
  for (const [key, names] of opts) {
    names.slice(0, n).forEach((nm, i) => sh.text(nm, 64 + i * 2 * CW + 6, y, 2));
    for (const on of [false, true]) {
      await polish(on);
      sh.text(key, 4, y + 24, 2); sh.text(on ? 'AFTER' : 'BEFORE', 4, y + 38, 2, on ? [170, 240, 170] : [240, 200, 160]);
      const fy = y + 14 + 19 * K;
      names.slice(0, n).forEach((nm, i) => { sh.sprite(head('m', key, i, 0), 64 + i * 2 * CW + CW / 2, fy, K, null, false); sh.sprite(head('f', key, i, 1), 64 + (i * 2 + 1) * CW + CW / 2, fy, K, null, false); });
      sh.sprite(head('m', key, 0, 2), 64 + n * 2 * CW + CW / 2, fy, K, null, false);
      y += RH;
    }
    y += 16;
  }
  sh.save(out);
}

// (a working view: the chosen archetypes standing S, SE, E, N - before then after - at ZOOM; --pose walk0 --frame 1 for a stride)
async function dev(out) {
  const pose = arg('pose', 'idle'), fr = +arg('frame', 0), W = 8 + 8 * BCELL, sh = new Sheet(W, ROWS.length * stripH() + 4 * KB);
  for (const [k, on] of [[0, false], [1, true]]) {
    await polish(on);
    ROWS.forEach((r, i) => DIRS.forEach(([d], j) => sh.sprite(baked(LK.lookArt(EIGHT[r][2]), d, pose, fr), 8 + (k * 4 + j) * BCELL + BCELL / 2, (i + 1) * stripH() - 8, KB)));
  }
  sh.save(out);
}
// the proportions to choose from (the owner picks: docs/characters/NOTES.md): today's, the pass as built, and the same pass
// with a smaller head on longer legs - the eight standing S and SE at ZOOM, then at game scale
export const VARIANTS = [['BEFORE', null], ['A: THE PASS', {}], ['B: SMALLER HEAD, LONGER LEGS', { K: [1.22, 1.13, 1.04, 1.02, 1.0] }], ['C: THE HEAD AS TODAY, LONGER LEGS', { K: [1.36, 1.1, 1.03, 1.02, 1.0] }]];
async function variants(out) {
  await polish(true);
  const W = 8 + ROWS.length * 2 * BCELL + 16 + ROWS.length * CELL + 8, RH = stripH() + 6 * KB, sh = new Sheet(W, VARIANTS.length * RH + 2 * KB);
  VARIANTS.forEach(([name, v], k) => {
    setPolish(v ? { ...POLISH, ...v } : null);
    sh.text(name, 8, k * RH + 8, 2);
    ROWS.forEach((r, i) => { const A = LK.lookArt(EIGHT[r][2]), y = (k + 1) * RH - 3 * KB;
      [0, 1].forEach((d, j) => sh.sprite(baked(A, d, 'idle', 0), 8 + (i * 2 + j) * BCELL + BCELL / 2, y, KB));
      sh.sprite(baked(A, 1, 'walk0', 1), 8 + ROWS.length * 2 * BCELL + 16 + i * CELL + CELL / 2, y, KG); });
  });
  sh.save(out);
}
// what else the body does: a pose a column (facing SE), before over after, for the first chosen archetype; --dir 2 for E
async function poses(out) {
  const PS = [['walk0', 1], ['walk0', 3], ['walk2', 1], ['walk3', 2], ['punch', 2], ['aim', 0], ['carry', 1], ['handsup', 0], ['kneel', 0], ['sit', 0], ['drive', 0], ['ride', 0], ['pedal', 1], ['swim', 0], ['down', 0], ['fish', 1]];
  const d = +arg('dir', 1), CW = 26 * KB, RH = stripH() + 4 * KB, sh = new Sheet(8 + PS.length * CW, ROWS.length * 2 * RH + 12);
  let y = 0;
  for (const r of ROWS) for (const on of [false, true]) {
    await polish(on);
    PS.forEach(([p, fr], i) => { if (!on) sh.text(p, 8 + i * CW + 4, y + 4, 2); sh.sprite(baked(LK.lookArt(EIGHT[r][2]), d, p, fr, p === 'aim' ? { held: 'pistol' } : {}), 8 + i * CW + CW / 2, y + RH - 4 * KB, KB); });
    y += RH;
  }
  sh.save(out);
}
// every hairstyle (facing SW, then from behind), before over after, on a man and a woman
async function hair(out) {
  const from = +arg('from', 0), HS = LK.HAIR_STYLES.map((h, i) => i).slice(from), CW = 19 * KB, RH = stripH() - 6 * KB, per = +arg('per', 14), nr = Math.ceil(HS.length / per), sh = new Sheet(8 + per * 2 * CW, nr * 2 * RH + 12);
  for (const [k, on] of [[0, false], [1, true]]) {
    await polish(on);
    if (arg('on', null) && !on) continue;
    HS.forEach((h, i) => { const L = LK.emptyLook((LK.HAIR_STYLES[h][1].length > 1 ? i % 2 : LK.HAIR_STYLES[h][1] === 'f') ? 'f' : 'm'); L.hair.style = h; L.hair.color = 1 + i % 5; L.body.skin = [1, 4, 9, 12][i % 4]; L.outfit.top = LK.item('Plain tee'); L.outfit.bottoms = LK.item('Jeans');
      const A = LK.lookArt(LK.validLook(L)), x = 8 + (i % per) * 2 * CW, y = (Math.floor(i / per) * 2 + k + 1) * RH;
      sh.sprite(baked(A, 7, 'idle', 0), x + CW / 2, y, KB); sh.sprite(baked(A, 4, 'idle', 0), x + CW + CW / 2, y, KB); });
  }
  sh.save(out);
}
// the builds: both bases, every build, the same tee and jeans, facing S and E - before over after
async function builds(out) {
  const CW = 22 * KB, RH = stripH(), n = LK.BUILDS.length, sh = new Sheet(8 + n * 4 * CW, 2 * RH + 26);
  for (const [k, on] of [[0, false], [1, true]]) {
    await polish(on);
    ['m', 'f'].forEach((base, b) => LK.BUILDS.forEach((B, i) => { const L = LK.emptyLook(base); L.body.build = i; L.hair.style = base === 'f' ? 5 : 1; L.outfit.top = LK.item('Tank top', 'white'); L.outfit.bottoms = LK.item('Shorts', 'navy');
      const A = LK.lookArt(LK.validLook(L)), x = 8 + (b * n + i) * 2 * CW;
      if (!k) sh.text(B.name, x + 4, 4, 2);
      sh.sprite(baked(A, 0, 'idle', 0), x + CW / 2, 14 + (k + 1) * RH - 2 * KB, KB); sh.sprite(baked(A, 2, 'idle', 0), x + CW + CW / 2, 14 + (k + 1) * RH - 2 * KB, KB); }));
  }
  sh.save(out);
}
// ---- pass 2's sheets (docs/tasks/CHARACTERS2.md): docs/characters/pass2/ ----
// a grid of figures: rows [label, [cell...]], a cell { L (a look) | A (an app), d, pose, f, opt, on (the pass: default on), tint, t (a caption) }
// pass 1 alone: the pass without pass 2's hooks (for the side-by-side sheets)
const PASS1 = () => ({ ...POLISH, dress: null, post: null, hairK: null, pass1: true });
// (pass 2 as it was: pass 3's additions to the pass switched off - each is a key of its own on POLISH)
const PASS2 = () => ({ ...POLISH, ...Object.fromEntries(P3_KEYS.map((k) => [k, null])), mouthOn: true });
const P3_KEYS = ['hairLit', 'selfie'];
async function grid(out, title, rows, { k = KB, cw = 22, rh = 34, bg, label = 150, ret = false } = {}) {
  const CW = cw * k, RH = rh * k, n = Math.max(...rows.map((r) => r[1].length)), sh = new Sheet(label + n * CW + 8, 24 + rows.length * RH + 8, bg);
  sh.text(title, 8, 6, 2);
  for (const [ri, [name, cells]] of rows.entries()) {
    const y = 24 + (ri + 1) * RH - 2 * k;
    String(name).split('|').forEach((t, i) => sh.text(t, 6, Math.round(y - RH / 2) + i * 12, 2));
    for (const [ci, c] of cells.entries()) {
      if (!c) continue;
      await polish(c.on !== false); if (c.p1) setPolish(PASS1()); if (c.p2) setPolish(PASS2()); if (c.p4) setPolish(PASS4());
      const x = label + ci * CW + CW / 2;
      if (c.bg) sh.rect(x - CW / 2, y - RH + 2 * k, CW, RH, c.bg);
      if (c.busy) for (let j = 0; j < RH; j += 2) for (let i = 0; i < CW; i += 2) { const q = Math.sin((x + i) * 12.9898 + (y + j) * 78.233) * 43758.5453, f = q - Math.floor(q); if (f < 0.34) sh.rect(x - CW / 2 + i, y - RH + 2 * k + j, 2, 2, c.bg.map((v, n) => Math.max(0, Math.min(255, v + (f < 0.12 ? c.busy[n] : f < 0.22 ? -c.busy[n] : c.busy[n] / 2))))); }
      if (c.rain) for (let i = 0; i < 14; i++) sh.rect(x - CW / 2 + (i * 53 + ri * 17) % CW, y - RH + 2 * k + (i * 97) % (RH - 6), 1, 5, [150, 160, 176]);
      const sp = baked(c.A || LK.lookArt(c.L, c.art), c.d ?? 1, c.pose || 'idle', c.f || 0, c.opt || {});
      if (c.head) sh.sprite({ ...sp, ax: sp.w >> 1, ay: sp.h }, x, y - 2 * k, k, c.tint || null, false);   // (a head: placed by its box)
      else sh.sprite(sp, x, y - 2 * k, k, c.tint || null);
      if (c.t) sh.text(c.t, x - CW / 2 + 3, y - RH + 2 * k + 3, 1, [225, 225, 230]);
    }
  }
  if (ret) return sh;
  sh.save(out);
}
const dressed = (base, outfit, body = {}, more = {}) => { const L = LK.emptyLook(base); Object.assign(L.body, body); if (more.hair) Object.assign(L.hair, more.hair); if (more.face) Object.assign(L.face, more.face); if (more.extras) Object.assign(L.extras, more.extras); for (const [s, v] of Object.entries(outfit)) L.outfit[s] = typeof v === 'string' ? LK.item(v) : Array.isArray(v) ? LK.item(...v) : v; return LK.validLook(L); };
// every underwear piece on both bases, front and back, at the big scale and the game's
async function under(out) {
  const U = LK.PIECES.filter((p) => p && p.slot === 'under'), rows = [];
  for (const base of ['m', 'f']) for (const p of [null, ...U.filter((q) => q.b.includes(base))]) {
    const L = dressed(base, p ? { under: p.name } : {}, { skin: base === 'm' ? 2 : 9, build: base === 'm' ? 1 : 3 }, { hair: { style: base === 'f' ? 20 : 6 } });
    rows.push([(p ? p.name : 'basic (none picked)').replace(' and ', ' +|'), [{ L, d: 0 }, { L, d: 1 }, { L, d: 2 }, { L, d: 4 }, { L, d: 0, pose: 'walk0', f: 1 }, { L, d: 0, on: false, t: 'off' }]]);
  }
  const half = Math.ceil(rows.length / 2);
  await grid(out.replace('.png', '-1.png'), 'UNDERWEAR (PASS ON): S, SE, E, N, WALKING; THE PASS OFF', rows.slice(0, half), { k: 6, rh: 32 });
  await grid(out.replace('.png', '-2.png'), 'UNDERWEAR (PASS ON): S, SE, E, N, WALKING; THE PASS OFF', rows.slice(half), { k: 6, rh: 32 });
}
// pass 4 (docs/tasks/CHARACTERS4.md): every underwear piece on both bases - S, SE, E, N, walking (front and side), then
// on the lightest and the darkest skin. Pass 3's half is a picture kept from the commit before the redraw
// (--snap writes one: pass4/underwear-pass3.png); the sheet is that picture beside today's drawing.
// (pass 5, the owner's notes on that sheet: the same rows for the pieces they touch - pass 4 | pass 5, pass 4's half kept the same way: pass5/underwear-pass4.png)
const P5_UNDER = ['Briefs', 'Tank and briefs', 'Bra and briefs', 'Lace bra and panties', 'Bralette set', 'Strapless set', 'Union suit', 'Silk slip'];
async function p4under(out, v5 = false) {
  const U = LK.PIECES.filter((p) => p && p.slot === 'under' && (!v5 || P5_UNDER.includes(p.name))), rows = [], SK = [2, 9, 5, 12, 0, 7, 13, 4];
  for (const base of ['m', 'f']) for (const [i, p] of [null, ...U.filter((q) => q.b.includes(base) && (!v5 || base === 'f' || q.name === 'Union suit'))].entries()) {
    const mk = (skin) => dressed(base, p ? { under: p.name } : {}, { skin, build: base === 'm' ? [1, 2, 0, 4][i % 4] : [3, 1, 0, 2][i % 4] }, { hair: { style: base === 'f' ? [20, 21, 16, 9][i % 4] : [6, 2, 8, 1][i % 4], color: [3, 0, 5, 1][i % 4] } });
    const L = mk(SK[i % SK.length]);
    rows.push([(p ? p.name : 'basic (none picked)').replace(' and ', ' +|') + '|' + (base === 'm' ? 'MAN' : 'WOMAN'), [{ L, d: 0 }, { L, d: 1 }, { L, d: 2 }, { L, d: 4 }, { L, d: 0, pose: 'walk0', f: 1 }, { L, d: 2, pose: 'walk0', f: 3 }, { L: mk(0), d: 1 }, { L: mk(13), d: 1 }, { L: mk(13), d: 5 }]]);
  }
  const snap = argv.includes('--snap'), file = v5 ? join(P5, 'underwear-pass4.png') : join(P4, 'underwear-pass3.png'), was = v5 ? 4 : 3, o = { k: 6, rh: 32, cw: 20, label: 150, ret: true };
  const now = await grid(out, snap ? 'PASS ' + was : 'PASS ' + (was + 1) + ': S, SE, E, N, WALKING (S, E), LIGHTEST AND DARKEST SKIN (SE, SE, NW)', rows, o);
  if (snap) return now.save(file);
  const I = readPng(file), sh = new Sheet(I.w + now.w - o.label + 12, now.h);
  pasteScaled(sh, I, 0, 0, I.w);
  for (let y = 0; y < now.h; y++) for (let x = o.label; x < now.w; x++) { const q = (y * now.w + x) * 3; sh.rect(I.w + 12 + x - o.label, y, 1, 1, [now.d[q], now.d[q + 1], now.d[q + 2]]); }
  sh.rect(0, 0, sh.w, 22, [107, 111, 120]);
  sh.text('UNDERWEAR: PASS ' + was + ' (LEFT) | PASS ' + (was + 1) + ' (RIGHT) - S, SE, E, N, WALKING (S, E), LIGHTEST AND DARKEST SKIN (SE, SE, NW)', 8, 6, 2);
  sh.save(out);
}
// every uniform and job look, then the city's archetypes (server entities.js) as the game draws them
const JOBS = () => {
  const P = (rank, kind, sh) => LK.policeLook(dressed('m', {}, { skin: 2 + rank }, { hair: { style: 2 } }), rank, kind, sh);
  const J = (n, base, o, b = {}, m = {}) => [n, dressed(base, o, b, m)];
  return [['POLICE', P(0)], ['ROOKIE', P(0, 'rookie')], ['K9', P(0, 'k9', true)], ['SERGEANT', P(2)], ['DRESS', P(3)], ['CHIEF', P(5)],
    J('PARAMEDIC', 'f', { set: 'Paramedic uniform', shoes: ['Work boots', 'black'], bag: ['Duffel bag', 'red'] }, { skin: 8 }, { hair: { style: 20 } }),
    J('FIRE', 'm', { set: 'Turnout gear', hat: 'Fire helmet', shoes: ['Work boots', 'black'], jewel: ['Work gloves', 'black'] }, { skin: 1, build: 2 }),
    J('HI-VIS', 'm', { set: 'Hi-vis coverall', shoes: 'Work boots', jewel: 'Work gloves' }, { skin: 12 }),
    J('BUILDER', 'm', { top: ['Hi-vis vest', 'orange', 'royal blue'], bottoms: 'Jeans', hat: 'Hard hat', shoes: 'Work boots' }, { skin: 3, build: 4 }),
    J('SECURITY', 'm', { top: 'Security shirt', bottoms: ['Work pants', 'black'], hat: ['Baseball cap', 'grey'], shoes: ['Work boots', 'black'] }, { skin: 13 }),
    J('CHEF', 'm', { top: 'Chef whites', jacket: ['Apron', 'black', 'white'], bottoms: ['Chinos', 'charcoal'], hat: "Chef's hat", shoes: ['Clogs', 'black'] }, { skin: 9 }),
    J('DOCTOR', 'f', { set: 'Scrubs', jacket: 'Lab coat', jewel: 'Stethoscope', shoes: ['Sneakers', 'white'] }, { skin: 14 }, { hair: { style: 21 } }),
    J('MECHANIC', 'm', { set: ['Coveralls', 'navy', 'red'], hat: ['Baseball cap', 'navy'], shoes: 'Work boots' }, { skin: 2 }, { hair: { facial: 3 } }),
    J('POSTAL', 'f', { top: 'Postal shirt', bottoms: ['Shorts', 'navy'], bag: 'Mail satchel', shoes: ['Sneakers', 'black'] }, { skin: 4 }),
    J('COURIER', 'm', { top: ['Plain tee', 'pink'], bottoms: ['Shorts', 'black'], hat: ['Baseball cap', 'pink'], bag: ['Delivery pack', 'pink'], shoes: 'Skate shoes' }, { skin: 10 }),
    J('RANGER', 'f', { top: ['Work shirt', 'khaki'], bottoms: ['Cargo pants', 'olive'], hat: 'Ranger hat', shoes: 'Hiking boots' }, { skin: 1 }),
    J('LIFEGUARD', 'm', { top: 'Bare chest', bottoms: ['Swim trunks', 'red'], jewel: 'Lifeguard whistle', bag: 'Rescue tube', shoes: 'Flip-flops' }, { skin: 11, build: 2 }),
    J('OFFICE', 'm', { top: 'Button-up shirt', bottoms: ['Suit pants', 'navy'], jewel: 'Lanyard', glasses: 'Square glasses', shoes: ['Brogues', 'brown'] }, { skin: 0 }),
    J('DETECTIVE', 'm', { set: ['Business suit', 'charcoal', 'red'], glasses: 'Sunglasses', shoes: ['Brogues', 'brown'] }, { skin: 1 }, { hair: { facial: 2 } }),
    J('BARISTA', 'f', { top: ['Plain tee', 'black'], jacket: 'Apron', bottoms: ['Jeans', 'denim'], shoes: ['High-tops', 'black', 'white'] }, { skin: 8 }, { hair: { style: 21, color: 5 } })];
};
async function lineup2(out) {
  const { ARCHETYPES, makeAppearance } = await import('../server/entities.js'), { adaptApp } = await import('../client/art2/game/peds.js'), { mulberry32 } = await import('../shared/rng.js');
  const jobs = JOBS(), rows = [], per = 7;
  for (let i = 0; i < jobs.length; i += per) { rows.push(['PASS 2', jobs.slice(i, i + per).flatMap(([n, L]) => [{ L, d: 1, t: n }, { L, d: 5 }])]); rows.push(['PASS 1|(NO PASS 2)', jobs.slice(i, i + per).flatMap(([, L]) => [{ L, d: 1, p1: true }, { L, d: 5, p1: true }])]); }
  await grid(out, 'EVERY UNIFORM AND JOB LOOK: FRONT QUARTER AND BACK QUARTER - PASS 2 OVER PASS 1', rows, { k: 6, rh: 33, cw: 18, label: 120 });
  const ar = Object.keys(ARCHETYPES), rows2 = [];
  for (let i = 0; i < ar.length; i += per) rows2.push(['', ar.slice(i, i + per).flatMap((a, j) => [0, 1].map((v) => ({ A: adaptApp(makeAppearance(mulberry32(i * 31 + j * 7 + v * 101 + 5), a), a), d: v ? 5 : 1, t: v ? '' : a })))]);
  await grid(out.replace('.png', '-npc.png'), 'THE CITY ARCHETYPES (TWO OF EACH), PASS 2 ON', rows2, { k: 6, rh: 33, cw: 18, label: 12 });
}
// ---- pass 3 (docs/tasks/CHARACTERS3.md): before (pass 2) | after ----
// the patrol's light-blue shirt (the owner, 11-19): the police by rank, front quarter, back quarter and walking
async function p3police(out) {
  const J = JOBS().slice(0, 6), navy = (L) => { const N = structuredClone(L); if (LK.PIECES[N.outfit.top?.id]?.name === 'Uniform shirt') N.outfit.top = LK.item('Uniform shirt', 'navy', 'gold'); return LK.validLook(N); };
  const row = (f, more = {}) => J.flatMap(([n, L]) => [{ L: f(L), d: 1, t: n, ...more }, { L: f(L), d: 5, ...more }, { L: f(L), d: 0, pose: 'walk0', f: 1, ...more }]);
  await grid(out, 'POLICE BY RANK: FRONT QUARTER, BACK QUARTER, WALKING - THE PATROL SHIRT NAVY (BEFORE) OVER LIGHT BLUE', [['BEFORE|(NAVY)', row(navy)], ['AFTER|(LIGHT BLUE)', row((L) => L)], ['AFTER,|PASS OFF', row((L) => L, { on: false })], ['AFTER,|NIGHT', row((L) => L, { bg: [34, 38, 62], tint: [0.5, 0.52, 0.72] })]], { k: 6, rh: 33, cw: 18, label: 120 });
}
// the mouth (the owner, 11-19; gap 10): heads at 6x and whole figures at game scale x 2, with pass 1's mouth and without
// it, side by side - six skins, a man facing S and a woman facing SE, each lip option; then painted lips (they stay)
async function p3mouth(out) {
  await polish(true);
  const K = 10, CW = 30 * K, RH = 17 * K, cols = 6, sh = new Sheet(110 + cols * CW + 8, 30 + 5 * RH + 4 * 96 + 60);
  sh.text('THE MOUTH: WITH (PASS 1 AND 2) | WITHOUT (PASS 3, AS THE CONCEPTS) - EACH PAIR THE SAME FACE', 8, 6, 2);
  const mk = (base, i, more = {}) => { const L = LK.emptyLook(base); L.face = { ...L.face, lips: i % 6, eyeColor: 1 + i % 4, ...(more.face || {}) }; L.body.skin = [1, 3, 9, 12, 5, 14][i % 6]; L.hair = { ...L.hair, style: base === 'f' ? [5, 21, 20, 16, 9, 24][i % 6] : [1, 6, 2, 8, 10, 3][i % 6], color: 1 + (i % 3), facial: more.facial || 0 }; Object.assign(L.extras, more.extras || {}); L.outfit.top = LK.item('Plain tee', ['grey', 'red', 'navy', 'white', 'forest', 'black'][i % 6]); L.outfit.bottoms = LK.item('Jeans'); L.outfit.shoes = LK.item('Sneakers'); return LK.lookArt(LK.validLook(L)); };
  const head = (A, d) => { const s = baked(A, d, 'idle', 0, { region: 'head' }); return { ...s, ax: s.w >> 1, ay: s.h }; };
  const ROWS = [['MAN, S', (i) => mk('m', i), 0], ['WOMAN, SE', (i) => mk('f', i), 1], ['WOMAN, S', (i) => mk('f', i + 3), 0], ['MAN, BEARD,|SE', (i) => mk('m', i, { facial: 1 + i }), 1], ['PAINTED:|LIPSTICK,|GLAM, GOTH', (i) => mk('f', i, { extras: { makeup: [2, 5, 6][i % 3], makeupColor: i } }), i => i % 2]];
  let y = 30;
  for (const [name, f, d] of ROWS) {
    name.split('|').forEach((t, i) => sh.text(t, 6, y + 40 + i * 12, 2));
    for (let i = 0; i < cols; i++) for (const [j, on] of [[0, true], [1, false]]) { setPolish({ ...POLISH, mouthOn: on }); sh.sprite(head(f(i), typeof d === 'function' ? d(i) : d), 110 + i * CW + (j + 0.5) * CW / 2, y + RH - 8, K, null, false); }
    y += RH;
  }
  sh.text('AT GAME SCALE X 2 (WHOLE FIGURES): WITH | WITHOUT', 8, y + 8, 2); y += 24;
  for (const [ri, [bg, tint]] of [[[150, 146, 140], null], [[92, 140, 70], null], [[78, 80, 88], null], [[34, 38, 62], [0.5, 0.52, 0.72]]].entries()) {
    sh.rect(110, y, cols * CW, 92, bg); sh.text(['PAVEMENT', 'GRASS', 'ASPHALT', 'NIGHT'][ri], 6, y + 40, 2);
    for (let i = 0; i < cols * 2; i++) for (const [j, on] of [[0, true], [1, false]]) { setPolish({ ...POLISH, mouthOn: on }); sh.sprite(baked(mk(i % 2 ? 'f' : 'm', i + ri), [0, 1, 7, 0][(i + ri) % 4]), Math.round(110 + i * CW / 2 + (j + 0.5) * CW / 4), y + 84, 4, tint); }
    y += 96;
  }
  sh.save(out);
}
// every hairstyle (the 36 and pass 2's six) in four directions - S, SE, E, N - at 3x game scale: pass 2 over pass 3
async function p3hair(out) {
  const HS = LK.HAIR_STYLES.map((h, i) => i), per = +arg('per', 7), rows = [], dirs = [0, 1, 2, 4];
  const mk = (h, i) => { const s = LK.HAIR_STYLES[h], L = LK.emptyLook((s[1].length > 1 ? i % 2 : s[1] === 'f') ? 'f' : 'm'); L.hair.style = h; L.hair.color = [1, 3, 0, 5, 2, 12, 4][i % 7]; L.body.skin = [1, 4, 9, 12][i % 4]; L.outfit.top = LK.item('Plain tee'); L.outfit.bottoms = LK.item('Jeans'); return LK.validLook(L); };
  for (let i = 0; i < HS.length; i += per) for (const p2 of [true, false]) rows.push([p2 ? 'PASS 2' : 'PASS 3', HS.slice(i, i + per).flatMap((h, j) => dirs.map((d, n) => ({ L: mk(h, i + j), d, p2, opt: { region: 'head' }, head: 1, t: !p2 || n ? '' : LK.HAIR_STYLES[h][0] })))]);
  await grid(out, 'EVERY HAIRSTYLE, S SE E N: PASS 2 OVER PASS 3 (AN OUTLINE AND A LIT TOP, AS THE CONCEPTS DRAW HAIR)', rows, { k: 6, rh: 19, cw: 13, label: 80 });
}
// ---- pass 5 (docs/tasks/CHARACTERS5.md): every hairstyle, pass 4 | pass 5, S SE E N, on both bases (a style one base
// wears: that base twice, another colour). --only 20,21 for some styles, --k 8 for bigger
const P5_KEYS = ['hairRe'];
const PASS4 = () => ({ ...POLISH, ...Object.fromEntries(P5_KEYS.map((k) => [k, null])) });
async function p5hair(out) {
  const only = arg('only', null), HS = LK.HAIR_STYLES.map((h, i) => i).filter((i) => !only || only.split(',').map(Number).includes(i)), dirs = [0, 1, 2, 4], k = +arg('k', 4), rows = [], half = only ? HS.length : Math.ceil(HS.length / 2);
  const mk = (h, base, n) => { const L = LK.emptyLook(base); L.hair.style = h; L.hair.color = [1, 3, 0, 5, 2, 12, 4][(h + n * 3) % 7]; L.body.skin = [1, 4, 9, 12][(h + n) % 4]; L.outfit.top = LK.item('Plain tee'); L.outfit.bottoms = LK.item('Jeans'); return LK.validLook(L); };
  const cells = (h) => { const s = LK.HAIR_STYLES[h], bs = s[1].length > 1 ? ['m', 'f'] : [s[1], s[1]]; return bs.flatMap((b, n) => [true, false].flatMap((p4) => dirs.map((d, j) => ({ L: mk(h, b, n), d, p4, opt: { region: 'head' }, head: 1, t: !n && p4 && !j ? s[0] : !j ? (p4 ? '4' : '5') : '' })))); };
  for (let i = 0; i < half; i++) rows.push(['', [...cells(HS[i]), ...(HS[i + half] !== undefined ? cells(HS[i + half]) : [])]]);
  await grid(out, 'EVERY HAIRSTYLE: PASS 4 | PASS 5, S SE E N, BOTH BASES (MAN, WOMAN; ONE BASE ONLY: TWICE)', rows, { k, rh: 19, cw: 13, label: 8 });
}
// a slot's pieces on both bases: front, front quarter, side, back, walking - the pass on; then the pass off; then without
const pieceRows = (slot, wear, names = null) => LK.PIECES.filter((p) => p && p.slot === slot && (!names || names.includes(p.name))).flatMap((p) => ['m', 'f'].filter((b) => !names || p.b.includes(b) || slot !== 'socks').map((base) => { const L = wear(base, p), N = wear(base, null); return [p.name.replace(' and ', ' +|') + '|' + (base === 'm' ? 'MAN' : 'WOMAN'), [{ L, d: 0 }, { L, d: 1 }, { L, d: 2 }, { L, d: 4 }, { L, d: 6 }, { L, d: 0, pose: 'walk0', f: 1 }, { L, d: 2, pose: 'run', f: 2 }, { L, d: 1, pose: 'sit', f: 0 }, { L, d: 1, on: false, t: 'off' }, { L: N, d: 1, t: 'without' }]]; }));
async function p3socks(out) {
  const wear = (base, p) => dressed(base, { top: ['Plain tee', base === 'm' ? 'grey' : 'white'], bottoms: p && p.d.warm ? ['Leggings', 'black'] : base === 'm' ? ['Shorts', 'navy'] : ['Mini skirt', 'burgundy'], shoes: ['Sneakers', 'white'], ...(p ? { socks: p.name } : {}) }, { skin: base === 'm' ? 2 : 9 }, { hair: { style: base === 'f' ? 20 : 6 } });
  await grid(out, 'SOCKS (THE NEW SLOT): S, SE, E, N, W, WALKING, RUNNING, SITTING; THE PASS OFF; WITHOUT', pieceRows('socks', wear), { k: 6, rh: 32 });
}
async function p3gear(out) {
  const N = ['Knee pads', 'Elbow pads', 'Skate pads', 'Wallet chain', 'Tool belt', 'Climbing harness'];
  const wear = (base, p) => dressed(base, { top: ['Plain tee', base === 'm' ? 'grey' : 'white'], bottoms: p && p.d.tbelt ? ['Work pants', 'khaki'] : p && p.d.harness ? ['Leggings', 'charcoal'] : base === 'm' ? ['Jeans', 'sky'] : ['Shorts', 'olive'], shoes: ['Sneakers', 'white'], ...(p ? { jewel: p.name } : {}) }, { skin: base === 'm' ? 1 : 4 }, { hair: { style: base === 'f' ? 20 : 6 } });
  await grid(out, 'SMALL GEAR (ACCESSORIES): S, SE, E, N, W, WALKING, RUNNING, SITTING; THE PASS OFF (NOT DRAWN); WITHOUT', pieceRows('jewel', wear, N), { k: 6, rh: 32 });
}
// body options on both bases: S, SE, E, N, W, walking, running, sitting, dressed; then without
async function p3body(out) {
  const rows = [];
  for (const [name, body] of [['BODY FRECKLES', { marks: 1 }], ['VITILIGO', { marks: 2 }], ['VITILIGO,|DARK SKIN', { marks: 2, skin: 12 }], ['PROSTHETIC|LEFT ARM', { limb: 1 }], ['PROSTHETIC|RIGHT ARM', { limb: 2 }], ['PROSTHETIC|LEFT LEG', { limb: 3 }], ['PROSTHETIC|RIGHT LEG', { limb: 4 }]]) for (const base of ['m', 'f']) {
    const mk = (b, o) => dressed(base, o || (base === 'm' ? { bottoms: ['Swim trunks', 'navy'] } : { top: ['Tank top', 'white'], bottoms: ['Shorts', 'denim'] }), { skin: base === 'm' ? 1 : 0, ...b }, { hair: { style: base === 'f' ? 20 : 6, color: 5 } });
    const L = mk(body), N = mk({ ...body, marks: 0, limb: 0 }), C = mk(body, { top: ['Plain tee', 'grey'], bottoms: ['Jeans', 'denim'], shoes: 'Sneakers' });
    rows.push([name + '|' + (base === 'm' ? 'MAN' : 'WOMAN'), [{ L, d: 0 }, { L, d: 1 }, { L, d: 2 }, { L, d: 4 }, { L, d: 6 }, { L, d: 0, pose: 'walk0', f: 1 }, { L, d: 2, pose: 'run', f: 2 }, { L, d: 1, pose: 'sit', f: 0 }, { L: C, d: 1, t: 'dressed' }, { L: N, d: 1, t: 'without' }]]);
  }
  await grid(out, 'BODY OPTIONS: S, SE, E, N, W, WALKING, RUNNING, SITTING; IN A TEE AND JEANS; WITHOUT', rows, { k: 6, rh: 32 });
}
// the draped pieces: S, SE, E, N, W, walking, running, sitting; the pass off (the shape each is built on)
async function p3drapes(out) {
  const rows = [];
  for (const n of ['Hooded cloak', 'Cape coat', 'Sari', 'Ghillie suit', 'Morning dress']) { const p = LK.PIECES[LK.byName(n)];
    for (const base of ['m', 'f'].filter((b) => p.b.includes(b))) {
      const o = p.slot === 'jacket' ? { top: ['Turtleneck', n === 'Cape coat' ? 'black' : 'charcoal'], bottoms: [base === 'f' ? 'Skirt' : 'Suit pants', 'charcoal'], jacket: n, shoes: ['Chelsea boots', 'black'] } : { set: n, shoes: n === 'Sari' ? ['Sandals', 'gold'] : n === 'Morning dress' ? ['Oxfords', 'black'] : ['Hiking boots', 'brown'], ...(n === 'Morning dress' ? { hat: 'Top hat' } : {}) };
      const L = dressed(base, o, { skin: n === 'Sari' ? 4 : base === 'm' ? 1 : 0 }, { hair: { style: base === 'f' ? 21 : 6, color: 1 } });
      rows.push([n.replace(' ', '|') + '|' + (base === 'm' ? 'MAN' : 'WOMAN'), [{ L, d: 0 }, { L, d: 1 }, { L, d: 2 }, { L, d: 4 }, { L, d: 6 }, { L, d: 0, pose: 'walk0', f: 1 }, { L, d: 2, pose: 'run', f: 2 }, { L, d: 1, pose: 'sit', f: 0 }, { L, d: 1, on: false, t: 'off' }, { L, d: 5, on: false, t: 'off' }]]); } }
  await grid(out, 'DRAPES: S, SE, E, N, W, WALKING, RUNNING, SITTING; THE PASS OFF, FRONT AND BACK QUARTER', rows, { k: 6, rh: 33 });
}
// the phone (gap 13; CC6): texting, the texting walk, a call, a call walking, filming, a selfie - eight facings, then
// pass 2's selfie (the filming hold) and the pass off
async function p3phone(out) {
  const L = dressed('f', { top: ['Hoodie', 'teal'], bottoms: 'Jeans', shoes: ['High-tops', 'white', 'red'] }, { skin: 9 }, { hair: { style: 20, color: 0 } }), A = LK.lookArt(L), D8 = [0, 1, 2, 3, 4, 5, 6, 7];
  const row = (name, more, tail = []) => [name, [...D8.map((d) => ({ A: more.A || A, d, ...more })), ...tail]];
  const sel = { opt: { held: 'phoneSelfie' } };
  await grid(out, 'THE PHONE: S SE E NE N NW W SW - THEN PASS 2 (THE FILMING HOLD) AND THE PASS OFF', [
    row('TEXTING|(PHONE OUT)', { opt: { held: 'phone' } }), row('TEXTING|WALK', { opt: { held: 'phone' }, pose: 'walk0', f: 2 }, [{ A, d: 1, opt: { held: 'phone' }, pose: 'walk0', f: 4 }, { A, d: 2, opt: { held: 'phone' }, pose: 'walk0', f: 0 }]),
    row('NPC TEXTER|(PROP)', { A: { ...A, carry: 'phone' }, pose: 'walk0', f: 2 }), row('A CALL', { A: { ...A, carry: 'call' } }), row('A CALL,|WALKING', { A: { ...A, carry: 'call' }, pose: 'walk0', f: 2 }),
    row('FILMING', { opt: { held: 'phoneUp' } }), row('A SELFIE', sel, [{ A, d: 1, ...sel, p2: true, t: 'pass 2' }, { A, d: 7, ...sel, p2: true, t: 'pass 2' }, { A, d: 1, ...sel, on: false, t: 'off' }]), row('A SELFIE,|A MAN', { A: LK.lookArt(EIGHT[4][2]), ...sel })], { k: 4, rh: 34, cw: 24, label: 100 });
}
async function p3props(out) {
  const wear = (base, p) => dressed(base, { top: ['Blouse', 'white'], bottoms: ['Chinos', 'khaki'], shoes: ['Loafers', 'brown'], ...(p ? { bag: p.name } : {}) }, { skin: base === 'm' ? 1 : 9 }, { hair: { style: base === 'f' ? 21 : 6 } });
  await grid(out, 'PROPS CARRIED (BAGS): S, SE, E, N, W, WALKING, RUNNING, SITTING; THE PASS OFF (WHAT EACH IS BUILT ON); WITHOUT', pieceRows('bag', wear, ['Camera', 'Bouquet', 'Parasol']), { k: 6, rh: 32 });
}
// every animation with the pass on: a pose a row, its eight facings (S, SE, E, NE, N, NW, W, SW) then a second frame S and E
const HELD = { aim: 'pistol', aimw: 'pistol', swing: 'bat', held: 'phone' };
async function anim(out) {
  const { POSES } = await import('../client/art2/people.js');
  const L = dressed('m', { top: ['Hoodie', 'red'], bottoms: 'Jeans', shoes: ['High-tops', 'red', 'white'] }, { skin: 1 }, { hair: { style: 6, color: 3 } }), names = Object.keys(POSES).filter((p) => !(arg('poses', null) || '').length || arg('poses').split(',').includes(p));
  const per = +arg('per', 11);
  for (let i = 0, n = 1; i < names.length; i += per, n++) {
    const rows = names.slice(i, i + per).map((p) => { const nf = POSES[p], opt = HELD[p] ? { held: HELD[p] } : {}; return [p, [...[0, 1, 2, 3, 4, 5, 6, 7].map((d) => ({ L, d, pose: p, f: 0, opt })), ...[0, 2].map((d) => ({ L, d, pose: p, f: Math.max(1, nf >> 1), opt })), ...(nf > 3 ? [{ L, d: 1, pose: p, f: nf - 1, opt }] : [])]]; });
    await grid(out.replace('.png', `-${n}.png`), 'ANIMATIONS, THE PASS ON: S SE E NE N NW W SW, THEN ANOTHER FRAME S, E (SE)', rows, { k: 4, rh: 34, cw: 26, label: 90 });
  }
}
// the eight and three dark outfits on the grounds they walk - busy ones too - by day, at night, in rain: pass 1 over pass 2
async function grounds2(out) {
  const dark = [dressed('m', { top: ['Hoodie', 'black'], bottoms: ['Black jeans', 'black'], shoes: ['Combat boots', 'black'], hat: ['Beanie', 'black'] }, { skin: 12 }), dressed('f', { set: ['Mini dress', 'black'], jacket: ['Leather jacket', 'black'], shoes: ['Knee boots', 'black'] }, { skin: 0 }, { hair: { style: 16, color: 0 } }), LK.policeLook(LK.emptyLook('m'), 0)];
  const who = [...EIGHT.map((e) => e[2]), ...dark];
  const GR = [['PAVEMENT', [150, 146, 140]], ['COBBLES|(BUSY)', [128, 122, 116], [22, 20, 18]], ['ASPHALT', [78, 80, 88]], ['GRASS|(BUSY)', [92, 140, 70], [26, 30, 18]], ['SAND', [214, 196, 150]], ['LEAF LITTER|(BUSY)', [112, 92, 60], [40, 28, 14]], ['NIGHT', [34, 38, 62], null, [0.5, 0.52, 0.72]], ['NIGHT, BUSY', [38, 44, 60], [14, 14, 18], [0.5, 0.52, 0.72]], ['RAIN', [84, 90, 100], null, [0.78, 0.8, 0.86], 1]];
  const rows = [];
  for (const [name, bg, busy, tint, rain] of GR) for (const p1 of [true, false]) rows.push([p1 ? name : 'PASS 2', who.map((L, i) => ({ L, d: i % 2 ? 4 : 1, pose: i % 3 ? 'idle' : 'walk0', f: 1, bg, busy, tint, rain, p1 }))]);
  await grid(out, 'ON THE GROUNDS THEY WALK, GAME SCALE x 1.5: PASS 1 (THE NAMED ROW) OVER PASS 2 - THE EIGHT, THEN THREE DARK OUTFITS', rows, { k: 3, rh: 31, cw: 20, label: 130 });
}
// a concept beside the game's people: the concept image (scaled to fit), then matching looks - pass 1 over pass 2
function readPng(file) {
  const b = readFileSync(file); let o = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (o < b.length) { const n = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8); if (t === 'IHDR') { w = b.readUInt32BE(o + 8); h = b.readUInt32BE(o + 12); ct = b[o + 17]; if (b[o + 16] !== 8 || (ct !== 2 && ct !== 6) || b[o + 20]) throw new Error('png: 8-bit RGB(A) only'); } else if (t === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + n)); o += 12 + n; }
  const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), st = w * bpp, px = Buffer.alloc(st * h);
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], r = y * (st + 1) + 1, q = y * st;
    for (let x = 0; x < st; x++) { const a = x >= bpp ? px[q + x - bpp] : 0, u = y ? px[q - st + x] : 0, c = x >= bpp && y ? px[q - st + x - bpp] : 0; let v = raw[r + x];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1; else if (f === 4) { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      px[q + x] = v & 255; } }
  return { w, h, bpp, px };
}
function pasteScaled(sh, I, x0, y0, W) {   // (a box filter: every source pixel of a target pixel averaged)
  const s = I.w / W, H = Math.round(I.h / s);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let r = 0, g = 0, bl = 0, n = 0;
    for (let j = Math.floor(y * s); j < Math.min(I.h, Math.ceil((y + 1) * s)); j++) for (let i = Math.floor(x * s); i < Math.min(I.w, Math.ceil((x + 1) * s)); i++) { const q = (j * I.w + i) * I.bpp; r += I.px[q]; g += I.px[q + 1]; bl += I.px[q + 2]; n++; }
    sh.rect(x0 + x, y0 + y, 1, 1, [r / n, g / n, bl / n].map(Math.round)); }
  return H;
}
async function versus(outDir) {
  const J = Object.fromEntries(JOBS()), st = (n) => LK.STARTERS.find((s) => s.name === n).look, tee = (base, body, hair) => dressed(base, { top: ['Plain tee', 'grey'], bottoms: ['Jeans', 'navy'], shoes: 'Sneakers' }, body, { hair });
  const U = (base, n, body, hair) => dressed(base, { under: n }, body, { hair });
  const SETS = [
    ['C1', 'THE BASE FIGURE', [tee('m', { skin: 1 }, { style: 6, color: 3 }), tee('f', { skin: 1 }, { style: 20, color: 3 }), tee('m', { skin: 1, build: 4 }, { style: 6, color: 3 }), tee('m', { skin: 12, build: 0, height: 4 }, { style: 8, color: 1 })], [0, 1, 2, 3, 4]],
    ['C3', 'SERVICES', [J.POLICE, J.K9, J.PARAMEDIC, J.FIRE, J.SECURITY, J.COURIER, J.BUILDER, J.LIFEGUARD], [1]],
    ['CC5-B', 'POLICE BY RANK', [J.ROOKIE, J.POLICE, J.K9, J.SERGEANT, J.DETECTIVE, J.DRESS, J.CHIEF], [1]],
    ['SM12', 'DARK CLOTHING (MEN)', [dressed('m', { top: ['Plain tee', 'black'], jacket: ['Trench coat', 'black'], bottoms: ['Black jeans', 'black'], shoes: ['Platform boots', 'black'], jewel: 'Pendant chain' }, { skin: 0 }, { hair: { style: 16, color: 0 } }), dressed('m', { top: ['Hoodie', 'black'], bottoms: ['Cargo pants', 'black'], shoes: ['Combat boots', 'black'] }, { skin: 1 }, { hair: { style: 1 } }), dressed('m', { top: ['Plain tee', 'black'], jacket: ['Leather jacket', 'black'], bottoms: ['Ripped jeans', 'black'], shoes: ['Combat boots', 'black'] }, { skin: 9 }, { hair: { style: 10, color: 18 } }), st('The Executive'), st('The Punk')], [1, 5]],
    ['SF12', 'DARK CLOTHING (WOMEN)', [dressed('f', { set: ['Evening gown', 'black'], jewel: ['Choker', 'black'], shoes: ['Platform boots', 'black'] }, { skin: 6 }, { hair: { style: 16, color: 0 } }), dressed('f', { top: ['Corset top', 'black', 'wine'], bottoms: ['Maxi skirt', 'wine'], shoes: ['Platform boots', 'black'] }, { skin: 0 }, { hair: { style: 17, color: 5 } }), dressed('f', { top: ['Sweater', 'black'], bottoms: ['Plaid skirt', 'red', 'black'], shoes: ['Combat boots', 'black'] }, { skin: 7 }, { hair: { style: 19, color: 0 } }), dressed('f', { set: ['Slip dress', 'black'], jacket: ['Cardigan', 'olive'], shoes: ['Ankle boots', 'black'] }, { skin: 1 }, { hair: { style: 16, color: 13 } })], [1, 5]],
    ['SF23-A', 'UNDERWEAR (WOMEN)', ['Bra and briefs', 'Lace bra and panties', 'Sports bra and shorts', 'Strapless set', 'Tank and briefs', 'Lace bodysuit'].map((n, i) => U('f', n, { skin: [1, 9, 12, 0, 4, 14][i], build: [1, 3, 2, 0, 1, 3][i] }, { style: [21, 9, 20, 19, 16, 24][i], color: [3, 0, 10, 0, 5, 0][i] })), [0, 4]],
    ['SM23', 'UNDERWEAR (MEN)', ['Briefs', 'Boxers', 'Boxer briefs', 'Fitted trunks', 'Tank and briefs', 'Undershirt and boxers', 'Union suit'].map((n, i) => U('m', n, { skin: [1, 9, 12, 0, 4, 14, 2][i], build: [1, 0, 2, 1, 4, 1, 1][i] }, { style: [6, 2, 1, 8, 2, 10, 3][i], color: [3, 0, 1, 3, 12, 14, 5][i], facial: i === 4 ? 3 : 0 })), [0, 4]],
    ['CB3-M', 'HAIR (THE SIX ADDED: ONLY PASS 2 DRAWS THEM)', LK.HAIR_STYLES.map((s, i) => [s, i]).filter(([s]) => s[3]).map(([s, i], n) => tee(s[1][0], { skin: [1, 12, 2, 13, 0, 9][n] }, { style: i, color: [12, 0, 1, 0, 4, 0][n] })), [1, 5]],
  ];
  for (const [img, title, looks, dirs] of SETS) {
    const I = readPng(join(DOCS, 'concepts', img + '.png')), CW0 = 520, k = 6, cw = 19 * k, RH = 33 * k, n = looks.length * dirs.length, W = CW0 + 24 + Math.max(n * cw, 600), H0 = Math.round(I.h * CW0 / I.w), H = Math.max(H0, 2 * RH + 40) + 34;
    const sh = new Sheet(W, H);
    sh.text(img + ': ' + title + ' - THE CONCEPT | PASS 1 OVER PASS 2', 8, 6, 2);
    pasteScaled(sh, I, 8, 26, CW0);
    for (const [r, p1] of [[0, true], [1, false]]) {
      sh.text(p1 ? 'PASS 1' : 'PASS 2', CW0 + 24, 30 + r * (RH + 10), 2, p1 ? [240, 200, 160] : [170, 240, 170]);
      await polish(true); if (p1) setPolish(PASS1());
      looks.forEach((L, i) => dirs.forEach((d, j) => sh.sprite(baked(LK.lookArt(L), d), CW0 + 24 + (i * dirs.length + j) * cw + cw / 2, 30 + (r + 1) * (RH + 10) - 16, k)));
    }
    sh.save(join(outDir, 'vs-' + img + '.png'));
  }
}
const DOCS = join(ROOT, 'docs', 'characters'), P2 = join(DOCS, 'pass2'), P3 = join(DOCS, 'pass3'), P4 = join(DOCS, 'pass4'), P5 = join(DOCS, 'pass5');
if (mode === 'before') await lineup(false, arg('out', join(DOCS, 'before.png')), 'TODAY\'S PEOPLE (BEFORE)');
else if (mode === 'after') await lineup(true, arg('out', join(DOCS, 'after.png')), 'AFTER: THE POLISH PASS');
else if (mode === 'side') await sides(arg('out', DOCS));
else if (mode === 'grounds') await grounds(arg('out', join(DOCS, 'grounds.png')));
else if (mode === 'faces') await faces(arg('out', join(DOCS, 'faces.png')));
else if (mode === 'variants') await variants(arg('out', join(DOCS, 'variants.png')));
else if (mode === 'poses') await poses(arg('out', join(DOCS, 'poses.png')));
else if (mode === 'hair') await hair(arg('out', join(DOCS, 'hair.png')));
else if (mode === 'builds') await builds(arg('out', join(DOCS, 'builds.png')));
else if (mode === 'grounds2') await grounds2(arg('out', join(P2, 'grounds.png')));
else if (mode === 'versus') await versus(arg('out', P2));
else if (mode === 'anim') await anim(arg('out', join(P2, 'anim.png')));
else if (mode === 'lineup') await lineup2(arg('out', join(P2, 'lineup.png')));
else if (mode === 'under') await under(arg('out', join(P2, 'underwear.png')));
else if (mode === 'p3police') await p3police(arg('out', join(P3, 'police.png')));
else if (mode === 'p3mouth') await p3mouth(arg('out', join(P3, 'faces-mouth.png')));
else if (mode === 'p3hair') await p3hair(arg('out', join(P3, 'hair.png')));
else if (mode === 'p3socks') await p3socks(arg('out', join(P3, 'socks.png')));
else if (mode === 'p3gear') await p3gear(arg('out', join(P3, 'gear.png')));
else if (mode === 'p3body') await p3body(arg('out', join(P3, 'body.png')));
else if (mode === 'p3drapes') await p3drapes(arg('out', join(P3, 'drapes.png')));
else if (mode === 'p3phone') await p3phone(arg('out', join(P3, 'phone.png')));
else if (mode === 'p3props') await p3props(arg('out', join(P3, 'props.png')));
else if (mode === 'p4under') await p4under(arg('out', join(P4, 'underwear.png')));
else if (mode === 'p5under') await p4under(arg('out', join(P5, 'underwear.png')), true);
else if (mode === 'p5hair') await p5hair(arg('out', join(P5, 'hair.png')));
else if (mode === 'dev') await dev(arg('out', 'dev.png'));
else { console.error('charsheet: before | after | side | grounds | faces'); process.exit(1); }
