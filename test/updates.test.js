// Rolling out updates: a player coming back from an older build starts fresh at a spawn point
// (CLA_FRESH_ON_UPDATE: 'spawn' keeps their progress, 'all' wipes it, 'off' leaves them be); a page
// that reloads for an update leaves no ghost body behind (no drop rule); a new build found on disk is
// announced to every page; the build travels in welcome / hello.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeWorld, run, store, players, fakeConn } from './helpers.js';
import { K } from '../shared/constants.js';
import { createSession } from '../server/session.js';
import { readBuild, watchBuild } from '../server/build.js';
import { encodeLook, lookFromOutfit } from '../shared/look.js';

let n = 0;
// log in with a profile set up beforehand (before(prof) runs before the join: e.g. owning a home)
function login(w, overrides = {}, before = null, opts = {}) {
  const pid = ('f' + Date.now().toString(16) + (n++).toString(16).padStart(6, '0') + 'bbbbbbbbbbbb').slice(0, 24);
  const prof = store.create(pid);
  Object.assign(prof, overrides);
  if (before) before(prof);
  const conn = fakeConn();
  const p = players.join(w, conn, prof, opts);
  return { p, prof, conn };
}
const atHospital = (w, ped) => w.map.hospitals.some((h) => Math.hypot(h.x - ped.x, h.y - ped.y) < 260);
const toastsOf = (p) => p.toasts.map((t) => t.text).join(' | ');

test('coming back after an update: a fresh start at a spawn point - on foot, not wanted, nothing carried, full health; progress kept', () => {
  const w = makeWorld({ build: 'b2', buildAt: 2000, freshOnUpdate: 'spawn' });
  const at = w.map.spawns.police; // somewhere walkable, well away from the hospitals
  const { p, prof } = login(w, {
    build: 'b1', pos: { x: at.x, y: at.y }, cash: 1234, bank: 5000, criminalExp: 77, samaritan: 12, felonies: 2,
    peakWanted: 3, peakWantedAt: Date.now(), weapons: { fists: 0, pistol: 24, service: 30 }, inventory: { medkit: 2, flashlight: 1 },
  });
  const ped = p.ped;
  assert.ok(atHospital(w, ped), 'woke up at a hospital (no home picked)');
  assert.ok(Math.hypot(ped.x - at.x, ped.y - at.y) > 600, 'not where they left off');
  assert.equal(ped.hp, ped.maxHp, 'full health');
  assert.ok(!ped.vehId && !ped.carrying && !ped.onTrain, 'on foot, carrying nothing');
  assert.equal(p.wanted, 0); assert.equal(p.heat, 0);
  assert.equal(prof.peakWanted, 0, 'no peak-wanted memory');
  assert.equal(prof.cash, 1234); assert.equal(prof.bank, 5000); assert.equal(prof.criminalExp, 77);
  assert.equal(prof.samaritan, 12); assert.equal(prof.felonies, 2, 'the record is progress too');
  assert.equal(prof.weapons.pistol, 24); assert.equal(prof.inventory.medkit, 2); assert.equal(prof.inventory.flashlight, 1);
  assert.equal(prof.weapons.service, undefined, 'no police gear left over from a shift');
  assert.equal(prof.build, 'b2', 'the profile is stamped with the build');
  assert.match(toastsOf(p), /updated/);
  // the same build next time: back where they left off
  const same = login(w, { build: 'b2', pos: { x: at.x, y: at.y } });
  assert.ok(Math.hypot(same.p.ped.x - at.x, same.p.ped.y - at.y) < 40, 'same build: back where they were');
  assert.doesNotMatch(toastsOf(same.p), /updated/);
  // a brand-new character has nothing to start over
  const fresh = login(w, {});
  assert.doesNotMatch(toastsOf(fresh.p), /updated/);
  assert.equal(fresh.prof.build, 'b2');
  // a character from before builds were tracked starts fresh once
  const old = login(w, { pos: { x: at.x, y: at.y } });
  assert.ok(atHospital(w, old.p.ped), 'an untracked old save starts fresh too');
  // with a home picked as the respawn point, that's where they start
  const h = w.map.homes.find((q) => q.kind === 'house') || w.map.homes[0];
  const owner = login(w, { build: 'b1', pos: { x: at.x, y: at.y }, homes: [h.id], spawnHome: h.id }, (pr) => w.homeOwner.set(h.id, pr.pid));
  assert.ok(Math.hypot(owner.p.ped.x - h.x, owner.p.ped.y - h.y) < 260, 'at their home');
  assert.equal(owner.prof.homes.length, 1, 'still theirs');
});

