// Roles (the owner, 11-03), checked on the server for every privileged message - never anything the page says:
//   owner  - the top: grants and removes admin and helper, reads the admin log and the analytics dashboard, ends a season;
//   admin  - the debug powers (dev mode and the debug menu), kick, ban, chat mutes and strikes, the review list;
//   helper - refund a purchase, teleport a stuck player to safety, restore a lost item, view a player's recent log.
// devOpen (config.launch.devOpen, CLA_DEV_OPEN): while it's on, anyone may still switch the open debug mode on as before;
// at launch it goes off and only admins and the owner get the debug powers.
export const RANK = { helper: 1, admin: 2, owner: 3 };
export const POWERS = {
  dev: 'admin', kick: 'admin', ban: 'admin', unban: 'admin', mute: 'admin', unmute: 'admin', strike: 'admin', unstrike: 'admin', reviews: 'admin', resolve: 'admin', prison: 'admin',
  refund: 'helper', rescue: 'helper', restore: 'helper', plog: 'helper', players: 'helper',
  role: 'owner', adminlog: 'owner', dashboard: 'owner', season: 'owner', news: 'owner',
};

export const rankOf = (role) => RANK[role] || 0;
// may an account with this role use this power? (an unknown power: nobody)
export function allowed(role, power) {
  const need = POWERS[power];
  return !!need && rankOf(role) >= RANK[need];
}
// the roles an owner may hand out (never owner: that's the env var or the one-time claim)
export const GRANTABLE = ['helper', 'admin'];
