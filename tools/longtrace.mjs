// What the page's long tasks were, from a Chrome trace (tools/drivebench.mjs --trace file.json): every task on the page's
// main thread over --min ms (50), with what ran inside it - the JS called (function, file:line), garbage collection,
// message decoding, style, layout, paint - summed by kind, the tasks' total time and count. Reads the trace as a stream
// of JSON objects (a long drive's trace is hundreds of MB).
//   node tools/longtrace.mjs trace.json [--min 50] [--top 25]
import { createReadStream } from 'node:fs';

const file = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : +process.argv[i + 1]; };
const MIN = arg('min', 50) * 1000, TOP = arg('top', 25);
if (!file) { console.error('node tools/longtrace.mjs trace.json [--min 50]'); process.exit(1); }

// the trace's events, one at a time: {"traceEvents":[{...},{...}]} or a bare array - split at the top-level objects
async function* events(path) {
  let buf = '', pos = 0, depth = 0, inStr = false, esc = false, start = -1;
  for await (const chunk of createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 })) {
    buf += chunk;
    for (; pos < buf.length; pos++) {
      const c = buf[pos];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === '[' && depth === 0) { depth = 1; continue; }
      if (c === '{') { if (depth === 1) start = pos; depth++; continue; }
      if (c === '}') { depth--; if (depth === 1 && start >= 0) { try { yield JSON.parse(buf.slice(start, pos + 1)); } catch { /* skip */ } start = -1; } continue; }
    }
    // (keep only what an event still open needs)
    const keep = start >= 0 ? start : buf.length;
    buf = buf.slice(keep); pos -= keep; if (start >= 0) start = 0;
  }
}

const threads = new Map();   // pid:tid -> name
const evs = [];
for await (const e of events(file)) {
  if (e.ph === 'M' && e.name === 'thread_name') { threads.set(`${e.pid}:${e.tid}`, e.args && e.args.name); continue; }
  if (e.ph === 'X' && typeof e.dur === 'number') evs.push(e);
}
const mainIds = new Set([...threads].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k));
const onMain = evs.filter((e) => mainIds.has(`${e.pid}:${e.tid}`)).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
const tasks = onMain.filter((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.dur >= MIN);
const KIND = (e) => {
  const n = e.name;
  if (/GC|Scavenge|MarkCompact|MinorMS|V8\.GC/i.test(n)) return 'GC';
  if (n === 'FunctionCall' || n === 'v8.callFunction') { const d = e.args && e.args.data; return d ? `js ${d.functionName || '(anon)'} ${String(d.url || '').replace(/^.*\/(client|shared)\//, '$1/')}:${d.lineNumber}` : 'js'; }
  if (n === 'EvaluateScript' || n === 'v8.compile' || n === 'v8.compileModule') return 'script load / compile';
  if (/Deserialize|PostMessage|MessagePort|v8\.deserialize/i.test(n)) return 'message decode';
  if (/UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet/.test(n)) return 'style';
  if (/^Layout$|UpdateLayout/.test(n)) return 'layout';
  if (/Paint|Raster|Composite|Commit/.test(n)) return 'paint / commit';
  return null;
};
const total = { n: tasks.length, ms: 0 }, by = new Map(), fns = new Map(), other = new Map(), named = new Map();
let j = 0;
for (const t of tasks) {
  total.ms += t.dur / 1000;
  const end = t.ts + t.dur, inner = new Map();
  while (j < onMain.length && onMain[j].ts < t.ts) j++;
  for (let k = j; k < onMain.length && onMain[k].ts < end; k++) {
    const e = onMain[k];
    if (e === t) continue;
    const kd = KIND(e);
    if (!kd) { const o = other.get(e.name) || { n: 0, ms: 0 }; o.n++; o.ms += e.dur / 1000; other.set(e.name, o); continue; }
    const key = kd.startsWith('js') ? 'js' : kd;
    if (key !== 'js') { const o = named.get(`${key}: ${e.name}`) || { n: 0, ms: 0 }; o.n++; o.ms += e.dur / 1000; named.set(`${key}: ${e.name}`, o); }
    // (the outermost of each kind: nested calls of the same kind are inside it)
    const last = inner.get(key);
    if (last && e.ts < last.end) continue;
    inner.set(key, { end: e.ts + e.dur });
    const b = by.get(key) || { n: 0, ms: 0 };
    b.n++; b.ms += e.dur / 1000; by.set(key, b);
    if (key === 'js') { const f = fns.get(kd) || { n: 0, ms: 0 }; f.n++; f.ms += e.dur / 1000; fns.set(kd, f); }
  }
}
const r1 = (v) => Math.round(v);
console.log(`long tasks (over ${MIN / 1000} ms) on the page's thread: ${total.n}, ${r1(total.ms)} ms`);
console.log('inside them, by kind:');
for (const [k, v] of [...by].sort((a, b) => b[1].ms - a[1].ms)) console.log(`  ${k.padEnd(24)} ${String(v.n).padStart(5)}  ${r1(v.ms)} ms`);
console.log('...by the trace\'s names:');
for (const [k, v] of [...named].sort((a, b) => b[1].ms - a[1].ms).slice(0, TOP)) console.log(`  ${String(r1(v.ms)).padStart(6)} ms ${String(v.n).padStart(5)}x  ${k}`);
console.log('the JS they ran (outermost calls):');
for (const [k, v] of [...fns].sort((a, b) => b[1].ms - a[1].ms).slice(0, TOP)) console.log(`  ${String(r1(v.ms)).padStart(6)} ms ${String(v.n).padStart(4)}x  ${k}`);
console.log('other events inside them (the trace\'s own names, summed with what they hold):');
for (const [k, v] of [...other].sort((a, b) => b[1].ms - a[1].ms).slice(0, TOP)) console.log(`  ${String(r1(v.ms)).padStart(6)} ms ${String(v.n).padStart(5)}x  ${k}`);
