// The shops you walk into fitted out by their trade (the owner, batch 4: "keep developing the interiors of buildings so
// they're more unique and interesting on the inside"): FIT below, one per plan - the corner store's aisles, cooler and
// cigarette rack, the gun shop's racks and glass cases, the hardware store's pegboard and lumber, the pawn shop's
// clutter, the bank's tellers' screen, queue and vault, the barber's chairs, the bar's lit bottles and stools... - each
// varied by the building (its floor, walls, palette, hero pieces; deterministic, never Math.random). Pure layout in world
// px over the server's room (shared/map.js buildInteriors: the counter row, the doorway, the floor stay as they are):
// client/art2/shopart.js draws it into the cut-away (client/art2/game/statics.js makeCut), server/systems/activities.js
// 'shoppers' stands customers where it says. Furniture isn't solid (as the food places' tables): the door's lane, the
// strip along the counter and an ATM's spot are kept clear (clear). Rooms with the door on the south side only.
// shopRoom(b, u, TILE, M) -> null | { plan, X0, X1, back, cy, Ya, Yb, dx, dw, dc, tillX, spot, floor, wall, counter,
//   onWall [{ t, x0, x1, v0, v1, c, g, text }] (v: up the back wall), pieces [{ t, x0, y0, x1, y1, h, c, c2, g, flat }],
//   people [{ x, y, a, gt }] (where customers stand; gt 'sit'), clear [[x0, y0, x1, y1]] }
export const SHOP_PLAN = {
  convenience: 'corner', gasstation: 'fuel', grocery: 'grocery', gunshop: 'gunshop', hardware: 'hardware', pawn: 'pawn',
  fence: 'fence', bank: 'bank', courthouse: 'court', pharmacy: 'pharmacy', barber: 'barber', clothing: 'boutique',
  sports: 'sports', tackle: 'tackle', fishmarket: 'fishmarket', club: 'club', roadhouse: 'saloon',
};
export const TRADE_PLAN = { mart: 'corner', bar: 'bar', liquor: 'liquor', pawn: 'pawn', barber: 'barber', lobby: 'office' };
export const PLANS = ['corner', 'fuel', 'grocery', 'liquor', 'gunshop', 'hardware', 'pawn', 'fence', 'bank', 'court', 'pharmacy', 'barber', 'boutique', 'sports', 'tackle', 'fishmarket', 'bar', 'club', 'saloon', 'office'];
export function planOf(u) {
  if (!u) return null;
  return SHOP_PLAN[u.kind] || (u.trade && TRADE_PLAN[u.trade]) || null;
}

const STRIP = 36;
const seedOf = (b, u) => (Math.imul((b.tx | 0) + 7, 73856093) ^ Math.imul((b.ty | 0) + 3, 19349663) ^ Math.imul((u.x0 | 0) + 1, 83492791)) >>> 0;
function rnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const F = {
  lino: [['lino', '#e2ded2', '#c6c0b2'], ['check', '#e8e6e0', '#b8483a'], ['check', '#dcdcd6', '#3a4a6a'], ['tile', '#d6dad2', '#bcc0b8'], ['check', '#e4e0d0', '#3e7a5a']],
  conc: [['conc', '#9a968e', '#86827a'], ['conc', '#8a8e92', '#74787e'], ['plank', '#7a5a3a', '#5e4430']],
  wood: [['plank', '#8a6440', '#6a4a30'], ['plank', '#a87c50', '#8a6440'], ['plank', '#5e4432', '#4a3426'], ['carpet', '#7a2e30', '#5e2224']],
  posh: [['marble', '#e8e4dc', '#c8c0b0'], ['check', '#e6e2da', '#2a2a30'], ['stone', '#cfc4ae', '#b4a890'], ['marble', '#dcd8d0', '#9a9488']],
  white: [['tile', '#eceeee', '#d4d8da'], ['tile', '#e8ece8', '#c8dcd0'], ['lino', '#e6eaee', '#cad2da']],
  barber: [['check', '#ece8e0', '#222226'], ['check', '#ece8e0', '#a8282c'], ['plank', '#8a6440', '#6a4a30']],
  dark: [['plank', '#3a2a22', '#2c1e18'], ['check', '#2a2430', '#1c1820'], ['conc', '#3a3a40', '#2e2e34']],
  rubber: [['rubber', '#3a3c42', '#2c2e34'], ['rubber', '#2e3a4a', '#243040']],
  green: [['tile', '#c8dcd0', '#a8c4b4'], ['tile', '#d8e4e0', '#b8ccc6']],
};
const W = {
  shop: [['paint', '#e8e2c8', '#c83a2a'], ['paint', '#d8e4e0', '#2a6a9a'], ['paint', '#f0e8d8', '#3a8a4a'], ['paint', '#ece6d8', '#e8a020']],
  gun: [['panel', '#6a4a30', '#3a2a1c'], ['paint', '#5a6a4a', '#2a3020'], ['brick', '#7a4a36', '#3a2a22'], ['paint', '#8a8278', '#4a3a2a']],
  tool: [['peg', '#c8a878', '#d86a20'], ['paint', '#d8d4cc', '#c8302a'], ['peg', '#b89a70', '#2a7a3a']],
  pawn: [['paint', '#b8ac8c', '#7a2a2a'], ['paint', '#8a9a8a', '#3a3a3a'], ['brick', '#8a5a44', '#2a2a2a']],
  posh: [['panel', '#5a2e22', '#c8a050'], ['paint', '#e8e0cc', '#b8943a'], ['stone', '#c8bca6', '#7a6a50']],
  white: [['tile', '#eef0ee', '#3a8a5a'], ['paint', '#e8ecf0', '#2a6aa8']],
  bar: [['panel', '#4a2e20', '#b8863a'], ['brick', '#6a3a2c', '#2a1e18'], ['paint', '#2a2a3a', '#d84a8a'], ['panel', '#3a3a2a', '#8a6a2a']],
  club: [['paint', '#1c1a2a', '#e84aa8'], ['paint', '#141e2a', '#3ad8e8'], ['brick', '#2a1e24', '#c83aff']],
  pastel: [['paint', '#f0dce0', '#c87890'], ['paint', '#dce8f0', '#6a8ab8'], ['paint', '#e8f0dc', '#7aa860'], ['paint', '#f4ecd8', '#c8a050']],
};
const G = {
  snacks: ['#d8343a', '#f0c030', '#3a8ad8', '#f08a2a', '#4ab05a', '#e8e4dc', '#8a3ac8'],
  drinks: ['#c8283a', '#3c96dc', '#f0be28', '#50b45a', '#e8e8e8', '#f07a2a'],
  oil: ['#e8c030', '#2a5ab0', '#c82a2a', '#2a2a2e', '#4a9a4a', '#e8e4dc'],
  produce: ['#d83a2a', '#f08a2a', '#e8d040', '#5aa83a', '#3a7a2a', '#8a3a6a'],
  bottles: ['#6a3a1a', '#3a6a2a', '#c8a040', '#8a1a2a', '#d8d0b0', '#2a4a3a'],
  tools: ['#d86a20', '#c8302a', '#e8c030', '#2a5ab0', '#7a7e86', '#2a2a2e', '#3a8a3a'],
  meds: ['#f0f0ec', '#a8d0e8', '#f0c8d0', '#c8e8c8', '#f0e0a0', '#3a8ad8', '#d83a3a'],
  clutter: ['#8a5a3a', '#c8a040', '#3a3a40', '#a8a8a0', '#6a2a2a', '#2a5a7a', '#d8d0b8', '#5a7a3a'],
  clothes: ['#c83a2a', '#e8c040', '#2a2a30', '#5aa0d0', '#e8e4dc', '#3a8a5a', '#d86aa0', '#7a5ab0'],
  sport: ['#d8343a', '#2a5ab0', '#f0c030', '#e8e8e8', '#2a2a2e', '#3ab05a', '#f07a2a'],
  tackle: ['#3a6a3a', '#c8a040', '#d8343a', '#2a5a8a', '#e8e4dc', '#f07a2a'],
};
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

