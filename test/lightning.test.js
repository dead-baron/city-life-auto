// The storm's lightning (task #389): when it comes, what it is and how far off (client/render/lightning.js - from the
// shared clock, so the same for everyone), as the screen plays it (client/render/weather.js: the flash, the bolt you
// see, the thunder when its sound gets to you).
import test from 'node:test';
import assert from 'node:assert/strict';
import { stormSpell, lightningIn, strikePoint, flashAt, flashLevel, thunderVol, boltPath, STORM_S, PX_PER_M, SOUND_MPS } from '../client/render/lightning.js';
import { Weather } from '../client/render/weather.js';

// (Weather makes a canvas for its fog when it's made: a stand-in, after the import - client/platform.js looks for a
// real document as it loads)
function weather() {
  const had = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
  try { return new Weather({}); } finally { if (had === undefined) delete globalThis.document; else globalThis.document = had; }
}

test('storms come in spells: mostly none, some only distant flashes, bursts of one or two, now and then a storm', () => {
  const N = 6000, moods = [0, 0, 0, 0];
  let events = 0;
  for (let n = 200000; n < 200000 + N; n++) {
    const s = stormSpell(n);
    moods[s.mood]++;
    events += s.ev.length;
    for (const e of s.ev) {
      assert.ok(e.t >= n * STORM_S && e.t < (n + 1) * STORM_S, 'inside its spell');
      assert.ok(['sky', 'bolt', 'strike'].includes(e.kind) && e.k > 0 && e.k <= 1 && Number.isInteger(e.seed));
      if (e.kind !== 'strike') assert.ok(e.d >= 300 && e.d <= 14000, `${e.kind} ${e.d} m off`);
    }
    for (let i = 1; i < s.ev.length; i++) assert.ok(s.ev[i].t >= s.ev[i - 1].t, 'in order');
    if (s.mood === 0) assert.equal(s.ev.length, 0);
    if (s.mood === 1) assert.ok(s.ev.length >= 1 && s.ev.length <= 3 && s.ev.every((e) => e.kind !== 'strike' && e.d >= 5000), 'only distant flashes');
    if (s.mood === 2) assert.ok(s.ev.length >= 1 && s.ev.length <= 2 && s.ev[s.ev.length - 1].t - s.ev[0].t <= 11, 'a burst: one or two together');
    if (s.mood === 3) assert.ok(s.ev.length >= 2 && s.ev.length <= 9, 'a storm');
  }
  const share = moods.map((m) => m / N);
  for (const [i, want] of [[0, 0.45], [1, 0.24], [2, 0.21], [3, 0.1]]) assert.ok(Math.abs(share[i] - want) < 0.03, `mood ${i}: ${(share[i] * 100).toFixed(1)}%`);
  // (it was a flash every 25-85 s of rain: some 65 an hour)
  const perHour = events / (N * STORM_S / 3600);
  assert.ok(perHour > 20 && perHour < 40, `${perHour.toFixed(0)} an hour of rain`);
  // the same for everyone: worked out again (out of the cache), the same spell
  const a = JSON.stringify(stormSpell(200010));
  for (let n = 300000; n < 300040; n++) stormSpell(n);
  assert.equal(JSON.stringify(stormSpell(200010)), a);
});

test('two players, different frame rates, joining at different times: the same flashes at the same moments', () => {
  const seen = (fps, from, to) => {
    const w = weather(), out = [];
    w.stormForce = 3;
    w.fire = (e) => out.push(`${e.t.toFixed(3)}:${e.kind}:${e.seed}`);
    const st = { lt: from, x: 5000, y: 5000, w: 1170, h: 660 };
    for (let lt = from; lt <= to; lt += 1 / fps) { st.lt = lt; w.update(1 / fps, true, lt, st); }
    return out;
  };
  const t0 = 777 * STORM_S;
  const a = seen(60, t0, t0 + 600), b = seen(23, t0 + 100, t0 + 600);
  assert.ok(a.length > 6, `a storm (${a.length} flashes)`);
  const late = a.filter((s) => Number(s.split(':')[0]) > t0 + 100.1);
  assert.deepEqual(b.filter((s) => Number(s.split(':')[0]) > t0 + 100.1), late);
  // and each one once, whatever the frames
  assert.equal(new Set(a).size, a.length);
  const all = [];
  for (let n = 777; n < 777 + 4; n++) for (const e of stormSpell(n, 3).ev) if (e.t > t0 && e.t <= t0 + 600) all.push(`${e.t.toFixed(3)}:${e.kind}:${e.seed}`);
  assert.deepEqual(a, all);
  // only while it rains, and no backlog all at once after the tab was away
  const w = weather();
  let n = 0;
  w.stormForce = 3; w.fire = () => n++;
  const st = { lt: t0, x: 0, y: 0, w: 1170, h: 660 };
  for (let lt = t0; lt < t0 + 300; lt += 0.05) { st.lt = lt; w.update(0.05, false, lt, st); }
  assert.equal(n, 0, 'none while it is dry');
  st.lt = t0 + 900; w.update(0.1, true, t0 + 900, st);
  assert.equal(n, 0, 'a jump: what it missed is let go');
});

