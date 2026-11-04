// The admin log (the owner, 11-03: "every privileged action goes to an append-only admin log with who, what, target,
// when and before/after values"). One JSON line per action in <data>/admin-log.jsonl, only ever appended to, each line
// carrying the hash of the line before it: a line edited or taken out breaks the chain after it (verify()).
// A head file beside it (admin-log.head.json: { n, h, bytes } - the lines, the last hash, the file's size) catches a
// file cut short or its last lines taken away, which the chain alone can't see.
// Appends are queued and written in a batch a moment later (an async append, never in the tick's way); the page
// (/admin/log) reads only the file's last part (tail) and checks the head - the whole chain is hashed again only when
// asked (verify).
import { existsSync, readFileSync, openSync, readSync, fstatSync, closeSync, appendFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { appendFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const h = (s) => createHash('sha256').update(s).digest('base64url').slice(0, 22);
const clip = (v, n = 600) => { if (v === undefined) return undefined; const s = JSON.stringify(v); return s && s.length > n ? s.slice(0, n) + '...' : v; };
const TAIL_BYTES = 256 * 1024;

function readTail(file, bytes = TAIL_BYTES) {
  if (!existsSync(file)) return [];
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size, n = Math.min(size, bytes), buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, size - n);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    if (n < size) lines.shift();   // (the first is likely cut in half)
    return lines;
  } finally { closeSync(fd); }
}

export function createAdminLog(file, now = Date.now, { delayMs = 200 } = {}) {
  const mem = [];   // (no file: a test, the practice worker)
  const headFile = file ? file.replace(/\.jsonl$/, '') + '.head.json' : null;
  let head = { n: 0, h: 'start', bytes: 0 };
  if (headFile && existsSync(headFile)) { try { head = { ...head, ...JSON.parse(readFileSync(headFile, 'utf8')) }; } catch { /* rebuilt below */ } }
  else if (file && existsSync(file)) {
    // (a log from before the head file: counted once)
    const all = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    let last = null; try { last = JSON.parse(all[all.length - 1]); } catch { /* none */ }
    head = { n: all.length, h: (last && last.h) || 'start', bytes: statSync(file).size };
  }
  let prev = head.h, n = head.n, bytes = head.bytes;
  let queue = [], timer = null, writing = null;

  function append(e) {
    const entry = {
      at: now(), who: e.who ? { id: e.who.id, n: e.who.n, role: e.who.role || null } : null, what: String(e.what).slice(0, 60),
      target: e.target ? { id: e.target.id || null, n: e.target.n || null } : null, before: clip(e.before), after: clip(e.after), note: e.note ? String(e.note).slice(0, 300) : undefined,
      ok: e.ok !== false, prev,
    };
    entry.h = h(prev + JSON.stringify(entry));
    prev = entry.h; n++;
    const line = JSON.stringify(entry) + '\n';
    bytes += Buffer.byteLength(line);
    if (!file) { mem.push(line.trim()); return entry; }
    queue.push(line);
    if (!timer) { timer = setTimeout(flush, delayMs); if (timer.unref) timer.unref(); }
    return entry;
  }
  const headNow = () => JSON.stringify({ n, h: prev, bytes });
  // the queued lines appended and the head written, in the background (one write at a time)
  function flush() {
    timer = null;
    if (!file || !queue.length) return writing || Promise.resolve();
    const lines = queue.join(''), hd = headNow();
    queue = [];
    const run = async () => {
      await appendFile(file, lines, { mode: 0o600 });
      await writeFile(headFile + '.tmp', hd, { mode: 0o600 });
      await rename(headFile + '.tmp', headFile);
    };
    writing = (writing || Promise.resolve()).then(run).catch((e) => console.error('[adminlog] write failed:', e.message));
    return writing;
  }
  // at shutdown: what's queued, written now
  function flushSync() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!file || !queue.length) return;
    appendFileSync(file, queue.join(''), { mode: 0o600 });
    queue = [];
    writeFileSync(headFile + '.tmp', headNow(), { mode: 0o600 });
    renameSync(headFile + '.tmp', headFile);
  }
  const lines = () => (file ? readTail(file).concat(queue.map((l) => l.trim())) : mem.slice(-2000));
  // the latest n entries, newest first (q: an actor's or a target's id, or the action) - from the file's last part only
  function tail(count = 200, q = null) {
    const out = [], all = lines();
    for (let i = all.length - 1; i >= 0 && out.length < count; i--) {
      let e; try { e = JSON.parse(all[i]); } catch { continue; }
      if (q && !((e.who && e.who.id === q) || (e.target && e.target.id === q) || e.what === q)) continue;
      out.push(e);
    }
    return out;
  }
  // cheap, for every view: the file's size and its last line against the head (a cut-short file, lines taken off the end)
  function checkHead() {
    if (!file) return { ok: true, n };
    const size = existsSync(file) ? statSync(file).size : 0, onDisk = bytes - queue.reduce((a, l) => a + Buffer.byteLength(l), 0);
    if (size < onDisk) return { ok: false, n, why: `the file is ${onDisk - size} bytes shorter than the head says - cut short` };
    const t = readTail(file, 4096);
    let last = null; try { last = JSON.parse(t[t.length - 1]); } catch { /* empty */ }
    const want = queue.length ? JSON.parse(queue[0]).prev : prev;
    if (n - queue.length > 0 && (!last || last.h !== want)) return { ok: false, n, why: 'the last line isn\'t the one the head names - lines taken off the end or changed' };
    return { ok: true, n };
  }
  // the whole chain hashed again, end to end, and its length against the head: -> { ok, n, brokenAt }
  function verify() {
    const all = file ? (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []).concat(queue.map((l) => l.trim())) : mem;
    let p = 'start', i = 0;
    for (const line of all) {
      let e; try { e = JSON.parse(line); } catch { return { ok: false, n: i, brokenAt: i }; }
      const { h: got, ...rest } = e;
      if (rest.prev !== p || h(p + JSON.stringify(rest)) !== got) return { ok: false, n: i, brokenAt: i };
      p = got; i++;
    }
    if (file && (i !== n || p !== prev)) return { ok: false, n: i, brokenAt: i, why: `${n - i} line(s) missing from the end` };
    return { ok: true, n: i, brokenAt: -1 };
  }
  return { append, tail, verify, checkHead, flush, flushSync, get count() { return n; } };
}
