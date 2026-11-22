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

## The owner's direction for music in the world (11-22 03:07)
His words, shortened: music "living in the world", "synced across all players so you're hearing the same music at the
same time in the same places in a proximity kind of way"; it does not always start at the beginning; not every place
has music, or has it all the time; not the same song every time you walk in; the hospital lobby always plays; each
source sounds like what it comes from (thin ceiling speakers in the hospital, good speakers in a night club); a loud
interior is heard muffled from the street, louder toward the door, full inside, and the reverse on leaving. Sources he
named: speakers, the street, radios (cars, the garden and farm radio), lobbies, stores, casino, bar, night club,
dancing, street and NPC musicians, arcades, the music minigames. And: where a song has no clean ending, analyze it and
make a loop or an ending.

How to build that (Claude's plan, nothing built):
- **One music clock, owned by the server.** What a source is playing - which song, which version, when it started,
  when it is silent - is a pure function of server time and the source's seed, kept in `shared/` (deterministic: no
  `Math.random`, numbers in `shared/rules.js`). The server sends no audio and no per-tick music messages; the page
  already knows server time, works out the song and how far in it is, and starts the file at that point. Everyone at
  the same speaker hears the same bar; every car tuned to a station is in step; walking in mid-song is the normal case.
- **A source's schedule** has gaps (no music now), a rotation that avoids repeats (the brief's rules), and fixed cases
  (the hospital: always on, one bed).
- **Starting mid-song** needs the files to be fetched from a given time. To check: that the host serving them allows
  partial requests.
- **The sound of the source** is a chain per kind of speaker (filter, echo, a little grit for a cheap radio; none for
  a club's system), applied in the page.
- **Inside and outside:** volume and a low-pass filter set by the listener's distance to the nearest door and whether
  he is inside. To check first: how the page knows a player is inside a building.
- **Phones:** only the nearest one or two sources sound at once; players are pooled, not made and thrown away.
- **Endings and loops by measuring:** find the beats and the phrases; a cut-off take ends at its last whole phrase
  with a short tail; on a radio the next song comes in over that tail, as a station does; a bed loops over whole bars.
- **Musicians and gigs** play notes through the engine on the same clock, so two players watch the same busker play
  the same bar.

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

## 11-22 morning: loops and endings measured (the owner: "I don't think they end right on some of them or loop right")
- Folder access granted: `Desktop\City Life Auto\_audio\_DONE`. The 25 primaries' `MASTER.flac` and `SCORE.txt` read.
- The owner on rebuild vs recordings: unsure; asked for the songs to be "looked at and edited" like the title track.
  Done that way: the recordings are cut and joined, not rebuilt (the 11-12 decision stands).
- `tools/music/analyze.py` (numpy/scipy, no beat library - installs are blocked here): beats by dynamic programming,
  the score's written tempo (`Q:`) only to pick between the recording's own tempo readings; downbeats by kick + chord
  change; a loop of 8-32 bars, 20-75 s, on a phrase line, whose next bar sounds like its first and whose last bar like
  the one before its start; the title's seam method (aligned to the sample, 90 ms blend). Checked on the title loop:
  92.57 BPM against 92.7, 16 bars. All 25 measured tempos within 1-3 BPM of the written ones.
- Endings: a take ending quietly (last 0.5 s under -30 dB, or 20 dB under the body) keeps its own (7 songs); the other
  18 end on the downbeat after their last full 4-bar phrase, that beat ringing, faded over two beats.
- Results: `docs/audio/loops-2026-11-22/*.json`. Seams: none sharper than 0.31 of the music's own sharpest sample
  steps (no clicks by measure). Flagged for the ear: A12 Grease Fire (+12 dB at the join), T05 Waiting Room Disco
  (-15 dB), T03 Sunburnt Tape (-8 dB); A09 First Sprouts and A16 Jester's Parade the weakest matches.
- The owner's review page: `...\City Life Auto Music and Instruments\Claude-Loop-Review\index.html` on his computer
  (each loop three times, each ending; "sounds right / redo" and a Copy my notes button). Nothing in the game yet:
  after his notes, the approved ones go through `make-loop.py` (loops) and an ending cut into `assets/music/`.
