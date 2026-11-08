// Vehicle insurance (docs/PROGRESSION.md "Money sinks", progression build item 6; the numbers: shared/rules.js INSURANCE).
// Optional, per vehicle you own (profile.vehicles): a policy bought once - at a dealership, a marina or a used lot (their
// menus list your vehicles: economy.js) or in the phone's Homes app (Your vehicles). Insured, a vehicle of yours that's
// wrecked or sinks (vehicles.js explode / startSink -> wrecked) comes back to your garage for a claim - its value x fee,
// rising with the claims made in the last recentDays days - and one towed to the impound (tow.js -> impounded) for the tow
// fee. Paid from the bank; what it can't cover holds the vehicle at the insurer's yard (it can't be taken out: homes.js
// spawnOwnedAt asks held) until it's paid (the Homes app, or a dealership's menu). Uninsured, it's gone - except once per
// character (goodwill: the dealer's, the first time): back for the claim, with a word about insuring it.
// Not for the starter car (it has its own way back: starter.js), a horse (it bolts, it doesn't wreck), a rental or a
// company's truck (not yours).
//   profile.vehicles[i]: + { vid (a stable id: the world's vehicle carries it as v.ownVid), ins (1: insured), cl [the
//     claims' times, ms], hold ($ owed before it comes back) } - absent on old entries; profile.insGrace: the goodwill used
import { VEHICLES } from '../../shared/vehicles.js';
import { INSURANCE, FTUE, TOW_FEE } from '../../shared/rules.js';
import { store } from '../store.js';

const DAY_MS = 86400e3;
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const nameOf = (ov) => (VEHICLES[ov.model] ? VEHICLES[ov.model].name : 'vehicle');
let vidN = 0;
// the entry's stable id (made the first time it's asked)
export function vidOf(ov) {
  if (!ov.vid) ov.vid = (Date.now() % 1e9).toString(36) + (vidN++ % 1296).toString(36).padStart(2, '0');
  return ov.vid;
}
export const insurable = (ov) => !!ov && !!VEHICLES[ov.model] && !VEHICLES[ov.model].horse && ov.model !== 'starter';
export const valueOf = (ov) => (VEHICLES[ov.model] && VEHICLES[ov.model].price) || FTUE.lot[ov.model] || INSURANCE.noValue;
export const premiumOf = (ov) => Math.max(INSURANCE.minPremium, Math.round((valueOf(ov) * INSURANCE.premium) / 10) * 10);
export const recentClaims = (ov, now = Date.now()) => (ov.cl || []).filter((t) => now - t < INSURANCE.recentDays * DAY_MS).length;
export function claimFee(ov, now = Date.now()) {
  const k = Math.min(INSURANCE.maxK, 1 + INSURANCE.perWreck * recentClaims(ov, now));
  return Math.max(INSURANCE.minFee, Math.round((valueOf(ov) * INSURANCE.fee * k) / 10) * 10);
}

// the entry a world vehicle of yours is (by its id; an older one by its model)
export function entryOf(prof, v) {
  const L = (prof && prof.vehicles) || [];
  return (v.ownVid && L.find((o) => o.vid === v.ownVid)) || (!v.ownVid ? L.find((o) => o.model === v.model && o.variant === v.variant) || L.find((o) => o.model === v.model) : null) || null;
}
// held at the insurer's yard: why it can't come out, or null
export const heldWhy = (ov) => (ov && ov.hold > 0 ? `Your ${nameOf(ov)} is at the insurer's yard - pay its ${money(ov.hold)} claim first (the Homes app, or a dealership).` : null);

const ownerOf = (world, v) => {
  const p = world.players.get(v.owner);
  return { p: p || null, prof: p ? p.profile : store.get(v.owner) };
};
const tell = (world, p, text, tone) => { if (p) { world.notify(p, text, tone); p.meDirty = true; } };

// what it costs to get it back: from the bank, or held; -> the line to say
function settle(prof, ov, fee) {
  if ((prof.bank || 0) >= fee) { prof.bank -= fee; return `back in your garage; the ${money(fee)} claim came from your bank`; }
  ov.hold = fee;
  return `held at the insurer's yard until its ${money(fee)} claim is paid (the Homes app, or a dealership)`;
}

