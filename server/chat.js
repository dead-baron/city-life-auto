// Chat (the owner, 11-03; shared/chatdefs.js has the channels, emotes and limits). Server-side all of it: who hears a
// line (range, crew, faction, contacts), the word filter (server/chatfilter.js: hate and sexual terms masked), rate
// limits (guests tighter), mutes and blocks (kept with the account, so on every device), reports and strikes
// (server/moderation.js), contacts (met, crewed or traded with) and the phone's inbox for whoever's offline.
// Messages (page -> server):
//   { t: 'chat', ch: 'near'|'crew'|'faction'|'phone', text, to? (phone: a contact's id) }
//   { t: 'emote', e, m? }                          (shared/chatdefs.js EMOTES: its animation on the body - systems/emote.js;
//                                                   Dance with m: that move, the picker's Dances tab)
//   { t: 'typing', on }                            the chat line being typed in (on), or not any more - the dots over the head
//   { t: 'chatset', off: { near?, crew?, faction?, phone? } }   channels switched off for you
//   { t: 'mod', a: 'mute'|'unmute'|'block'|'unblock'|'report', id, why?, note? }
//   { t: 'contacts' } · { t: 'inbox' }
//   { t: 'friend', a: 'ask'|'yes'|'no'|'unfriend'|'forget', id }   a friend request to a contact, a crewmate or someone near;
//     accept or decline one; stop being friends (still a contact); remove a contact (both ways, till you meet again)
//   { t: 'chatset', who: 'met'|'friends' }        who can text me (shared/chatdefs.js WHO_TEXT), kept with the account
// (server -> page): { t: 'chat', ch, n (sender's name), id (sender's public id), eid (their ped, for the bubble: near),
//   text, at, own?, bb? (near: a speech bubble too - a quick line or a short one; a long line goes to the log only) }
//   · { t: 'emote', eid, e, n, id, b? (its balloon over the head), lg? (a line in the log) } - only for an emote with a
//   balloon or a log line (the rest the body says) · { t: 'typing', eid, on } (the people near, while someone types) · { t: 'chatstate', off, muted, strikes, guest, max, mutes, blocks,
//   names ({ id: name } of the mutes and blocks), me, crew (in a crew), fac ('police' | 'gang' | null), who ('met' | 'friends') }
//   · { t: 'contacts', l: [{ id, n, how, on, crew, fr (a friend), rs (your request waiting with them), at }] (friends
//   first, then crew, online, recent), rq: [{ id, n, at }] (friend requests waiting for you) } · { t: 'inbox', l: [...chat
//   lines] } · { t: 'chatsay', ok, err } · { t: 'friendres', ok, note | err } (a contacts list follows)
// Safety (the owner, 11-15 - open to players 13+): contact details in every line masked (chatfilter.js contact); a line
// fishing for personal info (age, home, school, real name, photos, another app, secrets) goes to the staff's Review list
// as 'safety' (chatfilter.js fishing) - never blocked - and whoever it reached gets the "never share" tip now and then.
import { CHAT, CHANNELS, EMOTES, REPORT_WHY, FACTIONS, QUICK, emoteWire, emoteId } from '../shared/chatdefs.js';
import { keyedHash } from './auth.js';
import { contact as maskContact, fishing } from './chatfilter.js';
import { chatData, reporterWeight } from './moderation.js';
import * as crews from './systems/crews.js';
import * as emotes from './systems/emote.js';

const PX = 32;

