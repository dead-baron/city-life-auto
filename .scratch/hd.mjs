import { makeWorld } from '../test/helpers.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { TILE } from '../shared/constants.js';
const m = makeWorld().map;
const st = { all: 0, gone: 0, door: 0, business: 0, size: 0, tier: 0 }; const tiers = {};
for (const b of m.buildings) { st.all++; if (!b || b.gone) { st.gone++; continue; } if (!b.door) { st.door++; continue; } if (b.business) { st.business++; continue; } if (b.tw*b.th<24||b.tw*b.th>600) { st.size++; continue; }
 const tx=Math.floor(b.tx+b.tw/2), ty=Math.floor(b.ty+b.th/2); const D=DISTRICTS[m.dist[m.idx(tx,ty)]]; tiers[D?D.tier:'none']=(tiers[D?D.tier:'none']||0)+1; }
console.log(st, tiers);
