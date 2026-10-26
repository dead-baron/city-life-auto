import { buildWorld3 } from '../server/world3.js';
import { DISTRICTS } from '../shared/mapcore.js';
const { map: m } = await buildWorld3(1337, { log: () => {} });
const c = {}; for (const p of m.pois) c[p.kind] = (c[p.kind] || 0) + 1;
console.log(JSON.stringify(c));
console.log('farmhouses', m.homes.filter((h) => h && !h.gone && h.kind === 'farmhouse').map(h=>h.name+'@'+Math.round(h.x)+','+Math.round(h.y)).join(' | '));
console.log('fields', (m.fields || []).length, 'bays', (m.bays||[]).length, 'walkIns', (m.walkIns||[]).length);
console.log('farm pois', m.pois.filter(p=>p.kind==='farm').map(p=>p.label+'@'+Math.round(p.x)+','+Math.round(p.y)).join(' | '));
console.log('garage', m.pois.filter(p=>p.kind==='garage').map(p=>p.label+'@'+Math.round(p.x)+','+Math.round(p.y)).join(' | '));
console.log('dealer', m.pois.filter(p=>p.kind==='dealer').map(p=>p.label+'@'+Math.round(p.x)+','+Math.round(p.y)+(p.spawnLot?' lot':'')).join(' | '));
console.log('paint', m.pois.filter(p=>p.kind==='paint').map(p=>p.label+'@'+Math.round(p.x)+','+Math.round(p.y)).join(' | '));
const tiers = {}; for (const d of DISTRICTS) if (d) tiers[d.tier] = (tiers[d.tier]||0)+1; console.log('tiers', JSON.stringify(tiers));
// plain buildings in rough/low districts
const busy = new Set(); for (const p of m.pois) if (p.b !== undefined) busy.add(p.b); for (const h of m.homes) if (h && h.b != null) busy.add(h.b);
let n = 0; const byD = {};
for (const b of m.buildings) { if (!b || b.gone || busy.has(b.id) || b.prefab >= 0) continue; const tx = b.tx + (b.tw>>1), ty = b.ty + (b.th>>1); if (!m.inside(tx,ty)) continue; const D = DISTRICTS[m.dist[m.idx(tx,ty)]]; if (!D || (D.tier !== 'rough' && D.style !== 'industrial')) continue; n++; byD[D.name] = (byD[D.name]||0)+1; }
console.log('plain rough/industrial', n, JSON.stringify(byD));
console.log('bfields', Object.keys(m.buildings[0]||{}).join(','));
console.log('rock', m.rock && JSON.stringify({x:m.rock.x,y:m.rock.y,desert:m.rock.desert}));