// links: our own links that pass the contact filter (the Discord invite, the Ko-fi page; deadbaron.com always does)
export function createChat({ accounts, filter, mod, now = Date.now, onLine = null, links = [] }) {
  const handles = new Map();   // pid -> public id (and back)
  const byHandle = new Map();
  function hid(pid) {
    let h = handles.get(pid);
    if (!h) { h = keyedHash('who', pid).slice(0, 12); handles.set(pid, h); byHandle.set(h, pid); }
    return h;
  }
  const acctOf = (p) => accounts.get(p.pid);
  const cd = (p) => chatData(acctOf(p));
  const guest = (p) => accounts.isGuest(p.pid);
  const say = (p, o) => { if (p.conn && p.conn.open !== false) p.conn.sendJSON(o); };
  const recent = new WeakMap();   // p -> { lines: [at...], phone: [at...], last: { text, at }, emoteAt, said: [], typ: typing since (0: not), told: who saw the dots, zzzAt }
  const rec = (p) => { let r = recent.get(p); if (!r) { r = { lines: [], phone: [], last: null, emoteAt: -1e9, said: [], typ: 0, told: null, zzzAt: 0 }; recent.set(p, r); } return r; };

  // the faction you talk to: police on duty, or your gang (a biker group's channel waits for FACTIONS.biker)
  function factionKey(p) {
    if (p.badge && FACTIONS.police) return 'police';
    const g = p.profile && p.profile.gang;
    if (g && FACTIONS.gang) return `gang:${g}`;
    const b = p.profile && p.profile.biker;
    if (b && FACTIONS.biker) return `biker:${b}`;
    return null;
  }
  const hears = (q, from, ch) => {
    if (!q.conn) return false;
    const c = cd(q);
    if (c.off[ch]) return false;
    return !c.mutes.includes(from.pid) && !c.blocks.includes(from.pid);
  };
  function line(p, ch, text, extra = {}) { return { t: 'chat', ch, n: p.name, id: hid(p.pid), eid: p.ped ? p.ped.id : 0, text, at: now(), ...extra }; }

  // contacts: met (near for a while), crewed or traded with - both ways
  function addContact(a, b, how) {
    if (!a || !b || a.pid === b.pid) return;
    for (const [x, y] of [[a, b], [b, a]]) {
      const c = cd(x);
      const had = c.contacts[y.pid];
      c.contacts[y.pid] = { ...had, n: y.name, at: now(), how: had && had.how !== 'met' ? had.how : how };
      const keys = Object.keys(c.contacts).filter((k) => !c.contacts[k].fr);   // (friends are never pushed out)
      if (keys.length > CHAT.contactsMax) { keys.sort((k1, k2) => c.contacts[k1].at - c.contacts[k2].at); for (const k of keys.slice(0, keys.length - CHAT.contactsMax)) delete c.contacts[k]; }
    }
    accounts.touch();
  }
  // the people near each other long enough meet (called about once a second)
  const nearFor = new Map();   // 'pidA|pidB' -> seconds
  function update(world, dt = 1) {
    const list = [];
    for (const q of world.players.values()) if (q.conn && q.ped && !q.ped.dead && !q.ped.hidden) list.push(q);
    const r2 = (CHAT.metM * PX) ** 2, seen = new Set();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], dx = a.ped.x - b.ped.x, dy = a.ped.y - b.ped.y;
      if (dx * dx + dy * dy > r2) continue;
      const k = a.pid < b.pid ? `${a.pid}|${b.pid}` : `${b.pid}|${a.pid}`;
      seen.add(k);
      const t = (nearFor.get(k) || 0) + dt;
      nearFor.set(k, t);
      if (t >= CHAT.metS && t - dt < CHAT.metS) { const ca = cd(a).contacts[b.pid]; if (!ca) addContact(a, b, 'met'); }
    }
    for (const k of nearFor.keys()) if (!seen.has(k)) nearFor.delete(k);
    // the typing dots no word has kept up (the page refreshes them while its line is in use), the dead's, the gone's;
    // asleep (the Sleep pose): the Zzz balloon again now and then
    for (const p of world.players.values()) {
      const r = recent.get(p);
      if (r && r.typ && (now() - r.typ > CHAT.typingS * 1000 || !p.conn || !p.ped || p.ped.dead)) typing(world, p, false);
      if (p.ped && emotes.holding(p.ped, 'sleep') && r && now() - r.zzzAt >= CHAT.zzzS * 1000) { r.zzzAt = now(); tell(world, p, 'sleep', true); }
    }
  }

  const blocked = (c, pid) => c.blocks.includes(pid) || c.mutes.includes(pid);
  // who can text me: everyone met (the default), or friends and crew only (c.who) - the phone channel and the inbox
  const textOk = (c, from, me) => c.who !== 'friends' || !!(c.contacts[from] && c.contacts[from].fr) || crews.mates({ pid: from }, { pid: me });
  // a line fishing for personal info: to the staff's Review list (its last few lines, the masked text - what was shown),
  // a sender at most once every CHAT.safetyGapS (the lines in between ride along); whoever it reached gets the tip
  const FISH_NOTE = { age: 'asked someone\'s age', home: 'asked where someone lives', school: 'asked about someone\'s school', name: 'asked for a real name', photo: 'asked for a photo', apps: 'asked to move to another app or for a number', secret: 'asked to keep a secret / about parents' };
  function flag(world, p, kind, text, ch, to, tn = '') {
    const r = rec(p);
    (r.fish ||= []).push({ at: now(), ch, kind, text: text.slice(0, 200), ...(tn ? { to: tn } : null) });
    if (r.fish.length > 5) r.fish.shift();
    if (now() - (r.fishAt || -1e12) >= CHAT.safetyGapS * 1000) {
      r.fishAt = now();
      mod.review('safety', { id: p.pid, n: p.name }, `${FISH_NOTE[kind] || kind} in chat (${guest(p) ? 'a guest' : 'a member'})`, { lines: r.fish.slice() });
    }
    for (const q of to) {
      const rq = rec(q);
      if (now() - (rq.tipAt || -1e12) < CHAT.safetyTipS * 1000) continue;
      rq.tipAt = now();
      world.notify(q, 'Safety tip: never share your age, address, school, photos or other apps with people you meet in the game. Tap their name to block or report them.', 'warn');
    }
  }

  function rateOk(p, kind) {
    const r = rec(p), t = now(), g = guest(p);
    const R = kind === 'phone' ? (g ? CHAT.guestPhoneRate : CHAT.phoneRate) : (g ? CHAT.guestRate : CHAT.rate);
    const arr = kind === 'phone' ? r.phone : r.lines;
    while (arr.length && t - arr[0] > R.s * 1000) arr.shift();
    if (arr.length >= R.n) return false;
    arr.push(t);
    return true;
  }
  function resolveContact(p, id) {
    const pid = byHandle.get(String(id || ''));
    if (pid && cd(p).contacts[pid]) return pid;
    if (pid && crews.mates(p, { pid })) return pid;
    // (a handle not seen since the server started: look through the sender's contacts and crew)
    for (const k of Object.keys(cd(p).contacts)) if (hid(k) === id) return k;
    const c = crews.crewOf(p.pid);
    if (c) for (const k of c.members) if (k !== p.pid && hid(k) === id) return k;
    return null;
  }

  // a line from a player -> { ok } | { err }
  function send(world, p, msg) {
    const ch = String(msg.ch || '');
    if (!CHANNELS.includes(ch)) return { err: 'No such channel.' };
    const a = acctOf(p);
    if (!a) return { err: 'Not signed in.' };
    const muted = mod.mutedUntil(a);
    if (muted) return { err: `You're muted from chat for ${Math.ceil((muted - now()) / 3600e3)} h more.` };
    if (cd(p).off[ch]) return { err: 'That channel is switched off in your chat settings.' };
    let text = typeof msg.text === 'string' ? msg.text.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (!text) return { err: 'Say something.' };
    const max = guest(p) ? CHAT.guestMaxLen : CHAT.maxLen;
    if (text.length > max) text = text.slice(0, max);
    const r = rec(p);
    if (r.last && r.last.text === text && now() - r.last.at < CHAT.dupS * 1000) return { err: 'You just said that.' };
    if (!rateOk(p, 'line')) return { err: 'Slow down a little.' };
    if (ch === 'phone' && !rateOk(p, 'phone')) return { err: 'That\'s a lot of messages - wait a minute.' };
    const f = filter.check(text);
    if (f.hits.length) {
      const c = cd(p);
      if (f.hate && now() - (c.filterStrikeAt || 0) > CHAT.filterStrikeGapS * 1000) {
        c.filterStrikeAt = now();
        const s = mod.strike(a, 'hate speech in chat', 'filter');
        mod.review('filter', { id: p.pid, n: p.name }, 'hate speech caught by the filter', { text: text.slice(0, 200), ch });
        world.notify(p, s.muted ? 'Hate speech isn\'t allowed. That\'s three strikes: you\'re muted from chat for 24 hours.' : `Hate speech isn't allowed - that's a strike (${s.strikes}/${CHAT.strikesToMute}).`, 'bad');
      }
      text = f.text;
    }
    // contact details masked; a line fishing for personal info flagged for the staff (after who hears it is known)
    const fish = fishing(text);
    const ci = maskContact(text, links);
    if (ci.hits.length) {
      text = ci.text;
      if (now() - (r.maskAt || -1e12) > CHAT.maskToldS * 1000) { r.maskAt = now(); world.notify(p, 'Phone numbers, emails, links, addresses and social handles are hidden in chat, to keep everyone safe.', 'info'); }
    }
    r.last = { text, at: now() };
    r.said.push({ at: now(), ch, text });
    if (r.said.length > 8) r.said.shift();
    if (onLine) onLine(p, ch);
    let to = [];
    if (ch === 'near') {
      if (!p.ped || p.ped.dead) return { err: 'Not right now.' };
      const r2 = (CHAT.nearM * PX) ** 2;
      for (const q of world.players.values()) {
        if (q === p || !q.ped || !hears(q, p, ch)) continue;
        const dx = q.ped.x - p.ped.x, dy = q.ped.y - p.ped.y;
        if (dx * dx + dy * dy <= r2 && (q.ped.ug || 0) === (p.ped.ug || 0)) to.push(q);
      }
    } else if (ch === 'crew') {
      if (!crews.crewOf(p.pid)) return { err: 'You\'re not in a crew.' };
      to = crews.matesOnline(world, p).filter((q) => hears(q, p, ch));
    } else if (ch === 'faction') {
      const k = factionKey(p);
      if (!k) return { err: 'You\'re not in a faction - go on duty, or join a gang.' };
      for (const q of world.players.values()) if (q !== p && factionKey(q) === k && hears(q, p, ch)) to.push(q);
    } else if (ch === 'phone') {
      const pid = resolveContact(p, msg.to);
      if (!pid) return { err: 'You can only message people you\'ve met, or your crew.' };
      const out = line(p, ch, text, { to: hid(pid) });
      const q = world.players.get(pid), qa = accounts.get(pid);
      if (!qa) return { err: 'They\'re gone.' };
      const qc = chatData(qa), tn = (cd(p).contacts[pid] || {}).n || (q && q.name) || '';
      if (!blocked(qc, p.pid) && !textOk(qc, p.pid, pid)) return { err: `${tn || 'They'} only take${tn ? 's' : ''} messages from friends and crew - send a friend request first.` };
      say(p, { ...out, own: 1, tn });
      if (fish) flag(world, p, fish, text, ch, q && q.conn ? [q] : [], tn);
      if (blocked(qc, p.pid)) return { ok: true };   // (sent, as far as they know)
      if (!qc.contacts[p.pid]) { qc.contacts[p.pid] = { n: p.name, at: now(), how: crews.mates(p, { pid }) ? 'crew' : 'met' }; accounts.touch(); }
      if (q && q.conn && !qc.off.phone) say(q, out);
      else { qc.inbox.push(out); if (qc.inbox.length > CHAT.inboxMax) qc.inbox.splice(0, qc.inbox.length - CHAT.inboxMax); accounts.touch(); }
      return { ok: true };
    }
    const out = line(p, ch, text, ch === 'near' && (text.length <= CHAT.bubbleMax || QUICK.near.includes(text)) ? { bb: 1 } : {});
    if (ch === 'near') typing(world, p, false);
    say(p, { ...out, own: 1 });
    for (const q of to) say(q, out);
    if (fish) flag(world, p, fish, text, ch, to);
    return { ok: true, n: to.length };
  }

  // an emote: played on the body (systems/emote.js); to everyone near who can hear you only if it has something for
  // them beyond the body - a balloon over your head, a line in their log (dancing, the lasting poses: "Ann sat down")
  function emote(world, p, e, m) {
    if (!Object.hasOwn(EMOTES, e) || !p.ped || p.ped.dead) return false;
    const r = rec(p);
    if (now() - r.emoteAt < CHAT.emoteGapS * 1000) return false;
    const was = !!p.ped.dancing;
    if (!emotes.play(world, p, e, m)) return false;
    r.emoteAt = now(); r.zzzAt = now();
    if (!(e === 'dance' && was)) tell(world, p, e);   // (another move while dancing: nothing to say)
    if (onLine) onLine(p, 'emote');
    return true;
  }
  // balloon: its balloon alone, no line (the Zzz again while asleep)
  function tell(world, p, e, balloon = false) {
    const w = emoteWire(e);
    if (w && balloon) delete w.lg;
    if (!w || (!w.b && !w.lg)) return;
    const out = { t: 'emote', eid: p.ped.id, e, n: p.name, id: hid(p.pid), ...w };
    const r2 = (CHAT.nearM * PX) ** 2;
    for (const q of world.players.values()) {
      if (!q.ped || !q.conn || (q !== p && !hears(q, p, 'near'))) continue;
      const dx = q.ped.x - p.ped.x, dy = q.ped.y - p.ped.y;
      if (dx * dx + dy * dy <= r2) say(q, out);
    }
  }
  // someone started dancing another way (the dance button, the phone's: systems/dance.js -> world.track 'danced'): the
  // same line to the people near, as often as an emote at most
  function announce(world, p, e) {
    if (!Object.hasOwn(EMOTES, e) || !p.ped || p.ped.dead) return false;
    const r = rec(p);
    if (now() - r.emoteAt < CHAT.emoteGapS * 1000) return false;
    r.emoteAt = now();
    tell(world, p, e);
    return true;
  }
  // the typing dots (owner, 11-13: "like a phone text message"): on to the people near who'd hear a line from you; off
  // to whoever was shown them (and anyone near now). A line said near you, or no word for CHAT.typingS: off.
  function typing(world, p, on) {
    const r = rec(p);
    if (on && (!p.ped || p.ped.dead || p.ped.hidden || !acctOf(p) || mod.mutedUntil(acctOf(p)) || cd(p).off.near)) on = false;
    if (!on && !r.typ) return;
    r.typ = on ? now() : 0;
    const out = { t: 'typing', eid: p.ped ? p.ped.id : 0, on: on ? 1 : 0 }, told = new Set(r.told || []), to = [];
    if (p.ped) {
      const r2 = (CHAT.nearM * PX) ** 2;
      for (const q of world.players.values()) {
        if (q === p || !q.ped || !hears(q, p, 'near') || (q.ped.ug || 0) !== (p.ped.ug || 0)) continue;
        const dx = q.ped.x - p.ped.x, dy = q.ped.y - p.ped.y;
        if (dx * dx + dy * dy <= r2 && !(on && told.has(q))) to.push(q);   // (still typing: only the people who've come near since)
      }
    }
    if (!on) for (const q of told) if (!to.includes(q)) to.push(q);
    r.told = on ? [...told, ...to] : null;
    for (const q of to) say(q, out);
  }


  function state(p) {
    const c = cd(p), a = acctOf(p);
    // (crew, fac: whether those channels reach anyone - the page greys their tabs; names: who the mutes and blocks are,
    // for Settings > Chat's list - kept with them, c.nm; an account from before has none: "Someone")
    const nm = c.nm || {}, names = {};
    for (const pid of [...c.mutes, ...c.blocks]) names[hid(pid)] = nm[pid] || (c.contacts[pid] || {}).n || 'Someone';
    const fk = factionKey(p);
    return { t: 'chatstate', off: c.off, muted: mod.mutedUntil(a), strikes: mod.activeStrikes(a), guest: guest(p), max: guest(p) ? CHAT.guestMaxLen : CHAT.maxLen, mutes: c.mutes.map(hid), blocks: c.blocks.map(hid), me: hid(p.pid), names, crew: !!crews.crewOf(p.pid), fac: fk ? fk.split(':')[0] : null, who: c.who === 'friends' ? 'friends' : 'met' };
  }
  // friends first, then crew, then online, then the most recent; the friend requests waiting for you
  function contacts(world, p) {
    const c = cd(p), out = [], crew = crews.crewOf(p.pid);
    const seen = new Set();
    const asked = (pid) => { const qa = accounts.get(pid), qc = qa && chatData(qa); return !!(c.fsent && c.fsent[pid] && qc && qc.freq && qc.freq[p.pid]); };
    if (crew) for (const pid of crew.members) if (pid !== p.pid) { seen.add(pid); const v = c.contacts[pid] || {}; out.push({ id: hid(pid), n: (world.players.get(pid) || {}).name || crew.names[pid] || v.n || 'Someone', how: 'crew', crew: 1, on: !!(world.players.get(pid) || {}).conn, ...(v.fr ? { fr: 1 } : asked(pid) ? { rs: 1 } : null), at: v.at || 0 }); }
    for (const [pid, v] of Object.entries(c.contacts)) {
      if (seen.has(pid) || c.blocks.includes(pid)) continue;
      const q = world.players.get(pid);
      out.push({ id: hid(pid), n: (q && q.name) || v.n, how: v.how, on: !!(q && q.conn), at: v.at, ...(v.fr ? { fr: 1 } : asked(pid) ? { rs: 1 } : null) });
    }
    out.sort((a, b) => (b.fr || 0) - (a.fr || 0) || (b.crew || 0) - (a.crew || 0) || (b.on ? 1 : 0) - (a.on ? 1 : 0) || (b.at || 0) - (a.at || 0));
    pruneReq(c);
    const rq = Object.entries(c.freq || {}).filter(([pid]) => !c.blocks.includes(pid)).sort((a, b) => b[1].at - a[1].at).map(([pid, v]) => ({ id: hid(pid), n: (world.players.get(pid) || {}).name || v.n, at: v.at }));
    return { t: 'contacts', l: out, rq };
  }

  // ---- friends (the owner, 11-15) ---------------------------------------------------------------------------------
  // c.contacts[pid].fr: friends (both ways); c.freq { pid: { n, at } }: requests waiting for you (CHAT.friendReqS);
  // c.fsent { pid: at }: the ones you sent - the same person again only after CHAT.friendAgainS
  function pruneReq(c) {
    const t = now();
    if (c.freq) for (const [k, v] of Object.entries(c.freq)) if (t - v.at > CHAT.friendReqS * 1000) delete c.freq[k];
    if (c.fsent) for (const [k, at] of Object.entries(c.fsent)) if (t - at > CHAT.friendAgainS * 1000) delete c.fsent[k];
  }
  const friendCount = (c) => Object.values(c.contacts).filter((v) => v.fr).length;
  // both sides: no longer friends, no requests either way
  function unfriend(pa, pb) {
    for (const [x, y] of [[pa, pb], [pb, pa]]) {
      const xa = accounts.get(x);
      if (!xa) continue;
      const c = chatData(xa);
      if (c.contacts[y]) delete c.contacts[y].fr;
      if (c.freq) delete c.freq[y];
    }
    accounts.touch();
  }
  function friend(world, p, msg) {
    const a = String(msg.a || ''), id = String(msg.id || ''), c = cd(p);
    pruneReq(c);
    // (a request waiting for you: its sender, by their public id)
    const fromReq = () => Object.keys(c.freq || {}).find((k) => hid(k) === id) || null;
    if (a === 'yes' || a === 'no') {
      const pid = fromReq();
      if (!pid) return { err: 'That friend request has lapsed.' };
      const qa = accounts.get(pid), name = (world.players.get(pid) || {}).name || c.freq[pid].n || 'them';
      delete c.freq[pid];
      if (a === 'no' || !qa) { accounts.touch(); return { ok: true, note: `Declined ${name}'s friend request.` }; }
      return makeFriends(world, p, pid, name);
    }
    const pid = target(world, p, id) || resolveContact(p, id);
    if (!pid || pid === p.pid) return { err: 'Can\'t find that player.' };
    const qa = accounts.get(pid);
    if (!qa) return { err: 'They\'re gone.' };
    const qc = chatData(qa), q = world.players.get(pid);
    const name = (q && q.name) || (c.contacts[pid] || {}).n || 'them';
    if (a === 'unfriend') {
      if (!(c.contacts[pid] && c.contacts[pid].fr)) return { err: `${name} isn't a friend.` };
      unfriend(p.pid, pid);
      return { ok: true, note: `${name} is no longer a friend - still in your contacts.` };
    }
    if (a === 'forget') {
      if (crews.mates(p, { pid })) return { err: 'Your crew stay in your contacts.' };
      if (!c.contacts[pid]) return { err: `${name} isn't in your contacts.` };
      delete c.contacts[pid]; delete qc.contacts[p.pid];
      if (c.freq) delete c.freq[pid];
      if (qc.freq) delete qc.freq[p.pid];
      accounts.touch();
      return { ok: true, note: `Removed ${name} from your contacts - till you meet again.` };
    }
    if (a !== 'ask') return { err: 'No such action.' };
    if (c.contacts[pid] && c.contacts[pid].fr) return { err: `You're already friends with ${name}.` };
    if (c.blocks.includes(pid)) return { err: `Unblock ${name} first.` };
    if (c.freq && c.freq[pid]) { delete c.freq[pid]; return makeFriends(world, p, pid, name); }   // (they asked you already)
    // a contact, a crewmate, or someone near you now
    const near = q && q.ped && p.ped && (q.ped.x - p.ped.x) ** 2 + (q.ped.y - p.ped.y) ** 2 <= (CHAT.nearM * PX) ** 2;
    if (!c.contacts[pid] && !crews.mates(p, { pid }) && !near) return { err: 'You can only ask people you\'ve met, your crew, or someone near you.' };
    c.fsent ||= {};
    if (c.fsent[pid]) return { err: qc.freq && qc.freq[p.pid] ? `Your request is waiting for ${name}.` : `You asked ${name} not long ago - try again another day.` };
    if (friendCount(c) >= CHAT.friendsMax) return { err: `Your friends list is full (${CHAT.friendsMax}).` };
    const r = rec(p), t = now();
    r.fasks = (r.fasks || []).filter((x) => t - x < CHAT.friendRate.s * 1000);
    if (r.fasks.length >= CHAT.friendRate.n) return { err: 'That\'s a lot of friend requests - wait a few minutes.' };
    pruneReq(qc);
    if (!blocked(qc, p.pid) && Object.keys(qc.freq || {}).length >= CHAT.friendReqMax) return { err: `${name} can't take more friend requests right now.` };
    r.fasks.push(t);
    c.fsent[pid] = t;
    if (!blocked(qc, p.pid)) {   // (blocked or muted: sent, as far as they know)
      (qc.freq ||= {})[p.pid] = { n: String(p.name).slice(0, 32), at: t };
      if (q && q.conn) { world.notify(q, `${p.name} sent you a friend request - see Messages on your phone.`, 'info'); say(q, contacts(world, q)); }
    }
    accounts.touch();
    return { ok: true, note: `Friend request sent to ${name}.` };
  }
  function makeFriends(world, p, pid, name) {
    const c = cd(p), qa = accounts.get(pid), qc = chatData(qa), q = world.players.get(pid);
    if (friendCount(c) >= CHAT.friendsMax) return { err: `Your friends list is full (${CHAT.friendsMax}).` };
    if (friendCount(qc) >= CHAT.friendsMax) return { err: `${name}'s friends list is full.` };
    const qname = (q && q.name) || name;
    for (const [x, y, yn] of [[c, pid, qname], [qc, p.pid, p.name]]) {
      const had = x.contacts[y];
      x.contacts[y] = { ...had, n: String(yn).slice(0, 32), at: now(), how: had ? had.how : crews.mates(p, { pid }) ? 'crew' : 'met', fr: 1 };
      if (x.freq) delete x.freq[y];
      if (x.fsent) delete x.fsent[y];
    }
    accounts.touch();
    if (q && q.conn) { world.notify(q, `${p.name} accepted your friend request.`, 'good'); say(q, contacts(world, q)); }
    return { ok: true, note: `You and ${name} are friends now.` };
  }

  // who a mute, block or report is about: someone online (their public id) or one of your contacts
  function target(world, p, id) {
    const pid = byHandle.get(String(id || ''));
    if (pid && pid !== p.pid && accounts.get(pid)) return pid;
    for (const q of world.players.values()) if (q !== p && hid(q.pid) === id) return q.pid;
    return null;
  }
  function moderate(world, p, msg) {
    const pid = target(world, p, msg.id);
    if (!pid) return { err: 'Can\'t find that player.' };
    const c = cd(p), a = msg.a;
    const name = (world.players.get(pid) || {}).name || (c.contacts[pid] || {}).n || (c.nm || {})[pid] || 'them';
    const addTo = (arr) => { if (!arr.includes(pid)) { arr.push(pid); if (arr.length > 500) arr.shift(); } (c.nm ||= {})[pid] = String(name).slice(0, 32); };
    const forget = () => { if (c.nm && !c.mutes.includes(pid) && !c.blocks.includes(pid)) delete c.nm[pid]; };
    if (a === 'mute') { addTo(c.mutes); accounts.touch(); return { ok: true, note: `Muted ${name}: you won't see their messages.` }; }
    if (a === 'unmute') { c.mutes = c.mutes.filter((x) => x !== pid); forget(); accounts.touch(); return { ok: true, note: `Unmuted ${name}.` }; }
    if (a === 'block') { addTo(c.blocks); addTo(c.mutes); unfriend(p.pid, pid); accounts.touch(); return { ok: true, note: `Blocked ${name}: no messages either way.` }; }
    if (a === 'unblock') { c.blocks = c.blocks.filter((x) => x !== pid); c.mutes = c.mutes.filter((x) => x !== pid); forget(); accounts.touch(); return { ok: true, note: `Unblocked ${name}.` }; }
    if (a === 'report') {
      const why = REPORT_WHY.includes(msg.why) ? msg.why : 'other';
      const r = rec(p);
      if (now() - (r.reportAt || 0) < CHAT.reportGapS * 1000) return { err: 'You just sent a report - wait a moment.' };
      r.reportAt = now();
      const q = world.players.get(pid), ta = accounts.get(pid);
      const res = mod.report(ta, { id: pid, n: name }, { id: p.pid, n: p.name }, why, typeof msg.note === 'string' ? msg.note.slice(0, 200) : '', reporterWeight(accounts.get(p.pid), now()));
      if (q) res.review.data = { said: rec(q).said.slice() };   // (what they said lately, for the admin)
      return { ok: true, note: `Thanks - your report on ${name} is with the moderators.` };
    }
    return { err: 'No such action.' };
  }

  function handle(world, p, msg) {
    switch (msg.t) {
      case 'chat': { const r = send(world, p, msg); return r.err ? { t: 'chatsay', ok: false, err: r.err } : null; }
      case 'emote': emote(world, p, emoteId(String(msg.e || '')), Number.isInteger(msg.m) ? msg.m : undefined); return null;
      case 'typing': typing(world, p, !!msg.on); return null;
      case 'chatset': {
        const c = cd(p);
        if (msg.off && typeof msg.off === 'object') for (const ch of CHANNELS) if (ch in msg.off) { if (msg.off[ch]) c.off[ch] = 1; else delete c.off[ch]; }
        if (msg.who === 'friends') c.who = 'friends'; else if (msg.who === 'met') delete c.who;
        accounts.touch();
        return state(p);
      }
      case 'mod': { const r = moderate(world, p, msg); return { t: 'modres', ...r, state: state(p) }; }
      case 'contacts': return contacts(world, p);
      case 'friend': { const r = friend(world, p, msg); say(p, { t: 'friendres', ...r }); return contacts(world, p); }
      case 'inbox': {
        // (who can text me: friends and crew only - what came from anyone else while it was otherwise is dropped)
        const c = cd(p), l = c.inbox.splice(0);
        if (l.length) accounts.touch();
        const from = (id) => byHandle.get(id) || Object.keys(c.contacts).find((k) => hid(k) === id) || null;
        return { t: 'inbox', l: c.who === 'friends' ? l.filter((x) => { const f = from(x.id); return f && !blocked(c, f) && textOk(c, f, p.pid); }) : l };
      }
      default: return undefined;
    }
  }
  function onJoin(world, p) {
    say(p, state(p));
    const c = cd(p);
    if (c.inbox.length) world.notify(p, `${c.inbox.length} new message${c.inbox.length === 1 ? '' : 's'} on your phone.`, 'info');
    pruneReq(c);
    const nr = Object.keys(c.freq || {}).length;
    if (nr) world.notify(p, `${nr} friend request${nr === 1 ? '' : 's'} waiting - see Messages on your phone.`, 'info');
  }
  return { handle, update, onJoin, addContact, send, friend, emote, announce, typing, state, contacts, hid, factionKey, target, moderate, said: (p) => rec(p).said };
}
