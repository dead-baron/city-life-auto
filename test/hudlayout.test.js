// The HUD on every screen (H70): the prompt (what Act would do - "Steal the Sedan - Vehicle theft"), the notes, the job
// line, the cruiser's hint and the robbery and custody bars fully on the screen and never under a button, the minimap,
// the cash and the stars, nor each other - on desktops (1280x720, 1920x1080), phones on their side (844x390, 740x360)
// and upright (390x844; 412x892 with a camera in the screen's top) and a tablet (1024x768), with a keyboard, a pad or the touch controls, on foot, driving, flying,
// as the police, robbing a shop and arrested. The QA sweep of 2026-10-11 found the prompt under the round buttons on a
// phone (its first word or two showing) and on a desktop with a long prompt, and the notes over the job line on a phone.
// Measured for real: the HUD's markup from index.html with the stylesheet in a headless Chromium (test/hudpage.js;
// skipped when there's none - set CLA_CHROME to one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problems, scenarios, findChrome, measureAll, FLAGS, SIZES } from './hudpage.js';
import { touchSlots } from '../shared/touchcontrols.js';

test('the prompt, the notes, the job line, the cruiser hint and the bars are readable and clear of the buttons on every screen', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const all = await measureAll();
  assert.equal(all.length, scenarios().length, 'every scenario measured');
  const bad = all.flatMap(problems);
  assert.ok(all.every((r) => r.sc.st === 'custody' || r.read.some((b) => b.name === 'prompt')), 'the prompt shows everywhere');
  assert.ok(all.every((r) => !['rob', 'custody'].includes(r.sc.st) || r.read.some((b) => b.name === (r.sc.st === 'rob' ? 'rob' : 'trainbar'))), 'the robbery and custody bars show');
  assert.deepEqual(bad, [], bad.slice(0, 30).join('\n'));
  // and you, in the middle of the screen: never under the prompt, the notes, the bars or the job line on a phone
  // (844x390 on its side: one note at a time while there's a prompt; upright), a tablet or a desktop - not yet on a
  // 740x360 phone (the newest note can reach your head) nor with four long notes stacked on a keyboard's 1024x768
  // the touch controls by slots (UI-2, 2026-10-24), in every touch state on every screen: none on another, every one
  // 44 px or more, nothing of them in the left 40% (the move stick's: it comes up where the thumb lands), nor over the
  // middle of the screen (you and the space round you), nor on the HUD (the minimap, the vitals, the cash, the weapon,
  // the round buttons); held upright all of them right of the middle; and each slot holding what shared/controls.js
  // says it does for that state
  const ctl = [], HUDK = ['minimap', 'vitals', 'status', 'rclock', 'weapon', 'money', 'bank', 'vchip', 'stars', 'clock'];
  const on = (a, b) => a.x0 < b.x1 - 2 && b.x0 < a.x1 - 2 && a.y0 < b.y1 - 2 && b.y0 < a.y1 - 2;
  for (const r of all.filter((q) => q.sc.dev === 'touch')) {
    const { w, h, st } = r.sc, tag = `${w}x${h} ${st}`, ks = r.keep.filter((k) => k.name.startsWith('tb.') || k.name === 'stick-l' || k.name === 'talk' || k.name === 'emote'), tb = ks.filter((k) => k.name.startsWith('tb.'));
    const mid = { x0: w / 2 - w / 6, x1: w / 2 + w / 6, y0: h / 2 - h / 8, y1: h / 2 + h / 8 };
    // (the buttons are discs since 11-03, as test/touchslots.test.js has them: two apart when their circles are - the weapon
    // card and the move stick's zone boxes)
    const disc = (a) => a.name.startsWith('tb.') && a.name !== 'tb.nextw';
    const hit = (a, b) => (disc(a) && disc(b) ? Math.hypot((a.x0 + a.x1 - b.x0 - b.x1) / 2, (a.y0 + a.y1 - b.y0 - b.y1) / 2) < (a.x1 - a.x0 + b.x1 - b.x0) / 2 - 2 : on(a, b));
    for (const [i, a] of ks.entries()) for (const b of ks.slice(i + 1)) if (hit(a, b)) ctl.push(`${tag}: ${a.name} on ${b.name}`);
    for (const a of tb) {
      if (a.x1 - a.x0 < 44 || a.y1 - a.y0 < 44) ctl.push(`${tag}: ${a.name} ${a.x1 - a.x0}x${a.y1 - a.y0}`);
      if (a.x0 < w * 0.4) ctl.push(`${tag}: ${a.name} in the move stick's left 40% (x ${a.x0})`);
      if (h > w && a.x0 < w / 2) ctl.push(`${tag}: ${a.name} in the left half`);
      if (on(a, mid)) ctl.push(`${tag}: ${a.name} over the middle (${a.x0},${a.y0}-${a.x1},${a.y1})`);
      if (a.x0 < 0 || a.y0 < 0 || a.x1 > w || a.y1 > h) ctl.push(`${tag}: ${a.name} off the screen`);
      for (const k of r.keep.filter((q) => HUDK.includes(q.name) || q.name.startsWith('b-'))) if (on(a, k)) ctl.push(`${tag}: ${a.name} on ${k.name} (${a.x0},${a.y0}-${a.x1},${a.y1} vs ${k.x0},${k.y0}-${k.x1},${k.y1})`);
    }
    const want = touchSlots(FLAGS[st]), got = Object.fromEntries(tb.map((k) => [k.slot, { a: k.name.slice(3), label: k.label }]));
    assert.equal(r.state && r.state.state, want.state, `${tag}: the state`);
    if (JSON.stringify(Object.keys(got).sort().map((k) => [k, got[k]])) !== JSON.stringify(Object.keys(want.slots).sort().map((k) => [k, want.slots[k]]))) ctl.push(`${tag}: the slots ${JSON.stringify(got)} - controls.js says ${JSON.stringify(want.slots)}`);
  }
  assert.ok(all.some((r) => r.sc.st === 'air' && r.keep.some((k) => k.name === 'tb.climb')), 'the rocker measured');
  // UI-6 (the owner, 2026-10-26: "moving the weapons button down to the bottom UI so it's easier to switch weapons"): on
  // touch the weapon button is a slot by the right thumb - low on the screen, right of the middle, 44 px or more (the
  // checks above: on nothing, clear of the middle) - upright and on its side, with or without a camera in the screen;
  // nothing of it left in the top right
  const wpn = [], wsz = new Set();
  for (const r of all.filter((q) => q.sc.dev === 'touch')) {
    const { w, h, st } = r.sc, tag = `${w}x${h} ${st}`, b = r.keep.find((k) => k.name === 'tb.nextw');
    if (r.keep.some((k) => k.name === 'weapon')) wpn.push(`${tag}: the weapon plate still in the HUD`);
    if (!touchSlots(FLAGS[st]).slots.wp) { if (b) wpn.push(`${tag}: a weapon button with nothing to switch`); continue; }
    if (!b) { wpn.push(`${tag}: no weapon button`); continue; }
    wsz.add(`${w}x${h}`);
    if (b.slot !== 'wp') wpn.push(`${tag}: the weapon button in ${b.slot}`);
    // (upright in the bottom half; on its side - a 390 px tall screen, the arc round the aim stick full - in the right
    // third, under the top band, by the stick)
    if (h > w ? b.y0 < h / 2 : b.y0 < h * 0.3) wpn.push(`${tag}: the weapon button too high (y ${b.y0})`);
    if (b.x0 < (h > w ? w / 2 : w * 2 / 3)) wpn.push(`${tag}: the weapon button too far left (x ${b.x0})`);
    if (b.x1 - b.x0 < 44 || b.y1 - b.y0 < 44) wpn.push(`${tag}: the weapon button ${b.x1 - b.x0}x${b.y1 - b.y0}`);
  }
  for (const s of ['390x844', '412x892', '844x390', '740x360']) assert.ok(wsz.has(s), `the weapon button measured at ${s}`);
  assert.deepEqual(wpn, [], wpn.slice(0, 30).join('\n'));
  assert.deepEqual(ctl, [], ctl.slice(0, 30).join('\n'));
  // the HUD's buttons (UI-8, the owner 2026-10-30: "the top menu bar doesn't need 'menu, phone, map' text, a simple icon
  // should work"; Direction A, 2026-11-12: one row of system buttons - phone, map, chat, menu - chat moved into it): icons,
  // no words (each named for a screen reader and a tooltip), the keys' badges on a keyboard (P / M / T / Esc), none on a
  // pad or a phone; square, 44 px or more on touch, side by side in the top-right zone, the menu at the right edge; the
  // debug button apart from them, quiet in the world's column
  const row = [];
  for (const r of all) {
    const { w, h, dev, st } = r.sc, tag = `${w}x${h} ${dev} ${st}`, bs = r.keep.filter((k) => k.name.startsWith('b-'));
    const nav = bs.filter((b) => b.name !== 'b-dev'), dbg = bs.find((b) => b.name === 'b-dev');
    // (on touch chat is by the thumb - the owner, 11-12: the top row was a stretch for something used often - the row
    // phone, map, menu; the thumb's chat button 44 px or more, in the bottom band, clear of the move stick's rest and of
    // every other button - the overlap checks above take it in as 'talk'; upright and on its side alike it sits by the
    // move stick along the bottom, on the left half: the owner, 2026-11-12). The emote button beside it (the owner,
    // 2026-11-13: emotes apart from chat) the same way - in the bottom band, on the left half, on nothing else: next to it
    // along the bottom on its side, over it upright (the right thumb's cluster starts at the middle there)
    const touch = dev === 'touch';
    for (const [nm, what] of [['talk', 'chat'], ['emote', 'emote']]) {
      const b = r.keep.find((k) => k.name === nm);
      if (touch !== !!b) row.push(`${tag}: the thumb's ${what} button ${b ? 'shown' : 'missing'}`);
      if (b && (b.x1 - b.x0 < 44 || b.y1 - b.y0 < 44 || b.y1 < h - 60 || b.x1 > w / 2)) row.push(`${tag}: the thumb's ${what} button isn't by the left thumb (${b.x0},${b.y0}-${b.x1},${b.y1})`);
    }
    const talk = r.keep.find((k) => k.name === 'talk'), emo = r.keep.find((k) => k.name === 'emote');
    if (talk && emo && !(h > w ? Math.abs(emo.x0 - talk.x0) <= 2 && emo.y1 <= talk.y0 && talk.y0 - emo.y1 <= 12 : Math.abs(emo.y1 - talk.y1) <= 2 && emo.x0 >= talk.x1 && emo.x0 - talk.x1 <= 12)) row.push(`${tag}: the emote button isn't beside the chat button (${emo.x0},${emo.y0} by ${talk.x0},${talk.y0})`);
    const want = touch ? 'b-phone,b-map,b-menu' : 'b-phone,b-map,b-chat,b-emo,b-menu';   // (the emotes beside chat on a desktop: 11-13)
    if (nav.map((b) => b.name).join() !== want) { row.push(`${tag}: the row is ${nav.map((b) => b.name)}`); continue; }
    if (!dbg) row.push(`${tag}: no debug button`);
    if (nav.some((b) => b.label)) row.push(`${tag}: words on the buttons ${nav.map((b) => b.label)}`);
    if (nav.map((b) => b.name2).join() !== (touch ? 'Phone,Map,Menu' : 'Phone,Map,Chat,Emotes,Menu')) row.push(`${tag}: names ${nav.map((b) => b.name2)}`);
    const keys = nav.map((b) => b.key).join();
    if (dev === 'kbm' ? keys !== 'P,M,T,B,ESC' : keys !== (touch ? ',,' : ',,,,')) row.push(`${tag}: key badges ${keys}`);
    const m = nav[nav.length - 1];
    if (w - m.x1 > 30 || m.y1 > (h > w ? h * 0.2 : h * 0.4) + (r.sc.cam || 0)) row.push(`${tag}: the menu isn't in the top-right zone (${m.x0},${m.y0}-${m.x1},${m.y1})`);
    for (const [i, a] of nav.entries()) {
      if (i && Math.abs(a.y0 - nav[0].y0) > 1) row.push(`${tag}: ${a.name} out of the row`);
      if (Math.abs((a.x1 - a.x0) - (a.y1 - a.y0)) > 1) row.push(`${tag}: ${a.name} not square`);
    }
    for (const [i, a] of bs.entries()) {
      if (dev === 'touch' && (a.x1 - a.x0 < 44 || a.y1 - a.y0 < 44)) row.push(`${tag}: ${a.name} ${a.x1 - a.x0}x${a.y1 - a.y0}`);
      if (a.name !== 'b-dev' && a.y1 - a.y0 < 40) row.push(`${tag}: ${a.name} ${a.y1 - a.y0} px tall`);
      for (const b of bs.slice(i + 1)) if (on(a, b)) row.push(`${tag}: ${a.name} on ${b.name}`);
      if (h > w && (a.y1 > h * 0.3 || on(a, { x0: w / 2 - w / 6, x1: w / 2 + w / 6, y0: h / 2 - h / 8, y1: h / 2 + h / 8 }))) row.push(`${tag}: ${a.name} out of the top band`);
    }
    const mm = r.keep.find((k) => k.name === 'minimap');
    if (dbg && (dbg.x0 > mm.x1 + 12 || dbg.y0 < mm.y0 || dbg.x1 > (h > w ? w / 2 : w / 3))) row.push(`${tag}: the debug button isn't in the world's column, under or beside the minimap (${dbg.x0},${dbg.y0})`);
  }
  assert.deepEqual(row, [], row.slice(0, 20).join('\n'));
  const you = all.filter((r) => !/^740x360|^844x390 (kbm|pad)|^1024x768 (kbm|pad)/.test(`${r.sc.w}x${r.sc.h} ${r.sc.dev}`)).flatMap((r) => problems(r, { you: true }));
  assert.deepEqual(you, [], you.join('\n'));
  // UI-4, the HUD's information (the owner's bar: the view first, information that comes and goes):
  const info = [], forms = new Set();
  const HUDKEEP = ['minimap', 'vitals', 'status', 'rclock', 'weapon', 'money', 'bank', 'vchip', 'stars', 'clock'];
  for (const r of all) {
    const { w, h, dev, st } = r.sc, tag = `${w}x${h} ${dev} ${st}`, touch = dev === 'touch';
    const third = { x0: w / 3, x1: w * 2 / 3, y0: h / 3, y1: h * 2 / 3 }, mid = { x0: w / 2 - w / 6, x1: w / 2 + w / 6, y0: h / 2 - h / 8, y1: h / 2 + h / 8 };
    const get = (n) => r.read.find((b) => b.name === n);
    // the prompt: one slot - by you (under you) with a keyboard or a pad, above the thumbs on touch; never on you
    const pr = get('prompt');
    if (pr) {
      if (!touch && (Math.abs((pr.x0 + pr.x1) / 2 - w / 2) > w / 4 || pr.y0 < h / 2)) info.push(`${tag}: the prompt isn't by you (${pr.x0},${pr.y0}-${pr.x1},${pr.y1})`);
      if (touch && h > w && pr.y0 < h / 2) info.push(`${tag}: the prompt above you upright (y ${pr.y0})`);
      if (touch && w > h && pr.y1 < h / 2) info.push(`${tag}: the prompt not low on its side (y ${pr.y1})`);
    }
    // the objective (the job card - Direction A's zone map: top centre, one line): right of the minimap and left of the
    // plate on a screen wider than tall, under the top band upright; never over the middle; big or a one-line chip (44 px
    // to tap on touch)
    const jb = get('job');
    if (!jb) info.push(`${tag}: no job card`);
    else {
      forms.add(`${w}x${h} ${jb.form}`);
      const mm = r.keep.find((k) => k.name === 'minimap'), vt = r.keep.find((k) => k.name === 'vitals');
      if (h > w ? jb.y0 < mm.y1 : jb.x0 < mm.x1 || jb.x1 > vt.x0 || jb.y0 > mm.y0 + 12) info.push(`${tag}: the objective isn't top centre (${jb.x0},${jb.y0}-${jb.x1},${jb.y1})`);
      if (on(jb, mid)) info.push(`${tag}: the job card over the middle (${jb.x0},${jb.y0}-${jb.x1},${jb.y1})`);
      const jh = jb.y1 - jb.y0;
      if (jb.form === 'chip' && (jh > (touch ? 48 : 40) || (touch && jh < 44))) info.push(`${tag}: the job chip ${jh} px tall`);
      if (jb.form === 'big' && jh > 132) info.push(`${tag}: the job card ${jh} px tall`);
    }
    // the notes: two at most, one line each, never in the middle third
    const notes = r.read.filter((b) => b.name.startsWith('note'));
    if (notes.length > 2) info.push(`${tag}: ${notes.length} notes`);
    for (const n of notes) {
      if (n.y1 - n.y0 > 34) info.push(`${tag}: ${n.name} more than a line (${n.y1 - n.y0} px)`);
      if (on(n, third)) info.push(`${tag}: ${n.name} in the middle third (${n.x0},${n.y0}-${n.x1},${n.y1})`);
    }
    // the hint strip clear of the middle too (it comes and goes over the bottom)
    const hs = get('hints');
    if (hs && on(hs, mid)) info.push(`${tag}: the hint strip over the middle`);
    // 14 px the smallest words on a phone (UI-1's 12 px exception for the HUD's readouts is gone)
    if (touch && r.minFont < 14) info.push(`${tag}: ${r.minFont} px words (${r.minAt})`);
    // (Direction A, 2026-11-12: a word on a touch button in CLA Pixel, stepped down to fit its disc - 10 px, the face's own
    // pixel size, the smallest: RELOAD and GALLOP on a 48-52 px switch; the face buttons 14 or 16)
    if (touch && r.minBtn < 10) info.push(`${tag}: ${r.minBtn} px words on a button (${r.minBtnAt})`);
    // the HUD's own parts clear of each other (the minimap, the vitals and status, the top-right column, the row)
    const hk = r.keep.filter((k) => HUDKEEP.includes(k.name) || k.name.startsWith('b-'));
    for (const [i, a] of hk.entries()) for (const b of hk.slice(i + 1)) if (on(a, b)) info.push(`${tag}: ${a.name} on ${b.name}`);
  }
  for (const [w, h] of SIZES) for (const f of ['big', 'chip']) assert.ok(forms.has(`${w}x${h} ${f}`), `the job card ${f} measured at ${w}x${h}`);
  assert.deepEqual(info, [], info.slice(0, 40).join('\n'));
  // UI-5 (the owner, 2026-10-26, on a Pixel 7 Pro held upright: "The health and stamina at the top get blocked by a camera
  // lens"; "The time of day blocks too much of the minimap"): nothing on the minimap, the clock included; and held upright
  // nothing of the HUD above the safe area's top (a notch, a centred or a corner punch-hole: 412x892 is played with one)
  // nor in the top-centre band where a centred camera sits even on a phone that doesn't say so (the middle 20%, the top
  // 48 px - or the safe area and a little). UI-8 (the owner, 2026-10-30: upright "health and stamina in a strange
  // location and time just off to the side of the minimap"; his concepts U1-U4): health and stamina in one plate with the
  // cash, top right; the clock's plate above the minimap upright, beside it on a wider screen. UI-9 (the owner's UI kit
  // and HUD concepts, 2026-11-03): the cash beside the bars on a wide screen, under them upright
  const cam = [];
  for (const r of all) {
    const { w, h, dev, st } = r.sc, top = r.sc.cam || 0, tag = `${w}x${h} ${dev} ${st}`;
    const mm = r.keep.find((k) => k.name === 'minimap');
    const hud = [...r.keep.filter((k) => HUDKEEP.includes(k.name) || k.name.startsWith('b-')), ...r.read];
    for (const k of [...hud, ...r.keep.filter((q) => q.name.startsWith('tb.'))]) if (k !== mm && on(k, mm)) cam.push(`${tag}: ${k.name} on the minimap (${k.x0},${k.y0}-${k.x1},${k.y1})`);
    // the clock (Direction A's zone map: "clock and weather under it"): under the minimap, at its left
    {
      const ck = r.keep.find((k) => k.name === 'rclock');
      if (!ck) cam.push(`${tag}: no clock`);
      else if (ck.y0 < mm.y1 || ck.y0 > mm.y1 + 16 || Math.abs(ck.x0 - mm.x0) > 12) cam.push(`${tag}: the clock isn't under the minimap ${JSON.stringify(ck)}`);
    }
    // health and stamina with the cash, one plate top right (U1-U4): the vitals over the cash, both at the right edge
    {
      const v = r.keep.find((k) => k.name === 'vitals'), mo = r.keep.find((k) => k.name === 'money');
      // (UI-9, the concepts UIK-00 3B and UIC-11..13: on a wide screen the bars left of the cash, a hairline between - the
      // cash over the bank; upright (UIC-14) and on a short window the cash under the bars)
      const over = v && mo && v.y1 <= mo.y0 + 2, beside = v && mo && v.x1 <= mo.x0 + 2 && v.y0 < mo.y1 && mo.y0 < v.y1;
      if (!v || !mo || !(over || beside) || (h > w && !over) || w - v.x1 > 340 || w - mo.x1 > 260 || v.y0 > 160 + (r.sc.cam || 0)) cam.push(`${tag}: the vitals aren't with the cash top right ${JSON.stringify([v, mo])}`);
    }
    if (dev !== 'touch' || h < w) continue;
    const band = { x0: w * 0.4, x1: w * 0.6, y0: -99, y1: Math.max(48, top + 8) };
    for (const k of [mm, ...hud]) {
      if (k.y0 < top) cam.push(`${tag}: ${k.name} above the safe area (y ${k.y0} < ${top})`);
      if (on(k, band)) cam.push(`${tag}: ${k.name} in the top-centre band (${k.x0},${k.y0}-${k.x1},${k.y1})`);
    }
  }
  assert.ok(all.some((r) => r.sc.cam), 'a phone with a camera in the screen measured');
  assert.ok(all.some((r) => r.sc.h > r.sc.w && r.keep.some((k) => k.name === 'rclock')), 'the clock measured upright');
  assert.deepEqual(cam, [], cam.slice(0, 40).join('\n'));
  // UI-7 (the owner, 2026-10-26, upright: "Fishing UI is hidden behind the weapons selection button. ... Some text is on
  // two lines"): the fight's meter has its own spot in the HUD (#fishspot: client/fishing.js draws in its box) - on every
  // screen, tall enough to play (120 px on a screen under 400 px tall), on nothing and under nothing (the checks above: the touch slots, the prompt, the notes,
  // the job card, the minimap, the top-right column; and never on you); the big cue (STRIKE!) on one line
  const fish = [];
  for (const [w, h] of SIZES) if (!all.some((r) => r.sc.st === 'fish' && r.sc.w === w && r.sc.h === h && r.read.some((b) => b.name === 'fishspot'))) fish.push(`${w}x${h}: no fishing meter measured`);
  for (const r of all.filter((q) => q.sc.st === 'fish')) {
    const { w, h, dev } = r.sc, tag = `${w}x${h} ${dev} fish`, sp = r.read.find((b) => b.name === 'fishspot'), cue = r.read.find((b) => b.name === 'fishbar');
    if (!sp || sp.y1 - sp.y0 < (h < 400 ? 120 : 150) || sp.x1 - sp.x0 < 70) fish.push(`${tag}: the meter's spot ${JSON.stringify(sp)}`);
    if (!cue) fish.push(`${tag}: no cue`);
    else if (cue.y1 - cue.y0 > 46) fish.push(`${tag}: the cue on two lines (${cue.y1 - cue.y0} px tall)`);
    if (dev === 'touch' && r.state && r.state.state !== 'fish') fish.push(`${tag}: the slots in ${r.state.state}`);
  }
  assert.deepEqual(fish, [], fish.slice(0, 30).join('\n'));
});

