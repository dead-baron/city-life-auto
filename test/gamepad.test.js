// The gamepad's fire and weapons (tasks #301, #411). The owner: "on gamepad you will auto fire when you pull the right
// joystick in a direction all the way. Let's disable that by default ... make you manually fire with the right trigger" -
// and "holding right bumper down should load up your full weapon inventory so you can select that way. Same with left
// bumper. But pressing left or right bumper cycles through them", with the plasma blade "the first weapon that comes up,
// if you have it, when you have fists equipped but press left bumper once".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { IN, padFires, createTapHold, WHEEL_HOLD_MS, slotAt, wheelPicker } from '../shared/input.js';
import { WEAPONS, weaponOrder, stepWeapon } from '../shared/items.js';
import { PAD, KB, TOUCH, ACTIONS } from '../shared/controls.js';
import * as combat from '../server/systems/combat.js';
import * as players from '../server/systems/players.js';

const SRC = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('a pad fires with RT; the right stick only aims unless Settings says otherwise; at the wheel RT stays the gas', () => {
  const stick = { rt: 0, r3: false, rx: 1, ry: 0 };   // the aim stick pushed all the way out, nothing else
  assert.equal(padFires(stick, false, false), false, 'on foot: the full stick only aims (the default)');
  assert.equal(padFires({ ...stick, rx: 0.7, ry: -0.7 }, false, false), false, 'whichever way');
  assert.equal(padFires(stick, false, true), true, 'with "right stick full push fires" on, it fires');
  assert.equal(padFires({ ...stick, rx: 0.6 }, false, true), false, 'the option needs the outer ring, not just aiming');
  assert.equal(padFires({ rt: 0.8, rx: 0, ry: 0 }, false, false), true, 'RT fires on foot (and from a passenger seat)');
  assert.equal(padFires({ rt: 0.2, rx: 0, ry: 0 }, false, false), false, 'a light touch on the trigger does not');
  // driving with the triggers: RT is the gas, so it never fires; a drive-by is R3 (click the aim stick)
  assert.equal(padFires({ rt: 1, r3: false, rx: 0, ry: 0 }, true, false), false, 'at the wheel RT is the gas');
  assert.equal(padFires({ rt: 1, r3: false, rx: 1, ry: 0 }, true, false), false, 'aiming a drive-by does not shoot by itself');
  assert.equal(padFires({ rt: 1, r3: true, rx: 1, ry: 0 }, true, false), true, 'R3 shoots it');
  assert.equal(padFires({ rt: 0, r3: false, rx: 1, ry: 0 }, true, true), true, 'the ring option covers drive-bys too');
  // the client: off by default (and switched off once for everyone), the touch fire ring left as it was
  const inp = SRC('client/input.js');
  assert.match(inp, /settings = \{[^}]*padStickFire: false/, 'the stick-ring fire is off by default on a pad');
  assert.match(inp, /settings = \{[^}]*touchEdgeFire: true/, 'touch keeps its fire ring (the FIRE button is the other way)');
  assert.match(inp, /if \(settings\.padFireV !== 2\) \{ settings\.padStickFire = false;/, 'a stick-fire switched on before this build (maybe by accident) starts off');
  assert.match(inp, /padFires\(p, driving, settings\.padStickFire\)/, 'sample() fires a pad through padFires');
  assert.doesNotMatch(inp, /rmag > 0\.9\) bits \|= IN\.FIRE/, 'no stick-ring fire of its own any more');
  assert.match(inp, /my = -\(p\.rt - p\.lt\)/, 'RT is still the gas at the wheel');
  assert.match(inp, /if \(p\.r3Edge && !driving\) bits \|= IN\.RELOAD/, 'R3 reloads on foot, not while it is the drive-by trigger');
  assert.match(SRC('index.html'), /id="s-padfire"/, 'the option is in Settings with the other input options');
});

test('a bumper tapped steps through the weapons; held about 0.3 s it opens the weapon wheel and letting go picks', () => {
  assert.ok(WHEEL_HOLD_MS >= 250 && WHEEL_HOLD_MS <= 350, 'about 0.3 s');
  const B = createTapHold();
  const steps = (seq) => seq.map(([lb, rb, t]) => B.step(lb, rb, t));
  // a quick tap of RB: the next weapon, on letting go
  let r = steps([[0, 1, 0], [0, 1, 100], [0, 0, 150]]);
  assert.deepEqual(r.map((x) => x.tap), [0, 0, 1]);
  assert.ok(r.every((x) => !x.hold && !x.release));
  // LB: the previous one
  r = steps([[1, 0, 1000], [0, 0, 1100]]);
  assert.deepEqual(r.map((x) => x.tap), [0, -1]);
  // held: the wheel opens once, at the threshold; letting go picks - no step as well
  r = steps([[0, 1, 2000], [0, 1, 2000 + WHEEL_HOLD_MS - 50], [0, 1, 2000 + WHEEL_HOLD_MS], [0, 1, 2900], [0, 0, 3000]]);
  assert.deepEqual(r.map((x) => x.hold), [0, 0, 1, 0, 0]);
  assert.equal(B.held, 0, 'let go');
  assert.deepEqual(r.map((x) => x.release), [0, 0, 0, 0, 1]);
  assert.ok(r.every((x) => !x.tap), 'a hold is not a tap');
  // held LB: -1 throughout, and the other bumper is ignored while it's down
  r = steps([[1, 0, 5000], [1, 1, 5100], [1, 1, 5000 + WHEEL_HOLD_MS + 10]]);
  assert.equal(r[2].hold, -1);
  assert.equal(B.held, -1, 'held while it is down');
  r = steps([[0, 1, 5600], [0, 0, 5650]]);
  assert.equal(r[0].release, -1, 'letting go of LB picks (RB still down is ignored)');
  assert.equal(r[1].tap, 0, 'and RB, pressed while LB was down, is no tap');
});

