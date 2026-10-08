// A chunk bake turned into what is kept and drawn: its G-buffer packed into the engine's three planes at art
// resolution (gbuf.js packGBuf, then downsample2 when the art pixel is bigger than what was drawn) and its "under"
// layer (the chunk before its buildings) taken down to match. The page's bake workers (worker.js) and the server's
// bake threads (server/artbake.js) both pack with this, so a chunk downloaded from the server is exactly the one the
// page would have baked. It is part of the art hash (tools/stamp-version.mjs ART_ROOTS): a change here is a new build
// of the art, and every kept chunk is baked afresh.
//
//   packPlanes(g, art, under = null, run = 0, scratch = null) -> { o: {w, h, ax, ay, ap, p0, p1, p2}, u }
//     g: a GBuf (or its planes), art: world px per art pixel (1 | 2), under: the under layer (RGBA8, g's size) or
//     null, run: downsample2's run (gbuf.js CHUNK_RUN for chunks), scratch: {p0, p1, p2} kept between calls for the
//     full-size planes on their way down (grown when too small) - the arrays that come back are always fresh.
import * as GB from '../gbuf.js';

export function packPlanes(g, art, under = null, run = 0, scratch = null) {
  const down = art > 1 && (g.ap || 1) < art, n4 = g.w * g.h * 4;
  if (down && scratch && (!scratch.p0 || scratch.p0.length < n4)) { scratch.p0 = new Uint8Array(n4); scratch.p1 = new Uint8Array(n4); scratch.p2 = new Uint8Array(n4); }
  let pk = down && scratch ? GB.packGBuf(g, scratch.p0, scratch.p1, scratch.p2) : GB.packGBuf(g), u = null;
  if (down) {
    const d = GB.downsample2(pk, { run });
    if (under) u = GB.downsampleUnder(under, g.w, g.h, d.pick);
    pk = d;
  } else u = under;
  return { o: { w: pk.w, h: pk.h, ax: pk.ax || 0, ay: pk.ay || 0, ap: pk.ap || g.ap || 1, p0: pk.p0, p1: pk.p1, p2: pk.p2 }, u };
}
