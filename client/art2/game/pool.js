// Art v2 live renderer: the bake worker pool (docs/art-v2/GAME-RENDERER.md). A few module workers
// (worker.js) take jobs from one queue, by priority (lower runs sooner) with fairness between kinds of
// job (see _next):
//
//   const pool = new WorkerPool({ lowMem });          size clamp(hardwareConcurrency - 1, 1, 3), 1 on LOW_MEM
//   pool.init(worldData) -> Promise<{ providers, ms: { post, init } }>   every worker gets its own copy
//   pool.request(key, op, args, prio, done)  queue a job (done(result, error) once, unless it is cancelled);
//                                            a key already queued or running is not queued twice (its
//                                            priority is raised instead) - returns whether it was queued
//   pool.cancel(key)          drop a job that hasn't started; a running one finishes but is not delivered
//   pool.cancelWhere(fn)      the same for every queued / running job whose key fn(key) picks
//   pool.broadcast(op, args)  a message to every worker (world patches), in order with later jobs
//   pool.has(key), pool.idle, pool.stats(), pool.dispose()
//
// At most two jobs run on a worker at a time (the second waits in its message queue, so a worker never
// sits idle between jobs), and at most one of them is a chunk bake: a bake takes a few hundred ms, a sprite a
// few, so the other slot is always there for the sprites things on screen are waiting for. A worker that dies fails its jobs (done gets the error); one stuck on a job
// for over a minute is replaced. If none are left, pool.dead is set and every new request fails at once
// (the host keeps its fallbacks).
const PER_WORKER = 2, STUCK_MS = 60000;
const STREAK = { s: 8, c: 1 }; // jobs of a class in a row before another waiting class gets a turn

export function poolSize(lowMem) {
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  return lowMem ? 1 : Math.max(1, Math.min(3, hc - 1));
}

export class WorkerPool {
  constructor({ lowMem = false, size = poolSize(lowMem), url = new URL('./worker.js', import.meta.url) } = {}) {
    this.url = url; this.lowMem = lowMem;
    this.workers = [];
    this.queue = [];               // { key, op, args, prio, done, seq } (sorted when dispatching)
    this.jobs = new Map();         // key -> job (queued or running)
    this.byId = new Map();         // message id -> job
    this.nextId = 1; this.seq = 0;
    this.dead = false; this.ready = false; this.initArgs = null;
    this.streak = { cls: '', n: 0 };
    this.counts = { done: 0, failed: 0, cancelled: 0, restarted: 0 };
    for (let i = 0; i < size; i++) this.workers.push(this._spawn(i));
    this.watch = setInterval(() => this._watchdog(), 5000);
  }
  _spawn(i) {
    const w = { i, wk: null, busy: 0, baking: 0, alive: true, running: new Set() };
    try { w.wk = new Worker(this.url, { type: 'module', name: `art2-bake-${i}` }); } catch (e) { w.alive = false; w.err = String(e); return w; }
    w.wk.onmessage = (e) => this._onMessage(w, e.data);
    w.wk.onerror = (e) => { e.preventDefault && e.preventDefault(); this._kill(w, `worker error: ${e.message || e}`); };
    w.wk.onmessageerror = () => this._kill(w, 'worker message could not be read');
    return w;
  }
  get size() { return this.workers.filter((w) => w.alive).length; }
  get idle() { return !this.queue.length && this.workers.every((w) => !w.busy); }

  // Send the world to every worker. Resolves once all have answered (or failed).
  init(M) {
    this.initArgs = { M, lowMem: this.lowMem };
    let post = 0;
    const answers = this.workers.filter((w) => w.alive).map((w) => new Promise((res) => {
      const id = this.nextId++;
      const job = { key: `init:${w.i}`, op: 'init', id, w, t0: performance.now(), done: (r, err) => res(err ? null : r), init: true };
      this.byId.set(id, job); w.busy++; w.running.add(job);
      const t = performance.now();
      try { w.wk.postMessage({ id, op: 'init', args: this.initArgs }); } catch (e) { this.byId.delete(id); w.busy--; w.running.delete(job); this._kill(w, `could not send the world: ${e.message || e}`); res(null); }
      post += performance.now() - t;
    }));
    const t0 = performance.now();
    return Promise.all(answers).then((rs) => {
      this.ready = true;
      const ok = rs.filter(Boolean);
      if (!ok.length) this.dead = true;
      this._pump();
      return { providers: ok[0] || null, workers: ok.length, ms: { post, init: performance.now() - t0 } };
    });
  }

  request(key, op, args, prio, done) {
    if (this.dead) { done && done(null, 'no workers'); return false; }
    const j = this.jobs.get(key);
    if (j) { if (!j.w && prio < j.prio) j.prio = prio; return false; }
    const job = { key, op, args, prio, done, seq: this.seq++, w: null, id: 0 };
    this.jobs.set(key, job); this.queue.push(job);
    this._pump();
    return true;
  }
  has(key) { return this.jobs.has(key); }
  // a message every worker gets, in order with the jobs sent to it after (no answer expected)
  broadcast(op, args) { for (const w of this.workers) if (w.alive) { try { w.wk.postMessage({ id: 0, op, args }); } catch { /* it will be replaced */ } } }
  cancel(key) {
    const j = this.jobs.get(key);
    if (!j) return;
    this.jobs.delete(key); j.cancelled = true; this.counts.cancelled++;
    if (!j.w) { const i = this.queue.indexOf(j); if (i >= 0) this.queue.splice(i, 1); }
  }
  cancelWhere(fn) { for (const k of [...this.jobs.keys()]) if (fn(k)) this.cancel(k); }

