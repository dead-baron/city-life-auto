// The props near a spot, quickly (world generation). The "clear the props round here" and "is anything standing
// here" checks used to look at every prop in the world each time - tens of thousands, for every point along a trail
// or every spot along a building front - and were a good part of the time a phone spends building the city.
//
//   const G = propGrid(m)        for one pass of the generator
//   G.each(x0, y0, x1, y1, fn)   fn(prop, index) for every prop that may stand in [x0, x1] x [y0, y1] (world px), in
//                                index order - fn still makes its own check - just as m.props.forEach(fn) would for
//                                those (and, like forEach, not for props added while it runs)
//   G.any(x0, y0, x1, y1, pred)  whether pred(prop) holds for any of them
//
// Right while the pass only adds props (pushed onto m.props) and drops them where they stand (the slot keeps its
// index and its spot): the grid takes in whatever was added since it last looked, and starts over if m.props is a
// new array. A pass that moves props mustn't use it. Pure and deterministic (the result is the same as the full scan:
// a prop outside the box never passes the caller's check - callers give the box with a pixel to spare).
const CELL = 128, OFF = 1024, STRIDE = 4096;

export function propGrid(m) {
  const G = { m, props: m.props, n: 0, cells: new Map(), odd: [], tmp: [] };
  G.sync = () => {
    if (G.props !== m.props) { G.props = m.props; G.n = 0; G.cells.clear(); G.odd.length = 0; }
    const props = G.props;
    for (; G.n < props.length; G.n++) {
      const p = props[G.n];
      if (!p) continue;
      const cx = Math.floor(p.x / CELL) + OFF, cy = Math.floor(p.y / CELL) + OFF;
      if (!(cx >= 0 && cy >= 0 && cx < STRIDE && cy < STRIDE)) { G.odd.push(G.n); continue; }   // (NaN or far out: always looked at)
      const k = cy * STRIDE + cx;
      const l = G.cells.get(k);
      if (l) l.push(G.n); else G.cells.set(k, [G.n]);
    }
  };
  // the indices that may stand in the box, ascending (in G.tmp: valid until the next call)
  G.near = (x0, y0, x1, y1) => {
    G.sync();
    const out = G.tmp; out.length = 0;
    const a = Math.max(0, Math.floor(x0 / CELL) + OFF), b = Math.min(STRIDE - 1, Math.floor(x1 / CELL) + OFF);
    const c = Math.max(0, Math.floor(y0 / CELL) + OFF), d = Math.min(STRIDE - 1, Math.floor(y1 / CELL) + OFF);
    if (!(b >= a && d >= c)) { for (let i = 0; i < G.props.length; i++) out.push(i); return out; }   // (a box of NaN: everything)
    for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) { const l = G.cells.get(cy * STRIDE + cx); if (l) for (const i of l) out.push(i); }
    for (const i of G.odd) out.push(i);
    out.sort((u, v) => u - v);
    return out;
  };
  G.each = (x0, y0, x1, y1, fn) => {
    const list = G.near(x0, y0, x1, y1).slice(), props = G.props;
    for (const i of list) fn(props[i], i);
  };
  G.any = (x0, y0, x1, y1, pred) => {
    const props = G.props;
    for (const i of G.near(x0, y0, x1, y1)) { const p = props[i]; if (p && pred(p)) return true; }
    return false;
  };
  return G;
}
