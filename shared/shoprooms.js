// The shops you walk into fitted out by their trade (the owner, batch 4; wave D of the 11-03 concept audit: RT9, RT3,
// ST1, IN6, IN3, IN5, MC4): FIT below, one per plan - aisles, coolers, racks, cases, tellers, chairs, bottles... - and
// then dressed out to a fill of the floor (fill: islands - glass cases, floor racks, tables, rugs, mannequins - until
// about 35-50% of the floor is dressed, the door's lane and the counter's spot kept clear), varied by the building
// (deterministic, never Math.random). Pure layout in world px over the server's room (shared/map.js buildInteriors):
// client/art2/shopart.js draws it into the cut-away (statics.js makeCut), server/systems/activities.js 'shoppers' stands
// customers where it says. Furniture isn't solid: the door's lane, the strip along the counter and an ATM's spot are
// kept clear (clear). Rooms with the door on the south side only.
// shopRoom(b, u, TILE, M) -> null | { plan, X0, X1, back, cy, Ya, Yb, dx, dw, dc, tillX, spot, floor, wall, counter,
//   onWall [{ t, x0, x1, v0, v1, c, g, gk, text, face }] (v: up the back wall), pieces [{ t, x0, y0, x1, y1, h, c, c2, g, gk,
//   flat, ext }] (ext: drawn by statics.js, not shopart), people [{ x, y, a, gt }] (where customers stand; gt 'sit'),
//   lamps [{ x, y, r, c, k }] (pools of lamplight on the floor), clear [[x0, y0, x1, y1]] }
export const SHOP_PLAN = {
  convenience: 'corner', gasstation: 'fuel', grocery: 'grocery', gunshop: 'gunshop', hardware: 'hardware', pawn: 'pawn',
  fence: 'fence', bank: 'bank', courthouse: 'court', pharmacy: 'pharmacy', barber: 'barber', clothing: 'boutique',
  sports: 'sports', tackle: 'tackle', fishmarket: 'fishmarket', club: 'club', roadhouse: 'saloon',
};
// (the bar trade is one of IN5's three bars, by its name: barPlan)
export const TRADE_PLAN = { mart: 'corner', bar: 'bar', liquor: 'liquor', pawn: 'pawn', barber: 'barber', lobby: 'office', records: 'records' };
export const BAR_PLANS = ['lounge', 'tavern', 'sportsbar'];
export const PLANS = ['corner', 'fuel', 'grocery', 'liquor', 'gunshop', 'hardware', 'pawn', 'fence', 'bank', 'court', 'pharmacy', 'barber', 'boutique', 'sports', 'tackle', 'fishmarket', 'lounge', 'tavern', 'sportsbar', 'club', 'saloon', 'office', 'records'];
export function planOf(u) {
  if (!u) return null;
  return SHOP_PLAN[u.kind] || (u.trade && TRADE_PLAN[u.trade]) || null;
}
// IN5's three bars: the cocktail lounge (Velvet), the tavern (The Oak & Mug), the sports bar (The Local) - by the words
// in its name, else by the building
export function barPlan(name, seed = 0) {
  const n = String(name || '').toUpperCase();
  if (/LOUNGE|VELVET|COCKTAIL|MARTINI|JAZZ|SUPPER|SILK|SATIN|BLUE NOTE|CLUB ROOM|ROOFTOP|\bWINE\b/.test(n)) return 'lounge';
  if (/TAVERN|\bPUB\b|\bINN\b|\bARMS\b|\bOAK\b|\bMUG\b|\bALE\b|CROWN|\bHEAD\b|\bSTAG\b|\bFOX\b|ANCHOR|BREW|SALOON|\bTAP ROOM/.test(n)) return 'tavern';
  if (/SPORT|LOCAL|\bGAME\b|SCORE|DUGOUT|BULLPEN|PLAYOFF|HUDDLE|\bGOAL\b|TOUCHDOWN|STADIUM/.test(n)) return 'sportsbar';
  return BAR_PLANS[(seed >>> 3) % 3];
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
  posh: [['marble', '#e8e4dc', '#c8c0b0'], ['marble', '#e6dcc8', '#b8a88a'], ['stone', '#cfc4ae', '#b4a890'], ['marble', '#dcd8d0', '#9a9488']],
  court: [['marble', '#e8e4dc', '#c8c0b0'], ['check', '#e6e2da', '#2a2a30'], ['stone', '#cfc4ae', '#b4a890']],
  white: [['tile', '#eceeee', '#d4d8da'], ['tile', '#e8ece8', '#c8dcd0'], ['lino', '#e6eaee', '#cad2da']],
  barber: [['check', '#ece8e0', '#222226'], ['check', '#ece8e0', '#a8282c'], ['plank', '#8a6440', '#6a4a30']],
  dark: [['plank', '#3a2a22', '#2c1e18'], ['check', '#2a2430', '#1c1820'], ['conc', '#3a3a40', '#2e2e34']],
  rubber: [['rubber', '#3a3c42', '#2c2e34'], ['rubber', '#2e3a4a', '#243040']],
  green: [['tile', '#c8dcd0', '#a8c4b4'], ['tile', '#d8e4e0', '#b8ccc6']],
  lounge: [['carpet', '#1e2240', '#151830'], ['carpet', '#2a1e3a', '#1c1428']],
  tavern: [['plank', '#6a4a30', '#4e3422'], ['plank', '#7a5434', '#5a3e28']],
  sports: [['plank', '#8a6440', '#6a4a30'], ['plank', '#7a5434', '#5a3e28'], ['check', '#3a2a22', '#2c1e18']],
  saloon: [['plank', '#7a5434', '#5a3e28'], ['plank', '#6a4a30', '#4e3422']],
  surf: [['plank', '#c8a070', '#a8845a'], ['plank', '#b89060', '#98744a']],
};
const W = {
  shop: [['paint', '#e8e2c8', '#c83a2a'], ['paint', '#d8e4e0', '#2a6a9a'], ['paint', '#f0e8d8', '#3a8a4a'], ['paint', '#ece6d8', '#e8a020']],
  gun: [['panel', '#6a4a30', '#3a2a1c'], ['paint', '#5a6a4a', '#2a3020'], ['brick', '#7a4a36', '#3a2a22'], ['paint', '#8a8278', '#4a3a2a']],
  tool: [['peg', '#c8a878', '#d86a20'], ['paint', '#d8d4cc', '#c8302a'], ['peg', '#b89a70', '#2a7a3a']],
  pawn: [['panel', '#5a4632', '#2a2018'], ['paint', '#6a6a5a', '#3a3a3a'], ['brick', '#7a4a36', '#2a2a2a']],
  posh: [['panel', '#5a2e22', '#c8a050'], ['paint', '#e8e0cc', '#b8943a'], ['stone', '#c8bca6', '#7a6a50']],
  white: [['tile', '#eef0ee', '#3a8a5a'], ['paint', '#e8ecf0', '#2a6aa8']],
  bar: [['panel', '#4a2e20', '#b8863a'], ['brick', '#6a3a2c', '#2a1e18'], ['paint', '#2a2a3a', '#d84a8a'], ['panel', '#3a3a2a', '#8a6a2a']],
  lounge: [['panel', '#1c2038', '#c8a050'], ['paint', '#22183a', '#c8a050']],
  tavern: [['panel', '#5a3a24', '#2a1e14'], ['brick', '#6a3a2c', '#3a2418']],
  sports: [['brick', '#6a3a2c', '#1e4a34'], ['panel', '#3a2a1e', '#1e4a34']],
  saloon: [['panel', '#5a3e28', '#2a1e14'], ['panel', '#4a3424', '#3a2418']],
  club: [['paint', '#1c1a2a', '#e84aa8'], ['paint', '#141e2a', '#3ad8e8'], ['brick', '#2a1e24', '#c83aff']],
  pastel: [['paint', '#f0dce0', '#c87890'], ['paint', '#dce8f0', '#6a8ab8'], ['paint', '#e8f0dc', '#7aa860'], ['paint', '#f4ecd8', '#c8a050']],
  surf: [['panel', '#c8a878', '#2a6a9a'], ['paint', '#e8e0c8', '#2a7a8a']],
  skate: [['brick', '#5a5a60', '#2a2a2e'], ['paint', '#3a3a40', '#e84a3a']],
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
  surf: ['#2a8ac8', '#f07a2a', '#e8d8a0', '#3ab0a0', '#e84a6a', '#f0e8d8', '#2a5a8a'],
  sport: ['#d8343a', '#2a5ab0', '#f0c030', '#e8e8e8', '#2a2a2e', '#3ab05a', '#f07a2a'],
  tackle: ['#3a6a3a', '#c8a040', '#d8343a', '#2a5a8a', '#e8e4dc', '#f07a2a'],
  sleeves: ['#1c1c22', '#d8343a', '#f0c030', '#e8e4dc', '#2a5ab0', '#ff6ab0', '#3a8a4a', '#8a3ac8'],
  gold: ['#e8c040', '#d8d0b0', '#c8c8d0', '#d84a4a', '#3a8ad8'],
  guns: ['#2a2a2e', '#4a4c54', '#7a5a3a'],
};
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const WARM = [255, 206, 140], COOL = [210, 230, 255];

