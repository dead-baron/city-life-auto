// Art v2 live renderer: the bake worker pool (docs/art-v2/GAME-RENDERER.md). A few module workers
// (worker.js) take jobs from one queue, by priority (lower runs sooner) with fairness between kinds of
// job (see _next):
//
//   const pool = new WorkerPool({ lowMem });          size: poolSize (below)
//   pool.init(worldData, key) -> Promise<{ providers, ms: { post, init } }>   every worker gets its own copy; with key
//                            (the city is in this browser's copy: client/worldcache.js) each reads it itself, in
//                            parallel and off the page's thread, and is sent it only if that fails
//   warmPool(opts) / takeWarmPool(opts)   a pool made early (main.js, while the city is built) so the workers'
//                            modules are loaded by the time the world is ready
//   pool.request(key, op, args, prio, done)  queue a job (done(result, error) once, unless it is cancelled);
//                                            a key already queued or running is not queued twice (its
//                                            priority is raised instead) - returns whether it was queued
//   pool.cancel(key)          drop a job that hasn't started; a running one finishes but is not delivered
//   pool.cancelWhere(fn)      the same for every queued / running job whose key fn(key) picks
//   pool.broadcast(op, args)  a message to every worker (world patches), in order with later jobs
//   pool.has(key), pool.idle, pool.stats(), pool.dispose()
//
// At most four jobs are out on a worker at a time (the rest wait in its message queue, so a worker never
// sits idle between jobs), and at most one of them is a chunk bake: a bake takes a few hundred ms (a second or
// more on a phone) and pauses every few ms (worker.js), a sprite takes a few ms, so the sprites things on
// screen are waiting for are made between the bake's steps.
//
// Workers die (a phone short of memory, a crash) or get stuck (a job running over a minute): either way its
// jobs fail (done gets the error) and a new worker takes its place after a short wait (1 s, then longer), given
// the world again and the world's changes so far (the broken props, kept compacted here). Jobs wait in the queue
// meanwhile. Only when replacements keep failing (more than RESPAWN_MAX in two minutes) does a slot stay empty;
// when every slot is empty pool.dead is set and every new request fails at once (the host starts a new pool).
//
// Size: up to three workers, four on an 8-core device (phones are 8-core: the bakes are what keeps up with a
// fast car), one on a low-memory device. Memory: each worker holds its own copy of the world (~65 MB) and its
// caches; phones get much smaller caches (cacheBudget) - four workers with desktop caches took a phone past
// what it could hold after a long drive round the world, and the art stopped arriving.
const PER_WORKER = 4, STUCK_MS = 60000, INIT_STUCK_MS = 90000;
// Downloads (a job key starting 'f': worker.js fetchChunk) wait on the network, not the CPU: they go out in a lane of
// their own, LIGHT_PER_WORKER at a time on each worker, never queued behind the sprites and bakes (which on a phone keep
// every slot busy while you move, so a download put in line with them never went out).
const LIGHT_PER_WORKER = 2;
const isLight = (key) => key.charCodeAt(0) === 102;   // 'f'
const STREAK = { s: 8, c: 1 }; // jobs of a class in a row before another waiting class gets a turn
const RESPAWN_MS = [1000, 2000, 4000, 8000]; // wait before replacing a worker, by how many were replaced lately
const RESPAWN_WINDOW = 120000, RESPAWN_MAX = 8;

export function poolSize(lowMem) {
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  return lowMem ? 1 : hc >= 8 ? 4 : Math.max(1, Math.min(3, hc - 1));
}

// What each worker may keep cached, in MB: stat (the static sprites the chunk bakes reuse: buildings, trees,
// props), spr (the sprites of moving things) and model (actors.js: the vehicle models those are drawn from). A
// phone or a small-memory device keeps far less (a smaller cache costs a bake ~15% more time; running out of
// memory costs the art).
export function isPhone(nav = typeof navigator !== 'undefined' ? navigator : null) {
  const ua = (nav && nav.userAgent) || '';
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (/Macintosh/.test(ua) && !!nav && nav.maxTouchPoints > 1);
}
export function cacheBudget(lowMem, workers, nav = typeof navigator !== 'undefined' ? navigator : null) {
  const dm = (nav && nav.deviceMemory) || 0; // GB, rounded (Chrome tells at most 8; Safari and Firefox don't tell)
  if (lowMem || (dm && dm <= 2)) return { stat: 24, spr: 6, model: 12 };
  if (isPhone(nav) || (dm && dm <= 4)) return { stat: 40, spr: 10, model: 20 };
  return { stat: workers >= 4 ? 90 : 120, spr: 32, model: 48 };
}

