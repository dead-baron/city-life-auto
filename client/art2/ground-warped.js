// The ground decorators from ground.js, taking design coordinates and placing them through the layout
// warp (warp.js), so district kits can be written once and widened along their roads. Test callbacks
// (weeds, litter, shoreFoam, ...) still receive world coordinates: use W.ix / W.iy inside them when
// comparing against design numbers.
import * as g from './ground.js';
import { W } from './warp.js';
export { W };
const len = (a, l, horiz) => (horiz ? W.x(a + l) - W.x(a) : W.y(a + l) - W.y(a));
export const laneLine = (G, x0, y0, l, horiz, opt) => g.laneLine(G, Math.round(W.x(x0)), Math.round(W.y(y0)), Math.round(len(horiz ? x0 : y0, l, horiz)), horiz, opt);
export const zebra = (G, x0, y0, w, h, alongX, seed) => { const [x, y, ww, hh] = W.rect(x0, y0, w, h); g.zebra(G, Math.round(x), Math.round(y), Math.round(ww), Math.round(hh), alongX, seed); };
export const manhole = (G, cx, cy, r) => g.manhole(G, Math.round(W.x(cx)), Math.round(W.y(cy)), r);
export const drain = (G, x0, y0, w, h) => g.drain(G, Math.round(W.x(x0)), Math.round(W.y(y0)), w, h);
export const wear = (G, x0, y0, w, h, amount, seed) => { const [x, y, ww, hh] = W.rect(x0, y0, w, h); g.wear(G, x, y, ww, hh, amount * Math.sqrt((ww * hh) / Math.max(1, w * h)), seed); };
export const weeds = g.weeds, litter = g.litter, pavementCracks = g.pavementCracks, lawnEdge = g.lawnEdge, shoreFoam = g.shoreFoam, lilyPads = g.lilyPads, kerbs = g.kerbs;
export const leafLitter = (G, trees, radius, seed) => g.leafLitter(G, trees.map(([x, y]) => [Math.round(W.x(x)), Math.round(W.y(y))]), radius, seed);
export const treeGrate = (G, cx, cy, s) => g.treeGrate(G, Math.round(W.x(cx)), Math.round(W.y(cy)), s);
export const puddle = (G, cx, cy, rx, ry, seed) => g.puddle(G, Math.round(W.x(cx)), Math.round(W.y(cy)), rx, ry, seed);
export const stain = (G, cx, cy, rx, ry, seed, dark) => g.stain(G, Math.round(W.x(cx)), Math.round(W.y(cy)), rx, ry, seed, dark);
export const skid = (G, cx, cy, r, a0, a1) => g.skid(G, Math.round(W.x(cx)), Math.round(W.y(cy)), r, a0, a1);
export const courtLines = (G, x0, y0, w, h, net) => { const [x, y, ww, hh] = W.rect(x0, y0, w, h); g.courtLines(G, Math.round(x), Math.round(y), Math.round(ww), Math.round(hh), net); };
export const poolWall = (G, x0, y0, w, depth) => g.poolWall(G, Math.round(W.x(x0)), Math.round(W.y(y0)), Math.round(len(x0, w, true)), depth);
export const roadText = (G, text, x, y, opt) => g.roadText(G, text, Math.round(W.x(x)), Math.round(W.y(y)), opt);
export const railTrack = (G, x0, y0, l, horiz = true, opt) => g.railTrack(G, Math.round(W.x(x0)), Math.round(W.y(y0)), Math.round(len(horiz ? x0 : y0, l, horiz)), horiz, opt);
export const quayEdge = (G, x0, y, l, h, seed) => g.quayEdge(G, Math.round(W.x(x0)), Math.round(W.y(y)), Math.round(len(x0, l, true)), h, seed);
export const pitchLines = (G, x0, y0, w, h) => { const [x, y, ww, hh] = W.rect(x0, y0, w, h); g.pitchLines(G, Math.round(x), Math.round(y), Math.round(ww), Math.round(hh)); };
export const parkingLines = (G, x0, y0, n, bay, l, opt) => g.parkingLines(G, Math.round(W.x(x0)), Math.round(W.y(y0)), n, bay, l, opt);
export const busSymbol = (G, cx, y0, s) => g.busSymbol(G, Math.round(W.x(cx)), Math.round(W.y(y0)), s);
export const towel = (G, x0, y0, w, h, cols, check) => g.towel(G, Math.round(W.x(x0)), Math.round(W.y(y0)), w, h, cols, check);
export const ruts = (G, path, gap, seed) => g.ruts(G, path.map(([x, y]) => [W.x(x), W.y(y)]), gap, seed);
// a dot of paint or ground at a design position (custom marks in the kits)
export const putAt = (G, x, y, ...rest) => G.put(Math.round(W.x(x)), Math.round(W.y(y)), ...rest);
