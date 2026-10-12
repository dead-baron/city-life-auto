// The title screen and the starting look (the owner, 2026-10-11): "Starting fresh and hit join has you choose graphics
// which is kind of confusing. I would just have the graphics settings below the play button in the main menu so you see
// what graphics you're on and you can change if you want there." - "Better button for customize new character or choose
// character or customize this character? Like maybe an option that shows up below the highlighted character that says
// play as or customize this character." The page is a dumb window: these read its markup and code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the title: the graphics you are on sit right under Play, and Join asks nothing about graphics', () => {
  const html = read('index.html'), main = read('client/main.js');
  const title = html.slice(html.indexOf('<div id="title">'), html.indexOf('<div id="settings"'));
  assert.ok(title.includes('id="t-gfx"') && title.includes('<div id="t-gfxseg" role="radiogroup"'), 'a graphics row on the title: U18\'s segmented control');
  assert.match(title, /<button id="play" disabled><i class="t-tri"><\/i>PLAY<\/button>/, 'a big PLAY with the play triangle (U18)');
  const seg = main.slice(main.indexOf('function syncTitleGfx('), main.indexOf('syncTitleGfx();'));
  assert.match(seg, /for \(const k of \['low', 'medium', 'high', 'ultra', 'custom'\]\)/, 'Low, Medium, High, Ultra, Custom');
  assert.match(seg, /<i>✓<\/i>\$\{PRESET_NAMES\[k\]\}\$\{k === d\.recommended \? '<small>recommended<\/small>'/, 'a check on the one you are on, "recommended" under the device\'s pick');
  assert.match(seg, /if \(k === 'custom'\) openOverlay\('settings'\)/, 'Custom: every effect, in Settings');
  assert.ok(title.indexOf('id="t-gfx"') > title.indexOf('id="play"') && title.indexOf('id="t-gfx"') < title.indexOf('id="t-tools"'), 'right under the Play buttons');
  assert.ok(!html.includes('id="gfx-ask"') && !/askGfx\(/.test(main), 'no graphics question at Join');
  const fp = main.slice(main.indexOf('function firstPlay('), main.indexOf('let tutAskGo'));
  assert.match(fp, /if \(!gfxChosen\(\)\) applyPreset\(/, 'a new player keeps the device\'s pick, silently');
  assert.match(main, /function syncGfxPanel\(\) \{\s*syncTitleGfx\(\);/, 'the title row follows the settings');
});

test('the starting look (U18): the looks on stages side by side, "Play as <name>" and "Customize this character" under them, "New character" at the end of the row', () => {
  const cr = read('client/creator.js');
  const page = cr.slice(cr.indexOf("} else if (mode === 'start') {"), cr.indexOf("} else if (mode === 'wheel') {"));
  assert.match(page, /<div class="cc-stages">/, 'a row of stages');
  assert.match(page, /class="cc-stage \$\{i === startPick \? 'on' : ''\}" data-act="start" data-v="\$\{i\}">\$\{th\(s\.look, 'stage'\)\}<span class="cc-plate">/, 'each look on its stage, its name on a plate');
  assert.match(page, /<button class="cc-stage cc-new" data-act="new-char"><b>\+<\/b><span>New character<\/span><\/button><\/div>/, 'New character, the last card in the row');
  assert.match(page, /data-act="play-as"><i class="cc-tri"><\/i>Play as \$\{nm\}/, 'play as them, by name');
  assert.match(page, /data-act="make-yours"><i class="cc-shirt"><\/i>Customize this character/, 'customize them');
  assert.match(cr, /if \(crop === 'stage'\) plinth\(/, 'the stage: the round stone stage of the big preview');
  assert.match(cr, /#creator\.cc-start \.cc-left, #creator\.cc-start \.cc-foot/, 'no separate preview or footer: the row is the picker');
  assert.match(cr, /case 'new-char': .*mode = 'edit'/, 'which opens the creator on a fresh someone');
  assert.ok(!cr.includes('Play as they are') && !cr.includes('>Make it yours<'), 'the old buttons are gone');
});
