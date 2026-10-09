// The look system (shared/look.js) and the server side of the character creator (server/systems/looks.js): the
// compact code round-trips, anything invalid is clamped or refused, random looks come from their seed, the twelve
// starting looks are valid, an old random outfit migrates, and a player can set, save, rename and delete looks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LK from '../shared/look.js';
import { makeWorld, joinPlayer, run, store, players, fakeConn } from './helpers.js';
import { _descriptor } from '../server/net.js';
import * as looks from '../server/systems/looks.js';
import { mulberry32 } from '../shared/rng.js';
import { playerOutfit } from '../server/entities.js';

test('a look encodes to a short code and decodes to the same look', () => {
  const all = [...LK.STARTERS.map((s) => s.look)];
  for (let i = 0; i < 300; i++) all.push(LK.randomLook(i * 104729 + 17, i % 3 === 0 ? 'f' : i % 3 === 1 ? 'm' : null, i % 2 ? LK.STYLES[i % LK.STYLES.length][0] : null));
  for (const L of all) {
    const c = LK.encodeLook(L);
    assert.equal(c.length, LK.LOOK_CODE_LEN, 'a fixed, short length');
    assert.ok(c.length <= 80);
    assert.match(c, /^[0-9a-zA-Z_-]+$/, 'safe in JSON and URLs');
    assert.deepEqual(LK.decodeLook(c), L, 'round trip');
    assert.equal(LK.encodeLook(LK.decodeLook(c)), c);
  }
  // every piece in every slot, every colour and pattern survive the trip
  for (const P of LK.PIECES) {
    if (!P) continue;
    const L = LK.emptyLook('m');
    L.outfit[P.slot] = { id: P.i, c: P.i % LK.CLOTH.length, t: (P.i * 7) % LK.CLOTH.length, p: P.i % LK.PATTERNS.length };
    const back = LK.decodeLook(LK.encodeLook(L));
    assert.deepEqual(back.outfit[P.slot], L.outfit[P.slot], P.name);
  }
});

test('the catalogue: every piece complete, names unique, every style and slot stocked', () => {
  const names = new Set(), styles = new Set(LK.STYLES.map((s) => s[0]));
  for (const P of LK.PIECES) {
    if (!P) continue;
    assert.ok(!names.has(P.name), `one ${P.name}`); names.add(P.name);
    assert.ok(LK.SLOTS.includes(P.slot), `${P.name}: a slot`);
    assert.ok(/^[mf]+$/.test(P.b), `${P.name}: bases`);
    assert.ok(P.tags.length && P.tags.every((t) => styles.has(t)), `${P.name}: style tags ${P.tags}`);
    assert.ok(Number.isFinite(P.price) && P.price >= 0 && typeof P.store === 'string', `${P.name}: a price and a store`);
    assert.ok(P.d && typeof P.d === 'object', `${P.name}: drawing parameters`);
    assert.ok(P.c >= 0 && P.c < LK.CLOTH.length && P.t >= 0 && P.t < LK.CLOTH.length, `${P.name}: default colours`);
  }
  for (const s of LK.SLOTS) assert.ok(LK.PIECES.filter((p) => p && p.slot === s).length >= 8, `${s}: stocked`);
  for (const [st] of LK.STYLES) assert.ok(LK.PIECES.filter((p) => p && p.tags.includes(st)).length >= 3, `${st}: has pieces`);
  assert.ok(LK.SKIN_TONES.length >= 14 && LK.HAIR_STYLES.length >= 36 && LK.AGES.length === 6);
  for (const b of ['m', 'f']) assert.ok(LK.HAIR_STYLES.filter((h) => h[1].includes(b)).length >= 20, `hairstyles for ${b}`);
  assert.equal(LK.PIECES[0], null, 'id 0 is "nothing"');
});

