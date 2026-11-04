// Money sources and sinks without touching the ~100 places that pay or charge (server/analytics.js): a profile's cash
// and bank become accessors that note every change against what was running at the time - the world system in the
// tick (world.curSys, set by world.js step) or the message being handled (world.curMsg, set by server/session.js:
// 'shop:<the place's kind>' for a menu pick, 'dev' for the debug menu). Changes are netted per source (cash to bank at
// an ATM is no earning) and settled at the end of each message and tick (settle()). The saved profile is unchanged:
// JSON.stringify reads the accessors as plain values.
const SKIP_SOURCES = new Set();

export function sourceOf(world) {
  if (world.curMsg) return world.curMsg;
  return world.curSys || 'other';
}

// profile -> its cash and bank watched; onSettle(p, src, net, opt) is called by settle() for each source's net change
export function watch(world, p) {
  const prof = p.profile;
  if (!prof) return;
  const cur = Object.getOwnPropertyDescriptor(prof, 'cash');
  if (prof.__watched === world && cur && cur.get) return;   // (watched already - unless a wipe put plain values back)
  for (const k of ['cash', 'bank']) {
    let v = Number(prof[k]) || 0;
    const d = Object.getOwnPropertyDescriptor(prof, k);
    if (d && d.get) v = d.get.call(prof);
    Object.defineProperty(prof, k, {
      configurable: true, enumerable: true,
      get() { return v; },
      set(nv) {
        const delta = nv - v;
        v = nv;
        if (!delta || !Number.isFinite(delta)) return;
        const src = sourceOf(world);
        if (SKIP_SOURCES.has(src)) return;
        const pend = (p.moneyPend ||= new Map());
        const e = pend.get(src);
        if (e) e.net += delta; else pend.set(src, { net: delta, opt: world.curOpt || null });
        if (!world.moneyDirty) world.moneyDirty = new Set();
        world.moneyDirty.add(p);
      },
    });
  }
  Object.defineProperty(prof, '__watched', { value: world, configurable: true, enumerable: false, writable: true });
}

export function settle(world, onSettle) {
  const dirty = world.moneyDirty;
  if (!dirty || !dirty.size) return;
  for (const p of dirty) {
    const pend = p.moneyPend;
    if (!pend) continue;
    for (const [src, e] of pend) if (e.net) onSettle(p, src, e.net, e.opt);
    pend.clear();
  }
  dirty.clear();
}
