// World v3 and the debug menu (the owner, 2026-10-23): every one of the cinematic mode's staged scenes (client/director.js
// SCENES) run on the v3 world as the server builds it - each command it sends finds its place and does its thing ("No
// Granite Peaks for World v3" when teleporting to the peaks: a name on two districts, the first not on this map); search
// and rescue signs on at a Search & Rescue HQ's pad, never at a hospital - a few HQs across the regions, the calls out in
// the wilderness near the one you signed on at; the Rusty Spur's pool table racks up from any side.
// And the follow scenes (the owner, 10-24: "automatic scenes that has the camera follow NPCs like in cop chases or street
// races or fishing or surfing"): each kind finds someone at it on World v3 - or one is started for the camera - or is
// skipped cleanly; what you're sent is round them; the camera moves on when their activity ends.
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
import * as sar from '../server/systems/sar.js';
import { SAR_HQS } from '../shared/world3-sarhq.js';
import { SAR } from '../shared/rules.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { TILE } from '../shared/constants.js';
import * as cinefollow from '../server/systems/cinefollow.js';
import * as streetlife from '../server/systems/streetlife.js';
import { focusOf, netRect, cineEyes } from '../server/view.js';
import { CINE_KINDS, CINE_TOUR, CINE_TOUR_S } from '../shared/cinekinds.js';

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
  const nearHq = pads.filter((r) => r.kind === 'sar').sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
  assert.equal(q.job.base.name, nearHq.name, 'from the nearest HQ');
  jobs.failJob(w, q, 'x');
});

