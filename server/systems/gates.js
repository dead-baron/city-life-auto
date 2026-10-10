// Sliding gates: the police motor pool (officers only) and the Syndicate compound on Smuggler's
// Rock (gang members only). A gate opens for anyone allowed who comes up to it on foot or at the
// wheel, lets anyone already inside back out, and never closes on someone in the gateway.
import { K } from '../../shared/constants.js';
import { shutterUp } from './nightclubs.js';

const TILE = 32;
const CLOSE_AFTER_S = 1.2;

export const allowed = (rule, p) => (rule === 'police' ? !!p.badge : rule === 'gang' ? p.profile.gang === 'syndicate' && !p.badge : false);

export function init(world) { world.gateState = (world.map.gates || []).map(() => ({ open: false, closeAt: 0 })); }
export function gatesOpen(world) { return (world.gateState || []).map((s, i) => (s.open ? i : -1)).filter((i) => i >= 0); }
const insideRect = (r, x, y) => x > r.tx * TILE && x < (r.tx + r.tw) * TILE && y > r.ty * TILE && y < (r.ty + r.th) * TILE;

function setGate(world, i, open) {
  const st = world.gateState[i];
  if (st.open === open) return;
  st.open = open;
  for (const pr of world.map.gates[i].props) pr.off = open;
  world.broadcast({ e: 'gate', i, open });
}

export function update(world) {
  if (!world.gateState || world.tick % 4 !== 2) return;
  const now = world.time;
  world.map.gates.forEach((g, i) => {
    // along = across the opening, depth = through it
    const rel = (x, y) => (g.vertical ? { along: y - g.y, depth: x - g.x } : { along: x - g.x, depth: y - g.y });
    const near = (x, y, reach) => { const r = rel(x, y); return Math.abs(r.along) < g.w / 2 + 60 && Math.abs(r.depth) < reach; };
    let want = false;
    if (g.rule === 'night' && shutterUp(world, i)) want = true; // the clubs are open all night, and till the last of them are out in the morning (nightclubs.js)
    for (const p of world.players.values()) {
      const ped = p.ped;
      if (!ped || ped.dead || ped.hidden) continue;
      const v = ped.vehId ? world.get(ped.vehId) : null;
      const x = v ? v.x : ped.x, y = v ? v.y : ped.y;
      if (allowed(g.rule, p) && near(x, y, 170)) want = true;
      else if (insideRect(g.rect, x, y) && near(x, y, 130)) want = true; // anyone inside can leave
    }
    if (g.rule === 'police') for (const v of world.query(g.x, g.y, 220, K.VEH)) if (v.ai && v.ai.kind === 'police' && near(v.x, v.y, 170)) want = true;
    const inGateway = world.query(g.x, g.y, g.w / 2 + 40).some((e) => (e.kind === K.PED || e.kind === K.VEH) && !e.removed && !e.dead && (() => { const r = rel(e.x, e.y); return Math.abs(r.depth) < (e.kind === K.VEH ? e.def.L / 2 + 6 : 20) && Math.abs(r.along) < g.w / 2; })());
    const st = world.gateState[i];
    if (want || inGateway) { st.closeAt = now + CLOSE_AFTER_S; setGate(world, i, true); }
    else if (st.open && now >= st.closeAt) setGate(world, i, false);
  });
}
