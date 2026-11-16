// The founder (the owner, 11-16: "my Dead Baron logo avatar character as an actual in-game character that I can play when
// I'm in admin mode ... have my presence known as the owner/founder/admin. That would just be for me though"). The owner's
// account - the role 'owner', decided on the server (server/roles.js, accounts.js) - carries:
//   - p.founder: the gold crown by his name, for everyone (the ped's descriptor fo: server/net.js; client/main.js
//     drawWorldLabels founderMark) and "Founder" on his card (the players list: devmode.js playerList fo);
//   - p.founderLook: his Dead Baron avatar as his character (the descriptor's app.fd: client/art2/people.js FOUNDER) while
//     he's in admin mode (dev mode) and hasn't switched it off (the admin panel's switch: server/admin.js founder; kept on
//     the account: acct.founderOff). Out of admin mode he's his normal character.
// founderSync(p) brings both up to date (the descriptor sent again when they change): on joining, on entering or leaving
// admin mode, on the switch, on claiming the owner's role.
export function founderSync(p, isOwner = p.founder) {
  const on = !!isOwner, look = !!(on && p.devMode && !p.founderOff);
  if (on === !!p.founder && look === !!p.founderLook) return false;
  p.founder = on; p.founderLook = look;
  if (p.ped) p.ped.appVer = (p.ped.appVer || 0) + 1;
  p.meDirty = true;
  return true;
}