export function shopRoom(b, u, TILE, M) {
  const wi = b && b.walkIn;
  let plan = planOf(u);
  if (!wi || !wi.south || !plan) return null;
  const X0 = u.x0 * TILE, X1 = (u.x1 + 1) * TILE, back = wi.y0 * TILE, cy = u.counterRow * TILE;
  const Ya = cy + TILE, Yb = (wi.y1 + 1) * TILE, dx = u.door.tx * TILE, dw = (u.door.w || 2) * TILE, dc = dx + dw / 2;
  const tillX = Math.round((X0 + X1) / 2), seed = seedOf(b, u), r = rnd(seed);
  const poi = M && M.pois ? M.pois[u.poi] : null, name = ((b.name || '') + ' ' + ((poi && poi.label) || '')).toUpperCase();
  if (plan === 'bar') plan = barPlan(name, seed);
  const R = {
    plan, v: Math.floor(r() * 4), seed, X0, X1, back, cy, Ya, Yb, dx, dw, dc, tillX, spot: { x: tillX, y: (u.counterRow + 1.55) * TILE },
    floor: null, wall: null, counter: { top: '#d8d4cc', front: '#a8aab0', trim: null, k: 'plain', on: [] },
    onWall: [], pieces: [], people: [], lamps: [], clear: [[X0, Ya, X1, Ya + STRIP], [dx - 8, Ya, dx + dw + 8, Yb]],
  };
  let atm = false;
  for (const p of (M && M.pois) || []) if (p.kind === 'atm' && p.b === b.id && p.x >= X0 && p.x < X1 && p.y > back && p.y < Yb + TILE) { R.clear.push([p.x - 18, p.y - 44, p.x + 18, p.y + 16]); atm = true; }
  const y0 = Ya + STRIP + 4, y1 = Yb - 6, regs = [];
  if (y1 - y0 >= 14) {
    if (dx - 10 - (X0 + 4) >= 18) regs.push({ x0: X0 + 4, y0, x1: dx - 10, y1, side: -1 });
    if (X1 - 4 - (dx + dw + 10) >= 18) regs.push({ x0: dx + dw + 10, y0, x1: X1 - 4, y1, side: 1 });
    regs.sort((p, q) => (q.x1 - q.x0) - (p.x1 - p.x0));
  }
  const ctx = { R, r, regs, atm, name, TILE, X0, X1, Ya, Yb, y0, y1, back, cy, dx, dw, dc, tillX, W: X1 - X0, FH: Yb - Ya, BH: cy - back, H: wi.h || 0 };
  FIT[plan](ctx);
  return R;
}

// ---- placing ---------------------------------------------------------------------------------------------------------
const hit = (a, b, g = 0) => a[0] < b[2] + g && a[2] > b[0] - g && a[1] < b[3] + g && a[3] > b[1] - g;
// a piece on the floor: inside the room, off the kept-clear ways (a flat one - a rug, the rope's posts - may lie on
// them), off the other pieces by gap px and off where a customer stands
function put(c, t, x0, y0, x1, y1, h, o = {}, gap = 2) {
  const R = c.R, q = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
  if (q[2] - q[0] < 2 || q[3] - q[1] < 2 || q[0] < c.X0 + 2 || q[2] > c.X1 - 2 || q[1] < c.Ya + 2 || q[3] > c.Yb - 2) return null;
  if (!o.flat) {
    if (R.clear.some((k) => hit(q, k))) return null;
    if (R.pieces.some((p) => !p.flat && hit(q, [p.x0, p.y0, p.x1, p.y1], gap))) return null;
    if (R.people.some((m) => hit(q, [m.x - 7, m.y - 7, m.x + 7, m.y + 7]))) return null;
  } else if (o.under !== true && R.pieces.some((p) => p.flat && hit(q, [p.x0, p.y0, p.x1, p.y1]))) return null;
  const p = { t, x0: q[0], y0: q[1], x1: q[2], y1: q[3], h, ...o };
  if (p.under !== undefined) delete p.under;
  R.pieces.push(p);
  return p;
}
const shopper = (c, x, y, a = -Math.PI / 2, gt) => c.R.people.push({ x: Math.round(x), y: Math.round(y), a: Math.round(a * 100) / 100, ...(gt ? { gt } : null) });
const lamp = (c, x, y, rad = 40, col = WARM, k = 1) => c.R.lamps.push({ x: Math.round(x), y: Math.round(y), r: Math.round(rad), c: col, k: Math.round(k * 100) / 100 });
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
// gondolas running north-south down a region (RT3, IN6: the shelves stand end-on to the counter), a lane between each
function gondolas(c, reg, wd, lane, mk) {
  let n = 0;
  const len = reg.y1 - reg.y0 - 6;
  if (len < 30) return 0;
  const from = reg.side < 0 ? reg.x0 + 18 : reg.x0 + 4;
  for (let x = from; x + wd <= reg.x1 - (reg.side < 0 ? 4 : 18); x += wd + lane) { if (mk(x, reg.y0 + 2, x + wd, reg.y0 + 2 + len, n)) { n++; if (c.r() < 0.4) shopper(c, x + wd + lane / 2, reg.y0 + 14 + c.r() * Math.max(1, len - 28)); } }
  return n;
}
const wall = (c, t, x0, x1, v0, v1, o = {}) => c.R.onWall.push({ t, x0: Math.round(x0), x1: Math.round(x1), v0, v1, ...o });
// a lettered sign on the back wall, over the fittings (client/art2/shopart.js letters it in the sign faces: face 'neon' a
// tube on the wall, else a board): its width from the face's letters (about 12 world px a letter), at the first place
// along the wall where no other sign is
const PER_CHAR = { neon: 14, block: 14, serif: 16, script: 16, civic: 12 };
function sign(c, text, col, x, face = 'neon') {
  const w = text.length * (PER_CHAR[face] || 12) + 18, s = c.r() < 0.5 ? -1 : 1, at = [x, c.tillX + s * 70, c.tillX - s * 70, c.tillX + s * 46, c.tillX - s * 46, c.X0 + w / 2 + 8, c.X1 - w / 2 - 8, c.tillX];
  for (const cx of at) {
    if (cx === undefined || cx - w / 2 < c.X0 + 6 || cx + w / 2 > c.X1 - 6) continue;
    if (c.R.onWall.some((q) => q.t === 'sign' && q.x0 < cx + w / 2 + 4 && q.x1 > cx - w / 2 - 4)) continue;
    wall(c, 'sign', cx - w / 2, cx + w / 2, 50, 70, { text, c: col, face });
    return;
  }
}
function waiting(c) {
  const x = c.tillX + (c.r() < 0.5 ? -1 : 1) * (32 + c.r() * 20);
  if (x > c.X0 + 14 && x < c.X1 - 14 && c.r() < 0.6) shopper(c, x, c.Ya + 20);
}
const corner = (reg, w, h, nearDoor) => { const x = (nearDoor ? reg.side < 0 : reg.side > 0) ? reg.x1 - w : reg.x0; return [x, reg.y1 - h, x + w, reg.y1]; };
// along a region's outer side wall (the room's west or east wall), a unit running north-south
function sideWall(c, reg, t, d, h, o = {}) {
  const atW = reg.x0 <= c.X0 + 6, atE = reg.x1 >= c.X1 - 6;
  if (!atW && !atE) return null;
  const x0 = atW ? c.X0 + 3 : c.X1 - 3 - d;
  const p = put(c, t, x0, reg.y0, x0 + d, reg.y1, h, { side: atW ? -1 : 1, ...o });
  if (p) { if (atW) reg.x0 = Math.max(reg.x0, x0 + d + 22); else reg.x1 = Math.min(reg.x1, x0 - 22); }
  return p;
}
// the floor dressed (wave D): how much of the shop floor in front of the counter that may be dressed - all of it but the
// kept-clear ways (the door's lane, the strip along the counter, an ATM's spot) - is under a piece, a rug or a mat
export function coverage(R) {
  const S = 4, w = Math.ceil((R.X1 - R.X0) / S), h = Math.ceil((R.Yb - R.Ya) / S);
  if (w <= 0 || h <= 0) return 0;
  const m = new Uint8Array(w * h);
  const mark = (q, v) => { const a = Math.max(0, Math.floor((q[0] - R.X0) / S)), b = Math.min(w, Math.ceil((q[2] - R.X0) / S)), c = Math.max(0, Math.floor((q[1] - R.Ya) / S)), d = Math.min(h, Math.ceil((q[3] - R.Ya) / S)); for (let y = c; y < d; y++) for (let x = a; x < b; x++) if (m[y * w + x] !== 2) m[y * w + x] = v; };
  for (const k of R.clear) mark(k, 2);
  for (const p of R.pieces) mark([p.x0, p.y0, p.x1, p.y1], 1);
  let n = 0, all = 0;
  for (let i = 0; i < m.length; i++) if (m[i] !== 2) { all++; n += m[i]; }
  return all ? n / all : 1;
}
// dress the floor out to a fill target: islands from the plan's kit tried along each region (a lane of about 16 px
// round each so you can walk between them), then the side walls, then rugs, until the target is reached or nothing fits
function fill(c, kit, o = {}) {
  const R = c.R, T = o.target ?? 0.37 + c.r() * 0.1;
  let cov = coverage(R);
  if (cov >= T || !kit.length) return cov;
  const regs = c.regs.slice();
  for (let pass = 0; pass < 3 && cov < T; pass++) {
    let any = false;
    for (const reg of regs) {
      for (let k = 0; k < kit.length * 2 && cov < T; k++) {
        const K = kit[(k + pass + (c.R.seed & 7)) % kit.length], [w, d] = K.size(c, reg);
        if (reg.x1 - reg.x0 < w + 4 || reg.y1 - reg.y0 < d + 4) continue;
        let done = false;
        for (let y = reg.y0 + 2; !done && y + d <= reg.y1; y += 8) {
          for (let i = 0; !done && i * 8 + w <= reg.x1 - reg.x0; i++) {
            const x = reg.side < 0 ? reg.x0 + 2 + i * 8 : reg.x1 - 2 - w - i * 8;
            if (x < reg.x0 || x + w > reg.x1) continue;
            const p = K.put(c, x, y, x + w, y + d, o.gap ?? 14);
            if (p) { done = true; any = true; cov = coverage(R); }
          }
        }
      }
    }
    if (!any) break;
  }
  return cov;
}
// a kit entry: its size in a region, and how it's put down
const K = (size, f) => ({ size: typeof size === 'function' ? size : () => size, put: f });