  // Fairness between classes of job (the key's first letter: c chunk bakes, s sprites): after STREAK[cls]
  // jobs of one class in a row, a waiting job of another class goes next, so a steady stream of cheap
  // high-priority sprites can't starve the bakes (or the other way round).
  // bakeOk: a free slot can take a chunk bake (null when nothing waiting may go now)
  _next(bakeOk = true) {
    const q = this.queue, s = this.streak, ok = (x) => bakeOk || x.key[0] !== 'c';
    let i = q.findIndex(ok);
    if (i < 0) return null;
    if (s.n >= (STREAK[s.cls] || 8)) { const j = q.findIndex((x) => x.key[0] !== s.cls && ok(x)); if (j >= 0) i = j; }
    const job = q.splice(i, 1)[0], c = job.key[0];
    if (c === s.cls) s.n++; else { s.cls = c; s.n = 1; }
    return job;
  }
  _pump() {
    if (!this.ready || !this.queue.length) return;
    this.queue.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
    for (;;) {
      if (!this.queue.length) return;
      let best = null, bakeOk = false;
      for (const w of this.workers) if (w.alive && w.busy < PER_WORKER) { if (!w.baking) bakeOk = true; if (!best || w.busy < best.busy) best = w; }
      if (!best) return;
      const job = this._next(bakeOk);
      if (!job) return;
      const bake = job.key[0] === 'c';
      if (bake && best.baking) { best = null; for (const w of this.workers) if (w.alive && w.busy < PER_WORKER && !w.baking && (!best || w.busy < best.busy)) best = w; }
      job.id = this.nextId++; job.w = best; job.t0 = performance.now();
      if (bake) best.baking++;
      this.byId.set(job.id, job); best.busy++; best.running.add(job);
      try { best.wk.postMessage({ id: job.id, op: job.op, args: job.args }); } catch (e) { this._finish(job, null, `could not send: ${e.message || e}`); }
    }
  }
  _onMessage(w, m) {
    const job = m && this.byId.get(m.id);
    if (!job) return;
    if (m.ok) this._finish(job, m.result, null, m.ms);
    else this._finish(job, null, m.error || 'failed');
  }
  _finish(job, result, err, ms) {
    this.byId.delete(job.id);
    if (job.w) { job.w.busy = Math.max(0, job.w.busy - 1); job.w.running.delete(job); if (job.key && job.key[0] === 'c' && job.w.baking) job.w.baking--; }
    if (!job.init && this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    if (err) this.counts.failed++; else this.counts.done++;
    if (result && ms !== undefined) result.workerMs = ms;
    if (!job.cancelled && job.done) { try { job.done(result, err); } catch (e) { console.error('[art2 pool] job callback', e); } }
    this._pump();
  }
  _kill(w, why) {
    if (!w.alive) return;
    w.alive = false; w.err = why;
    try { w.wk && w.wk.terminate(); } catch { /* gone */ }
    for (const job of [...w.running]) this._finish(job, null, why);
    if (!this.workers.some((x) => x.alive)) {
      this.dead = true;
      for (const job of this.queue.splice(0)) { this.jobs.delete(job.key); if (job.done) job.done(null, 'no workers'); }
    }
  }
  // a job running far too long (a provider stuck in a loop): replace the worker, fail the job
  _watchdog() {
    const now = performance.now();
    for (let i = 0; i < this.workers.length; i++) {
      const w = this.workers[i];
      if (!w.alive || ![...w.running].some((j) => !j.init && now - j.t0 > STUCK_MS)) continue;
      this._kill(w, 'a job took too long');
      if (this.initArgs) {
        const nw = this._spawn(i);
        this.workers[i] = nw; this.counts.restarted++;
        if (nw.alive) {
          this.dead = false;
          const id = this.nextId++;
          const job = { key: `init:${i}:${id}`, op: 'init', id, w: nw, t0: now, init: true, done: () => {} };
          this.byId.set(id, job); nw.busy++; nw.running.add(job);
          nw.wk.postMessage({ id, op: 'init', args: this.initArgs });
        }
      }
    }
  }
  stats() {
    return { workers: this.size, queued: this.queue.length, running: this.workers.reduce((a, w) => a + w.busy, 0), ...this.counts };
  }
  dispose() {
    clearInterval(this.watch);
    for (const w of this.workers) { try { w.wk && w.wk.terminate(); } catch { /* gone */ } w.alive = false; }
    this.queue.length = 0; this.jobs.clear(); this.byId.clear();
    this.dead = true; this.initArgs = null;
  }
}
