# Pending DEVLOG entries (branch fix-b1b, the owner's notes of 10-22)

## Blows from the guard; a guarded walk
The owner: holding the right mouse button to block, a left click did nothing; walking in the guard (fists, a sword...)
there was no walk - the character floated along in the guard pose.
- A punch or a swing thrown with the guard held now goes (server/systems/players.js): the guard drops for the blow
  (rules.js `GUARD.strikeS`, 0.3 s - a 'guard' t:0 event so everyone sees the blow, not the guard) and comes straight
  back up while the button is held; held down with the attack button too, a blow each time the weapon is ready and the
  guard up in between. NPCs still don't strike from their guard; only the plasma blade deflects bullets and arrows.
- Touch: the fire button with the aim stick held short of firing keeps the guard bit (client/input.js), so it works
  the same there; a pad already sent RT and LT together.
- The page shows the blow over the guard (main.js pedPose), and moving in the guard is a pose of its own, `guardw`
  (client/art2/dances.js): the walk's stride on bent knees with the guard's arms, lean and head - six frames on the
  stride's phase (peds.js pedFrame, main.js pedLook). The classic view draws it as the aim, like the guard.
- Tests: test/blocking.test.js (a blow from the guard and the guard back after it; held: blows with the guard up in
  between; `guardw` strides and is its own pose).
