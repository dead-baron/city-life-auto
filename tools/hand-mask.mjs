// For tools/build_blocks.py: each hand-designed block's area and which of its tiles are road
// (the art is cut away there, so the game's own streets show through).
// Usage: node tools/hand-mask.mjs > /tmp/hand-mask.json
import { generateCity } from '../shared/map.js';
import { T, MAP_W } from '../shared/constants.js';
import { HAND_BLOCKS } from '../shared/handblocks.js';

const m = generateCity(1337);
const out = {};
for (const h of HAND_BLOCKS) {
  const [x0, y0, w, hh] = h.area;
  const road = [];
  for (let y = y0; y < y0 + hh; y++) {
    let s = '';
    for (let x = x0; x < x0 + w; x++) { const t = m.tiles[y * MAP_W + x]; s += t === T.ROAD || t === T.BRIDGE ? '1' : '0'; }
    road.push(s);
  }
  out[h.key] = { area: h.area, plaza: !!h.plaza, road, buildings: (h.buildings || []).map((b) => b.r).concat(h.pool ? [h.pool] : []) };
}
process.stdout.write(JSON.stringify(out));
