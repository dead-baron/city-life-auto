// The soundtrack (made by tools/music/make-songs.py - edit there, not here): the owner's songs by cue - the
// primary take and its alternates - and each take as a loop (a bed: cut on its bar lines, a wrap-around margin
// each side, played from margin to margin + loop) and as the full song from the top to its ending. Opus, MP3
// where Opus won't play. All approved by the owner by ear, 2026-11-22. Loaded only when music is wanted.
export const SONGS = {
 "cues": {
  "01": {
   "title": "Sunburnt Tape",
   "primary": "T03",
   "alts": [
    "T04"
   ]
  },
  "02": {
   "title": "Sugar Haze",
   "primary": "C03",
   "alts": [
    "C04"
   ]
  },
  "03": {
   "title": "Waiting Room Disco",
   "primary": "T05",
   "alts": [
    "T06"
   ]
  },
  "04": {
   "title": "Clockwork Kitty",
   "primary": "T02",
   "alts": []
  },
  "05": {
   "title": "Smash and Grab",
   "primary": "C09",
   "alts": [
    "C10"
   ]
  },
  "06": {
   "title": "Getaway Job",
   "primary": "A11",
   "alts": []
  },
  "07": {
   "title": "Badge and Brass",
   "primary": "A06",
   "alts": [
    "A05"
   ]
  },
  "08": {
   "title": "Jester's Parade",
   "primary": "A16",
   "alts": [
    "A17",
    "T10",
    "T11"
   ]
  },
  "09": {
   "title": "Grease Fire",
   "primary": "A12",
   "alts": []
  },
  "10": {
   "title": "Double Scoop",
   "primary": "T08",
   "alts": [
    "T07"
   ]
  },
  "11": {
   "title": "Kickflip",
   "primary": "A18",
   "alts": [
    "A01"
   ]
  },
  "12": {
   "title": "Rescue Run",
   "primary": "B17",
   "alts": [
    "B02",
    "B01"
   ]
  },
  "13": {
   "title": "Wide Awake City",
   "primary": "C08",
   "alts": [
    "C07"
   ]
  },
  "14": {
   "title": "First Sprouts",
   "primary": "A09",
   "alts": [
    "A08"
   ]
  },
  "15": {
   "title": "Tomatoes in the Morning",
   "primary": "C06",
   "alts": []
  },
  "16": {
   "title": "Porch Light",
   "primary": "B16",
   "alts": []
  },
  "17": {
   "title": "Aisle Bossa",
   "primary": "T12",
   "alts": [
    "T27"
   ]
  },
  "18": {
   "title": "Visiting Hours",
   "primary": "T29",
   "alts": [
    "T01",
    "T20",
    "T28",
    "A14"
   ]
  },
  "19": {
   "title": "Starlite Slow Dance",
   "primary": "C11",
   "alts": [
    "C01"
   ]
  },
  "20": {
   "title": "Street Beat",
   "primary": "C02",
   "alts": []
  },
  "21": {
   "title": "Neon Current",
   "primary": "T22",
   "alts": [
    "B14",
    "T24",
    "T25",
    "T26",
    "B10",
    "B11",
    "B12",
    "B13"
   ]
  },
  "22": {
   "title": "Mirrorball Traffic",
   "primary": "T17",
   "alts": [
    "T16"
   ]
  },
  "23": {
   "title": "Dust on the Dial",
   "primary": "D02",
   "alts": [
    "D03",
    "D01"
   ]
  },
  "24": {
   "title": "House Odds",
   "primary": "A15",
   "alts": []
  },
  "25": {
   "title": "Brass Ticket",
   "primary": "A07",
   "alts": []
  }
 },
 "takes": {
  "A01": {
   "cue": "11",
   "title": "Kickflip",
   "role": "alternate",
   "channels": 2,
   "bpm": 183.97,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A01-loop-760b2682.opus",
    "mp3": "assets/music/songs/A01-loop-60a5bcf0.mp3",
    "loop": 31.343417,
    "margin": 0.25,
    "lufs": -14.6,
    "bytes": {
     "opus": 363960,
     "mp3": 446564
    },
    "bars": 24,
    "seamDb": {
     "opus": -13.0,
     "mp3": -13.1
    },
    "from": "19.691-51.034 s"
   },
   "full": {
    "opus": "assets/music/songs/A01-full-56219690.opus",
    "mp3": "assets/music/songs/A01-full-8b6035e3.mp3",
    "seconds": 74.72,
    "lufs": -14.8,
    "bytes": {
     "opus": 845945,
     "mp3": 1046996
    },
    "ending": "own"
   }
  },
  "A05": {
   "cue": "07",
   "title": "Badge and Brass",
   "role": "alternate",
   "channels": 1,
   "bpm": 107.83,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A05-loop-589387d5.opus",
    "mp3": "assets/music/songs/A05-loop-749dce8e.mp3",
    "loop": 35.578688,
    "margin": 0.25,
    "lufs": -17.1,
    "bytes": {
     "opus": 299915,
     "mp3": 361460
    },
    "bars": 16,
    "seamDb": {
     "opus": -18.4,
     "mp3": -22.9
    },
    "from": "45.790-81.369 s"
   },
   "full": {
    "opus": "assets/music/songs/A05-full-f5a00ed5.opus",
    "mp3": "assets/music/songs/A05-full-44b98de0.mp3",
    "seconds": 118.025,
    "lufs": -17.8,
    "bytes": {
     "opus": 971861,
     "mp3": 1180820
    },
    "ending": "new, at 116.912 s"
   }
  },
  "A06": {
   "cue": "07",
   "title": "Badge and Brass",
   "role": "primary",
   "channels": 1,
   "bpm": 104.74,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A06-loop-01e17edb.opus",
    "mp3": "assets/music/songs/A06-loop-9368e6ab.mp3",
    "loop": 36.52,
    "margin": 0.25,
    "lufs": -15.9,
    "bytes": {
     "opus": 258719,
     "mp3": 370820
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.7,
     "mp3": -19.9
    },
    "from": "37.361-73.881 s"
   },
   "full": {
    "opus": "assets/music/songs/A06-full-078b4eaf.opus",
    "mp3": "assets/music/songs/A06-full-09906120.mp3",
    "seconds": 111.464,
    "lufs": -16.9,
    "bytes": {
     "opus": 779460,
     "mp3": 1115300
    },
    "ending": "new, at 110.318 s"
   }
  },
  "A07": {
   "cue": "25",
   "title": "Brass Ticket",
   "role": "primary",
   "channels": 2,
   "bpm": 123.68,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A07-loop-165551b1.opus",
    "mp3": "assets/music/songs/A07-loop-3d9de560.mp3",
    "loop": 30.951896,
    "margin": 0.25,
    "lufs": -13.4,
    "bytes": {
     "opus": 357354,
     "mp3": 441188
    },
    "bars": 16,
    "seamDb": {
     "opus": -21.8,
     "mp3": -26.8
    },
    "from": "41.401-72.353 s"
   },
   "full": {
    "opus": "assets/music/songs/A07-full-738e0893.opus",
    "mp3": "assets/music/songs/A07-full-3a536483.mp3",
    "seconds": 88.811,
    "lufs": -14.1,
    "bytes": {
     "opus": 1006313,
     "mp3": 1244228
    },
    "ending": "new, at 87.841 s"
   }
  },
  "A08": {
   "cue": "14",
   "title": "First Sprouts",
   "role": "alternate",
   "channels": 2,
   "bpm": 118.31,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A08-loop-8dece15d.opus",
    "mp3": "assets/music/songs/A08-loop-4d671ed9.mp3",
    "loop": 24.268479,
    "margin": 0.25,
    "lufs": -13.9,
    "bytes": {
     "opus": 284123,
     "mp3": 347780
    },
    "bars": 12,
    "seamDb": {
     "opus": -18.9,
     "mp3": -21.3
    },
    "from": "129.382-153.650 s"
   },
   "full": {
    "opus": "assets/music/songs/A08-full-95816bb5.opus",
    "mp3": "assets/music/songs/A08-full-f8870c74.mp3",
    "seconds": 170.845,
    "lufs": -13.6,
    "bytes": {
     "opus": 1929647,
     "mp3": 2392676
    },
    "ending": "new, at 169.831 s"
   }
  },
  "A09": {
   "cue": "14",
   "title": "First Sprouts",
   "role": "primary",
   "channels": 1,
   "bpm": 108.67,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A09-loop-76d2f685.opus",
    "mp3": "assets/music/songs/A09-loop-9b880e34.mp3",
    "loop": 26.422396,
    "margin": 0.25,
    "lufs": -16.0,
    "bytes": {
     "opus": 223890,
     "mp3": 269780
    },
    "bars": 12,
    "seamDb": {
     "opus": -20.7,
     "mp3": -25.5
    },
    "from": "9.079-35.501 s"
   },
   "full": {
    "opus": "assets/music/songs/A09-full-694d1bac.opus",
    "mp3": "assets/music/songs/A09-full-40026719.mp3",
    "seconds": 39.12,
    "lufs": -16.7,
    "bytes": {
     "opus": 316646,
     "mp3": 391700
    },
    "ending": "own"
   }
  },
  "A11": {
   "cue": "06",
   "title": "Getaway Job",
   "role": "primary",
   "channels": 2,
   "bpm": 129.63,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A11-loop-403e1d44.opus",
    "mp3": "assets/music/songs/A11-loop-23dc9420.mp3",
    "loop": 29.530708,
    "margin": 0.25,
    "lufs": -14.0,
    "bytes": {
     "opus": 353097,
     "mp3": 421364
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.1,
     "mp3": -17.8
    },
    "from": "66.479-96.010 s"
   },
   "full": {
    "opus": "assets/music/songs/A11-full-f31c5920.opus",
    "mp3": "assets/music/songs/A11-full-beeed7cc.mp3",
    "seconds": 126.8,
    "lufs": -14.0,
    "bytes": {
     "opus": 1484982,
     "mp3": 1776116
    },
    "ending": "own"
   }
  },
  "A12": {
   "cue": "09",
   "title": "Grease Fire",
   "role": "primary",
   "channels": 1,
   "bpm": 88.67,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A12-loop-550bac81.opus",
    "mp3": "assets/music/songs/A12-loop-4d803c56.mp3",
    "loop": 43.378229,
    "margin": 0.25,
    "lufs": -17.8,
    "bytes": {
     "opus": 331285,
     "mp3": 439460
    },
    "bars": 16,
    "seamDb": {
     "opus": -18.8,
     "mp3": -26.0
    },
    "from": "62.462-105.840 s"
   },
   "full": {
    "opus": "assets/music/songs/A12-full-941bcfa1.opus",
    "mp3": "assets/music/songs/A12-full-71d69a53.mp3",
    "seconds": 139.721,
    "lufs": -18.3,
    "bytes": {
     "opus": 1065277,
     "mp3": 1397780
    },
    "ending": "new, at 138.368 s"
   }
  },
  "A14": {
   "cue": "18",
   "title": "Visiting Hours",
   "role": "alternate",
   "channels": 2,
   "bpm": 124.61,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A14-loop-02d8049b.opus",
    "mp3": "assets/music/songs/A14-loop-cf5a8a00.mp3",
    "loop": 30.719708,
    "margin": 0.25,
    "lufs": -13.8,
    "bytes": {
     "opus": 356122,
     "mp3": 437828
    },
    "bars": 16,
    "seamDb": {
     "opus": -24.8,
     "mp3": -27.5
    },
    "from": "69.428-100.148 s"
   },
   "full": {
    "opus": "assets/music/songs/A14-full-2c31107d.opus",
    "mp3": "assets/music/songs/A14-full-40d2a5df.mp3",
    "seconds": 116.459,
    "lufs": -14.1,
    "bytes": {
     "opus": 1309074,
     "mp3": 1631300
    },
    "ending": "new, at 115.496 s"
   }
  },
  "A15": {
   "cue": "24",
   "title": "House Odds",
   "role": "primary",
   "channels": 2,
   "bpm": 95.2,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A15-loop-0802357a.opus",
    "mp3": "assets/music/songs/A15-loop-dc350eb0.mp3",
    "loop": 40.42,
    "margin": 0.25,
    "lufs": -13.2,
    "bytes": {
     "opus": 437679,
     "mp3": 573572
    },
    "bars": 16,
    "seamDb": {
     "opus": -28.6,
     "mp3": -17.6
    },
    "from": "60.836-101.256 s"
   },
   "full": {
    "opus": "assets/music/songs/A15-full-31660769.opus",
    "mp3": "assets/music/songs/A15-full-c437a21c.mp3",
    "seconds": 112.623,
    "lufs": -13.6,
    "bytes": {
     "opus": 1185729,
     "mp3": 1577540
    },
    "ending": "new, at 111.363 s"
   }
  },
  "A16": {
   "cue": "08",
   "title": "Jester's Parade",
   "role": "primary",
   "channels": 1,
   "bpm": 163.41,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A16-loop-1229b4b1.opus",
    "mp3": "assets/music/songs/A16-loop-e1f15d91.mp3",
    "loop": 23.426375,
    "margin": 0.25,
    "lufs": -16.2,
    "bytes": {
     "opus": 180513,
     "mp3": 239780
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.1,
     "mp3": -25.4
    },
    "from": "41.587-65.013 s"
   },
   "full": {
    "opus": "assets/music/songs/A16-full-4b6a2028.opus",
    "mp3": "assets/music/songs/A16-full-8c00f3e7.mp3",
    "seconds": 124.148,
    "lufs": -16.2,
    "bytes": {
     "opus": 932031,
     "mp3": 1242020
    },
    "ending": "new, at 123.414 s"
   }
  },
  "A17": {
   "cue": "08",
   "title": "Jester's Parade",
   "role": "alternate",
   "channels": 2,
   "bpm": 119.86,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A17-loop-63edf484.opus",
    "mp3": "assets/music/songs/A17-loop-e9d453a5.mp3",
    "loop": 23.989687,
    "margin": 0.25,
    "lufs": -14.3,
    "bytes": {
     "opus": 286943,
     "mp3": 343748
    },
    "bars": 12,
    "seamDb": {
     "opus": -18.2,
     "mp3": -15.6
    },
    "from": "40.542-64.532 s"
   },
   "full": {
    "opus": "assets/music/songs/A17-full-31601a92.opus",
    "mp3": "assets/music/songs/A17-full-4b71f53f.mp3",
    "seconds": 81.528,
    "lufs": -14.7,
    "bytes": {
     "opus": 938673,
     "mp3": 1142084
    },
    "ending": "new, at 80.527 s"
   }
  },
  "A18": {
   "cue": "11",
   "title": "Kickflip",
   "role": "primary",
   "channels": 2,
   "bpm": 188.79,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/A18-loop-c784d0f5.opus",
    "mp3": "assets/music/songs/A18-loop-b9889644.mp3",
    "loop": 20.220229,
    "margin": 0.25,
    "lufs": -14.2,
    "bytes": {
     "opus": 247862,
     "mp3": 290996
    },
    "bars": 16,
    "seamDb": {
     "opus": -18.1,
     "mp3": -19.2
    },
    "from": "34.389-54.609 s"
   },
   "full": {
    "opus": "assets/music/songs/A18-full-a94d02bb.opus",
    "mp3": "assets/music/songs/A18-full-63571f9b.mp3",
    "seconds": 76.56,
    "lufs": -14.5,
    "bytes": {
     "opus": 889634,
     "mp3": 1072532
    },
    "ending": "own"
   }
  },
  "B01": {
   "cue": "12",
   "title": "Rescue Run",
   "role": "alternate",
   "channels": 2,
   "bpm": 119.81,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/B01-loop-4add8721.opus",
    "mp3": "assets/music/songs/B01-loop-5c335263.mp3",
    "loop": 31.997708,
    "margin": 0.25,
    "lufs": -14.0,
    "bytes": {
     "opus": 428589,
     "mp3": 455972
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.8,
     "mp3": -19.3
    },
    "from": "84.056-116.054 s"
   },
   "full": {
    "opus": "assets/music/songs/B01-full-b80ce8f6.opus",
    "mp3": "assets/music/songs/B01-full-13fe35fd.mp3",
    "seconds": 133.054,
    "lufs": -14.6,
    "bytes": {
     "opus": 1680405,
     "mp3": 1863476
    },
    "ending": "new, at 132.052 s"
   }
  },
  "B02": {
   "cue": "12",
   "title": "Rescue Run",
   "role": "alternate",
   "channels": 2,
   "bpm": 95.26,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/B02-loop-6de7dad6.opus",
    "mp3": "assets/music/songs/B02-loop-8f03b437.mp3",
    "loop": 20.2265,
    "margin": 0.25,
    "lufs": -13.4,
    "bytes": {
     "opus": 247073,
     "mp3": 290996
    },
    "bars": 8,
    "seamDb": {
     "opus": -20.4,
     "mp3": -20.9
    },
    "from": "41.053-61.279 s"
   },
   "full": {
    "opus": "assets/music/songs/B02-full-1a9f356e.opus",
    "mp3": "assets/music/songs/B02-full-7a3169e4.mp3",
    "seconds": 133.265,
    "lufs": -13.9,
    "bytes": {
     "opus": 1604330,
     "mp3": 1866500
    },
    "ending": "new, at 132.005 s"
   }
  },
  "B10": {
   "cue": "21",
   "title": "Neon Current",
   "role": "alternate",
   "channels": 1,
   "bpm": 129.91,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/B10-loop-26f181ae.opus",
    "mp3": "assets/music/songs/B10-loop-a0b29ff7.mp3",
    "loop": 29.532125,
    "margin": 0.25,
    "lufs": -14.8,
    "bytes": {
     "opus": 216308,
     "mp3": 300980
    },
    "bars": 16,
    "seamDb": {
     "opus": -20.1,
     "mp3": -25.8
    },
    "from": "51.664-81.196 s"
   },
   "full": {
    "opus": "assets/music/songs/B10-full-1862d719.opus",
    "mp3": "assets/music/songs/B10-full-a1804c1c.mp3",
    "seconds": 155.94,
    "lufs": -15.6,
    "bytes": {
     "opus": 1116347,
     "mp3": 1560020
    },
    "ending": "new, at 155.016 s"
   }
  },
  "B11": {
   "cue": "21",
   "title": "Neon Current",
   "role": "alternate",
   "channels": 2,
   "bpm": 129.67,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/B11-loop-1558e2af.opus",
    "mp3": "assets/music/songs/B11-loop-2ac12a6f.mp3",
    "loop": 29.537333,
    "margin": 0.25,
    "lufs": -13.6,
    "bytes": {
     "opus": 324770,
     "mp3": 421364
    },
    "bars": 16,
    "seamDb": {
     "opus": -17.1,
     "mp3": -17.4
    },
    "from": "67.872-97.409 s"
   },
   "full": {
    "opus": "assets/music/songs/B11-full-4afdca3d.opus",
    "mp3": "assets/music/songs/B11-full-8c5ca582.mp3",
    "seconds": 160.2,
    "lufs": -14.1,
    "bytes": {
     "opus": 1723101,
     "mp3": 2243492
    },
    "ending": "own"
   }
  },
  "B12": {
   "cue": "21",
   "title": "Neon Current",
   "role": "alternate",
   "channels": 2,
   "bpm": 123.43,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/B12-loop-f411d3ea.opus",
    "mp3": "assets/music/songs/B12-loop-c5b72b55.mp3",
    "loop": 31.050438,
    "margin": 0.25,
    "lufs": -11.7,
    "bytes": {
     "opus": 329274,
     "mp3": 442532
    },
    "bars": 16,
    "seamDb": {
     "opus": -16.2,
     "mp3": -15.2
    },
    "from": "87.493-118.543 s"
   },
   "full": {
    "opus": "assets/music/songs/B12-full-0481f8e3.opus",
    "mp3": "assets/music/songs/B12-full-c89d3608.mp3",
    "seconds": 142.799,
    "lufs": -13.2,
    "bytes": {
     "opus": 1469958,
     "mp3": 1999892
    },
    "ending": "new, at 141.827 s"
   }
  },
  "B13": {
   "cue": "21",
   "title": "Neon Current",
   "role": "alternate",
   "channels": 1,
   "bpm": 126.56,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/B13-loop-7d26f1fe.opus",
    "mp3": "assets/music/songs/B13-loop-28685b7b.mp3",
    "loop": 30.420646,
    "margin": 0.25,
    "lufs": -15.2,
    "bytes": {
     "opus": 236997,
     "mp3": 309860
    },
    "bars": 16,
    "seamDb": {
     "opus": -14.1,
     "mp3": -14.1
    },
    "from": "47.671-78.092 s"
   },
   "full": {
    "opus": "assets/music/songs/B13-full-cca3925b.opus",
    "mp3": "assets/music/songs/B13-full-0ef4746b.mp3",
    "seconds": 147.396,
    "lufs": -15.5,
    "bytes": {
     "opus": 1124599,
     "mp3": 1474580
    },
    "ending": "new, at 146.448 s"
   }
  },
  "B14": {
   "cue": "21",
   "title": "Neon Current",
   "role": "alternate",
   "channels": 1,
   "bpm": 124.43,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/B14-loop-d4a5793d.opus",
    "mp3": "assets/music/songs/B14-loop-77c8e683.mp3",
    "loop": 30.721833,
    "margin": 0.25,
    "lufs": -16.2,
    "bytes": {
     "opus": 223423,
     "mp3": 312740
    },
    "bars": 16,
    "seamDb": {
     "opus": -16.6,
     "mp3": -18.4
    },
    "from": "69.079-99.801 s"
   },
   "full": {
    "opus": "assets/music/songs/B14-full-30fbb4b4.opus",
    "mp3": "assets/music/songs/B14-full-0e91aeff.mp3",
    "seconds": 147.319,
    "lufs": -17.0,
    "bytes": {
     "opus": 1064911,
     "mp3": 1473860
    },
    "ending": "new, at 146.355 s"
   }
  },
  "B16": {
   "cue": "16",
   "title": "Porch Light",
   "role": "primary",
   "channels": 1,
   "bpm": 80.2,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/B16-loop-3126d4b2.opus",
    "mp3": "assets/music/songs/B16-loop-9d248d67.mp3",
    "loop": 47.999417,
    "margin": 0.25,
    "lufs": -16.7,
    "bytes": {
     "opus": 358843,
     "mp3": 485540
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.2,
     "mp3": -34.0
    },
    "from": "60.070-108.069 s"
   },
   "full": {
    "opus": "assets/music/songs/B16-full-0181d3e3.opus",
    "mp3": "assets/music/songs/B16-full-fefe7169.mp3",
    "seconds": 109.562,
    "lufs": -17.3,
    "bytes": {
     "opus": 798066,
     "mp3": 1096340
    },
    "ending": "new, at 108.066 s"
   }
  },
  "B17": {
   "cue": "12",
   "title": "Rescue Run",
   "role": "primary",
   "channels": 1,
   "bpm": 184.77,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/B17-loop-8e28c25d.opus",
    "mp3": "assets/music/songs/B17-loop-47956391.mp3",
    "loop": 20.637854,
    "margin": 0.25,
    "lufs": -15.5,
    "bytes": {
     "opus": 190766,
     "mp3": 211940
    },
    "bars": 16,
    "seamDb": {
     "opus": -11.2,
     "mp3": -10.4
    },
    "from": "36.130-56.768 s"
   },
   "full": {
    "opus": "assets/music/songs/B17-full-1f1b39fa.opus",
    "mp3": "assets/music/songs/B17-full-6338f92b.mp3",
    "seconds": 229.319,
    "lufs": -16.2,
    "bytes": {
     "opus": 1969509,
     "mp3": 2293700
    },
    "ending": "new, at 228.670 s"
   }
  },
  "C01": {
   "cue": "19",
   "title": "Starlite Slow Dance",
   "role": "alternate",
   "channels": 2,
   "bpm": 65.08,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C01-loop-b23963f1.opus",
    "mp3": "assets/music/songs/C01-loop-e35e38ee.mp3",
    "loop": 29.416229,
    "margin": 0.25,
    "lufs": -16.7,
    "bytes": {
     "opus": 322523,
     "mp3": 419684
    },
    "bars": 8,
    "seamDb": {
     "opus": -30.2,
     "mp3": -37.2
    },
    "from": "46.417-75.833 s"
   },
   "full": {
    "opus": "assets/music/songs/C01-full-0e2da7a2.opus",
    "mp3": "assets/music/songs/C01-full-e9a6cfaa.mp3",
    "seconds": 77.68,
    "lufs": -16.4,
    "bytes": {
     "opus": 855812,
     "mp3": 1088324
    },
    "ending": "new, at 75.836 s"
   }
  },
  "C02": {
   "cue": "20",
   "title": "Street Beat",
   "role": "primary",
   "channels": 2,
   "bpm": 122.62,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C02-loop-76906290.opus",
    "mp3": "assets/music/songs/C02-loop-7c804e2b.mp3",
    "loop": 23.521563,
    "margin": 0.25,
    "lufs": -11.6,
    "bytes": {
     "opus": 264644,
     "mp3": 337028
    },
    "bars": 12,
    "seamDb": {
     "opus": -21.4,
     "mp3": -18.4
    },
    "from": "17.647-41.169 s"
   },
   "full": {
    "opus": "assets/music/songs/C02-full-6d32f805.opus",
    "mp3": "assets/music/songs/C02-full-fa00a7eb.mp3",
    "seconds": 49.48,
    "lufs": -13.0,
    "bytes": {
     "opus": 546849,
     "mp3": 693524
    },
    "ending": "own"
   }
  },
  "C03": {
   "cue": "02",
   "title": "Sugar Haze",
   "role": "primary",
   "channels": 1,
   "bpm": 86.32,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C03-loop-7bbbc46d.opus",
    "mp3": "assets/music/songs/C03-loop-fe025833.mp3",
    "loop": 44.323208,
    "margin": 0.25,
    "lufs": -17.4,
    "bytes": {
     "opus": 322900,
     "mp3": 448820
    },
    "bars": 16,
    "seamDb": {
     "opus": -21.8,
     "mp3": -39.5
    },
    "from": "57.400-101.723 s"
   },
   "full": {
    "opus": "assets/music/songs/C03-full-002ce377.opus",
    "mp3": "assets/music/songs/C03-full-ce754a10.mp3",
    "seconds": 124.85,
    "lufs": -16.8,
    "bytes": {
     "opus": 911562,
     "mp3": 1249220
    },
    "ending": "new, at 123.460 s"
   }
  },
  "C04": {
   "cue": "02",
   "title": "Sugar Haze",
   "role": "alternate",
   "channels": 2,
   "bpm": 85.69,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C04-loop-6af88ea2.opus",
    "mp3": "assets/music/songs/C04-loop-3362c0e9.mp3",
    "loop": 33.24675,
    "margin": 0.25,
    "lufs": -13.1,
    "bytes": {
     "opus": 330190,
     "mp3": 473444
    },
    "bars": 12,
    "seamDb": {
     "opus": -24.6,
     "mp3": -28.2
    },
    "from": "90.558-123.805 s"
   },
   "full": {
    "opus": "assets/music/songs/C04-full-eb34fdeb.opus",
    "mp3": "assets/music/songs/C04-full-17dfd972.mp3",
    "seconds": 125.209,
    "lufs": -13.9,
    "bytes": {
     "opus": 1242290,
     "mp3": 1753940
    },
    "ending": "new, at 123.809 s"
   }
  },
  "C06": {
   "cue": "15",
   "title": "Tomatoes in the Morning",
   "role": "primary",
   "channels": 2,
   "bpm": 99.79,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C06-loop-db0923ea.opus",
    "mp3": "assets/music/songs/C06-loop-6555a5d2.mp3",
    "loop": 38.378292,
    "margin": 0.25,
    "lufs": -12.3,
    "bytes": {
     "opus": 454921,
     "mp3": 545012
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.2,
     "mp3": -23.1
    },
    "from": "48.274-86.652 s"
   },
   "full": {
    "opus": "assets/music/songs/C06-full-52362f86.opus",
    "mp3": "assets/music/songs/C06-full-2d5205bc.mp3",
    "seconds": 116.675,
    "lufs": -13.1,
    "bytes": {
     "opus": 1369910,
     "mp3": 1634324
    },
    "ending": "new, at 115.473 s"
   }
  },
  "C07": {
   "cue": "13",
   "title": "Wide Awake City",
   "role": "alternate",
   "channels": 2,
   "bpm": 186.2,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C07-loop-214806b1.opus",
    "mp3": "assets/music/songs/C07-loop-470af7ef.mp3",
    "loop": 20.521333,
    "margin": 0.25,
    "lufs": -13.8,
    "bytes": {
     "opus": 233658,
     "mp3": 295028
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.5,
     "mp3": -23.3
    },
    "from": "92.996-113.517 s"
   },
   "full": {
    "opus": "assets/music/songs/C07-full-1cd48b60.opus",
    "mp3": "assets/music/songs/C07-full-d5f40e74.mp3",
    "seconds": 120.44,
    "lufs": -14.7,
    "bytes": {
     "opus": 1393763,
     "mp3": 1687076
    },
    "ending": "own"
   }
  },
  "C08": {
   "cue": "13",
   "title": "Wide Awake City",
   "role": "primary",
   "channels": 2,
   "bpm": 114.6,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C08-loop-12e68cb8.opus",
    "mp3": "assets/music/songs/C08-loop-b4709f79.mp3",
    "loop": 33.437104,
    "margin": 0.25,
    "lufs": -13.2,
    "bytes": {
     "opus": 386162,
     "mp3": 476132
    },
    "bars": 16,
    "seamDb": {
     "opus": -18.6,
     "mp3": -19.2
    },
    "from": "21.014-54.451 s"
   },
   "full": {
    "opus": "assets/music/songs/C08-full-8bf19c2b.opus",
    "mp3": "assets/music/songs/C08-full-45054961.mp3",
    "seconds": 80.622,
    "lufs": -13.3,
    "bytes": {
     "opus": 907451,
     "mp3": 1129652
    },
    "ending": "new, at 79.575 s"
   }
  },
  "C09": {
   "cue": "05",
   "title": "Smash and Grab",
   "role": "primary",
   "channels": 2,
   "bpm": 133.07,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C09-loop-851b79d6.opus",
    "mp3": "assets/music/songs/C09-loop-eaf26005.mp3",
    "loop": 21.640896,
    "margin": 0.25,
    "lufs": -13.5,
    "bytes": {
     "opus": 261550,
     "mp3": 310820
    },
    "bars": 12,
    "seamDb": {
     "opus": -16.0,
     "mp3": -16.0
    },
    "from": "94.412-116.053 s"
   },
   "full": {
    "opus": "assets/music/songs/C09-full-70f1d141.opus",
    "mp3": "assets/music/songs/C09-full-237d0123.mp3",
    "seconds": 131.375,
    "lufs": -14.1,
    "bytes": {
     "opus": 1524988,
     "mp3": 1839956
    },
    "ending": "new, at 130.473 s"
   }
  },
  "C10": {
   "cue": "05",
   "title": "Smash and Grab",
   "role": "alternate",
   "channels": 2,
   "bpm": 119.9,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C10-loop-2b2fb252.opus",
    "mp3": "assets/music/songs/C10-loop-fec26e7b.mp3",
    "loop": 32.0,
    "margin": 0.25,
    "lufs": -14.6,
    "bytes": {
     "opus": 398066,
     "mp3": 455972
    },
    "bars": 16,
    "seamDb": {
     "opus": -18.4,
     "mp3": -13.2
    },
    "from": "41.192-73.192 s"
   },
   "full": {
    "opus": "assets/music/songs/C10-full-5c2249d7.opus",
    "mp3": "assets/music/songs/C10-full-15b27c36.mp3",
    "seconds": 130.22,
    "lufs": -14.8,
    "bytes": {
     "opus": 1601899,
     "mp3": 1823828
    },
    "ending": "new, at 129.219 s"
   }
  },
  "C11": {
   "cue": "19",
   "title": "Starlite Slow Dance",
   "role": "primary",
   "channels": 2,
   "bpm": 96.48,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/C11-loop-dadf03c0.opus",
    "mp3": "assets/music/songs/C11-loop-c1a0a8b4.mp3",
    "loop": 29.675875,
    "margin": 0.25,
    "lufs": -13.6,
    "bytes": {
     "opus": 299215,
     "mp3": 423380
    },
    "bars": 16,
    "seamDb": {
     "opus": -23.0,
     "mp3": -31.8
    },
    "from": "8.243-37.919 s"
   },
   "full": {
    "opus": "assets/music/songs/C11-full-a87a256c.opus",
    "mp3": "assets/music/songs/C11-full-22335ee6.mp3",
    "seconds": 84.046,
    "lufs": -14.2,
    "bytes": {
     "opus": 840511,
     "mp3": 1177364
    },
    "ending": "new, at 82.802 s"
   }
  },
  "D01": {
   "cue": "23",
   "title": "Dust on the Dial",
   "role": "alternate",
   "channels": 2,
   "bpm": 101.97,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/D01-loop-7f5f1c05.opus",
    "mp3": "assets/music/songs/D01-loop-9cb0e474.mp3",
    "loop": 37.731687,
    "margin": 0.25,
    "lufs": -15.6,
    "bytes": {
     "opus": 404765,
     "mp3": 535940
    },
    "bars": 16,
    "seamDb": {
     "opus": -17.5,
     "mp3": -23.3
    },
    "from": "29.373-67.105 s"
   },
   "full": {
    "opus": "assets/music/songs/D01-full-b0f476f2.opus",
    "mp3": "assets/music/songs/D01-full-34625a1e.mp3",
    "seconds": 143.748,
    "lufs": -15.5,
    "bytes": {
     "opus": 1526794,
     "mp3": 2013332
    },
    "ending": "new, at 142.571 s"
   }
  },
  "D02": {
   "cue": "23",
   "title": "Dust on the Dial",
   "role": "primary",
   "channels": 1,
   "bpm": 100.18,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/D02-loop-f5ba6178.opus",
    "mp3": "assets/music/songs/D02-loop-fd7f9c34.mp3",
    "loop": 38.221167,
    "margin": 0.25,
    "lufs": -15.7,
    "bytes": {
     "opus": 310938,
     "mp3": 387860
    },
    "bars": 16,
    "seamDb": {
     "opus": -18.3,
     "mp3": -19.5
    },
    "from": "86.843-125.064 s"
   },
   "full": {
    "opus": "assets/music/songs/D02-full-3e84bce8.opus",
    "mp3": "assets/music/songs/D02-full-cb07ad5d.mp3",
    "seconds": 145.347,
    "lufs": -16.4,
    "bytes": {
     "opus": 1165751,
     "mp3": 1454180
    },
    "ending": "new, at 144.149 s"
   }
  },
  "D03": {
   "cue": "23",
   "title": "Dust on the Dial",
   "role": "alternate",
   "channels": 2,
   "bpm": 103.71,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/D03-loop-07e98c6b.opus",
    "mp3": "assets/music/songs/D03-loop-76c2ae42.mp3",
    "loop": 36.942208,
    "margin": 0.25,
    "lufs": -14.6,
    "bytes": {
     "opus": 411061,
     "mp3": 525188
    },
    "bars": 16,
    "seamDb": {
     "opus": -20.9,
     "mp3": -21.2
    },
    "from": "68.847-105.789 s"
   },
   "full": {
    "opus": "assets/music/songs/D03-full-11502b93.opus",
    "mp3": "assets/music/songs/D03-full-2e0eb5a8.mp3",
    "seconds": 134.4,
    "lufs": -15.3,
    "bytes": {
     "opus": 1433345,
     "mp3": 1882292
    },
    "ending": "own"
   }
  },
  "T01": {
   "cue": "18",
   "title": "Visiting Hours",
   "role": "alternate",
   "channels": 2,
   "bpm": 128.15,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T01-loop-7a6c0a4b.opus",
    "mp3": "assets/music/songs/T01-loop-84581b3c.mp3",
    "loop": 60.112021,
    "margin": 0.25,
    "lufs": -12.8,
    "bytes": {
     "opus": 690012,
     "mp3": 849428
    },
    "bars": 32,
    "seamDb": {
     "opus": -21.1,
     "mp3": -27.0
    },
    "from": "22.570-82.682 s"
   },
   "full": {
    "opus": "assets/music/songs/T01-full-8c2c0558.opus",
    "mp3": "assets/music/songs/T01-full-0b1ca22d.mp3",
    "seconds": 83.622,
    "lufs": -13.3,
    "bytes": {
     "opus": 943460,
     "mp3": 1171652
    },
    "ending": "new, at 82.686 s"
   }
  },
  "T02": {
   "cue": "04",
   "title": "Clockwork Kitty",
   "role": "primary",
   "channels": 2,
   "bpm": 135.28,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T02-loop-38752f08.opus",
    "mp3": "assets/music/songs/T02-loop-5b6bb94a.mp3",
    "loop": 28.462458,
    "margin": 0.25,
    "lufs": -11.8,
    "bytes": {
     "opus": 320156,
     "mp3": 406244
    },
    "bars": 16,
    "seamDb": {
     "opus": -18.7,
     "mp3": -22.3
    },
    "from": "137.207-165.669 s"
   },
   "full": {
    "opus": "assets/music/songs/T02-full-088975b2.opus",
    "mp3": "assets/music/songs/T02-full-c6889557.mp3",
    "seconds": 187.924,
    "lufs": -12.9,
    "bytes": {
     "opus": 2138469,
     "mp3": 2631908
    },
    "ending": "new, at 187.037 s"
   }
  },
  "T03": {
   "cue": "01",
   "title": "Sunburnt Tape",
   "role": "primary",
   "channels": 1,
   "bpm": 96.53,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T03-loop-6f2d701e.opus",
    "mp3": "assets/music/songs/T03-loop-c3dec348.mp3",
    "loop": 39.680167,
    "margin": 0.25,
    "lufs": -17.6,
    "bytes": {
     "opus": 269934,
     "mp3": 402500
    },
    "bars": 16,
    "seamDb": {
     "opus": -20.4,
     "mp3": -26.8
    },
    "from": "40.867-80.547 s"
   },
   "full": {
    "opus": "assets/music/songs/T03-full-ad6e68d5.opus",
    "mp3": "assets/music/songs/T03-full-7aee7bb2.mp3",
    "seconds": 81.793,
    "lufs": -17.0,
    "bytes": {
     "opus": 565444,
     "mp3": 818660
    },
    "ending": "new, at 80.550 s"
   }
  },
  "T04": {
   "cue": "01",
   "title": "Sunburnt Tape",
   "role": "alternate",
   "channels": 1,
   "bpm": 98.65,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T04-loop-f156ebef.opus",
    "mp3": "assets/music/songs/T04-loop-e8565bf3.mp3",
    "loop": 39.060625,
    "margin": 0.25,
    "lufs": -16.6,
    "bytes": {
     "opus": 312366,
     "mp3": 396260
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.1,
     "mp3": -26.8
    },
    "from": "121.440-160.501 s"
   },
   "full": {
    "opus": "assets/music/songs/T04-full-6845fbfc.opus",
    "mp3": "assets/music/songs/T04-full-6a198dbf.mp3",
    "seconds": 177.24,
    "lufs": -16.9,
    "bytes": {
     "opus": 1340098,
     "mp3": 1772900
    },
    "ending": "own"
   }
  },
  "T05": {
   "cue": "03",
   "title": "Waiting Room Disco",
   "role": "primary",
   "channels": 1,
   "bpm": 112.18,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T05-loop-6f673c50.opus",
    "mp3": "assets/music/songs/T05-loop-26439896.mp3",
    "loop": 34.273688,
    "margin": 0.25,
    "lufs": -17.6,
    "bytes": {
     "opus": 233240,
     "mp3": 348260
    },
    "bars": 16,
    "seamDb": {
     "opus": -20.6,
     "mp3": -30.9
    },
    "from": "70.171-104.445 s"
   },
   "full": {
    "opus": "assets/music/songs/T05-full-80954529.opus",
    "mp3": "assets/music/songs/T05-full-518e4db2.mp3",
    "seconds": 131.218,
    "lufs": -17.8,
    "bytes": {
     "opus": 878488,
     "mp3": 1312820
    },
    "ending": "new, at 130.148 s"
   }
  },
  "T06": {
   "cue": "03",
   "title": "Waiting Room Disco",
   "role": "alternate",
   "channels": 2,
   "bpm": 112.05,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T06-loop-f549153a.opus",
    "mp3": "assets/music/songs/T06-loop-a669cc01.mp3",
    "loop": 34.296312,
    "margin": 0.25,
    "lufs": -13.4,
    "bytes": {
     "opus": 375480,
     "mp3": 487892
    },
    "bars": 16,
    "seamDb": {
     "opus": -23.5,
     "mp3": -25.1
    },
    "from": "69.590-103.886 s"
   },
   "full": {
    "opus": "assets/music/songs/T06-full-a73b32c7.opus",
    "mp3": "assets/music/songs/T06-full-0677d3cf.mp3",
    "seconds": 147.821,
    "lufs": -13.7,
    "bytes": {
     "opus": 1590057,
     "mp3": 2070452
    },
    "ending": "new, at 146.750 s"
   }
  },
  "T07": {
   "cue": "10",
   "title": "Double Scoop",
   "role": "alternate",
   "channels": 1,
   "bpm": 63.36,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T07-loop-cc112e44.opus",
    "mp3": "assets/music/songs/T07-loop-24370a3e.mp3",
    "loop": 60.486229,
    "margin": 0.25,
    "lufs": -18.0,
    "bytes": {
     "opus": 463853,
     "mp3": 610580
    },
    "bars": 16,
    "seamDb": {
     "opus": -21.2,
     "mp3": -35.6
    },
    "from": "60.558-121.044 s"
   },
   "full": {
    "opus": "assets/music/songs/T07-full-223817cc.opus",
    "mp3": "assets/music/songs/T07-full-ef85a92a.mp3",
    "seconds": 167.28,
    "lufs": -18.3,
    "bytes": {
     "opus": 1242389,
     "mp3": 1673300
    },
    "ending": "own"
   }
  },
  "T08": {
   "cue": "10",
   "title": "Double Scoop",
   "role": "primary",
   "channels": 1,
   "bpm": 63.39,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T08-loop-7d573f4f.opus",
    "mp3": "assets/music/songs/T08-loop-b8768b55.mp3",
    "loop": 60.492458,
    "margin": 0.25,
    "lufs": -17.7,
    "bytes": {
     "opus": 423801,
     "mp3": 610580
    },
    "bars": 16,
    "seamDb": {
     "opus": -24.0,
     "mp3": -39.2
    },
    "from": "52.918-113.410 s"
   },
   "full": {
    "opus": "assets/music/songs/T08-full-fa8f5f9b.opus",
    "mp3": "assets/music/songs/T08-full-d8ced559.mp3",
    "seconds": 160.648,
    "lufs": -17.7,
    "bytes": {
     "opus": 1115831,
     "mp3": 1607060
    },
    "ending": "new, at 158.755 s"
   }
  },
  "T10": {
   "cue": "08",
   "title": "Jester's Parade",
   "role": "alternate",
   "channels": 2,
   "bpm": 162.3,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T10-loop-9495702c.opus",
    "mp3": "assets/music/songs/T10-loop-a2061723.mp3",
    "loop": 35.482813,
    "margin": 0.25,
    "lufs": -14.0,
    "bytes": {
     "opus": 425575,
     "mp3": 504692
    },
    "bars": 24,
    "seamDb": {
     "opus": -18.6,
     "mp3": -17.8
    },
    "from": "35.225-70.708 s"
   },
   "full": {
    "opus": "assets/music/songs/T10-full-401faa7f.opus",
    "mp3": "assets/music/songs/T10-full-bf078cc4.mp3",
    "seconds": 126.24,
    "lufs": -14.4,
    "bytes": {
     "opus": 1489876,
     "mp3": 1768052
    },
    "ending": "own"
   }
  },
  "T11": {
   "cue": "08",
   "title": "Jester's Parade",
   "role": "alternate",
   "channels": 2,
   "bpm": 163.45,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T11-loop-822c6332.opus",
    "mp3": "assets/music/songs/T11-loop-25231608.mp3",
    "loop": 23.448833,
    "margin": 0.25,
    "lufs": -13.1,
    "bytes": {
     "opus": 275738,
     "mp3": 336020
    },
    "bars": 16,
    "seamDb": {
     "opus": -17.3,
     "mp3": -20.8
    },
    "from": "40.844-64.293 s"
   },
   "full": {
    "opus": "assets/music/songs/T11-full-49637193.opus",
    "mp3": "assets/music/songs/T11-full-576e636c.mp3",
    "seconds": 124.72,
    "lufs": -13.1,
    "bytes": {
     "opus": 1442853,
     "mp3": 1746884
    },
    "ending": "own"
   }
  },
  "T12": {
   "cue": "17",
   "title": "Aisle Bossa",
   "role": "primary",
   "channels": 2,
   "bpm": 66.07,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T12-loop-a4c5fee8.opus",
    "mp3": "assets/music/songs/T12-loop-bd6b145a.mp3",
    "loop": 29.077,
    "margin": 0.25,
    "lufs": -14.1,
    "bytes": {
     "opus": 272450,
     "mp3": 414980
    },
    "bars": 8,
    "seamDb": {
     "opus": -23.6,
     "mp3": -32.0
    },
    "from": "29.536-58.613 s"
   },
   "full": {
    "opus": "assets/music/songs/T12-full-5d7459bc.opus",
    "mp3": "assets/music/songs/T12-full-2fee6308.mp3",
    "seconds": 71.36,
    "lufs": -14.6,
    "bytes": {
     "opus": 663830,
     "mp3": 999956
    },
    "ending": "own"
   }
  },
  "T16": {
   "cue": "22",
   "title": "Mirrorball Traffic",
   "role": "alternate",
   "channels": 2,
   "bpm": 119.84,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T16-loop-a89c1213.opus",
    "mp3": "assets/music/songs/T16-loop-5c220e2a.mp3",
    "loop": 32.025958,
    "margin": 0.25,
    "lufs": -15.0,
    "bytes": {
     "opus": 370599,
     "mp3": 456308
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.8,
     "mp3": -25.3
    },
    "from": "26.006-58.032 s"
   },
   "full": {
    "opus": "assets/music/songs/T16-full-373b4a8d.opus",
    "mp3": "assets/music/songs/T16-full-731f6c60.mp3",
    "seconds": 129.8,
    "lufs": -15.2,
    "bytes": {
     "opus": 1492438,
     "mp3": 1818116
    },
    "ending": "own"
   }
  },
  "T17": {
   "cue": "22",
   "title": "Mirrorball Traffic",
   "role": "primary",
   "channels": 2,
   "bpm": 119.88,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T17-loop-e9147d03.opus",
    "mp3": "assets/music/songs/T17-loop-81589a7b.mp3",
    "loop": 32.002979,
    "margin": 0.25,
    "lufs": -13.7,
    "bytes": {
     "opus": 359376,
     "mp3": 455972
    },
    "bars": 16,
    "seamDb": {
     "opus": -18.9,
     "mp3": -19.2
    },
    "from": "71.517-103.520 s"
   },
   "full": {
    "opus": "assets/music/songs/T17-full-7ab6b220.opus",
    "mp3": "assets/music/songs/T17-full-40fe5c7f.mp3",
    "seconds": 129.12,
    "lufs": -14.1,
    "bytes": {
     "opus": 1426893,
     "mp3": 1808372
    },
    "ending": "own"
   }
  },
  "T20": {
   "cue": "18",
   "title": "Visiting Hours",
   "role": "alternate",
   "channels": 2,
   "bpm": 107.3,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T20-loop-c8b6e7bc.opus",
    "mp3": "assets/music/songs/T20-loop-6b8d2adc.mp3",
    "loop": 35.831792,
    "margin": 0.25,
    "lufs": -13.5,
    "bytes": {
     "opus": 357278,
     "mp3": 509396
    },
    "bars": 16,
    "seamDb": {
     "opus": -18.1,
     "mp3": -27.6
    },
    "from": "11.169-47.001 s"
   },
   "full": {
    "opus": "assets/music/songs/T20-full-4f3f16f5.opus",
    "mp3": "assets/music/songs/T20-full-5bce6b13.mp3",
    "seconds": 48.115,
    "lufs": -13.7,
    "bytes": {
     "opus": 468190,
     "mp3": 674372
    },
    "ending": "new, at 46.997 s"
   }
  },
  "T22": {
   "cue": "21",
   "title": "Neon Current",
   "role": "primary",
   "channels": 2,
   "bpm": 129.69,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T22-loop-bca87758.opus",
    "mp3": "assets/music/songs/T22-loop-9283001b.mp3",
    "loop": 29.541958,
    "margin": 0.25,
    "lufs": -13.4,
    "bytes": {
     "opus": 325941,
     "mp3": 421364
    },
    "bars": 16,
    "seamDb": {
     "opus": -15.4,
     "mp3": -14.4
    },
    "from": "66.432-95.974 s"
   },
   "full": {
    "opus": "assets/music/songs/T22-full-feefe96d.opus",
    "mp3": "assets/music/songs/T22-full-47683dcd.mp3",
    "seconds": 162.2,
    "lufs": -14.2,
    "bytes": {
     "opus": 1752610,
     "mp3": 2271716
    },
    "ending": "own"
   }
  },
  "T24": {
   "cue": "21",
   "title": "Neon Current",
   "role": "alternate",
   "channels": 1,
   "bpm": 150.75,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T24-loop-173fcb37.opus",
    "mp3": "assets/music/songs/T24-loop-9ae39151.mp3",
    "loop": 51.197271,
    "margin": 0.25,
    "lufs": -15.9,
    "bytes": {
     "opus": 472917,
     "mp3": 517700
    },
    "bars": 32,
    "seamDb": {
     "opus": -20.5,
     "mp3": -27.6
    },
    "from": "9.567-60.764 s"
   },
   "full": {
    "opus": "assets/music/songs/T24-full-da14b746.opus",
    "mp3": "assets/music/songs/T24-full-880ec939.mp3",
    "seconds": 67.971,
    "lufs": -16.0,
    "bytes": {
     "opus": 618230,
     "mp3": 680420
    },
    "ending": "new, at 67.175 s"
   }
  },
  "T25": {
   "cue": "21",
   "title": "Neon Current",
   "role": "alternate",
   "channels": 1,
   "bpm": 150.78,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T25-loop-1d194683.opus",
    "mp3": "assets/music/songs/T25-loop-fecdaecc.mp3",
    "loop": 25.592437,
    "margin": 0.25,
    "lufs": -18.7,
    "bytes": {
     "opus": 250543,
     "mp3": 261620
    },
    "bars": 16,
    "seamDb": {
     "opus": -15.5,
     "mp3": -14.6
    },
    "from": "15.952-41.544 s"
   },
   "full": {
    "opus": "assets/music/songs/T25-full-72081e04.opus",
    "mp3": "assets/music/songs/T25-full-ca31c5a9.mp3",
    "seconds": 66.346,
    "lufs": -16.9,
    "bytes": {
     "opus": 590756,
     "mp3": 664100
    },
    "ending": "new, at 65.550 s"
   }
  },
  "T26": {
   "cue": "21",
   "title": "Neon Current",
   "role": "alternate",
   "channels": 1,
   "bpm": 150.75,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T26-loop-181946f1.opus",
    "mp3": "assets/music/songs/T26-loop-ff0e6cfd.mp3",
    "loop": 25.590833,
    "margin": 0.25,
    "lufs": -17.0,
    "bytes": {
     "opus": 245955,
     "mp3": 261620
    },
    "bars": 16,
    "seamDb": {
     "opus": -19.1,
     "mp3": -22.2
    },
    "from": "15.952-41.543 s"
   },
   "full": {
    "opus": "assets/music/songs/T26-full-7a16b98d.opus",
    "mp3": "assets/music/songs/T26-full-e6dc3835.mp3",
    "seconds": 67.948,
    "lufs": -17.2,
    "bytes": {
     "opus": 615192,
     "mp3": 680180
    },
    "ending": "new, at 67.152 s"
   }
  },
  "T27": {
   "cue": "17",
   "title": "Aisle Bossa",
   "role": "alternate",
   "channels": 2,
   "bpm": 119.87,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T27-loop-40531e21.opus",
    "mp3": "assets/music/songs/T27-loop-8cf0b839.mp3",
    "loop": 32.000021,
    "margin": 0.25,
    "lufs": -15.3,
    "bytes": {
     "opus": 360463,
     "mp3": 455972
    },
    "bars": 16,
    "seamDb": {
     "opus": -21.0,
     "mp3": -24.0
    },
    "from": "46.092-78.092 s"
   },
   "full": {
    "opus": "assets/music/songs/T27-full-f6ce1bdc.opus",
    "mp3": "assets/music/songs/T27-full-b4f8d5e5.mp3",
    "seconds": 93.36,
    "lufs": -16.2,
    "bytes": {
     "opus": 1027279,
     "mp3": 1307732
    },
    "ending": "own"
   }
  },
  "T28": {
   "cue": "18",
   "title": "Visiting Hours",
   "role": "alternate",
   "channels": 2,
   "bpm": 119.98,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T28-loop-394403ac.opus",
    "mp3": "assets/music/songs/T28-loop-d6683bea.mp3",
    "loop": 32.0,
    "margin": 0.25,
    "lufs": -16.0,
    "bytes": {
     "opus": 325889,
     "mp3": 455972
    },
    "bars": 16,
    "seamDb": {
     "opus": -21.5,
     "mp3": -20.4
    },
    "from": "42.725-74.725 s"
   },
   "full": {
    "opus": "assets/music/songs/T28-full-87110648.opus",
    "mp3": "assets/music/songs/T28-full-e4f8d326.mp3",
    "seconds": 115.707,
    "lufs": -16.0,
    "bytes": {
     "opus": 1201276,
     "mp3": 1620884
    },
    "ending": "new, at 114.707 s"
   }
  },
  "T29": {
   "cue": "18",
   "title": "Visiting Hours",
   "role": "primary",
   "channels": 2,
   "bpm": 128.92,
   "approved": "2026-11-22",
   "loop": {
    "opus": "assets/music/songs/T29-loop-31e25150.opus",
    "mp3": "assets/music/songs/T29-loop-a9ddf333.mp3",
    "loop": 29.856979,
    "margin": 0.25,
    "lufs": -12.2,
    "bytes": {
     "opus": 324186,
     "mp3": 425732
    },
    "bars": 16,
    "seamDb": {
     "opus": -22.4,
     "mp3": -27.8
    },
    "from": "24.265-54.122 s"
   },
   "full": {
    "opus": "assets/music/songs/T29-full-80bd1162.opus",
    "mp3": "assets/music/songs/T29-full-a73a8af7.mp3",
    "seconds": 55.057,
    "lufs": -12.8,
    "bytes": {
     "opus": 589012,
     "mp3": 771812
    },
    "ending": "new, at 54.126 s"
   }
  }
 }
};
