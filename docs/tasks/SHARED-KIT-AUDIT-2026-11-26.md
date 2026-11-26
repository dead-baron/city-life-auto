# Part B, step 1 - the shared kit: what is built, what is not (2026-11-26)

For `docs/tasks/ART-PASS-PLAN-2026-11-24.md` B1 ("to confirm against the DEVLOG before building"). Read-only: made by
searching the code, the tests and the DEVLOG, overnight on 11-26 while the whole suite ran. **Nothing was built or
counted in a baked world for this list.** Where a row says "not measured", the code is there and its result in the
world has not been set against the concept audit's own test (claude/concept-audit-2026-11-03.md) in this chat.

## Built (the plan listed some of these as open)
| Item (audit gap) | Where | When |
|---|---|---|
| Sign faces by trade, legible at the art pixel; a trade's icon in its own tile; colours by trade (gap 1) | `client/art2/signfont.js`, `statics.js` `TRADES` | Wave A1, 11-03 |
| The store badge off the sign; the medical emblem (gap 3) | DEVLOG "Waves A2 and D" | 11-04 |
| Shop interiors denser; the bank's inside (gaps 6, 7 inside, 11) | `shared/shoprooms.js`, Wave D | 11-04 |
| **Banks outside** (gap 7): a stone front, a portico of four columns, the bank's own name cut in it or BANK with a plaque | `statics.js` ~1378-1389 (`spec.portico`) | after 11-03 |
| One name sign a front; a sign names what is behind it; nothing over a sign or a door | DEVLOG 11-12, 11-16, 11-22, 11-23 | |
| Hospital canopies over the doors; helipads on open ground | DEVLOG 10-23, 11-22 | |
| No oversized empty plazas (the class) | DEVLOG 11-22 | |
| ATMs as a pop-up; ATMs set in the walls | DEVLOG 10-22, 11-14 | |
| CINEMA only over the building with screens; a compact cinema | this pass, 11-25 | |

## There, not measured against the audit
| Item (audit gap) | What exists | What the audit asked |
|---|---|---|
| **Roofs** (gap 5; the audit's #3) | A roof kit by building kind (`statics.js` ~700-930: hvac and AC rows, skylights, huts, vents, planters, neon on a night row's roof) and deck materials by kind (gravel, membrane, sedum, green, tar, rubber); Midtown's roof gardens (10-17) | No two neighbouring roofs alike; an AC row on under 40% of roofs; water towers on walk-ups, gardens on the rich streets, billboards on avenues. To count on one district shot before any change. |
| **Murals** (MU1-A..G) | `buildings.js` mural kinds (a sunset, a wave, flowers, chevrons, a tiger, a dusk skyline) used by six districts' files (Midtown, the Arts District, the Neon Strip, Northgate, the Pink Mile, Sunset Beach) | MU1's set beside them: which of its pieces are missing, and the districts with none. |
| **Plazas and paving** (gap 15) | Paving kinds in the ground bake (herringbone and others); the empty-plaza rule | The paving patterns of the concepts by district; the 11-23 note "brick plazas too busy". |
| **A-boards** | One in `statics.js`, `facadedress.js` | By trade, per the audit's #2. |
| **Window goods by trade** (the audit's #2) | `buildings.js` draws a window's inside for eleven kinds (arcade, bar, books, cafe, clothes, diner, laundry, liquor, lobby, pawn, records) | The audit's table adds pharmacy, gun shop, hardware, barber, sports, tackle, bakery; a barber pole; LOANS neon. |

## Not built (no trace in the code)
| Item (audit gap) | Note |
|---|---|
| **Picture signs** (gap 4; the audit's #2: BF2's twelve - book, cup, ring, pole, wrench, record, washer, pretzel, burger, neon hand ...) | No `picsigns.js`; no picture-sign code under any name. The icon tile beside a name (Wave A1) is the nearest thing. |
| **Night signs** (gap 14) | Neon exists for the night districts (`neonsigns.js`); nothing that lights an ordinary shop's sign after dark by rule. |
| **Lit rooms in windows** | Nothing. |
| **A taller neighbour fading while you are in a room** (25 places) | Nothing; the fading of buildings round a player outside is live (PR #49). |
| **The phone box**; **ATM booths** (52) and **ATMs under awnings** | Phone-box and ATM props exist; the plan's rows (a booth for the 52, none under an awning) have no rule. |
| **Clinics and hospitals outside** (gap 9; N20's 31 medical places) | The emblem and the canopies are built; the fronts by N20 have not been set beside it in this chat. |
| **The lint's open rows**: `signCovered` 68 (157 until 11-26: the hotels' names up on cloth canopies, cones, moved signs; left: trees 23, lights 9, phone boxes 7, the el's piers 7, forecourts and porches 9, lamps and poles 9, badges 3, one hospital canopy), roof billboards cut off | Held at their counts in `tools/placementlint.mjs`. (`lobbyDoor`: **done 11-26** - 391 fronts by the rule, a pier and a door of its own for each flat over a shop, held at 0: `shared/world3-flatdoors.js`.) |

## Proposed order (for his word; each a class fix with its lint row, one re-bake for the kit)
1. **The lint's open rows** - ~~`lobbyDoor` 161~~ (done 11-26, 0), `signCovered` 157 -> 68 (11-26; what is left is listed above), ~~roof billboards cut off~~ (done 11-26: `roofSignCut` 28 -> 0). They
   are faults a player sees today, already counted, and each ends at zero.
2. **Picture signs and window goods by trade** - the audit's largest gap still open, on screen in every district.
   A new look: BF2 beside two or three variants of one street for his pick first.
3. **Roofs** - count first (AC rows, neighbours alike), then the kit's shares.
4. **Night signs and lit rooms** - one look after dark; variants for his pick.
5. **ATMs, the phone box, the taller neighbour** - small rules.
6. **Clinics and hospitals outside, murals, paving** - with their districts (the craft pass's checklist), not
   world-wide.

Not looked at for this list: any picture. The first step of each item is a shot of what is there.