export function shopRoom(b, u, TILE, M) {
  const wi = b && b.walkIn, plan = planOf(u);
  if (!wi || !wi.south || !plan) return null;
  const X0 = u.x0 * TILE, X1 = (u.x1 + 1) * TILE, back = wi.y0 * TILE, cy = u.counterRow * TILE;
  const Ya = cy + TILE, Yb = (wi.y1 + 1) * TILE, dx = u.door.tx * TILE, dw = (u.door.w || 2) * TILE, dc = dx + dw / 2;
  const tillX = Math.round((X0 + X1) / 2), seed = seedOf(b, u), r = rnd(seed);
  const R = {
    plan, v: Math.floor(r() * 4), seed, X0, X1, back, cy, Ya, Yb, dx, dw, dc, tillX, spot: { x: tillX, y: (u.counterRow + 1.55) * TILE },
    floor: null, wall: null, counter: { top: '#d8d4cc', front: '#a8aab0', trim: null, k: 'plain', on: [] },
    onWall: [], pieces: [], people: [], clear: [[X0, Ya, X1, Ya + STRIP], [dx - 8, Ya, dx + dw + 8, Yb]],
  };
  let atm = false;
  for (const p of (M && M.pois) || []) if (p.kind === 'atm' && p.b === b.id && p.x >= X0 && p.x < X1 && p.y > back && p.y < Yb + TILE) { R.clear.push([p.x - 18, p.y - 44, p.x + 18, p.y + 16]); atm = true; }
  const y0 = Ya + STRIP + 4, y1 = Yb - 6, regs = [];
  if (y1 - y0 >= 14) {
    if (dx - 10 - (X0 + 4) >= 18) regs.push({ x0: X0 + 4, y0, x1: dx - 10, y1, side: -1 });
    if (X1 - 4 - (dx + dw + 10) >= 18) regs.push({ x0: dx + dw + 10, y0, x1: X1 - 4, y1, side: 1 });
    regs.sort((p, q) => (q.x1 - q.x0) - (p.x1 - p.x0));
  }
  const ctx = { R, r, regs, atm, name: (b.name || '') + ' ' + (u.label || ''), TILE, X0, X1, Ya, Yb, y0, y1, back, cy, dx, dw, dc, tillX, W: X1 - X0, FH: Yb - Ya, BH: cy - back };
  FIT[plan](ctx);
  return R;
}

