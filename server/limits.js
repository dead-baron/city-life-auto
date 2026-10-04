// Abuse and cost guards for the public server (no dependencies).
//  - Monthly outbound-data cap: everything the server sends is metered per calendar month (UTC)
//    and persisted, so a restart doesn't reset it. Near the cap new players are turned away;
//    at the cap everyone is disconnected until the 1st of next month. Oracle's free tier
//    includes 10 TB/month of outbound data, so the default cap (9,000 GB) keeps the bill at $0
//    however popular the game gets (or however hard someone hammers it).
//  - Per-IP limits: at most N simultaneous game connections and M new connections a minute
//    from one address, and a cap on plain HTTP requests, so one script can't fill the city or
//    pull the static files on repeat.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const monthKey = (ms) => new Date(ms).toISOString().slice(0, 7); // "2026-10"

export function createLimits(opts = {}) {
  const now = opts.now || Date.now;
  const file = opts.dataDir ? join(opts.dataDir, 'traffic.json') : null;
  const capBytes = (opts.monthlyGB ?? 9000) * 1e9;
  const overhead = opts.overhead ?? 1.12;          // TCP/IP + TLS + WebSocket framing on top of what we count
  const maxPerIp = opts.maxPerIp ?? 6;
  const connPerMinute = opts.connPerMinute ?? 20;
  const httpPerMinute = opts.httpPerMinute ?? 300;
  const closeAt = opts.closeAt ?? 0.95;            // share of the cap where new players are turned away

  let meter = { month: monthKey(now()), bytes: 0 };
  if (file && existsSync(file)) {
    try { const m = JSON.parse(readFileSync(file, 'utf8')); if (m && typeof m.bytes === 'number' && m.month) meter = m; } catch { /* start fresh */ }
  }
  const open = new Map();   // ip -> live game connections
  const recent = new Map(); // ip -> { at: minute start, ws, http }

  function roll() { const k = monthKey(now()); if (k !== meter.month) meter = { month: k, bytes: 0 }; }
  function bucket(ip) {
    const t = now();
    let b = recent.get(ip);
    if (!b || t - b.at >= 60000) { b = { at: t, ws: 0, http: 0 }; recent.set(ip, b); }
    return b;
  }

  return {
    // bytes the server just sent (application payload; overhead is added here)
    addBytes(n) { if (n > 0) { roll(); meter.bytes += n * overhead; } },
    used() { roll(); return meter.bytes; },
    // 'ok' | 'closing' (no new players) | 'over' (nobody)
    state() { roll(); const f = meter.bytes / capBytes; return f >= 1 ? 'over' : f >= closeAt ? 'closing' : 'ok'; },
    // Should this IP be allowed to open a game connection? null = yes, otherwise why not.
    checkUpgrade(ip) {
      const st = this.state();
      if (st === 'over') return 'quota';
      const b = bucket(ip);
      if (++b.ws > connPerMinute) return 'rate';
      if ((open.get(ip) || 0) >= maxPerIp) return 'per-ip';
      return null;
    },
    checkHttp(ip) {
      if (this.state() === 'over') return 'quota';
      return ++bucket(ip).http > httpPerMinute ? 'rate' : null;
    },
    track(ip) { open.set(ip, (open.get(ip) || 0) + 1); },
    untrack(ip) { const n = (open.get(ip) || 1) - 1; if (n <= 0) open.delete(ip); else open.set(ip, n); },
    // forget idle rate buckets (call every few minutes)
    sweep() { const t = now(); for (const [ip, b] of recent) if (t - b.at >= 120000) recent.delete(ip); },
    save() { if (!file) return; try { writeFileSync(file, JSON.stringify(meter)); } catch { /* best effort */ } },
    summary() {
      roll();
      return { month: meter.month, gbUsed: +(meter.bytes / 1e9).toFixed(2), gbCap: +(capBytes / 1e9).toFixed(0), state: this.state(), ips: open.size };
    },
  };
}

// The client's address. Behind Caddy (the server only listens on 127.0.0.1) the proxy puts the
// real address first in X-Forwarded-For; exposed directly, the socket address is all we trust.
export function clientIp(req, trustProxy) {
  if (trustProxy) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
  return req.socket?.remoteAddress || 'unknown';
}
