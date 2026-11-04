// Google Analytics 4 from the server (the owner, 11-03: GA4 as on his earlier game, as a hybrid with the self-hosted
// analytics): the gameplay truth the page can't fake - sign-ups and logins by method, earning and spending by source,
// deaths by cause, jobs done, crimes, leisure - sent through the Measurement Protocol with the GA client id the page
// reports. Only for a player whose page reported one, which it does only once they've accepted analytics in the
// first-launch consent choice (client/analytics.js): with no consent nothing about them goes to Google. With no
// GA_MEASUREMENT_ID or GA_API_SECRET nothing is queued at all.
// Nothing personal: the account id only as a keyed hash (user_id), never a name, an email or an address.
// The tick never waits on it: event() is an array push; flush() runs on its own timer, batches up to 25 events a client
// a request (GA's limit), and drops what it can't send. The queue is capped (the oldest dropped).
export const MP_URL = 'https://www.google-analytics.com/mp/collect';
export const MAX_BATCH = 25, MAX_QUEUE = 4000;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const RESERVED = /^(ga_|google_|firebase_)/;
const CID_RE = /^[0-9]{1,12}\.[0-9]{1,12}$/;

function cleanParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {}).slice(0, 24)) {
    if (!NAME_RE.test(k) || RESERVED.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 100);
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
  }
  return out;
}

// opts: { measurementId, apiSecret, fetch, now, userHash(pid) -> string, regionOf(p) -> string, log, url }
export function createGA(opts) {
  const now = opts.now || Date.now, http = opts.fetch || globalThis.fetch, log = opts.log || console;
  const enabled = !!(opts.measurementId && opts.apiSecret);
  const queue = [];
  let sending = false, sent = 0, dropped = 0, failed = 0;
  // the page's GA ids: { cid, sid } (set on consent, cleared when it's withdrawn)
  function setClient(p, cid, sid) {
    if (!enabled || typeof cid !== 'string' || !CID_RE.test(cid)) { p.ga = null; return false; }
    p.ga = { cid, sid: /^[0-9]{1,14}$/.test(String(sid || '')) ? String(sid) : null, uid: opts.userHash ? opts.userHash(p.pid) : undefined };
    return true;
  }
  const clear = (p) => { p.ga = null; p.gaMoney = null; };
  const enabledFor = (p) => enabled && !!(p && p.ga);
  function event(p, name, params = {}) {
    if (!enabledFor(p) || !NAME_RE.test(name) || RESERVED.test(name)) return false;
    const ps = cleanParams(params);
    ps.engagement_time_msec = 1;
    if (p.ga.sid) ps.session_id = p.ga.sid;
    if (p.profile && p.badge !== undefined) ps.faction = p.badge ? 'police' : p.wanted > 0 ? 'criminal' : 'citizen';
    if (opts.regionOf && !ps.region) { try { const r = opts.regionOf(p); if (r) ps.region = String(r).slice(0, 40); } catch { /* no map */ } }
    queue.push({ cid: p.ga.cid, uid: p.ga.uid, t: now(), name, params: ps });
    if (queue.length > MAX_QUEUE * 1.25) { dropped += queue.length - MAX_QUEUE; queue.splice(0, queue.length - MAX_QUEUE); }   // (trimmed in chunks: a push stays O(1))
    return true;
  }
  // the requests the queue makes now: one per client, up to 25 events each (exported for the tests' payload checks)
  function batches(list) {
    const by = new Map(), out = [];
    for (const e of list) {
      let b = by.get(e.cid);
      if (!b || b.events.length >= MAX_BATCH) { b = { client_id: e.cid, ...(e.uid ? { user_id: e.uid } : {}), non_personalized_ads: true, events: [] }; by.set(e.cid, b); out.push(b); }
      b.events.push({ name: e.name, params: e.params, timestamp_micros: e.t * 1000 });
    }
    return out;
  }
  async function flush() {
    if (!enabled || sending || !queue.length) return 0;
    sending = true;
    const list = queue.splice(0, MAX_BATCH * 40);
    const url = `${opts.url || MP_URL}?measurement_id=${encodeURIComponent(opts.measurementId)}&api_secret=${encodeURIComponent(opts.apiSecret)}`;
    let n = 0;
    try {
      for (const body of batches(list)) {
        try {
          const r = await http(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
          if (r && r.status >= 200 && r.status < 300) { n += body.events.length; sent += body.events.length; } else failed += body.events.length;
        } catch { failed += body.events.length; }
      }
    } finally { sending = false; }
    if (failed && failed % 100 === 0) log.warn(`[ga] ${failed} events could not be sent so far`);
    return n;
  }
  return { enabled, setClient, clear, enabledFor, event, flush, batches, queue, get stats() { return { enabled, queued: queue.length, sent, dropped, failed }; } };
}
