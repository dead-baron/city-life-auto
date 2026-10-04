// Characters from the concept art: the "PLAYER CHARACTER (8 DIRECTION)" sheet, cut down to its
// native pixel size by tools/build_chars.py (assets/chars/body.png - every pixel labelled as
// outline, skin, shirt, trousers or shoes, with its shade). Each person is that body recoloured
// with their outfit - skin tone, top, trousers, shoes - plus hair, a face, hats and the
// details of the top (tie, hood, hi-vis stripes, badge, dress), animated by moving the legs
// and arms of the drawn body: strides, a bob, swinging arms, and a reaching arm for aiming,
// punching, swinging and carrying. All eight directions are drawn (no mirroring).
// Falls back to the procedural painter (chars.js) until the template has loaded.
import { CW, CH, SKINS, OUTLINE, hex, hi, lo, P, weapon } from './chars.js';

const PART = { NONE: 0, LINE: 1, SKIN: 2, SHIRT: 3, PANTS: 4, SHOES: 5, HAIR: 6 };
// rows of assets/chars/body.png: male idle, female idle, female walk frames 1-4
const ROW = { MALE: 0, FEMALE: 1, WALK: 2, MWALK: 6 }; // MWALK: composed at load (his top, the drawn legs)
export const LW = 56, LH = 32; // lying-down cells (assets/chars/lying.png): knocked down, passed out
// facing vector on screen for d8 (0 S, 1 SW, 2 W, 3 NW, 4 N, 5 NE, 6 E, 7 SE)
const FV = [[0, 1], [-0.75, 0.66], [-1, 0], [-0.75, -0.66], [0, -1], [0.75, -0.66], [1, 0], [0.75, 0.66]];
const FRONT = (d) => d === 0 || d === 1 || d === 7, BACKD = (d) => d >= 3 && d <= 5, SIDE = (d) => d === 2 || d === 6;

let T = null; // T[row][d] = { part, shade, info }
let LY = null; // lying poses: [{ part, shade }]
let loading = false;

export function loadBodies(base = 'assets/') {
  if (T || loading || typeof document === 'undefined') return;
  loading = true;
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const px = g.getImageData(0, 0, im.width, im.height).data;
    const rows = [];
    for (let r = 0; r < Math.floor(im.height / CH); r++) {
      const dirs = [];
      for (let d = 0; d < 8; d++) {
        const part = new Uint8Array(CW * CH), shade = new Uint8Array(CW * CH);
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
          const i = ((r * CH + y) * im.width + d * CW + x) * 4;
          if (px[i + 3] < 128) continue;
          part[y * CW + x] = px[i]; shade[y * CW + x] = px[i + 1];
        }
        dirs.push({ part, shade, info: analyse(part, d) });
      }
      rows.push(dirs);
    }
    // the male walk: his upper body over the legs of the drawn walk cycle (same height, feet on
    // the same line), one row per frame
    if (rows.length > ROW.WALK + 3) {
      for (let f = 0; f < 4; f++) {
        const dirs = [];
        for (let d = 0; d < 8; d++) {
          const M = rows[ROW.MALE][d], F = rows[ROW.WALK + f][d];
          const cut = Math.max(M.info.waist + 2, F.info.waist + 2);
          const part = new Uint8Array(CW * CH), shade = new Uint8Array(CW * CH);
          // centre the legs under his hips
          const off = Math.round(((M.info.lx0 + M.info.lx1) - (rows[ROW.FEMALE][d].info.lx0 + rows[ROW.FEMALE][d].info.lx1)) / 2);
          for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
            const i = y * CW + x;
            if (y < cut) { part[i] = M.part[i]; shade[i] = M.shade[i]; continue; }
            const sx = x - off;
            if (sx < 0 || sx >= CW) continue;
            const j = y * CW + sx;
            let p = F.part[j];
            if (p === PART.SKIN || p === PART.SHIRT) p = PART.PANTS; // her hands by her hips -> his trouser legs
            if (p === PART.HAIR) p = 0;
            part[i] = p; shade[i] = F.shade[j];
          }
          dirs.push({ part, shade, info: analyse(part, d) });
        }
        rows.push(dirs);
      }
    }
    T = rows;
  };
  im.onerror = () => { loading = false; };
  im.src = base + 'chars/body.png';
  const ly = new Image();
  ly.onload = () => {
    const c = document.createElement('canvas'); c.width = ly.width; c.height = ly.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ly, 0, 0);
    const px = g.getImageData(0, 0, ly.width, ly.height).data;
    LY = [];
    for (let k = 0; k < Math.floor(ly.width / LW); k++) {
      const part = new Uint8Array(LW * LH), shade = new Uint8Array(LW * LH);
      for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
        const i = (y * ly.width + k * LW + x) * 4;
        if (px[i + 3] < 128) continue;
        part[y * LW + x] = px[i]; shade[y * LW + x] = px[i + 1];
      }
      LY.push({ part, shade });
    }
  };
  ly.src = base + 'chars/lying.png';
}
export const bodiesReady = () => !!T;

