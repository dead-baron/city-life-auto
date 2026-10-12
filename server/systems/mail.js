// The mail (H71; the owner asked for "owning a home" and the small things that make one): your mailbox - in your block's
// lobby, or by your house's front door (you pick it up on the way in and read it at the hall table) - holds mail now and
// then: the mortgage's statement each payment (mortgage.js), the utilities bill each in-game week for the homes you own
// (pay it from the mailbox; still unpaid when the next one comes, it's taken from your bank with a late fee), a letter,
// a coupon (MAIL.off % off your next piece at the furniture counter: economy.js), a delivery note from the furniture
// counter. Only for players who own a home; days counted while you're in the city, as the mortgage's are.
//   profile.mail: [{ i, k: 'stmt' | 'bill' | 'letter' | 'coupon' | 'pkg', d (world.day), t (what it says), amt (a bill),
//     paid, read }] oldest first, at most MAIL.keep; profile.mailDay / billDay: the days last seen and billed;
//   profile.coupon: the % off waiting. All absent on older profiles (they load as before: no mail yet).
import { MAIL } from '../../shared/rules.js';
import { store } from '../store.js';

const money = (n) => `$${Math.round(n).toLocaleString()}`;
const LETTERS = [
  'A postcard from your cousin at the coast: "Weather\'s lovely, wish you were here."',
  'The residents\' newsletter: the block party is on Saturday, bring a dish.',
  'A note from a neighbour: "Thanks for keeping an eye on the place while we were away."',
  'A flyer from Sunny Side Window Cleaning - first visit free.',
  'Your old school\'s reunion: "Ten years already! Drinks at the Lantern Room."',
  'A thank-you card, unsigned. Someone in this city thinks you\'re all right.',
];

// mail for a profile (p: a player or a profile). k the kind, t what it says, amt a bill's
export function post(p, k, t, amt) {
  const prof = p.profile || p;
  const box = (prof.mail ||= []);
  const i = (prof.mailN = (prof.mailN || 0) + 1);
  box.push({ i, k, t, ...(amt ? { amt } : null) });
  while (box.length > MAIL.keep) { const j = box.findIndex((m) => !(m.k === 'bill' && !m.paid)); box.splice(j >= 0 ? j : 0, 1); }   // (the oldest goes; an unpaid bill stays)
  store.touch();
  return i;
}
export const unread = (prof) => ((prof && prof.mail) || []).filter((m) => !m.read).length;
const owned = (world, prof) => (prof.homes || []).filter((id) => world.homeOwner.get(id) === prof.pid).length;

// once each in-game day for the players in the city who own a home: the week's bill, now and then a letter or a coupon
export function update(world) {
  if (world.tick % 40 !== 31) return;
  for (const p of world.players.values()) newDay(world, p);
}
export function newDay(world, p) {
  const prof = p.profile, n = prof ? owned(world, prof) : 0;
  if (!n) return;
  if (prof.mailDay == null) { prof.mailDay = world.day; prof.billDay = world.day; store.touch(); return; }   // (counting from your first home's first day)
  if (prof.mailDay === world.day) return;
  prof.mailDay = world.day;
  if (world.day - (prof.billDay ?? world.day) >= MAIL.week) { prof.billDay = world.day; bill(world, p, n); }
  else if (world.rand() < MAIL.odds) {
    if (!prof.coupon && world.rand() < 0.4) { prof.coupon = MAIL.off; post(p, 'coupon', `A coupon from Nail & Gear Hardware: ${MAIL.off}% off your next piece of furniture at the counter.`); }
    else post(p, 'letter', LETTERS[Math.floor(world.rand() * LETTERS.length)]);
    world.notify(p, 'Something in your mailbox.', 'info');
  }
  p.meDirty = true;
}
// the utilities for the week: an old bill still unpaid is taken from the bank now, with the late fee
function bill(world, p, n) {
  const prof = p.profile;
  for (const m of prof.mail || []) {
    if (m.k !== 'bill' || m.paid) continue;
    const due = m.amt + MAIL.late;
    if ((prof.bank || 0) >= due) { prof.bank -= due; m.paid = 1; m.read = 1; world.notify(p, `An overdue utilities bill: ${money(due)} taken from your bank (with a ${money(MAIL.late)} late fee).`, 'warn'); }
  }
  const amt = MAIL.util * n;
  post(p, 'bill', `Utilities for the week - water, power, gas${n > 1 ? ` for your ${n} homes` : ''}.`, amt);
  world.notify(p, `The utilities bill is in your mailbox: ${money(amt)}.`, 'info');
}
// pay bill i from the mailbox (pay: economy's cash-then-bank payer)
export function pay(world, p, i, pay) {
  const m = (p.profile.mail || []).find((q) => q.i === i);
  if (!m || m.k !== 'bill' || m.paid) return 'Nothing to pay.';
  if (!pay(p, m.amt)) return `You need ${money(m.amt)}.`;
  m.paid = 1; m.read = 1;
  store.touch();
  world.notify(p, `Utilities paid: ${money(m.amt)}.`, 'good');
  return null;
}
// throw away what's been read (a bill only once it's paid)
export function clear(prof) {
  prof.mail = (prof.mail || []).filter((m) => !m.read || (m.k === 'bill' && !m.paid));
  store.touch();
}
const KIND = { stmt: 'Statement', bill: 'Bill', letter: 'Letter', coupon: 'Coupon', pkg: 'Delivery' };
// the mailbox's rows, newest first (opening it reads it all); returns the menu's line under the title
export function menuOpts(world, p, opts) {
  const box = p.profile.mail || [], n = unread(p.profile);
  for (const m of [...box].reverse()) {
    if (m.k === 'bill' && !m.paid) opts.push({ id: `hi:mpay:${m.i}`, label: `Pay the bill: ${m.t}`, price: m.amt, note: m.read ? 'unpaid' : 'new · unpaid' });
    else opts.push({ id: `hi:mread:${m.i}`, label: m.t, note: `${KIND[m.k] || 'Mail'}${m.read ? '' : ' · new'}${m.k === 'bill' ? ' · paid' : ''}` });
  }
  if (box.some((m) => m.read && !(m.k === 'bill' && !m.paid))) opts.push({ id: 'hi:mclear', label: 'Throw away the old mail' });
  for (const m of box) m.read = 1;
  if (n) store.touch();
  return box.length ? `${n ? `${n} new.` : 'Nothing new.'}${p.profile.coupon ? ` A coupon waits: ${p.profile.coupon}% off at the furniture counter.` : ''}` : 'Empty. Bills, letters and deliveries for your home turn up here.';
}