test('a strike comes down near you, on a spot whoever is near you sees too, mostly on your screen', () => {
  let on = 0, same = 0, far = 0;
  const N = 3000;
  for (let s = 1; s <= N; s++) {
    const seed = Math.imul(s, 2654435761) >>> 0, x = 3000 + (s * 7919) % 30000, y = 3000 + (s * 104729) % 30000;
    const P = strikePoint(seed, x, y), Q = strikePoint(seed, x + 120, y + 60);
    assert.deepEqual(strikePoint(seed, x, y), P);
    const dx = P.x - x, dy = P.y - y;
    far = Math.max(far, Math.hypot(dx, dy));
    if (Math.abs(dx) < 1170 * 0.44 && dy > -660 * 0.22 && dy < 660 * 0.46) on++;
    if (P.x === Q.x && P.y === Q.y) same++;
  }
  assert.ok(far / PX_PER_M < 30, `within ${(far / PX_PER_M).toFixed(0)} m of you`);
  assert.ok(on / N > 0.55, `on your screen ${(on / N * 100).toFixed(0)}% of the time`);
  assert.ok(same / N > 0.65, `the same spot for someone a few steps away ${(same / N * 100).toFixed(0)}%`);
});

test('the flash flickers - a strike\'s channel lights two to four times - and is gone within a second and a half; near is brightest', () => {
  for (let seed = 1; seed < 200; seed++) {
    for (const kind of ['strike', 'bolt', 'sky']) {
      const e = { kind, d: kind === 'strike' ? 10 : kind === 'bolt' ? 1500 : 6000, k: 0.8, seed: Math.imul(seed, 40503) >>> 0 };
      let peaks = 0, prev = flashAt(e, 0), rising = false, max = prev;
      for (let s = 0.005; s < 1.7; s += 0.005) {
        const f = flashAt(e, s);
        if (f > prev + 1e-9) rising = true; else if (rising && f < prev) { peaks++; rising = false; }
        max = Math.max(max, f); prev = f;
      }
      assert.ok(max <= flashLevel(e) + 1e-9 && flashAt(e, 1.61) === 0 && flashAt(e, -0.1) === 0);
      if (kind === 'strike') assert.ok(peaks >= 1 && peaks <= 3, `a strike re-strikes 1-3 times (${peaks})`);
    }
  }
  const k = (kind, d) => flashLevel({ kind, d, k: 1 });
  assert.ok(k('strike', 10) > k('bolt', 500) && k('bolt', 500) > k('bolt', 5000) && k('bolt', 5000) > k('sky', 5000) && k('sky', 2000) > k('sky', 12000));
});

test('the thunder comes when its sound gets to you (d / 340 m/s): at once beside you, half a minute from a far flash; quieter the further', () => {
  const w = weather(), fired = [], heard = [];
  w.stormForce = 3;
  const fire = w.fire.bind(w);
  w.fire = (e, dbg) => { fire(e, dbg); fired.push({ t: e.t, kind: e.kind, d: w.thunders[w.thunders.length - 1].d }); };
  w.onThunder = (d, k) => heard.push({ d, k, lt: w.lt });
  const t0 = 4321 * STORM_S, st = { lt: t0, x: 12000, y: 9000, w: 1170, h: 660 };
  for (let lt = t0; lt < t0 + 4 * STORM_S + 40; lt += 1 / 30) { st.lt = lt; w.update(1 / 30, lt < t0 + 4 * STORM_S, lt, st); }
  assert.ok(fired.length > 8 && heard.length === fired.length, `${fired.length} flashes, ${heard.length} heard`);
  assert.ok(fired.some((f) => f.kind === 'strike') && fired.some((f) => f.kind !== 'strike'));
  for (const f of fired) {
    const h = heard.find((x) => x.d === f.d);
    const delay = h.lt - f.t, want = f.d / SOUND_MPS;
    assert.ok(delay >= want - 1e-6 && delay < want + 1 / 30 + 1e-6, `${f.kind} ${f.d.toFixed(0)} m off: heard ${delay.toFixed(2)} s later (${want.toFixed(2)})`);
    if (f.kind === 'strike') assert.ok(delay < 0.1, 'a strike beside you cracks at once');
  }
  for (const k of [0.3, 1]) for (let d = 10; d < 14000; d *= 1.5) assert.ok(thunderVol(d * 1.5, k) <= thunderVol(d, k));
  assert.ok(thunderVol(20, 1) > 4 * thunderVol(9000, 0.4), 'a far rumble a murmur');
});

test('lightning you can see: a bolt off in the distance is on the storm\'s side, one across the clouds stays up in the sky, a strike lands where it is told', () => {
  for (const [W, H] of [[1280, 720], [390, 844]]) {
    for (let seed = 1; seed <= 40; seed++) {
      const inside = (B) => B.segs.every((s) => s[0] >= 0 && s[0] <= W && s[2] >= 0 && s[2] <= W && s[1] >= 0 && s[1] <= H && s[3] >= 0 && s[3] <= H && [3, 1.8, 1.2, 1].some((w) => Math.abs(s[4] - w) < 0.01));
      const c = boltPath(seed, W, H, false, { cloud: true, at: 0.8, w: 1.8 });
      assert.ok(inside(c) && c.segs.length > c.trunk && c.trunk >= 6 && c.cloud);
      assert.ok(c.segs.slice(0, c.trunk).every((s) => s[1] < H * 0.5 && s[3] < H * 0.5), 'across the clouds: up in the sky');
      const f = boltPath(seed, W, H, false, { at: 0.85, w: 1.8 });
      assert.ok(inside(f) && f.segs[0][0] > W * 0.6 && f.end.y <= H * 0.5, 'off on the storm\'s side, ending up in the distance');
      const end = { x: Math.round(W * (0.2 + 0.6 * ((seed * 37) % 100) / 100)), y: Math.round(H * 0.7) };
      const s = boltPath(seed, W, H, true, { end });
      assert.ok(inside(s) && s.near && s.end.x === end.x && s.end.y === end.y && s.segs[0][1] === 0, 'down from the top to where it strikes');
    }
  }
});
