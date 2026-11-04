// The admin log (the owner, 11-03: "every privileged action goes to an append-only admin log with who, what, target,
// when and before/after values"). One JSON line per action in <data>/admin-log.jsonl, only ever appended to, each line
// carrying the hash of the line before it (a chain: a line edited or taken out later breaks every hash after it -
// verify() finds where). The owner reads it at /admin/log.
import { appendFileSync, existsSync, readFileSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';

const h = (s) => createHash('sha256').update(s).digest('base64url').slice(0, 22);
const clip = (v, n = 600) => { if (v === undefined) return undefined; const s = JSON.stringify(v); return s && s.length > n ? JSON.parse(JSON.stringify(s.slice(0, n) + '...')) : v; };

export function createAdminLog(file, now = Date.now) {
  const mem = [];   // (no file: a test, the practice worker)
  let prev = 'start';
  if (file && existsSync(file)) {
    // the last line's hash, read from the file's end
    const fd = openSync(file, 'r');
    try {
      const size = fstatSync(fd).size, n = Math.min(size, 64 * 1024), buf = Buffer.alloc(n);
      readSync(fd, buf, 0, n, size - n);
      const lines = buf.toString('utf8').trim().split('\n');
      const last = lines[lines.length - 1];
      try { prev = JSON.parse(last).h || prev; } catch { prev = h(last || 'start'); }
    } finally { closeSync(fd); }
  }
  function append(e) {
    const entry = {
      at: now(), who: e.who ? { id: e.who.id, n: e.who.n, role: e.who.role || null } : null, what: String(e.what).slice(0, 60),
      target: e.target ? { id: e.target.id || null, n: e.target.n || null } : null, before: clip(e.before), after: clip(e.after), note: e.note ? String(e.note).slice(0, 300) : undefined,
      ok: e.ok !== false, prev,
    };
    const body = JSON.stringify(entry);
    entry.h = h(prev + body);
    prev = entry.h;
    const line = JSON.stringify(entry);
    if (file) appendFileSync(file, line + '\n', { mode: 0o600 }); else mem.push(line);
    return entry;
  }
  function lines() { return file ? (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []) : mem.slice(); }
  // the latest n entries, newest first (filter: by actor or target id, or the action)
  function tail(n = 200, q = null) {
    const out = [];
    const all = lines();
    for (let i = all.length - 1; i >= 0 && out.length < n; i--) {
      let e; try { e = JSON.parse(all[i]); } catch { continue; }
      if (q && !((e.who && e.who.id === q) || (e.target && e.target.id === q) || e.what === q)) continue;
      out.push(e);
    }
    return out;
  }
  // the chain checked end to end: -> { ok, n, brokenAt }
  function verify() {
    let p = 'start', i = 0;
    for (const line of lines()) {
      let e; try { e = JSON.parse(line); } catch { return { ok: false, n: i, brokenAt: i }; }
      const { h: got, ...rest } = e;
      if (rest.prev !== p || h(p + JSON.stringify(rest)) !== got) return { ok: false, n: i, brokenAt: i };
      p = got; i++;
    }
    return { ok: true, n: i, brokenAt: -1 };
  }
  return { append, tail, verify, get count() { return lines().length; } };
}
