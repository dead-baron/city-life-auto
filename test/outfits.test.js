// The world concepts' people the wardrobe didn't have (the owner's notes 2: "Have we added all the player and NPC human
// customizations for outfits that we can pull from all of the concepts? Any more NPCs or customizations we can include?"):
// the pieces appended to the catalogue (shared/lookcore.js - ids unchanged), each drawn by client/art2/people.js, and the
// city's people wearing them (server/systems/personas.js: lifeguards, mail carriers, couriers, cooks, nurses...).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, PIECE_IDS, item, lookArt, randomLook, encodeLook, decodeLook } from '../shared/look.js';
import { person } from '../client/art2/people.js';
import { LOOKS, PERSONAS } from '../server/systems/personas.js';

const NEW = { set: ['Tennis dress', 'Chest waders'], bottoms: ['Tennis skirt', 'Cycling shorts'], top: ['Cycling jersey', 'Postal shirt', 'Chef whites'], bag: ['Mail satchel', 'Rescue tube', 'Delivery pack'],
  hat: ['Paper hat', 'Bridal veil'], jacket: ['Poncho'], jewel: ['Lifeguard whistle', 'Stethoscope', 'Bow tie', 'Work gloves'] };

test('the new pieces are in the wardrobe, appended (every old id kept), in their slots, sold somewhere', () => {
  assert.equal(PIECE_IDS['Trekking pack'], 236, 'the old pieces keep their ids');
  for (const [slot, names] of Object.entries(NEW)) for (const n of names) {
    const id = PIECE_IDS[n];
    assert.ok(id > 236, `${n} appended`);
    assert.equal(PIECES[id].slot, slot, n);
    assert.ok(PIECES[id].price > 0 && PIECES[id].store, `${n} has a price and a shop`);
  }
  // a look wearing them survives the code (how looks are saved and sent)
  const L = randomLook(9, 'f');
  L.outfit.set = item('Tennis dress'); L.outfit.top = L.outfit.bottoms = null; L.outfit.hat = item('Bridal veil'); L.outfit.jewel = item('Bow tie'); L.outfit.bag = item('Delivery pack');
  const back = decodeLook(encodeLook(L));
  for (const s of ['set', 'hat', 'jewel', 'bag']) assert.equal(back.outfit[s].id, L.outfit[s].id, s);
});

test('each new piece is drawn: the figure changes when it is worn', () => {
  const pix = (G) => { let n = 0, h = 0; for (let i = 0; i < G.col.length; i += 4) if (G.col[i + 3]) { n++; h = (h * 31 + G.col[i] * 7 + G.col[i + 1] * 3 + G.col[i + 2]) >>> 0; } return `${G.w}x${G.h}:${n}:${h}`; };
  for (const [slot, names] of Object.entries(NEW)) for (const n of names) {
    const L = randomLook(41, PIECES[PIECE_IDS[n]].b.includes('m') ? 'm' : 'f');
    L.body.age = 1;
    L.outfit.set = null; L.outfit.top = item('Plain tee', 'grey'); L.outfit.bottoms = item('Jeans'); L.outfit.jacket = null; L.outfit.hat = null; L.outfit.jewel = null; L.outfit.bag = null; L.outfit.glasses = null;
    const base = [0, 2, 4, 6].map((dir) => pix(person(lookArt(L), dir, 'idle', 0)));
    if (slot === 'set') L.outfit.top = L.outfit.bottoms = null;
    L.outfit[slot] = item(n);
    const A = lookArt(L);
    assert.ok([0, 2, 4, 6].some((dir, k) => pix(person(A, dir, 'idle', 0)) !== base[k]), `${n} drawn`);
  }
  assert.ok(lookArt({ ...randomLook(3, 'm'), outfit: { ...randomLook(3, 'm').outfit, bag: item('Delivery pack') } }).backBox, 'the courier\'s box on the back');
});

test('the city\'s new people wear them: lifeguards, mail carriers, couriers, cooks, the diner\'s servers, nurses, tennis players, cyclists, valets, gardeners, a wedding', () => {
  let a = 5; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const wears = { lifeguard: 'Lifeguard whistle', postal: 'Mail satchel', courier: 'Delivery pack', chef: 'Chef whites', nurse: 'Scrubs', cyclist: 'Cycling shorts', valet: 'Bow tie', gardener: 'Work gloves', groom: 'Tuxedo', bride: 'Wedding dress' };
  for (const [k, n] of Object.entries(wears)) {
    assert.ok(LOOKS[k], `the ${k}'s look`);
    for (let i = 0; i < 5; i++) {
      const L = randomLook(100 + i, r() < LOOKS[k].fem ? 'f' : 'm');
      LOOKS[k].fix(L, r);
      assert.ok(Object.values(L.outfit).some((o) => o && PIECES[o.id].name === n), `a ${k} wears the ${n}`);
      assert.ok(lookArt(L), 'and is drawn');
    }
  }
  for (const k of ['lifeguard', 'postal', 'courier', 'chef', 'server', 'nurse', 'tennis', 'cyclist', 'valet', 'gardener', 'wedding']) {
    const P = PERSONAS[k];
    assert.ok(P && (LOOKS[P.look]) && P.w.length && (P.day || P.night), `${k} walks the city`);
  }
  assert.equal(PERSONAS.wedding.partner, 'bride');
});
