// The owner's saved views (the camera panel's "Save this view" - the owner, 11-14 20:21, after the first shot list: we fix
// the fundamentals, then he scouts the places himself and ~10 hero shots are refined with him; docs/DECISIONS.md
// "Director and content"). A view is where the camera was - its middle, its zoom - the time of day and the weather on his
// screen, a name and a note: kept on the server with the world's own state (store.kept.views: saved with the profiles,
// across restarts and deploys), listed in his panel with go to, rename, delete and play (a shot there: shared/scenes
// viewScene - the camera holds there and pushes in slowly at its time and weather, director.js).
// Who: anyone in dev mode sees and plays them; saving, renaming and deleting are an admin's or the owner's (roles.js) - or
// anyone's on a dev server (CLA_DEV=1: a private one).
import { store } from '../store.js';
import { DIRECTOR } from '../../shared/rules.js';
import * as devmode from '../devmode.js';

const WX = ['clear', 'rain', 'fog', 'mist', 'storm'];
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, lo, hi, d) => { const x = +v; return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
export const all = () => (Array.isArray(store.kept.views) ? store.kept.views : (store.kept.views = []));
export const get = (id) => all().find((v) => v.id === String(id)) || null;
export const mayEdit = (world, p) => !!(world.dev || devmode.mayStaff(p));
// a view as it's kept: cleaned up, its numbers in range (x, y: px; z: the camera's zoom; t: minutes after midnight)
export function make(msg, by = '', n0 = 0) {
  return {
    id: `v${Date.now().toString(36)}${(n0 % 1296).toString(36)}`, n: clean(msg.n, 48) || `View ${n0 + 1}`, note: clean(msg.note, 160),
    x: Math.round(num(msg.x, -1e6, 1e6, 0)), y: Math.round(num(msg.y, -1e6, 1e6, 0)), z: +num(msg.z, 0.3, 3, 1).toFixed(3),
    t: Math.round(num(msg.t, 0, 1439, 720)), w: WX.includes(msg.w) ? msg.w : 'clear', at: Date.now(), by: clean(by, 32),
  };
}
function send(world, p, extra = null) { if (p.conn) p.conn.sendJSON({ t: 'views', list: all(), can: mayEdit(world, p), ...extra }); }
// the debug command 'views' (dev.js): k list | save | rename | delete
export function command(world, p, msg) {
  const k = msg.k || 'list';
  if (k === 'list') return send(world, p);
  if (!mayEdit(world, p)) { world.notify(p, '[dev] Saving views is for the owner and admins.', 'warn'); return send(world, p); }
  const L = all();
  if (k === 'save') {
    if (L.length >= DIRECTOR.views) { world.notify(p, `[dev] ${DIRECTOR.views} saved views at most - delete one first.`, 'warn'); return send(world, p); }
    const v = make(msg, p.name, L.length);
    L.push(v); store.touch();
    world.notify(p, `[dev] Saved: ${v.n}.`, 'good');
    return send(world, p, { saved: v.id });
  }
  const v = get(msg.id);
  if (!v) { world.notify(p, '[dev] No such view.', 'warn'); return send(world, p); }
  if (k === 'rename') { if (msg.n !== undefined) v.n = clean(msg.n, 48) || v.n; if (msg.note !== undefined) v.note = clean(msg.note, 160); store.touch(); return send(world, p); }
  if (k === 'delete') { L.splice(L.indexOf(v), 1); store.touch(); world.notify(p, `[dev] Deleted: ${v.n}.`, 'info'); return send(world, p); }
  world.notify(p, `[dev] views: list, save, rename or delete (not ${k}).`, 'warn');
}
