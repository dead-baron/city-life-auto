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
  assert.ok(title.includes('id="t-gfx"') && title.includes('<select id="t-gfxsel">'), 'a graphics row with a preset select on the title');
  assert.ok(title.indexOf('id="t-gfx"') > title.indexOf('id="play"') && title.indexOf('id="t-gfx"') < title.indexOf('id="t-tools"'), 'right under the Play buttons');
  assert.ok(!html.includes('id="gfx-ask"') && !/askGfx\(/.test(main), 'no graphics question at Join');
  const fp = main.slice(main.indexOf('function firstPlay('), main.indexOf('let tutAskGo'));
  assert.match(fp, /if \(!gfxChosen\(\)\) applyPreset\(/, 'a new player keeps the device\'s pick, silently');
  assert.match(main, /function syncGfxPanel\(\) \{\s*syncTitleGfx\(\);/, 'the title row follows the settings');
});

test('the starting look: "Play as <name>" and "Customize this character" under the pick, and "New character"', () => {
  const cr = read('client/creator.js');
  assert.ok(cr.includes('<div class="cc-under"></div>'), 'a place under the picked character');
  const under = cr.slice(cr.indexOf("const un = root.querySelector('.cc-under')"), cr.indexOf('if (un && un.dataset.h'));
  assert.match(under, /data-act="play-as">▶ Play as \$\{/, 'play as them, by name');
  assert.match(under, /data-act="make-yours">✎ Customize this character/, 'customize them');
  assert.match(cr, /if \(mode === 'start'\) h = `<button class="cc-btn" data-act="new-char">/, 'a clear New character in the footer');
  assert.match(cr, /case 'new-char': .*mode = 'edit'/, 'which opens the creator on a fresh someone');
  assert.ok(!cr.includes('Play as they are') && !cr.includes('>Make it yours<'), 'the old buttons are gone');
});
