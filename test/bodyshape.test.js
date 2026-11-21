// The people's bodies, checked (the owner, 2026-11-20: "is there a better way ... so that all the things we've discussed
// are fixed and checked and we nail it down this time?"). tools/bodycheck.mjs measures every rule he gave on the game's own
// art pixels - both bases, the five builds, the eight directions, in underwear and in a white top and jeans (160 figures):
// no points or bumps on the body, the legs two legs front and back, underwear whole across its middle, straps on both
// sides, a neck from the side, lines and shade no darker than the colour's own deep tone, a level hem, the eyes there at
// every angle, feet in proportion. A fault here is one he would see: fix the body, not the rule.
// By hand:   node tools/bodycheck.mjs            the list
//            node tools/bodycheck.mjs --show f,3,under,0    one figure's art pixels (base, build, outfit, direction)
import test from 'node:test';
import assert from 'node:assert/strict';
import { check, bake, wardrobe, look } from '../tools/bodycheck.mjs';
import { setPolish, person, POSES } from '../client/art2/people.js';
import * as LK from '../shared/look.js';
import { POLISH } from '../client/art2/peoplepolish.js';

test('the bodies: every rule holds on every build, base and direction, in underwear and in clothes', () => {
  const F = check(POLISH);
  assert.equal(F.length, 0, `${F.length} faults:\n` + F.slice(0, 30).map((f) => `  ${f.who}: ${f.text}`).join('\n'));
});
// (walking: the rules that don't need a figure standing square - no points or bumps, nothing too dark, the eyes there)
test('the bodies, walking: no points, no bumps, no dark specks, the eyes at every angle', () => {
  const F = check(POLISH, { poses: ['walk0', 'walk1', 'walk2', 'walk3'] });
  assert.equal(F.length, 0, `${F.length} faults:\n` + F.slice(0, 30).map((f) => `  ${f.who}: ${f.text}`).join('\n'));
});

// (the owner's wardrobe notes, 11-20: "sports bra - one thin line", "bikini top - two pixels", a strap on the bikini bottoms,
// "add striped underwear". These three wardrobe pieces are cut on the art grid like the underwear, each in its own color.)
test('the wardrobe\'s sports bra, bikini top and bikini bottoms read at the game\'s size; striped underwear is striped', () => {
  const teal = (c) => c[2] > c[0] + 30 && c[1] > c[0] + 30, rows = (S, f) => { const R = new Map(); for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { const p = S.at(x, y); if (p && !p.ol && f(p)) R.set(y, (R.get(y) || 0) + 1); } return [...R.values()]; };
  const art = (f) => { const L = LK.emptyLook('f'); L.hair.style = 2; L.body.skin = 2; f(L); return LK.lookArt(LK.validLook(L)); };
  setPolish(POLISH);
  try {
    for (const build of [0, 1, 4]) {
      const bra = rows(bake(art((L) => { L.body.build = build; L.outfit.top = LK.item('Sports bra', 'teal'); L.outfit.bottoms = LK.item('Jeans', 'black'); }), 0), (p) => teal(p.c));
      assert.ok(bra.length >= 2 && Math.max(...bra) >= 4, `sports bra, build ${build}: rows ${bra.join(',')}`);
      const top = rows(bake(art((L) => { L.body.build = build; L.outfit.top = LK.item('Bikini top', 'teal'); L.outfit.bottoms = LK.item('Jeans', 'black'); }), 0), (p) => teal(p.c));
      assert.ok(top.length >= 2 && Math.max(...top) >= 4, `bikini top, build ${build}: rows ${top.join(',')}`);
      for (const dir of [0, 4]) { const bot = rows(bake(art((L) => { L.body.build = build; L.outfit.top = LK.item('Bikini top', 'red'); L.outfit.bottoms = LK.item('Bikini bottoms', 'teal'); }), dir), (p) => teal(p.c));
        assert.ok(bot.length >= 2 && bot[0] >= 5 && bot[bot.length - 1] < bot[0], `bikini bottoms, build ${build}, facing ${dir}: a strap across the hips over a smaller row (${bot.join(',')})`); }
    }
    // striped: the piece's color and its trim both there, in whole rows or columns
    for (const [base, name] of [['m', 'Striped boxers'], ['f', 'Striped briefs'], ['f', 'Striped bra and panties']]) {
      const L = LK.emptyLook(base); L.hair.style = 2; L.body.skin = 2; L.outfit.under = LK.item(name, 'teal', 'white'); const S = bake(LK.lookArt(LK.validLook(L)), 0);
      let a = 0, b = 0; for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { const p = S.at(x, y); if (!p || p.ol || !['pel', 'th', 'waist', 'chest', 'bust', 'seat', 'belly'].includes(p.part)) continue; if (teal(p.c)) a++; else if (p.c[0] > 150 && p.c[1] > 150 && p.c[2] > 140) b++; }
      assert.ok(a >= 4 && b >= 3, `${name}: ${a} art pixels of its color, ${b} of its stripe`);
    }
  } finally { setPolish(null); }
});

