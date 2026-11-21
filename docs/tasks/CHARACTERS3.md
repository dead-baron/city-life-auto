# Task: character polish, pass 3 - the rest of the concepts, and the owner's decisions (for Fable)

Passes 1 and 2 are on this branch (`client/art2/peoplepolish.js` behind the `cla.polish` switch; the wardrobe additions
live on merge; notes and sheets in `docs/characters/`, the concept catalogue and gap list in
`docs/characters/CONCEPTS.md`). Same rules as `docs/tasks/CHARACTERS2.md` (this branch only, never push or merge to
`main`, don't push - the owner does; skip stamping on Windows; behind the switch except wardrobe pieces; sprite style;
no baked-art change; budget: the renderer is now allowed 414 KB - stay inside it).

## First: the owner's decisions (11-19, in docs/DECISIONS.md)
1. **Remove the "censored nudity" setting** pass 2 added: nothing on is always drawn with the mosaic, for everyone. Take
   the setting, its code path and its test out cleanly (keep the mosaic, fitted to the new body).
2. **Patrol police wear the light-blue shirt** (with the badge, patch, buckle and belt), not only rookies.
3. **The mouth:** the concepts' small figures have none (gap 10). Make the faces sheet with and without the mouth side by
   side (`docs/characters/pass3/faces-mouth.png`) and leave the mouth **off** behind a one-line constant, noting it.

## Then: the gap list's open rows (`CONCEPTS.md`), in this order, each its own commit
4. **Hair, the rest of gap 7:** the 36 existing styles drawn as the concepts draw hair - an outline with a lit top -
   on the new head, every style, every direction (pass 2 only added six new shapes).
5. **Socks (gap 14):** a socks slot - tube, crew with stripes, knee socks, leg warmers - in the wardrobe and creator.
6. **Small gear (gap 15):** knee and elbow pads, a wallet chain, a tool belt, a harness - as pieces where 2-4 px read.
7. **Body options (gap 16):** a prosthetic arm or leg, vitiligo, body freckles - as creator body options.
8. **Drapes (gap 17):** a hooded cloak, a cape-coat, a sari, a ghillie suit, morning dress with tails - where they read.
9. **Phone poses (gap 13):** texting, a call, a selfie, a texting walk - for NPCs (and the player with the phone out).
10. **Props carried (gap 20):** a camera, a bouquet, a parasol - as carried pieces.
11. **Animation sheets 4, 6, 7** (pass 2 didn't study them frame by frame): study them with the pass on and fix what's
    wrong; and confirm where the **name tag** sits over the taller head (raise it if it overlaps).

## Sheets and notes
`docs/characters/pass3/`: before (pass 2) | after for each item, the hair sheet (all 36+6 styles, 4 directions), the
new pieces on both bases, the fixed animation sheets. Update `NOTES.md` and the gap list's "Pass" column. Stop at
finished items if the budget runs low, and say what's left.
