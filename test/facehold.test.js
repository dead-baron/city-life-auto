// A face's features hold their place over a cycle (the art pass, 2026-11-25; the owner, 11-23: painted lips "in the
// run cycle ... jump about the face"; 11-25 12:45: a look only - "be careful not to try to over fix"). Measured that
// day on a figure with lipstick facing the camera: over one walk the mouth sat a pixel left or right of the eyes'
// middle and two or three rows under them from frame to frame - the eyes and the mouth were each rounded to the
// pixel grid on their own. With both eyes showing the mouth now goes by the eyes (client/art2/people.js face()).
// The fix is isolated (his rule of 11-20): of the twelve starting looks' 2,688 frames, 55 changed - all the one
// figure's with painted lips (tools: a diff against the commit before).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { person, setPolish, POSES } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import * as LK from '../shared/look.js';

const probe = (A, dir, pose, f) => { const g = person(A, dir, pose, f, { tight: true, info: 1 }); return g.info && g.info.face; };

test('painted lips sit under the middle of the eyes, the same rows down, in every frame of a walk', () => {
  setPolish(POLISH);
  try {
    const L = structuredClone(LK.STARTERS.find((s) => s.name === 'The Club-goer').look);
    let seen = 0;
    for (const lips of [0, 2, 3, 4]) {
      L.face.lips = lips; const A = LK.lookArt(LK.validLook(structuredClone(L)));
      assert.ok(A.makeup && A.makeup.kind === 'lipstick', 'a figure with lipstick');
      for (const pose of ['walk0', 'walk1', 'walk2', 'walk3']) for (let dir = 0; dir < 8; dir++) {
        const gaps = new Set();
        for (let f = 0; f < POSES[pose]; f++) {
          const F = probe(A, dir, pose, f);
          if (!F || F.eyes.length !== 2) continue;
          seen++;
          const mid = (F.eyes[0][0] + F.eyes[1][0]) / 2, off = F.mouth[0] - mid;
          assert.ok(off === 0 || off === 0.5, `${pose} facing ${dir}, frame ${f}: the lips' right pixel at the eyes' middle (off by ${off})`);
          assert.equal(F.eyes[0][1], F.eyes[1][1], 'both eyes on one row');
          gaps.add(F.mouth[1] - F.eyes[0][1]);
        }
        assert.ok(gaps.size <= 1, `${pose} facing ${dir}: the mouth the same rows under the eyes all through (${[...gaps]})`);
        for (const g of gaps) assert.ok(g === 2 || g === 3, `two or three rows under the eyes (${g})`);
      }
    }
    assert.ok(seen >= 200, `frames with both eyes and a mouth looked at (${seen})`);
  } finally { setPolish(null); }
});

test('a face with no painted lips draws no mouth in the game (the small faces have none - DECISIONS 11-19): untouched', () => {
  setPolish(POLISH);
  try {
    const A = LK.lookArt(LK.validLook(structuredClone(LK.STARTERS.find((s) => s.name === 'The Barista').look)));
    assert.ok(!A.makeup, 'no make-up');
    assert.equal(POLISH.mouthOn, false);
  } finally { setPolish(null); }
});