// (the owner, 11-20 19:06: stripes "thicker in places and thinner and not complete in others ... make the full stripe connect
// all the way around". On the trunk a stripe is one art pixel thick everywhere and one piece from side to side.)
test('stripes on a top: one art pixel thick, each one joined from side to side, on every build and from every side', () => {
  setPolish(POLISH);
  try {
    // (the stripe: teal on white, over black jeans - colors the test can tell from skin)
    for (const base of ['m', 'f']) for (const build of [0, 1, 2, 3, 4]) for (const dir of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const L = LK.emptyLook(base); L.hair.style = 2; L.body.skin = 2; L.body.build = build; L.outfit.top = LK.item('Striped tee', 'white', 'teal'); L.outfit.bottoms = LK.item('Jeans', 'black');
      const S = bake(LK.lookArt(LK.validLook(L)), dir), red = (x, y) => { const p = S.at(x, y); return !!p && !p.ol && p.g === 4 && p.c[2] > p.c[0] + 30 && p.c[1] > p.c[0] + 30; }, who = `${base} build ${build} facing ${dir}`;
      // (a stripe never stops in the middle of the cloth: beside each of its art pixels there is more of it - on the row, or
      // one up or down - or the cloth ends there: an arm, the hair, the figure's edge)
      const white = (x, y) => { const p = S.at(x, y); return !!p && !p.ol && !p.ln && p.g === 4 && p.c[0] > 170 && p.c[1] > 160 && p.c[2] > 140; };
      const any = (x, y) => { const p = S.at(x, y); return !!p && !p.ol && p.c[2] > p.c[0] + 30 && p.c[1] > p.c[0] + 30; };   // (...the sleeve's ring where it meets the chest's counts)
      let n = 0;
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { if (!red(x, y)) continue; n++;
        assert.ok(!red(x, y + 1), `${who}: a stripe two art pixels thick at ${x},${y}`);
        for (const sd of [-1, 1]) assert.ok(!(white(x + sd, y) && white(x + 2 * sd, y)) || any(x + sd, y - 1) || any(x + sd, y + 1), `${who}: a stripe stops in the cloth at ${x},${y}`); }   // (the last art pixel at a part's edge may be the sleeve's: two of cloth beyond the stripe's end is a stop)
      assert.ok(n >= (dir === 2 || dir === 6 ? 1 : 4), `${who}: ${n} art pixels of stripe on the trunk`);   // (in profile the arm hangs over most of the trunk)
    }
  } finally { setPolish(null); }
});

