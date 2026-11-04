// Test kit for the launch foundation: an isolated data dir and secret, fake HTTP requests and responses, a fake world
// with players (no city built), and a fake clock.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

process.env.CLA_DATA_DIR ||= mkdtempSync(join(tmpdir(), 'cla-launch-'));
process.env.CLA_SECRET ||= 'test-secret';

export function clock(t0 = Date.UTC(2026, 10, 3, 12)) { const c = { t: t0, now: () => c.t, add: (ms) => { c.t += ms; return c.t; } }; return c; }

export function req({ method = 'GET', url = '/', headers = {}, body = null, ip = '9.9.9.9' } = {}) {
  const data = body === null ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  const r = Readable.from(data);
  r.method = method; r.url = url; r.headers = { host: 'play.example', ...headers }; r.ip = ip;
  return r;
}
export function res() {
  const o = { status: 0, headers: {}, body: '', headersSent: false, done: false };
  o.setHeader = (k, v) => { o.headers[k.toLowerCase()] = v; };
  o.writeHead = (s, h = {}) => { o.status = s; for (const [k, v] of Object.entries(h)) o.headers[k.toLowerCase()] = v; o.headersSent = true; };
  o.end = (b) => { if (b) o.body += b; o.done = true; };
  o.json = () => JSON.parse(o.body);
  return o;
}
// call a handler(req, res, url) and get the response back
export async function call(h, opts) {
  const q = req(opts), s = res();
  await h(q, s, new URL(q.url, 'https://play.example'));
  return s;
}

export function fakeConn() {
  const sent = [];
  return { open: true, sent, sendJSON(o) { sent.push(o); }, close(code) { this.open = false; this.code = code; }, last(t) { for (let i = sent.length - 1; i >= 0; i--) if (!t || sent[i].t === t) return sent[i]; return null; } };
}
// a world without a city: players at positions, notify(), get(), time
export function fakeWorld() {
  const w = {
    players: new Map(), entities: new Map(), time: 0, notes: [],
    notify(p, text, tone) { w.notes.push({ p, text, tone }); },
    get(id) { return w.entities.get(id) || null; },
    place() {}, map: { districtAt: () => ({ name: 'Midtown' }), pois: [] },
  };
  return w;
}
let seq = 0;
export function fakePlayer(world, store, { x = 0, y = 0, name = null, pid = null, ...rest } = {}) {
  pid ||= (0xabc000000000 + (seq++)).toString(16).padStart(24, '0');
  const profile = store.get(pid) || store.create(pid);
  if (name) profile.name = name;
  const ped = { id: 1000 + seq, x, y, dead: false, vx: 0, vy: 0 };
  const p = { pid, profile, name: profile.name, conn: fakeConn(), ped, wanted: 0, badge: false, toasts: [], ...rest };
  world.players.set(pid, p);
  world.entities.set(ped.id, ped);
  return p;
}
