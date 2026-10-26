import { makeWorld, joinPlayer } from '../test/helpers.js';
import * as biz from '../server/systems/biz.js';
const w = makeWorld();
const S = biz.sites(w);
const c = {}; for (const s of S) c[s.t] = (c[s.t] || 0) + 1;
console.log(JSON.stringify(c));
for (const s of S) console.log(s.t, s.id, s.name, s.x, s.y, s.d, s.dt, s.fields ? s.fields.length : '');
