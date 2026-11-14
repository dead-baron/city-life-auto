// A scene run headless in its own process, for the capture's determinism test (test/scenes.test.js): Math.random seeded
// first, as on the capture server (server/capture.js), then the world, a camera page's player, the scene - and where every
// actor is at a few moments, printed as JSON.
//   node test/scenerun.js <scene id> <seconds>
process.env.CLA_CAPTURE = '1';
const { seedRandom } = await import('../server/capture.js');
seedRandom(4242);
const { makeWorld, joinPlayer } = await import('./helpers.js');
const director = await import('../server/systems/director.js');
const id = process.argv[2] || 'bikerbrawl', secs = Number(process.argv[3] || 8);
const world = makeWorld({ npcBudget: 120, capture: true, day: 0, rand: Math.random });
const { p } = joinPlayer(world);
for (let i = 0; i < 20; i++) world.step();
const r = director.start(world, id, { mode: 'capture', viewer: p });
if (r.err) { console.log(JSON.stringify({ err: r.err })); process.exit(0); }
const out = {};
for (let s = 1; s <= secs * 20 && !r.run.over; s++) {
  world.step();
  if (s % 40 === 0) out[s] = Object.fromEntries([...r.run.cast].map(([cid, A]) => { const e = world.get(A.id); return [cid, e && !e.removed ? [+e.x.toFixed(3), +e.y.toFixed(3)] : null]; }));
}
console.log(JSON.stringify(out));