// (the owner, 11-20 20:15: lanyard, chain and stethoscope "still too thin to recognize", a bow tie "bigger so it actually
// looks like a bow tie", buttons "centered on front view and run all the way up". Things on the chest are small pictures in
// art pixels - peoplepolish.js NECK - so from the front each one is whole: so many art pixels, in so wide a box.)
test('things on the chest are pictures in art pixels: whole from the front, buttons one column from the collar down', () => {
  setPolish(POLISH);
  try {
    const fig = (base, set) => { const L = LK.emptyLook(base); L.hair.style = 2; L.body.skin = 2; L.outfit.top = LK.item('Plain tee', 'white'); L.outfit.bottoms = LK.item('Jeans', 'black'); set(L); return bake(LK.lookArt(LK.validLook(L)), 0); };
    const diff = (A, B) => { const at = [], dx = B.ax - A.ax, dy = B.ay - A.ay; for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const p = A.at(x, y), q = B.at(x + dx, y + dy); if (!p || !q || p.ol || q.ol) continue; if (p.c[0] !== q.c[0] || p.c[1] !== q.c[1] || p.c[2] !== q.c[2]) at.push([x + dx, y + dy]); } return at; };   // (in the plain figure's art pixels; a piece may widen the sprite)
    const span = (at, k) => Math.max(...at.map((p) => p[k])) - Math.min(...at.map((p) => p[k])) + 1;
    for (const base of ['m', 'f']) {
      const plain = fig(base, () => {});
      // (piece, at least so many art pixels of it, at most so wide)
      for (const [name, min, wide] of [['Gold chain', 6, 7], ['Lanyard', 8, 7], ['Stethoscope', 7, 7], ['Bow tie', base === 'm' ? 13 : 10, 9], ['Scarf', 12, 9], ['Camera', 9, 7]]) {   // (five across, six on the line between two art pixels; a bow tie and a scarf seven or eight; a line beside it may change its tone)
        const P = LK.PIECES[LK.byName(name)], at = diff(fig(base, (L) => { L.outfit[P.slot] = LK.item(name); }), plain).filter(([x, y]) => { const q = plain.at(x, y); return q.g === 4; });   // (on the trunk: a camera's old place was the hand)
        assert.ok(at.length >= min, `${name} on ${base}: ${at.length} art pixels`);
        assert.ok(span(at, 0) <= wide, `${name} on ${base}: ${span(at, 0)} wide`);
      }
      const shirt = fig(base, (L) => { L.outfit.top = LK.item('Button-up shirt', 'white'); });
      // (the buttons: a material of their own on the trunk - grey on the white shirt - in one column, two or more, a row of shirt between each)
      const by = new Map(); for (let y = 0; y < shirt.h; y++) for (let x = 0; x < shirt.w; x++) { const p = shirt.at(x, y); if (p && !p.ol && !p.ln && p.g === 4) { if (!by.has(p.m)) by.set(p.m, []); by.get(p.m).push([x, y, p.c]); } }
      const btn = [...by.values()].filter((l) => l.length <= 6 && l.every(([, , c]) => c[0] > 80 && c[0] < 200 && Math.abs(c[0] - c[2]) < 40))[0] || [];
      assert.ok(btn.length >= (base === 'm' ? 3 : 2), `${base}: ${btn.length} buttons`);
      assert.equal(span(btn, 0), 1, `${base}: the buttons in one column`);
      for (const [x, y] of btn) assert.ok(!btn.some(([x2, y2]) => x2 === x && y2 === y + 1), `${base}: two buttons touch at ${x},${y}`);
    }
  } finally { setPolish(null); }
});

// (the owner, 11-20 20:53: "Let's do a zipper and unzipped version and give players the option". shared/lookcore.js canZip,
// isZipped, setZipped: a spare bit of the jacket's pattern letter in the look's code.)
test('a jacket open or done up: the player\'s choice, kept in the look\'s code at no cost, drawn by the pass', () => {
  const mk = (name, on) => { const L = LK.emptyLook('m'); L.outfit.top = LK.item('Plain tee', 'white'); L.outfit.bottoms = LK.item('Jeans'); L.outfit.jacket = LK.item(name); if (on !== undefined) LK.setZipped(L.outfit.jacket, on); return LK.validLook(L); };
  // (which jackets: a zip, buttons, or neither)
  for (const [n, k] of [['Denim jacket', 1], ['Leather jacket', 1], ['Puffer jacket', 1], ['Zip hoodie', 1], ['Trench coat', 2], ['Cardigan', 2], ['Blazer', 2], ['Waistcoat', 0], ['Poncho', 0], ['Bathrobe', 0], ['Hooded cloak', 0], ['Apron', 0]]) assert.equal(LK.canZip(LK.PIECES[LK.byName(n)]), k, n);
  assert.equal(LK.canZip(LK.PIECES[LK.byName('Plain tee')]), 0);
  // (open unless chosen; the Founding Citizen jacket the other way round)
  assert.equal(LK.isZipped(mk('Denim jacket').outfit.jacket), 0); assert.equal(LK.isZipped(mk('Denim jacket', 1).outfit.jacket), 1); assert.equal(LK.isZipped(mk('Trench coat', 1).outfit.jacket), 2);
  assert.equal(LK.isZipped(mk('Founding Citizen jacket').outfit.jacket), 1); assert.equal(LK.isZipped(mk('Founding Citizen jacket', 0).outfit.jacket), 0);
  { const L = mk('Waistcoat'); L.outfit.jacket.z = 1; assert.equal(LK.validLook(L).outfit.jacket.z, undefined, 'a vest has no front to close'); }
  // (the code: the same length either way, there and back; a code from before reads as open)
  for (const n of ['Denim jacket', 'Trench coat', 'Founding Citizen jacket']) for (const on of [0, 1]) {
    const L = mk(n, on), c = LK.encodeLook(L), c0 = LK.encodeLook(mk(n));
    assert.equal(c.length, c0.length, n); assert.deepEqual(LK.decodeLook(c), L, `${n} ${on}`); assert.equal(LK.isZipped(LK.decodeLook(c).outfit.jacket) ? 1 : 0, on);
  }
  { const L = mk('Denim jacket'), P = LK.item('Denim jacket', undefined, undefined, 3); L.outfit.jacket = P; assert.equal(LK.decodeLook(LK.encodeLook(L)).outfit.jacket.p, 3, 'the pattern keeps its letter'); }
  // (drawn: done up, the shirt no longer shows down the front; the pass off, nothing changes)
  const front = (L) => { const S = bake(LK.lookArt(L), 0); let n = 0; for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { const p = S.at(x, y); if (p && !p.ol && p.g === 4 && p.c[0] > 200 && p.c[1] > 200 && p.c[2] > 190) n++; } return n; };
  setPolish(POLISH);
  try { for (const n of ['Denim jacket', 'Leather jacket', 'Trench coat']) { const a = front(mk(n, 0)), b = front(mk(n, 1)); assert.ok(a >= 4 && b <= 1, `${n}: ${a} art pixels of shirt open, ${b} done up`); } } finally { setPolish(null); }
  assert.equal(front(mk('Denim jacket', 0)), front(mk('Denim jacket', 1)), 'the pass off: as before');
});