test('validation clamps or refuses anything invalid', () => {
  assert.equal(LK.validLook(null), null);
  assert.equal(LK.validLook('x'), null);
  assert.equal(LK.decodeLook(''), null);
  assert.equal(LK.decodeLook('zz'), null);
  assert.equal(LK.decodeLook('!'.repeat(LK.LOOK_CODE_LEN)), null, 'letters outside the alphabet');
  assert.equal(LK.decodeLook('9' + LK.encodeLook(LK.emptyLook('m')).slice(1)), null, 'an unknown version');
  const bad = LK.validLook({ body: { base: 'q', build: 99, height: -4, skin: 1e9, age: 'old' }, face: { shape: 50, eyes: -1, eyeColor: NaN, freckles: 'yes' },
    hair: { style: 999, color: -3, facial: 4 }, extras: { makeup: 77, tattoos: 9999, piercings: -1, scar: 2.6 },
    outfit: { top: { id: 99999, c: 3 }, hat: { id: LK.PIECE_IDS['Jeans'], c: 2 }, shoes: { id: LK.PIECE_IDS['Sneakers'], c: 500, t: -2, p: 42 }, bogus: { id: 1 } } });
  assert.equal(bad.body.base, 'm');
  assert.equal(bad.body.build, LK.BUILDS.length - 1); assert.equal(bad.body.height, 0); assert.equal(bad.body.skin, LK.SKIN_TONES.length - 1); assert.equal(bad.body.age, 0);
  assert.equal(bad.face.shape, LK.FACE_OPTS.shape.length - 1); assert.equal(bad.face.eyes, 0); assert.equal(bad.face.eyeColor, 0); assert.equal(bad.face.freckles, 1);
  assert.equal(bad.hair.style, LK.HAIR_STYLES.length - 1); assert.equal(bad.hair.color, 0);
  assert.equal(bad.extras.makeup, LK.MAKEUP.length - 1); assert.equal(bad.extras.tattoos, (1 << LK.TATTOO_AREAS.length) - 1); assert.equal(bad.extras.piercings, 0); assert.equal(bad.extras.scar, 3);
  assert.equal(bad.outfit.top, null, 'no such piece');
  assert.equal(bad.outfit.hat, null, 'jeans are not a hat');
  assert.deepEqual(bad.outfit.shoes, { id: LK.PIECE_IDS['Sneakers'], c: LK.CLOTH.length - 1, t: 0, p: LK.PATTERNS.length - 1 });
  assert.equal(bad.outfit.bogus, undefined);
  // a dress or a set is worn instead of a top and bottoms; facial hair is for the men's base
  const L = LK.emptyLook('f');
  L.outfit.top = LK.item('Plain tee'); L.outfit.bottoms = LK.item('Jeans'); L.outfit.set = LK.item('Evening gown'); L.hair.facial = 3;
  const v = LK.validLook(L);
  assert.equal(v.outfit.top, null); assert.equal(v.outfit.bottoms, null); assert.ok(v.outfit.set); assert.equal(v.hair.facial, 0);
});

test('random looks: the same seed gives the same look, different seeds differ, styles dress the part', () => {
  for (let s = 1; s < 60; s++) assert.deepEqual(LK.randomLook(s * 31337), LK.randomLook(s * 31337));
  const codes = new Set();
  for (let s = 1; s <= 200; s++) codes.add(LK.encodeLook(LK.randomLook(s)));
  assert.ok(codes.size > 190, `varied (${codes.size} of 200 distinct)`);
  let fem = 0;
  for (let s = 1; s <= 200; s++) if (LK.randomLook(s).body.base === 'f') fem++;
  assert.ok(fem > 60 && fem < 140, 'both bases');
  assert.equal(LK.randomLook(5, 'f').body.base, 'f');
  assert.equal(LK.randomLook(5, 'm').body.base, 'm');
  for (let s = 1; s < 40; s++) {
    const L = LK.randomLook(s, null, 'beach');
    for (const k of ['top', 'bottoms', 'set']) if (L.outfit[k]) assert.ok(LK.PIECES[L.outfit[k].id].tags.includes('beach') || LK.PIECES[L.outfit[k].id].tags.includes('casual'), 'beachwear');
    assert.ok(L.outfit.shoes, 'shoes (or bare feet) always');
    assert.ok(L.outfit.set || (L.outfit.top && L.outfit.bottoms), 'dressed');
  }
});

