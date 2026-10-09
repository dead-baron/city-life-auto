// The redwood canopy for the light (lightgame.js canopyVis). The crowns stand hundreds of px up, far beyond the
// shadow march's reach, so the light takes them as a layer: where the sun ray from a pixel meets it, this grid
// says how thick the crowns are there (a byte per 32 px cell: soft discs round every redwood, over the box the
// redwoods stand in) and the shader's leaf-clump noise opens the gaps the sunflecks and the shafts come through.
// Built once per map on the main thread, from the map's props (a few ms); null where there are no redwoods.
export const CANOPY_H = 400;                                                   // world px up: the crowns' thick
const CROWN = { giantL: 215, giant: 185, giantS: 150, redwood2: 84 };          // crown radius (px) at that height
export function canopyGrid(map, cell = 32) {
  const props = (map && map.props) || [], trees = [];
  for (const p of props) if (p && p.t === 'redwood') trees.push(p);
  if (!trees.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of trees) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = 256;
  x0 = Math.floor((x0 - pad) / cell) * cell; y0 = Math.floor((y0 - pad) / cell) * cell;
  const w = Math.ceil((x1 + pad - x0) / cell), h = Math.ceil((y1 + pad - y0) / cell), data = new Uint8Array(w * h);
  for (const p of trees) {
    const R = CROWN[p.sp] || 160, cx = (p.x - x0) / cell, cy = (p.y - y0) / cell, rc = R / cell;
    for (let y = Math.max(0, Math.floor(cy - rc)); y <= Math.min(h - 1, Math.ceil(cy + rc)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rc)); x <= Math.min(w - 1, Math.ceil(cx + rc)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rc;
        if (d >= 1) continue;
        const v = Math.min(255, Math.round(Math.min(1, (1 - d * d) * 1.6) * 255)), i = y * w + x;
        if (v > data[i]) data[i] = v;
      }
    }
  }
  return { data, w, h, x0, y0, cell, hc: CANOPY_H };
}
// Where the canopy's light falls (screen-world px: y up the screen by height), for a sun direction sd: the crowns'
// box swept back along the sun's rays to the ground - its shade, its flecks and its beams fall away from the sun, a
// low sun throwing them 1500 px and more - and up by the layer's height (the beams in the air over the floor). The
// engine lights with the canopy only while this meets the view (it was a fixed 900 px round the box, so at a low sun
// the flecks and the beams popped in and out at that edge as you walked: task #393). -> [x0, y0, x1, y1]
export function canopyReach(c, sd, out = [0, 0, 0, 0]) {
  const l = Math.hypot(sd[0], sd[1], sd[2]) || 1, T = c.hc / Math.max(0.04, sd[2] / l), sx = -sd[0] / l * T, sy = -sd[1] / l * T;
  const x0 = c.x0, y0 = c.y0, x1 = x0 + c.w * c.cell, y1 = y0 + c.h * c.cell;
  out[0] = Math.min(x0, x0 + sx) - 64; out[1] = Math.min(y0, y0 + sy) - c.hc - 64; out[2] = Math.max(x1, x1 + sx) + 64; out[3] = Math.max(y1, y1 + sy) + 64;
  return out;
}
