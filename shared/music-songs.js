// Made by tools/music/songbook.mjs from the song scores (tools/music/songs/*.js) and the live synth's songs (client/sound/
// music.js SONGS) - edit those, then run it again. Each song as the game times it: its length (secs), its beats, its
// tempo map ([from s, bpm, at beat]), its key (MIDI note of the tonic) and whether it's minor.
export const SONGS = {
  "clockwork-kitty": {"title":"Clockwork Kitty","secs":74.12,"beats":168,"tempo":[[0,136,0]],"key":67,"minor":false},
  "double-scoop": {"title":"Double Scoop","secs":121.9,"beats":128,"tempo":[[0,63,0]],"key":71,"minor":true},
  "first-sprouts": {"title":"First Sprouts","secs":92.77,"beats":184,"tempo":[[0,119,0]],"key":69,"minor":false},
  "garden-morning": {"title":"Tomatoes in the Morning","secs":96,"beats":160,"tempo":[[0,100,0]],"key":65,"minor":false},
  "grease-fire": {"title":"Grease Fire","secs":120,"beats":176,"tempo":[[0,88,0]],"key":65,"minor":true},
  "heist-fm": {"title":"Smash and Grab","secs":104.79,"beats":248,"tempo":[[0,142,0]],"key":60,"minor":false},
  "heist-getaway": {"title":"Getaway Job","secs":110,"beats":264,"tempo":[[0,144,0]],"key":67,"minor":true},
  "jester-parade": {"title":"Jester's Parade","secs":59.5,"beats":120,"tempo":[[0,121,0]],"key":61,"minor":false},
  "kickflip": {"title":"Kickflip","secs":71.02,"beats":232,"tempo":[[0,196,0]],"key":62,"minor":false},
  "menu-wide-awake": {"title":"Wide Awake City","secs":102.86,"beats":192,"tempo":[[0,112,0]],"key":62,"minor":false},
  "porch-light": {"title":"Porch Light","secs":87.27,"beats":160,"tempo":[[0,110,0]],"key":60,"minor":false},
  "precinct-brass": {"title":"Badge and Brass","secs":88.89,"beats":160,"tempo":[[0,108,0]],"key":64,"minor":false},
  "rescue-run": {"title":"Rescue Run","secs":100.73,"beats":184,"tempo":[[0,96,0],[50,123,80]],"key":69,"minor":false},
  "sugar-haze": {"title":"Sugar Haze","secs":110.34,"beats":160,"tempo":[[0,87,0]],"key":68,"minor":false},
  "sunburnt-tape": {"title":"Sunburnt Tape","secs":118.76,"beats":192,"tempo":[[0,97,0]],"key":67,"minor":false},
  "waiting-room": {"title":"Waiting Room Disco","secs":85.71,"beats":160,"tempo":[[0,112,0]],"key":60,"minor":false},
  "club": {"title":"club","secs":15.48,"beats":32,"tempo":[[0,124,0]],"key":69,"minor":true},
  "shop": {"title":"shop","secs":19.2,"beats":32,"tempo":[[0,100,0]],"key":65,"minor":false},
  "lobby": {"title":"lobby","secs":24.62,"beats":32,"tempo":[[0,78,0]],"key":60,"minor":false},
  "drivein": {"title":"drivein","secs":28.24,"beats":32,"tempo":[[0,68,0]],"key":60,"minor":false},
};
