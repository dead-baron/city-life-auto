// The recorded music (made by tools/music/make-loop.py - edit there, not here): each track is a loop cut on
// its bar lines from the owner's master, padded with a wrap-around margin each side, as Opus and as MP3. The
// player (track.js) loops it from margin to margin + loop.
export const TRACKS = {
 "title": {
  "opus": "assets/music/title-78ef66d2.opus",
  "mp3": "assets/music/title-d3b25ffe.mp3",
  "loop": 44.341875,
  "margin": 0.25,
  "channels": 1,
  "lufs": -18.6,
  "bytes": {
   "opus": 562332,
   "mp3": 718484
  },
  "bars": 16,
  "from": "CLA_Main_Screen_master_00001.flac 22.445-66.787 s"
 }
};