const hit = (a, b, g = 0) => a[0] < b[2] + g && a[2] > b[0] - g && a[1] < b[3] + g && a[3] > b[1] - g;
function put(c, t, x0, y0, x1, y1, h, o = {}) {
  const R = c.R, q = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
  if (q[2] - q[0] < 2 || q[3] - q[1] < 2 || q[0] < c.X0 + 2 || q[2] > c.X1 - 2 || q[1] < c.Ya + 2 || q[3] > c.Yb - 2) return null;
  if (!o.flat) {
    if (R.clear.some((k) => hit(q, k))) return null;
    if (R.pieces.some((p) => !p.flat && hit(q, [p.x0, p.y0, p.x1, p.y1], 2))) return null;
  }
  const p = { t, x0: q[0], y0: q[1], x1: q[2], y1: q[3], h, ...o };
  R.pieces.push(p);
  return p;
}
const shopper = (c, x, y, a = -Math.PI / 2, gt) => c.R.people.push({ x: Math.round(x), y: Math.round(y), a: Math.round(a * 100) / 100, ...(gt ? { gt } : null) });
function aisles(c, reg, d, aisle, mk) {
  let n = 0;
  const W = reg.x1 - reg.x0, k = Math.max(1, Math.round(W / 170)), sw = (W - (k - 1) * 26) / k;
  for (let y = reg.y0; y + d <= reg.y1; y += d + aisle) {
    let any = false;
    for (let i = 0; i < k; i++) { const xa = reg.x0 + i * (sw + 26); if (mk(xa, y, xa + sw, y + d, n)) any = true; }
    if (any) { n++; if (y + d + 14 < reg.y1 && c.r() < 0.45) shopper(c, reg.x0 + 10 + c.r() * Math.max(1, W - 20), y + d + 12); }
  }
  return n;
}
const wall = (c, t, x0, x1, v0, v1, o = {}) => c.R.onWall.push({ t, x0: Math.round(x0), x1: Math.round(x1), v0, v1, ...o });
function sign(c, text, col, x) {
  const w = text.length * 8 + 6, s = c.r() < 0.5 ? -1 : 1, at = [x, c.tillX + s * 70, c.tillX - s * 70, c.tillX + s * 46, c.tillX - s * 46, c.X0 + w / 2 + 8, c.X1 - w / 2 - 8];
  for (const cx of at) {
    if (cx === undefined || cx - w / 2 < c.X0 + 6 || cx + w / 2 > c.X1 - 6) continue;
    if (c.R.onWall.some((q) => q.v1 > 40 && q.x0 < cx + w / 2 + 2 && q.x1 > cx - w / 2 - 2)) continue;
    wall(c, 'sign', cx - w / 2, cx + w / 2, 40, 54, { text, c: col });
    return;
  }
  const cx = Math.max(c.X0 + w / 2 + 6, Math.min(c.X1 - w / 2 - 6, c.tillX));
  if (w + 12 < c.W && !c.R.onWall.some((q) => q.v1 > 55 && q.x0 < cx + w / 2 + 2 && q.x1 > cx - w / 2 - 2)) wall(c, 'sign', cx - w / 2, cx + w / 2, 55, 69, { text, c: col });
}
function waiting(c) {
  const x = c.tillX + (c.r() < 0.5 ? -1 : 1) * (32 + c.r() * 20);
  if (x > c.X0 + 14 && x < c.X1 - 14 && c.r() < 0.6) shopper(c, x, c.Ya + 20);
}
const corner = (reg, w, h, nearDoor) => { const x = (nearDoor ? reg.side < 0 : reg.side > 0) ? reg.x1 - w : reg.x0; return [x, reg.y1 - h, x + w, reg.y1]; };

