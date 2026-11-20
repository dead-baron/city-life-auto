// The people's review sheets (docs/tasks/CHARACTERS.md, docs/characters/): the game's own people (client/art2/people.js,
// dressed by the look system) as the game bakes them - one art pixel = 2 x 2 world px (gbuf.js downsample2) - on a flat
// ground, at game scale and 4x. No browser and no dependencies: Node writes the PNG itself.
//   node tools/charsheet.mjs before            -> docs/characters/before.png      (today's people)
//   node tools/charsheet.mjs after             -> docs/characters/after.png       (the polish pass switched on)
//   node tools/charsheet.mjs side              -> docs/characters/side-<name>.png (before | after, one per archetype)
//   node tools/charsheet.mjs grounds           -> docs/characters/grounds.png     (before over after on pavement, grass, sand, night, rain)
//   node tools/charsheet.mjs faces             -> docs/characters/faces.png       (heads at 8x, before over after: every eye, brow, nose and lip option)
//   options: --out file.png, --rows 0,3 (which archetypes), --zoom 4 (the big figures)
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
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
async function grid(out, title, rows, { k = KB, cw = 22, rh = 34, bg, label = 150 } = {}) {
  const CW = cw * k, RH = rh * k, n = Math.max(...rows.map((r) => r[1].length)), sh = new Sheet(label + n * CW + 8, 24 + rows.length * RH + 8, bg);
  sh.text(title, 8, 6, 2);
  for (const [ri, [name, cells]] of rows.entries()) {
    const y = 24 + (ri + 1) * RH - 2 * k;
    String(name).split('|').forEach((t, i) => sh.text(t, 6, y - RH / 2 + i * 12, 2));
    for (const [ci, c] of cells.entries()) {
      if (!c) continue;
      await polish(c.on !== false); if (c.p1) setPolish(PASS1());
      const x = label + ci * CW + CW / 2;
      if (c.bg) sh.rect(x - CW / 2, y - RH + 2 * k, CW, RH, c.bg);
      sh.sprite(baked(c.A || LK.lookArt(c.L, c.art), c.d ?? 1, c.pose || 'idle', c.f || 0, c.opt || {}), x, y - 2 * k, k, c.tint || null);
      if (c.t) sh.text(c.t, x - CW / 2 + 3, y - RH + 2 * k + 3, 1, [225, 225, 230]);
    }
  }
  sh.save(out);
}
const dressed = (base, outfit, body = {}, more = {}) => { const L = LK.emptyLook(base); Object.assign(L.body, body); if (more.hair) Object.assign(L.hair, more.hair); if (more.face) Object.assign(L.face, more.face); if (more.extras) Object.assign(L.extras, more.extras); for (const [s, v] of Object.entries(outfit)) L.outfit[s] = typeof v === 'string' ? LK.item(v) : Array.isArray(v) ? LK.item(...v) : v; return LK.validLook(L); };
// every underwear piece on both bases, front and back, at the big scale and the game's
async function under(out) {
  const U = LK.PIECES.filter((p) => p && p.slot === 'under'), rows = [];
  for (const base of ['m', 'f']) for (const p of [null, ...U.filter((q) => q.b.includes(base))]) {
    const L = dressed(base, p ? { under: p.name } : {}, { skin: base === 'm' ? 2 : 9, build: base === 'm' ? 1 : 3 }, { hair: { style: base === 'f' ? 20 : 6 } });
    rows.push([(p ? p.name : 'basic (none picked)').replace(' and ', ' +|'), [{ L, d: 0 }, { L, d: 1 }, { L, d: 2 }, { L, d: 4 }, { L, d: 0, pose: 'walk0', f: 1 }, { L, d: 0, on: false, t: 'off' }, { L, d: 0, art: { censored: true }, t: 'censored' }]]);
  }
  const half = Math.ceil(rows.length / 2);
  await grid(out.replace('.png', '-1.png'), 'UNDERWEAR (PASS ON): S, SE, E, N, WALKING; THE PASS OFF; CENSORED NUDITY ON', rows.slice(0, half), { k: 6, rh: 32 });
  await grid(out.replace('.png', '-2.png'), 'UNDERWEAR (PASS ON): S, SE, E, N, WALKING; THE PASS OFF; CENSORED NUDITY ON', rows.slice(half), { k: 6, rh: 32 });
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
const DOCS = join(ROOT, 'docs', 'characters'), P2 = join(DOCS, 'pass2');
if (mode === 'before') await lineup(false, arg('out', join(DOCS, 'before.png')), 'TODAY\'S PEOPLE (BEFORE)');
else if (mode === 'after') await lineup(true, arg('out', join(DOCS, 'after.png')), 'AFTER: THE POLISH PASS');
else if (mode === 'side') await sides(arg('out', DOCS));
else if (mode === 'grounds') await grounds(arg('out', join(DOCS, 'grounds.png')));
else if (mode === 'faces') await faces(arg('out', join(DOCS, 'faces.png')));
else if (mode === 'variants') await variants(arg('out', join(DOCS, 'variants.png')));
else if (mode === 'poses') await poses(arg('out', join(DOCS, 'poses.png')));
else if (mode === 'hair') await hair(arg('out', join(DOCS, 'hair.png')));
else if (mode === 'builds') await builds(arg('out', join(DOCS, 'builds.png')));
else if (mode === 'lineup') await lineup2(arg('out', join(P2, 'lineup.png')));
else if (mode === 'under') await under(arg('out', join(P2, 'underwear.png')));
else if (mode === 'dev') await dev(arg('out', 'dev.png'));
else { console.error('charsheet: before | after | side | grounds | faces'); process.exit(1); }
