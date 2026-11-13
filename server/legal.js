// The Privacy Policy and the Terms (the owner, 11-12): DRAFTS for a lawyer's review, plain English, describing what the
// game does - served by the game server at /legal/privacy and /legal/terms (Settings > Legal opens them; Google's
// consent screen links them). What's switched on (Google Analytics, the sign-ins, resets by email) is read from the
// configuration, so the pages say what this server does. Not legal advice.
import { sendHTML, esc } from './httputil.js';
import { enabledProviders, resetsOn, PAGE_CSS } from './authhttp.js';

const CSS = PAGE_CSS + 'body{display:block;padding:24px 0}main{width:min(46em,calc(100% - 32px));margin:0 auto}h1{font-size:26px}h2{font-size:18px;margin:26px 0 6px;color:#ffd27f}li{margin:4px 0}.draft{padding:10px 12px;border:1px solid #8a6d2b;background:#2b2412;border-radius:6px;color:#ffe2a8}nav{font-size:14px;margin-bottom:14px}nav a{margin-right:14px}';
const shell = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - City Life Auto</title><style>${CSS}</style><body><main><p class="logo">CITY LIFE AUTO</p><nav><a href="/legal/privacy">Privacy Policy</a><a href="/legal/terms">Terms</a></nav><h1>${esc(title)}</h1>
<p class="draft"><b>DRAFT - not yet reviewed by a lawyer.</b> This is a plain-English draft of what the game does, for legal review before launch. It isn't legal advice and may change.</p>${body}</main>`;

export function privacyPage(L, { ga = false } = {}) {
  const pr = enabledProviders(L), contact = esc(L.contact || '[contact email - to be added before launch]'), post = esc(L.mailAddress || '[postal address - to be added before launch]');
  const signins = ['as a guest (no sign-up)', 'with an email and password', pr.google ? 'with Google' : null, pr.discord ? 'with Discord' : null, 'with a passkey (your device\'s fingerprint, face or PIN)'].filter(Boolean).join(', ');
  return shell('Privacy Policy', `
<p>City Life Auto is an online game. This page says what we keep about you, why, and how to have it deleted. We keep as little as we can.</p>
<h2>Who can play</h2>
<p>The game is for people <b>17 and older</b>. The first time you open it, it asks you to confirm your age. We don't knowingly keep anything about anyone younger; if you think a child has an account, tell us (below) and we'll delete it.</p>
<h2>Your account</h2>
<ul>
<li>You can play ${esc(signins)}.</li>
<li>Every character has an account record: a random account id, your character's name, its progress (money, bank, items, homes, cars, experience, Samaritan points, skills, looks), when it was made and last played, and settings.</li>
<li>Your browser keeps a login token for it, and a random device marker (used only to enforce a ban).</li>
<li><b>Email and password:</b> we never keep your email address for signing in - only a keyed one-way hash of it, used to find your account. Your password is kept only as a salted scrypt hash; nobody, us included, can read it. We keep whether you confirmed the address.</li>
<li><b>Google and Discord:</b> we ask them only for an id that says it's the same person next time (Google's "openid", Discord's "identify"). We don't get your email, name, picture or friends from them.</li>
<li><b>Passkeys:</b> we keep the passkey's public key and its counter; your fingerprint or face never leaves your device.</li>
</ul>
<h2>Game news by email (only if you ask)</h2>
<p>If you tick "Email me game news and updates", or turn on "Game news by email" in Settings, we keep that address, when you opted in and where (sign-up or Settings) - apart from your sign-in data. Every news email has an unsubscribe link; unsubscribing (or turning it off in Settings) deletes the address from the list.</p>
<h2>Emails we send</h2>
<p>${resetsOn(L) ? 'Password-reset and address-confirmation emails, and news if you asked for it, are sent through <b>Resend</b> (resend.com), our email provider, which handles the address to deliver the message.' : 'When email is switched on, password-reset and address-confirmation emails (and news, if you asked) are sent through <b>Resend</b> (resend.com), our email provider.'}</p>
<h2>Chat and safety</h2>
<ul>
<li>Chat lines are checked by a word filter. Recent lines are held in the server's memory for moderators; messages to an offline contact wait in their inbox.</li>
<li>We keep moderation records on accounts: reports from players, filter hits, strikes, mutes, kicks and bans, and anti-cheat flags, with notes from the staff. Staff actions are written to an audit log.</li>
<li>An account keeps a short log of its own recent events (money in and out, purchases, deaths, crimes, jobs, sign-ins) so staff can help - refund a purchase, rescue a stuck character.</li>
</ul>
<h2>Analytics</h2>
<ul>
<li>The server counts how the game is played, in totals by day (sessions, jobs, money sources, deaths, devices and frame rates), plus a few counters on each account (first and last day played). This stays on our server.</li>
<li><b>Google Analytics 4</b> ${ga ? 'is switched on' : 'is not switched on at the moment; if it is,'}: it loads only if you choose <b>Accept</b> on the first screen (Essential only keeps it off), with ad features off. Google gets a hashed account id, never your name or email. You can change your choice in Settings.</li>
</ul>
<h2>What we don't keep</h2>
<ul><li>We don't keep IP addresses. The server sees your address while you're connected and uses it in memory to limit abuse (too many tries); it isn't written down.</li><li>We don't sell anything about you, and there are no ads.</li></ul>
<h2>How long</h2>
<p>Your account and character are kept while the game runs, so you can come back. Season resets wipe progress but keep the account. Analytics totals are kept for 90 days.</p>
<h2>Deleting your account, unsubscribing</h2>
<ul><li><b>Start fresh</b> (Settings) erases your character's progress at once.</li><li>To delete your whole account, write to us at ${contact} from the game's Settings, Account (it shows your account id) - we delete it and everything tied to it.</li><li>Unsubscribe from news with the link in any news email, or in Settings, Account.</li></ul>
<h2>Contact</h2>
<p>${contact}<br>${post}</p>
<h2>Credits</h2>
<p>Some icons are from <a href="https://game-icons.net">game-icons.net</a>, licensed under <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>. Some UI icons are by <a href="https://kenney.nl">Kenney</a> (CC0).</p>`);
}

