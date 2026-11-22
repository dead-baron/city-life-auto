# Music and instruments: handover (2026-11-22)

Written at the end of the Fable art chat, with almost no usage left. Nothing here is built. Nothing was listened to:
Claude cannot hear audio. It can measure a recording with code (length, loudness, tempo, where the beats fall, whether
the ending is cut off), which is what loops and note charts need. Whether a song fits the game is the owner's ear.

## What the owner brought (11-22 02:48)
- **A soundtrack kit**, on his computer: `Desktop\City Life Auto\_audio\_DONE\City Life Auto Music and Instruments`
  (it holds a folder `CLA-Soundtrack-Claude-Handoff`). The folder is not connected to a chat yet: ask him for access
  to it first. Its own starting files, by the brief: `START-HERE.md`, `Selections.md`, `Selection-Manifest.json`.
  - 25 core songs, one primary take each, chosen by him; the other takes are backups for their cue.
  - 20 backup recordings under 12 optional cues, with no primary: kept, not placed.
- **An instrument kit**: `CLA-Instrument-Claude-Handoff.zip` (seven guitar recordings, starter charts, its own brief)
  and `_Instrument Set.zip` (bucket drum, keytar, saxophone, violin, cardboard mat - for later).
- **ChatGPT's implementation brief**, saved beside this file as `MUSIC-BRIEF-CHATGPT.md`. It is advice from another
  tool that knows the game's background, not an instruction. The owner: "it doesn't have to be how chatgpt is
  suggesting ... it would be good to hear what you think".

## What is already decided (docs/DECISIONS.md, Music and sound)
- The owner makes the music; **played as recordings, not rebuilt in the engine** (11-12).
- **The engine plays only instruments the player plays** (11-12).
- No soundtrack over play: music lives in the world (venues, shops, radios); the main menu has the title track.
- The hospital lobby plays "Visiting Hours" as if from ceiling speakers (11-17).

ChatGPT's brief says the opposite of the first line (rebuild every song in the engine, ship no recordings). The 11-12
decision stands until the owner changes it.

## Claude's advice (the owner has not answered yet)
1. **Play the recordings. Don't rebuild them.** He chose each take by ear; the performance is what he chose.
   Rebuilding 25 songs note by note in the engine's synth, from recordings Claude cannot hear, would cost a great deal
   of usage and would not sound like the takes he picked. The brief itself admits the scores are not a true
   transcription.
2. **Do the "world" part in the engine.** Thin ceiling speaker, car radio, club wall, distance: filters and echo over
   the recording at play time. One recording serves every speaker; nothing is baked into the file.
3. **Loops matter less than they look.** A radio station is a playlist: a song plays to its end and the next one
   starts, so it needs a clean ending, not a loop. Only a place with one bed of music (a lobby, a shop) needs a loop,
   and there the loop is a whole stretch of bars found by measuring the beats, played from a decoded buffer so the
   join is exact. A take cut off at the generator's length limit gets an ending at the last full phrase.
4. **Size and phones.** Ship compressed files in a format every browser plays, fetched when a player comes near a
   speaker or tunes a station, never at start-up (none of it counts in the page's budgets). Long songs are streamed,
   not decoded whole: a decoded three-minute song is tens of MB of memory on a phone. Only short loops are decoded.
5. **Keep the brief's rotation rules;** they are sound: pick the song first and then its version, so a song with
   nine backups is not nine times as common; about 70% primary, 30% the backups together; pick a version when a track
   starts, not on every loop; don't restart a song on walking into another speaker's range; C05 is the same recording
   as C03; B17 and C07 share a score, so not back to back.
6. **Rhythm games (the gigs).** Enough is here to build one pilot. One list of timed notes drives both the falling
   notes and the sound. The song's recording is the backing; the chart's grid comes from the measured beats, never
   from the tempo typed into a prompt; the player's own part is played by the engine (a short sampled or synthesized
   guitar), sounding on a hit and silent on a miss. To settle: the lead is already inside a mixed recording, so a
   gig needs either a take without the lead, or the player's part laid over the full song.
7. **Check the license** of the model the songs were generated with for commercial use before any recording ships.
   Claude is not a lawyer; this is one thing to look up, not a finding.

## Questions for the owner
- Recordings (his decision of 11-12, Claude's advice) or rebuilt in the engine (ChatGPT's brief)?
- For the gigs: can he make a version of a song without its lead instrument, or should the player play over it?
- Which places and stations get which of the 25? (`Selections.md` may already say.)

## First steps for whoever picks this up
1. Ask for the folder; read its three starting files and the instrument kit's brief.
2. Measure every primary with one script and write a table: length, loudness, measured tempo, beat one, cut-off
   ending or not. No listening needed, and it settles the loop question with numbers.
3. Three pilots in the running game, for his ears: "Visiting Hours" (T29) in the hospital, "Sunburnt Tape" (T03) on a
   car radio, "Neon Current" (T22) in a club. Then the rest.
4. The guitar gig on one song.

## From his pre-beta notes of 11-22 that touch this
- The instrument game's look is poor (blurred arrows with shadows); it should read like an SNES rhythm game.
- Its songs are random beats; he wants to play along to real songs.
- Using an instrument from the bag leaves the bag open, so the player can't see the character play.