test('the weapon wheel: slot 0 at the top, clockwise; the left stick picks once it has been back to the middle; the pick sticks', () => {
  assert.equal(slotAt(0, -1, 8), 0, 'up');
  assert.equal(slotAt(1, 0, 8), 2, 'right');
  assert.equal(slotAt(0, 1, 8), 4, 'down');
  assert.equal(slotAt(-1, 0, 8), 6, 'left');
  assert.equal(slotAt(-0.2, -1, 8), 0, 'nearly up');
  assert.equal(slotAt(-0.5, -1, 3), 0);
  assert.equal(slotAt(-1, -0.3, 3), 2, 'left of the top with three: the last slot (the plasma blade sits there)');
  // opened while walking: the left stick held out doesn't pick until it has come back to the middle
  let pick = wheelPicker(6, 2);
  assert.equal(pick(1, 0, 0, 0), 2, 'still the weapon in your hands');
  assert.equal(pick(0, 0, 0, 0), 2);
  assert.equal(pick(0, 1, 0, 0), 3, 'now the left stick picks (down of six: slot 3)');
  assert.equal(pick(0, 0, 0, 0), 3, 'and the pick stays when the stick goes back');
  assert.equal(pick(0, 0.2, 0, 0), 3, 'a nudge inside the middle changes nothing');
  // the right stick picks straight away (you may have been aiming when you held the bumper)
  assert.equal(wheelPicker(4, 0)(1, 0, -1, 0), 3, 'the right stick, even with the left one still out');
  // either stick; the one pushed further wins
  pick = wheelPicker(4, 0);
  assert.equal(pick(0, 0, 1, 0), 1, 'the right stick');
  assert.equal(pick(0, 0.6, -1, 0), 3, 'both: the further one (the right, left: slot 3)');
  assert.equal(pick(0, 1, 0.55, 0), 2, 'both: the further one (the left, down: slot 2)');
});

test('the order the bumpers step through: by the table, the plasma blade last - so LB from your fists is the blade', () => {
  const kit = ['heavyflash', 'pistol', 'fists', 'plasma', 'katana', 'not-a-weapon'];
  assert.deepEqual(weaponOrder(kit), ['fists', 'pistol', 'katana', 'heavyflash', 'plasma']);
  assert.equal(stepWeapon(kit, 'fists', -1), 'plasma', 'LB from fists: straight to the plasma blade (even with the heavy flashlight, index 31)');
  assert.equal(stepWeapon(kit, 'fists', 1), 'pistol', 'RB from fists: the next by the table');
  assert.equal(stepWeapon(kit, 'plasma', 1), 'fists', 'and on round');
  assert.equal(stepWeapon(kit, 'plasma', -1), 'heavyflash', 'every weapon is still reached both ways');
  assert.equal(stepWeapon(['fists', 'pistol', 'bat'], 'fists', -1), 'pistol', 'no blade: LB from fists goes round to the last');
  assert.equal(stepWeapon(['fists'], 'fists', -1), 'fists');
  assert.equal(stepWeapon([], 'fists', 1), null);
  assert.equal(stepWeapon(kit, 'shotgun', 1), 'fists', 'from something not carried: the first');
});

test('the server: a tap of LB (PREVW) from fists takes out the plasma blade; RB (NEXTW) steps on', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  Object.assign(p.profile.weapons, { pistol: 24, plasma: 0, heavyflash: 0 });
  assert.equal(p.ped.weapon, 'fists');
  const send = (bits) => { players.queueInput(p, { seq: p.ack + 1, bits, mx: 0, my: 0, aim: 0 }); run(w, 0.05); players.queueInput(p, { seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 }); run(w, 0.05); };
  send(IN.PREVW);
  assert.equal(p.ped.weapon, 'plasma', 'LB from fists: the blade');
  send(IN.NEXTW);
  assert.equal(p.ped.weapon, 'fists', 'RB from the blade: round to the fists');
  send(IN.NEXTW);
  assert.equal(p.ped.weapon, 'pistol');
  combat.cycleWeapon(w, p.ped, -1);
  assert.equal(p.ped.weapon, 'fists');
  // without the blade, LB from fists goes round to the last weapon as it always did
  delete p.profile.weapons.plasma;
  combat.cycleWeapon(w, p.ped, -1);
  assert.equal(p.ped.weapon, 'heavyflash');
  assert.ok(WEAPONS.plasma.i < WEAPONS.heavyflash.i, '(the rule matters: by index alone the flashlight would come first)');
});

test('the controls tables say how: RT fires, R3 drive-bys, RB / LB tap or hold - for every device', () => {
  assert.equal(PAD.fire[0], 'RT');
  assert.equal(PAD.nextw[0], 'RB');
  assert.equal(PAD.prevw[0], 'LB');
  assert.match(PAD.wpnwheel[0], /HOLD/);
  assert.equal(PAD.drivefire[0], 'R3');
  for (const a of ['prevw', 'wpnwheel', 'drivefire']) assert.ok(ACTIONS.includes(a) && KB[a] && TOUCH[a] && PAD[a], `${a} on every device`);
  const readme = SRC('README.md');
  assert.match(readme, /\| Weapons \|[^\n]*tap RB \/ LB[^\n]*hold either[^\n]*weapon wheel/i, 'the README controls table: the bumpers');
  assert.match(readme, /\| Drive-by \|[^\n]*R3/, 'the README controls table: the drive-by');
});
