## 2026-10-25 - Batch 7c: music in the world - boomboxes, radios, the car radio, the mat and the rhythm game, instruments and busking

From the owner's notes, part 2:
> Item - Radio/Boombox, can play it out loud for people to hear in game. They can be shot and destroyed too and the music
> will glitch out or wind down. Music can be purchased at record store and you can buy tape casettes for your Boombox or
> you can play a radio station on either radio or Boombox

> Breakdancing - can out down a cardboard mat and dance or breakdance or do street performances, they will gather NPCs,
> if you're really good then it will gather a good sized crowd thats really into it, if you aren't good npcs will walk off
> unamused, sometimes they will boo. There's freestyle dancing they your character can do while idling or you can play a
> dance dance revolution or guitar hero type mini game to see how well you perform.

> Play instruments? Be able to do live music? Have instruments as items you can get and play them out loud for people in
> the area to hear?

On the music itself he said (2026-10-24): "Let's do some simple music for now for the Boombox, or recycle something we already have for now.
I will be working on music later." So everything plays the songs we already have, and there's a clean place for his own
tracks to drop in.

**The songs** (tools/music/songbook.mjs, new):
- The owner's song scores (tools/music/songs/*.js: Smash and Grab, Kickflip, Sunburnt Tape, Grease Fire, the sixteen of
  them) and the live synth's own loops (client/sound/music.js: the club's beat, the shop's bossa, the lobby, the
  drive-in) are compiled for the synth the game already has: each song becomes client/sound/songbook/<id>.json, its parts
  as notes in milliseconds (the swing and Rescue Run's tempo change worked in), each part on one of the live synth's
  voices (lead, bass, brass, reed, keys, bells, pad, organ, pluck, flute, voco, the kit). 0.4-15 KB a song gzipped,
  fetched the first time a song is wanted. shared/music-songs.js, made with them, has each song's length, beats, tempo
  map and key, which the server and the screens time things by. Run the tool again when a song changes;
  test/music.test.js checks the checked-in songbook matches the scores.
- **The track list** (shared/music.js `TRACKS`): every song by id, with a title, a band, a genre, whether it's sold on
  tape, and two empty fields for the owner: `file` ({ opus, mp3 } under assets/music, as tools/music/make-loop.py makes
  them) and `secs`. Give a track its file and the game plays the recording in its place everywhere - tapes, stations,
  the mat (client/sound/stage.js `playFile`; a wrecked boombox winds a recording down by its playback rate).

**The boombox and the pocket radio** (server/systems/music.js, new; client/music/stage.js, client/sound/stage.js):
- Bought at a record shop's counter. Taken out of the bag (Use, or the quick wheel) it plays out loud, carried - the
  boombox on the shoulder, the radio on the hip - and its menu opens: a tape you own, one of the stations, off, set it
  down here, put it away. The action button by one you set down opens the same menu.
- Everyone near hears the same song at the same moment. What's on the wire is the song and when it started (a tape) or
  which station: the stations run on the world's clock (`stationAt`), so nobody has to be kept in step. The page plays
  the nearest two sources, full up close and falling off with distance (`MUSIC_HEAR`: a boombox 560 px, the radio 300).
- **Five stations**, from what the owner's song briefs said each song was for: The Haze 94.5 (Sunburnt Tape, Sugar
  Haze, Waiting Room Disco, Clockwork Kitty), Heist FM 101.1 (Smash and Grab, Badge and Brass, Getaway Job, Jester's
  Parade), Grease 88.3 (Grease Fire, Double Scoop), Skate Radio 106.6 (Kickflip, Rescue Run, Wide Awake City), Garden
  Country 90.7 (First Sprouts, Tomatoes in the Morning, Porch Light).
- **Tapes**: one of each of the sixteen scores and three of the synth's loops, $12 each at the record shops.
- **Shot, it's wrecked.** One set down takes bullets (hp 24; a radio 10), punches and blasts. Wrecked, its music
  stutters and crackles and winds down over 2.4 s like a tape running out of battery (pitch and tempo sliding, the
  sound closing in), pieces fly, glass and a clang, and the wreck lies there two and a half minutes. It's gone from the
  owner's bag, and they're told who did it.
- Left 900 px behind for two minutes, or its owner gone, it's packed back into their bag.

