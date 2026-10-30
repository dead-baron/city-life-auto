- **Calm water on the sea and the lakes - no more "rapid lines"** (the owner, 10-26, on a beach: "There are still rapid
  lines on large bodies of water"). The short white streaks in diagonal rows over the whole sea were the light pass's
  sun glints (client/art2/game/lightgame.js waterSurf), not the bake: still water's surface was three swells - sums of
  sines along the wind at fixed angles - and the sun caught their crests where they lined up, a lattice of white dashes
  marching across the bay. The 10-23 fix bent the swells with a slow noise, but over a phone's view the rows stayed
  rows, and through the middle of the day (the sun in the south, its glint nearly straight up) a good part of the sea
  lit up in them. Now the wind's ripples are two octaves of value noise (wnoiseD: the noise and its slope) stretched
  across the wind and drifting down it - nothing periodic - and the sun catches the odd steep ripple, one pixel in four
  of those, in patches: a sparkle here and there that twinkles, never in rows. The same ripples on lakes and ponds
  (their twinkling as before); running water (creeks, rivers, rapids) keeps its flecks hurrying downstream, the broad
  rivers and mouths the still look (WIDE_STILL, MOUTH_UP) as before. Test: test/calmwater.test.js - the shader's still
  water says what the test's mirror of it does, has no sines along fixed directions, and the mirror's glints over open
  sea (three suns, three winds) never repeat in rows (under 12 % of them at their best offset; the old swells: 16-68 %)
  and stay a sparkle, not a sheet.
- **The surf's waves aren't a ruler-straight band** (the same beach: "a long straight horizontal band of white foam" a
  little offshore - a wave coming in to a surf break, batch 6). Near the beach the crest the server rides straightens
  out (shared/surf.js crestD) and its dark face and white lip were drawn evenly all along it. Now (client/art2/game/
  surfart.js) the crest as drawn wanders a few px more in shorter bends - more as it comes in, never 8 px off the line
  you ride (jit) - the face and the lip are stronger where the crest stands high and weaker where it's low, and the
  white pieces churn: the lip, the curl, the white water, its lace and the spray change their look a few times a second,
  each piece out of step with its neighbours. Test: test/surf.test.js "a wave drawn near the beach".