// A vehicle of yours wrecked (burnt out, blown up) or sunk. (now: ms)
export function wrecked(world, v, why = 'wrecked', now = Date.now()) {
  if (!v || !v.owner || v.claimDone || v.starter || v.rentedBy || v.workTruck || v.forSale || (v.def && v.def.horse)) return null;
  const { p, prof } = ownerOf(world, v);
  const ov = prof && entryOf(prof, v);
  if (!ov || !insurable(ov)) return null;
  v.claimDone = 1;
  const nm = nameOf(ov);
  if (ov.ins || !prof.insGrace) {
    const grace = !ov.ins;
    if (grace) prof.insGrace = 1;
    const fee = claimFee(ov, now);
    (ov.cl ||= []).push(now);
    ov.cl = ov.cl.filter((t) => now - t < INSURANCE.recentDays * DAY_MS);
    const line = settle(prof, ov, fee);
    tell(world, p, grace ? `Your ${nm} was ${why} - it wasn't insured, but the dealer does you a favor this once: it's ${line}. Insure your vehicles (a dealership, or the Homes app): uninsured, next time it's gone.` : `Your ${nm} was ${why}. Insured: it's ${line}.`, grace ? 'warn' : 'info');
    store.touch();
    return grace ? 'grace' : 'claim';
  }
  const i = prof.vehicles.indexOf(ov);
  if (i >= 0) prof.vehicles.splice(i, 1);
  if (p && p.pendingCar != null) p.pendingCar = null;
  tell(world, p, `Your ${nm} was ${why} - and it wasn't insured. It's gone.`, 'bad');
  store.touch();
  return 'gone';
}

// A vehicle of yours towed to the impound (tow.js): insured (or the goodwill), back in your garage for the tow fee;
// uninsured, gone. -> 'claim' | 'grace' | 'gone' | null (not one of yours)
export function impounded(world, p, v, where) {
  if (v.claimDone) return 'done';   // (a wreck already claimed for, towed off the street: nothing more)
  const prof = p.profile, ov = entryOf(prof, v);
  if (!ov || !insurable(ov)) return null;
  v.claimDone = 1;
  const nm = nameOf(ov);
  if (ov.ins || !prof.insGrace) {
    const grace = !ov.ins;
    if (grace) prof.insGrace = 1;
    const line = settle(prof, ov, TOW_FEE);
    tell(world, p, `🚛 Your ${nm} was towed from ${where} - left blocking traffic. ${grace ? `It wasn't insured, but the impound lets it go this once: it's ${line}. Insure it next time (a dealership, or the Homes app).` : `Insured: it's ${line}.`}`, 'warn');
    store.touch();
    return grace ? 'grace' : 'claim';
  }
  const i = prof.vehicles.indexOf(ov);
  if (i >= 0) prof.vehicles.splice(i, 1);
  tell(world, p, `🚛 Your ${nm} was towed from ${where} - left blocking traffic. It wasn't insured: it's gone.`, 'bad');
  store.touch();
  return 'gone';
}

// Buy a policy on vehicle idx (pay: economy's cash-then-bank payer). null, or why not.
export function buy(world, p, idx, pay) {
  const ov = p.profile.vehicles[idx];
  if (!ov) return 'No such vehicle.';
  if (!insurable(ov)) return `The ${nameOf(ov)} can't be insured.`;
  if (ov.ins) return `Your ${nameOf(ov)} is insured already.`;
  const prem = premiumOf(ov);
  if (!pay(p, prem)) return `A policy is ${money(prem)} (cash + bank).`;
  ov.ins = 1;
  store.touch(); p.meDirty = true;
  world.notify(p, `Your ${nameOf(ov)} is insured (${money(prem)}). Wrecked, sunk or towed, it comes back to your garage - for a claim of ${money(claimFee(ov))}, more after recent ones.`, 'good');
  return null;
}
// Pay a held vehicle's claim. null, or why not.
export function payHold(world, p, idx, pay) {
  const ov = p.profile.vehicles[idx];
  if (!ov || !(ov.hold > 0)) return 'Nothing to pay.';
  if (!pay(p, ov.hold)) return `You need ${money(ov.hold)} (cash + bank).`;
  world.notify(p, `Claim paid: ${money(ov.hold)}. Your ${nameOf(ov)} is back in your garage.`, 'good');
  ov.hold = 0;
  store.touch(); p.meDirty = true;
  return null;
}

// the Homes app's list: [{ i, n (name), m (model), v (value), ins, prem, fee, hold, k (claims lately), no (not insurable) }]
export function rows(prof, now = Date.now()) {
  return (prof.vehicles || []).map((ov, i) => (insurable(ov) ? { i, n: nameOf(ov), m: ov.model, v: valueOf(ov), ins: ov.ins ? 1 : 0, prem: premiumOf(ov), fee: claimFee(ov, now), hold: ov.hold || 0, k: recentClaims(ov, now) } : { i, n: nameOf(ov), m: ov.model, no: 1 }));
}
// a counter's rows (a dealership, a marina, a used lot): a policy for each vehicle of yours not insured, a held one's claim
export function menuOpts(prof, opts, boats) {
  (prof.vehicles || []).forEach((ov, i) => {
    const d = VEHICLES[ov.model];
    if (!d || !insurable(ov) || (d.kind === 'boat') !== !!boats) return;
    if (ov.hold > 0) opts.push({ id: `insp:${i}`, label: `Pay the claim on your ${d.name}`, price: ov.hold, note: "at the insurer's yard" });
    else if (!ov.ins) opts.push({ id: `insb:${i}`, label: `Insure your ${d.name}`, price: premiumOf(ov), note: `claims from ${money(claimFee(ov))}` });
  });
}
