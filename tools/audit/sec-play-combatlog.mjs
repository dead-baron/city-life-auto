// Security audit (report only): the hello's cb (the page's build) is the page's word. A page that claims an older build
// than the server's (cb: 'old', cbt: 0) is marked updateDue (players.js noteClientBuild), and its leaving then skips the
// ghost body and the drop rule (players.js leave: updating()) - a wanted player mid-fight closes the tab and keeps
// everything, gone from the street at once.
//   node --max-old-space-size=3072 tools/audit/sec-play-combatlog.mjs
import { makeWorld, fakeConn, store, players } from '../../test/helpers.js';

const w = makeWorld({ build: 'B2', buildAt: 2000 });   // (a live server always has its version.json build)
let n = 0;
function trial(label, cb) {
  const prof = store.create(('c0ffee' + (++n) + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa').slice(0, 24));
  const p = players.join(w, fakeConn(), prof, { clientBuild: cb, clientBuiltAt: 0 });
  p.ped.protectUntil = 0;
  prof.cash = 5000;
  p.wanted = 3;
  p.ped.lastHitAt = w.time; p.ped.lastCombatAt = w.time;   // (mid-fight)
  players.leave(w, p);   // (the tab closed)
  const ghost = w.players.has(prof.pid) && !p.ped.removed;
  console.log(`${label}: updateDue ${p.updateDue}; ghost body left in the street: ${ghost}${ghost ? ` (for ${Math.round(p.ghostUntil - w.time)} s)` : ''}; cash on the profile: $${prof.cash}`);
  for (let i = 0; i < 20 * 40 && w.players.has(prof.pid); i++) w.step();
  console.log(`   once gone from the world: cash still on the profile $${prof.cash}`);
}
trial('honest page (cb = B2)     ', 'B2');
trial('page claiming cb = "old"  ', 'old');
