// Small HTTP helpers for the launch foundation's endpoints (no dependencies): capped JSON bodies, JSON and HTML replies,
// CORS for the game's own pages, cookies, and a fixed-window rate limiter.

export function readBody(req, max = 32 * 1024) {
  return new Promise((resolve) => {
    let n = 0;
    const parts = [];
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    req.on('data', (c) => { n += c.length; if (n > max) { finish(null); req.destroy(); return; } parts.push(c); });
    req.on('end', () => finish(Buffer.concat(parts)));
    req.on('error', () => finish(null));
  });
}
export async function readJSON(req, max) {
  const b = await readBody(req, max);
  if (!b) return null;
  try { const v = JSON.parse(b.toString('utf8') || '{}'); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
export async function readForm(req, max = 8192) {
  const b = await readBody(req, max);
  return b ? Object.fromEntries(new URLSearchParams(b.toString('utf8'))) : null;
}

const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };
export function sendJSON(res, status, obj, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json', ...SECURITY, ...headers });
  res.end(JSON.stringify(obj));
}
export function sendHTML(res, status, html, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'", ...SECURITY, ...headers });
  res.end(html);
}
export function redirect(res, to, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(302, { location: to, ...SECURITY, ...headers });
  res.end();
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// CORS for the game's pages: the origin echoed when it's one of ours (never '*' on these endpoints)
export function cors(req, res, origins) {
  const o = req.headers.origin;
  if (o && origins.includes(o)) {
    res.setHeader('access-control-allow-origin', o);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-max-age', '600');
  }
  return !!o && origins.includes(o);
}

export function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function setCookie(name, value, { maxAge = 600, path = '/', sameSite = 'Lax', secure = true } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
}
export const bearer = (req) => { const h = String(req.headers.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7).trim() : null; };

// fixed-window counters: hit(key, limit, windowMs) -> true while under the limit
export function createRateLimiter(now = Date.now) {
  const m = new Map();
  let swept = now();
  return {
    hit(key, limit, windowMs) {
      const t = now();
      if (t - swept > 60e3) { swept = t; for (const [k, v] of m) if (t - v.at >= v.w) m.delete(k); }
      let b = m.get(key);
      if (!b || t - b.at >= windowMs) { b = { at: t, n: 0, w: windowMs }; m.set(key, b); }
      return ++b.n <= limit;
    },
    get size() { return m.size; },
  };
}
