// The audit's second probe (tools/audit/harness.mjs): the fields the audit's rows read.
const js = (v, n = 500) => { try { return String(JSON.stringify(v)).slice(0, n); } catch { return '(circular)'; } };
const keys = (arr) => { const c = {}; for (const x of arr) if (x && typeof x === 'object') for (const k of Object.keys(x)) c[k] = (c[k] || 0) + 1; return Object.entries(c).map(([k, n]) => `${k}:${n}`).join(' '); };
export default function probe2(M) {
  const out = [];
  const c = {}; for (const p of M.props) if (p) c[p.t] = (c[p.t] || 0) + 1;
  out.push('ALL PROP KINDS: ' + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' '));
  out.push('\nBUILDING KEYS: ' + keys(M.buildings));
  out.push('\nDOOR KEYS: ' + keys(M.buildings.map((b) => b && b.door)));
  out.push('\nPOI KEYS: ' + keys(M.pois));
  out.push('\nwalkIns sample: ' + js(M.walkIns.slice(0, 5)) + ' -> ' + js(M.buildings[M.walkIns[0]], 1500));
  const wb = M.buildings.find((b) => b && (b.interior || b.room || b.rooms));
  out.push('\nbuilding with interior/room: ' + js(wb, 1500));
  out.push('\ntunnels: ' + M.tunnels.map((t) => js({ ...t, line: undefined }, 400)).join('\n  '));
  out.push('\nrail pt keys: ' + keys(M.rails.flatMap((r) => r.pts.slice(0, 2000))));
  out.push('\nrails: ' + M.rails.map((r) => `${r.name} pts=${r.pts.length} keys=${Object.keys(r).join(',')}`).join(' | '));
  const bridged = M.rails.flatMap((r) => r.pts).filter((p) => p.bridge || p.z || p.deck);
  out.push('\nrail pts bridge/z: ' + bridged.length + ' ' + js(bridged[0]));
  for (const t of ['festoon', 'cropstrip', 'hedgerun', 'hedgebox', 'fenceline', 'rail', 'crail', 'yfence', 'chainfence', 'heli', 'helipad', 'portal', 'rowboat', 'canoe', 'dock', 'boardwalk', 'pier', 'vinerow', 'raisedbed']) {
    const ps = M.props.filter((q) => q && q.t === t);
    if (ps.length) out.push(`\nPROP ${t} (${ps.length}) keys: ${keys(ps)} e.g. ${js(ps[0], 300)}`);
  }
  out.push('\nheli-ish kinds: ' + Object.keys(c).filter((k) => /heli|pad|chopper|plane|boat|canoe|kayak|dinghy|skiff|wreck|dock|pier|board|crop|corn|wheat|veg|field|portal|tunnel|bridge|trestle|girder|ramp|lights|bulb|lantern|festoon/i.test(k)).join(' '));
  out.push('\nfields: ' + keys(M.fields) + ' e.g. ' + js(M.fields[0]));
  out.push('\nlevels.segs keys: ' + keys(M.levels.segs) + ' n=' + M.levels.segs.length + ' ramps=' + M.levels.segs.filter((s) => s.ramp).length + ' e.g. ' + js(M.levels.segs.find((s) => s.ramp)));
  out.push('\nroad kinds: ' + js(M.roads.reduce((o, r) => ((o[r.kind + '/lvl' + r.lvl] = (o[r.kind + '/lvl' + r.lvl] || 0) + 1), o), {})));
  out.push('\ngores e.g. ' + js({ ...M.gores[0], pts: M.gores[0].pts.length }));
  out.push('\nwrecks: ' + js(M.wrecks, 800));
  out.push('\nhospitals keys: ' + keys(M.hospitals));
  out.push('\nworld3 keys: ' + Object.keys(M.world3).join(','));
  out.push('\nlandmarks types: ' + js(M.landmarks.reduce((o, r) => ((o[r.type] = (o[r.type] || 0) + 1), o), {})));
  out.push('\ndeck layer values: ' + js((() => { const h = {}; for (let i = 0; i < M.deck.length; i += 7) h[M.deck[i]] = (h[M.deck[i]] || 0) + 1; return h; })()));
  out.push('\nwalkways: ' + js(M.walkways));
  return out.join('\n');
}
