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
    const [id, name, L] = EIGHT[r], A = LK.lookArt(L), W = stripWidth(), H = 56 + 2 * stripH();
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
const DOCS = join(ROOT, 'docs', 'characters');
if (mode === 'before') await lineup(false, arg('out', join(DOCS, 'before.png')), 'TODAY\'S PEOPLE (BEFORE)');
else if (mode === 'after') await lineup(true, arg('out', join(DOCS, 'after.png')), 'AFTER: THE POLISH PASS');
else if (mode === 'side') await sides(arg('out', DOCS));
else if (mode === 'grounds') await grounds(arg('out', join(DOCS, 'grounds.png')));
else if (mode === 'faces') await faces(arg('out', join(DOCS, 'faces.png')));
else if (mode === 'dev') await dev(arg('out', 'dev.png'));
else { console.error('charsheet: before | after | side | grounds | faces'); process.exit(1); }
