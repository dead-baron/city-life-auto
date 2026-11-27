// The founder (the owner, 11-16: "my Dead Baron logo avatar character as an actual in-game character that I can play when
// I'm in admin mode ... have my presence known as the owner/founder/admin. That would just be for me though"). The owner's
// account - the role 'owner', decided on the server (server/roles.js, accounts.js) - carries:
//   - p.founder: the gold crown by his name, for everyone (the ped's descriptor fo: server/net.js; client/main.js
//     drawWorldLabels founderMark) and "Founder" on his card (the players list: devmode.js playerList fo);
//   - p.founderLook: his Dead Baron avatar (the descriptor's app.fd: client/art2/people.js FOUNDER) - an outfit he puts on
//     for fun, not his character (the owner, 11-16): off every time he plays, on only while he's switched it on with the
//     admin panel's switch (server/admin.js founder: p.founderOn, this session only - never saved), off again when he
//     switches it off or logs in again. Admin mode alone never puts it on. The crown stays in both looks.
// founderSync(p) brings both up to date (the descriptor sent again when they change): on joining, on entering or leaving
// admin mode, on the switch, on claiming the owner's role.
export function founderSync(p, isOwner = p.founder) {
  const on = !!isOwner, look = !!(on && p.founderOn);
  if (on === !!p.founder && look === !!p.founderLook) return false;
  p.founder = on; p.founderLook = look;
  if (p.ped) p.ped.appVer = (p.ped.appVer || 0) + 1;
  p.meDirty = true;
  return true;
}
