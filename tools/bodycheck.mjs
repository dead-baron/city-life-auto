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

// ---- the owner's notes of 11-20 16:51 --------------------------------------------------------------------------------
// 11. in profile an arm is no longer than from the front: how far down the body the hand ends (0 the shoulders .. 1 the
// soles) is within an art pixel and a half's worth of the same figure's from the front (it was three more) ("arms/hands seem way too long on side view")
function reachOf(S) {
  let top = 1e9, bot = -1, hand = -1; each(S, (p, x, y) => { if (p.g === TORSO) top = Math.min(top, y); if (p.g === LEGL || p.g === LEGR) bot = Math.max(bot, y); if (p.g === ARML || p.g === ARMR) hand = Math.max(hand, y); });
  return (hand - top) / Math.max(1, bot - top);
}
const reach = (S, front) => { const k = reachOf(S); return k > front + 0.08 ? [`the hand ends ${k.toFixed(2)} of the way down the body; from the front ${front.toFixed(2)}`] : []; };
// 12. a top with straps, in profile: no art pixel of it alone (none of it above, below or beside), and no single art pixel of
// skin in it ("extra white pixel on neck", "pixel missing (showing skin pixel)")
function profile(S, isTop, skinM) {
  const out = [], t = (x, y) => { const p = S.at(x, y); return !!p && !p.ol && isTop(p); }, sk = (x, y) => { const p = S.at(x, y); return !!p && !p.ol && p.m === skinM && !isTop(p); };
  each(S, (p, x, y) => {
    const n4 = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    if (isTop(p) && p.g === TORSO && !n4.some(([a, b]) => t(a, b))) out.push(`an art pixel of the top on its own at ${x},${y}`);
    if (p.g === TORSO && p.m === skinM && !p.ln && !n4.some(([a, b]) => sk(a, b)) && n4.filter(([a, b]) => t(a, b)).length >= 2) out.push(`an art pixel of skin in the top at ${x},${y}`);
  });
  return out;
}
// 13. bare legs stay as far apart going up as they stand below: the gap or line between them never narrows and widens again
// ("extra skin pixel on leg between thighs")
function thighs(S, isCloth) {
  const T = crotch(S, isCloth); if (T < 0) return [];
  let bottom = 0; each(S, (p, x, y) => { if ((p.g === LEGL || p.g === LEGR) && !['shoe', 'sole', 'boot'].includes(p.part)) bottom = Math.max(bottom, y); });
  const sep = (y) => { let a = -1, b = -1; for (let x = 0; x < S.w; x++) { const p = S.at(x, y); if (p && !p.ol && !p.ln && (p.g === LEGL || p.g === LEGR)) { if (teal(p.c)) return -1; if (x < S.ax) a = Math.max(a, x); else if (b < 0) b = x; } } return a >= 0 && b >= 0 ? b - a - 1 : -1; };   // (bare rows only: a boxer's legs have their own fold)
  let hi = 0; const out = [];   // (going down from the garment the gap may only widen)
  for (let y = T + 1; y <= bottom - 1; y++) { const v = sep(y); if (v < 0) continue; if (v < hi) { out.push(`the legs ${v} apart on row ${y}, under a row where they are ${hi} apart`); break; } hi = Math.max(hi, v); }
  return out;
}
// 14. a bra from behind: each strap runs on up from the band while there is back over it ("straps not working on back view")
function strapsUp(S, isTop) {
  const rows = new Map(); each(S, (p, x, y) => { if (isTop(p)) (rows.get(y) || rows.set(y, []).get(y)).push(x); });
  let wide = 1e9; for (const [y, xs] of rows) if (xs.length >= 4 && y < wide) wide = y;
  if (wide === 1e9) return [];
  const out = [];
  for (const x of rows.get(wide - 1) || []) { const p = S.at(x, wide - 2); if (p && !p.ol && p.g === TORSO && !isTop(p)) out.push(`a strap stops an art pixel over the band at ${x},${wide - 1}, with bare back over it`); }
  return out;
}
// 15. a bra at an angle from the front: a row of it across the chest (three art pixels or more) and a strap up from both ends
// ("straps missing, swimsuit not showing correctly")
function angled(S, isTop) {
  const rows = new Map(); each(S, (p, x, y) => { if (isTop(p)) (rows.get(y) || rows.set(y, []).get(y)).push(x); });
  let wide = -1, n = 0; for (const [y, xs] of [...rows].sort((a, b) => a[0] - b[0])) if (xs.length > n) { n = xs.length; wide = y; }
  if (n < 3) return [`the top's widest row at an angle is ${n} art pixels`];
  const run = (xs) => xs.length >= 3 && Math.max(...xs) - Math.min(...xs) + 1 === xs.length;   // (a row of the top, not two straps and a cup's corner)
  let y0 = wide; while (rows.has(y0 - 1) && run(rows.get(y0 - 1))) y0--;
  const xs = rows.get(y0), up = rows.get(y0 - 1) || [], a = Math.min(...xs), b = Math.max(...xs);
  const bare = (x0, x1) => { for (let x = x0; x <= x1; x++) { const p = S.at(x, y0 - 1); if (p && !p.ol && p.g === TORSO && !isTop(p)) return true; } return false; };   // (an end under the arm or the chin has no strap to show)
  return (up.some((x) => x <= a + 1) || !bare(a, a + 1)) && (up.some((x) => x >= b - 1) || !bare(b - 1, b)) ? [] : [`no strap up from both ends of the top at an angle (row ${y0}: ${a}..${b}; over it ${up.join(',') || 'none'})`];
}
// 16. short hair in profile: no art pixel of it out on its own at the back of the head ("a pixel sticking out on the head")
function nub(S) {
  const out = [], hr = (x, y) => { const p = S.at(x, y); return !!p && !p.ol && p.g === 2; };
  each(S, (p, x, y) => { if (p.g !== 2 || S.body(x, y - 1) || S.body(x, y + 1) || S.body(x - 1, y) === S.body(x + 1, y)) return; const ix = S.body(x - 1, y) ? x - 1 : x + 1; if (hr(ix, y) && hr(ix, y - 1) && hr(ix, y + 1)) out.push(`hair out on its own at ${x},${y}`); });
  return out;
}
// 17. a line on bare skin is skin's own shade, on a leg too - only the line between the legs, front and back, is dark
// ("an extra line on her leg", "dark shading happening in crotch region")
function skinline(S, skinM, dir) {
  const L = [], bad = []; each(S, (p) => { if (p.m === skinM && !p.ln && !teal(p.c) && p.g !== HEAD && p.g !== 2) L.push(lum(p.c)); });
  if (L.length < 8) return [];
  const m = median(L);
  each(S, (p, x, y) => { if (!p.ln || p.m !== skinM || teal(p.c) || ![TORSO, ARML, ARMR, LEGL, LEGR].includes(p.g)) return; if (dir % 4 === 0 && (p.g === LEGL || p.g === LEGR || p.part === 'pel' || p.part === 'seat') && Math.abs(x - S.ax + 0.5) <= 1.5) return; if (lum(p.c) < 0.5 * m) bad.push(`${x},${y} ${p.part}`); });
  return bad.length ? [`${bad.length} line art pixels on bare skin darker than half the skin's tone: ${bad.slice(0, 5).join('; ')}`] : [];
}
// 18. no art pixel of a garment (or of skin) on its own in another: one of a material the figure has plenty of, with none
// of it on any side or corner ("a random blue pixel here and there", "a random white pixel" - the owner, 11-20 17:44)
function stray(S, skinM, inside = false) {
  const n = new Map(), out = [], bodyP = (p) => p && !p.ol && [TORSO, ARML, ARMR, LEGL, LEGR].includes(p.g) && !['shoe', 'sole', 'boot', 'sh'].includes(p.part);   // (a sock's top at the ankle is its own thing)
  each(S, (p) => { if (bodyP(p)) n.set(p.m, (n.get(p.m) || 0) + 1); });
  const big = new Set([...n].filter(([m]) => m !== skinM).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m));   // (the wardrobe's: the cloths themselves - a badge, a reflective band, a button is a small material of its own)
  each(S, (p, x, y) => {
    if (!bodyP(p) || p.ln || n.get(p.m) < 6 || p.m === skinM) return;   // (a hand or an elbow showing past the body is not a stray)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = S.at(x + dx, y + dy); if ((dx || dy) && q && !q.ol && q.m === p.m) return; }
    if (inside && (!big.has(p.m) || [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => { const q = S.at(x + dx, y + dy); return !q || q.ol; }))) return;   // (the wardrobe's: on the figure's edge it is a part showing past another - a far shoulder - not a pixel inside a garment)
    out.push(`an art pixel on its own (${p.part}, ${p.c.join(',')}) at ${x},${y}`);
  });
  return out;
}

