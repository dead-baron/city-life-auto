// Bug reports (the owner, 11-14: "Report a bug" in the pause list and the phone - client/bugreport.js): the page posts
// what happened and a screenshot; the server adds who and where the player is, keeps the report and passes it on to
// the Discord's #bug-reports (BUG_WEBHOOK_URL), and the staff read them at /admin/bugs (server/adminhttp.js).
//   POST /report (Bearer: the page's own token) { text, kind, shot: base64 WebP or JPEG | '', page: { build, fps,
//        preset, input, w, h, dpr, area, online, errors: [{ at, where, msg }] } } -> { ok, id } | { err }
// Never kept or sent on: an email address, the player's network address, a token - the browser and its system only
// coarsely ("Android 14 · Chrome 131"). Limits (shared/rules.js BUG_REPORT): the text's length, the picture's size, a
// few reports a player in a few minutes and a cap an hour from everyone; the newest `keep` reports and `keepMb` MB of
// pictures are kept (<data>/reports/reports.json and img/), the oldest dropped first. The Discord post is fire and
// forget with a timeout: a failure is logged (never the webhook's address) and the report stays here either way.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readJSON, sendJSON, cors, bearer, createRateLimiter } from './httputil.js';
import { deviceClass } from './analytics.js';
import { browserOf } from './perfreports.js';
import { BUG_REPORT } from '../shared/rules.js';

export const KINDS = BUG_REPORT.kinds.map(([k]) => k);
const KIND_NAME = Object.fromEntries(BUG_REPORT.kinds);
const ID_RE = /^[a-z0-9]{6,20}$/;
const WEBHOOK_RE = /^https:\/\/((ptb|canary)\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;
const INPUTS = ['keyboard', 'gamepad', 'touch'];

// "Android 14 · Chrome 131", "iOS 17.4 · Safari 17", "Windows · Edge 131", "Mac · Firefox 133" - no model, no build
export function coarseUA(ua) {
  ua = String(ua || '');
  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/), and = ua.match(/Android (\d+)/);
  const os = ios ? `iOS ${ios[1]}.${ios[2]}` : and ? `Android ${and[1]}` : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'a system';
  const b = browserOf(ua);
  return `${os} · ${b ? `${b.name} ${String(b.v).split('.')[0]}` : 'a browser'}`;
}
const str = (v, n) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);
const num = (v, a, b) => { const x = Number(v); return Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : 0; };
// what a screenshot is, by its first bytes: 'webp' | 'jpg' | null
export function imageType(b) {
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  return null;
}
const MIME = { webp: 'image/webp', jpg: 'image/jpeg' };