// Where the parts are: head, neck, waist, the legs' split, the arms.
function analyse(part, d) {
  const at = (x, y) => (x < 0 || y < 0 || x >= CW || y >= CH ? 0 : part[y * CW + x]);
  let top = CH, bottom = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (at(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  const rowCount = (p, y) => { let n = 0; for (let x = 0; x < CW; x++) if (at(x, y) === p) n++; return n; };
  let neck = top; while (neck < CH && rowCount(PART.SHIRT, neck) < 2) neck++;
  let waist = neck; while (waist < CH && rowCount(PART.PANTS, waist) < 3) waist++;
  // head: skin above the neck
  let hx0 = CW, hx1 = 0;
  for (let y = top; y < neck; y++) for (let x = 0; x < CW; x++) if (at(x, y) === PART.SKIN) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
  if (hx1 < hx0) for (let y = top; y < neck; y++) for (let x = 0; x < CW; x++) if (at(x, y) === PART.HAIR) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
  // the legs: trousers below the waist, split down the middle
  let sx = 0, n = 0, lx0 = CW, lx1 = 0;
  for (let y = waist; y <= bottom; y++) for (let x = 0; x < CW; x++) if (at(x, y) === PART.PANTS || at(x, y) === PART.SHOES) { sx += x; n++; lx0 = Math.min(lx0, x); lx1 = Math.max(lx1, x); }
  const split = n ? sx / n : CW / 2;
  // the arms (not in profile): shirt / skin columns outside the trousers, between neck and hips
  const arms = [[], []];
  if (!SIDE(d)) {
    for (let y = neck + 1; y < Math.min(bottom, waist + 7); y++) for (let x = 0; x < CW; x++) {
      const p = at(x, y);
      if (p !== PART.SKIN && p !== PART.SHIRT && p !== PART.LINE) continue;
      if (y < neck + 1) continue;
      if (x < lx0 - 0.5) arms[0].push(y * CW + x);
      else if (x > lx1 + 0.5) arms[1].push(y * CW + x);
    }
  }
  const armBox = arms.map((a) => {
    if (!a.length) return null;
    let x0 = CW, x1 = 0, y0 = CH, y1 = 0;
    for (const i of a) { const x = i % CW, y = (i / CW) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, x1, y0, y1, cx: (x0 + x1) / 2 };
  });
  return { top, bottom, neck, waist, hx0, hx1, hcx: (hx0 + hx1) / 2, split, lx0, lx1, arms: arms.map((a) => new Set(a)), armBox };
}

// ---- colours ---------------------------------------------------------------------------------
const LONG_SLEEVES = new Set([1, 2, 4, 6, 7]);
function palette(a) {
  return {
    skin: SKINS[a.s ?? 1],
    shirt: hex(a.tc || '#888888'),
    pants: a.t === 5 ? SKINS[a.s ?? 1] : hex(a.l || '#334455'),
    shoes: hex(a.sh || '#222222'),
    hair: hex(a.hc || '#2a1a10'),
    hat: hex(a.htc || '#222222'),
    c2: hex(a.tc2 || '#dddddd'),
  };
}
// a part's colour at a given shade (3 tones, pixel-art style)
const shadeOf = (base, sh) => (sh < 100 ? lo(base) : sh > 158 ? hi(base) : base);

// ---- the sprite ------------------------------------------------------------------------------
const cache = new Map();
const appKey = (a) => (a ? `${a.s}${a.h}${a.hc}${a.t}${a.tc}${a.tc2}${a.l}${a.sh}${a.ht}${a.htc}${a.b}${a.bandana ? 1 : 0}` : 'x');
const art = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (art) { art.width = CW; art.height = CH; }

// Long hair, a bun or a dress: the female body (with its drawn walk cycle).
export const isFemale = (a) => !!a && (a.h === 2 || a.h === 5 || a.t === 5);

export function bodySprite(app, d8, pose, fr, w) {
  if (!T) return null;
  const key = `${appKey(app)}|${d8}|${pose}|${fr}|${w}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const g = art.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, CW, CH);
  paintBody(g, app || {}, d8, pose, fr | 0, w | 0);
  // outline round anything that was added without one (hair, hats, reaching arms, held items)
  const img = g.getImageData(0, 0, CW, CH), px = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < CW && y < CH && px[(y * CW + x) * 4 + 3] > 40;
  cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const o = cv.getContext('2d');
  o.fillStyle = OUTLINE;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++)
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) o.fillRect(x, y, 1, 1);
  o.drawImage(art, 0, 0);
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  cache.set(key, cv);
  return cv;
}

function paintBody(g, a, d, pose, fr, w) {
  const fem = isFemale(a) && T.length > ROW.WALK;
  const lvl = pose.startsWith('move') ? Number(pose[4]) || 0 : -1;
  // the female body walks with its own drawn frames; everyone else is animated by moving parts
  const drawn = lvl >= 0 && T.length > (fem ? ROW.WALK : ROW.MWALK) + 3;
  const wf = (fr >> 1) & 3;
  const B = T[drawn ? (fem ? ROW.WALK : ROW.MWALK) + wf : fem ? ROW.FEMALE : ROW.MALE][d], I = B.info, pal = palette(a);
  const ph = ((fr & 7) * Math.PI) / 4;
  const amp = drawn ? 0 : lvl >= 0 ? [1, 1.4, 2, 2.6][lvl] : pose === 'carry' ? 1 : 0;
  const s = Math.sin(ph);
  const bob = lvl >= 0 ? -Math.round(Math.abs(s) * (lvl >= 2 ? 1.4 : 0.8)) : pose === 'idle' && (fr & 4) ? -1 : 0;
  const Pp = new P(g);
  const fv = FV[d];
  // which template arm the action poses replace: the one on the side the character holds things
  // (their right hand: screen left when facing us, screen right from behind; the front arm on a diagonal)
  const act = pose === 'aim' || pose === 'punch' || pose === 'swing' || pose === 'fish' || pose === 'carry';
  const actArm = SIDE(d) ? -1 : d === 0 ? 0 : d === 4 ? 1 : fv[0] < 0 ? 0 : 1;
  const hideArm = (k) => act && (pose === 'carry' || k === actArm);
  // colour of one template pixel
  const longSleeve = LONG_SLEEVES.has(a.t);
  const handRows = I.armBox.map((b) => (b ? b.y1 - 1 : CH));
  const col = (i) => {
    const p = B.part[i], sh = B.shade[i];
    const x = i % CW, y = (i / CW) | 0;
    switch (p) {
      case PART.LINE: return OUTLINE;
      case PART.SKIN: {
        if (y > I.neck && longSleeve) {
          // sleeves down to the hands (the bottom rows of each arm, or below the shirt in profile)
          const k = I.arms[0].has(i) ? 0 : I.arms[1].has(i) ? 1 : -1;
          const hand = k >= 0 ? y >= handRows[k] : y >= I.waist - 1;
          if (!hand) return shadeOf(pal.shirt, sh);
        }
        return shadeOf(pal.skin, sh);
      }
      case PART.SHIRT: return shadeOf(pal.shirt, sh);
      case PART.PANTS: return shadeOf(pal.pants, sh);
      case PART.SHOES: return shadeOf(pal.shoes, sh);
      case PART.HAIR: return (a.ht && y < I.top + 4) ? shadeOf(pal.hat, sh) : shadeOf(pal.hair, sh);
      default: return null;
    }
  };
  const dot = (x, y, c) => { if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); } };
  // 1. legs (below the waist), each half lifted / scissored with the stride
  const legTop = I.waist + 1;
  const liftL = Math.round(Math.max(0, s) * amp), liftR = Math.round(Math.max(0, -s) * amp);
  const st = SIDE(d) ? Math.round(s * amp * 1.3) : 0;
  const drawLegs = (pass) => {
    for (let y = legTop; y < CH; y++) for (let x = 0; x < CW; x++) {
      const i = y * CW + x;
      if (!B.part[i] || I.arms[0].has(i) || I.arms[1].has(i)) continue;
      if (SIDE(d)) {
        // profile: two legs from the one drawn, scissoring - the far one darker, behind
        const k = (y - legTop) / Math.max(1, I.bottom - legTop);
        const off = Math.round(st * k) * (pass ? 1 : -1);
        const c = col(i);
        dot(x + off, y + bob * 0, pass ? c : c === OUTLINE ? OUTLINE : lo(c));
      } else {
        const left = x < I.split;
        if ((pass === 0) !== left) continue;
        const lift = left ? liftL : liftR;
        dot(x, y - lift, col(i));
      }
    }
  };
  drawLegs(0); drawLegs(1);
  // 2. body above the legs (bobbing), arms swinging with the stride
  const swing = lvl >= 0 && !(drawn && fem) ? Math.round(s * Math.min(2, lvl >= 0 ? [1, 1.4, 2, 2.6][lvl] : 0)) : 0;
  for (let y = 0; y < legTop; y++) for (let x = 0; x < CW; x++) {
    const i = y * CW + x;
    if (!B.part[i]) continue;
    let k = I.arms[0].has(i) ? 0 : I.arms[1].has(i) ? 1 : -1;
    if (k >= 0 && hideArm(k)) {
      // the arm that reaches out is drawn separately; fill its place with shirt / outline
      if (x >= I.lx0 - 1 && x <= I.lx1 + 1) dot(x, y + bob, shadeOf(pal.shirt, 110));
      continue;
    }
    const dy = k === 0 ? swing : k === 1 ? -swing : 0;
    dot(x, y + bob + dy, col(i));
  }
  // arm pixels hanging below the waist line (hands) - same treatment
  for (let y = legTop; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = y * CW + x;
    const k = I.arms[0].has(i) ? 0 : I.arms[1].has(i) ? 1 : -1;
    if (k < 0 || hideArm(k)) continue;
    dot(x, y + bob + (k === 0 ? swing : -swing), col(i));
  }
  // 3. details of the top
  top(Pp, a, d, I, pal, bob);
  // 4. head: hair, face, hats (the female body has its hair and face drawn: only hats go on)
  head(Pp, B, a, d, I, pal, bob, fem);
  // 5. reaching arm and anything held
  if (act || (w > 0 && w !== 13)) holds(Pp, a, d, I, pal, bob, pose, fr, w, actArm);
  else if (a.b === 1) {
    // executive's briefcase, swinging in the hanging hand on the near side
    const k = I.armBox[actArm >= 0 ? actArm : 1] ? (actArm >= 0 ? actArm : 1) : 0;
    const bx = I.armBox[k];
    if (bx) {
      const hy = bx.y1 + bob + (k === 0 ? swing : -swing);
      Pp.box(Math.round(bx.cx) - 2, hy, 5, 4, '#3a2414');
      Pp.r(Math.round(bx.cx) - 1, hy - 1, 3, 1, '#6b4a2a');
    }
  }
}

function top(Pp, a, d, I, pal, bob) {
  const n = I.neck + bob, cx = Math.round(SIDE(d) ? I.hcx : (I.lx0 + I.lx1) / 2);
  const front = FRONT(d), back = BACKD(d);
  switch (a.t) {
    case 0: if (front) Pp.r(cx - 1, n, 3, 1, lo(pal.skin)); break;                                       // tee: neckline
    case 1: if (front) { Pp.r(cx - 1, n, 3, 5, '#f0f0ec'); Pp.r(cx, n + 1, 1, 6, pal.c2); } break;       // suit: shirt + tie
    case 2: if (back) Pp.blob(cx + 0.5, n + 1.5, 3.5, 2.5, lo(pal.shirt)); else if (front) { Pp.r(cx - 1, n + 1, 1, 4, pal.c2); Pp.r(cx + 1, n + 1, 1, 4, pal.c2); Pp.r(cx - 3, n + 7, 7, 2, lo(pal.shirt)); } break; // hoodie
    case 3: for (const yy of [n + 4, n + 8]) for (let x = I.lx0 - 2; x <= I.lx1 + 2; x++) Pp.p(x, yy, pal.c2); break; // hi-vis vest
    case 4: if (front) for (let k = 2; k < 10; k += 3) Pp.p(cx, n + k, pal.c2); break;                    // cardigan
    case 6: if (front) { Pp.p(cx + 2, n + 3, pal.c2); Pp.p(cx + 2, n + 4, hi(pal.c2)); } Pp.r(I.lx0 - 2, n + 1, 2, 1, pal.c2); Pp.r(I.lx1 + 1, n + 1, 2, 1, pal.c2); break; // uniform
    case 5: Pp.blob(cx + 0.5, I.waist + bob + 3, (I.lx1 - I.lx0) / 2 + 2.5, 3.5, lo(pal.shirt)); break;  // dress: a skirt over the legs
    case 7: if (front) for (let k = 0; k < 9; k += 2) { Pp.p(cx - 2, n + k, '#fff6e0'); Pp.p(cx + 2, n + k, '#fff6e0'); } break; // fur trim
    default: break;
  }
  if (a.b === 3) Pp.box(I.lx1 - 1, I.waist + bob - 3, 4, 4, '#555555'); // tool bag
}

function head(Pp, B, a, d, I, pal, bob, fem = false) {
  const g = Pp.g;
  const hs = a.h ?? 0, ht = a.ht || 0;
  const y0 = I.top, y1 = I.neck, hh = Math.max(1, y1 - y0);
  const cx = I.hcx, hw = Math.max(1, (I.hx1 - I.hx0) / 2);
  const front = FRONT(d), back = BACKD(d), side = SIDE(d);
  const skinAt = (x, y) => (B.part[y * CW + x] === 2 || (fem && B.part[y * CW + x] === 6)) && y < y1;
  const paintOver = (test, color) => {
    for (let y = y0; y < y1; y++) for (let x = 0; x < CW; x++) {
      if (!skinAt(x, y) || !test(x, y, (x - cx) / hw, (y - y0) / hh)) continue;
      g.fillStyle = shadeOf(color, B.shade[y * CW + x]); g.fillRect(x, y + bob, 1, 1);
    }
  };
  const faceSide = side ? (d === 2 ? -1 : 1) : d === 1 ? -1 : d === 7 ? 1 : 0;
  // (the female body has its hair and face drawn on: it only takes the accessories)
  // long hair falls behind the shoulders
  if (!fem && !ht && (hs === 2 || hs === 5) && (back || side)) {
    if (hs === 2) for (let y = y1; y < y1 + 5; y++) for (let x = Math.round(cx - hw + 1 + (side ? -faceSide * 2 : 0)); x <= Math.round(cx + hw - 1 + (side ? -faceSide * 2 : 0)); x++) Pp.p(x, y + bob, lo(pal.hair));
  }
  // hair
  if (!fem && hs !== 3 && !ht) {
    const fringe = hs === 1 ? 0.48 : hs === 4 ? 0.2 : 0.38;
    if (back) paintOver((x, y, nx, ny) => ny < 0.9, pal.hair);
    else if (side) paintOver((x, y, nx, ny) => ny < fringe + 0.05 || nx * faceSide < -0.15, pal.hair);
    else paintOver((x, y, nx, ny) => ny < fringe || (Math.abs(nx) > 0.78 && ny < 0.65) || (faceSide && nx * faceSide < -0.55 && ny < 0.7), pal.hair);
    if (hs === 4) { Pp.r(Math.round(cx) - 1, y0 - 2 + bob, 3, 3, pal.hair); Pp.p(Math.round(cx), y0 - 2 + bob, hi(pal.hair)); }   // mohawk
    if (hs === 5) Pp.blob(cx + (side ? -faceSide * 3 : 0), y0 - 1 + bob, 2.5, 2, pal.hair);                                     // bun
    if (hs === 2 && front) { Pp.r(Math.round(cx - hw) - 1, Math.round(y0 + hh * 0.4) + bob, 2, Math.round(hh * 0.7), pal.hair); Pp.r(Math.round(cx + hw), Math.round(y0 + hh * 0.4) + bob, 2, Math.round(hh * 0.7), pal.hair); }
  }
  // face
  if (!back) {
    const ey = Math.round(y0 + hh * (fem ? 0.6 : 0.56)) + bob;
    const eye = '#20161a';
    if (side && !fem) {
      const ex = Math.round(cx + faceSide * (hw - 2.2));
      Pp.r(ex, ey, 1, 2, eye);
      Pp.p(Math.round(cx + faceSide * (hw - 1.5)), ey + 3, lo(pal.skin));
    } else if (!fem) {
      const sh = faceSide * 1.6;
      const lx = Math.round(cx - 2.2 + sh), rx = Math.round(cx + 2.2 + sh);
      Pp.r(lx, ey, 1, 2, eye); Pp.r(rx, ey, 1, 2, eye);
      Pp.p(lx, ey - 1, lo(pal.hair)); Pp.p(rx, ey - 1, lo(pal.hair));     // brows
      Pp.p(Math.round(cx + sh), ey + 3, lo(pal.skin));                     // mouth
    }
    if (a.bandana) paintOver((x, y, nx, ny) => ny > 0.62 && ny < 0.9, '#c8262b');
    if (a.b === 4) Pp.r(Math.round(cx - hw + 1 + (faceSide > 0 ? 1 : 0)), ey, Math.round(hw * 2 - 1), 1, '#14161a'); // sunglasses
  }
  // hats
  if (ht) {
    const hc = pal.hat;
    const cover = ht === 1 ? 0.42 : ht === 2 ? 0.48 : ht === 3 ? 0.36 : ht === 4 ? 0.5 : 0.58;
    paintOver((x, y, nx, ny) => ny < cover, hc);
    const by = Math.round(y0 + hh * cover) + bob;
    const L = Math.round(cx - hw), R = Math.round(cx + hw);
    if (ht === 1) { // cap: the brim points where they face
      if (front) Pp.r(L + (faceSide < 0 ? -1 : 1), by, R - L + 1, 1, lo(hc));
      else if (side) Pp.r(faceSide > 0 ? R - 1 : L - 2, by, 4, 1, lo(hc));
    } else if (ht === 2) { Pp.r(L - 1, by, R - L + 3, 1, lo(hc)); Pp.p(Math.round(cx - 1), y0 + 1 + bob, '#ffffff'); }      // hard hat
    else if (ht === 3) { Pp.r(L - 2, by, R - L + 5, 2, lo(hc)); }                                                             // sun hat
    else if (ht === 4) { for (let y = y0 + 1; y < by; y += 2) Pp.r(L + 1, y + bob, R - L - 1, 1, lo(hc)); }                   // beanie
    else if (ht === 5 && !back) Pp.r(L + (side && faceSide < 0 ? 0 : 1), by, side ? Math.round(hw) : R - L - 1, 2, '#5a7a9a'); // helmet visor
  }
  if (a.b === 2) Pp.r(Math.round(I.lx1) + 1, I.neck + 2 + bob, 1, 7, '#c8262b'); // purse strap
}

// The arm that does things: aims, punches, swings, holds the rod, carries; and items carried low.
function holds(Pp, a, d, I, pal, bob, pose, fr, w, actArm) {
  const fv = FV[d];
  const box = actArm >= 0 ? I.armBox[actArm] : null;
  const sx = box ? Math.round(box.cx) : Math.round(I.hcx - fv[0] * 1), sy = I.neck + 2 + bob;
  const longSleeve = LONG_SLEEVES.has(a.t);
  const sleeve = shadeOf(pal.shirt, 128), skin = pal.skin;
  const aimAng = Math.atan2(fv[1] * 0.8, fv[0]);
  const reach = (len) => [Math.round(fv[0] * len), Math.round(fv[1] * len * 0.55) + 2];
  const drawArm = (x0, y0, dx, dy) => {
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + dx * t, y = y0 + dy * t;
      Pp.r(x - 1, y - 1, 2, 2, t < 0.7 || longSleeve ? (t < 0.85 ? sleeve : skin) : skin);
    }
    const hx = x0 + dx, hy = y0 + dy;
    Pp.r(hx - 1, hy - 1, 2, 2, skin);
    return { hx, hy };
  };
  if (pose === 'aim' || pose === 'fish') {
    const [dx, dy] = reach(8);
    const h = drawArm(sx, sy, dx, dy);
    weapon(Pp, pose === 'fish' ? 13 : w, h.hx, h.hy, pose === 'fish' ? aimAng - 0.6 * Math.sign(fv[0] || 1) : aimAng);
  } else if (pose === 'punch') {
    const ext = [1, 5, 8, 3][fr & 3];
    const [dx, dy] = reach(ext);
    drawArm(sx, sy, dx, dy);
  } else if (pose === 'swing') {
    const sw = [-1.4, -0.5, 0.5, 1.3][fr & 3] * ((fr >> 2) ? -1 : 1);
    const ang = aimAng + sw;
    const h = drawArm(sx, sy, Math.round(Math.cos(ang) * 6), Math.round(Math.sin(ang) * 4) + 2);
    weapon(Pp, w, h.hx, h.hy, ang);
  } else if (pose === 'carry') {
    // both arms out in front, holding the load at chest height
    const [dx, dy] = reach(5);
    const l = I.armBox[0], r = I.armBox[1];
    const lx = l ? Math.round(l.cx) : sx - 2, rx = r ? Math.round(r.cx) : sx + 2;
    drawArm(lx, sy, dx + (SIDE(d) ? 0 : 2), dy - 3);
    drawArm(rx, sy, dx - (SIDE(d) ? 0 : 2), dy - 3);
  } else if (w > 0 && w !== 13) {
    // walking with it: in the hand of the hanging arm on the near side
    const b = I.armBox[actArm >= 0 ? actArm : 1] || I.armBox[0];
    const hx = b ? Math.round(b.cx) : Math.round(I.hcx), hy = b ? b.y1 + bob : I.waist + bob;
    weapon(Pp, w, hx, hy, w <= 6 ? Math.PI / 2 + (SIDE(d) ? -0.4 * Math.sign(fv[0]) : 0.3) : aimAng + (SIDE(d) ? 0 : 0.6));
  }
}

// Lying on the ground (knocked down: kind 0, passed out / dead: kind 1), head to the left, in
// the person's colours. Drawn rotated by the caller.
const lyCache = new Map();
export function lyingSprite(app, kind) {
  if (!LY || !LY[kind]) return null;
  const key = `${appKey(app)}|${kind}`;
  let cv = lyCache.get(key);
  if (cv) return cv;
  const a = app || {}, pal = palette(a), L = LY[kind];
  cv = document.createElement('canvas'); cv.width = LW; cv.height = LH;
  const g = cv.getContext('2d');
  for (let i = 0; i < LW * LH; i++) {
    const p = L.part[i];
    if (!p) continue;
    const sh = L.shade[i];
    const c = p === PART.LINE ? OUTLINE : p === PART.SKIN ? shadeOf(pal.skin, sh) : p === PART.SHIRT ? shadeOf(pal.shirt, sh) : p === PART.PANTS ? shadeOf(pal.pants, sh) : p === PART.SHOES ? shadeOf(pal.shoes, sh) : shadeOf(pal.hair, sh);
    g.fillStyle = c; g.fillRect(i % LW, (i / LW) | 0, 1, 1);
  }
  // hair on the head (the left end) unless bald
  if ((a.h ?? 0) !== 3 || a.ht) {
    let x0 = LW, y0 = LH, y1 = 0;
    for (let i = 0; i < LW * LH; i++) if (L.part[i] === PART.SKIN) { const x = i % LW, y = (i / LW) | 0; if (x < x0) x0 = x; }
    for (let i = 0; i < LW * LH; i++) if (L.part[i] === PART.SKIN && i % LW < x0 + 9) { const y = (i / LW) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    g.fillStyle = a.ht ? pal.hat : pal.hair;
    for (let i = 0; i < LW * LH; i++) { const x = i % LW, y = (i / LW) | 0; if (L.part[i] === PART.SKIN && x < x0 + 4 && y >= y0 && y <= y1) g.fillRect(x, y, 1, 1); }
    if (a.h === 2 && !a.ht) { g.fillStyle = lo(pal.hair); g.fillRect(Math.max(0, x0 - 4), Math.round((y0 + y1) / 2) - 2, 5, 5); }
  }
  if (lyCache.size > 2000) lyCache.delete(lyCache.keys().next().value);
  lyCache.set(key, cv);
  return cv;
}
