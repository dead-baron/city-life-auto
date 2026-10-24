// World v3 and the debug menu (the owner, 2026-10-23): every one of the cinematic mode's staged scenes (client/director.js
// SCENES) run on the v3 world as the server builds it - each command it sends finds its place and does its thing ("No
// Granite Peaks for World v3" when teleporting to the peaks: a name on two districts, the first not on this map); search
// and rescue signs on at the Search & Rescue HQ's pad, never at a hospital; the Rusty Spur's pool table racks up from any side.
// (One v3 build, about 100 s and 2 GB: the heavy lock.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPlayer, teleport } from './helpers.js';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { airfields } from '../shared/flight.js';
import { SCENES } from '../client/director.js';
import * as dev from '../server/dev.js';
import * as players from '../server/systems/players.js';
import * as jobs from '../server/systems/jobs.js';
import * as homeinside from '../server/systems/homeinside.js';
import { poolTable } from '../server/systems/activities.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const w = new World(M, { npcBudget: 60, throwErrors: true });
const { p } = joinPlayer(w);
p.devMode = true;
const said = [];
{ const n0 = w.notify.bind(w); w.notify = (q, text, tone) => { if (q === p) said.push([tone, text]); return n0(q, text, tone); }; }
const steps = (n) => { for (let i = 0; i < n; i++) w.step(); };
steps(10);
// a debug command that didn't do its thing says so: "[dev] No ...", "Couldn't ...", "Get out of the vehicle first" ...
const FAILED = /^\[dev\] (No |There's no|Couldn't|Can't|Not |Get out|Go inside|Step outside|One at a time|no room|Nobody|Nothing)/i;

test('every staged scene of the cinematic mode plays on World v3: every place found, every command done', () => {
  const bad = [];
  for (const sc of SCENES) {
    said.length = 0;
    p.devSpawn = null;   // (each scene a while after the last, as you'd play them)
    let err = null;
    try {
      dev.command(w, p, 'afoot', {});
      for (const [, c, x] of sc.s) {
        if (c[0] === '@') continue;
        dev.command(w, p, c, { t: 'dev', c, ...(x || {}) });
        steps(4);
        if (c === 'place' && !said.some(([, t]) => t.startsWith('[dev] At '))) bad.push(`${sc.n}: no "${x.n}" (${said.map((s) => s[1]).join(' | ')})`);
      }
    } catch (e) { err = e; }
    if (err) bad.push(`${sc.n}: threw ${err && err.message}`);
    const f = said.filter(([tone, t]) => FAILED.test(t) || (tone === 'bad' && t.startsWith('[dev]')));
    if (f.length) bad.push(`${sc.n}: ${f.map((s) => s[1]).join(' | ')}`);
    // tidied up for the next one
    if (p.ped.dead) { p.ped.dead = false; p.ped.hp = p.ped.maxHp; }
    if (p.job) jobs.failJob(w, p, 'scene over');
    if (p.ped.home) homeinside.leave(w, p);
    dev.command(w, p, 'afoot', {});
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('World v3: search & rescue signs on at the Search & Rescue HQ\'s pad, never at a hospital', () => {
  const { p: q } = joinPlayer(w);
  steps(2);
  const pads = airfields(M).pads, hqPad = pads.find((r) => r.kind === 'sar');
  assert.ok(hqPad, 'the HQ\'s pad');
  const at = (x, y) => { teleport(w, q.ped, x, y); return players.findInteraction(w, q); };
  for (const r of pads.filter((r) => r.kind === 'hospital' && !r.roof)) {
    const it = at(r.x + 20, r.y);
    assert.ok(!(it && /rescue pilot/.test(it.label)), `not at ${r.name} (${it && it.label})`);
  }
  assert.match(at(hqPad.x + 20, hqPad.y)?.label || '', /search & rescue pilot/, 'at the HQ\'s pad');
  // the debug menu's shift (the cinematic mode's "Search and rescue") starts there too, wherever you are
  const h = M.pois.find((r) => r.kind === 'hospital');
  teleport(w, q.ped, h.x, h.y + 40);
  q.devMode = true;
  dev.command(w, q, 'sar', {});
  assert.ok(q.job && q.job.type === 'sar', 'on shift');
  assert.equal(q.job.base.name, hqPad.name, 'from the HQ');
  jobs.failJob(w, q, 'x');
});

test('World v3: the Rusty Spur\'s pool table racks up from any side of it', () => {
  const { p: q } = joinPlayer(w);
  const T = poolTable(M);
  assert.ok(T, 'the table in the bar room');
  for (const [x, y, where] of [[T.x1 + 18, T.cy, 'the east end'], [T.x0 - 18, T.cy, 'the west end'], [T.cx, T.y1 + 20, 'the side by the door']]) {
    teleport(w, q.ped, x, y);
    const it = players.findInteraction(w, q);
    assert.ok(it && /pool table/.test(it.label), `${where}: ${it && it.label}`);
  }
});
