// The new renderer's bake worker pool (client/art2/game/pool.js) keeps going when workers die or hang: a
// replacement gets the world and the world's changes so far, and the pool only gives up when replacements keep
// failing. A fake Worker stands in for the browser's.
import test from 'node:test';
import assert from 'node:assert/strict';

// Fake workers: answer init at once and other jobs after `ms`; tests reach them through `made` to make them
// crash or hang. A worker sees the messages in order, as a real one does.
const made = [];
let failNew = false;
class FakeWorker {
  constructor() {
    if (failNew) throw new Error('no more workers');
    this.onmessage = null; this.onerror = null; this.inbox = []; this.dead = false; this.hang = false;
    made.push(this);
  }
  postMessage(m) {
    if (this.dead) return;
    this.inbox.push(m);
    if (m.id === 0 || this.hang) return; // (a broadcast has no answer; a hung worker never answers)
    const ms = m.op === 'init' ? 1 : m.op === 'bakeChunk' ? 20 : 2;
    setTimeout(() => { if (!this.dead && !this.hang && this.onmessage) this.onmessage({ data: { id: m.id, ok: true, result: { op: m.op }, ms } }); }, ms);
  }
  terminate() { this.dead = true; }
  crash(why = 'boom') { if (this.onerror) this.onerror({ message: why, preventDefault() {} }); }
}
globalThis.Worker = FakeWorker;
const { WorkerPool, cacheBudget } = await import('../client/art2/game/pool.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const job = (pool, key, op = 'sprite') => new Promise((res) => pool.request(key, op, {}, 0, (r, err) => res({ r, err })));
const fast = { respawn: [5, 10], stuck: 60, initStuck: 200, watch: 15 };

test('pool: a worker that dies is replaced, given the world and the broken props, and jobs carry on', async () => {
  made.length = 0;
  const pool = new WorkerPool({ size: 2, url: 'x', timing: fast });
  const r = await pool.init({ world: 1 });
  assert.equal(r.workers, 2);
  pool.broadcast('patch', { props: [[4, { a: 1 }], [9, { a: 2 }]] });
  pool.broadcast('patch', { props: [[9, null]] }); // put back
  const first = made[0];
  first.crash('out of memory');
  assert.equal(pool.size, 1, 'one left at once');
  assert.ok(!pool.dead);
  await wait(40);
  assert.equal(pool.size, 2, 'the slot is filled again');
  assert.equal(pool.stats().restarted, 1);
  const fresh = made[made.length - 1];
  assert.equal(fresh.inbox[0].op, 'init', 'the new worker gets the world first');
  assert.deepEqual(fresh.inbox[0].args.M, { world: 1 });
  assert.equal(fresh.inbox[1].op, 'patch', 'then what changed in it');
  assert.deepEqual(fresh.inbox[1].args, { props: [[4, { a: 1 }]], reset: true });
  const out = await job(pool, 's1');
  assert.ok(out.r && !out.err, 'jobs still run');
  pool.dispose();
});

test('pool: jobs wait while every worker is being replaced; a hung worker is replaced and its job fails', async () => {
  made.length = 0;
  const pool = new WorkerPool({ size: 1, url: 'x', timing: fast });
  await pool.init({});
  made[0].crash();
  assert.equal(pool.size, 0);
  assert.ok(!pool.dead, 'not dead while a replacement is on its way');
  const queued = job(pool, 's2');
  const out = await queued;
  assert.ok(out.r && !out.err, 'the job waited for the new worker');
  // a job that never answers: the watchdog replaces the worker and the job fails
  made[made.length - 1].hang = true;
  const stuck = await job(pool, 'c1,1,-1,0', 'bakeChunk');
  assert.ok(/too long/.test(stuck.err), stuck.err);
  await wait(60);
  assert.equal(pool.size, 1, 'replaced');
  assert.ok((await job(pool, 's3')).r);
  pool.dispose();
});

test('pool: when replacements keep failing the pool gives up (dead) and requests fail at once', async () => {
  made.length = 0;
  const pool = new WorkerPool({ size: 1, url: 'x', timing: fast });
  await pool.init({});
  failNew = true;
  made[0].crash();
  for (let i = 0; i < 40 && !pool.dead; i++) await wait(15);
  failNew = false;
  assert.ok(pool.dead, 'dead once it ran out of tries');
  const out = await job(pool, 's4');
  assert.equal(out.err, 'no workers');
  pool.dispose();
});

test('pool: phones keep much smaller caches than desktops', () => {
  const desk = cacheBudget(false, 4, { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130', deviceMemory: 8 });
  const phone = cacheBudget(false, 4, { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) Mobile Safari', deviceMemory: 8 });
  const ipad = cacheBudget(false, 3, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', maxTouchPoints: 5 });
  const small = cacheBudget(false, 3, { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', deviceMemory: 2 });
  assert.ok(phone.stat * 2 <= desk.stat && phone.spr * 2 <= desk.spr && phone.model * 2 <= desk.model, JSON.stringify({ desk, phone }));
  assert.deepEqual(ipad, phone, 'an iPad (it says Macintosh) counts as a phone');
  assert.ok(small.stat <= phone.stat, 'a 2 GB device keeps the least');
  // what four workers on a phone may cache altogether (each also holds the world, ~65 MB)
  assert.ok(4 * (phone.stat + phone.spr + phone.model) <= 300);
});

test('pool: downloads (fetchChunk) go out in their own lane, never stuck behind a full queue of sprites and bakes', async () => {
  made.length = 0;
  const pool = new WorkerPool({ size: 1, url: 'x', timing: fast });
  await pool.init({});
  made[0].hang = true;   // (the main lane stays full: nothing it takes ever finishes)
  for (let i = 0; i < 10; i++) pool.request(`s${i}`, 'sprite', {}, 0, () => {});
  pool.request('cB1', 'prebakeChunk', {}, 50000, () => {});
  const a = new Promise((res) => pool.request('f1,1,1', 'fetchChunk', {}, 40000, (r, err) => res({ r, err })));
  pool.request('f2,1,1', 'fetchChunk', {}, 40001, () => {});
  pool.request('f3,1,1', 'fetchChunk', {}, 40002, () => {});
  assert.ok(pool.jobs.get('f1,1,1').w && pool.jobs.get('f2,1,1').w, 'two downloads out at once');
  assert.ok(!pool.jobs.get('f3,1,1').w, 'a third waits for one of them');
  assert.equal(made[0].inbox.filter((m) => m.op === 'sprite').length, 4, 'the main lane: four jobs at a time as before');
  // the worker answers the downloads (it's only the sprites that hang): the third goes out
  made[0].hang = false;
  const ids = made[0].inbox.filter((m) => m.op === 'fetchChunk').map((m) => m.id);
  for (const id of ids) made[0].onmessage({ data: { id, ok: true, result: { kept: true }, ms: 5 } });
  const out = await a;
  assert.ok(out.r && out.r.kept, 'answered');
  assert.ok(pool.jobs.get('f3,1,1') && pool.jobs.get('f3,1,1').w, 'the third went out');
  pool.dispose();
});
