// World v3's suburbs' kit (the handcrafted suburbs: Cedar Falls, shared/world3-cedarfalls.js), from West Hills' middle
// (shared/world3-westhills2.js, where these were first written): the rows of houses along streets that bend - fronts
// with their lawns, drives, mailboxes and trees, or back yards to the camera with their patios, pools and fences - and
// the public pool with its lanes (o.trees: the species a row's trees are drawn from - Pine Hills' pines; o.art(x, y, w):
// a row's houses' own look - Coral Cay's painted stucco).
// makeSuburb(m, K, out) -> the composers, bound to a plan's kit.
import { TILE, T } from './constants.js';

export function makeSuburb(m, K, out) {
  const { rnd, pick, prop } = K;
  const place = (name, x0, y0, x1, y1) => (out.places ||= []).push({ name, x0, y0, x1, y1 });
  // the free ground of a block between streets, read along its middle row and column -> [x0, y0, x1, y1] (exclusive)
  const area = (xa, ya, xb, yb) => {
    const my = Math.round((ya + yb) / 2), mx = Math.round((xa + xb) / 2);
    let x0 = xa, x1 = xb, y0 = ya, y1 = yb;
    while (x0 < x1 && !K.free(x0, my)) x0++;
    while (x1 > x0 && !K.free(x1 - 1, my)) x1--;
    while (y0 < y1 && !K.free(mx, y0)) y0++;
    while (y1 > y0 && !K.free(mx, y1 - 1)) y1--;
    return x1 - x0 >= 4 && y1 - y0 >= 4 ? [x0, y0, x1, y1] : null;
  };
  const pool = (px0, py0, pw, ph) => {
    K.paint(px0 - 1, py0 - 1, pw + 2, ph + 2, T.PLAZA);
    for (let yy = py0; yy < py0 + ph; yy++) for (let xx = px0; xx < px0 + pw; xx++) m.set(xx, yy, T.WATER);
    (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
    out.pools++;
  };
  const fence = (kind, x0, y0, x1, y1) => prop('fenceline', x0, y0, 0, { kind, tx: Math.round((x1 - x0) * TILE), ty: Math.round((y1 - y0) * TILE) });
  const chain = (x0, y0, x1, y1) => prop('chainfence', x0, y0, 0, { tx: Math.round((x1 - x0) * TILE), ty: Math.round((y1 - y0) * TILE) });
  const TREES = ['maple', 'oak', 'birch', 'flowerTree', 'redMaple', 'cherry', 'magnolia'];
  const tree = (x, y, k = 610, sp = null) => prop(rnd(x, y, k) < 0.5 ? 'tree_a' : 'tree_b', x, y, 10, { sp: sp || pick(TREES, rnd(x, y, k + 1)), k: 1.05 + rnd(x, y, k + 2) * 0.2 });

  // ---- a row of houses facing south onto the street below it, along a street that bends: each column's front is the
  // street's pavement there (the southmost free tile at or above yMax), the house stands `setback` behind the lowest of its
  // columns' fronts; its lawn, the drive down to the kerb, the mailbox, a tree (WC008)
  const frontRow = (x0, x1, y0, yMax, o = {}) => {
    const sb = o.setback ?? 4, E = new Map();
    const edge = (x) => { if (!E.has(x)) { const c = K.column(x, y0, yMax, o.mask); E.set(x, c ? c[0] : -1); } return E.get(x); };
    const mask = (x, y) => (!o.mask || o.mask(x, y)) && y <= edge(x) - sb;
    const made = K.row(x0, x1, y0, yMax, (x, room, i) => {
      if (room < 9) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (i % 2 === 1) return { gap: 2 + Math.floor(rnd(x, y0, 601) * 2), kind: 'garden' };
      const w = Math.min(room, (o.w || 10) + Math.floor(rnd(x, y0, 602) * 4));
      out.homes++;
      return { w, depth: o.depth || 8 + Math.floor(rnd(x, y0, 603) * 2), minDepth: 7, arch: 'house', home: { kind: 'house', price: o.price || 30000 + Math.floor(rnd(x, y0, 604) * 6) * 3000 }, whole: true, ...(o.art ? { art: o.art(x, y0, w) } : {}) };
    }, { mask, noStep: true, fallback: 'garden' });
    for (const b of made) {
      if (!b || b.gap || b.tw === undefined) continue;
      const yb = b.ty + b.th;
      let yf = 1e9;
      for (let xx = b.tx; xx < b.tx + b.tw; xx++) if (edge(xx) >= yb) yf = Math.min(yf, edge(xx));
      if (yf === 1e9) continue;
      for (let xx = b.tx - 1; xx < b.tx + b.tw + 1; xx++) { const e = edge(xx); for (let yy = yb; yy <= e; yy++) if (K.free(xx, yy)) K.take(xx, yy, 1, 1); }
      const deep = yf - yb + 1;
      if (deep < 2) continue;
      const east = rnd(b.tx, yb, 605) < 0.5, dx = east ? b.tx + b.tw - 3 : b.tx;
      for (let xx = dx; xx < dx + 3; xx++) K.paint(xx, yb, 1, Math.max(1, edge(xx) - yb + 1), T.LOT);
      const home = m.homes.find((h) => h.b === b.id);
      if (home) home.garage = { x: (dx + 1.5) * TILE, y: (yb + Math.min(deep, 3) - 0.5) * TILE, a: Math.PI / 2 };
      prop('mailbox', east ? dx - 0.6 : dx + 3.6, edge(east ? dx : dx + 2) + 0.4, 4);
      if (deep >= 4) tree(east ? b.tx + 2 : b.tx + b.tw - 2, yb + deep / 2, 606, o.trees ? pick(o.trees, rnd(b.tx, yb, 607)) : null);
      if (rnd(b.tx, yb, 608) < 0.45) prop(pick(['flowers_a', 'shrub_a', 'bush_c', 'flowers_big'], rnd(b.tx, yb, 609)), b.tx + b.tw / 2, yb + 0.8, 0);
    }
    return made;
  };
  // ---- a row of houses facing north onto the street above it (their doors there): their back yards behind them to the
  // south where the camera sees them - the lawn, the patio, a pool now and then with its lounger, the fence round, a tree
  const backRow = (x0, x1, y0, y1, o = {}) => {
    const made = K.row(x0, x1, y0, y1, (x, room, i) => {
      // (the gaps between them only as deep as a house and its yard: the row facing the next street south has the rest)
      const gd = 9 + (o.yard || 12);
      if (room < 9) return room >= 1 ? { gap: room, kind: 'garden', depth: gd } : null;
      if (i % 2 === 1) return { gap: 2 + Math.floor(rnd(x, y0, 611) * 2), kind: 'garden', depth: gd };
      const w = Math.min(room, (o.w || 10) + Math.floor(rnd(x, y0, 612) * 4));
      out.homes++;
      return { w, depth: 8 + Math.floor(rnd(x, y0, 613) * 2), minDepth: 7, arch: 'house', face: 'N', home: { kind: 'house', price: o.price || 32000 + Math.floor(rnd(x, y0, 614) * 6) * 3000, garage: { x: (x + w / 2) * TILE, y: (y0 - 1) * TILE, a: -Math.PI / 2 } }, whole: true, ...(o.art ? { art: o.art(x, y0, w) } : {}) };
    }, { north: true, mask: o.mask, fallback: 'garden' });
    for (const b of made) {
      if (!b || b.gap || b.tw === undefined) continue;
      const yb = b.ty + b.th, x = b.tx - 1, w = b.tw + 2;
      let deep = 0;
      while (deep < (o.yard || 12) && K.free(b.tx + 1, yb + deep) && (!o.mask || o.mask(b.tx + 1, yb + deep))) deep++;
      for (let yy = yb; yy < yb + deep; yy++) for (let xx = x; xx < x + w; xx++) if (K.free(xx, yy) && (!o.mask || o.mask(xx, yy))) K.take(xx, yy, 1, 1);
      if (deep < 4) continue;
      K.paint(b.tx + 1, yb, Math.min(5, b.tw - 2), 2, T.PLAZA);   // (the patio)
      prop('patio', b.tx + 3.5, yb + 1, 0);
      const pw = Math.min(b.tw - 4, 7), r = rnd(b.tx, yb, 615);
      if (deep >= 8 && pw >= 4 && r < (o.pools ?? 0.4)) {
        pool(b.tx + 2, yb + 3, pw, 3);
        prop('lounger', b.tx + 2.6, yb + 6.6, 0, { v: Math.floor(r * 8), a: -Math.PI / 2 });
      } else if (deep >= 6) prop(pick(['picnic', 'hammock', 'raisedbed', 'picnic'], rnd(b.tx, yb, 616)), b.tx + b.tw / 2, yb + deep - 2.5, 0);
      fence(o.fence || 'picket', x + 0.2, yb + deep - 0.4, x + w - 0.2, yb + deep - 0.4);
      fence('picket', x + 0.2, yb, x + 0.2, yb + deep - 0.4);
      tree(b.tx + b.tw - 1.5, yb + deep - 2, 617, pick(o.trees || ['maple', 'oak', 'birch', 'cherry'], rnd(b.tx, yb, 618)));
    }
    return made;
  };
  // where a street that bends is at x (its points)
  const along = (P, x) => { for (let j = 1; j < P.length; j++) { const [ax, ay] = P[j - 1], [bx, by] = P[j]; if (x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && ax !== bx) return ay + (by - ay) * (x - ax) / (bx - ax); } return P[P.length - 1][1]; };
  const below = (P, gap) => (x, y) => y >= along(P, x) + gap, above = (P, gap) => (x, y) => y <= along(P, x) - gap;
  const both = (...f) => (x, y) => f.every((g) => g(x, y));


  // ---- a public pool (the Stadium Lido's model): fenced on the tile lines [fx0, fx1) x [fy0, fy1) with the changing
  // block along the north side, four lanes, the deep end and the springboard, the deck's loungers, the gate south
  const lido = (fx0, fy0, fx1, fy1, name) => {
    const y0 = fy0 - 1;
    if (!K.allFree(fx0 - 1, y0, fx1 - fx0 + 2, fy1 - y0 + 1)) return false;
    K.take(fx0 - 1, y0, fx1 - fx0 + 2, fy1 - y0 + 2);
    K.paint(fx0, fy0, fx1 - fx0, fy1 - fy0, T.PLAZA);
    const bw = 12, bx0 = fx0 + 1, by0 = fy0, bd = 2;
    for (let ty = by0; ty < by0 + bd; ty++) for (let tx = bx0; tx < bx0 + bw; tx++) m.set(tx, ty, T.WALL);
    prop('poolhouse', bx0 + bw / 2, by0 + bd / 2 - 0.25, 0, { w: bw * TILE, d: bd * TILE - 4 });
    const qx0 = fx0 + 3, qy0 = by0 + bd + 3, pw = 24, ph = 7, dw = 6;
    for (let ty = qy0; ty < qy0 + ph; ty++) for (let tx = qx0; tx < qx0 + pw; tx++) m.set(tx, ty, tx >= qx0 + pw - dw ? T.DEEP : T.WATER);
    (m.pools ||= []).push({ x: qx0 * TILE, y: qy0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 4, deep: { x: (qx0 + pw - dw) * TILE, y: qy0 * TILE, w: dw * TILE, h: ph * TILE }, deck: { x: fx0 * TILE, y: fy0 * TILE, w: (fx1 - fx0) * TILE, h: (fy1 - fy0) * TILE } });
    out.pools++;
    const lx = qx0 + (pw - dw) / 2;
    for (let k = 1; k < 4; k++) prop('lanerope', lx, qy0 + ph * k / 4, 0, { len: (pw - dw) * TILE - 8 });
    prop('lanerope', qx0 + pw - dw, qy0 + ph / 2, 0, { len: ph * TILE - 8, a: Math.PI / 2 });
    prop('diveboard', qx0 + pw + 0.9, qy0 + ph / 2, 10, { a: Math.PI, len: 64 });
    prop('lguard', qx0 - 1.2, qy0 + ph - 1, 14, { a: 0 });
    let k = 0;
    for (let x = bx0 + bw + 1.2; x < fx1 - 4.5; x += 1.5, k++) { if (k % 3 === 2) prop(k % 2 ? 'umbrella_b' : 'umbrella_r', x, qy0 - 1.3, 4); else prop('lounger', x, qy0 - 1.1, 6, { a: Math.PI / 2, v: k % 4 }); }
    prop('hottub', fx1 - 2.3, by0 + 1.9, 26, { r: 30 });
    for (let x = qx0 + 1.5, j = 0; x < qx0 + pw - dw - 1; x += 1.6, j++) { if (j % 3 === 1) prop(j % 2 ? 'umbrella_r' : 'umbrella_b', x, qy0 + ph + 1.1, 4); else prop('lounger', x, qy0 + ph + 0.95, 6, { a: -Math.PI / 2, v: (j + 2) % 4 }); }
    for (const [dx, dy] of [[0.9, 0.6], [2.6, 0.9]]) prop('cafetable', bx0 + dx, by0 + bd + dy, 6);
    prop('umbrella_g', bx0 + 1.7, by0 + bd + 0.6, 4);
    for (const [tx, ty] of [[fx0 + 0.6, fy1 - 0.7], [fx1 - 0.6, fy1 - 0.7]]) prop('potted', tx, ty, 6);
    prop('chalkboard', bx0 + bw * 0.3, by0 + bd + 0.35, 0);
    const gx = Math.round((fx0 + fx1) / 2);
    for (const [ax, ay, bx, by] of [[fx0, fy0, fx1, fy0], [fx0, fy0, fx0, fy1], [fx1, fy0, fx1, fy1], [fx0, fy1, gx - 1, fy1], [gx + 1, fy1, fx1, fy1]]) {
      chain(ax, ay, bx, by);
      const L = Math.hypot(bx - ax, by - ay) * TILE;
      for (let d = 0; d <= L; d += 16) m.addSolidProp((ax + (bx - ax) * d / L) * TILE, (ay + (by - ay) * d / L) * TILE, 7);
    }
    prop('hedgerun', fx0 - 0.55, fy0 + 0.5, 0, { tx: 0, ty: (fy1 - fy0 - 1) * TILE });
    prop('bikerack', gx - 2.6, fy1 + 0.6, 6); prop('bench_m', gx + 2.8, fy1 + 0.6, 6); prop('trashcan', gx + 1.6, fy1 + 0.5, 5);
    (m.landmarks ||= []).push({ name, type: 'pool', x: fx0 * TILE, y: fy0 * TILE, w: (fx1 - fx0) * TILE, h: (fy1 - fy0) * TILE });
    (m.natureSites ||= []).push({ kind: 'pool', name, x: Math.round((qx0 + pw / 2) * TILE), y: Math.round((qy0 + ph / 2) * TILE), gate: { x: gx * TILE, y: fy1 * TILE }, house: { x: Math.round((bx0 + bw / 2) * TILE), y: Math.round((by0 + bd) * TILE) } });
    place(name, fx0, fy0, fx1, fy1);
    return true;
  };
  return { place, area, pool, fence, chain, tree, frontRow, backRow, along, below, above, both, lido };
}
