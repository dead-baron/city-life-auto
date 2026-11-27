// Roles (the owner, 11-03), checked on the server for every privileged message - never anything the page says:
//   owner  - the top: grants and removes admin and helper, reads the admin log and the analytics dashboard, ends a season;
//            wears the founder's look (server/founder.js);
//   admin  - the debug powers (dev mode and the debug menu), kick, ban, chat mutes and strikes, the review list; the console
//            (/admin/: server/adminconsole.js) and the in-game admin panel's player powers (watch, teleport to / bring /
//            send to a place, heal, revive, end a stuck job or activity, gift) - server/admin.js (the owner, 11-16);
//   helper - refund a purchase, teleport a stuck player to safety, restore a lost item, view a player's recent log.
// devOpen (config.launch.devOpen, CLA_DEV_OPEN): while it's on, anyone may still switch the open debug mode on as before;
// at launch it goes off and only admins and the owner get the debug powers.
export const RANK = { helper: 1, admin: 2, owner: 3 };
export const POWERS = {
  dev: 'admin', console: 'admin', watch: 'admin', tpto: 'admin', bring: 'admin', send: 'admin', heal: 'admin', revive: 'admin', endjob: 'admin', gift: 'admin', kick: 'admin', ban: 'admin', unban: 'admin', mute: 'admin', unmute: 'admin', strike: 'admin', unstrike: 'admin', reviews: 'admin', resolve: 'admin', prison: 'admin', namefree: 'admin', undelete: 'admin',
  refund: 'helper', rescue: 'helper', restore: 'helper', plog: 'helper', players: 'helper',
  role: 'owner', founder: 'owner', adminlog: 'owner', dashboard: 'owner', season: 'owner', news: 'owner',
};

export const rankOf = (role) => RANK[role] || 0;
// may an account with this role use this power? (an unknown power: nobody)
export function allowed(role, power) {
  const need = POWERS[power];
  return !!need && rankOf(role) >= RANK[need];
}
// the roles an owner may hand out (never owner: that's the env var or the one-time claim)
export const GRANTABLE = ['helper', 'admin'];