export function termsPage(L) {
  const contact = esc(L.contact || '[contact email - to be added before launch]');
  return shell('Terms of Service', `
<p>These terms are the rules for playing City Life Auto, a free online game in public beta.</p>
<h2>Who can play</h2>
<p>You must be <b>17 or older</b>. The game has mature themes: crime, violence and online play with other people that isn't rated.</p>
<h2>Your account</h2>
<ul><li>You can play as a guest, or sign in to keep your character on any device. Keep your password to yourself; you're responsible for what's done with your account.</li><li>A guest character lives in one browser: clearing it can lose the character unless you've signed in or made a transfer code.</li><li>Your name must not be hateful, sexual, or pretend to be staff or someone else. Names held by signed-in players are theirs; a guest's name can be given to a member who picks it.</li></ul>
<h2>Playing fair</h2>
<ul><li>No cheating, bots, exploits on purpose, or attacking the servers.</li><li>No harassment, hate, sexual content or threats in chat or names, and never share anyone's personal information.</li><li>Staff can mute, strike, kick, send to the game's prison or ban an account that breaks these rules, and remove names.</li></ul>
<h2>The game and its money</h2>
<ul><li>In-game money, items, homes and cars have no real-world value and can't be sold or exchanged for real money.</li><li>It's a beta: things change, break and get reset. Seasons end with a reset of progress (your account stays).</li><li>We may change or end the game or these terms; we'll say so in the game.</li></ul>
<h2>No warranty</h2>
<p>The game is provided as it is, without any warranty, to the extent the law allows.</p>
<h2>Contact</h2>
<p>${contact}</p>`);
}

// -> handle(req, res, url): true when it was a /legal/ page
export function legalHttp({ launch, ga = () => false }) {
  return function handle(req, res, url) {
    const p = url.pathname;
    if (p !== '/legal/privacy' && p !== '/legal/terms') return false;
    sendHTML(res, 200, p === '/legal/privacy' ? privacyPage(launch, { ga: ga() }) : termsPage(launch), { 'cache-control': 'max-age=300' });
    return true;
  };
}
