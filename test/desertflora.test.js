// The desert's small plants (the art pass, 2026-11-25; concepts NA1-C, NS1-C, SC3-F: dry scrub, a cactus here and
// there, bloom a rare patch). Counted that day: a bloom patch was 22.8% of the desert and 39% of its small plants were
// flower beds; reeds stood in Dusty Hollow's gravel street; a desert river's green strip grew meadow flowers; a
// seep's ring was the marsh's dark mud. The rules, by their code and by counting over the desert's box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESERT_BLOOM, desertCover, makeStatic } from '../client/art2/game/statics.js';
import { tinaPx } from '../client/art2/game/groundbake.js';
import { vnoise, hash } from '../client/art2/gbuf.js';

const TILE = 32, SRC = readFileSync(new URL('../client/art2/game/statics.js', import.meta.url), 'utf8');

test('bloom is a rare patch: few flower beds among the scrub, brittlebush first', () => {
  const n = {}; let tiles = 0, zone = 0;
  for (let ty = 300; ty < 2700; ty += 3) for (let tx = 4300; tx < 6100; tx += 3) {   // (the Red Rock Desert's box, tiles)
    const x = tx * TILE + 16, y = ty * TILE + 16, pa = vnoise(x, y, 170, 7105), pb = vnoise(x, y, 90, 7107), h = hash(tx, ty, 7101), h2 = vnoise(x, y, 70, 7103) * 0.75 + hash(tx, ty, 7103) * 0.25;
    tiles++; if (pa > DESERT_BLOOM.zone) zone++;
    const r = desertCover(pa, pb, h, h2); if (r) n[r[0]] = (n[r[0]] || 0) + 1;
  }
  const all = Object.values(n).reduce((a, b) => a + b, 0), beds = (n.dFlowers || 0) + (n.dPoppies || 0);
  assert.ok(zone / tiles > 0.02 && zone / tiles < 0.09, `a bloom patch is 2-9% of the desert (${(zone / tiles * 100).toFixed(1)}%)`);
  assert.ok(beds > 0 && beds / all < 0.06, `flower beds are under 6% of the small plants, and there are some (${(beds / all * 100).toFixed(1)}%)`);
  assert.ok((n.dFlowers || 0) < (n.dPoppies || 0), 'the many-coloured bed is the rarest bloom');
  assert.ok(n.brittle > beds && n.creosote > beds && n.dryGrass > beds, `each of the scrub's main plants outnumbers the beds (${n.creosote}, ${n.brittle}, ${n.dryGrass}; ${beds})`);
  assert.ok(all / tiles > 0.1 && all / tiles < 0.2, `a plant on 10-20% of the tiles (${(all / tiles * 100).toFixed(1)}%)`);
});

test('gravel and the river strip in the desert and its towns: scrub and rushes, no reeds in a street, no meadow flowers', () => {
  assert.match(SRC, /const dry = M\.dist\[i\] === 50 \|\| \(DISTRICTS\[M\.dist\[i\]\] \|\| \{\}\)\.isl === 'Red Rock Desert' \|\| \(\(M\.reserve\[i\] & 128\) && \[\[5, 0\], \[-5, 0\], \[0, 5\], \[0, -5\]\]\.some\(/, "the desert, its towns, and a bank whose land five tiles off is the desert's (a river's bank is the water's district: 13 at the dam's wash)");
  assert.match(SRC, /if \(t === T\.SAND\) return h < 0\.07 && [^?]*\? \[pickW\(dry \? NAT_SP\.desert : NAT_SP\.shore, h2\), 1\] : null/);
  assert.match(SRC, /if \(dry\) return h < 0\.3 \? \[pickW\(NAT_SP\.desertBank, h2\), 1\] : null;[^\n]*\n\s*if \(pa > 0\.6 && h < 0\.34\)/, 'the dry rule comes before the meadow drifts');
  const bank = SRC.match(/desertBank: (\[\[.*?\]\]),/)[1];
  assert.ok(!/lupines|poppies|daisies|fern|berry|foxglove/.test(bank), `no meadow or forest plants on a desert bank (${bank})`);
});

test("a seep's ring is the desert's cracked mud, a tinaja's bowl its red rock", () => {
  const G = readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8');
  assert.match(G, /return e\.k \? M_\.CRACKED : M_\.REDROCK;/);
  const seep = tinaPx([{ x: 0, y: 0, r: 60, ring: 50, k: 1 }], 70, 0, 5), bowl = tinaPx([{ x: 0, y: 0, r: 60, ring: 50 }], 70, 0, 5);
  assert.ok(seep >= 0 && bowl >= 0 && seep !== bowl, 'both paint, each its own ground');
  assert.equal(tinaPx([{ x: 0, y: 0, r: 60, ring: 50, k: 1 }], 400, 0, 5), -1, 'nothing far from the water');
});

test('hoodoos: natural columns, no two alike - thick and thin, leaning, capped by a slab or a boulder or worn to a spire', () => {
  // (the owner, 11-25 18:14, of the first ones: "very unnatural ... not all so uniform and perfectly flat and round")
  const sigs = new Set(), girth = [], lean = []; let capped = 0, spire = 0, lopsided = 0, n = 0;
  for (const h of [42, 72, 102]) for (let sd = 1; sd <= 12; sd++) {
    const G = makeStatic({ t: 'v', m: 'hoodoo', a: [h, sd], hd: 0 }), rows = [];
    let y0 = -1, y1 = -1, sig = 0;
    for (let y = 0; y < G.h; y++) { let a = -1, b = -1; for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3]) { if (a < 0) a = x; b = x; sig = (Math.imul(sig, 31) + G.col[(y * G.w + x) * 4] + x) | 0; } rows.push(a < 0 ? null : [a, b]); if (a >= 0) { if (y0 < 0) y0 = y; y1 = y; } }
    const H = y1 - y0 + 1, wAt = (f0, f1, fn) => fn(...rows.slice(y0 + Math.floor(H * f0), y0 + Math.ceil(H * f1)).filter(Boolean).map(([a, b]) => b - a + 1));
    const top = wAt(0, 0.22, Math.max), neck = wAt(0.28, 0.6, Math.min), foot = wAt(0.8, 1, Math.max), mid = (f) => { const r = rows[y0 + Math.floor(H * f)]; return r ? (r[0] + r[1]) / 2 : 0; };
    assert.ok(H >= h * 1.6 && H <= h * 2 + 80, `h ${h} seed ${sd}: its height in world px, with its foot and cap (${H})`);
    assert.ok(foot >= neck, `h ${h} seed ${sd}: it stands on a foot at least as wide as its neck (${foot}, ${neck})`);
    n++; sigs.add(sig); girth.push(foot / H * (h / 72)); lean.push(Math.abs(mid(0.3) - mid(0.9)));
    if (top >= neck * 1.5) capped++; else if (top <= neck * 1.1) spire++;
    // lopsided: its outline's two sides are not mirror images about its foot's middle
    const c = mid(0.95); let off = 0, m = 0; for (let y = y0; y <= y1; y++) { const r = rows[y]; if (!r) continue; m++; if (Math.abs((c - r[0]) - (r[1] - c)) > 3) off++; } if (off / m > 0.3) lopsided++;
  }
  assert.equal(sigs.size, n, `each height and seed its own picture (${sigs.size} of ${n})`);
  assert.ok(capped >= n * 0.3 && spire >= 3, `some capped, some worn to a spire (${capped} capped, ${spire} spires of ${n})`);
  assert.ok(lopsided >= n * 0.6, `most are lopsided, none turned on a lathe (${lopsided} of ${n})`);
  assert.ok(Math.max(...girth) > Math.min(...girth) * 1.5, `thick and thin (${Math.min(...girth).toFixed(2)} to ${Math.max(...girth).toFixed(2)})`);
  assert.ok(Math.max(...lean) > 6, `some lean (${Math.max(...lean).toFixed(1)} px)`);
});