// How many baked chunks the browser keeps (chunkstore.js: ~0.4 MB each, compressed): a phone fewer.
export function keepCap(lowMem, nav = typeof navigator !== 'undefined' ? navigator : null) {
  const dm = (nav && nav.deviceMemory) || 0;
  return lowMem || (dm && dm <= 2) ? 40 : isPhone(nav) || (dm && dm <= 4) ? 90 : 180;
}

export class WorkerPool {
  // (timing: the waits, for the tests - { respawn: [ms...], stuck, initStuck, watch })
  constructor({ lowMem = false, artPx = 2, size = poolSize(lowMem), url = new URL('./worker.js', import.meta.url), budget = null, timing = null } = {}) {
    this.url = url; this.lowMem = lowMem; this.artPx = artPx;
    this.T = { respawn: RESPAWN_MS, stuck: STUCK_MS, initStuck: INIT_STUCK_MS, watch: 5000, ...(timing || {}) };
    this.budget = budget || cacheBudget(lowMem, size);
    this.workers = [];
    this.queue = [];               // { key, op, args, prio, done, seq } (sorted when dispatching)
    this.jobs = new Map();         // key -> job (queued or running)
    this.byId = new Map();         // message id -> job
    this.nextId = 1; this.seq = 0;
    this.dead = false; this.ready = false; this.initArgs = null; this.disposed = false;
    this.streak = { cls: '', n: 0 };
    this.counts = { done: 0, failed: 0, cancelled: 0, restarted: 0 };
    this.respawns = [];            // when workers were replaced lately (performance.now)
    this.pending = new Set();      // slots waiting for their replacement
    this.timers = new Set();
    this.props = new Map();        // the world's changes so far: prop index -> its broken state (replayed to a new worker)
    this.barriers = new Set();     // highway barrier pieces smashed through (worker.js patch barriers; replayed too)
    this.lastWhy = '';
    for (let i = 0; i < size; i++) this.workers.push(this._spawn(i));
    this.watch = setInterval(() => this._watchdog(), this.T.watch);
  }
  _spawn(i) {
    const w = { i, wk: null, busy: 0, baking: 0, light: 0, alive: true, running: new Set() };
    try { w.wk = new Worker(this.url, { type: 'module', name: `art2-bake-${i}` }); } catch (e) { w.alive = false; w.err = String(e); return w; }
    w.wk.onmessage = (e) => this._onMessage(w, e.data);
    w.wk.onerror = (e) => { e.preventDefault && e.preventDefault(); this._kill(w, `worker error: ${e.message || e}`); };
    w.wk.onmessageerror = () => this._kill(w, 'worker message could not be read');
    return w;
  }
  get size() { return this.workers.filter((w) => w.alive).length; }
  get idle() { return !this.queue.length && this.workers.every((w) => !w.busy && !w.light); }

