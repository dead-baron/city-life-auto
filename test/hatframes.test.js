// A hat stays on the head on every frame of a walk (the owner, 11-23: "the blue-dress NPC's head flickers between skin
// and hat as she walks"). The polish pass's fuller hair stood out through a head bandana, which showed a pixel or two on
// some frames and none on others; it's now drawn like a hat, the hair under it (client/art2/people.js hairPrims hatOn).
// Every hat that covers the crown, over a spread of hair styles, the four ways, eight walk frames: its area on the figure
// never drops below 60% of its biggest, and it shows (20 px at least: under the hair it didn't). (The small pieces worn on the hair - a headband, a flower crown, cat ears,
// earmuffs, headphones, a tiara, a veil, a visor - only show a few pixels from some sides and aren't counted; a party wig
// is hair.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { person, setPolish } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import * as LK from '../shared/look.js';

const SMALL = new Set(['Party wig', 'Headband', 'Flower crown', 'Cat ears', 'Earmuffs', 'Headphones', 'Tiara', 'Bridal veil', 'Visor', 'Sun visor']);
const hats = [...readFileSync(new URL('../shared/lookcore.js', import.meta.url), 'utf8').matchAll(/^add\('hat', '([^']+)'/gm)].map((m) => m[1]).filter((h) => !SMALL.has(h));
const look = (hat, hair) => {
  const L = LK.emptyLook('f'); L.hair.style = hair; L.hair.color = 3;
  L.outfit.set = LK.item('Sundress'); L.outfit.shoes = LK.item('Sneakers'); L.outfit.hat = LK.item(hat);
  return LK.lookArt(LK.validLook(L));
};

test('every hat stays on the head through a walk, over any hair (the polish pass)', () => {
  assert.ok(hats.length >= 30 && hats.includes('Head bandana'), `${hats.length} hats`);
  setPolish(POLISH);
  const bad = [];
  try {
    for (const hat of hats) for (let hair = 1; hair < LK.HAIR_STYLES.length; hair += 6) {
      const A = look(hat, hair);
      for (let d = 0; d < 8; d += 2) {
        const n = [];
        for (let f = 0; f < 8; f++) { const g = person(A, d, 'walk', f, { tight: true, info: 1 }); let c = 0; for (const v of g.info.grp) if (v === 3) c++; n.push(c); }
        const mx = Math.max(...n), mn = Math.min(...n);
        if (mx < 20 || mn < mx * 0.6) bad.push(`${hat} over ${LK.HAIR_STYLES[hair][0]}, facing ${d}: ${n.join(',')}`);   // (hidden under the hair, or in and out)
      }
    }
  } finally { setPolish(null); }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} flicker`);
});