test("an arch in the desert is red sandstone, bare; the sea's keeps its dark rock and turf", () => {
  const mean = (G) => { let n = 0, r = 0, g = 0, b = 0, green = 0; for (let i = 0; i < G.w * G.h; i++) { const j = i * 4; if (!G.col[j + 3]) continue; n++; r += G.col[j]; g += G.col[j + 1]; b += G.col[j + 2]; if (G.col[j + 1] > G.col[j] + 12 && G.col[j + 1] > G.col[j + 2]) green++; } return { r: r / n, g: g / n, b: b / n, green: green / n }; };
  const sea = mean(makeStatic({ t: 'v', m: 'seaArch', a: [200, 64, 130, 3, 0], hd: 0 })), dry = mean(makeStatic({ t: 'v', m: 'seaArch', a: [200, 64, 130, 3, 1], hd: 0 }));
  assert.ok(dry.r > dry.b * 1.5 && dry.r > dry.g * 1.25, `the desert's arch is red (${Math.round(dry.r)}, ${Math.round(dry.g)}, ${Math.round(dry.b)})`);
  assert.ok(dry.green < 0.005, `nothing green on it (${(dry.green * 100).toFixed(1)}%)`);
  assert.ok(sea.r < sea.b * 1.3 && sea.green > 0.02, `the sea's arch as before: grey rock, turf on top (${Math.round(sea.r)}, ${Math.round(sea.b)}; ${(sea.green * 100).toFixed(1)}% green)`);
  assert.match(SRC, /const dry = c\.dist\(x, y\)\.style === 'desert' \|\| c\.biome\(x, y\) === 3 \? 1 : 0;/, 'the bake picks it by where the arch stands');
});

test('the tin shack and the rusted pickup: drawn, rust and tin on the roof, the pickup darker than the ground it stands on', () => {
  const stat = (G) => { let n = 0, r = 0, g = 0, b = 0, grey = 0, rust = 0; for (let i = 0; i < G.w * G.h; i++) { const j = i * 4; if (!G.col[j + 3]) continue; n++; r += G.col[j]; g += G.col[j + 1]; b += G.col[j + 2]; if (Math.abs(G.col[j] - G.col[j + 2]) < 26 && G.col[j] > 90) grey++; if (G.col[j] > G.col[j + 2] * 1.6 && G.col[j] > 80) rust++; } return { n, lum: (r + g + b) / 3 / n, grey: grey / n, rust: rust / n }; };
  for (const sd of [1, 2, 3]) { const S = stat(makeStatic({ t: 'v', m: 'tinShack', a: [sd], hd: 0 })); assert.ok(S.n > 3000, `shack ${sd}: it draws (${S.n} px)`); assert.ok(S.grey > 0.04 && S.rust > 0.15, `shack ${sd}: bare tin and rust both show (${(S.grey * 100).toFixed(0)}% tin, ${(S.rust * 100).toFixed(0)}% rust)`); }
  for (const hd of [0, 0.79, 2.75, 3.93]) { const P = stat(makeStatic({ t: 'v', m: 'rustPickup', a: [1], hd })); assert.ok(P.n > 1500, `pickup at ${hd}: it draws (${P.n} px)`); assert.ok(P.rust > 0.5 && P.lum < 125, `pickup at ${hd}: rust all over, darker than the desert's ground (${(P.rust * 100).toFixed(0)}%, ${Math.round(P.lum)})`); }
});