// opts: { dir (null: kept in memory only - tests), accounts, store, world, origins, ip(req), webhook, fetch, now, log, limits (BUG_REPORT) }
export function createBugReports(opts) {
  const { accounts, store, world } = opts;
  const now = opts.now || Date.now, log = opts.log || console, http = opts.fetch || globalThis.fetch;
  const R = opts.limits ? { ...BUG_REPORT, ...opts.limits } : BUG_REPORT;   // (live: a test may change BUG_REPORT)
  const dir = opts.dir || null, imgDir = dir ? join(dir, 'img') : null, file = dir ? join(dir, 'reports.json') : null;
  const webhook = WEBHOOK_RE.test(opts.webhook || '') ? opts.webhook : '';
  if (opts.webhook && !webhook) log.warn('[bugs] BUG_WEBHOOK_URL isn\'t a Discord webhook address - reports are only kept here');
  const rl = createRateLimiter(now);
  const mem = new Map();   // (no dir: the pictures in memory)
  let list = [];   // oldest first
  if (dir) {
    try {
      mkdirSync(imgDir, { recursive: true });
      if (existsSync(file)) { const j = JSON.parse(readFileSync(file, 'utf8')); if (Array.isArray(j)) list = j.filter((r) => r && ID_RE.test(r.id)); }
    } catch (e) { log.error('[bugs] couldn\'t read the reports:', e && e.message); list = []; }
  }
  let saveT = null;
  function save() {
    if (!file || saveT) return;
    saveT = setTimeout(() => { saveT = null; saveNow(); }, 200);
    if (saveT.unref) saveT.unref();
  }
  function saveNow() {
    if (!file) return;
    if (saveT) { clearTimeout(saveT); saveT = null; }
    try { writeFileSync(file + '.tmp', JSON.stringify(list), { mode: 0o600 }); renameSync(file + '.tmp', file); } catch (e) { log.error('[bugs] couldn\'t save the reports:', e && e.message); }
  }
  const imgPath = (r) => (imgDir && r.shot ? join(imgDir, r.shot) : null);
  function dropImage(r) {
    if (!r.shot) return;
    if (imgDir) { try { unlinkSync(imgPath(r)); } catch { /* gone already */ } } else mem.delete(r.shot);
  }
  // the newest `keep` reports and `keepMb` MB of pictures: the oldest go first
  function prune() {
    let bytes = list.reduce((n, r) => n + (r.shotB || 0), 0);
    while (list.length > R.keep || (bytes > R.keepMb * 1048576 && list.length)) { const r = list.shift(); bytes -= r.shotB || 0; dropImage(r); }
    // pictures no report names any more (a crash between writing one and the list)
    if (imgDir) { try { const named = new Set(list.map((r) => r.shot).filter(Boolean)); for (const f of readdirSync(imgDir)) if (!named.has(f) && now() - statSync(join(imgDir, f)).mtimeMs > 60e3) unlinkSync(join(imgDir, f)); } catch { /* best effort */ } }
  }

  // ---- the Discord post: one embed (the first line its title; who, where, the device, the build, the frame rate)
  // and the screenshot attached. No mentions can ping (allowed_mentions), nothing personal in it.
  function discordPayload(r) {
    const first = (r.text.split('\n').find((l) => l.trim()) || KIND_NAME[r.kind] || 'Bug report').slice(0, 200);
    const fields = [
      ['Player', `${r.name}${r.guest ? ' (guest)' : ''}`], ['Where', r.region || 'unknown'], ['Device', `${r.device} · ${r.ua}`],
      ['Build', r.build || r.serverBuild || '?'], ['FPS', String(r.fps || '?')], ['Kind', KIND_NAME[r.kind] || r.kind],
    ].map(([name, value]) => ({ name, value: String(value).slice(0, 200) || '-', inline: true }));
    const embed = { title: first, description: r.text.slice(0, 1500) || '(no description)', color: 0xe2bd57, fields, footer: { text: `report ${r.id}${r.errors.length ? ` · ${r.errors.length} page error${r.errors.length === 1 ? '' : 's'}` : ''}` }, timestamp: new Date(r.at).toISOString() };
    if (r.shot) embed.image = { url: `attachment://${r.shot}` };
    return { username: 'City Life Auto bug reports', allowed_mentions: { parse: [] }, embeds: [embed] };
  }
  function postDiscord(r, img) {
    if (!webhook || !http) return Promise.resolve(false);
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify(discordPayload(r)));
    if (img && r.shot) fd.append('files[0]', new Blob([img], { type: MIME[r.shotType] }), r.shot);
    return Promise.resolve().then(() => http(webhook, { method: 'POST', body: fd, signal: AbortSignal.timeout(8000) }))
      .then((res) => { if (!res.ok) log.warn(`[bugs] Discord answered ${res.status} for report ${r.id}`); return !!res.ok; })
      .catch((e) => { log.warn(`[bugs] couldn't post report ${r.id} to Discord: ${(e && e.name) || 'error'}`); return false; });
  }

  // ---- POST /report ----
  const MAX_BODY = Math.ceil(R.shotKb * 1024 * 4 / 3) + 24 * 1024;
  async function take(req, res) {
    const t = bearer(req), c = t ? accounts.checkToken(t) : null;
    if (!c || !c.acct || accounts.banned(c.pid)) return sendJSON(res, 401, { err: 'Sign in again (or reload the game) to send a report.' });
    const body = await readJSON(req, MAX_BODY);
    if (!body) return sendJSON(res, 413, { err: 'That report is too big to send - untick the screenshot and try again.' });
    const text = str(body.text, R.text + 50).slice(0, R.text), kind = KINDS.includes(body.kind) ? body.kind : 'other';
    if (!text && kind === 'other') return sendJSON(res, 400, { err: 'Say what happened (or pick what kind of problem it was).' });
    let img = null, type = null;
    if (typeof body.shot === 'string' && body.shot) {
      if (body.shot.length > MAX_BODY) return sendJSON(res, 413, { err: 'The screenshot is too big - untick it and try again.' });
      img = Buffer.from(body.shot, 'base64');
      type = imageType(img);
      if (!type) return sendJSON(res, 400, { err: 'The screenshot didn\'t come through - untick it and try again.' });
      if (img.length > R.shotKb * 1024) return sendJSON(res, 413, { err: 'The screenshot is too big - untick it and try again.' });
    }
    if (!rl.hit(`p:${c.pid}`, R.perPlayer, R.perMin * 60e3)) return sendJSON(res, 429, { err: `That's ${R.perPlayer} reports in a few minutes - thanks! Try again in ${R.perMin} minutes.` });
    if (!rl.hit(`ip:${opts.ip ? opts.ip(req) : '?'}`, R.perPlayer * 2, R.perMin * 60e3)) return sendJSON(res, 429, { err: 'Lots of reports from your network just now - try again in a few minutes.' });
    if (!rl.hit('all', R.perHour, 3600e3)) return sendJSON(res, 429, { err: 'Lots of reports are coming in right now - try again in a little while.' });
    const r = make(c, text, kind, body.page, req);
    if (img) { r.shot = `${r.id}.${type}`; r.shotType = type; r.shotB = img.length; keepImage(r, img); }
    list.push(r);
    prune();
    save();
    log.log(`[bugs] report ${r.id} from ${r.name}${r.guest ? ' (guest)' : ''} at ${r.region || '?'}: ${(text.split('\n')[0] || KIND_NAME[kind]).slice(0, 80)}`);
    postDiscord(r, img);   // (not waited on)
    return sendJSON(res, 200, { ok: true, id: r.id });
  }
  function keepImage(r, img) {
    if (!imgDir) { mem.set(r.shot, img); return; }
    try { writeFileSync(imgPath(r), img, { mode: 0o600 }); } catch (e) { log.error('[bugs] couldn\'t keep a screenshot:', e && e.message); r.shot = null; r.shotB = 0; }
  }
  function make(c, text, kind, pg, req) {
    pg = pg && typeof pg === 'object' ? pg : {};
    const prof = store.get(c.pid) || {}, p = world && world.players ? world.players.get(c.pid) : null, ped = p && p.ped;
    let region = '', x = null, y = null;
    if (ped && Number.isFinite(ped.x)) {
      x = Math.round(ped.x); y = Math.round(ped.y);
      try { const d = world.map && world.map.districtAt(ped.x, ped.y); if (d) region = [d.name, d.isl].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '); } catch { /* no map */ }
    }
    const input = INPUTS.includes(pg.input) ? pg.input : '';
    const ua = String(req.headers['user-agent'] || '');
    const errors = (Array.isArray(pg.errors) ? pg.errors.slice(-10) : []).map((e) => ({ at: num(e && e.at, 0, 1e13), where: str(e && e.where, 20), msg: str(e && e.msg, 300) })).filter((e) => e.msg);
    return {
      id: now().toString(36) + randomBytes(3).toString('hex'), at: now(), pid: c.pid, name: str(prof.name, 24) || '?', guest: c.acct.kind !== 'member',
      text, kind, x, y, region, area: str(pg.area, 60),
      device: `${deviceClass({ ua, kind: input === 'touch' ? 'touch' : '' })}${input ? ` · ${input}` : ''}`, ua: coarseUA(ua),
      screen: pg.w ? `${num(pg.w, 0, 20000) | 0}x${num(pg.h, 0, 20000) | 0}@${+num(pg.dpr, 0, 8).toFixed(2)}` : '',
      build: str(pg.build, 40), serverBuild: world ? str(String(world.build || ''), 40) : '', fps: num(pg.fps, 0, 300) | 0, preset: str(pg.preset, 12),
      online: !!p, errors, shot: null, shotType: null, shotB: 0, done: null,
    };
  }

  async function handle(req, res, url) {
    if (url.pathname !== '/report') return false;
    cors(req, res, opts.origins || []);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    if (req.method !== 'POST') { sendJSON(res, 405, { err: 'POST only.' }); return true; }
    await take(req, res);
    return true;
  }
  return {
    handle,
    // the staff's page (server/adminhttp.js): newest first
    list: () => list.slice().reverse(),
    get: (id) => list.find((r) => r.id === id) || null,
    image(id) {
      const r = ID_RE.test(String(id || '')) ? list.find((q) => q.id === id) : null;
      if (!r || !r.shot) return null;
      if (!imgDir) { const b = mem.get(r.shot); return b ? { type: MIME[r.shotType], body: b } : null; }
      try { return { type: MIME[r.shotType], body: readFileSync(imgPath(r)) }; } catch { return null; }
    },
    mark(id, done, by) { const r = list.find((q) => q.id === id); if (!r) return false; r.done = done ? { at: now(), by: by || '?' } : null; save(); return true; },
    get count() { return list.length; },
    get open() { return list.filter((r) => !r.done).length; },
    flush: saveNow, discordPayload, postDiscord, webhookOn: !!webhook,
  };
}
