import { generateCity } from '../shared/map.js';
const m = generateCity(1337);
const c = {}; for (const p of m.pois) c[p.kind] = (c[p.kind] || 0) + 1;
console.log(JSON.stringify(c));
console.log('farmhouses', m.homes.filter((h) => h && h.kind === 'farmhouse').length, 'fields', (m.fields || []).length, 'bays', (m.bays||[]).length, 'clubs', m.pois.filter(p=>p.kind==='club').map(p=>p.label+':'+p.gate).join(','));
console.log(m.pois.filter(p=>p.kind==='farm').map(p=>JSON.stringify({l:p.label,x:p.x,y:p.y,r:p.r})).join('\n'));
console.log(m.pois.filter(p=>p.kind==='garage').map(p=>JSON.stringify({l:p.label,x:p.x,y:p.y,b:p.b})).join('\n'));
console.log('fields', JSON.stringify((m.fields||[]).slice(0,4)));
console.log('rock', !!m.rock, m.rock && Object.keys(m.rock));