// ---- the plans --------------------------------------------------------------------------------------------------------
const FIT = {};
FIT.corner = (c, fuel) => {
  const { R, r } = c;
  R.floor = pick(r, F.lino); R.wall = pick(r, W.shop);
  R.counter = { top: '#d8d4cc', front: R.wall[2], trim: '#eceae4', k: 'plain', on: ['lotto', pick(r, ['hotdog', 'jar', 'gum', 'coffee'])] };
  wall(c, 'cigs', c.tillX - 34, c.tillX + 34, 14, 50);
  wall(c, 'goods', c.X0 + 6, c.tillX - 40, 0, 36, { g: fuel ? G.oil : G.snacks, gk: fuel ? 'oil' : 'snacks' });
  wall(c, 'fridge', c.tillX + 40, c.X1 - 6, 2, 46, { g: G.drinks, gk: 'drinks' });
  sign(c, fuel ? pick(r, ['FUEL', 'OIL', 'SNACKS']) : pick(r, ['COLD BEER', 'LOTTO', 'ICE COLD', 'HOT FOOD', 'OPEN 24H']), pick(r, ['#5a9aff', '#ff4a5a', '#ffd24a', '#7aff7a']), c.tillX + 40 + (c.X1 - 6 - c.tillX - 40) / 2);
  if (c.atm || r() < 0.5) sign(c, 'ATM', '#ff4a5a');
  const [a, b] = c.regs;
  if (a) { sideWall(c, a, 'shelf', 14, 30, { c: '#5a5e68', g: G.drinks, gk: 'drinks', ns: true }); gondolas(c, a, 16, 26, (x0, y, x1, y1, n) => put(c, 'shelf', x0, y, x1, y1, 24, { c: '#5a5e68', g: n === 0 && fuel ? G.oil : G.snacks, gk: n === 0 && fuel ? 'oil' : 'snacks', ns: true })); }
  if (b) {
    const q = corner(b, Math.min(b.x1 - b.x0, 64), 12, false);
    put(c, 'cooler', q[0], b.y0, q[2], b.y0 + 12, 46, { c: '#c8ccd2', g: G.drinks, gk: 'drinks' });
    if (fuel) { put(c, 'paint', b.x0, b.y0 + 36, Math.min(b.x1, b.x0 + 48), b.y0 + 50, 20, { c: '#5a5e68', g: G.oil }); const t = corner(b, 18, 18, true); put(c, 'machine', ...t, 24, { k: 'tires' }); }
    else aisles(c, { ...b, y0: b.y0 + 36 }, 14, 30, (x0, y, x1, y1) => put(c, 'shelf', x0, y, x1, y1, 20, { c: '#5a5e68', g: G.snacks, gk: 'snacks' }));
  }
  for (const hero of [pick(r, ['slush', 'atm', 'ice', 'arcade', 'papers']), pick(r, ['atm', 'ice', 'plant', 'papers'])]) {
    const reg = c.regs[Math.floor(r() * c.regs.length)];
    if (!reg) break;
    if (hero === 'atm' && c.atm) continue;
    const [w, h, z] = { slush: [16, 10, 34], atm: [14, 10, 38], ice: [26, 14, 18], arcade: [16, 12, 40], papers: [22, 8, 22], plant: [12, 10, 0] }[hero];
    const q = corner(reg, w, h, true);
    if (hero === 'plant') put(c, 'plant', ...q, 18); else put(c, 'machine', ...q, z, { k: hero });
  }
  put(c, 'mat', c.dc - 22, c.Yb - 16, c.dc + 22, c.Yb - 3, 1, { c: '#3a3a40', flat: true });
  fill(c, [
    K([18, 14], (c, x0, y0, x1, y1, g) => put(c, 'crates', x0, y0, x1, y1, 20, { g: ['#c8a070', '#b08a58', '#d8b888'] }, g)),
    K([30, 14], (c, x0, y0, x1, y1, g) => put(c, 'shelf', x0, y0, x1, y1, 18, { c: '#5a5e68', g: G.snacks, gk: 'snacks' }, g)),
    K([14, 14], (c, x0, y0, x1, y1, g) => put(c, 'spinner', x0, y0, x1, y1, 30, { g: G.snacks, gk: 'chips' }, g)),
    K([10, 8], (c, x0, y0, x1, y1, g) => put(c, 'wetfloor', x0, y0, x1, y1, 14, {}, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 8, 46, COOL, 0.8);
  for (const reg of c.regs) lamp(c, (reg.x0 + reg.x1) / 2, (reg.y0 + reg.y1) / 2, 50, COOL, 0.6);
  waiting(c);
};
FIT.fuel = (c) => FIT.corner(c, true);
FIT.grocery = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.white); R.wall = pick(r, W.shop);
  R.counter = { top: '#3a3c44', front: R.wall[2], trim: '#d8d8d8', k: 'plain', on: ['scale', 'bags'] };
  if (c.BH >= 24) wall(c, 'fridge', c.X0 + 6, c.X1 - 6, 2, 44, { g: G.drinks, gk: 'drinks' }); else wall(c, 'goods', c.X0 + 6, c.X1 - 6, 0, 40, { g: G.produce, gk: 'produce' });
  sign(c, pick(r, ['FRESH', 'DELI', 'PRODUCE', 'MARKET']), pick(r, ['#7aff7a', '#ffd24a', '#ff7a5a']));
  const [a, b] = c.regs;
  if (a) gondolas(c, a, 16, 26, (x0, y, x1, y1, n) => put(c, 'shelf', x0, y, x1, y1, 24, { c: '#6a6e78', g: n & 1 ? G.drinks : G.snacks, gk: n & 1 ? 'drinks' : 'snacks', ns: true }));
  if (b) {
    let y = b.y0;
    for (let k = 0; k < 3 && y + 20 <= b.y1; k++, y += 28) put(c, 'bins', b.x0, y, Math.min(b.x1, b.x0 + 72), y + 20, 12, { c: '#8a6440', g: G.produce });
    if (b.x1 - b.x0 > 100) put(c, 'cooler', b.x0 + 80, b.y0, b.x1, b.y0 + 22, 18, { c: '#e8ecf0', g: ['#a8d8f0', '#e8f4f8', '#f0c030', '#d83a3a'], low: true });
  }
  if (c.regs.length) { const reg = c.regs[c.regs.length - 1], q = corner(reg, 30, 14, true); put(c, 'carts', ...q, 14); }
  fill(c, [
    K([40, 18], (c, x0, y0, x1, y1, g) => put(c, 'bins', x0, y0, x1, y1, 12, { c: '#8a6440', g: G.produce }, g)),
    K([18, 14], (c, x0, y0, x1, y1, g) => put(c, 'crates', x0, y0, x1, y1, 16, { g: ['#c8a070', '#b08a58', '#5aa83a'] }, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 8, 46, COOL, 0.7);
  waiting(c); waiting(c);
};
FIT.liquor = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.wood); R.wall = pick(r, W.bar);
  R.counter = { top: '#4a3020', front: '#6a4630', trim: '#c8a050', k: 'plain', on: ['jar', 'lotto'] };
  wall(c, 'bottles', c.X0 + 6, c.X1 - 6, 6, 48, { g: G.bottles });
  sign(c, pick(r, ['LIQUOR', 'WINE', 'SPIRITS', 'BEER']), pick(r, ['#ff4a5a', '#5ae8ff', '#ffb04a']));
  const [a, b] = c.regs;
  if (a) { sideWall(c, a, 'winerack', 14, 34, { c: '#6a4630' }); aisles(c, a, 12, 28, (x0, y, x1, y1) => put(c, 'shelf', x0, y, x1, y1, 22, { c: '#4a3020', g: G.bottles, gk: 'bottles', bottles: true })); }
  if (b) { put(c, 'cooler', b.x0, b.y0, Math.min(b.x1, b.x0 + 70), b.y0 + 12, 46, { c: '#2a2c34', g: ['#e8c040', '#c8283a', '#3a6ab0', '#e8e8e8'], gk: 'drinks' }); put(c, 'winerack', b.x0, b.y0 + 34, Math.min(b.x1, b.x0 + 54), b.y0 + 50, 24, { c: '#6a4630' }); }
  fill(c, [
    K([22, 16], (c, x0, y0, x1, y1, g) => put(c, 'barrel', x0, y0, x1, y1, 22, { c: '#7a5434' }, g)),
    K([28, 18], (c, x0, y0, x1, y1, g) => put(c, 'crates', x0, y0, x1, y1, 18, { g: ['#8a6440', '#6a4a30', '#c8a070'], bottles: true }, g)),
    K([32, 12], (c, x0, y0, x1, y1, g) => put(c, 'shelf', x0, y0, x1, y1, 22, { c: '#4a3020', g: G.bottles, gk: 'bottles', bottles: true }, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 6, 40, WARM, 0.8);
  waiting(c);
};
FIT.gunshop = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.conc); R.wall = pick(r, W.gun);
  R.counter = { top: '#2a2a2e', front: '#5a4a3a', trim: '#8a8e96', k: 'glass', g: G.guns, felt: '#7a2a2a', on: ['ammo'] };
  wall(c, 'guns', c.X0 + 6, c.X1 - 6, 4, 48);
  wall(c, pick(r, ['head', 'flag', 'head']), c.X0 + 10, c.X0 + 34, 50, 70);
  sign(c, pick(r, ['GUNS', 'AMMO', 'FIREARMS', 'RANGE']), pick(r, ['#ff3a3a', '#ffb04a']), undefined, 'block');
  const [a, b] = c.regs;
  if (a) { sideWall(c, a, 'gunrack', 12, 34, { c: '#5a3a24', v: true }); aisles(c, a, 16, 24, (x0, y, x1, y1, n) => put(c, 'glasscase', x0, y, x1, y1, 20, { c: '#3a3a40', g: G.guns, gk: 'guns', felt: '#7a2a2a' })); }
  if (b) { put(c, 'pile', b.x0, b.y0, Math.min(b.x1, b.x0 + 40), b.y0 + 22, 20, { g: ['#4a5a2a', '#5a6a34', '#3a4a22', '#6a5a2a'], boxes: true }); put(c, 'mannequin', b.x0 + 4, b.y0 + 32, b.x0 + 18, b.y0 + 42, 40, { c: '#5a6a3a', c2: '#e86a20' }); if (b.x1 - b.x0 > 70) put(c, 'gunrack', b.x0 + 30, b.y0 + 30, Math.min(b.x1, b.x0 + 84), b.y0 + 44, 34, { c: '#5a3a24' }); }
  fill(c, [
    K([40, 18], (c, x0, y0, x1, y1, g) => put(c, 'glasscase', x0, y0, x1, y1, 20, { c: '#3a3a40', g: G.guns, gk: 'guns', felt: '#7a2a2a' }, g)),
    K([14, 10], (c, x0, y0, x1, y1, g) => put(c, 'mannequin', x0, y0, x1, y1, 40, { c: pick(c.r, ['#5a6a3a', '#4a5a2a', '#6a5a3a']), c2: pick(c.r, ['#e86a20', '#3a3a30']) }, g)),
    K([26, 18], (c, x0, y0, x1, y1, g) => put(c, 'pile', x0, y0, x1, y1, 18, { g: ['#4a5a2a', '#5a6a34', '#3a4a22', '#6a5a2a'], boxes: true }, g)),
  ]);
  put(c, 'mat', c.dc - 22, c.Yb - 16, c.dc + 22, c.Yb - 3, 1, { c: '#4a3a2a', flat: true });
  for (const reg of c.regs) lamp(c, (reg.x0 + reg.x1) / 2, reg.y0 + 14, 44, WARM, 0.7);
  waiting(c);
};
FIT.hardware = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.conc); R.wall = pick(r, W.tool);
  R.counter = { top: '#d8d4cc', front: R.wall[2], trim: '#2a2a2e', k: 'plain', on: ['keys', 'jar'] };
  wall(c, 'tools', c.X0 + 6, c.X1 - 6, 4, 48, { g: G.tools });
  sign(c, pick(r, ['TOOLS', 'HARDWARE', 'KEYS CUT', 'PAINT']), pick(r, ['#ffb04a', '#ffffff', '#ffd24a']), undefined, 'block');
  const [a, b] = c.regs;
  if (a) gondolas(c, a, 16, 26, (x0, y, x1, y1, n) => put(c, n === 1 ? 'paint' : 'shelf', x0, y, x1, y1, n === 1 ? 18 : 26, { c: '#d86a20', g: G.tools, gk: 'tools', ns: true }));
  if (b) {
    put(c, 'lumber', b.x0, b.y0, Math.min(b.x1, b.x0 + 70), b.y0 + 18, 14, { c: '#d8b884' });
    const hero = pick(r, ['mower', 'barrow', 'mower']), q = corner(b, hero === 'mower' ? 30 : 24, 20, true);
    put(c, 'machine', ...q, 18, { k: hero });
    if (b.y1 - b.y0 > 70) put(c, 'ladder', b.x0, b.y0 + 30, b.x0 + 8, b.y0 + 60, 44, { c: '#c8ccd2' });
  }
  fill(c, [
    K([34, 14], (c, x0, y0, x1, y1, g) => put(c, 'paint', x0, y0, x1, y1, 18, { c: '#7a7e86', g: G.tools }, g)),
    K([24, 18], (c, x0, y0, x1, y1, g) => put(c, 'machine', x0, y0, x1, y1, 18, { k: pick(c.r, ['mower', 'barrow']) }, g)),
    K([30, 14], (c, x0, y0, x1, y1, g) => put(c, 'lumber', x0, y0, x1, y1, 12, { c: '#d8b884' }, g)),
    K([20, 16], (c, x0, y0, x1, y1, g) => put(c, 'crates', x0, y0, x1, y1, 18, { g: ['#c8a070', '#b08a58', '#d86a20'] }, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 6, 46, COOL, 0.6);
  waiting(c);
};
// RT9: the counter of glass cases across the back with the scale on it, the wall of guitars and TVs behind, a red LOANS
// neon and the PAWN sign; on the floor two glass cases (guns, jewellery), the GOOD STUFF COSTS LESS rug in front of the
// door, shelving of electronics and tools along the side wall, the leather couch, a bike, the safe, the deer head
FIT.pawn = (c, fence) => {
  const { R, r } = c;
  R.floor = fence ? pick(r, F.dark) : pick(r, F.conc.concat(F.wood.slice(0, 3))); R.wall = fence ? pick(r, W.gun) : pick(r, W.pawn);
  R.counter = { top: '#2a2a2e', front: '#4a3a2e', trim: '#c8a050', k: 'glass', g: G.gold, felt: '#2a3a6a', on: ['scale'] };
  const n = Math.max(1, Math.floor((c.W - 12) / 70));
  for (let i = 0; i < n; i++) { const x0 = c.X0 + 6 + i * ((c.W - 12) / n), x1 = x0 + (c.W - 12) / n - 4; wall(c, i === 0 && !fence ? 'guitars' : pick(r, fence ? ['goods', 'tvs', 'goods'] : ['guitars', 'tvs', 'goods', 'tvs']), x0, x1, 6, 48, { g: G.clutter, gk: 'clutter' }); }
  if (!fence) { sign(c, 'PAWN SHOP', '#ffd24a', c.tillX, 'block'); sign(c, pick(r, ['LOANS', 'WE BUY GOLD', 'CASH 4 GOLD']), '#ff4a5a'); if (c.W >= 200) wall(c, 'head', c.X1 - 40, c.X1 - 14, 50, 72); }
  const [a, b] = c.regs;
  if (!fence) put(c, 'rug', c.dc - 26, c.Ya + STRIP + 6, c.dc + 26, Math.min(c.Yb - 18, c.Ya + STRIP + 76), 1, { c: '#8a2a24', c2: '#d8a050', text: c.dw >= 64 ? 'GOOD STUFF' : null, flat: true });
  if (a) { sideWall(c, a, 'shelf', 14, 34, { c: '#5a4632', g: G.clutter, gk: 'clutter', ns: true }); aisles(c, a, 18, 26, (x0, y, x1, y1, k) => put(c, 'glasscase', x0, y, Math.min(x1, x0 + 70), y1, 20, { c: '#2a2a2e', g: k === 0 ? G.guns : G.gold, gk: k === 0 && !fence ? 'guns' : 'gold', felt: k === 0 ? '#7a2a2a' : '#2a3a6a' })); }
  if (b) {
    sideWall(c, b, 'shelf', 14, 30, { c: '#5a4632', g: G.tools, gk: 'tools', ns: true });
    put(c, 'pile', b.x0, b.y0, Math.min(b.x1, b.x0 + 46), b.y0 + 24, 24, { g: G.clutter, boxes: !!fence });
    const hero = pick(r, fence ? ['safe', 'tvstack'] : ['safe', 'bike', 'tvstack', 'jukebox']), q = corner(b, hero === 'bike' ? 34 : 22, 16, true);
    put(c, 'machine', ...q, hero === 'bike' ? 20 : 30, { k: hero });
  }
  fill(c, [
    K([44, 18], (c, x0, y0, x1, y1, g) => put(c, 'glasscase', x0, y0, x1, y1, 20, { c: '#2a2a2e', g: G.gold, gk: 'gold', felt: '#2a3a6a' }, g)),
    K([40, 16], (c, x0, y0, x1, y1, g) => put(c, 'sofa', x0, y0, x1, y1, 16, { c: '#5a3424' }, g)),
    K([22, 16], (c, x0, y0, x1, y1, g) => put(c, 'machine', x0, y0, x1, y1, 30, { k: pick(c.r, ['safe', 'tvstack', 'jukebox']) }, g)),
    K([34, 14], (c, x0, y0, x1, y1, g) => put(c, 'machine', x0, y0, x1, y1, 20, { k: 'bike' }, g)),
    K([26, 18], (c, x0, y0, x1, y1, g) => put(c, 'pile', x0, y0, x1, y1, 22, { g: G.clutter, boxes: !!fence }, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 4, 50, WARM, 0.9);
  for (const reg of c.regs) lamp(c, (reg.x0 + reg.x1) / 2, (reg.y0 + reg.y1) / 2, 46, WARM, 0.7);
  waiting(c);
};
FIT.fence = (c) => FIT.pawn(c, true);
// IN3: the marble lobby with a compass rose set in it, the tellers behind glass along the back, the roped queue up to
// them, the vault door on the back wall (bolts round its rim, the wheel), the manager's glass office in a corner, desks,
// sofas and palms; brass lamps
FIT.bank = (c, court) => {
  const { R, r } = c;
  R.floor = pick(r, court ? F.court : F.posh); R.wall = pick(r, W.posh);
  R.counter = { top: court ? '#6a4630' : '#e8e4dc', front: court ? '#4a3020' : R.wall[1], trim: R.wall[2], k: court ? 'plain' : 'teller', on: court ? ['bell'] : ['pens'] };
  if (court) { wall(c, 'seal', c.tillX - 16, c.tillX + 16, 22, 54); wall(c, 'flag', c.tillX - 46, c.tillX - 26, 10, 54); wall(c, 'flag', c.tillX + 26, c.tillX + 46, 10, 54, { c: '#2a5a3a' }); }
  else {
    const vs = r() < 0.5 ? -1 : 1, vx = vs < 0 ? c.X0 + 34 : c.X1 - 34;
    if (c.W >= 150) wall(c, 'vault', vx - 26, vx + 26, 2, 54);
    wall(c, 'clock', c.tillX - 7, c.tillX + 7, 56, 70);
    if (c.W >= 120) wall(c, 'board', c.tillX + (vs < 0 ? 24 : -64), c.tillX + (vs < 0 ? 64 : -24), 26, 48);
    for (const x of [c.X0 + 12, c.X1 - 18]) if (Math.abs(x - vx) > 32) wall(c, 'sconce', x, x + 6, 40, 50);
    // the compass rose in the marble, in front of the door
    const rw = Math.min(c.dw + 32, 96), rh = Math.min(56, c.Yb - c.Ya - STRIP - 26);
    if (rh >= 30) put(c, 'rose', c.dc - rw / 2, c.Ya + STRIP + 8, c.dc + rw / 2, c.Ya + STRIP + 8 + rh, 1, { c: '#b8a070', c2: '#5a4a3a', flat: true });
  }
  put(c, 'rug', c.dx + 6, court ? c.Ya + STRIP : c.Yb - 30, c.dx + c.dw - 6, c.Yb - 2, 1, { c: court ? '#2a3a6a' : '#7a2a2a', c2: '#c8a050', flat: true, under: true });
  const [a, b] = c.regs;
  if (court) for (const reg of c.regs) aisles(c, reg, 10, 22, (x0, y, x1, y1) => put(c, 'bench', x0, y, x1, y1, 16, { c: '#6a4630' }));
  else {
    // the roped queue: brass stanchions and a red rope zigzagging up to the tellers, beside the door's lane
    const qx = c.dc + (a && a.side < 0 ? -c.dw / 2 - 40 : c.dw / 2 + 8), ql = Math.min(70, c.Yb - c.Ya - STRIP - 20);
    if (ql >= 28 && qx > c.X0 + 6 && qx + 32 < c.X1 - 6 && put(c, 'posts', qx, c.Ya + STRIP + 2, qx + 32, c.Ya + STRIP + 2 + ql, 14, { c: '#8a1a2a', flat: true, under: true })) { for (let k = 0; k < 3 && 12 + k * 22 < ql; k++) if (r() < 0.75) shopper(c, qx + 16, c.Ya + STRIP + 14 + k * 22); }
    // the manager's office: glass walls round a desk, a chair and a palm, in the far corner of the biggest side
    if (a && a.x1 - a.x0 >= 84 && a.y1 - a.y0 >= 56) {
      const ow = Math.min(110, a.x1 - a.x0 - 4), oh = Math.min(70, a.y1 - a.y0), ox = a.side < 0 ? c.X0 + 3 : c.X1 - 3 - ow;
      put(c, 'office', ox, a.y1 - oh, ox + ow, a.y1, 30, { c: '#5a3a26', door: a.side < 0 ? 1 : -1 });
    }
    for (const reg of c.regs) aisles(c, reg, 18, 26, (x0, y, x1, y1) => { const w = 48, x = reg.side > 0 ? x1 - w : x0; const p = put(c, 'desk', x, y, x + w, y1, 18, { c: '#5a3a26', lampOn: true }); if (p && r() < 0.5) shopper(c, x + 22, y1 + 6, -Math.PI / 2, 'sit'); return p; });
    if (b) { const q = corner(b, 14, 10, true); put(c, 'machine', ...q, 38, { k: 'atm' }); }
  }
  fill(c, [
    K([40, 16], (c, x0, y0, x1, y1, g) => put(c, 'sofa', x0, y0, x1, y1, 16, { c: court ? '#3a2a20' : '#2a5a46' }, g)),
    K([14, 12], (c, x0, y0, x1, y1, g) => put(c, 'plant', x0, y0, x1, y1, 26, { big: true }, g)),
    K([30, 30], (c, x0, y0, x1, y1, g) => put(c, 'rug', x0, y0, x1, y1, 1, { c: court ? '#2a3a6a' : '#2a4a3a', c2: '#c8a050', flat: true }, g)),
    K([22, 14], (c, x0, y0, x1, y1, g) => put(c, 'table', x0, y0, x1, y1, 16, { c: '#5a3a26', g: ['#e8e4dc', '#c8a050'] }, g)),
  ]);
  for (const reg of c.regs) { const q = corner(reg, 12, 10, false); put(c, 'plant', q[0], reg.y0, q[2], reg.y0 + 10, 24, { big: true }); }
  for (let x = c.X0 + 40; x < c.X1 - 20; x += 90) lamp(c, x, c.Ya - 4, 40, WARM, 0.9);
  lamp(c, c.dc, c.Ya + STRIP + 30, 56, WARM, 0.7);
};
FIT.court = (c) => FIT.bank(c, true);
// IN6: the pharmacy counter at the back under its green cross, gondolas of boxes and bottles end-on to it, the
// waiting chairs, the blood-pressure machine
FIT.pharmacy = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.white); R.wall = pick(r, W.white);
  R.counter = { top: '#eceae4', front: '#3a8a5a', trim: '#eceae4', k: 'plain', on: ['pens', 'jar'] };
  wall(c, 'goods', c.X0 + 6, c.X1 - 6, 0, 44, { g: G.meds, gk: 'meds' });
  wall(c, 'cross', c.tillX - 9, c.tillX + 9, 48, 66);
  sign(c, pick(r, ['PHARMACY', 'Rx', 'DRUGS']), '#2a8a5a', undefined, 'civic');
  const [a, b] = c.regs;
  if (a) gondolas(c, a, 16, 26, (x0, y, x1, y1) => put(c, 'shelf', x0, y, x1, y1, 24, { c: '#e8eaec', g: G.meds, gk: 'meds', ns: true }));
  if (b) { sideWall(c, b, 'shelf', 14, 30, { c: '#e8eaec', g: G.meds, gk: 'meds', ns: true }); put(c, 'chairs', b.x0, b.y1 - 12, Math.min(b.x1, b.x0 + 54), b.y1, 18, { c: '#3a62a8' }); const q = corner(b, 18, 14, false); put(c, 'machine', q[0], b.y0, q[2], b.y0 + 14, 26, { k: 'bp' }); }
  fill(c, [
    K([16, 50], (c, x0, y0, x1, y1, g) => put(c, 'shelf', x0, y0, x1, y1, 22, { c: '#e8eaec', g: G.meds, gk: 'meds', ns: true }, g)),
    K([14, 14], (c, x0, y0, x1, y1, g) => put(c, 'spinner', x0, y0, x1, y1, 30, { g: G.meds, gk: 'meds' }, g)),
    K([30, 12], (c, x0, y0, x1, y1, g) => put(c, 'chairs', x0, y0, x1, y1, 18, { c: '#3a62a8' }, g)),
    K([12, 10], (c, x0, y0, x1, y1, g) => put(c, 'plant', x0, y0, x1, y1, 20, {}, g)),
  ]);
  put(c, 'mat', c.dc - 22, c.Yb - 16, c.dc + 22, c.Yb - 3, 1, { c: '#2a6a4a', flat: true });
  lamp(c, c.tillX, c.Ya - 6, 50, COOL, 0.7);
  waiting(c);
};
FIT.barber = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.barber); R.wall = pick(r, W.pastel);
  R.counter = { top: '#2a2a2e', front: '#a8282c', trim: '#d4d8de', k: 'plain', on: ['jar'] };
  wall(c, 'mirror', c.X0 + 6, c.X1 - 6, 14, 48);
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
  fill(c, [
    K([30, 30], (c, x0, y0, x1, y1, g) => put(c, 'rug', x0, y0, x1, y1, 1, { c: '#2a3a5a', c2: '#c8a050', flat: true }, g)),
    K([20, 14], (c, x0, y0, x1, y1, g) => put(c, 'table', x0, y0, x1, y1, 14, { c: '#5a3a26', g: ['#e8e4dc', '#d83a3a', '#3a8ad8'] }, g)),
    K([12, 10], (c, x0, y0, x1, y1, g) => put(c, 'plant', x0, y0, x1, y1, 20, {}, g)),
    K([34, 12], (c, x0, y0, x1, y1, g) => put(c, 'bench', x0, y0, x1, y1, 14, { c: '#7a2a26' }, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 6, 44, WARM, 0.7);
};
// ST1 / OS32: round and straight floor racks of clothes on hangers, display tables of folded tops, mannequins on plinths,
// a rug; the surf shop's boards stood along the wall and its palms; the skate shop's decks on the wall; the sports shop's
// balls, bikes and shoes
FIT.boutique = (c, sport) => {
  const { R, r } = c, surf = !sport && /SURF|WAVE|BEACH|SWELL|BOARD|WIPEOUT|TIDE/.test(c.name), skate = !sport && !surf && /SKATE|KICKFLIP|DECK|GRIND|KICKS/.test(c.name);
  const g = sport ? G.sport : surf ? G.surf : G.clothes;
  R.floor = sport ? pick(r, F.rubber) : surf ? pick(r, F.surf) : skate ? pick(r, F.conc.slice(0, 2)) : pick(r, F.wood); R.wall = sport ? pick(r, W.shop) : surf ? pick(r, W.surf) : skate ? pick(r, W.skate) : pick(r, W.pastel);
  R.counter = { top: sport ? '#2a2a2e' : surf ? '#8a6440' : '#eceae4', front: R.wall[2], trim: '#d4d8de', k: 'plain', on: ['bags'] };
  if (skate) wall(c, 'decks', c.X0 + 6, c.X1 - 6, 6, 48, { g: G.sport });
  else wall(c, sport ? 'shoes' : 'rail', c.X0 + 6, c.X1 - 6, 6, 48, { g });
  if (surf) for (const x of [c.X0 + 20, c.X1 - 50]) wall(c, 'poster', x, x + 30, 50, 70, { c: '#2a8ac8' });
  sign(c, sport ? pick(r, ['SPORTS', 'GEAR', 'GAME ON']) : surf ? pick(r, ['SURF', 'BOARDS', 'WAX']) : skate ? pick(r, ['SKATE', 'DECKS', 'SHRED']) : pick(r, ['SALE', 'NEW IN', 'STYLE']), pick(r, ['#ff6ab0', '#5ae8ff', '#ffd24a']), undefined, sport || surf ? 'civic' : skate ? 'block' : 'script');
  const [a, b] = c.regs;
  if (surf || skate || sport) for (const reg of c.regs) sideWall(c, reg, surf ? 'boards' : 'shelf', surf ? 16 : 14, surf ? 46 : 34, surf ? { g: G.surf } : { c: '#4a4a50', g: G.sport, gk: 'shoes', ns: true });
  if (a) aisles(c, a, 12, 30, (x0, y, x1, y1, n) => (n === 1 ? put(c, 'table', x0 + 6, y - 2, Math.min(x1, x0 + 50), y1 + 2, 18, { c: '#8a6440', g, folded: true }) : put(c, 'rack', x0, y, Math.min(x1, x0 + 70), y1, 26, { c: '#a8aab0', g })));
  if (b) {
    if (sport) { put(c, 'pile', b.x0, b.y0, Math.min(b.x1, b.x0 + 30), b.y0 + 20, 18, { g: ['#f07a2a', '#e8e8e8', '#2a5ab0', '#8a5a3a'], balls: true }); const q = corner(b, 34, 16, true); put(c, 'machine', ...q, 20, { k: 'bike' }); }
    else for (let k = 0; k < 2; k++) { const x = b.x0 + 6 + k * 22; put(c, 'mannequin', x, b.y1 - 12, x + 12, b.y1 - 2, 42, { c: pick(r, g), c2: pick(r, g), plinth: true }); }
    if (b.y1 - b.y0 > 50) put(c, 'rack', b.x0, b.y0 + (sport ? 30 : 0), Math.min(b.x1, b.x0 + 70), b.y0 + (sport ? 42 : 12), 26, { c: '#a8aab0', g });
  }
  put(c, 'rug', c.dc - 30, c.Ya + STRIP + 4, c.dc + 30, Math.min(c.Yb - 20, c.Ya + STRIP + 50), 1, { c: surf ? '#c8b080' : skate ? '#7a2a2a' : '#c8b8a0', c2: surf ? '#2a6a9a' : '#3a3a40', flat: true });
  fill(c, [
    K([30, 30], (c, x0, y0, x1, y1, gp) => put(c, 'roundrack', x0, y0, x1, y1, 26, { g }, gp)),
    K([44, 20], (c, x0, y0, x1, y1, gp) => put(c, 'table', x0, y0, x1, y1, 18, { c: '#8a6440', g, folded: true }, gp)),
    K([16, 12], (c, x0, y0, x1, y1, gp) => put(c, 'mannequin', x0, y0, x1, y1, 42, { c: pick(c.r, g), c2: pick(c.r, g), plinth: true }, gp)),
    ...(sport ? [K([30, 20], (c, x0, y0, x1, y1, gp) => put(c, 'pile', x0, y0, x1, y1, 18, { g: ['#f07a2a', '#e8e8e8', '#2a5ab0', '#8a5a3a'], balls: true }, gp)), K([34, 16], (c, x0, y0, x1, y1, gp) => put(c, 'machine', x0, y0, x1, y1, 20, { k: 'bike' }, gp))] : []),
    K([14, 14], (c, x0, y0, x1, y1, gp) => put(c, 'spinner', x0, y0, x1, y1, 32, { g: ['#2a2a2e', '#e8c040', '#5aa0d0', '#d83a3a'], gk: 'shades' }, gp)),
    K([52, 14], (c, x0, y0, x1, y1, gp) => put(c, 'rack', x0, y0, x1, y1, 26, { c: '#a8aab0', g }, gp)),
    K([12, 10], (c, x0, y0, x1, y1, gp) => put(c, 'plant', x0, y0, x1, y1, surf ? 30 : 20, { palm: surf }, gp)),
  ]);
  lamp(c, c.tillX, c.Ya - 6, 46, WARM, 0.8);
  for (const reg of c.regs) lamp(c, (reg.x0 + reg.x1) / 2, (reg.y0 + reg.y1) / 2, 50, WARM, 0.7);
  waiting(c);
};
FIT.sports = (c) => FIT.boutique(c, true);
FIT.tackle = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.wood); R.wall = pick(r, W.gun);
  R.counter = { top: '#6a4630', front: '#3a5a3a', trim: '#c8a050', k: 'plain', on: ['jar'] };
  wall(c, 'rods', c.X0 + 6, c.X1 - 6, 4, 48, { g: G.tackle });
  wall(c, 'fish', c.X1 - 46, c.X1 - 10, 52, 66);
  sign(c, pick(r, ['BAIT', 'TACKLE', 'LIVE BAIT']), pick(r, ['#5ae8ff', '#ffd24a', '#7aff7a']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 14, 28, (x0, y, x1, y1) => put(c, 'shelf', x0, y, x1, y1, 22, { c: '#6a4a30', g: G.tackle, gk: 'tackle' }));
  if (b) {
    const q = corner(b, 26, 14, false); put(c, 'machine', q[0], b.y0, q[2], b.y0 + 14, 22, { k: 'tank' }); put(c, 'pile', b.x0, b.y0 + 24, Math.min(b.x1, b.x0 + 40), b.y0 + 42, 16, { g: ['#e8e8e8', '#3a7ad8', '#d83a3a'], boxes: true });
  }
  fill(c, [
    K([26, 14], (c, x0, y0, x1, y1, g) => put(c, 'machine', x0, y0, x1, y1, 22, { k: 'tank' }, g)),
    K([22, 14], (c, x0, y0, x1, y1, g) => put(c, 'pile', x0, y0, x1, y1, 16, { g: ['#e8e8e8', '#3a7ad8', '#d83a3a'], boxes: true }, g)),
    K([22, 16], (c, x0, y0, x1, y1, g) => put(c, 'barrel', x0, y0, x1, y1, 20, { c: '#3a6a8a' }, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 6, 44, WARM, 0.7);
  waiting(c);
};
FIT.fishmarket = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.green); R.wall = pick(r, W.white);
  R.counter = { top: '#eef4f6', front: '#2a6a8a', trim: '#d4d8de', k: 'ice', on: ['scale'] };
  wall(c, 'board', c.tillX - 30, c.tillX + 30, 24, 48);
  wall(c, 'fish', c.X0 + 14, c.X0 + 50, 30, 46);
  sign(c, pick(r, ['FRESH FISH', 'CATCH', 'OYSTERS']), '#5ae8ff');
  for (const reg of c.regs) aisles(c, reg, 18, 24, (x0, y, x1, y1) => put(c, 'ice', x0, y, Math.min(x1, x0 + 80), y1, 16, { c: '#d8dcde' }));
  if (c.regs[0]) { const q = corner(c.regs[0], 26, 14, true); put(c, 'machine', ...q, 22, { k: 'lobster' }); }
  fill(c, [
    K([36, 18], (c, x0, y0, x1, y1, g) => put(c, 'ice', x0, y0, x1, y1, 16, { c: '#d8dcde' }, g)),
    K([20, 16], (c, x0, y0, x1, y1, g) => put(c, 'crates', x0, y0, x1, y1, 16, { g: ['#2a6a8a', '#e8e8e8', '#3a8a5a'] }, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 6, 50, COOL, 0.7);
  waiting(c);
};
// the bars: the counter with its taps and the lit bottles behind, stools along it - then by kind (IN5): the cocktail
// lounge's velvet booths and candlelit cocktail tables on blue carpet; the tavern's stone fireplace, long tables with
// benches, barrels and lanterns; the sports bar's TV wall and dartboard, the pool table under its lamp, red booths, the
// jukebox. The club's dance floor.
function barBase(c, club, saloon) {
  const { R, r } = c;
  const lounge = R.plan === 'lounge';
  R.counter = { top: lounge ? '#e8e4dc' : '#3a2418', front: club ? '#1c1a24' : lounge ? '#1c2038' : '#5a3a24', trim: '#c8a050', k: 'bar', on: ['taps'] };
  wall(c, 'bottles', c.X0 + 6, c.X1 - 6, 6, 48, { g: G.bottles, lit: true });
  const sc = club ? '#e84aa8' : lounge ? '#c8283a' : '#8a2a26';
  for (let x = c.X0 + 12; x < c.X1 - 12; x += 18) if (Math.abs(x - c.tillX) > 30 && (x < c.dx - 14 || x > c.dx + c.dw + 14)) { R.pieces.push({ t: 'stool', x0: x - 4, y0: c.Ya + 1, x1: x + 4, y1: c.Ya + 9, h: 14, c: sc }); if (r() < 0.22) shopper(c, x, c.Ya + 6, -Math.PI / 2, 'sit'); }
}
// a table and its chairs (round or square, by kind), two or four seats
function seated(c, x0, y0, x1, y1, gap, o) {
  const p = put(c, 'tableset', x0, y0, x1, y1, o.h ?? 18, o, gap);
  if (p && c.r() < 0.45) shopper(c, x0 + 3, (y0 + y1) / 2, 0, 'sit');
  return p;
}
FIT.lounge = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.lounge); R.wall = pick(r, W.lounge);
  barBase(c);
  wall(c, 'martini', c.X0 + 14, c.X0 + 40, 50, 74);
  sign(c, pick(r, ['COCKTAILS', 'LOUNGE', 'MARTINIS', 'JAZZ']), pick(r, ['#ff6ab0', '#ffd24a', '#9a7aff']), undefined, 'neon');
  for (const x of [c.X0 + 52, c.X1 - 22]) wall(c, 'sconce', x, x + 6, 40, 50);
  for (const reg of c.regs) {
    const v = sideWall(c, reg, 'velvet', 16, 18, { c: '#a8202a' });
    if (v && r() < 0.6) shopper(c, v.side < 0 ? v.x1 + 4 : v.x0 - 4, (v.y0 + v.y1) / 2, v.side < 0 ? 0 : Math.PI, 'sit');
  }
  fill(c, [
    K([26, 22], (c, x0, y0, x1, y1, g) => seated(c, x0, y0, x1, y1, g, { round: true, c: '#2a2a30', c2: '#5a3a26', candle: true, chairs: '#5a3a26' })),
    K([36, 16], (c, x0, y0, x1, y1, g) => put(c, 'velvet', x0, y0, x1, y1, 18, { c: '#a8202a', curved: true }, g)),
    K([14, 12], (c, x0, y0, x1, y1, g) => put(c, 'plant', x0, y0, x1, y1, 28, { big: true }, g)),
  ], { gap: 12 });
  for (const p of R.pieces) if (p.t === 'tableset') lamp(c, (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 22, [255, 190, 110], 0.9);
  lamp(c, c.tillX, c.Ya - 10, 60, [255, 200, 130], 1);
};
FIT.tavern = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.tavern); R.wall = pick(r, W.tavern);
  barBase(c);
  const fx = c.tillX + (r() < 0.5 ? -1 : 1) * Math.min(90, c.W / 4);
  if (c.W >= 180) { wall(c, 'fireplace', fx - 26, fx + 26, 0, 58); wall(c, 'head', fx - 12, fx + 12, 60, 78); }
  wall(c, 'chalk', c.X0 + 10, c.X0 + 40, 30, 50);
  sign(c, pick(r, ['ALES', 'TAVERN', 'ON TAP', 'OPEN']), '#e8c870', undefined, 'serif');
  for (const x of [c.X0 + 50, c.X1 - 26]) wall(c, 'lantern', x, x + 8, 40, 52);
  const [a, b] = c.regs;
  for (const reg of [a, b]) if (reg) aisles(c, reg, 30, 22, (x0, y, x1, y1) => { const w = Math.min(x1 - x0, 80), x = reg.side > 0 ? x1 - w : x0; const p = put(c, 'longtable', x, y, x + w, y1, 18, { c: '#6a4630' }); if (p && r() < 0.6) shopper(c, x + 12, y + 3, Math.PI / 2, 'sit'); return p; });
  fill(c, [
    K([18, 16], (c, x0, y0, x1, y1, g) => put(c, 'barrel', x0, y0, x1, y1, 22, { c: '#7a5434' }, g)),
    K([30, 22], (c, x0, y0, x1, y1, g) => seated(c, x0, y0, x1, y1, g, { round: false, c: '#6a4630', c2: '#4a3020', chairs: '#5a3a24', mugs: true })),
    K([40, 26], (c, x0, y0, x1, y1, g) => put(c, 'rug', x0, y0, x1, y1, 1, { c: '#7a2a24', c2: '#c8a050', flat: true }, g)),
  ], { gap: 12 });
  if (c.W >= 180) { lamp(c, fx, c.Ya + 4, 70, [255, 150, 70], 1.1); }
  for (const p of R.pieces) if (p.t === 'longtable') lamp(c, (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 30, WARM, 0.8);
  lamp(c, c.tillX, c.Ya - 10, 50, WARM, 0.9);
};
FIT.sportsbar = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.sports); R.wall = pick(r, W.sports);
  barBase(c);
  const tvn = Math.max(1, Math.min(4, Math.floor((c.W - 80) / 60)));
  for (let i = 0; i < tvn; i++) { const x = c.tillX - (tvn * 46) / 2 + i * 46; wall(c, 'screen', x, x + 40, 52, 76, { k: i }); }
  wall(c, 'dartboard', c.X1 - 34, c.X1 - 14, 30, 50);
  if (c.W >= 200) wall(c, 'pennant', c.X0 + 12, c.X0 + 40, 30, 46);
  const [a, b] = c.regs;
  let pool = null;
  if (a && a.x1 - a.x0 >= 110 && a.y1 - a.y0 >= 60) { const x = a.side < 0 ? a.x0 + 10 : a.x1 - 110; pool = put(c, 'pool', x, a.y0 + 6, x + 100, a.y0 + 58, 20, { c: '#5a3a24', c2: pick(r, ['#2f7a4a', '#2a4a8a']) }); if (pool) shopper(c, x + 50, a.y0 + 66, -Math.PI / 2); }
  for (const reg of [a, b]) if (reg) { const v = sideWall(c, reg, 'booth', 44, 22, { c: '#8a2a26', run: true }); if (v && r() < 0.6) shopper(c, v.side < 0 ? v.x0 + 8 : v.x1 - 8, (v.y0 + v.y1) / 2, v.side < 0 ? 0 : Math.PI, 'sit'); }
  if (b) { const q = corner(b, 22, 14, true); put(c, 'machine', ...q, 34, { k: 'jukebox' }); }
  fill(c, [
    K([22, 22], (c, x0, y0, x1, y1, g) => seated(c, x0, y0, x1, y1, g, { round: true, high: true, c: '#3a2a20', c2: '#2a2a2e', chairs: '#2a2a2e', mugs: true, h: 24 })),
    K([22, 14], (c, x0, y0, x1, y1, g) => put(c, 'machine', x0, y0, x1, y1, 38, { k: 'arcade' }, g)),
  ], { gap: 12 });
  if (pool) lamp(c, (pool.x0 + pool.x1) / 2, (pool.y0 + pool.y1) / 2, 56, [255, 220, 150], 1.1);
  lamp(c, c.tillX, c.Ya - 10, 56, WARM, 0.9);
};
FIT.club = (c) => {
  const { R, r } = c;
  R.floor = pick(r, [['dance', '#1c1a24', '#2a2434']]); R.wall = pick(r, W.club);
  barBase(c, true);
  sign(c, pick(r, ['DANCE', 'VIP', 'LIVE DJ', 'NIGHTS']), pick(r, ['#ff4ab0', '#5ae8ff', '#ffd24a', '#9a7aff']));
  put(c, 'dance', c.X0 + 16, c.Ya + 2 * c.TILE, c.X1 - 16, c.Yb - c.TILE, 1, { g: ['#ff4ab0', '#5ae8ff', '#ffd24a', '#9a7aff'], flat: true });
  for (const reg of c.regs) sideWall(c, reg, 'velvet', 14, 18, { c: '#5a1e6a' });
  lamp(c, (c.X0 + c.X1) / 2, (c.Ya + c.Yb) / 2, 80, [255, 90, 200], 0.8);
};
// MC4: the bar of bottles under the neon bull skull and the motorbike mounted on the wall; the jukebox, the booths along
// the side wall, the arm-wrestling table in the middle, the pool table on its rugs under a green lamp, the card table,
// barrels, the wood stove, the dartboard. A big room (The Rusty Spur): statics.js roadhouseRoom draws the floor's MC4
// pieces itself - the plan lists them where it puts them (ext) so the customers stand clear of them.
FIT.saloon = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.saloon); R.wall = pick(r, W.saloon);
  barBase(c, false, true);
  wall(c, 'skull', c.X0 + 12, c.X0 + 52, 50, 76);
  if (c.W >= 220) wall(c, 'motorbike', c.tillX - 36, c.tillX + 36, 52, 78);
  wall(c, 'chalk', c.X1 - 46, c.X1 - 14, 26, 48, { text: 'COLD BEER' });
  sign(c, 'RIDE DRINK REPEAT', '#ffb04a', c.X1 - 70, 'block');
  const big = c.W - 72 >= 300 && (c.Yb - 6) - (c.cy + 44) >= 60;
  if (big) {   // (as statics.js roadhouseRoom lays it out over the unit)
    const Ya = c.cy + 44, Yb = c.Yb - 6, mid = (Ya + Yb) / 2, x0 = c.X0 + 36, W = c.W - 72, ext = (t, a, b, cc, d, h) => put(c, t, a, b, cc, d, h, { ext: true }, 0);
    for (const by of [Ya, mid + 6]) ext('booth', x0, by, x0 + 30, by + 36, 18);
    ext('machine', x0 + 52, Ya, x0 + 74, Ya + 14, 34);
    ext('pool', x0 + W * 0.3, mid - 22, x0 + W * 0.3 + 100, mid + 30, 20);
    ext('table', x0 + W * 0.62 - 14, mid - 12, x0 + W * 0.62 + 42, mid + 12, 22);
    ext('tableset', x0 + W * 0.8 - 6, Ya - 8, x0 + W * 0.8 + 70, Yb, 30);
    lamp(c, x0 + W * 0.3 + 50, mid + 4, 60, [200, 255, 170], 1);
    lamp(c, x0 + W * 0.8 + 36, mid, 44, WARM, 0.9);
  } else {
    const [a, b] = c.regs;
    if (a) { const v = sideWall(c, a, 'booth', 44, 22, { c: '#7a2a26', run: true }); if (v && r() < 0.6) shopper(c, v.side < 0 ? v.x0 + 8 : v.x1 - 8, (v.y0 + v.y1) / 2, v.side < 0 ? 0 : Math.PI, 'sit'); }
    let pool = null;
    for (const reg of c.regs) if (!pool && reg.x1 - reg.x0 >= 104 && reg.y1 - reg.y0 >= 60) { const x = reg.side < 0 ? reg.x0 + 2 : reg.x1 - 102; put(c, 'rug', x - 4, reg.y0 + 2, x + 104, reg.y0 + 62, 1, { c: '#8a2a24', c2: '#c8a050', flat: true }); pool = put(c, 'pool', x, reg.y0 + 6, x + 100, reg.y0 + 58, 20, { c: '#5a3a24', c2: '#2f7a4a' }); }
    if (pool) lamp(c, (pool.x0 + pool.x1) / 2, (pool.y0 + pool.y1) / 2, 56, [200, 255, 170], 1);
    const mid = c.regs.find((q) => q !== a) || a;
    if (mid) { const p = put(c, 'armwrestle', mid.x0 + 4, mid.y0 + 4, mid.x0 + 50, mid.y0 + 28, 18, { c: '#5a3a24' }, 12); if (p) { shopper(c, p.x0 + 4, p.y0 + 12, 0); shopper(c, p.x1 - 4, p.y0 + 12, Math.PI); } }
    if (b) { const q = corner(b, 22, 14, true); put(c, 'machine', ...q, 34, { k: 'jukebox' }); }
  }
  fill(c, [
    K([18, 16], (c, x0, y0, x1, y1, g) => put(c, 'barrel', x0, y0, x1, y1, 22, { c: '#6a4a30' }, g)),
    K([30, 26], (c, x0, y0, x1, y1, g) => seated(c, x0, y0, x1, y1, g, { round: true, c: '#5a3a24', c2: '#2a5a3a', chairs: '#5a3a24', cards: true })),
    K([16, 16], (c, x0, y0, x1, y1, g) => put(c, 'stove', x0, y0, x1, y1, 30, {}, g)),
    K([36, 26], (c, x0, y0, x1, y1, g) => put(c, 'rug', x0, y0, x1, y1, 1, { c: '#8a2a24', c2: '#c8a050', flat: true }, g)),
  ], { gap: 12 });
  lamp(c, c.tillX, c.Ya - 10, 56, WARM, 1);
};
FIT.office = (c) => {
  const { R, r } = c, nm = c.name;
  const inn = /\b(INN|HOTEL|MOTEL|LODGE|HOSTEL)\b/.test(nm), optic = /OPTIC|EYE|VISION/.test(nm), cash = /CASH|LOAN|PAWN|CHECK/.test(nm), travel = /TRAVEL|TOUR/.test(nm);
  R.floor = pick(r, inn ? F.posh : F.wood.concat(F.lino.slice(3))); R.wall = pick(r, inn ? W.posh : W.pastel.concat(W.white));
  R.counter = { top: inn ? '#e8e4dc' : '#d8d4cc', front: R.wall[2], trim: inn ? '#c8a050' : null, k: cash ? 'teller' : 'plain', on: inn ? ['bell', 'pens'] : ['pens'] };
  if (inn) { wall(c, 'keys', c.tillX - 30, c.tillX + 30, 18, 46); wall(c, 'clock', c.tillX - 50, c.tillX - 36, 36, 50); }
  else if (optic) { wall(c, 'frames', c.X0 + 6, c.X1 - 6, 10, 46); }
  else if (travel) { const n = Math.max(1, Math.floor((c.W - 12) / 40)); for (let i = 0; i < n; i++) { const x = c.X0 + 6 + (i + 0.5) * ((c.W - 12) / n); wall(c, 'poster', x - 13, x + 13, 18, 46); } }
  else { wall(c, 'files', c.X0 + 6, c.X0 + Math.min(70, c.W / 3), 0, 34); wall(c, 'clock', c.tillX - 7, c.tillX + 7, 36, 50); }
  sign(c, inn ? 'RECEPTION' : optic ? 'EYE EXAMS' : cash ? 'CASH NOW' : travel ? 'FLY AWAY' : pick(r, ['OPEN', 'WELCOME']), inn ? '#ffd88a' : pick(r, ['#5ae8ff', '#ffd24a', '#ff6ab0']), undefined, inn ? 'serif' : 'civic');
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
  fill(c, [
    K([40, 16], (c, x0, y0, x1, y1, g) => put(c, 'sofa', x0, y0, x1, y1, 16, { c: pick(c.r, ['#3a62a8', '#6a2a2a', '#3a6a4a']) }, g)),
    K([30, 30], (c, x0, y0, x1, y1, g) => put(c, 'rug', x0, y0, x1, y1, 1, { c: '#2a3a5a', c2: '#c8a050', flat: true }, g)),
    K([12, 10], (c, x0, y0, x1, y1, g) => put(c, 'plant', x0, y0, x1, y1, 22, {}, g)),
    K([44, 18], (c, x0, y0, x1, y1, g) => put(c, 'desk', x0, y0, x1, y1, 18, { c: '#5a3a26' }, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 6, 46, WARM, 0.8);
  waiting(c);
};
// the record shop (its counter: server music.js): sleeves up the wall, guitars hung, crates of vinyl, a booth, a jukebox
FIT.records = (c) => {
  const { R, r } = c;
  R.floor = pick(r, F.wood.concat(F.dark.slice(0, 2))); R.wall = pick(r, W.bar.concat(W.pastel.slice(0, 2)));
  R.counter = { top: '#2a2a2e', front: R.wall[2], trim: '#c8a050', k: 'plain', on: ['jar', 'bags'] };
  wall(c, 'goods', c.X0 + 6, c.tillX - 38, 4, 48, { g: G.sleeves, gk: 'sleeves' });
  wall(c, 'guitars', c.tillX + 38, c.X1 - 6, 4, 48, { g: ['#c8742a', '#d8343a', '#2a2a2e', '#e8c040', '#5aa0d0'] });
  sign(c, pick(r, ['VINYL', 'RECORDS', 'TAPES', 'MUSIC']), pick(r, ['#ff6ab0', '#5ae8ff', '#ffd24a', '#7aff7a']));
  const [a, b] = c.regs;
  if (a) aisles(c, a, 14, 26, (x0, y, x1, y1) => put(c, 'bins', x0, y, x1, y1, 12, { c: '#5a3a24', g: G.sleeves, sleeves: true }));
  if (b) {
    if (b.x1 - b.x0 >= 46 && b.y1 - b.y0 >= 26) { const q = corner(b, 46, 24, false); put(c, 'booth', q[0], b.y0, q[2], b.y0 + 24, 22, { c: pick(r, ['#8a2a26', '#2a4a3a', '#3a2a4a']) }); }
    const q = corner(b, 22, 16, true); put(c, 'machine', ...q, 30, { k: 'jukebox' });
    if (b.y1 - b.y0 > 60) put(c, 'bins', b.x0, b.y0 + 34, Math.min(b.x1, b.x0 + 70), b.y0 + 48, 12, { c: '#5a3a24', g: G.sleeves, sleeves: true });
  }
  fill(c, [
    K([46, 14], (c, x0, y0, x1, y1, g) => put(c, 'bins', x0, y0, x1, y1, 12, { c: '#5a3a24', g: G.sleeves, sleeves: true }, g)),
    K([30, 30], (c, x0, y0, x1, y1, g) => put(c, 'rug', x0, y0, x1, y1, 1, { c: '#3a2a4a', c2: '#ff6ab0', flat: true }, g)),
    K([14, 14], (c, x0, y0, x1, y1, g) => put(c, 'spinner', x0, y0, x1, y1, 30, { g: G.sleeves, gk: 'sleeves' }, g)),
  ]);
  lamp(c, c.tillX, c.Ya - 6, 46, WARM, 0.8);
  waiting(c); waiting(c);
};
for (const k of PLANS) if (!FIT[k]) throw new Error('shoprooms: no fit-out for ' + k);
