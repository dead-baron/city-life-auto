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
import { check, bake } from '../tools/bodycheck.mjs';
import { setPolish } from '../client/art2/people.js';
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
