// The soft lip colour's pick sheet (the owner, 11-25 01:34: "add a very soft lip colour" - a default or a choice,
// "his pick from a sheet"). The small faces have no mouth today (DECISIONS 11-19, POLISH.mouthOn false); painted lips
// always show. This draws the starting looks' heads four ways - none (today), and three strengths of a soft mouth in
// the skin's own tones - without changing the game: the variants live here.
//   node tools/lipsheet.mjs OUT.json ; python3 tools/lipsheet.py OUT.json OUT.png
import { writeFileSync } from 'node:fs';
import { person, setPolish } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import { packGBuf, downsample2 } from '../client/art2/gbuf.js';
import * as LK from '../shared/look.js';

const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
// k: how far the lip's colour is taken toward the skin's lit tone (1 = skin: nothing shows); two: two pixels across
const soft = (k, two) => ({ ...POLISH, mouthOn: true, mouth(cx, m, lip, L5, my) {
  const { put, skin, D, e0, A } = cx, mk = A.makeup;
  if ((mk && mk.kind !== 'blush') || (A.fmask && A.fmask.k === 'clown')) return POLISH.mouth.call({ ...POLISH, mouthOn: true }, cx, m, lip, L5, my);   // (painted lips: as they are)
  const q = e0 ? { bx: m.bx, by: Math.max(m.by, e0.by + 4) } : m, c = mix(D.fem ? lip : mix(skin[1], [92, 52, 56], 0.35), skin[3], k);
  if (cx.turn > 0.3) return void put(q, c, 0, 0);
  put(q, c, 0, 0); if (two) put(q, c, -1, 0);
} });
export const VARIANTS = [['A  none (today)', POLISH], ['B  faint, one pixel', soft(0.62, false)], ['C  faint, two pixels', soft(0.62, true)], ['D  soft, two pixels', soft(0.4, true)]];
const [out] = process.argv.slice(2);
if (out) {
  const res = [];
  for (const [tag, PL] of VARIANTS) {
    setPolish(PL);
    for (const st of LK.STARTERS) for (const dir of [0, 1]) {
      const d = downsample2(packGBuf(person(LK.lookArt(LK.validLook(structuredClone(st.look))), dir, 'idle', 0, { tight: true })));
      res.push({ tag, name: st.name, dir, w: d.w, h: d.h, ax: d.ax, px: Buffer.from(d.p0.subarray(0, d.w * d.h * 4)).toString('base64') });
    }
  }
  setPolish(null);
  writeFileSync(out, JSON.stringify(res)); console.log(res.length, 'heads');
}
