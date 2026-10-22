// Notes too long for their box shown a page at a time (the owner, 10-16: "Garden plot instructions cut off in the
// popup", "Text cut off in UI containers (garden instructions)"): a phone shows a note three lines at most, and a
// longer one used to lose the rest under an ellipsis. client/notepages.js scrolls it on three lines at a time and keeps
// it up until its last page has been read. Measured for real in a headless Chromium with the game's stylesheet
// (test/hudpage.js), with the server's own longest instructions - the garden plot's, the skateboard's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findChrome, measureAll, problems } from './hudpage.js';
import { NOTE_READ, noteLife, pageTimes } from '../client/notepages.js';

// a note's words as the server says them (the first string starting with `head` in the file)
function said(file, head) {
  const src = readFileSync(new URL(`../server/systems/${file}`, import.meta.url), 'utf8');
  const m = new RegExp(`'(${head}(?:[^'\\\\]|\\\\.)*)'`).exec(src);
  assert.ok(m, `${file}: a note starting "${head}"`);
  return m[1].replace(/\\'/g, '\'');
}

test('a paged note stays up long enough to read every page; a note that fits, as long as before', () => {
  assert.equal(noteLife(20), NOTE_READ.base + 20 * NOTE_READ.perChar);
  assert.equal(noteLife(400), NOTE_READ.most);
  const { each, life } = pageTimes(300, 4);
  assert.equal(life, each * 4);
  assert.ok(each >= NOTE_READ.page + 75 * NOTE_READ.perChar - 1, 'each page: its share of the words read');
  assert.ok(life > noteLife(300), 'longer than a note that fits could ever stay');
});

test('the garden plot\'s and the skateboard\'s instructions: every word shown on a phone, a page at a time', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const notes = [said('gardening.js', 'Seeds: '), said('skate.js', 'On your board'), said('skate.js', 'Tricks: ')];
  assert.ok(notes.every((n) => n.length > 120), 'long instructions');
  const list = [[844, 390, 'touch'], [740, 360, 'touch'], [390, 844, 'touch'], [1280, 720, 'kbm']].map(([w, h, dev]) => ({ w, h, dev, st: 'foot', notes }));
  const all = await measureAll(list);
  assert.equal(all.length, list.length);
  for (const r of all) {
    const tag = `${r.sc.w}x${r.sc.h} ${r.sc.dev}`, seen = r.read.filter((b) => b.name.startsWith('note'));
    assert.ok(seen.length >= 1, `${tag}: a note on the screen`);
    for (const b of seen) {
      assert.ok(!b.lost, `${tag}: ${b.name} shows all its words`);
      if (r.sc.dev === 'touch') {
        assert.ok(b.lines <= 3, `${tag}: ${b.name} three lines at a time (${b.lines})`);
        if (b.pages > 1) assert.ok(b.life >= b.pages * NOTE_READ.page, `${tag}: ${b.name} up for every page`);
      } else assert.equal(b.pages, 1, `${tag}: ${b.name} whole on a desktop`);
    }
    if (r.sc.dev === 'touch') assert.ok(seen.some((b) => b.pages >= 2), `${tag}: the long ones paged (${seen.map((b) => b.pages)})`);
    const cut = problems(r).filter((s) => /cut off/.test(s));
    assert.deepEqual(cut, [], cut.join('\n'));
  }
});
