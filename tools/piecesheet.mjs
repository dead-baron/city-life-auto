// The clothing pictures (the art pass, part C3 - docs/tasks/ART-PASS-PLAN-2026-11-24.md; concept UIC-19): every piece
// of clothing drawn alone by the game's own people art, for the Inventory's tiles. No hand-drawn set: a figure is
// drawn without the piece and with it, from the front, and what the piece put on the figure is the picture - so a
// tile always matches what is worn, and a new piece gets its picture for nothing.
//   node tools/piecesheet.mjs OUT.json [slot[,slot]]      -> [{ id, slot, name, w, h, px (RGBA, base64) }]
//   python3 tools/piecesheet.py OUT.json OUT.png          -> the sheet, by slot
// The maker is the page's own: client/piecepic.js.
import { writeFileSync } from 'node:fs';
import { setPolish } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import { closeFace } from '../client/art2/peopleclose.js';
import { piecePixels } from '../client/piecepic.js';
import * as LK from '../shared/look.js';

setPolish(POLISH);
const [out, only] = process.argv.slice(2), want = only ? new Set(only.split(',')) : null;
// (RES: 1 the game's own size - the Inventory's tiles; 3 the close-up figure, for a big tile)
const RES = +(process.env.RES || 1);
function piecePicture(P) {
  const R = piecePixels({ id: P.i }, RES > 1 ? { res: RES, closeFace } : null);
  return R ? { id: P.i, slot: P.slot, name: P.name, w: R.w, h: R.h, n: R.n, px: Buffer.from(R.px).toString('base64') } : { id: P.i, slot: P.slot, name: P.name, w: 0, h: 0, px: '', n: 0 };
}
if (out) {
  const res = [];
  for (const P of LK.PIECES) { if (!P || (want && !want.has(P.slot))) continue; res.push(piecePicture(P)); }
  writeFileSync(out, JSON.stringify(res));
  const empty = res.filter((r) => !r.n);
  console.log(`${res.length} pieces; no picture: ${empty.length}${empty.length ? ' - ' + empty.map((r) => `${r.slot}: ${r.name}`).join('; ') : ''}`);
}
