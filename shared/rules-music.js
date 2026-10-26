// The numbers for music and street performance (the owner's notes part 2: the boombox and the radio, tapes from the
// record store, the car radio, the cardboard mat and the rhythm game, the instruments and busking) - the server's
// (server/systems/music.js) and the screens' that load later (client/music/, client/sound/stage.js), kept out of
// shared/rules.js, which every page loads at once (tools/perf.mjs: the page's code), as shared/rules-games.js keeps the
// games of chance. Player-facing all the same: read them here.
// What things cost at a record store's counter (server economy.js walkCounter 'records'): a tape is one song on cassette
export const MUSIC_PRICES = { boombox: 140, radio: 45, dancemat: 20, tape: 12, guitar: 260, keytar: 420, bucketdrum: 60, sax: 380, violin: 320 };
// How far each is heard, px (full up close, falling off to nothing at the edge): a boombox out loud, the little radio,
// a car's radio (muffled through the body unless you're in it), the speaker by a dancer's mat, an instrument played
export const MUSIC_HEAR = { boombox: 560, radio: 300, car: 380, mat: 440, jam: 520 };
// The things you set down or carry: hp (a boombox or a radio on the ground takes this much before it's wrecked - a bullet
// does its damage, a punch 4, a blast all of it), what's left lies there wreckS s; awayS: left awayPx behind that long (or
// its owner gone), it's packed back into their bag; reachPx: how close to work it; windS: how long a wrecked one's music
// glitches and winds down; maxOut: of each kind a player has out at once
export const MUSIC_GEAR = { boomboxHp: 24, radioHp: 10, punch: 4, wreckS: 150, awayS: 120, awayPx: 900, reachPx: 44, windS: 2.4, maxOut: 1 };
// The rhythm game (client/music/play.js; judged on the server: shared/music.js judge): a set lasts setS s of the song,
// the notes fall leadS s from the top to the line; a hit perfectMs / greatMs / goodMs off the beat scores that, more off
// is a miss; points per grade, combo: every comboEvery notes in a row adds comboStep to the multiplier, up to comboMax;
// the server takes a hit earlyS before its note to lateS after (the network's lag); a lane's density by the set's
// stage (notes per beat: easy, then busier); rateK: how fast the performance's rating follows the hits (shared/music.js rate)
export const RHYTHM = { setS: 48, leadS: 1.6, perfectMs: 50, greatMs: 100, goodMs: 150, points: [300, 200, 100, 0], comboEvery: 10, comboStep: 0.5, comboMax: 3, earlyS: 0.45, lateS: 1.5, density: [0.5, 0.75, 1], rateK: 0.12, minGapBeats: 0.5 };
// The crowd a performance draws (server music.js): people walking by within drawPx stop to watch, one every everyS s,
// up to the size for the rating (sizes: [at least this rating, this many]); above jumpAt they're really into it (jumping,
// cheering), above filmAt some film it; below leaveAt they drift off unamused, below booAt some boo first. No one comes
// back to the same act for againS s. Tips: every tipEveryS s each one watching may step up to the hat (the chance:
// (rating - tipFrom) x tipK), dropping tip[0]..tip[1] dollars (more the better it is); a performer's tips are capped at
// tipCapHour an hour; the hat lies there hatKeepS s once nobody's performing by it
export const CROWD = { drawPx: 360, everyS: 1.6, max: 12, sizes: [[0.85, 12], [0.65, 7], [0.45, 4], [0, 1]], jumpAt: 0.8, filmAt: 0.7, leaveAt: 0.42, booAt: 0.3, againS: 90, tipEveryS: 3, tipFrom: 0.55, tipK: 0.3, tip: [1, 6], tipCapHour: 300, hatKeepS: 240, standPx: [58, 120] };
// Freestyle (dancing on your mat without the game, the dance button for the next move): its rating is base, plus perMove
// for each different move in the last windowS s, up to max - enough for a small crowd, never a big one
export const FREESTYLE = { base: 0.4, perMove: 0.06, max: 0.66, windowS: 20 };
// Playing an instrument out loud (the jam): free play's rating is base plus perNote for each note in the last windowS s,
// up to max (the gig - the rhythm game on the instrument - is rated like the dance); at most maxRate notes a second go
// out to the others; idleS without a note and the crowd thins
export const JAM = { base: 0.32, perNote: 0.02, max: 0.62, windowS: 8, maxRate: 14, idleS: 5 };