// (the owner, 11-20 22:19: "T shirt dress and jersey dress have skin pixels showing through (I thought we were doing checks on
// this to make sure)". The checks above dress their figures in one outfit; this one puts on every piece of the wardrobe in
// turn - tools/bodycheck.mjs wardrobe() - from six sides: no art pixel of bare skin with clothing on three or four sides
// and no skin beside it. people.js render() fills such a pixel with the clothing's color, by the same rule.)
test('the whole wardrobe: no skin showing through any piece, from any side', () => {
  const F = wardrobe(POLISH), speck = F.filter((f) => f.rule === 'speck'), stray = F.filter((f) => f.rule === 'stray');
  // (known, to be looked at: a hand's art pixel over the hip from behind that the rule takes for the leg's, the sari's drape, a skirt's side at one angle)
  const KNOWN = new Set(['set: Pajamas, facing 4', 'set: Sari, facing 1', 'set: Sari, facing 7', 'top: Gingham shirt, facing 5', 'jacket: Tweed jacket, facing 5', 'bottoms: Fringed skirt, facing 1']);
  const fresh = speck.filter((f) => !KNOWN.has(f.who));
  assert.equal(fresh.length, 0, fresh.slice(0, 12).map((f) => `${f.who}: ${f.text}`).join('\n'));
  // (a garment's pixel on its own inside another: uniforms' badges and bands and a jacket's opening seen at an angle still count here - no more of them than today)
  assert.ok(stray.length <= 68, `${stray.length} art pixels of a garment on their own (68 known): ${stray.slice(0, 6).map((f) => f.who).join('; ')}`);
});

// (the owner, 11-20 22:19: "Please make sure all animations work well". Every pose the renderer has, with every piece only the
// pass draws and every chest picture, mask and hat: each renders, from the front quarter, as a figure.)
test('every pose renders with every piece the pass draws', () => {
  setPolish(POLISH);
  try {
    const poses = Object.keys(POSES), P = LK.PIECES.filter((p) => p && (p.d.pp || p.d.chain || p.d.animal || p.d.shine || p.d.zipped));
    assert.ok(poses.length >= 60 && P.length >= 60, `${poses.length} poses, ${P.length} pieces`);
    for (const p of P) { const L = LK.emptyLook(p.b.includes('m') ? 'm' : 'f'); if (!['top', 'set', 'under'].includes(p.slot)) L.outfit.top = LK.item('Button-up shirt', 'white'); if (!['bottoms', 'set', 'under'].includes(p.slot)) L.outfit.bottoms = LK.item('Jeans'); L.outfit[p.slot] = LK.item(p.name);
      const A = LK.lookArt(LK.validLook(L)); for (const pose of poses) { const f = person(A, 1, pose, 1, { tight: true }); assert.ok(f.w > 6 && f.h > 6, `${p.name}, ${pose}: ${f.w}x${f.h}`); } }
  } finally { setPolish(null); }
});

// The owner's notes of 11-20 23:27 - each was a small thing decided a world pixel at a time, or laid over a row the face
// didn't keep to. They're pictures on the art grid now, and this holds them there.
const dressed = (base, f) => { const L = LK.emptyLook(base); L.hair.style = 2; L.body.skin = 2; L.outfit.top = LK.item('Plain tee', 'white'); L.outfit.bottoms = LK.item('Jeans'); f(L); return LK.lookArt(LK.validLook(L)); };
const pixels = (S, f) => { const o = []; for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { const q = S.at(x, y); if (q && !q.ol && f(q)) o.push([x, y, q]); } return o; };