test('the twelve starting looks (CC9) are valid, distinct and named', () => {
  assert.equal(LK.STARTERS.length, 12);
  const codes = new Set();
  for (const s of LK.STARTERS) {
    assert.ok(s.name && s.look, s.name);
    assert.deepEqual(LK.validLook(s.look), s.look, `${s.name}: already valid`);
    assert.ok(s.look.outfit.shoes && (s.look.outfit.set || (s.look.outfit.top && s.look.outfit.bottoms)), `${s.name}: dressed`);
    codes.add(LK.encodeLook(s.look));
  }
  assert.equal(codes.size, 12);
  assert.equal(LK.STARTERS.filter((s) => s.look.body.base === 'f').length, 5, 'CC9: five women, seven men');
  assert.deepEqual(LK.STARTERS.map((s) => s.name.replace('The ', '')), ['Skater', 'Beachgoer', 'Rancher', 'Club-goer', 'Executive', 'Barista', 'Punk', 'Jogger', 'Outdoorsy', 'Local', 'Blue-collar', 'Trendsetter'], 'CC9\'s twelve, in its order');
  for (const s of LK.STARTERS) assert.ok(s.sub && s.sub.length < 24, `${s.name}: a line under the name`);
  assert.deepEqual(LK.starterFor(13), LK.STARTERS[1].look);
});

test('an old random outfit migrates to a look that keeps its colours, hat and build', () => {
  for (let s = 1; s < 80; s++) {
    const o = playerOutfit(mulberry32(s));
    const L = LK.lookFromOutfit(o);
    assert.deepEqual(LK.validLook(L), L);
    assert.equal(L.body.skin, o.s);
    const app = LK.lookToApp(L);
    assert.equal(app.tc, LK.CLOTH[LK.nearestCloth(o.tc)][0], 'the top colour (nearest in the palette)');
    assert.equal(!!app.ht, !!o.ht, 'a hat stays a hat');
    assert.equal(app.lk, LK.encodeLook(L), 'the code rides along');
  }
  const suit = LK.lookFromOutfit({ s: 2, h: 0, hc: '#1a1410', t: 1, tc: '#1d2a4a', tc2: '#c8262b', l: '#1d2030', sh: '#111', ht: 0, b: 1 });
  assert.equal(LK.PIECES[suit.outfit.set.id].name, 'Business suit');
  assert.equal(LK.PIECES[suit.outfit.bag.id].name, 'Briefcase');
  const dress = LK.lookFromOutfit({ s: 0, h: 2, hc: '#d9c27a', t: 5, tc: '#c8262b', tc2: '#ffd36b', l: '#000', sh: '#c8262b', ht: 0, b: 2 });
  assert.equal(dress.body.base, 'f');
  assert.equal(LK.PIECES[dress.outfit.set.id].name, 'Slip dress');
});

test('the art app: every option reaches the people renderer (balaclava, eye patch, sets, jackets over tops)', () => {
  const L = LK.emptyLook('m');
  L.outfit.top = LK.item('Graphic tee', 'red', 'white', 1);
  L.outfit.jacket = LK.item('Leather jacket');
  L.outfit.glasses = LK.item('Balaclava', 'black');
  const A = LK.lookArt(L);
  assert.equal(A.top.kind, 'leather');
  assert.equal(A.top.inner, LK.CLOTH[19][0], 'the tee shows down the open front');
  assert.ok(A.mask, 'a balaclava is a mask (it hides the hair)');
  L.outfit.glasses = LK.item('Eye patch');
  assert.equal(LK.lookArt(L).glasses, 'patch');
  L.outfit.set = LK.item('Tracksuit');
  const S = LK.lookArt(LK.validLook(L));
  assert.equal(S.bottom.kind, 'track');
  L.body.age = 5; L.hair.color = 0;
  assert.notEqual(LK.lookArt(L).hair.color, LK.HAIR_COLORS[0][0], 'greys with age');
});