test('CLA_FRESH_ON_UPDATE=all wipes progress (homes go back on the market); =off changes nothing', () => {
  const w = makeWorld({ build: 'b2', freshOnUpdate: 'all' });
  const at = w.map.spawns.police;
  const h = w.map.homes[3];
  const outfit = { s: 2, h: 1, hc: '#222222', t: 0, tc: '#ff0000', tc2: '#ffffff', l: '#123456', sh: '#000000', ht: 0, htc: '#000000', b: 0, bd: 1 };
  const { p, prof } = login(w, {
    name: 'Wiped', build: 'b1', pos: { x: at.x, y: at.y }, outfit, cash: 9999, bank: 99999, criminalExp: 500, samaritan: 80, felonies: 3,
    weapons: { fists: 0, rifle: 40 }, inventory: { flashlight: 1, medkit: 4 }, vehicles: [{ model: 'sports', paint: 1 }], homes: [h.id], spawnHome: h.id, stash: { items: { medkit: 2 }, weapons: {} },
  }, (pr) => w.homeOwner.set(h.id, pr.pid));
  assert.ok(atHospital(w, p.ped), 'a brand-new start at a hospital');
  assert.equal(prof.cash, 200); assert.equal(prof.bank, 500); assert.equal(prof.criminalExp, 0); assert.equal(prof.samaritan, 0); assert.equal(prof.felonies, 0);
  assert.deepEqual(prof.weapons, { fists: 0 }); assert.equal(prof.inventory.flashlight, undefined); assert.equal(prof.inventory.medkit, undefined);
  assert.deepEqual(prof.vehicles, []); assert.deepEqual(prof.homes, []); assert.equal(prof.spawnHome, null); assert.equal(prof.stash, undefined);
  assert.ok(!w.homeOwner.has(h.id), 'their home is for sale again');
  assert.equal(prof.name, 'Wiped', 'name kept'); assert.equal(prof.look, encodeLook(lookFromOutfit(outfit)), 'look kept (the old outfit, now a look)'); assert.equal(prof.lookPicked, true); assert.equal(prof.pid, p.pid);
  assert.equal(prof.build, 'b2');
  // off: carry on where you left off, with everything
  const w2 = makeWorld({ build: 'b2', freshOnUpdate: 'off' });
  const kept = login(w2, { build: 'b1', pos: { x: at.x, y: at.y }, cash: 777 });
  assert.ok(Math.hypot(kept.p.ped.x - at.x, kept.p.ped.y - at.y) < 40, 'off: back where they were');
  assert.equal(kept.prof.cash, 777);
  // no build known (offline practice, tests): never
  const w3 = makeWorld();
  const pr = login(w3, { build: 'b1', pos: { x: at.x, y: at.y } });
  assert.ok(Math.hypot(pr.p.ped.x - at.x, pr.p.ped.y - at.y) < 40);
});

test('an update while you play: every page is told; reloading for it leaves no ghost body and drops nothing; you come back fresh', () => {
  const w = makeWorld({ build: 'b1', buildAt: 1000, freshOnUpdate: 'spawn' });
  const at = w.map.spawns.police;
  const a = login(w, { build: 'b1', pos: { x: at.x, y: at.y }, cash: 640 }, null, { clientBuild: 'b1', clientBuiltAt: 1000 });
  const b = login(w, { build: 'b1', pos: { x: at.x + 60, y: at.y }, cash: 50 }, null, { clientBuild: 'b2', clientBuiltAt: 2000 }); // its page got the new files first
  assert.ok(!a.p.updateDue && !b.p.updateDue, 'nothing to do yet');
  // a client-only push lands: the server finds the new build on disk and tells everyone
  players.announceBuild(w, { v: 'b2', at: 2000 });
  assert.equal(w.build, 'b2');
  assert.ok(a.conn.sent.some((m) => m.t === 'build' && m.v === 'b2' && m.at === 2000), 'told the page');
  assert.ok(a.p.updateDue, 'an old page is due to reload');
  assert.ok(!b.p.updateDue && b.p.build === 'b2' && b.prof.build === 'b2', 'a page already on it just carries on');
  // the old page reloads: no ghost, no loot bag, nothing lost
  const body = a.p.ped;
  players.leave(w, a.p);
  assert.ok(!w.entities.has(body.id), 'no ghost body left standing');
  assert.ok(!w.players.has(a.p.pid));
  assert.ok(![...w.entities.values()].some((e) => e.kind === K.BAG), 'no loot bag');
  assert.equal(a.prof.cash, 640, 'nothing dropped');
  // back on the new page: a fresh start
  const back = players.join(w, fakeConn(), a.prof, { clientBuild: 'b2', clientBuiltAt: 2000 });
  assert.ok(atHospital(w, back.ped), 'fresh start at a spawn point');
  assert.equal(a.prof.build, 'b2'); assert.equal(a.prof.cash, 640);
  assert.ok(!back.updateDue);
  // a normal disconnect afterwards keeps the ghost rule
  const ghost = back.ped;
  players.leave(w, back);
  assert.ok(w.entities.has(ghost.id) && back.ghostUntil > 0, 'ordinary disconnect: ghost body as always');
  // ...and if another update lands while they're away, their ghost is closed out without the drop rule when they return
  players.announceBuild(w, { v: 'b3', at: 3000 });
  const again = players.join(w, fakeConn(), a.prof, { clientBuild: 'b3', clientBuiltAt: 3000 });
  assert.ok(!w.entities.has(ghost.id), 'the old ghost is gone');
  assert.notEqual(again.ped.id, ghost.id);
  assert.ok(![...w.entities.values()].some((e) => e.kind === K.BAG), 'still no loot bag');
  assert.equal(a.prof.cash, 640);
  assert.equal(a.prof.build, 'b3');
  // a ghost whose timer runs out after an update came out: no drop either
  const c = login(w, { build: 'b3', pos: { x: at.x, y: at.y }, cash: 90 }, null, { clientBuild: 'b3' });
  players.leave(w, c.p);
  players.announceBuild(w, { v: 'b4', at: 4000 });
  run(w, 31);
  assert.ok(!w.players.has(c.p.pid), 'logged out');
  assert.equal(c.prof.cash, 90, 'nothing dropped');
});