  // Send the world to every worker (or, with key, let each read it from the browser's copy). Resolves once all have
  // answered (or failed).
  init(M, key = null, keep = null) {
    this.initArgs = { M, lowMem: this.lowMem, workers: this.workers.length, artPx: this.artPx, cacheMB: this.budget.stat, sprMB: this.budget.spr, modelMB: this.budget.model, artKey: (keep && keep.artKey) || null, keepCap: keepCap(this.lowMem),
      cdn: (keep && keep.cdn) || null, saveData: !!(typeof navigator !== 'undefined' && navigator.connection && navigator.connection.saveData), phone: isPhone() };   // (the art from the server: worker.js; a phone's bakes are slow - worth waiting for the server's)
    let post = 0;
    const answers = this.workers.filter((w) => w.alive).map((w) => new Promise((res) => {
      const t = performance.now();
      this._postInit(w, (r, err) => {
        // (the copy wasn't there for it: the world follows, and the worker holds its jobs until it is in)
        if (r && r.needWorld) { try { w.wk.postMessage({ id: 0, op: 'world', args: { M } }); } catch (e) { this._kill(w, `could not send the world: ${e.message || e}`); } }
        res(err ? null : r);
      }, key);
      post += performance.now() - t;
    }));
    const t0 = performance.now();
    return Promise.all(answers).then((rs) => {
      this.ready = true;
      const ok = rs.filter(Boolean);
      if (!ok.length) this._giveUp(this.lastWhy || 'no worker started');
      this._pump();
      return { providers: ok[0] || null, workers: ok.length, ms: { post, init: performance.now() - t0 } };
    });
  }
  // the world to one worker (an init job: it counts against the worker's slots until it answers); key: just where to
  // read it (a replacement worker is always sent it)
  _postInit(w, done, key = null) {
    const id = this.nextId++;
    const job = { key: `init:${w.i}:${id}`, op: 'init', id, w, t0: performance.now(), init: true, done };
    this.byId.set(id, job); w.busy++; w.running.add(job);
    const args = { ...this.initArgs, ...(key ? { M: null, key } : null), tidy: w.i === 0 };
    try { w.wk.postMessage({ id, op: 'init', args }); } catch (e) {
      this.byId.delete(id); w.busy--; w.running.delete(job);
      this._kill(w, `could not send the world: ${e.message || e}`);
      done(null, 'could not send the world');
      return false;
    }
    return true;
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
  // how many jobs fn(key) picks are queued and not started yet (host.js: no baking ahead while a bake for the screen waits)
  waiting(fn) { let n = 0; for (const j of this.queue) if (fn(j.key)) n++; return n; }
  // a message every worker gets, in order with the jobs sent to it after (no answer expected). World patches
  // ('patch': props [[index, broken | null]], reset: that list is everything broken) are also kept, compacted, for
  // a worker that starts later.
  broadcast(op, args) {
    if (op === 'patch' && args) {
      if (args.reset) this.props.clear();
      for (const [i, br] of args.props || []) { if (br) this.props.set(i, br); else this.props.delete(i); }
      if (args.reset && args.barriers) this.barriers.clear();
      for (const [k, on] of args.barriers || []) { if (on) this.barriers.add(k); else this.barriers.delete(k); }
    }
    for (const w of this.workers) if (w.alive) { try { w.wk.postMessage({ id: 0, op, args }); } catch { /* it will be replaced */ } }
  }
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
    const q = this.queue, s = this.streak, ok = (x) => !isLight(x.key) && (bakeOk || x.key[0] !== 'c');
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
    // the downloads' own lane (see LIGHT_PER_WORKER)
    for (let i = 0; i < this.queue.length;) {
      const job = this.queue[i];
      if (!isLight(job.key)) { i++; continue; }
      let best = null;
      for (const w of this.workers) if (w.alive && w.light < LIGHT_PER_WORKER && (!best || w.light < best.light)) best = w;
      if (!best) break;
      this.queue.splice(i, 1);
      job.id = this.nextId++; job.w = best; job.t0 = performance.now(); job.light = true;
      best.light++;
      this.byId.set(job.id, job); best.running.add(job);
      try { best.wk.postMessage({ id: job.id, op: job.op, args: job.args }); } catch (e) { this._finish(job, null, `could not send: ${e.message || e}`); }
    }
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
    if (job.w) {
      if (job.light) job.w.light = Math.max(0, job.w.light - 1); else job.w.busy = Math.max(0, job.w.busy - 1);
      job.w.running.delete(job);
      if (job.key && job.key[0] === 'c' && job.w.baking) job.w.baking--;
    }
    if (!job.init && this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    if (err) this.counts.failed++; else this.counts.done++;
    if (result && ms !== undefined) result.workerMs = ms;
    if (!job.cancelled && job.done) { try { job.done(result, err); } catch (e) { console.error('[art2 pool] job callback', e); } }
    this._pump();
  }
  // a worker gone (an error, out of memory, stuck): its jobs fail, and a new one is on its way
  _kill(w, why) {
    if (!w.alive) return;
    w.alive = false; w.err = why; this.lastWhy = why;
    try { w.wk && w.wk.terminate(); } catch { /* gone */ }
    for (const job of [...w.running]) this._finish(job, null, why);
    if (!this.disposed && !this.dead && this.initArgs) this._scheduleRespawn(w.i);
    this._checkDead();
  }
  _checkDead() {
    if (this.dead || this.workers.some((x) => x.alive) || this.pending.size) return;
    this._giveUp(this.lastWhy || 'no workers left');
  }
  _giveUp(why) {
    this.dead = true; this.lastWhy = why;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear(); this.pending.clear();
    for (const job of this.queue.splice(0)) { this.jobs.delete(job.key); if (job.done) job.done(null, 'no workers'); }
  }
  _scheduleRespawn(i) {
    if (this.pending.has(i)) return;
    const now = performance.now();
    this.respawns = this.respawns.filter((t) => now - t < RESPAWN_WINDOW);
    if (this.respawns.length >= RESPAWN_MAX) return; // replaced too often lately: this slot stays empty
    const R = this.T.respawn, wait = R[Math.min(this.respawns.length, R.length - 1)];
    this.respawns.push(now);
    this.pending.add(i);
    const t = setTimeout(() => { this.timers.delete(t); this.pending.delete(i); this._respawn(i); }, wait);
    this.timers.add(t);
  }
  _respawn(i) {
    if (this.disposed || this.dead || !this.initArgs) return;
    const nw = this._spawn(i);
    this.workers[i] = nw; this.counts.restarted++;
    if (!nw.alive) { this.lastWhy = nw.err || 'the worker could not start'; this._scheduleRespawn(i); this._checkDead(); return; }
    // the world, then what has changed in it (applied once the world is in: the worker answers in order)
    if (!this._postInit(nw, () => {})) return;
    if (this.props.size || this.barriers.size) { try { nw.wk.postMessage({ id: 0, op: 'patch', args: { props: [...this.props], ...(this.barriers.size ? { barriers: [...this.barriers].map((k) => [k, 1]) } : null), reset: true } }); } catch { /* replaced again */ } }
    this._pump();
  }
  // a job running far too long (a provider stuck in a loop), or a worker that never finished taking the world:
  // replace the worker, fail its jobs
  _watchdog() {
    const now = performance.now();
    for (const w of this.workers) {
      if (!w.alive) continue;
      for (const j of w.running) if (now - j.t0 > (j.init ? this.T.initStuck : this.T.stuck)) { this._kill(w, j.init ? 'the worker never got going' : 'a job took too long'); break; }
    }
  }
  stats() {
    return {
      workers: this.size, slots: this.workers.length, pending: this.pending.size, queued: this.queue.length,
      running: this.workers.reduce((a, w) => a + (w.alive ? w.busy : 0), 0), ...this.counts,
      cacheMB: this.budget.stat, sprMB: this.budget.spr, modelMB: this.budget.model, broken: this.props.size, dead: this.dead, lastWhy: this.lastWhy,
    };
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.watch);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear(); this.pending.clear();
    for (const w of this.workers) { try { w.wk && w.wk.terminate(); } catch { /* gone */ } w.alive = false; }
    this.queue.length = 0; this.jobs.clear(); this.byId.clear();
    this.dead = true; this.initArgs = null;
  }
}

// ---- a pool made early -----------------------------------------------------------------------------------------
// main.js makes the pool as the page starts (before the city is in): the workers load their modules meanwhile. The
// renderer takes it when it starts (or makes its own, if the settings it was made with no longer fit).
let WARM = null;
export function warmPool(opts) {
  if (!WARM) { try { WARM = new WorkerPool(opts); } catch { WARM = null; } }
  return WARM;
}
export function takeWarmPool(opts) {
  const p = WARM;
  WARM = null;
  if (p && !p.dead && !p.disposed && !!p.lowMem === !!opts.lowMem && p.artPx === opts.artPx) return p;
  if (p) p.dispose();
  return new WorkerPool(opts);
}
