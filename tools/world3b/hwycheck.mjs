// World v3b: the highways against the city - buildings standing on a highway at grade, or under its deck; city streets
// running along it; the tiles under each stretch. Builds the world as the server does.
//   node --expose-gc tools/world3b/hwycheck.mjs [out.json]   (heavy: under the heavy lock)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const { buildWorld3 } = await import(join(ROOT, 'server/world3.js'));
const { T, TILE } = await import(join(ROOT, 'shared/constants.js'));
const { DISTRICTS } = await import(join(ROOT, 'shared/mapcore.js'));
const { map: m } = await buildWorld3(1337, { log: () => {} });
const out = { atGrade: [], underDeck: [], byName: {} };
const bldAt = (tx, ty) => { if (!m.inside(tx, ty)) return null; const i = m.idx(tx, ty); return m.tiles[i] === T.BUILDING ? m.bld[i] : null; };
for (const e of m.edges) {
  if (!e || (e.kind !== 'hwy' && e.kind !== 'ramp')) continue;
  const deck = e.lvl === 1 || (e.lvl === 'ramp' && Math.max(e.za || 0, e.zb || 0) > 0.5);
  const half = (e.hw || 64) / TILE;
  const hits = new Map();
  for (let j = 1; j < e.pts.length; j++) {
    const a = e.pts[j - 1], b = e.pts[j], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / 16));
    const ux = (b.x - a.x) / (L || 1), uy = (b.y - a.y) / (L || 1);
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
      for (let o = -half; o <= half; o += 0.5) {
        const tx = Math.floor((x - uy * o * TILE) / TILE), ty = Math.floor((y + ux * o * TILE) / TILE);
        const bid = bldAt(tx, ty);
        if (bid !== null && bid >= 0 && !hits.has(bid)) hits.set(bid, [tx, ty]);
      }
    }
  }
  for (const [bid, [tx, ty]] of hits) {
    const b = m.buildings[bid];
    const rec = { edge: e.id, name: e.name, lvl: e.lvl, at: [tx, ty], b: bid, bname: b && (b.name || b.kind), d: DISTRICTS[m.dist[m.idx(tx, ty)]]?.name };
    (deck ? out.underDeck : out.atGrade).push(rec);
    const k = `${e.name} ${deck ? 'deck' : 'grade'}`;
    out.byName[k] = (out.byName[k] || 0) + 1;
  }
}
const f = process.argv[2] || 'hwycheck.json';
writeFileSync(f, JSON.stringify(out, null, 1));
console.log('at grade', out.atGrade.length, 'under deck', out.underDeck.length);
console.log(JSON.stringify(out.byName));
console.log(JSON.stringify(out.atGrade.slice(0, 12)));
console.log(JSON.stringify(out.underDeck.slice(0, 12)));
