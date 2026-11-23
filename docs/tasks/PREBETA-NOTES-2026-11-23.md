# The owner's pre-beta notes of 2026-11-23 (47-page PDF, mostly cinematic-mode shots) - triage

Sorted into when each is done. Rule kept: every fix is a class fix with a lint row or test over the whole world.

## 1. Pre-beta fixes now (mechanics, bugs, performance) - before the Fable art pass
| # | Note | Plan |
|---|---|---|
| P1 | Art loads, then disappears in the same chunk (dense forests and more), even with the server's art fully baked | The page dropping or replacing chunks it still shows (eviction cap / a re-bake swap). Find with a chunk-life log; test that a chunk on screen is never dropped. **First.** |
| P2 | Slow loading on a Pixel 7 Pro and in the airplane scene on desktop, though the server's art is done | Measure fetch, decode and upload per chunk on a throttled phone profile; prefetch along the direction of travel (faster at speed). |
| P3 | Long or huge shadows: fish, boats, cars on a bridge, umbrellas, the pier, a pole, the seaplane's wings | One class: things over water or on a deck casting from the wrong height (the shadow pass reads the ground below). |
| P4 | The water surface glitching: fast straight streaks | The water pass's wave or caustic term. Find it and fix it. |
| P5 | Buildings covering streets, sidewalks and alleys - again | A world rule: a building's drawn height capped by what's in front of it (b.low, extended), unless there's a reason (a tower downtown). Lint row: street area hidden per block. Its own world batch + re-bake. |
| P6 | Fences cars drive through (chain-link at the courts and more) | A class audit: every fence or barrier prop either blocks or breaks. Lint row. |
| P7 | NPCs stuck on fences, in corners, between a lamp and a fence (skate park); one inside the pool table | Prop collision for NPC walks (pool table, lamps); a stuck NPC steps back and re-routes. Test. |
| P8 | NPC drivers: police taking you in, racers, taxis, the cinematics' cars - crash, ride the median, get stuck | A driving pass: lane keeping and medians, overtaking, unsticking, re-routing. Police transport first. Bigger. |
| P9 | The blue-dress NPC's head flickers between skin and hat as she walks | A hat/hair depth fight in the people renderer: test every hat on every walk frame. |
| P10 | The hoop arrow over the hoop | The marker above the hoop, fading after a moment. |
| P11 | Water creeping up the pier where the dock meets the sand; the market hall's door behind a planter | Check against today's world batch (deckRoots, door paths); fix whatever's left. |
| P12 | The train in the cinematic doesn't leave after "next train boarding" | Check the scene vs the real schedule. |

## 2. Cinematics - cheap now, the rest after the art pass
Cheap now (the infrastructure, so every scene benefits):
- C1 A clean start: a longer black, the X and the caption gone before the scene shows (OBS-ready).
- C2 The world at the scene, not round you: your character moved there invisibly, a wait until the chunks and the
  people round it are in, then it starts (fixes the empty scenes and the blur); your own sounds muted meanwhile.
- C3 The review reel: Keep / Cut / Note a bug on each unreviewed shot, kept and exportable.
- C4 More variants of the scenes that already work: street races and police chases in more places and times of day,
  gang fights, shopping carts.
After the Fable art pass (scenes reshot on the final art):
- Choreography: the bar fight (bikers in frame, headlights on), the friends' groups, the crop duster (follow it, then a
  wide still), trains (arrive, passengers off and on, leave), the police chase with the helicopter (longer, in the open).
- New behaviour scenes: wildlife (hunts, salmon run, birds), NPC pool games, NPCs on skateboards, an NPC balloon ride.
  Wildlife comes first because the behaviour exists.

## 3. The Fable 5.2 art pass (after section 1)
Neon City's weak block (the lone face sign); sidewalk tiles that don't join; the café's half neon sign; sunflowers cut at
the top; the station's "next train" as a sign in the world, and the platform's checker floor cut at both ends; the salmon
leaping (tail, splash); birds flying through rock art; shells scattered too thickly on the beaches; hammocks too long;
the sea cave's square rocks and the sea stacks in a line; the lake a perfect oval; waves forming out of a straight hard
edge; underwater details with a hard edge near shore; the off-road trail (a blended start, a real trail); the big brick
plazas too busy (that brick for small areas); the dark outlines on some trees and plants; the farm (the flower row,
hand-crafted fields); koi drawn over the water (a layering fix - may land in section 1); mouths (a check that a face's
features hold their place in every frame of every cycle, then a softer, thinner line or none - NPCs lose theirs today,
players keep them).

## 4. After the beta (new features)
Bank and store robberies (hands up, comply or fight, Samaritan points); rare streakers (and one at a sports match,
security chasing); sports betting while games are on; real basketball (play or watch NPCs); lying in a hammock.

## The earlier audits (11-22 PDF)
Run 11-22: docs/audit/BALANCE-2026-11-22.md A1-A7. Proposals 1 (pay - after the first test weekend's money data), 3 (one
"other road" lead a day), 4 (a death-screen line: bank your cash) wait for the owner; 2 is done.