test('server: a new player wears a starter until they pick; an old profile migrates; the look travels as its code', () => {
  const w = makeWorld();
  const a = joinPlayer(w);
  assert.equal(typeof a.prof.look, 'string');
  assert.equal(a.prof.lookPicked, false, 'a new player still has to pick');
  assert.ok(LK.STARTERS.some((s) => LK.encodeLook(s.look) === a.prof.look), 'wearing a starter');
  assert.equal(a.p.ped.app.lk, a.prof.look);
  const st = looks.stateMsg(a.p);
  assert.deepEqual(st, { t: 'looks', cur: a.prof.look, picked: false, saved: [], own: a.prof.wardrobe, free: true });   // (own, free: the wardrobe, test/wardrobe.test.js)
  // the descriptor carries the code alone
  const d = _descriptor(a.p.ped);
  assert.deepEqual(d.app, { lk: a.prof.look });
  assert.ok(JSON.stringify(d.app).length < 90, 'compact');
  // an old profile with a random outfit
  const old = playerOutfit(mulberry32(42));
  const b = joinPlayer(w, { outfit: old });
  assert.equal(b.prof.outfit, undefined, 'the outfit is gone');
  assert.equal(b.prof.look, LK.encodeLook(LK.lookFromOutfit(old)));
  assert.equal(b.prof.lookPicked, false, 'existing players get the starting screen once (a free session; they keep their look and what they own)');
  assert.equal(b.prof.lookIntro, 1);
  assert.equal(b.p.ped.app.tc, LK.lookToApp(LK.lookFromOutfit(old)).tc);
});

test('server: setting a look - checked, applied to the ped, seen again by everyone; not while wanted', () => {
  const w = makeWorld();
  const a = joinPlayer(w);
  const want = LK.encodeLook(LK.randomLook(777, 'f', 'nightclub'));
  const ver = a.p.ped.appVer || 0;
  const r = looks.handle(w, a.p, { t: 'look', a: 'set', c: want });
  assert.equal(r.t, 'looks'); assert.equal(r.cur, want); assert.equal(r.picked, true);
  assert.equal(a.prof.look, want);
  assert.equal(a.p.ped.app.lk, want);
  assert.ok(a.p.ped.appVer > ver, 'everyone gets the new descriptor');
  // junk is refused, the look kept
  looks.handle(w, a.p, { t: 'look', a: 'set', c: 'nonsense' });
  looks.handle(w, a.p, { t: 'look', a: 'set', c: { evil: true } });
  assert.equal(a.prof.look, want);
  // not while the police are after you (a free change would be a free disguise)
  a.p.wanted = 2;
  // (another outfit of things they own: the first session made the nightclub look theirs, and the basics are)
  const O = LK.decodeLook(want); O.outfit.shoes = LK.item('Sneakers', 'red'); O.outfit.hat = null;
  const other = LK.encodeLook(O);
  assert.notEqual(other, want);
  looks.handle(w, a.p, { t: 'look', a: 'set', c: other });
  assert.equal(a.prof.look, want, 'blocked while wanted');
  a.p.wanted = 0;
  looks.handle(w, a.p, { t: 'look', a: 'set', c: other });
  assert.equal(a.prof.look, want, 'one change a second (each goes out to everyone near)');
  run(w, 1.1);
  looks.handle(w, a.p, { t: 'look', a: 'set', c: other });
  assert.equal(a.prof.look, other);
  // the old-style appearance the police describe follows the look
  assert.equal(a.p.ped.app.tc, LK.lookToApp(LK.decodeLook(other)).tc);
  // the look survives a reconnect
  players.leave(w, a.p);
  run(w, 1);
  const back = players.join(w, fakeConn(), a.prof);
  assert.equal(back.ped.app.lk, other);
});

