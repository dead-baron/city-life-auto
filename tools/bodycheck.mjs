// The body check (the owner, 2026-11-20: "is there a better way ... so that all the things we've discussed are fixed and
// checked and we nail it down"): every rule he gave for the people's bodies, measured on the game's own art pixels, for both
// bases, the five builds and the eight directions, in underwear and in clothes. test/bodyshape.test.js runs it; run it by
// hand for the list:   node tools/bodycheck.mjs [--show f,3,under,0]
import { person, setPolish } from '../client/art2/people.js';
import { packGBuf, downsample2 } from '../client/art2/gbuf.js';
import * as LK from '../shared/look.js';

const TORSO = 4, ARML = 5, ARMR = 6, LEGL = 7, LEGR = 8, HEAD = 1;
const lum = (c) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
const teal = (c) => c[2] > c[0] + 30 && c[1] > c[0] + 30, blue = (c) => c[2] > c[0] + 40 && c[2] > c[1] + 12;
const BLUE = LK.EYE_COLORS.findIndex((c) => c[1] === 'Blue');

export function look(base, build, outfit) {
  const L = LK.emptyLook(base); L.hair.style = 2; L.body.build = build; L.body.skin = 2; L.face.eyeColor = BLUE;
  if (outfit === 'under') L.outfit.under = LK.item(base === 'f' ? 'Bra and briefs' : 'Boxers', 'teal', 'teal');
  else { L.outfit.top = LK.item(base === 'f' ? 'Tank top' : 'Plain tee', 'white'); L.outfit.bottoms = LK.item('Jeans'); L.outfit.shoes = LK.item('Sneakers'); }
  return LK.lookArt(LK.validLook(L));
}
// one sprite as the game bakes it: at(x, y) -> null | { ol, g, part, m, ln, c }
export function bake(A, dir, pose = 'idle', frame = 0) {
  const g = person(A, dir, pose, frame, { tight: true, info: 1 }), d = downsample2(packGBuf(g)), I = g.info, w = d.w, h = d.h, px = new Array(w * h).fill(null);
  for (let o = 0; o < w * h; o++) { const k = d.pick[o]; if (d.p0[o * 4 + 3] && k >= 0) px[o] = { ol: I.ol[k] === 1, g: I.grp[k], part: I.part[k], m: I.mtl[k], ln: I.ln[k], c: [d.p0[o * 4], d.p0[o * 4 + 1], d.p0[o * 4 + 2]] }; }
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : px[y * w + x]), body = (x, y) => { const p = at(x, y); return !!p && !p.ol; };
  return { w, h, ax: d.ax, ay: d.ay, at, body };
}
const each = (S, f) => { for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { const p = S.at(x, y); if (p && !p.ol) f(p, x, y); } };
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };

