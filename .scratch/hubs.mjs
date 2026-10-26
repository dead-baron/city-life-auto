import { buildWorld3 } from '../server/world3.js';
import { TILE } from '../shared/constants.js';
import { MAIN_JUNCTIONS } from '../shared/world3-skeleton.js';
const { map: M } = await buildWorld3(1337, { log: () => {} });
for (const h of M.railHubs) {
  const j = MAIN_JUNCTIONS.some((q) => Math.hypot(h.x / TILE - q.at[0], h.y / TILE - q.at[1]) < 120);
  const sts = h.calls.map(([ri, si]) => { const r = M.rails[ri], st = r.stations[si]; return `${r.service[0]}${r.way > 0 ? '+' : '-'}@${Math.round(st.x)},${Math.round(st.y)} a${st.a.toFixed(2)}${st.under ? ' U' : ''}${st.el ? ' EL' : ''}`; });
  console.log(h.name, j ? 'JUNCTION' : '', 'bridges', h.bridges.length, JSON.stringify(h.bridges), '\n   ', sts.join(' | '));
}
console.log('subway?', M.rails.filter((r) => r.subway).length, 'loops', M.rails.length);