test('server: saved looks - up to 12, named, applied, renamed, deleted', () => {
  const w = makeWorld();
  const a = joinPlayer(w);
  const codes = [];
  for (let i = 0; i < 13; i++) { const c = LK.encodeLook(LK.randomLook(900 + i)); codes.push(c); looks.handle(w, a.p, { t: 'look', a: 'save', n: `Look ${i}`, c }); }
  assert.equal(a.prof.looks.length, looks.SAVED_LOOKS, 'twelve at most');
  assert.deepEqual(a.prof.looks[0], { n: 'Look 0', c: codes[0] });
  // same name: replaced in place
  looks.handle(w, a.p, { t: 'look', a: 'save', n: 'look 0', c: codes[12] });
  assert.equal(a.prof.looks.length, 12);
  assert.equal(a.prof.looks[0].c, codes[12]);
  // names are cleaned; a nameless save is refused; a bad code is refused
  looks.handle(w, a.p, { t: 'look', a: 'del', i: 11 });
  looks.handle(w, a.p, { t: 'look', a: 'save', n: '<b>Heist</b>   night!!', c: codes[1] });
  assert.equal(a.prof.looks[11].n, 'bHeist/b night!!'.replace('/', ''));
  looks.handle(w, a.p, { t: 'look', a: 'del', i: 11 });
  looks.handle(w, a.p, { t: 'look', a: 'save', n: '   ', c: codes[1] });
  looks.handle(w, a.p, { t: 'look', a: 'save', n: 'Bad', c: 'zzz' });
  assert.equal(a.prof.looks.length, 11);
  // rename (not onto another's name), delete, out-of-range indexes ignored
  looks.handle(w, a.p, { t: 'look', a: 'ren', i: 2, n: 'Wedding' });
  assert.equal(a.prof.looks[2].n, 'Wedding');
  looks.handle(w, a.p, { t: 'look', a: 'ren', i: 3, n: 'wedding' });
  assert.equal(a.prof.looks[3].n, 'Look 3');
  looks.handle(w, a.p, { t: 'look', a: 'del', i: 0 });
  assert.equal(a.prof.looks.length, 10);
  assert.equal(a.prof.looks[1].n, 'Wedding');
  for (const i of [-1, 99, 'x', 1.5]) { looks.handle(w, a.p, { t: 'look', a: 'del', i }); looks.handle(w, a.p, { t: 'look', a: 'ren', i, n: 'Q' }); }
  assert.equal(a.prof.looks.length, 10);
  // the state message lists them; applying one is setting its code
  const st = looks.stateMsg(a.p);
  assert.equal(st.saved.length, 10); assert.equal(st.saved[1].n, 'Wedding');
  looks.handle(w, a.p, { t: 'look', a: 'set', c: st.saved[1].c });
  assert.equal(a.prof.look, st.saved[1].c);
  assert.ok(store);
});

test('server: the clothes shop\'s new outfit keeps the body, face and hair', () => {
  const w = makeWorld();
  const a = joinPlayer(w);
  const before = LK.decodeLook(a.prof.look);
  const c = looks.freshOutfit(a.prof, 12345);
  const after = LK.decodeLook(c);
  assert.deepEqual(after.body, before.body); assert.deepEqual(after.face, before.face); assert.deepEqual(after.hair, before.hair);
  assert.notDeepEqual(after.outfit, before.outfit);
});

test('server: at home (the quick change or the mirror) a new look is unseen - allowed while wanted, and a disguise', () => {
  const w = makeWorld();
  const a = joinPlayer(w);
  a.p.wanted = 2;
  const c1 = LK.encodeLook(LK.randomLook(4242));
  looks.handle(w, a.p, { t: 'look', a: 'set', c: c1 });
  assert.notEqual(a.prof.look, c1, 'out in the street: blocked');
  a.p.ped.hidden = true; a.p.lookHomeAt = w.time;   // (economy.js 'hlooks' / 'hmirror' inside your home)
  looks.handle(w, a.p, { t: 'look', a: 'set', c: c1 });
  assert.equal(a.prof.look, c1, 'inside your home: allowed');
  assert.equal(a.p.wanted, 0, 'and it drops your public wanted level');
  assert.ok(a.prof.peakWanted >= 2, 'the peak stays on file');
  // the wardrobe's visit runs out
  a.p.wanted = 1; a.p.lookHomeAt = w.time - 601;
  looks.handle(w, a.p, { t: 'look', a: 'set', c: LK.encodeLook(LK.randomLook(4243)) });
  assert.equal(a.prof.look, c1);
});
