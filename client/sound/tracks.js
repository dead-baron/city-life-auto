// The recorded music (made by tools/music/make-loop.py - edit there, not here): each track is a loop cut on
// its bar lines from the owner's master, padded with a wrap-around margin each side, as Opus and as MP3. The
// player (track.js) loops it from margin to margin + loop.
export const TRACKS = {
 "title": {
  "opus": "assets/music/title-2abf0d73.opus",
  "mp3": "assets/music/title-d5454c40.mp3",
  "loop": 41.429563,
  "margin": 0.25,
  "channels": 1,
  "lufs": -17.1,
  "bytes": {
   "opus": 361249,
   "mp3": 504020
  },
  "bars": 16,
  "from": "CLA_MENU_CHILL_close_melody_master_00001.flac 23.339-64.769 s"
 },
 "arrival": {
  "opus": "assets/music/arrival-78ef66d2.opus",
  "mp3": "assets/music/arrival-d3b25ffe.mp3",
  "loop": 44.341875,
  "margin": 0.25,
  "channels": 1,
  "lufs": -18.6,
  "bytes": {
   "opus": 562332,
   "mp3": 718484
  },
  "bars": 16,
  "from": "CLA_Main_Screen_master_00001.flac 22.445-66.787 s (the first title track, 10-10)"
 }
};
