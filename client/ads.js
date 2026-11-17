// Ads on the page (the owner, 11-16: ready to turn on when the time is right; no interrupting ads in the beta - opt-in
// rewarded ads only): Google's H5 Games Ads, the Ad Placement API (adConfig, adBreak with type 'reward'). Loaded by
// main.js only when the server says ads are on (/launch.json and the job computer's menu: { ad: { mode, tk } } - the
// server's CLA_ADS: server/config.js) and never on a game portal's page (CrazyGames, Poki... run their own ads).
//   - Google's script (adsbygoogle.js with the publisher id, data-adbreak-test="on" in test mode) is added the first
//     time the job computer offers an ad - not at start, not on the title screen. It asks for non-personalized ads
//     (requestNonPersonalizedAds: the game is 13+); in the EEA, the UK and Switzerland Google's own consent message
//     (AdSense > Privacy & messaging) asks before any ad.
//   - "Watch an ad" pressed: adBreak({ type: 'reward' }) right then, in the press (Google wants showAdFn called from the
//     player's own tap). beforeReward(showAdFn) - an ad is ready: shown at once ({ t: 'ad', a: 'start', tk }); adViewed -
//     watched to its end ({ a: 'viewed' }: the SERVER pays, server/systems/jobcenter.js, never the page); adDismissed -
//     closed early (nothing); adBreakDone(placementInfo) - always last ({ a: 'done', st: its breakStatus }); no ad ready
//     (beforeReward never comes): a fading line. beforeAd / afterAd: the game's sound hushed while it plays.
// env: { win, doc, send(obj), toast(text, tone), sound() -> bool, hush(on) } (tests pass fakes)
const SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
const CLIENT_RE = /^ca-pub-\d{9,20}$/;
// a game portal's page (its own ads, its own rules): by the address, the page that framed us, or ?portal=1
export function onPortal(win) {
  try {
    const l = win.location || {}, qs = String(l.search || ''), host = String(l.hostname || '');
    if (/[?&]portal=1\b/.test(qs)) return true;
    const PORTAL = /(^|\.)(crazygames|poki|poki-gdn|gamedistribution|gamemonetize|itch|newgrounds|armorgames|kongregate|y8)\.(com|io|net|zone)$/i;
    if (PORTAL.test(host)) return true;
    const anc = l.ancestorOrigins ? [...l.ancestorOrigins] : [];
    let ref = '';
    try { ref = new URL(win.document.referrer).hostname; } catch { ref = ''; }
    return [...anc.map((o) => { try { return new URL(o).hostname; } catch { return ''; } }), win.top !== win ? ref : ''].some((h) => h && PORTAL.test(h));
  } catch { return false; }
}
export function createAds(env) {
  const win = env.win, doc = env.doc;
  let mode = 'off', client = '', added = false, ready = false, busy = false;
  const push = (o) => { (win.adsbygoogle ||= []).push(o); };
  // ads on (cfg: { mode: 'test' | 'on', client }) -> whether the script is (being) loaded
  function load(cfg) {
    if (!cfg || (cfg.mode !== 'test' && cfg.mode !== 'on') || !CLIENT_RE.test(String(cfg.client || '')) || onPortal(win)) return false;
    if (added) return true;
    mode = cfg.mode; client = cfg.client; added = true;
    win.adsbygoogle = win.adsbygoogle || [];
    win.adsbygoogle.requestNonPersonalizedAds = 1;
    const s = doc.createElement('script');
    s.async = true;
    s.src = `${SRC}?client=${encodeURIComponent(client)}`;
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-ad-client', client);
    if (mode === 'test') s.setAttribute('data-adbreak-test', 'on');
    s.onerror = () => { added = false; ready = false; };
    (doc.head || doc.body).appendChild(s);
    push({ preloadAdBreaks: 'on', sound: env.sound() ? 'on' : 'off', onReady: () => { ready = true; } });
    return true;
  }
  // the game's sound setting changed
  function sound(on) { if (added) push({ sound: on ? 'on' : 'off' }); }
  // "Watch an ad" pressed (tk: the server's ticket) -> false if no ad can be asked for now
  function reward(tk, name = 'job_computer') {
    if (!added || busy) { env.toast(added ? 'An ad is already on.' : 'Ads aren\'t available right now.', 'warn'); return false; }
    busy = true;
    let offered = false, over = false;
    // (Google's script blocked or not answering: never stuck - the press is let go after a while)
    const guard = (win.setTimeout || setTimeout)(() => { if (!offered && !over) { over = true; busy = false; env.toast('No ad to watch right now - try again in a little while.', 'info'); } }, 8000);
    push({
      type: 'reward', name,
      beforeAd: () => env.hush(true),
      afterAd: () => env.hush(false),
      beforeReward: (showAdFn) => { offered = true; env.send({ t: 'ad', a: 'start', tk }); showAdFn(); },
      adDismissed: () => env.toast('Closed before the end - no reward this time.', 'info'),
      adViewed: () => env.send({ t: 'ad', a: 'viewed', tk }),
      adBreakDone: (info) => {
        (win.clearTimeout || clearTimeout)(guard);
        if (over && !offered) return;
        over = true; busy = false; env.hush(false);
        const st = String((info && info.breakStatus) || (offered ? 'done' : 'notReady')).slice(0, 20);
        env.send({ t: 'ad', a: 'done', tk, st });
        if (!offered) env.toast('No ad to watch right now - try again in a little while.', 'info');
      },
    });
    return true;
  }
  return { load, reward, sound, get state() { return { mode, client, added, ready, busy }; } };
}