// ---- the rules: each returns the faults it finds on one sprite (strings) ----------------------------------------------
// 1. no points: a body art pixel standing out on its own - sideways (nothing over or under it) or up (nothing beside or over it)
function points(S) {
  const out = [];
  each(S, (p, x, y) => {
    if (![TORSO, ARML, ARMR, LEGL, LEGR].includes(p.g) || ['shoe', 'sole', 'boot'].includes(p.part)) return;
    const b = S.body;
    if (!b(x, y - 1) && !b(x, y + 1) && b(x - 1, y) !== b(x + 1, y)) out.push(`a point (${p.part}) at ${x},${y}`);
    else if (!b(x - 1, y) && !b(x + 1, y) && !b(x, y - 1) && p.g !== TORSO) out.push(`a point up (${p.part}) at ${x},${y}`);
  });
  return out;
}
// 2. no bumps on the trunk: one art pixel out, one or two tall (a woman's bust and seat are meant; a belly is three tall or none)
function bumps(S) {
  const out = [], tr = (x, y) => { const p = S.at(x, y); return !!p && !p.ol && p.g === TORSO && p.part !== 'bust' && p.part !== 'seat'; };
  for (let x = 1; x < S.w - 1; x++) for (const sd of [-1, 1]) for (let y = 1; y < S.h - 3; y++) {
    const edge = (yy) => tr(x, yy) && !S.body(x + sd, yy) && S.body(x - sd, yy);
    if (!edge(y) || S.body(x, y - 1)) continue;
    let len = 1; while (len < 3 && edge(y + len)) len++;
    if (len <= 2 && !S.body(x, y + len) && !(len === 2 && S.at(x, y).part === 'belly')) out.push(`a bump ${len} tall (${S.at(x, y).part}) at ${x},${y}`);
  }
  return out;
}
// the garment on the hips' middle: the lowest row where a middle art pixel is the trunk's and not bare skin
const mid = (S) => [S.ax - 1, S.ax];
function crotch(S, isCloth) { let T = -1; for (let y = 0; y < S.h; y++) for (const x of mid(S)) { const p = S.at(x, y); if (p && !p.ol && p.g === TORSO && isCloth(p)) T = y; } return T; }
// 3. the legs are two legs, front and back: from the feet up to the garment, a gap or a line between them on every row
function legs(S, isCloth) {
  const T = crotch(S, isCloth); if (T < 0) return ['no garment on the hips\' middle'];
  let bottom = 0; each(S, (p, x, y) => { if ((p.g === LEGL || p.g === LEGR) && !['shoe', 'sole', 'boot'].includes(p.part)) bottom = Math.max(bottom, y); });
  const bad = [];
  for (let y = T + 1; y <= bottom; y++) {
    const sep = mid(S).some((x) => { const p = S.at(x, y); if (!p || p.ol || p.ln) return true; const n = [S.at(x - 1, y), S.at(x + 1, y)].filter((q) => q && !q.ol).map((q) => lum(q.c)); return n.length === 2 && lum(p.c) < 0.72 * Math.min(...n); });
    if (!sep) bad.push(y);
  }
  return bad.length ? [`legs not apart on rows ${bad.join(',')} (the garment ends at row ${T}, the legs at ${bottom})`] : bottom - T < 3 ? [`no legs under the garment (${T}..${bottom})`] : [];
}
// 4. underwear from the front and from behind: there, whole across the middle, nothing bare under it
function underwear(S) {
  const out = []; let n = 0, top = 1e9, bot = -1;
  each(S, (p, x, y) => { if (teal(p.c) && ['pel', 'seat', 'th', 'belly', 'waist'].includes(p.part) && y > S.h * 0.45) { n++; top = Math.min(top, y); bot = Math.max(bot, y); } });
  if (n < 6) return [`the underwear's bottom half is ${n} art pixels`];
  for (let y = top; y <= bot; y++) for (const x of mid(S)) { const p = S.at(x, y); if (p && !p.ol && !teal(p.c)) out.push(`bare in the underwear's middle at ${x},${y} (${p.part})`); }
  for (let y = bot + 1; y < S.h; y++) for (const x of mid(S)) { const p = S.at(x, y); if (p && !p.ol && p.g === TORSO && !p.ln) out.push(`the trunk bare under the underwear at ${x},${y} (${p.part})`); }
  return out;
}
// 5. straps, front and back: over the top's wide rows, the top's cloth on both sides of the neck (a row: the chunky build has one)
function straps(S, isTop) {
  const rows = new Map(); each(S, (p, x, y) => { if (isTop(p)) (rows.get(y) || rows.set(y, []).get(y)).push(x); });
  let wide = 1e9; for (const [y, xs] of rows) if (xs.length >= 4 && y < wide) wide = y;
  if (wide === 1e9) return ['no top'];
  const out = [];
  // (a side with nothing of the trunk on that row - hair over it from behind, the jaw over it on a big build - has no strap to show)
  const trunk = (sd) => { for (let x = 0; x < S.w; x++) { const p = S.at(x, wide - 1); if (p && !p.ol && p.g === TORSO && (sd < 0 ? x < S.ax : x >= S.ax)) return true; } return false; };
  for (const y of [wide - 1]) { const xs = rows.get(y) || []; if ((trunk(-1) && !xs.some((x) => x < S.ax)) || (trunk(1) && !xs.some((x) => x >= S.ax))) out.push(`no strap on both sides on row ${y} (the top's wide rows start at ${wide}; cloth at ${xs.join(',') || 'none'})`); }
  return out;
}
// 6. a neck from the side: under the chin, a row of the outline set in from the chin above it and from the chest below it
function neck(S, dir) {
  const f = dir === 2 ? 1 : -1, front = (y) => { let v = -1e9; for (let x = 0; x < S.w; x++) if (S.body(x, y)) v = Math.max(v, f * x); return v; };
  let chin = -1; each(S, (p, x, y) => { if (p.g === HEAD) chin = Math.max(chin, y); });
  const chinF = Math.max(front(chin - 1), front(chin - 2), front(chin - 3)); let chestF = -1e9, chestY = chin; for (let y = chin + 1; y <= chin + 6; y++) if (front(y) > chestF) { chestF = front(y); chestY = y; }
  for (let y = chin - 1; y < chestY; y++) if (front(y) <= chinF - 1 && front(y) <= chestF - 1) return [];
  return [`no neck from the side: the chin at ${f * chinF} (rows to ${chin}), the chest at ${f * chestF} (row ${chestY}), between them ${Array.from({ length: Math.max(0, chestY - chin + 1) }, (_, k) => f * front(chin - 1 + k)).join(',') || 'no row'}`];
}
// 7. shading and lines on a white top, and on bare skin: nothing darker than about two thirds of its usual tone
function dark(S, is, what, k) {
  const L = [], at = []; each(S, (p, x, y) => { if (is(p)) { L.push(lum(p.c)); at.push(`${x},${y} ${p.part}${p.ln ? ' line' : ''}`); } });
  if (L.length < 8) return [];
  const m = median(L), bad = at.filter((_, i) => L[i] < k * m);
  return bad.length ? [`${bad.length} art pixels of ${what} darker than ${k} of its tone (${Math.min(...L).toFixed(2)} against ${m.toFixed(2)}): ${bad.slice(0, 5).join('; ')}`] : [];
}
// 8. a level hem, front and back: the top's lowest row the same across the middle
function hem(S, isTop) {
  const low = (x) => { let v = -1; for (let y = 0; y < S.h; y++) { const p = S.at(x, y); if (p && !p.ol && isTop(p)) v = y; } return v; };
  const v = [-2, -1, 0, 1].map((k) => low(S.ax + k));
  return Math.max(...v) - Math.min(...v) > 0 ? [`the hem's rows across the middle: ${v.join(',')}`] : [];
}
// 9. eyes: two from the front and at an angle, one from the side (blue ones here, to count them)
function eyes(S, dir) { let n = 0; each(S, (p) => { if (p.g === HEAD && blue(p.c)) n++; }); const want = dir === 2 || dir === 6 ? 1 : 2; return n < want ? [`${n} eye pixels in the eyes' colour (${want} wanted)`] : []; }
// 10. feet in proportion, from the front: a foot no more than an art pixel wider than its shin
function feet(S) {
  const rows = []; each(S, (p, x, y) => { if (p.g === LEGL || p.g === LEGR) (rows[y] ||= []).push(x); });
  const ys = Object.keys(rows).map(Number).sort((a, b) => a - b); if (ys.length < 6) return [];
  const wid = (y, sd) => rows[y].filter((x) => (sd < 0 ? x < S.ax : x >= S.ax)).length, out = [];
  for (const sd of [-1, 1]) { const foot = Math.max(wid(ys[ys.length - 1], sd), wid(ys[ys.length - 2], sd)), shin = wid(ys[ys.length - 4], sd); if (foot > shin + 1) out.push(`a foot ${foot} wide under a shin ${shin} wide`); }
  return out;
}

