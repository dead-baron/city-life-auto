// The Founder's Pack, bought on Ko-fi (the owner, 11-17; shared/rules.js SUPPORT; docs/LAUNCH-SETUP.md section 10):
//   - POST /kofi/webhook: Ko-fi's webhook (Ko-fi > More > API). A form post with one field, data: a JSON object -
//     verification_token, message_id, timestamp, type ('Donation' | 'Subscription' | 'Shop Order' | 'Commission'),
//     is_public, from_name, message, amount, url, email, currency, is_subscription_payment, is_first_subscription_payment,
//     kofi_transaction_id, shop_items ([{ direct_link_code, variation_name, quantity }] on a Shop Order), tier_name,
//     shipping. The token checked against CLA_KOFI_TOKEN (the server's environment: deploy/set-keys.sh - never in the
//     repo); answered 200 at once, then the order kept, once per transaction id (Ko-fi sends again when it gets no 200).
//     Kept: the transaction id, the type, the shop items' link codes, the tier, the amount and currency, the time - never
//     the buyer's email, name, message or address. Every order a line in the admin log.
//   - The pack: a Shop Order with the pack's item (its link code in CLA_KOFI_PACK - the code at the end of the item's link,
//     ko-fi.com/s/<code>; none set: any shop order) or a Subscription payment (a monthly member, any tier).
//   - Claimed: automatically when the order's message holds a member's supporter code (Settings > Help, beside the Ko-fi
//     button: supporterCode); else in Settings with the transaction id from the Ko-fi receipt (claim: once, by one account,
//     SUPPORT.claimTries wrong ids per SUPPORT.claimWindowMin minutes). A full account only: a guest's would be lost with
//     the guest. The owner grants or takes it back in the admin panel (server/admin.js pack).
//   store.kept.kofi: { orders: { <tx>: { type, items, tier, amt, cur, at, pack (1|0), by (pid | null), how ('code' |
//   'claim' | null), cat (claimed at), rev (1: taken back by the owner - admin.js pack) } } }.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SUPPORT } from '../shared/rules.js';
import { readForm, sendJSON, createRateLimiter } from './httputil.js';
import { cosmOf, grantFounder, hasPack } from './systems/cosmetics.js';

export const KOFI_PATH = '/kofi/webhook';
const TYPES = new Set(['Donation', 'Subscription', 'Shop Order', 'Commission']);
// the supporter code: six letters and digits with nothing to misread (no 0 O 1 I L), from the account id and the server's
// secret - so it can't be worked out from an id - shown as CLA-XXXXXX
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function supporterCode(pid, secret) {
  const b = createHmac('sha256', String(secret)).update('supporter\0' + String(pid)).digest();
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHA[b[i] % ALPHA.length];
  return 'CLA-' + s;
}
// the codes in a message (a note typed by hand: any case, with or without the CLA- and its dash)
export function codesIn(text) {
  const out = [], t = String(text || '').toUpperCase().slice(0, 2000);
  for (const m of t.matchAll(/(?:^|[^A-Z0-9])(?:CLA[-\s]?)?([A-Z0-9]{6})(?![A-Z0-9])/g)) if ([...m[1]].every((c) => ALPHA.includes(c))) out.push('CLA-' + m[1]);
  return out;
}
const normTx = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64);
const txOk = (s) => /^[a-z0-9-]{6,64}$/.test(s);
const clip = (v, n) => (v === null || v === undefined ? null : String(v).slice(0, n));
const sameSecret = (a, b) => { const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(x, y); };

