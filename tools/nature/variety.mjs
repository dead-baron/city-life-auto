// one world build: how often a plant's nearest neighbours are the very same picture (species + shape + size + colour)
const R = process.env.ROOT || new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const { buildWorld3 } = await import(R + '/server/world3.js');
const { TILE } = await import(R + '/shared/constants.js');
const { staticItems, STATIC_CHUNK: CH } = await import(R + '/client/art2/game/statics.js');
const { map: M } = await buildWorld3(1337, { log: () => {} });
const places = { woods: [1530, 1198], pines: [1560, 1317], oakwoods: [1700, 1250], mountain: [1151, 400], meadow: [2947, 1062], redwood: [520, 1100] };
const trees = M.props.filter((p) => p && (p.t === 'tree_a' || p.t === 'tree_b'));
let nn = 0, c = 0; const sample = trees.filter((_, i) => i % 97 === 0).slice(0, 3000);
const grid = new Map(); for (const p of trees) { const k = Math.floor(p.x / 256) + ',' + Math.floor(p.y / 256); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
const hist = {};
for (const p of sample) { let b = 1e9; const gx = Math.floor(p.x / 256), gy = Math.floor(p.y / 256); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const q of grid.get((gx + dx) + ',' + (gy + dy)) || []) if (q !== p) b = Math.min(b, Math.hypot(q.x - p.x, q.y - p.y)); if (b < 1e9) { nn += b; c++; const h = Math.min(10, Math.floor(b / 16)); hist[h] = (hist[h] || 0) + 1; } }
console.log('tree props', trees.length, 'mean nearest tree', (nn / c).toFixed(0), 'px; hist by 16px', JSON.stringify(hist));
console.log('tree xy mod 32 sample', sample.slice(0, 8).map((p) => `${(p.x % 32).toFixed(0)},${(p.y % 32).toFixed(0)}`).join(' '));
for (const [name, [tx, ty]] of Object.entries(places)) {
  const cx0 = Math.floor(tx * TILE / CH), cy0 = Math.floor(ty * TILE / CH), all = new Map();
  for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) for (const it of staticItems(M, cx, cy)) if (it.recipe && it.recipe.t === 'f') all.set(it.key + '@' + it.x + ',' + it.y, it);
  const L = [...all.values()], isTree = (it) => it.pi !== undefined && M.props[it.pi] && /^tree_|^redwood/.test(M.props[it.pi].t), big = L.filter(isTree), small = L.filter((it) => !isTree(it));
  const rate = (S, R0) => { let twin = 0; for (const a of S) { for (const b of S) if (a !== b && a.key === b.key && Math.hypot(a.x - b.x, a.y - b.y) < R0) { twin++; break; } } return S.length ? (100 * twin / S.length).toFixed(0) + '%' : '-'; };
  const kinds = (S) => new Set(S.map((it) => it.key)).size, sps = (S) => new Set(S.map((it) => it.recipe.sp)).size;
  console.log(`${name}: trees ${big.length} (${sps(big)} species, ${kinds(big)} pictures), with a twin within 160 px ${rate(big, 160)}, within 320 px ${rate(big, 320)}; undergrowth ${small.length} (${sps(small)} species, ${kinds(small)} pictures), twin within 96 px ${rate(small, 96)}`);
}
