// The network simulated for air hockey's tests (test/airhockey.test.js): the server's game (hockeymatch.js) and three
// pages (client/hockeynet.js) - two players and a watcher - over sockets with latency and jitter.
import { ARCADE } from '../shared/rules.js';
import * as Hk from '../shared/airhockey.js';
import * as hm from '../server/systems/hockeymatch.js';
import * as net from '../client/hockeynet.js';

function fakeWorld() {
  const w = { time: 0, players: new Map(), said: [], notify(p, text) { w.said.push([p.name, text]); } };
  return w;
}
let n = 0;
function player(w, name, cash, conn) {
  const p = { pid: `s${n++}`, name, conn, profile: { cash, bank: 0, tickets: 0 }, ped: { x: 0, y: 0 }, near: true };
  w.players.set(p.pid, p);
  return p;
}
const opt = () => ({ fee: ARCADE.hockey.price, tickets: true, poi: null, at: (q) => q.near });
// ---- the network simulated: two pages and a watcher, each behind its own latency and jitter -------------------------
// Each page: its clock off the server's by its own amount, synced by pings; a hand on its mallet going after the puck
// it sees; the samples up, the words down, each way in order (as on a socket) after delay + jitter.
export function simulate({ lat = [100, 150], jit = 30, secs = 40, seed = 7, until = null, tune = {} } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let T = 0;
  const w = fakeWorld();
  hm.setClock(() => T / 1000);
  const link = (d) => ({ q: [], lastAt: 0, d, bytes: 0, send(msg) { const at = Math.max(this.lastAt, T + this.d + rnd() * jit); this.lastAt = at; const j = JSON.stringify(msg); this.bytes += j.length; this.q.push([at, j]); }, take() { const out = []; while (this.q.length && this.q[0][0] <= T) out.push(JSON.parse(this.q.shift()[1])); return out; } });
  const pages = [0, 1, 2].map((i) => {
    const down = link(lat[i % 2]), up = link(lat[i % 2]);
    const conn = { open: true, buffered: 0, sent: [], sendJSON: (o) => down.send(o), sendText() {}, sendBinary() {} };
    return { i, down, up, conn, skew: (i + 1) * 12345.6, N: null, m: null, lastK: null, disp: new Map(), lagAt: [], rate: [], hits: [], pingAt: 0, pings: 0 };
  });
  const P = pages.map((g, i) => player(w, ['Ann', 'Bob', 'Cy'][i], 100, g.conn));
  hm.interaction(w, P[0], 'sim', opt()).run(); hm.interaction(w, P[1], 'sim', opt()).run(); hm.interaction(w, P[2], 'sim', opt()).run();
  const M = hm.matchOf(w, P[0]), truth = new Map(), worst = { ex: 0 }, srvHits = new Set();
  M.trace = (k, Tb) => truth.set(k, [Tb.puck.x, Tb.puck.y]);
  const hand = (g, k) => {   // (where a player's hand puts the mallet: after the puck on their half, else guarding)
    const seat = g.N.seat, Pk = net.drawn(g.N), dir = seat ? -1 : 1, home = seat ? Hk.T.x1 - 30 : Hk.T.x0 + 30;
    const mine = seat ? Pk.x > Hk.MID - 20 : Pk.x < Hk.MID + 20;
    const wob = Math.sin(k / 23 + g.i) * 6;
    if (mine) return [Pk.x - dir * 10, Pk.y + wob];
    return [home, Hk.CY + (Pk.y - Hk.CY) * 0.6];
  };
  for (; T < secs * 1000; T++) {
    for (let i = 0; i < 3; i++) for (const msg of pages[i].up.take()) hm.onMsg(w, P[i], msg);
    if (T % 50 === 0) { w.time = T / 1000; hm.update(w); if (M.st === 'play') for (const h of M.hits) srvHits.add(`${h[0]}:${h[1]}`); if (until && until(M)) break; }
    if (T % 16) continue;
    for (const g of pages) {   // (a page's frame)
      const ms = T + g.skew;
      for (const m of g.down.take()) {
        if (m.st) { g.st = m.st; if (!g.N || g.N.seat !== m.me || m.st !== 'play' && g.N.pred) { g.N = net.makeNet(m.me, tune); g.m = m.me === 1 ? { x: Hk.T.x1 - 40, y: Hk.CY, vx: 0, vy: 0 } : { x: Hk.T.x0 + 40, y: Hk.CY, vx: 0, vy: 0 }; g.lastK = null; } net.clockFrom(g.N, ms, m.now); }
        if (m.pong !== undefined) net.onPong(g.N, ms, m.pong, m.now);
        if (m.s && g.N && g.st === 'play') net.onState(g.N, m.s, net.present(g.N, ms), g.N.seat >= 0 ? g.m : null);
      }
      if (!g.N || g.st !== 'play') continue;
      if (ms - g.pingAt > (g.pings < 5 ? 100 : 1000)) { g.pingAt = ms; g.pings++; g.up.send({ t: 'hockey', a: 'ping', c: ms }); }
      const k = net.present(g.N, ms);
      if (g.N.seat >= 0 && g.N.pred) {
        if (g.lastK === null) g.lastK = k - 1;
        for (let j = Math.max(g.lastK + 1, k - 30); j <= k; j++) {
          const [tx, ty] = hand(g, j);
          net.moveMine(g.m, g.N.seat, tx, ty, Hk.MY_SPEED, Hk.STEP);
          const smp = net.sample(g.N, j, g.m);
          if (smp) g.up.send({ t: 'hockey', m: smp });
        }
        g.lastK = k;
      }
      const kf = ms * 0.12 + g.N.off;
      net.frame(g.N, kf, g.N.seat >= 0 ? g.m : null, (ev, kk) => { if (ev === 'hit' && g.N.pred.by === g.N.seat) g.hits.push(kk); });
      if (g.N.pred) { g.disp.set(g.N.kd, net.drawn(g.N)); g.lagAt.push(kf - g.N.kd); if (g.kd0 !== undefined) g.rate.push((g.N.kd - g.kd0) / 1.92); g.kd0 = g.N.kd; worst.ex = Math.max(worst.ex, Math.hypot(g.N.ex, g.N.ey)); }
    }
  }
  // what each page drew against the server's table at the step it was drawn for (between the steps either side)
  const errs = pages.map((g) => {
    const e = [];
    for (const [kd, d] of g.disp) {
      const a = truth.get(Math.floor(kd)), b = truth.get(Math.floor(kd) + 1);
      if (!a || !b || Math.abs(b[0] - a[0]) > 20) continue;
      const f = kd - Math.floor(kd);
      e.push(Math.hypot(d.x - (a[0] + (b[0] - a[0]) * f), d.y - (a[1] + (b[1] - a[1]) * f)));
    }
    return e.sort((x, y) => x - y);
  });
  const pct = (e, p) => e[Math.min(e.length - 1, Math.floor(e.length * p))] || 0;
  return { w, M, P, pages, errs, pct, worst, T, srvHits, truth, bytes: pages.map((g) => ({ down: g.down.bytes / (T / 1000), up: g.up.bytes / (T / 1000) })) };
}

