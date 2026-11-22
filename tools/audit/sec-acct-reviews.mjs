// Security audit (moderation), report-only: can throwaway guests push open items off the staff's Review list?
// moderation.js review keeps the newest 500 (MAX_REVIEWS) and cuts the rest - open or not. A report from a brand-new guest
// weighs 0 toward a strike, but still adds its own review item (a different reporter = a new item). Here: a 'safety' flag
// (an adult asking a child's age) is on the list, then 500 fresh guests each report one player once.
// Prints what happened; never asserts, never fixes.   node --max-old-space-size=3072 tools/audit/sec-acct-reviews.mjs
import { clock, fakeWorld, fakePlayer } from '../../test/launchkit.js';
import { MemoryStore, useStore, store } from '../../server/store.js';
import { config } from '../../server/config.js';
import { createLaunch } from '../../server/launch.js';

const quiet = { log() {}, warn() {}, error() {} };
useStore(new MemoryStore());
const world = fakeWorld(); world.stats = { tickMs: 0 }; world.time = 100;
const c = clock();
const L = createLaunch({ config: { ...config, launch: { ...config.launch } }, store, world, ip: () => '1', dataDir: null, now: c.now, log: quiet });
const join = (o = {}) => { const p = fakePlayer(world, store, o); L.hooks.join(p, {}, {}); return p; };

const creep = join({ name: 'Creep' }), kid = join({ name: 'Kid' });
const said = L.chat.send(world, creep, { ch: 'near', text: 'how old are you? are your parents home' });
const safety = store.kept.reviews.find((r) => r.kind === 'safety');
console.log('a safety flag on the review list:', safety ? `yes (${safety.id}: ${safety.note})` : 'no', '| the line:', said.err || 'sent');
const victim = join({ name: 'Target' });
const hid = L.chat.hid(victim.pid);
let made = 0;
for (let i = 0; i < 500; i++) {
  const g = join();
  const r = L.chat.handle(world, g, { t: 'mod', a: 'report', id: hid, why: 'other', note: 'x' });
  if (r && r.ok) made++;
  world.players.delete(g.pid);
}
const list = store.kept.reviews;
console.log(`500 fresh guests (weight 0 each) reported one player: ${made} accepted; the list holds ${list.length}, open ${list.filter((r) => !r.done).length}`);
console.log('the safety flag still on the list:', list.some((r) => r === safety) ? 'yes' : 'NO - cut off the end (moderation.js:35), never seen by staff');
