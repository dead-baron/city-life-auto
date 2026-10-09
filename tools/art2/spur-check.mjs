// Builds every static piece of the Rusty Spur's chunks (task #366) - the roadhouse with its neon skull, the props, the
// bar room cut away (as the game shows it when you walk in) - and reports any that fail. node tools/art2/spur-check.mjs
import { generateCity } from '../../shared/map.js';
import { staticItems, makeStatic } from '../../client/art2/game/statics.js';

const CH = 768, M = generateCity(1337), R = M.roadhouse;
if (!R) throw new Error('no Rusty Spur on the map');
const cx = Math.floor(R.x / CH), cy = Math.floor(R.y / CH);
let n = 0, bad = 0;
const kinds = new Set();
for (const cut of [null, R.b]) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
  for (const it of staticItems(M, cx + i, cy + j, { cutaway: cut })) {
    try { const s = makeStatic(it.recipe); n++; kinds.add(it.recipe.t + (it.recipe.m ? ':' + it.recipe.m : '')); void s; } catch (e) { bad++; console.log('FAILED', it.key, e.stack.split('\n').slice(0, 3).join(' | ')); }
  }
}
console.log(`${n} pieces built, ${bad} failed; kinds: ${[...kinds].filter((k) => /burn|skull|cut|bld|post|picnic/i.test(k)).join(' ')}`);
if (bad) process.exit(1);