export const BUILDS = LK.BUILDS.map((b) => b.name);
// every fault, as { who, rule, text }
export function check(POLISH, { bases = ['f', 'm'], builds = [0, 1, 2, 3, 4], dirs = [0, 1, 2, 3, 4, 5, 6, 7], outfits = ['under', 'clothed'], poses = ['idle'] } = {}) {
  setPolish(POLISH);
  const faults = [], add = (who, rule, list) => { for (const text of list) faults.push({ who, rule, text }); };
  try {
    for (const base of bases) for (const b of builds) for (const outfit of outfits) {
      const A = look(base, b, outfit), under = outfit === 'under';
      for (const pose of poses) for (const dir of dirs) {
        const idle = pose === 'idle', S = bake(A, dir, pose), who = `${base === 'f' ? 'woman' : 'man'} ${BUILDS[b]}, ${outfit}, ${idle ? '' : pose + ', '}facing ${dir}`;
        let skinM = 0; each(S, (p) => { if (p.part === 'hand') skinM = p.m; });
        const cnt = new Map(); each(S, (p) => { if (['chest', 'bust', 'waist'].includes(p.part) && p.m !== skinM) cnt.set(p.m, (cnt.get(p.m) || 0) + 1); });
        const topM = [...cnt].sort((x, y) => y[1] - x[1])[0]?.[0] || -1;
        const isTop = under ? (p) => teal(p.c) && !['pel', 'seat', 'th'].includes(p.part) && p.g === TORSO : (p) => p.m === topM && (p.g === TORSO || p.g === HEAD);   // (a strap's art pixel under the jaw is the top's by its cloth)
        add(who, 'points', points(S)); add(who, 'bumps', bumps(S));
        add(who, 'eyes', dir === 3 || dir === 4 || dir === 5 ? [] : eyes(S, dir));
        if (idle && (dir === 2 || dir === 6)) add(who, 'neck', neck(S, dir));
        if (idle && (dir === 0 || dir === 4)) {
          add(who, 'legs', legs(S, under ? (p) => teal(p.c) : (p) => p.m !== skinM));
          if (under) add(who, 'underwear', underwear(S));
          if (base === 'f') add(who, 'straps', straps(S, isTop));
          if (!under) add(who, 'hem', hem(S, isTop));
        }
        if (idle && dir === 0) add(who, 'feet', feet(S));
        if (!under) add(who, 'dark', dark(S, (p) => p.m === topM && p.g === TORSO, 'the white top', 0.56));
        else add(who, 'dark', dark(S, (p) => p.m === skinM && !teal(p.c) && ['chest', 'bust', 'waist', 'belly', 'shb', 'neck', 'collar', 'ua', 'fa', 'hand'].includes(p.part), 'the bare skin', 0.56));
      }
    }
  } finally { setPolish(null); }
  return faults;
}
export function show(S) { const ch = { 1: 'H', 2: 'r', 3: 't', 4: 'T', 5: 'a', 6: 'a', 7: 'L', 8: 'R', 9: 'k', 10: 'c', 11: 'i' }, rows = []; for (let y = 0; y < S.h; y++) { let r = String(y).padStart(2) + ' '; for (let x = 0; x < S.w; x++) { const p = S.at(x, y); r += !p ? '.' : p.ol ? 'o' : p.ln ? '|' : teal(p.c) ? 'u' : ch[p.g] || '?'; } rows.push(r); } return rows.join('\n') + `\n   middle between ${S.ax - 1} and ${S.ax}`; }