**The car radio** (the tracker's "Car radio stations"): the dance button in a car (G) flicks through the stations and
off; the phone has a new Radio app for any device (the stations and what each is playing now; on foot it tunes your
radio or boombox). The people in the car hear it clearly, everyone outside muffled through the body. It goes off a
while after the car's left empty, or when it's wrecked.

**The cardboard mat and the rhythm game**:
- Put the mat down (bag, Use) and its menu opens: the rhythm game to the mat's street beat or a tape of yours,
  freestyle, pick it up. The action button on it opens the menu again.
- **Freestyle**: dancing on your mat with the dance button. Each different move in the last 20 s makes it better, but
  freestyle tops out at a small crowd (`FREESTYLE`). Two breaking moves are new for everyone's dance button: toprock
  (a foot crossed in front and back, the arms opening) and a freeze (down on one hand, the legs up) - client/art2/
  dances.js `dtop`, `dfreeze`; shared/dance.js.
- **The rhythm game** (client/music/play.js, loaded the first time): a 48-second set. The notes fall down four lanes to
  the beat of the song the mat plays, on the arcade's screen laid low over the city, so you can see your dancer and the
  crowd. Hit with the arrows or D F J K, the d-pad or X A Y RB, or by tapping the lane (shared/controls.js
  `MUSIC_KEYS`). PERFECT within 50 ms, GREAT 100, GOOD 150, else a miss. Ten in a row adds half to the multiplier, up to
  x3. A hype meter shows how the crowd's taking it. The chart comes from the song's beats and a seed the server picks
  (`chart`): the page and the server make the same one, a bar to count in, busier as the set goes on, a fast song on its
  half-time.
- **The server judges**: each hit goes up with how far off it was by the page's clock. The server takes it only within
  0.45 s before to 1.5 s after the note by its own clock, so a set can't be scored before it's played. Notes nobody hit
  are misses. The score, the combo and the rating (how the crowd takes it) are the server's, and the set's result comes
  back to the page. Your dancer moves on to the next move every few hits in a row, and stumbles back to the two-step on a
  miss.

**The crowd** (npc.js state 'mcrowd', music.js `crowdStep`; the numbers: shared/rules-music.js `CROWD`):
- People walking by stop to watch, one every 1.6 s, up to the size the show is worth: 12 for a great one (rating 0.85 and
  up), 7, 4, or 1. They stand round you and face you.
- A great show has them jumping (the crowd's `djump`), some filming it on their phones, cheers going up ("Woo!",
  "Encore!": speech bubbles and a cheer), and people stepping up to the hat with $1-6 (more the better it is). A good
  one has them swaying and bouncing and clapping.
- A sloppy one and they drift off unamused, one every couple of seconds; below a rating of 0.3 most boo as they go (a
  bubble and a boo).
- **The hat** goes down beside you when you perform. Its takings go to you when you finish standing by it. Walk off and
  leave it, and anyone can swipe the tips (a minor crime, "Stealing a performer's tips"), and you're told who took them.
  Tips are capped at $300 an hour.

**Instruments** (guitar $260, keytar $420, bucket drums $60, sax $380, violin $320 - the record shops):
- Use one from the bag and you hold it as the street buskers do (the keytar slung like the guitar), a hat at your
  feet, and the jam screen opens: eight pads (A-K; the d-pad and X A Y RB; tap them) play the instrument's notes - a
  pentatonic, so anything sounds fine - Shift / LT / CHORD for a chord. You hear your notes the moment you press. The
  server sends them to everyone within 520 px (the 'jamn' event; at most 14 notes a second), who hear them from where
  you stand.
- **GIG** (Enter, the View button, or the button on the screen) picks a backing track (the street beat or one of your
  tapes) and plays the rhythm game on the instrument. Each hit is a note on it, a chord at a long combo, and the crowd
  rates and tips it like the dance. After the set it's back to free play.
- Free play on its own draws a small crowd while you keep playing.
- **The city's buskers play now too** (client/sound/stage.js `buskers`): the nearest guitarist, saxophonist, violinist or
  bucket drummer (server personas.js) noodles on their instrument - a pentatonic walk at an easy tempo - heard from their
  pitch.

**The record shops** (shared/shoprooms.js `FIT.records`): World v3's record shops were walk-ins with a counter that only
sold furniture. They now have a fitted interior like the other shop rooms: sleeves racked up the back wall, guitars
hung by the counter, rows of record crates, a listening booth and a jukebox, a VINYL / RECORDS / TAPES sign. The
counters sell the tapes, the boombox, the radio, the mat and the instruments (one of each). The debug teleport has
`near records`.

**The clock the music keeps**: every music message carries the server's time and its tick, so the page knows the server's
clock exactly (its time is a base plus the tick) however late it reads the message - a busy page plays its events late,
and the first reckoning, from the snapshot in at the time, ran seconds behind on a slow machine, so every hit landed
outside the server's window. The page's reckoning then runs on with the snapshots (client/music/stage.js `clock`).

**With the hub (batch 6 / UI)**: the music items have their own Music shelf in the bag (client/bag.js, their lines from
shared/music.js `desc`), and Radio is an app in the phone's grid; the app loads the stations through client/music/stage.js,
so the page doesn't carry shared/music.js. On touch the car radio is the phone's Radio app (no new HUD slot); the music
games' lanes and pads are tapped on their own screen.

**The page** (budgets: page 498 of 498, renderer 401 of 401, bake 906 of 906 - none raised):
- Everything new loads after the page: client/music/stage.js at the start (as render/carryfx.js is), client/music/play.js
  the first time you perform, client/sound/stage.js with the sound, the songs one by one as they're wanted.
- The page's hooks are a few lines in main.js (the module, its events, its drawing, the two games on the arcade screen)
  and in inventory.js (the music items' Use and their bag lines). The new controls in shared/controls.js cost page bytes
  too. To make room, two long comments in main.js were condensed. The renderer and the bake took the two breaking poses
  and the record shop's fit-out; the dances' and shoprooms.js's header comments were condensed to fit.
- The numbers are in shared/rules-music.js, not shared/rules.js, which every page loads at once - the same as
  rules-games.js for the games of chance.

**Tests**: test/music.test.js (new): the track list, the songbook and the stations; the chart, the judging, the score and
the rating; the record shop's counter and a boombox heard in sync, by someone coming in too; shooting, punching and
blowing one up; the car radio; a good set drawing a big crowd that jumps, films and tips; a sloppy one booed and left;
an instrument heard by another player, a gig, busking, the hat swiped; freestyle's small crowd. the page's clock from a message read late. test/hub.test.js: the bag's Music shelf. test/world3server.test.js:
World v3's record shops fitted out and selling the music. test/dance.test.js (fourteen moves); test/sound.test.js (the
crowd's sounds measured: client/sound/levels.js, test/fixtures/sound-levels.json).

Left for later: the owner's own music (the `file` fields are ready); breaking's floor moves (windmills, headspins) need
poses the rig doesn't have yet.
