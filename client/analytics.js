// Google Analytics 4 on the page: audience, devices and acquisition (the owner, 11-03). The gameplay truth goes from
// the server (server/ga.js, the Measurement Protocol); the self-hosted dashboard stays the source of truth.
// - Loaded after the page is up (main.js launchCall), never blocking startup.
// - Only with a measurement id from the server (/launch.json and the welcome: GA_MEASUREMENT_ID) and only once the
//   player accepted analytics at the first-launch gate (client/account.js): until then, and with "Essential only",
//   gtag.js is never fetched and nothing goes to Google.
// - Consent Mode v2: analytics_storage, ad_storage, ad_user_data and ad_personalization default to denied; Accept grants
//   analytics_storage only: the gate's text asks about analytics, not ads (ad_storage, ad_user_data and
//   ad_personalization stay denied until the game shows ads and the gate says so).
// - The GA client id and session id go to the server ({ t: 'ga', on: 1, cid, sid }) so its events join the same user;
//   withdrawing consent tells it to stop ({ t: 'ga', on: 0 }).
// Recommended event names where they fit; the funnel's own: title_view, play_click, in_world. Server-sent: login,
// sign_up, earn_virtual_currency, spend_virtual_currency, tutorial_begin / tutorial_complete, select_content.
const SRC = 'https://www.googletagmanager.com/gtag/js?id=';
const ID_RE = /^G-[A-Z0-9]{4,16}$/;
const ERR_MAX = 10;

// env: { win, doc, send(obj) } - the page's window and document (tests pass fakes)
export function createAnalytics(env) {
  const win = env.win, doc = env.doc;
  let id = '', consent = null, loaded = false, granted = false, errs = 0;
  const pending = [];
  const gtag = function () { (win.dataLayer ||= []).push(arguments); };
  function load() {
    if (loaded || !id || consent !== 'all') return false;
    loaded = true;
    win.dataLayer ||= [];
    win.gtag = gtag;
    gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    granted = true;
    gtag('js', new Date());
    gtag('config', id, { send_page_view: true, allow_google_signals: false, cookie_flags: 'SameSite=None;Secure' });
    const s = doc.createElement('script');
    s.async = true;
    s.src = SRC + encodeURIComponent(id);
    s.onload = () => ids();
    doc.head.appendChild(s);
    for (const [n, p] of pending.splice(0)) gtag('event', n, p);
    return true;
  }
  function ids() {
    if (!granted) return;
    let cid = null, sid = null;
    const done = () => { if (cid && env.send) env.send({ t: 'ga', on: 1, cid, sid }); };
    gtag('get', id, 'client_id', (v) => { cid = v; if (sid !== null) done(); });
    gtag('get', id, 'session_id', (v) => { sid = v || ''; if (cid) done(); });
  }
  return {
    // the measurement id from the server ('' = GA off)
    setId(v) { id = ID_RE.test(String(v || '')) ? String(v) : ''; load(); },
    // the player's choice: 'all' loads GA (once there's an id); 'essential' keeps it off, and turns it off if it was on
    consent(v) {
      consent = v === 'all' ? 'all' : 'essential';
      if (consent === 'all') { if (loaded && !granted) { gtag('consent', 'update', { analytics_storage: 'granted' }); granted = true; ids(); } else load(); }
      else if (loaded && granted) { gtag('consent', 'update', { analytics_storage: 'denied' }); granted = false; if (env.send) env.send({ t: 'ga', on: 0 }); }
      else if (env.send) env.send({ t: 'ga', on: 0 });
    },
    // a new connection (a reconnect, a new server session): the server forgets the GA ids with the session - sent again
    resend() { if (loaded && granted && win.gtag) ids(); },
    // the player's device and settings, as user properties (register them as custom dimensions: docs/LAUNCH-SETUP.md)
    props(p) { if (granted) gtag('set', 'user_properties', p); },
    event(name, params = {}) {
      if (consent !== 'all') return false;
      if (!loaded) { if (pending.length >= 30) return false; pending.push([name, params]); return true; }   // (held till the id comes)
      if (!granted) return false;
      gtag('event', name, params);
      return true;
    },
    // a page error: counted only (where it happened), at most ERR_MAX a page
    error(where) { if (errs >= ERR_MAX) return false; errs++; return this.event('client_error', { where: String(where || 'page').slice(0, 20) }); },
    // the perf report's buckets (client/diag.js perfPayload)
    perf(r) {
      if (!r) return false;
      const fps = r.fps || 0, ms = (r.at && r.at.screen) || 0;
      const fpsB = fps >= 55 ? '55+' : fps >= 45 ? '45-54' : fps >= 30 ? '30-44' : fps >= 20 ? '20-29' : '<20';
      const loadB = !ms ? 'unknown' : ms < 5000 ? '<5s' : ms < 10000 ? '5-10s' : ms < 20000 ? '10-20s' : ms < 40000 ? '20-40s' : '40s+';
      const dc = /iPad|Tablet/.test(r.ua || '') ? 'tablet' : /Mobile|iPhone|Android/.test(r.ua || '') ? 'phone' : 'desktop';
      this.props({ device_class: dc, graphics_preset: r.preset || 'unknown' });
      return this.event('perf_report', { stage: r.stage || 'load', fps_bucket: fpsB, load_bucket: loadB, device_class: dc, graphics_preset: r.preset || 'unknown' });
    },
    get state() { return { id, consent, loaded, granted }; },
  };
}