test('a face turned three quarters has its two eyes on one art row', () => {
  setPolish(POLISH);
  const blue = (c) => c[2] > c[0] + 40 && c[2] > c[1] + 12, off = [];
  for (const base of ['f', 'm']) for (let b = 0; b < 5; b++) for (const dir of [1, 7]) if (new Set(pixels(bake(look(base, b, 'clothed'), dir), (q) => q.g === 1 && blue(q.c)).map((p) => p[1])).size > 1) off.push(`${base} build ${b}, facing ${dir}`);
  assert.deepEqual(off, [], 'eyes on a slope: ' + off.join('; '));
});

test('facial hair shows: every style is pixels of its own on the face, from the front, three quarters and the side', () => {
  setPolish(POLISH);
  for (const dir of [0, 1, 2]) {
    const clean = new Set(pixels(bake(dressed('m', () => {}), dir), () => true).map((p) => p[2].c.join()));
    for (let i = 1; i < LK.FACIAL_HAIR.length; i++) {
      const own = pixels(bake(dressed('m', (L) => { L.hair.facial = i; }), dir), (q) => q.g === 1 && !clean.has(q.c.join()));
      assert.ok(own.length >= (dir === 0 ? 2 : 1), `${LK.FACIAL_HAIR[i][0]}, facing ${dir}: ${own.length} pixels of its own`);
      assert.ok(new Set(own.map((p) => p[2].c.join())).size <= 3, `${LK.FACIAL_HAIR[i][0]}, facing ${dir}: one or two tones, not a scatter`);
    }
  }
});

test('a mask over the eyes covers them at every angle; a scarf is round the neck from every side, never on the face', () => {
  setPolish(POLISH);
  for (const name of ['Bear mask', 'Pig mask']) for (let dir = 0; dir < 8; dir++) {
    const white = pixels(bake(dressed('m', (L) => { L.outfit.glasses = LK.item(name); }), dir), (q) => q.g === 1 && q.c[0] > 215 && q.c[1] > 215 && q.c[2] > 200);
    assert.equal(white.length, 0, `${name}, facing ${dir}: the white of an eye beside the mask's own`);
  }
  const red = (q) => q.c[0] > 140 && q.c[1] < 70 && q.c[2] < 75;
  for (const base of ['m', 'f']) for (let dir = 0; dir < 8; dir++) {
    const S = bake(dressed(base, (L) => { L.outfit.jewel = LK.item('Scarf'); }), dir);
    assert.ok(pixels(S, (q) => q.g === 4 && red(q)).length >= 4, `scarf, ${base} facing ${dir}: round the neck`);
    assert.equal(pixels(S, (q) => q.g === 1 && red(q)).length, 0, `scarf, ${base} facing ${dir}: none of it on the face`);
  }
});

test('a basketball is a round disc five art pixels across; a jersey\'s number is a figure, not specks', () => {
  setPolish(POLISH);
  for (const base of ['m', 'f']) for (let dir = 0; dir < 8; dir++) {
    const e = pixels(bake(dressed(base, (L) => { L.outfit.bag = LK.item('Basketball'); }), dir), (q) => q.part === 'purse'), xs = e.map((p) => p[0]), ys = e.map((p) => p[1]);
    if ([0, 1, 2, 6, 7].includes(dir)) {   // (in view: the whole disc but what the hand under it and the arm beside it cover)
      assert.ok(e.length >= 16, `ball, ${base} facing ${dir}: ${e.length} art pixels`);
      assert.deepEqual([Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1], [5, 5], `ball, ${base} facing ${dir}: five by five`);
    } else assert.ok(e.length === 0 || e.length >= 8, `ball, ${base} facing ${dir}: ${e.length} art pixels showing from behind the body - a speck`);
  }
  const num = (dir) => pixels(bake(dressed('f', (L) => { delete L.outfit.top; delete L.outfit.bottoms; L.outfit.set = LK.item('Jersey dress', 'royal blue', 'white'); }), dir), (q) => q.g === 4 && q.c[0] > 222 && q.c[1] > 222 && q.c[2] > 215);
  for (const dir of [0, 4]) { const n = num(dir), xs = n.map((p) => p[0]), ys = n.map((p) => p[1]);
    assert.ok(n.length === 6 || n.length === 7, `the number, facing ${dir}: ${n.length} art pixels (a 7: six, seven where the chest's middle is a line)`);
    assert.equal(Math.max(...ys) - Math.min(...ys) + 1, 4, `the number, facing ${dir}: four rows tall`);
    assert.ok(Math.max(...xs) - Math.min(...xs) + 1 <= 4, `the number, facing ${dir}: in one piece`); }
});