const FIT = {};
FIT.corner = (c, fuel) => {
  const { R, r } = c;
  R.floor = pick(r, F.lino); R.wall = pick(r, W.shop);
  R.counter = { top: '#d8d4cc', front: R.wall[2], trim: '#eceae4', k: 'plain', on: ['lotto', pick(r, ['hotdog', 'jar', 'gum', 'coffee'])] };
  wall(c, 'cigs', c.tillX - 34, c.tillX + 34, 14, 50);
  wall(c, 'goods', c.X0 + 6, c.tillX - 40, 0, 36, { g: fuel ? G.oil : G.snacks });
  wall(c, 'goods', c.tillX + 40, c.X1 - 6, 0, 36, { g: G.drinks });
  sign(c, fuel ? pick(r, ['FUEL', 'OIL', 'SNACKS']) : pick(r, ['OPEN 24H', 'LOTTO', 'ICE COLD', 'HOT FOOD', 'OPEN']), pick(r, ['#ff4a5a', '#5ae8ff', '#ffd24a', '#7aff7a']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 14, 32, (x0, y, x1, y1, n) => put(c, 'shelf', x0, y, x1, y1, 22, { c: '#5a5e68', g: n === 0 && fuel ? G.oil : G.snacks, bw: n === 0 && fuel ? 6 : 4 }));
  if (b) {
    const q = corner(b, Math.min(b.x1 - b.x0, 64), 12, false);
    put(c, 'cooler', q[0], b.y0, q[2], b.y0 + 12, 46, { c: '#c8ccd2', g: G.drinks });
    if (fuel) { put(c, 'paint', b.x0, b.y0 + 36, Math.min(b.x1, b.x0 + 48), b.y0 + 50, 20, { c: '#5a5e68', g: G.oil }); const t = corner(b, 18, 18, true); put(c, 'machine', ...t, 24, { k: 'tires' }); }
    else aisles(c, { ...b, y0: b.y0 + 36 }, 14, 32, (x0, y, x1, y1) => put(c, 'shelf', x0, y, x1, y1, 20, { c: '#5a5e68', g: G.snacks, bw: 3 }));
  }
  for (const hero of [pick(r, ['slush', 'atm', 'ice', 'arcade', 'papers']), pick(r, ['atm', 'ice', 'plant', 'papers'])]) {
    const reg = c.regs[Math.floor(r() * c.regs.length)];
    if (!reg) break;
    if (hero === 'atm' && c.atm) continue;
    const [w, h, z] = { slush: [16, 10, 34], atm: [14, 10, 38], ice: [26, 14, 18], arcade: [16, 12, 40], papers: [22, 8, 22], plant: [12, 10, 0] }[hero];
    const q = corner(reg, w, h, true);
    if (hero === 'plant') put(c, 'plant', ...q, 18); else put(c, 'machine', ...q, z, { k: hero });
  }
  waiting(c);
};
FIT.fuel = (c) => FIT.corner(c, true);
FIT.grocery = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.white); R.wall = pick(r, W.shop);
  R.counter = { top: '#3a3c44', front: R.wall[2], trim: '#d8d8d8', k: 'plain', on: ['scale', 'bags'] };
  if (c.BH >= 24) wall(c, 'fridge', c.X0 + 6, c.X1 - 6, 2, 44, { g: G.drinks }); else wall(c, 'goods', c.X0 + 6, c.X1 - 6, 0, 40, { g: G.produce });
  sign(c, pick(r, ['FRESH', 'DELI', 'PRODUCE', 'MARKET']), pick(r, ['#7aff7a', '#ffd24a', '#ff7a5a']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 14, 30, (x0, y, x1, y1, n) => put(c, 'shelf', x0, y, x1, y1, 24, { c: '#6a6e78', g: n & 1 ? G.drinks : G.snacks, bw: n & 1 ? 3 : 5 }));
  if (b) {
    let y = b.y0;
    for (let k = 0; k < 3 && y + 20 <= b.y1; k++, y += 30) put(c, 'bins', b.x0, y, Math.min(b.x1, b.x0 + 72), y + 20, 12, { c: '#8a6440', g: G.produce });
    if (b.x1 - b.x0 > 100) put(c, 'cooler', b.x0 + 80, b.y0, b.x1, b.y0 + 22, 18, { c: '#e8ecf0', g: ['#a8d8f0', '#e8f4f8', '#f0c030', '#d83a3a'], low: true });
  }
  if (c.regs.length) { const reg = c.regs[c.regs.length - 1], q = corner(reg, 30, 14, true); put(c, 'carts', ...q, 14); }
  waiting(c); waiting(c);
};
FIT.liquor = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.wood); R.wall = pick(r, W.bar);
  R.counter = { top: '#4a3020', front: '#6a4630', trim: '#c8a050', k: 'plain', on: ['jar', 'lotto'] };
  wall(c, 'bottles', c.X0 + 6, c.X1 - 6, 6, 52, { g: G.bottles });
  sign(c, pick(r, ['LIQUOR', 'WINE', 'SPIRITS', 'BEER']), pick(r, ['#ff4a5a', '#5ae8ff', '#ffb04a']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 12, 32, (x0, y, x1, y1) => put(c, 'shelf', x0, y, x1, y1, 22, { c: '#4a3020', g: G.bottles, bottles: true, bw: 2 }));
  if (b) { put(c, 'cooler', b.x0, b.y0, Math.min(b.x1, b.x0 + 70), b.y0 + 12, 46, { c: '#2a2c34', g: ['#e8c040', '#c8283a', '#3a6ab0', '#e8e8e8'] }); put(c, 'winerack', b.x0, b.y0 + 34, Math.min(b.x1, b.x0 + 54), b.y0 + 50, 24, { c: '#6a4630' }); }
  waiting(c);
};
FIT.gunshop = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.conc); R.wall = pick(r, W.gun);
  R.counter = { top: '#2a2a2e', front: '#5a4a3a', trim: '#8a8e96', k: 'glass', g: ['#2a2a2e', '#4a4c54', '#6a5a4a'], felt: '#7a2a2a', on: ['ammo'] };
  wall(c, 'guns', c.X0 + 6, c.X1 - 6, 4, 54);
  const hero = pick(r, ['head', 'flag', 'head']);
  wall(c, hero, c.X0 + 10, c.X0 + 34, 46, 68);
  sign(c, pick(r, ['GUNS', 'AMMO', 'FIREARMS', 'RANGE']), pick(r, ['#ff3a3a', '#ffb04a']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 16, 24, (x0, y, x1, y1, n) => (n === 1 && c.r() < 0.5 ? put(c, 'gunrack', x0, y, Math.min(x1, x0 + 60), y1, 34, { c: '#5a3a24' }) : put(c, 'case', x0, y, x1, y1, 18, { c: '#3a3a40', g: ['#2a2a2e', '#4a4c54', '#7a5a3a'], felt: '#7a2a2a' })));
  if (b) { put(c, 'pile', b.x0, b.y0, Math.min(b.x1, b.x0 + 40), b.y0 + 22, 20, { g: ['#4a5a2a', '#5a6a34', '#3a4a22', '#6a5a2a'], boxes: true }); put(c, 'mannequin', b.x0 + 4, b.y0 + 32, b.x0 + 18, b.y0 + 42, 40, { c: '#5a6a3a', c2: '#e86a20' }); if (b.x1 - b.x0 > 70) put(c, 'gunrack', b.x0 + 30, b.y0 + 30, Math.min(b.x1, b.x0 + 84), b.y0 + 44, 34, { c: '#5a3a24' }); }
  waiting(c);
};
FIT.hardware = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.conc); R.wall = pick(r, W.tool);
  R.counter = { top: '#d8d4cc', front: R.wall[2], trim: '#2a2a2e', k: 'plain', on: ['keys', 'jar'] };
  wall(c, 'tools', c.X0 + 6, c.X1 - 6, 4, 54, { g: G.tools });
  sign(c, pick(r, ['TOOLS', 'HARDWARE', 'KEYS CUT', 'PAINT']), pick(r, ['#ffb04a', '#ffffff', '#ffd24a']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 14, 32, (x0, y, x1, y1, n) => put(c, n === 1 ? 'paint' : 'shelf', x0, y, x1, y1, n === 1 ? 18 : 26, { c: '#d86a20', g: G.tools, bw: 8 }));
  if (b) {
    put(c, 'lumber', b.x0, b.y0, Math.min(b.x1, b.x0 + 70), b.y0 + 18, 14, { c: '#d8b884' });
    const hero = pick(r, ['mower', 'barrow', 'mower']), q = corner(b, hero === 'mower' ? 30 : 24, 20, true);
    put(c, 'machine', ...q, 18, { k: hero });
    if (b.y1 - b.y0 > 70) put(c, 'ladder', b.x0, b.y0 + 30, b.x0 + 8, b.y0 + 60, 44, { c: '#c8ccd2' });
  }
  waiting(c);
};
FIT.pawn = (c, fence) => {
  const { R, r } = c;
  R.floor = fence ? pick(r, F.dark) : pick(r, F.wood); R.wall = fence ? pick(r, W.gun) : pick(r, W.pawn);
  R.counter = { top: '#2a2a2e', front: '#4a3a2e', trim: '#c8a050', k: 'glass', g: ['#e8c040', '#d8d0b0', '#c8c8d0', '#d84a4a'], felt: '#2a3a6a', on: ['scale'] };
  const n = Math.max(1, Math.floor((c.W - 12) / 70));
  for (let i = 0; i < n; i++) { const x0 = c.X0 + 6 + i * ((c.W - 12) / n), x1 = x0 + (c.W - 12) / n - 4; wall(c, pick(r, fence ? ['goods', 'tvs', 'goods'] : ['guitars', 'tvs', 'goods', 'guitars']), x0, x1, 6, 52, { g: G.clutter }); }
  if (!fence) sign(c, pick(r, ['PAWN', 'WE BUY GOLD', 'CASH 4 GOLD', 'LOANS']), pick(r, ['#ffd24a', '#ff4a5a', '#5ae8ff']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 16, 30, (x0, y, x1, y1, k) => (k === 0 && !fence ? put(c, 'case', x0, y, x1, y1, 18, { c: '#2a2a2e', g: ['#e8c040', '#d8d0b0', '#c8c8d0'], felt: '#2a3a6a' }) : put(c, 'shelf', x0, y, x1, y1, 34, { c: '#5a4632', g: G.clutter, bw: 7 })));
  if (b) {
    put(c, 'pile', b.x0, b.y0, Math.min(b.x1, b.x0 + 46), b.y0 + 24, 24, { g: G.clutter, boxes: !!fence });
    const hero = pick(r, fence ? ['safe', 'tvstack'] : ['safe', 'bike', 'tvstack', 'jukebox']), q = corner(b, hero === 'bike' ? 34 : 22, 16, true);
    put(c, 'machine', ...q, hero === 'bike' ? 20 : 30, { k: hero });
  }
  waiting(c);
};
FIT.fence = (c) => FIT.pawn(c, true);
FIT.bank = (c, court) => {
  const { R, r } = c;
  R.floor = pick(r, F.posh); R.wall = pick(r, W.posh);
  R.counter = { top: court ? '#6a4630' : '#e8e4dc', front: court ? '#4a3020' : R.wall[1], trim: R.wall[2], k: court ? 'plain' : 'teller', on: court ? ['bell'] : ['pens'] };
  if (court) { wall(c, 'seal', c.tillX - 16, c.tillX + 16, 22, 54); wall(c, 'flag', c.tillX - 46, c.tillX - 26, 10, 54); wall(c, 'flag', c.tillX + 26, c.tillX + 46, 10, 54, { c: '#2a5a3a' }); }
  else {
    const vs = r() < 0.5 ? -1 : 1, vx = vs < 0 ? c.X0 + 30 : c.X1 - 30;
    if (c.W >= 150) wall(c, 'vault', vx - 22, vx + 22, 4, 52);
    wall(c, 'clock', c.tillX - 7, c.tillX + 7, 40, 54);
    if (c.W >= 120) wall(c, 'board', c.tillX + (vs < 0 ? 24 : -64), c.tillX + (vs < 0 ? 64 : -24), 24, 50);
  }
  put(c, 'rug', c.dx - 4, c.Ya + STRIP, c.dx + c.dw + 4, c.Yb - 2, 1, { c: court ? '#2a3a6a' : '#7a2a2a', c2: '#c8a050', flat: true });
  const [a, b] = c.regs;
  if (court) for (const reg of c.regs) aisles(c, reg, 10, 22, (x0, y, x1, y1) => put(c, 'bench', x0, y, x1, y1, 16, { c: '#6a4630' }));
  else {
    if (a) {
      const qx = a.side < 0 ? a.x1 - 34 : a.x0 + 4, ln = Math.min(a.y1 - a.y0, 70);
      if (put(c, 'posts', qx, a.y0, qx + 30, a.y0 + ln, 14, { c: '#8a1a2a', flat: true })) { for (let k = 0; k < 3 && 12 + k * 22 < ln; k++) if (r() < 0.7) shopper(c, qx + 15, a.y0 + 12 + k * 22); }
      const rest = { ...a, x0: a.side < 0 ? a.x0 : a.x0 + 40, x1: a.side < 0 ? a.x1 - 40 : a.x1 };
      if (rest.x1 - rest.x0 >= 40) aisles(c, rest, 18, 26, (x0, y, x1, y1) => put(c, 'desk', x0, y, Math.min(x1, x0 + 44), y1, 18, { c: '#5a3a26' }));
    }
    if (b) { aisles(c, b, 18, 26, (x0, y, x1, y1) => put(c, 'desk', b.side > 0 ? x1 - 44 : x0, y, b.side > 0 ? x1 : x0 + 44, y1, 18, { c: '#5a3a26' })); const q = corner(b, 14, 10, true); put(c, 'machine', ...q, 38, { k: 'atm' }); }
  }
  for (const reg of c.regs) { const q = corner(reg, 12, 10, false); put(c, 'plant', q[0], reg.y0, q[2], reg.y0 + 10, 20); }
};
FIT.court = (c) => FIT.bank(c, true);
FIT.pharmacy = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.white); R.wall = pick(r, W.white);
  R.counter = { top: '#eceae4', front: '#3a8a5a', trim: '#eceae4', k: 'plain', on: ['pens', 'jar'] };
  wall(c, 'goods', c.X0 + 6, c.X1 - 6, 0, 44, { g: G.meds });
  wall(c, 'cross', c.tillX - 9, c.tillX + 9, 48, 66);
  sign(c, pick(r, ['PHARMACY', 'Rx', 'DRUGS']), '#7aff9a');
  const [a, b] = c.regs;
  if (a) aisles(c, a, 14, 32, (x0, y, x1, y1) => put(c, 'shelf', x0, y, x1, y1, 22, { c: '#e8eaec', g: G.meds, bw: 3 }));
  if (b) { put(c, 'chairs', b.x0, b.y1 - 12, Math.min(b.x1, b.x0 + 54), b.y1, 18, { c: '#3a62a8' }); const q = corner(b, 18, 14, false); put(c, 'machine', q[0], b.y0, q[2], b.y0 + 14, 26, { k: 'bp' }); }
  waiting(c);
};
FIT.barber = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.barber); R.wall = pick(r, W.pastel);
  R.counter = { top: '#2a2a2e', front: '#a8282c', trim: '#d4d8de', k: 'plain', on: ['jar'] };
  wall(c, 'mirror', c.X0 + 6, c.X1 - 6, 14, 50);
  wall(c, 'pole', c.X0 + 10, c.X0 + 16, 10, 50);
  sign(c, pick(r, ['BARBER', 'CUTS', 'SHAVE', 'FADES']), pick(r, ['#ff4a5a', '#5ae8ff', '#ffffff']));
  const [a, b] = c.regs;
  if (a) {
    for (let x = a.x0, k = 0; x + 30 <= a.x1; x += 38, k++) {
      if (!put(c, 'mirror', x, a.y0, x + 30, a.y0 + 6, 38, { c: '#2a2a2e' })) continue;
      if (put(c, 'chair', x + 7, a.y0 + 12, x + 23, a.y0 + 28, 20, { c: pick(r, ['#a8282c', '#2a2a2e', '#3a6a8a']) }) && r() < 0.6) shopper(c, x + 15, a.y0 + 20, -Math.PI / 2, 'sit');
    }
  }
  if (b) { put(c, 'bench', b.x0, b.y1 - 12, Math.min(b.x1, b.x0 + 60), b.y1, 14, { c: '#7a2a26' }); if (r() < 0.6) shopper(c, b.x0 + 14, b.y1 - 8, -Math.PI / 2, 'sit'); const q = corner(b, 26, 10, false); put(c, 'machine', q[0], b.y0, q[2], b.y0 + 10, 30, { k: pick(r, ['tank', 'tv', 'tank']) }); }
};
FIT.boutique = (c, sport) => {
  const { R, r } = c;
  R.floor = sport ? pick(r, F.rubber) : pick(r, F.wood); R.wall = sport ? pick(r, W.shop) : pick(r, W.pastel);
  R.counter = { top: sport ? '#2a2a2e' : '#eceae4', front: R.wall[2], trim: '#d4d8de', k: 'plain', on: ['bags'] };
  wall(c, sport ? 'shoes' : 'rail', c.X0 + 6, c.X1 - 6, 6, 50, { g: sport ? G.sport : G.clothes });
  sign(c, sport ? pick(r, ['SPORTS', 'GEAR', 'GAME ON']) : pick(r, ['SALE', 'NEW IN', 'STYLE']), pick(r, ['#ff6ab0', '#5ae8ff', '#ffd24a']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 12, 32, (x0, y, x1, y1, n) => (n === 1 ? put(c, 'table', x0 + 6, y - 2, Math.min(x1, x0 + 50), y1 + 2, 18, { c: '#8a6440', g: sport ? G.sport : G.clothes }) : put(c, 'rack', x0, y, x1, y1, 24, { c: '#a8aab0', g: sport ? G.sport : G.clothes })));
  if (b) {
    if (sport) { put(c, 'pile', b.x0, b.y0, Math.min(b.x1, b.x0 + 30), b.y0 + 20, 18, { g: ['#f07a2a', '#e8e8e8', '#2a5ab0', '#8a5a3a'], balls: true }); const q = corner(b, 34, 16, true); put(c, 'machine', ...q, 20, { k: 'bike' }); }
    else for (let k = 0; k < 2; k++) { const x = b.x0 + 6 + k * 22; put(c, 'mannequin', x, b.y1 - 12, x + 12, b.y1 - 2, 42, { c: pick(r, G.clothes), c2: pick(r, G.clothes) }); }
    if (b.y1 - b.y0 > 50) put(c, 'rack', b.x0, b.y0 + (sport ? 30 : 0), Math.min(b.x1, b.x0 + 70), b.y0 + (sport ? 42 : 12), 30, { c: '#a8aab0', g: sport ? G.sport : G.clothes });
  }
  waiting(c);
};
FIT.sports = (c) => FIT.boutique(c, true);
FIT.tackle = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.wood); R.wall = pick(r, W.gun);
  R.counter = { top: '#6a4630', front: '#3a5a3a', trim: '#c8a050', k: 'plain', on: ['jar'] };
  wall(c, 'rods', c.X0 + 6, c.X1 - 6, 4, 54, { g: G.tackle });
  wall(c, 'fish', c.X1 - 46, c.X1 - 10, 56, 68);
  sign(c, pick(r, ['BAIT', 'TACKLE', 'LIVE BAIT']), pick(r, ['#5ae8ff', '#ffd24a', '#7aff7a']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 14, 32, (x0, y, x1, y1) => put(c, 'shelf', x0, y, x1, y1, 22, { c: '#6a4a30', g: G.tackle, bw: 5 }));
  if (b) {
    const q = corner(b, 26, 14, false); put(c, 'machine', q[0], b.y0, q[2], b.y0 + 14, 22, { k: 'tank' }); put(c, 'pile', b.x0, b.y0 + 24, Math.min(b.x1, b.x0 + 40), b.y0 + 42, 16, { g: ['#e8e8e8', '#3a7ad8', '#d83a3a'], boxes: true });
  }
  waiting(c);
};
FIT.fishmarket = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.green); R.wall = pick(r, W.white);
  R.counter = { top: '#eef4f6', front: '#2a6a8a', trim: '#d4d8de', k: 'ice', on: ['scale'] };
  wall(c, 'board', c.tillX - 30, c.tillX + 30, 28, 54);
  wall(c, 'fish', c.X0 + 14, c.X0 + 50, 30, 46);
  sign(c, pick(r, ['FRESH FISH', 'CATCH', 'OYSTERS']), '#5ae8ff');
  for (const reg of c.regs) aisles(c, reg, 18, 24, (x0, y, x1, y1) => put(c, 'ice', x0, y, Math.min(x1, x0 + 80), y1, 16, { c: '#d8dcde' }));
  if (c.regs[0]) { const q = corner(c.regs[0], 26, 14, true); put(c, 'machine', ...q, 22, { k: 'lobster' }); }
  waiting(c);
};
FIT.bar = (c, club, saloon) => {
  const { R, r } = c;
  if (!saloon) { R.floor = club ? pick(r, [['dance', '#1c1a24', '#2a2434']]) : pick(r, F.dark.concat(F.wood.slice(0, 2))); R.wall = club ? pick(r, W.club) : pick(r, W.bar); }
  R.counter = { top: '#3a2418', front: club ? '#1c1a24' : '#5a3a24', trim: '#c8a050', k: 'bar', on: ['taps'] };
  wall(c, 'bottles', c.X0 + 6, c.X1 - 6, 6, 54, { g: G.bottles, lit: true });
  if (!saloon) sign(c, club ? pick(r, ['DANCE', 'VIP', 'LIVE DJ', 'NIGHTS']) : pick(r, ['BAR', 'COLD BEER', 'TAP ROOM', 'COCKTAILS', 'LOUNGE']), pick(r, ['#ff4ab0', '#5ae8ff', '#ffd24a', '#ff6a3a', '#9a7aff']));
  for (let x = c.X0 + 12; x < c.X1 - 12; x += 18) if (Math.abs(x - c.tillX) > 30 && (x < c.dx - 14 || x > c.dx + c.dw + 14)) { R.pieces.push({ t: 'stool', x0: x - 4, y0: c.Ya + 1, x1: x + 4, y1: c.Ya + 9, h: 14, c: club ? '#e84aa8' : '#8a2a26' }); if (r() < 0.22) shopper(c, x, c.Ya + 6, -Math.PI / 2, 'sit'); }
  if (club) { put(c, 'dance', c.X0 + 16, c.Ya + 2 * c.TILE, c.X1 - 16, c.Yb - c.TILE, 1, { g: ['#ff4ab0', '#5ae8ff', '#ffd24a', '#9a7aff'], flat: true }); return; }
  if (saloon) return;
  const [a, b] = c.regs;
  if (a && a.x1 - a.x0 >= 110 && a.y1 - a.y0 >= 60) { const x = a.side < 0 ? a.x0 + 8 : a.x1 - 108; if (put(c, 'pool', x, a.y0 + 6, x + 100, a.y0 + 58, 20, { c: '#5a3a24', c2: pick(r, ['#2f7a4a', '#2a4a8a', '#8a2a3a']) })) shopper(c, x + 50, a.y0 + 66, -Math.PI / 2); }
  else if (a) aisles(c, a, 26, 18, (x0, y, x1, y1) => put(c, 'booth', a.side < 0 ? x0 : x1 - 44, y, a.side < 0 ? x0 + 44 : x1, y1, 22, { c: pick(r, ['#8a2a26', '#2a4a3a', '#3a2a4a']) }));
  if (b) { aisles(c, b, 26, 18, (x0, y, x1, y1) => { const p = put(c, 'booth', b.side > 0 ? x1 - 44 : x0, y, b.side > 0 ? x1 : x0 + 44, y1, 22, { c: pick(r, ['#8a2a26', '#2a4a3a', '#3a2a4a']) }); if (p && r() < 0.5) shopper(c, p.x0 + 6, (p.y0 + p.y1) / 2, 0, 'sit'); return p; }); const q = corner(b, 22, 14, true); put(c, 'machine', ...q, 34, { k: pick(r, ['jukebox', 'tv', 'arcade']) }); }
};
FIT.club = (c) => FIT.bar(c, true);
FIT.saloon = (c) => FIT.bar(c, false, true);
FIT.office = (c) => {
  const { R, r } = c, nm = c.name.toUpperCase();
  const inn = /\b(INN|HOTEL|MOTEL|LODGE|HOSTEL)\b/.test(nm), optic = /OPTIC|EYE|VISION/.test(nm), cash = /CASH|LOAN|PAWN|CHECK/.test(nm), travel = /TRAVEL|TOUR/.test(nm);
  R.floor = pick(r, inn ? F.posh : F.wood.concat(F.lino.slice(3))); R.wall = pick(r, inn ? W.posh : W.pastel.concat(W.white));
  R.counter = { top: inn ? '#e8e4dc' : '#d8d4cc', front: R.wall[2], trim: inn ? '#c8a050' : null, k: cash ? 'teller' : 'plain', on: inn ? ['bell', 'pens'] : ['pens'] };
  if (inn) { wall(c, 'keys', c.tillX - 30, c.tillX + 30, 18, 46); wall(c, 'clock', c.tillX - 50, c.tillX - 36, 36, 50); }
  else if (optic) { wall(c, 'frames', c.X0 + 6, c.X1 - 6, 10, 46); }
  else if (travel) { const n = Math.max(1, Math.floor((c.W - 12) / 40)); for (let i = 0; i < n; i++) { const x = c.X0 + 6 + (i + 0.5) * ((c.W - 12) / n); wall(c, 'poster', x - 13, x + 13, 18, 50); } }
  else { wall(c, 'files', c.X0 + 6, c.X0 + Math.min(70, c.W / 3), 0, 34); wall(c, 'clock', c.tillX - 7, c.tillX + 7, 40, 54); }
  sign(c, inn ? 'RECEPTION' : optic ? 'EYE EXAMS' : cash ? 'CASH NOW' : travel ? 'FLY AWAY' : pick(r, ['OPEN', 'WELCOME']), inn ? '#ffd88a' : pick(r, ['#5ae8ff', '#ffd24a', '#ff6ab0']));
  if (inn) put(c, 'rug', c.dx - 6, c.Ya + STRIP, c.dx + c.dw + 6, c.Yb - 2, 1, { c: '#7a2a2a', c2: '#c8a050', flat: true });
  const [a, b] = c.regs;
  if (a) {
    if (inn || travel) { const x = a.side < 0 ? a.x0 : a.x1 - 60; put(c, 'rug', x - 2, a.y0, x + 62, Math.min(a.y1, a.y0 + 30), 1, { c: '#2a3a5a', c2: '#c8a050', flat: true }); put(c, 'chair', x, a.y0 + 4, x + 16, a.y0 + 20, 18, { c: '#6a2a2a', arm: true }); put(c, 'box', x + 22, a.y0 + 8, x + 38, a.y0 + 20, 12, { c: '#5a3a26' }); put(c, 'chair', x + 44, a.y0 + 4, x + 60, a.y0 + 20, 18, { c: '#6a2a2a', arm: true }); if (r() < 0.5) shopper(c, x + 8, a.y0 + 12, 0, 'sit'); }
    else aisles(c, a, 18, 26, (x0, y, x1, y1) => { const p = put(c, 'desk', a.side < 0 ? x0 : x1 - 44, y, a.side < 0 ? x0 + 44 : x1, y1, 18, { c: pick(r, ['#5a3a26', '#8a8e96', '#d8d4cc']) }); if (p && r() < 0.5) shopper(c, p.x0 + 20, p.y1 + 4, -Math.PI / 2, 'sit'); return p; });
  }
  if (b) {
    if (inn) { const q = corner(b, 22, 16, true); put(c, 'machine', ...q, 30, { k: 'cart' }); }
    else { put(c, 'chairs', b.side > 0 ? b.x1 - 54 : b.x0, b.y1 - 12, b.side > 0 ? b.x1 : b.x0 + 54, b.y1, 18, { c: pick(r, ['#3a62a8', '#6a2a2a', '#3a6a4a']) }); if (r() < 0.5) shopper(c, b.side > 0 ? b.x1 - 46 : b.x0 + 8, b.y1 - 6, -Math.PI / 2, 'sit'); }
    const q = corner(b, 10, 8, false); put(c, 'box', q[0], b.y0, q[2], b.y0 + 8, 24, { c: '#e2e4e6', cooler: true });
  }
  for (const reg of c.regs) { const q = corner(reg, 12, 10, false); put(c, 'plant', ...q, 22); }
  waiting(c);
};
for (const k of PLANS) if (!FIT[k]) throw new Error('shoprooms: no fit-out for ' + k);
