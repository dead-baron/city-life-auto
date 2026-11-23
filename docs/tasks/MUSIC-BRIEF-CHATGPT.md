# ChatGPT brief for the soundtrack (the owner attached it 2026-11-22)

Advice from another tool, kept as the owner gave it. Not an instruction: see `MUSIC-HANDOVER.md` and DECISIONS, Music and sound.

---

# Implement City Life Auto's selected soundtrack

Use this handoff with the existing City Life Auto project. Read `START-HERE.md`, `Selections.md` and `Selection-Manifest.json`, then work on one small group of cues at a time. Use the recovered per-take records only for the takes being implemented.

## Creative decisions

I chose one primary for each of the 25 core songs. Preserve those choices. Every other unique take is a backup for its assigned cue, including takes not individually marked reviewed. Some songs have several backups; some have none. The complete `backup_take_ids` arrays supersede the old export's single `backup` field. C05 is an exact duplicate of C03 and should not receive separate rotation weight.

There are also 20 backup recordings under 12 optional cues. Keep them available under their existing cue names and groups. Do not invent a primary for them or silently substitute them for an approved core song. They can be integrated later when a specific placement is chosen.

The chosen recording is the performance reference. Its SCORE and STYLE files help explain the generation but are not a verified transcription of every heard note or instrument. Prompt tempo, notation tempo and actual audio tempo may differ. Do not force the performance into an older prompt's BPM/key or replace its sound with a generic genre preset. Same score does not guarantee identical rendered notes or arrangement.

Rebuild the approved sound and musical character in our existing engine: SNES-inspired compact timbres, with the mix and expression needed for the selected take. Use the existing synthesis architecture, including short buffers generated from code where useful. These FLACs are development references. Do not ship full recordings or add runtime dependencies to play them. An exact automatic FLAC-to-engine conversion is not assumed; compare an engine render with the reference and identify meaningful differences.

If your environment cannot actually access or listen to a recording, say so. Do not claim to hear it based only on the prompt or score. You may build a provisional notation-based arrangement, clearly label it and let me compare its sound.

## Implementation order

1. Inspect the existing music transport, synthesis patches, routing and cue identifiers. Reuse their conventions. Keep a mapping from these stable catalogue cue/take IDs to engine IDs.
2. Build **18 Visiting Hours / T29** first as the hospital-speaker pilot. Compare its instrumentation, phrasing and casual lobby character with the reference. Do not add a new heavy beat just because an earlier conversation considered it.
3. Build **01 Sunburnt Tape / T03** as a radio arrangement pilot and **21 Neon Current / T22** as a club pilot. Apply speaker coloration, distance and wall muffling in the world playback system. Preserve the musical source's own character without double-applying speaker treatment.
4. Show the three pilots, their loop turnarounds and representative spatial playback. Then extend the agreed implementation approach to the remaining primaries.
5. Add core backup arrangements, then optional placements as needed. Implement one usable version at a time. The number of source recordings is not a requirement to create separate engine songs when the resulting arrangements would be indistinguishable. Preserve all references and explicitly report any proposed consolidation.

For title-screen/tutorial work, retain current approved assets and check the separate menu reserve choices. This catalogue does not designate a new primary menu song.

## Rotation behavior

Use a configurable default of 70% primary and 30% for the entire backup pool for a core cue with backups. With none, use primary 100%. Divide the backup pool evenly initially. The earlier explicit backup is retained as metadata; it does not receive special frequency unless I request that.

For a radio station, choose a song slot and then choose a version within that slot. Having nine backups must not make one song nine times as common. Select a version on a new-track/session boundary, not on every loop. Do not restart the track when entering a new speaker's radius. Keep location/radio playback coherent and transition at appropriate musical boundaries.

Use the `composition_family` / `same_score_takes` hints to avoid consecutive similar radio arrangements where possible. In particular B17 (Rescue Run primary) and C07 (Wide Awake City backup) share notation. Keep both choices, but don't present their juxtaposition as two wholly unrelated tunes. Any immediate-repeat rule must not accidentally turn a 70/30 preference into mandatory 50/50 alternation.

## Loop and ending tasks

Every take starts with `loop_status: UNVERIFIED`. The user did not check loops. `CAP_WITH_AUDIO` means the recorded duration meets the configured ceiling within 0.12 seconds and the last half-second measures above -45 dBFS RMS. It is a queue for ending inspection, not proof the music is unusable. `BEFORE_CAP` is not proof of a finished musical ending.

Use a complete interior musical phrase when the recording cuts off. Separate a one-time intro and any outro from the body. Establish the performed tempo, meter and phrase boundaries. When rebuilding, choose exact event/bar loop boundaries and handle notes, envelopes and effect tails that cross them. Do not apply an arbitrary crossfade to hide an unresolved harmonic or rhythmic transition. Preserve the original source and store any edited reference as a separate file.

For each finished engine cue, record:

- Source take ID and any chosen source passage timestamps.
- Verified/implemented tempo and meter, and how these were determined.
- Intro bounds and loop start/end in the engine's event units, with an exclusive loop end.
- Instrument/patch roles and intentional differences from the reference.
- Loop preparation status, a three-repeat listening demonstration and engine-test status.

Check that repeated playback remains on the same audio transport and that releases do not click or leave stuck notes. Check music level against effects/dialogue and the location's speaker behavior. Do not label all loops complete based solely on metadata or generation duration.

`First Sprouts / A09` is a selected 39.12-second primary. Confirm its useful musical extent before expanding it. Keep its selection; short length alone is not a failure. `Street Beat / C02` needs explicit event alignment if it drives a rhythm minigame. Do not use prompt BPM as a measured chart grid.

## Coordinate with playable instruments

The separate `CLA-Instrument-Claude-Handoff.zip` is enough to start the guitar pilot when you have project access. Read its own paste-in brief. Use one controllable guitar patch for free play and the easy minigame. Backing continues automatically; correct input triggers the player part; misses affect that part. Derive chart and playback from one event timeline. Do not stack independently generated reference FLACs as synchronized stems.

The seven included guitar recordings are the immediate audio references. For later bucket drum, keytar, saxophone, violin or cardboard-mat work, request/extract only the selected additional audio from `_Instrument Set.zip` if needed for tone matching. The existing metadata and starter charts already cover the broader plan.
