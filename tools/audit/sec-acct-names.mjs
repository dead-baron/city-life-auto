// Security audit (accounts), report-only: names that pass as staff or the founder, and crew names past the word filter.
//  - the owner holds "DeadBaron" (a member); a guest and a (free, unverified email) member try lookalikes
//  - a member takes a lookalike of another member's name (launch.js rename only stops guests: memberOwns is !member-only)
//  - crew names (systems/crews.js found) go through shared/names.js cleanName only - not chatfilter nameOk
// Prints what happened; never asserts, never fixes.   node --max-old-space-size=3072 tools/audit/sec-acct-names.mjs
import { clock, fakeWorld, fakePlayer } from '../../test/launchkit.js';
import { readFileSync } from 'node:fs';
import { MemoryStore, useStore, store } from '../../server/store.js';
import { config } from '../../server/config.js';
import { createLaunch } from '../../server/launch.js';
import { cleanName } from '../../shared/names.js';
import { filter } from '../../server/chatfilter.js';

const quiet = { log() {}, warn() {}, error() {} };
useStore(new MemoryStore());
const world = fakeWorld(); world.stats = { tickMs: 0 }; world.time = 100;
const c = clock();
const L = createLaunch({ config: { ...config, launch: { ...config.launch, google: { id: 'g', secret: 's' } } }, store, world, ip: () => '1', dataDir: null, now: c.now, log: quiet });
const join = () => { const p = fakePlayer(world, store, {}); L.hooks.join(p, {}, {}); return p; };
const member = () => { const p = join(); L.accounts.signIn('password', `pw-${p.pid}`, { linkPid: p.pid }); L.onLinked(p.pid); return p; };
const name = (p, n) => { p.renameTryAt = 0; p.profile.nameAt = 0; world.time += 10; c.add(25 * 3600e3); return L.rename(p, n); };

const owner = member(); L.accounts.setRole(owner.pid, 'owner'); owner.acct.role = 'owner';
console.log('owner takes "DeadBaron":', name(owner, 'DeadBaron') || 'ok', '->', owner.name);
const admin = member(); L.accounts.setRole(admin.pid, 'admin'); name(admin, 'Steve'); console.log('an admin is "Steve"');

const tries = ['DeadBaron', 'Dead Baron', 'DeadBar0n', 'Dead8aron', 'TheDeadBaron', 'Real_DeadBaron', 'xDeadBaronx', 'DeadBarron', 'DeadBaronn', 'Deadbaron_', 'DeadBaroon',
  'St3ve', 'Steve_', 'St_eve', 'Steve.', 'Admin', 'Adm1n', 'Admln', 'TheAdmin', 'AdminSteve', 'SteveAdmin', 'Staff_Steve', 'Mod_Steve', 'ModSteve', 'GameMaster', 'GM_Steve', 'Owner', 'TheOwner', 'Founder', 'Helper', 'Moderat0r', 'Mod', 'M0d', 'Support', 'SupportTeam', 'CLA_Staff', 'CLAStaff', 'Developer', 'Dev_Team'];
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
console.log(`\n${pad('name', 16)} ${pad('guest', 44)} member (any free email sign-up)`);
for (const n of tries) {
  const g = join(), m = member();
  const ge = name(g, n), me = name(m, n);
  console.log(`${pad(n, 16)} ${pad(ge ? 'refused: ' + ge.slice(0, 34) : 'TAKEN', 44)} ${me ? 'refused: ' + me.slice(0, 40) : 'TAKEN'}`);
  for (const q of [g, m]) world.players.delete(q.pid);
}

// crew names: cleanName only. Count the chatwords.json words (hate / sexual, word and pre lists, 4+ letters) a crew name may
// be, as a plain capitalised word - without printing them
const words = JSON.parse(readFileSync(new URL('../../server/chatwords.json', import.meta.url), 'utf8'));
let tot = 0, passCrew = 0, passName = 0;
const cats = {};
for (const cat of ['hate', 'sexual']) for (const k of ['sub', 'word', 'pre']) for (const w of words[cat][k] || []) {
  if (!/^[a-z]{4,16}$/.test(w)) continue;
  const n = w[0].toUpperCase() + w.slice(1) + 's';
  tot++;
  const crewOk = !cleanName(n).err, nameOk = !cleanName(n).err && filter().nameOk(n);
  if (crewOk) { passCrew++; cats[cat] = (cats[cat] || 0) + 1; }
  if (nameOk) passName++;
}
console.log(`\ncrew names: of ${tot} listed hate/sexual words (4-16 letters, +"s"), ${passCrew} pass cleanName (crews.js found: allowed as a crew name and tag) ${JSON.stringify(cats)}; ${passName} would pass as a player name (cleanName + nameOk)`);