if (process.argv[1] && process.argv[1].endsWith('bodycheck.mjs')) {
  const { POLISH } = await import('../client/art2/peoplepolish.js'), i = process.argv.indexOf('--show');
  if (i > 0) { const [base, b, outfit, dir, row, pose] = process.argv[i + 1].split(','); setPolish(POLISH); const S = bake(look(base, +b, outfit), +dir, pose || 'idle'); console.log(show(S)); if (row) for (let x = 0; x < S.w; x++) { const p = S.at(x, +row); if (p && !p.ol) console.log(x, p.part, 'g' + p.g, 'm' + p.m, p.ln ? 'line' : '', p.c.join(',')); } setPolish(null); }
  else { const pi = process.argv.indexOf('--poses'), F = check(POLISH, pi > 0 ? { poses: process.argv[pi + 1].split(',') } : {}), by = new Map(); for (const f of F) (by.get(f.rule) || by.set(f.rule, []).get(f.rule)).push(f);
    for (const [rule, list] of by) { console.log(`\n${rule}: ${list.length}`); const seen = new Set(); for (const f of list) { const k = f.who.replace(/, facing \d/, ''); if (seen.has(k) && !process.argv.includes('--all')) continue; seen.add(k); console.log(`  ${f.who}: ${f.text}`); } }
    console.log(`\n${F.length} faults`); }
}