// opts: { store, accounts, world, log (the admin log), token (CLA_KOFI_TOKEN), packCodes ([CLA_KOFI_PACK]), secret, now, ip }
export function createKofi(opts) {
  const { store, accounts, world, log, secret } = opts;
  const now = opts.now || Date.now, token = String(opts.token || ''), packCodes = (opts.packCodes || []).map((c) => String(c).trim().toLowerCase()).filter(Boolean);
  const ipOf = opts.ip || ((req) => (req.socket && req.socket.remoteAddress) || '?');
  const rl = createRateLimiter(now), tries = new Map();
  const K = () => { const k = (store.kept.kofi ||= { orders: {} }); k.orders ||= {}; return k; };
  const isMember = (pid) => !accounts.isGuest(pid);
  const online = (pid) => { const p = world.players.get(pid); return p && p.profile ? p : null; };
  let index = null;   // supporter code -> account id (members), built when an order needs it and again on a miss
  function pidOfCode(code, rebuild = true) {
    if (index && index.has(code)) return index.get(code);
    if (index && !rebuild) return null;
    index = new Map();
    for (const prof of store.all()) if (prof.acct && prof.acct.kind === 'member') index.set(supporterCode(prof.pid, secret), prof.pid);
    return index.get(code) || null;
  }
  function grant(pid, tx, how) {
    const prof = store.get(pid);
    if (!prof) return false;
    const q = online(pid), fresh = grantFounder(world, prof, q, tx);
    if (q && q.conn) { try { q.conn.sendJSON(state(q)); } catch { /* gone */ } }   // (Settings > Help brought up to date)
    const o = tx && K().orders[tx];
    if (o) { o.by = pid; o.how = how; o.cat = now(); }
    store.touch();
    log.append({ who: { id: pid, n: prof.name }, what: 'kofi-grant', target: { id: pid, n: prof.name }, before: !fresh, after: true, note: `${SUPPORT.pack} ${fresh ? 'given' : 'already theirs'} (${how}${tx ? ' ' + tx : ''})` });
    return fresh;
  }

  // an order from Ko-fi, its token already checked -> what happened (for the tests): 'dup' | 'bad' | 'kept' | 'granted'
  function order(d) {
    const tx = normTx(d.kofi_transaction_id), type = String(d.type || '');
    if (!txOk(tx) || !TYPES.has(type)) { log.append({ who: null, what: 'kofi-order', ok: false, note: `refused: ${!txOk(tx) ? 'no transaction id' : 'type ' + clip(type, 20)}` }); return 'bad'; }
    const O = K().orders;
    if (O[tx]) return 'dup';
    const items = Array.isArray(d.shop_items) ? d.shop_items.slice(0, 20).map((i) => clip(i && i.direct_link_code, 32)).filter(Boolean) : [];
    const pack = type === 'Subscription' || (type === 'Shop Order' && (!packCodes.length || items.some((c) => packCodes.includes(c.toLowerCase()))));
    const o = O[tx] = { type, items, tier: clip(d.tier_name, 40), amt: clip(d.amount, 12), cur: clip(d.currency, 3), at: now(), pack: pack ? 1 : 0, by: null, how: null };
    store.touch();
    log.append({ who: null, what: 'kofi-order', note: `${type} ${o.amt || '?'} ${o.cur || ''}${items.length ? ' items ' + items.join(',') : ''}${o.tier ? ' tier ' + o.tier : ''} - tx ${tx}${pack ? ` (the ${SUPPORT.pack})` : ''}` });
    if (!pack) return 'kept';
    // the supporter code in the order's note: to that account at once (a member's; a guest's waits for a claim)
    let fresh = true;   // (the index built again at most once an order: a word like THANKS looks like a code)
    for (const code of codesIn(d.message)) {
      const pid = pidOfCode(code, fresh); fresh = false;
      if (!pid) continue;
      if (!isMember(pid)) { log.append({ who: null, what: 'kofi-order', ok: false, target: { id: pid }, note: `tx ${tx}: the code is a guest's - waits for a claim from a full account` }); return 'kept'; }
      grant(pid, tx, 'code');
      return 'granted';
    }
    return 'kept';
  }

  // POST /kofi/webhook -> true when it was this path
  async function http(req, res, url) {
    if (url.pathname !== KOFI_PATH) return false;
    if (req.method !== 'POST') { sendJSON(res, 405, { ok: false }); return true; }
    if (!rl.hit(`kofi:${ipOf(req)}`, 120, 60e3)) { sendJSON(res, 429, { ok: false }); return true; }
    const form = await readForm(req, 64 * 1024);
    let d = null;
    try { d = form && form.data ? JSON.parse(form.data) : null; } catch { d = null; }
    if (!d || typeof d !== 'object') { sendJSON(res, 400, { ok: false }); return true; }
    if (!token) { sendJSON(res, 503, { ok: false }); log.append({ who: null, what: 'kofi-order', ok: false, note: 'a Ko-fi webhook came in, but CLA_KOFI_TOKEN is not set (deploy/set-keys.sh)' }); return true; }
    if (!sameSecret(d.verification_token || '', token)) { sendJSON(res, 403, { ok: false }); log.append({ who: null, what: 'kofi-order', ok: false, note: 'refused: wrong verification token' }); return true; }
    sendJSON(res, 200, { ok: true });   // (Ko-fi gets its 200 first; the order is kept after)
    try { order(d); } catch (e) { console.error('[kofi] order', e && e.message); }
    return true;
  }

  // ---- the page's Settings > Help: { t: 'acct', a: 'support', k: 'state' | 'claim' | 'color', tx, on } ----------------------
  function state(p) {
    const guest = accounts.isGuest(p.pid), C = cosmOf(p.profile);
    return { t: 'acct', a: 'support', guest, code: guest ? null : supporterCode(p.pid, secret), has: hasPack(p.profile), color: C.nc === SUPPORT.color, price: SUPPORT.price, pack: SUPPORT.pack };
  }
  // -> null, or why not
  function claim(p, raw) {
    if (accounts.isGuest(p.pid)) return `Make an account first (Settings > Account > Sign in) - a guest's ${SUPPORT.pack} would be lost with the guest.`;
    const t = now(), win = SUPPORT.claimWindowMin * 60e3, mine = (tries.get(p.pid) || []).filter((x) => t - x < win);
    if (mine.length >= SUPPORT.claimTries) return `Too many tries - wait ${SUPPORT.claimWindowMin} minutes, or ask in the Discord.`;
    const tx = normTx(raw), o = txOk(tx) ? K().orders[tx] : null;
    if (!o) { mine.push(t); tries.set(p.pid, mine); return 'No Ko-fi order with that transaction id yet - check it (it\'s on your Ko-fi receipt), or try again in a minute if you\'ve just paid.'; }
    if (o.rev) return 'That order was refunded, so the pack went with it. If that\'s wrong, ask in the Discord.';
    if (o.by && o.by !== p.pid) return 'That order was claimed by another account. If that\'s wrong, ask in the Discord.';
    if (!o.pack) return `Thank you for the ${o.type === 'Donation' ? 'donation' : 'support'}! That order isn't the ${SUPPORT.pack}, so there's nothing to claim.`;
    if (o.by === p.pid && hasPack(p.profile)) return `The ${SUPPORT.pack} is yours already.`;
    tries.set(p.pid, []);
    grant(p.pid, tx, 'claim');
    return null;
  }
  function message(p, msg) {
    const k = String(msg.k || 'state');
    if (k === 'claim') { const err = claim(p, msg.tx); return { ...state(p), k, ok: !err, err: err || undefined }; }
    if (k === 'color') {
      if (!hasPack(p.profile)) return { ...state(p), k, ok: false, err: `That comes with the ${SUPPORT.pack}.` };
      const C = cosmOf(p.profile); C.nc = msg.on ? SUPPORT.color : C.nc === SUPPORT.color ? null : C.nc;
      store.touch(); p.npDirty = true;
      return { ...state(p), k, ok: true };
    }
    return state(p);
  }
  return { http, order, message, claim, state, code: (pid) => supporterCode(pid, secret), orders: () => K().orders };
}