export const BUILDS = LK.BUILDS.map((b) => b.name);
// every fault, as { who, rule, text }
export function check(POLISH, { bases = ['f', 'm'], builds = [0, 1, 2, 3, 4], dirs = [0, 1, 2, 3, 4, 5, 6, 7], outfits = ['under', 'clothed'], poses = ['idle'] } = {}) {
  setPolish(POLISH);
  const faults = [], add = (who, rule, list) => { for (const text of list) faults.push({ who, rule, text }); };
  try {
    for (const base of bases) for (const b of builds) for (const outfit of outfits) {
      const A = look(base, b, outfit), under = outfit === 'under', frontK = reachOf(bake(A, 0));
      for (const pose of poses) for (const dir of dirs) {
        const idle = pose === 'idle', S = bake(A, dir, pose), who = `${base === 'f' ? 'woman' : 'man'} ${BUILDS[b]}, ${outfit}, ${idle ? '' : pose + ', '}facing ${dir}`;
        let skinM = 0; each(S, (p) => { if (p.part === 'hand') skinM = p.m; });
        const cnt = new Map(); each(S, (p) => { if (['chest', 'bust'].includes(p.part) && p.m !== skinM) cnt.set(p.m, (cnt.get(p.m) || 0) + 1); });
        const topM = [...cnt].sort((x, y) => y[1] - x[1])[0]?.[0] || -1;
        const isTop = under ? (p) => teal(p.c) && !['pel', 'seat', 'th'].includes(p.part) && p.g === TORSO : (p) => p.m === topM && (p.g === TORSO || p.g === HEAD);   // (a strap's art pixel under the jaw is the top's by its cloth)
        add(who, 'points', points(S)); add(who, 'bumps', bumps(S)); if (!under && idle && dir !== 2 && dir !== 6) add(who, 'stray', stray(S, skinM));   // (in profile the hanging arm parts a garment: the pixel of it in front of the hand is no stray)
        add(who, 'eyes', dir === 3 || dir === 4 || dir === 5 ? [] : eyes(S, dir));
        if (idle && (dir === 2 || dir === 6)) add(who, 'neck', neck(S, dir));
        if (idle && (dir === 2 || dir === 6)) { add(who, 'reach', reach(S, frontK)); add(who, 'nub', nub(S)); if (base === 'f' && !under) add(who, 'profile', profile(S, isTop, skinM)); }
        if (under) add(who, 'skinline', skinline(S, skinM, dir));
        if (idle && under && (dir === 0 || dir === 4)) add(who, 'thighs', thighs(S, (p) => teal(p.c)));
        if (idle && under && base === 'f' && dir === 4) add(who, 'strapsUp', strapsUp(S, isTop));
        if (idle && under && base === 'f' && (dir === 1 || dir === 7)) add(who, 'angled', angled(S, isTop));
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
// ---- the whole wardrobe (the owner, 11-20 22:19: "T shirt dress and jersey dress have skin pixels showing through (I thought
// we were doing checks on this to make sure)" - the check above dresses its figures in one outfit; this one puts on every
// piece in turn, as the wardrobe sheet does, on the base it is listed for). Two rules, on the trunk and the legs:
//  speck  - an art pixel of bare skin with clothing on three or four sides and no skin beside it: skin showing through
//  stray  - rule 18, an art pixel of a garment on its own in another
// A piece made to show skin through it (a ripped tee, mesh, lace) and a pattern of single pixels (dots) are left out of the
// rule that would name them. Returns { who, rule, text } like check().
function speck(S, skinM) {
  const out = [], body = (p) => p && !p.ol && [TORSO, LEGL, LEGR].includes(p.g), cloth = (p) => p && !p.ol && p.m !== skinM && [TORSO, ARML, ARMR, LEGL, LEGR, 9].includes(p.g);
  each(S, (p, x, y) => {
    if (!body(p) || p.m !== skinM || p.ln || ['neck', 'collar', 'hand', 'foot', 'shoe', 'sh', 'sole', 'boot'].includes(p.part)) return;   // (a sandal shows the foot)
    const N = [S.at(x - 1, y), S.at(x + 1, y), S.at(x, y - 1), S.at(x, y + 1)];
    if (N.some((q) => q && !q.ol && q.m === skinM)) return;
    if (N.filter((q) => q && !q.ol && (q.g === ARML || q.g === ARMR) && ['fa', 'hand'].includes(q.part)).length >= 2) return;   // (a hand's art pixel over the hip, cut off from the arm's skin by a cuff or a bangle, is the hand)
    if (N.filter(cloth).length >= 3) out.push(`skin showing through (${p.part}) at ${x},${y}`);
  });
  return out;
}
// A whole look, as a person in the city wears it (the NPCs: server/systems/npclooks.js recipes, personas.js LOOKS): skin showing
// through, from six sides. The same rule as wardrobe() below, on looks instead of single pieces.
export function looksCheck(POLISH, looks, { dirs = [0, 1, 3, 4, 5, 7] } = {}) {
  setPolish(POLISH);
  const faults = [];
  try {
    for (const [name, L0] of looks) {
      const L = LK.validLook(L0); if (!L) { faults.push({ who: name, rule: 'look', text: 'not a valid look' }); continue; }
      const A = LK.lookArt(L), Ps = Object.values(L.outfit).filter(Boolean).map((o) => LK.PIECES[o.id]);
      const holes = Ps.some((P) => P.d.torn || P.d.mesh || P.d.lace || P.d.ripped || P.slot === 'under') || ['crop', 'bikini', 'bra', 'tube', 'none'].includes(A.top && A.top.kind) || !L.outfit.bottoms && !L.outfit.set;
      if (holes) continue;
      for (const dir of dirs) { let S; try { S = bake(A, dir); } catch (e) { faults.push({ who: `${name}, facing ${dir}`, rule: 'render', text: String(e.message).slice(0, 80) }); continue; }
        const cm = new Map(); each(S, (p) => { if (!p.ol && !p.ln && (p.part === 'hand' || p.part === 'head' || p.part === 'neck' || p.part === 'fa')) cm.set(p.m, (cm.get(p.m) || 0) + 1); }); const skinM = [...cm].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
        for (const text of speck(S, skinM)) faults.push({ who: `${name}, facing ${dir}`, rule: 'speck', text }); }
    }
  } finally { setPolish(null); }
  return faults;
}
export function wardrobe(POLISH, { dirs = [0, 1, 3, 4, 5, 7], only = null } = {}) {
  setPolish(POLISH);
  const faults = [];
  try {
    LK.PIECES.forEach((P, n) => {
      if (!P || P.name === 'Nothing on' || (only && !only.includes(P.name))) return;
      const base = P.b.includes('m') && !(P.b.includes('f') && (n & 1)) ? 'm' : 'f', L = LK.emptyLook(base); L.body.skin = 1 + (n % 3);
      if (!['top', 'set', 'under'].includes(P.slot)) L.outfit.top = LK.item('Plain tee', 'white'); if (!['bottoms', 'set', 'under'].includes(P.slot)) L.outfit.bottoms = LK.item('Jeans'); if (P.slot !== 'shoes') L.outfit.shoes = LK.item('Sneakers');   // (a jacket over a tee, as it is worn)
      L.outfit[P.slot] = LK.item(P.name); const A = LK.lookArt(LK.validLook(L)), holes = P.d.torn || P.d.mesh || P.d.lace || P.d.ripped || ['crop', 'bikini', 'bra', 'tube'].includes(A.top && A.top.kind) || P.slot === 'under', single = P.slot === 'under' || !!(A.top && (A.top.pattern || A.top.shine || A.top.sequin || ['flannel', 'hawaiian'].includes(A.top.kind))) || !!(A.bottom && A.bottom.pattern) || !!A.drape;   // (a pattern, sequins, a drape's tufts: single art pixels by design)
      for (const dir of dirs) { const S = bake(A, dir), who = `${P.slot}: ${P.name}, facing ${dir}`; const cm = new Map(); each(S, (p) => { if (!p.ol && !p.ln && (p.part === 'hand' || p.part === 'head' || p.part === 'neck' || p.part === 'fa')) cm.set(p.m, (cm.get(p.m) || 0) + 1); }); const skinM = [...cm].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;   // (the skin's material: what most of the hands, the face and the forearms are - a hand behind a bag shows the bag's)
        if (!holes) for (const text of speck(S, skinM)) faults.push({ who, rule: 'speck', text });
        if (!single && ['top', 'bottoms', 'set', 'jacket', 'shoes', 'socks'].includes(P.slot)) for (const text of stray(S, skinM, true)) faults.push({ who, rule: 'stray', text }); }   // (the clothes themselves: on a figure wearing a chain or a bag the single pixels are the piece's own picture)
    });
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
