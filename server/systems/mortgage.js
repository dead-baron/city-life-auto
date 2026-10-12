// A mortgage (H65; the owner, 2026-10-11: "can we get more of the owning a house features up?"): buy a home for a deposit
// and the bank lends the rest - paid back from your bank account a payment each in-game day you're in the city
// (shared/rules.js MORTGAGE). A payment the bank account can't cover is missed (you're told, and how many more before...);
// more than MORTGAGE.miss in a row and the bank takes the home back. Selling it pays off what's owed first (homes.sell).
// Offered at the front door of a look round (homeinside.js) and in a home's for-sale menu (economy.js).
//   profile.loans: { [homeId]: { owed, pay, day (the in-game day of the last payment), missed } } - absent on old profiles
import { MORTGAGE } from '../../shared/rules.js';
import { store } from '../store.js';
import * as homes from './homes.js';

const money = (n) => `$${Math.round(n).toLocaleString()}`;

// a home's terms: the deposit, what's owed after it (with the bank's share), each day's payment
export function terms(h) {
  const deposit = Math.round((h.price * MORTGAGE.deposit) / 100) * 100;
  const owed = Math.round((h.price - deposit) * (1 + MORTGAGE.rate));
  return { deposit, owed, pay: Math.ceil(owed / MORTGAGE.days), days: MORTGAGE.days };
}
export const loansOf = (prof) => prof.loans || {};

// Buy h on a mortgage (pay: economy's cash-then-bank payer). null, or why not.
export function buyWith(world, p, h, pay) {
  const prof = p.profile;
  if (!h) return 'No such place.';
  if (world.homeOwner.has(h.id)) return 'Someone already owns this place.';
  if (Object.keys(loansOf(prof)).length >= MORTGAGE.max) return `The bank won't lend on more than ${MORTGAGE.max} homes at once - pay one off first.`;
  if (p.wanted > 0) return 'The bank won\'t lend to someone the police are after.';
  const t = terms(h);
  if (!pay(p, t.deposit)) return `The deposit is ${money(t.deposit)} (cash + bank).`;
  (prof.loans ||= {})[h.id] = { owed: t.owed, pay: t.pay, day: world.day, missed: 0 };
  homes.claim(world, p, h, t.deposit);
  world.notify(p, `${money(t.owed)} borrowed from the bank: ${money(t.pay)} comes out of your bank account each day for ${t.days} days. Miss more than ${MORTGAGE.miss} payments in a row and the bank takes it back.`, 'info');
  return null;
}

// the payments, once each in-game day, for the players in the city (a day away isn't charged)
export function update(world) {
  if (world.tick % 40 !== 23) return;
  for (const p of world.players.values()) {
    const prof = p.profile, L = prof && prof.loans;
    if (!L) continue;
    for (const id of Object.keys(L)) {
      const loan = L[id], hid = Number(id);
      if (world.homeOwner.get(hid) !== prof.pid) { delete L[id]; store.touch(); continue; }   // (sold, or the world rebuilt)
      if (loan.day === world.day) continue;
      loan.day = world.day;
      payDay(world, p, hid, loan);
    }
  }
}

export function payDay(world, p, hid, loan) {
  const prof = p.profile, h = homes.homeById(world, hid);
  const amt = Math.min(loan.pay, loan.owed);
  if ((prof.bank || 0) >= amt) {
    prof.bank -= amt; loan.owed -= amt; loan.missed = 0;
    (prof.deeds ||= {})[hid] = (prof.deeds[hid] || 0) + amt;   // (what you've paid for it: bought back at that if the world is rebuilt)
    if (loan.owed <= 0) { delete prof.loans[hid]; world.notify(p, `${h ? h.name : 'Your home'} is paid off - it's all yours.`, 'good'); }
    else world.notify(p, `Mortgage: ${money(amt)} paid from your bank for ${h ? h.name : 'your home'} (${money(loan.owed)} still owed).`, 'info');
  } else {
    loan.missed++;
    if (loan.missed > MORTGAGE.miss && h) { repossess(world, p, h); }
    else world.notify(p, `Mortgage payment missed: ${money(amt)} for ${h ? h.name : 'your home'} - not enough in your bank. ${MORTGAGE.miss + 1 - loan.missed} more missed and the bank takes it back.`, 'bad');
  }
  p.meDirty = true;
  store.touch();
}

// the bank takes the home back: it's on the market again; what was paid is the bank's; cars and the stash are kept
export function repossess(world, p, h) {
  const prof = p.profile;
  delete prof.loans[h.id];
  homes.release(world, prof, h);
  world.notify(p, `The bank has taken back ${h.name} - too many missed payments. Your cars and your stash are still yours.`, 'bad');
}