test('a server restart onto a new build: the old page reconnects fresh, then reloads without leaving a ghost', () => {
  const w = makeWorld({ build: 'b2', buildAt: 2000 });
  const at = w.map.spawns.police;
  // reconnecting on the old page (b1) after the restart
  const a = login(w, { build: 'b1', pos: { x: at.x, y: at.y }, cash: 300 }, null, { clientBuild: 'b1', clientBuiltAt: 1000 });
  assert.ok(atHospital(w, a.p.ped), 'fresh start straight away');
  assert.ok(a.p.updateDue, 'the page is older than the server: it will reload');
  const id = a.p.ped.id;
  players.leave(w, a.p);
  assert.ok(!w.entities.has(id), 'reloading: no ghost');
  assert.equal(a.prof.cash, 300);
  const back = players.join(w, fakeConn(), a.prof, { clientBuild: 'b2', clientBuiltAt: 2000 });
  assert.ok(atHospital(w, back.ped), 'back where the fresh start put them');
  assert.doesNotMatch(toastsOf(back), /updated/, 'only one fresh start');
  // a page NEWER than the server (Pages got the push first) isn't due to reload
  const b = login(w, { build: 'b2', pos: { x: at.x, y: at.y } }, null, { clientBuild: 'b3', clientBuiltAt: 3000 });
  assert.ok(!b.p.updateDue);
});

test('the build travels in welcome and hello; version.json is read at boot and watched for changes', async () => {
  const w = makeWorld({ build: 'b9', buildAt: 9000 });
  const prof = store.create('c0ffee' + Date.now().toString(16).padStart(18, '0'));
  const conn = fakeConn();
  const s = createSession(w, conn, { seed: 1337, dev: false, maxPlayers: 10, login: () => ({ profile: prof, token: 't' }) });
  s.onMessage(JSON.stringify({ t: 'hello', token: null, cb: 'b8', cbt: 8000 }), false);
  const wel = conn.sent.find((m) => m.t === 'welcome');
  assert.equal(wel.build, 'b9'); assert.equal(wel.built, 9000);
  const p = w.players.get(prof.pid);
  assert.equal(p.clientBuild, 'b8'); assert.ok(p.updateDue, 'an older page');
  // server/build.js
  const dir = mkdtempSync(join(tmpdir(), 'cla-build-'));
  const file = join(dir, 'version.json');
  writeFileSync(file, JSON.stringify({ version: 'aaa111', built: '2026-10-06T10:00:00.000Z', files: [] }));
  assert.deepEqual(readBuild(file), { v: 'aaa111', at: Date.parse('2026-10-06T10:00:00.000Z') });
  assert.equal(readBuild(join(dir, 'missing.json')), null);
  const seen = [];
  const h = watchBuild(file, 25, (b) => seen.push(b.v), 'aaa111');
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(seen, [], 'the build it booted with is not news');
  writeFileSync(file, '{"version": "bbb2'); // half written: read again next time
  await new Promise((r) => setTimeout(r, 80));
  writeFileSync(file, JSON.stringify({ version: 'bbb222', built: '2026-10-06T11:00:00.000Z', files: ['x'] }));
  await new Promise((r) => setTimeout(r, 120));
  clearInterval(h);
  assert.deepEqual(seen, ['bbb222'], 'the new build, once');
});

test('a new page back in its ghost (a reload, a phone that dropped the tab, an update): it can move straight away', () => {
  const w = makeWorld();
  const at = w.map.spawns.police;
  const { p, prof } = login(w, { pos: { x: at.x, y: at.y } });
  const walk = (pl, seq0, n, mx) => { for (let k = 0; k < n; k++) players.queueInput(pl, { seq: seq0 + k, bits: 0, mx, my: 0, aim: 0 }); };
  // a long session on the first page: its inputs numbered into the thousands
  for (let s = 1; s < 3000; s += 8) { walk(p, s, 8, 0); w.step(); }
  const ped = p.ped;
  players.leave(w, p);                       // the page goes (its ghost stays 30 s)
  assert.ok(w.players.has(prof.pid) && w.entities.has(ped.id), 'a ghost');
  // a new page (its inputs numbered from 1 again) back within the ghost's 30 s
  const back = players.join(w, fakeConn(), prof);
  assert.equal(back.ped, ped, 'back in its own body');
  const x0 = ped.x;
  for (let s = 1; s < 60; s += 1) { walk(back, s, 1, 1); w.step(); }
  assert.ok(ped.x - x0 > 60, `it walks (${Math.round(ped.x - x0)} px)`);
});