// (the owner, 10-23: "We should have a few specific search and rescue HQs to take these missions not the hospital";
// "Search and rescue missions should be out in the wilderness not in a small city park")
test('World v3: a few Search & Rescue HQs across the regions, each with its pad; the calls out in the wilderness, near the base you signed on at', () => {
  const hqs = M.pois.filter((r) => r.kind === 'sar');
  assert.equal(hqs.length, SAR_HQS.length, `every base built (${hqs.map((r) => r.label).join(', ')})`);
  assert.ok(hqs.length >= 3 && hqs.length <= 5, `3 to 5 bases (${hqs.length})`);
  const pads = airfields(M).pads.filter((r) => r.kind === 'sar');
  assert.equal(pads.length, hqs.length, 'a helipad at each');
  const dn = (x, y) => DISTRICTS[M.dist[M.idx(Math.floor(x / TILE), Math.floor(y / TILE))]];
  const want = { 'Granite Peaks Ranger Station': 'Granite Peaks', 'Egret Coast Coastguard Station': 'Egret Coast', 'Red Rock Rescue Post': 'Red Rock Desert', 'Sandpiper Coastguard Station': 'Sandpiper Coast' };
  for (const [name, d] of Object.entries(want)) { const r = hqs.find((q) => q.label === name); assert.ok(r, `${name} built`); assert.equal(dn(r.x, r.y).name, d, `${name} in ${d}`); }
  for (let i = 0; i < hqs.length; i++) for (let k = i + 1; k < hqs.length; k++) assert.ok(Math.hypot(hqs[i].x - hqs[k].x, hqs[i].y - hqs[k].y) > 600 * TILE, `${hqs[i].label} and ${hqs[k].label} far apart`);
  // the calls: only from wild districts, never the city's parks
  const S = sar.sitesOf(M), bad = new Set();
  for (const s of [...S.open, ...S.rough]) { const d = dn(s.x, s.y); if (!sar.wildDistrict(d)) bad.add(d && d.name); }
  assert.deepEqual([...bad], [], 'only the wilderness');
  assert.ok(S.open.length > 1000 && S.rough.length > 100 && S.water.length > 500, `spots (${S.open.length}, ${S.rough.length}, ${S.water.length})`);
  // signed on at each base (Act on its pad): the shift's from that base, its calls near it
  const { p: q } = joinPlayer(w);
  steps(2);
  for (const r of hqs) {
    const pad = pads.find((x) => x.name === r.label);
    assert.ok(pad, `${r.label}: its pad`);
    teleport(w, q.ped, pad.x + 20, pad.y);
    const it = players.findInteraction(w, q);
    assert.match(it?.label || '', /search & rescue pilot/, `${r.label}: sign on at its pad`);
    it.run();
    assert.ok(q.job && q.job.type === 'sar', `${r.label}: on shift`);
    assert.equal(q.job.base.name, r.label, `${r.label}: the shift's from there`);
    for (const list of [S.open, S.water]) {
      const s = sar.pick(list, q.job.base.x, q.job.base.y), d = Math.hypot(s.x - q.job.base.x, s.y - q.job.base.y);
      assert.ok(d >= SAR.dist[0] && d <= SAR.dist[1], `${r.label}: a call near it (${Math.round(d)} px)`);
    }
    jobs.failJob(w, q, 'x');
    steps(1);
  }
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

test('World v3: every follow scene finds someone at it - or starts one for the camera - or is skipped cleanly', () => {
  const { p: q, conn } = joinPlayer(w);
  q.devMode = true;
  dev.command(w, q, 'clear', {});   // (after the staged scenes' storm: what the rain sends home - chess, hoops, the skaters - isn't started in it)
  dev.command(w, q, 'time', { m: 720 });
  dev.command(w, q, 'place', { n: 'Midtown' });
  steps(20);
  const found = {}, skipped = [];
  for (const K of CINE_KINDS) {
    conn.sent.length = 0;
    cinefollow.request(w, q, { f: K.id, near: true }, true);
    steps(20);
    const said = conn.sent.filter((m) => m && m.t === 'cinef');
    const C = q.cineF;
    assert.ok(C && C.k === K.id, `${K.id}: following`);
    if (C.sub) {
      const e = w.get(C.sub.id);
      assert.ok(e && !e.removed && !e.player, `${K.id}: a live subject, never a player`);
      assert.ok(cinefollow.candidates(w, K.id).some((c) => c.e === e), `${K.id}: doing it`);
      assert.ok(said.some((m) => m.id && m.k === K.id), `${K.id}: the page told whom`);
      assert.equal(focusOf(w, q).id, C.fid, `${K.id}: the view on them`);
      const r = netRect(w, q, {}), f = w.get(C.fid);
      assert.ok(f.x > r.x0 && f.x < r.x1 && f.y > r.y0 && f.y < r.y1, `${K.id}: sent what's round them`);
      assert.ok(q.known.has(C.fid), `${K.id}: they're sent to the page`);
      found[K.id] = said.filter((m) => m.id).at(-1).n;
    } else {
      assert.ok(said.some((m) => m.none && m.k === K.id), `${K.id}: skipped, and the page told`);
      skipped.push(K.id);
    }
  }
  console.log(`[follow scenes] found ${Object.keys(found).length}: ${Object.values(found).join('; ')}\n[follow scenes] skipped: ${skipped.join(', ') || 'none'}`);
  // the ones World v3 always has, or that the camera starts in dev mode where nobody's at it
  for (const k of ['race', 'chase', 'armored', 'train', 'plane', 'combine', 'horse', 'surf', 'fishing', 'traffic', 'skate', 'hoops', 'chess', 'bus', 'wildlife']) assert.ok(found[k], `${k} (skipped: ${skipped.join(', ')})`);
  assert.ok(cineEyes(w).length >= 1 || !q.cineF.sub, 'the world comes alive round them');
  cinefollow.request(w, q, { f: 'stop' }, true);
  assert.equal(q.cineF, null);
  assert.equal(focusOf(w, q), q.ped, 'back on you');
});

test('World v3: the camera moves on when the activity ends - the same scene\'s next one first; the tour to the next kind', () => {
  const { p: q, conn } = joinPlayer(w);
  q.devMode = true;
  dev.command(w, q, 'place', { n: 'Downtown' });
  steps(20);
  const said = () => conn.sent.filter((m) => m && m.t === 'cinef');
  // a street race: the racer the camera's on drops out - the next racer in the same race
  cinefollow.request(w, q, { f: 'race', near: true }, true);
  steps(5);
  const C = q.cineF;
  assert.ok(C.sub, 'on a racer');
  const ev = streetlife.live(w).find((e) => e.sl === 'race' && e.racers.includes(C.fid));
  assert.ok(ev, 'in a race');
  const first = C.fid, tag = C.sub.tag, left = ev.racers.filter((id) => !ev.done.includes(id) && id !== first).length;
  ev.done.push(first);
  steps(10);
  assert.notEqual(q.cineF.fid, first, 'off the one who dropped out');
  if (left) assert.equal(q.cineF.sub.tag, tag, 'onto another in the same race');
  // the whole race over: someone else's scene, or a new one
  for (const id of ev.racers) if (!ev.done.includes(id)) ev.done.push(id);
  steps(10);
  assert.ok(!q.cineF.sub || q.cineF.sub.tag !== tag, 'not the race that\'s over');
  // the camera's own actor done (a combine through its passes): the next
  cinefollow.request(w, q, { f: 'combine', near: true }, true);
  steps(5);
  const A = (w.cineActors || []).find((a) => a.main === q.cineF.fid);
  assert.ok(A, 'a combine started for the camera');
  for (let i = 0; i < 100 && !(w.fields || []).some((F) => F.rows.some((row) => row.m)); i++) steps(5);
  assert.ok((w.fields || []).some((F) => F.rows.some((row) => row.m)), 'it harvests as it goes');
  A.done = true;
  steps(10);
  assert.notEqual(q.cineF.sub && q.cineF.sub.id, A.main, 'moved on when it was done');
  // the tour: a kind a while, then the next
  conn.sent.length = 0;
  cinefollow.request(w, q, { f: 'tour', near: true }, true);
  steps(5);
  const k1 = q.cineF.cur, i1 = CINE_TOUR.indexOf(k1);
  assert.ok(k1 && q.cineF.sub, `the tour on ${k1}`);
  q.cineF.kindAt -= CINE_TOUR_S + 1;
  steps(10);
  assert.notEqual(q.cineF.cur, k1, 'on to the next kind');
  assert.ok(CINE_TOUR.indexOf(q.cineF.cur) > i1, 'further along the tour');
  // its subject gone with nobody else in its scene: the next kind straight away
  const k2 = q.cineF.cur, e2 = w.get(q.cineF.sub.id);
  for (const c of cinefollow.candidates(w, k2)) if (c.tag === q.cineF.sub.tag && c.e.kind !== 8) w.remove(c.e);
  if (e2 && e2.kind !== 8 && !e2.removed) w.remove(e2);
  steps(10);
  if (e2 && e2.kind !== 8) assert.notEqual(q.cineF.sub && q.cineF.sub.id, e2.id, 'not on the one who\'s gone');
  assert.ok(said().filter((m) => m.id).length >= 2, 'the page told of each');
  cinefollow.request(w, q, { f: 'stop' }, true);
  steps(50);   // (the actors tidied away out of sight)
});
