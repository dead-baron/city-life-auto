// Money sources and sinks without touching the ~100 places that pay or charge (server/analytics.js): a profile's cash
// and bank become accessors that note every change against what was running at the time - the world system in the
// tick (world.curSys, set by world.js step) or the message being handled (world.curMsg, set by server/session.js:
// 'shop:<the place's kind>' for a menu pick, 'dev' for the debug menu). Changes are netted per source (cash to bank at
// an ATM is no earning) and settled at the end of each message and tick (settle()). The saved profile is unchanged:
// JSON.stringify reads the accessors as plain values.
// Who a change is noted against lives on the profile (a hidden __mw: { world, p }), not in the accessors: a player who
// logs off and back on is a new player object for the same profile, and watch() points it at that one; release() on
// leaving points it at nobody (changes then - a mortgage paid offline - go unnoted rather than to a stale player).
export function sourceOf(world) {
  if (world.curMsg) return world.curMsg;
  return world.curSys || 'other';
}

function note(mw, delta) {
  const world = mw.world, p = mw.p;
  if (!p || !world || !delta || !Number.isFinite(delta)) return;
  const src = sourceOf(world);
  const pend = (p.moneyPend ||= new Map());
  const e = pend.get(src);
  if (e) e.net += delta; else pend.set(src, { net: delta, opt: world.curOpt || null });
  (world.moneyDirty ||= new Set()).add(p);
}

export function watch(world, p) {
  const prof = p.profile;
  if (!prof) return;
  let mw = prof.__mw;
  if (!mw) { mw = { world, p }; Object.defineProperty(prof, '__mw', { value: mw, configurable: true, enumerable: false, writable: true }); }
  mw.world = world; mw.p = p;
  for (const k of ['cash', 'bank']) {
    const d = Object.getOwnPropertyDescriptor(prof, k);
    if (d && d.get && d.get.__mw === mw) continue;   // (watched already - a wipe puts plain values back, then it's done again)
    let v = Number(d && d.get ? d.get.call(prof) : prof[k]) || 0;
    const get = function () { return v; };
    get.__mw = mw;
    Object.defineProperty(prof, k, { configurable: true, enumerable: true, get, set(nv) { const delta = nv - v; v = nv; note(mw, delta); } });
  }
}
// the player left: their pending changes settled by the caller first; nothing more is noted against them
export function release(p) {
  const mw = p && p.profile && p.profile.__mw;
  if (mw && mw.p === p) mw.p = null;
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