// the prompt's crime marks (hud.js crimeMarks: the key chip red with a "!", a felony ringed; the touch button red - no
// warning plate): the server says what Act would be
test('the prompt says when what Act would do is a crime, and when a felony', async () => {
  const { makeWorld, joinPlayer, run, teleport } = await import('./helpers.js');
  const players = await import('../server/systems/players.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  // somewhere with nothing else to Act on (the start can be a hospital's doors)
  const x0 = p.ped.x, y0 = p.ped.y, far = (x, y) => Math.min(...w.map.pois.map((q) => Math.hypot(q.x - x, q.y - y)));
  let best = null;
  for (let dy = -1600; dy <= 1600; dy += 400) for (let dx = -1600; dx <= 1600; dx += 400) {
    const x = x0 + dx, y = y0 + dy;
    if (w.map.isWater(x, y) || (best && far(x, y) <= best.d)) continue;
    teleport(w, p.ped, x, y);
    if (!players.findInteraction(w, p)) best = { x, y, d: far(x, y) };
  }
  teleport(w, p.ped, best.x, best.y);
  assert.equal(players.findInteraction(w, p), null, 'a quiet spot');
  const near = (model, o = {}) => Object.assign(w.spawnVehicle(model, p.ped.x + 30, p.ped.y, 0, { npcOwned: true }), o);
  const car = near('sedan');
  run(w, 0.5);
  assert.match(p.prompt, /Steal the Sedan - Vehicle theft/);
  assert.equal(players.buildMe(w, p).pcr, 1, 'a crime: the key red');
  w.remove(car);
  const cop = near('police');
  run(w, 0.5);
  assert.match(p.prompt, /\(felony\)/);
  assert.equal(players.buildMe(w, p).pcr, 2, 'a felony: the key red and ringed');
  Object.assign(cop, { owner: p.pid, npcOwned: false });
  run(w, 0.5);
  assert.equal(players.buildMe(w, p).pcr, 0, 'your own car: no crime');
});
