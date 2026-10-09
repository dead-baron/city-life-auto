// The sound settings and the mixer (the owner's notes: "sound and music on or off, and the volumes").
// The settings live in the client's settings object (client/input.js: localStorage 'cla.settings'), under
// `sound`; everything here that doesn't touch WebAudio is pure, so test/sound.test.js can check it in node.
//
// The buses: effects, ambience and music each have a gain, all three run into the master, and the master
// runs through a gentle compressor (a pile-up of gunfire and an explosion shouldn't clip a phone's speaker)
// into the speakers. Effects also feed an echo (the SNES's famous echo buffer, short and darkened), which
// sounds in the open send a little of themselves into.
// (krate: a filter's parameters worked out once per block, not per sample - as engine.js's, kept here so the tests
// can import mixer.js without the engine.)
const krate = (n) => { for (const k of ['frequency', 'Q']) { const p = n[k]; if (p && p.automationRate === 'a-rate') { try { p.automationRate = 'k-rate'; } catch { /* not here */ } } } return n; };

export const SOUND_DEFAULTS = Object.freeze({ on: true, music: true, master: 0.8, sfx: 0.8, amb: 0.6, mus: 0.7 });
const KEYS = Object.keys(SOUND_DEFAULTS);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// The sound settings from the client settings: every key there, a wrong or missing value as its default.
export function soundPrefs(settings) {
  const s = settings && settings.sound && typeof settings.sound === 'object' ? settings.sound : {};
  const out = {};
  for (const k of KEYS) {
    const d = SOUND_DEFAULTS[k], v = s[k];
    out[k] = typeof d === 'boolean' ? (typeof v === 'boolean' ? v : d) : (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : d);
  }
  return out;
}

// Change one setting and save (save: client/input.js saveSettings). Returns the settings now, or null for a
// key that isn't one.
export function setSoundPref(settings, key, value, save) {
  if (!KEYS.includes(key)) return null;
  const p = soundPrefs(settings);
  p[key] = typeof SOUND_DEFAULTS[key] === 'boolean' ? !!value : clamp01(Number(value) || 0);
  settings.sound = p;
  if (save) save();
  return p;
}

// What each bus's gain is for the settings. A slider's position is squared (loudness feels even along it);
// sound off silences the master, music off the music bus.
export function busGains(p) {
  const sq = (v) => v * v;
  return { master: p.on ? sq(p.master) : 0, sfx: sq(p.sfx), amb: sq(p.amb), mus: p.music ? sq(p.mus) : 0 };
}

// The master's compressor: gentle, a safety net for a pile-up rather than a squash (the old one, threshold -16 dB,
// ratio 4, attack 4 ms, pumped the rain and the music down under every shot). A WebAudio compressor adds its own
// make-up gain, by the spec, from its settings (all three engines share the code): makeupDb is that gain, measured
// (tools/sound/bench.py), and a fixed gain after the compressor takes it back off, so turning the compressor gentler
// doesn't turn everything up.
export const COMP = Object.freeze({ threshold: -10, knee: 8, ratio: 2.5, attack: 0.01, release: 0.25, makeupDb: 2.2 });

// The bus graph on a running AudioContext.
export function createMixer(ctx, prefs) {
  const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = COMP.threshold; comp.knee.value = COMP.knee; comp.ratio.value = COMP.ratio; comp.attack.value = COMP.attack; comp.release.value = COMP.release;
  const post = gain(Math.pow(10, -COMP.makeupDb / 20), ctx.destination);
  comp.connect(post);
  const master = gain(0, comp);
  const sfx = gain(1, master), amb = gain(1, master), mus = gain(1, master);
  // the ambience is muffled when you're indoors (ambience.js sets it)
  const ambLp = krate(ctx.createBiquadFilter()); ambLp.type = 'lowpass'; ambLp.frequency.value = 18000; ambLp.Q.value = 0.5; ambLp.connect(amb);
  // the echo: a darkened feedback delay, its taps back into the effects bus
  const echo = gain(1), delay = ctx.createDelay(1), fb = gain(0.32), dark = krate(ctx.createBiquadFilter());
  delay.delayTime.value = 0.21; dark.type = 'lowpass'; dark.frequency.value = 2400;
  echo.connect(delay); delay.connect(dark); dark.connect(fb); fb.connect(delay);
  const echoOut = gain(0.5, sfx); dark.connect(echoOut);
  const mix = { ctx, master, comp, post, sfx, amb, ambIn: ambLp, ambLp, mus, echo, prefs: soundPrefs({ sound: prefs }) };
  mix.apply = (p) => {
    mix.prefs = soundPrefs({ sound: p });
    const g = busGains(mix.prefs), t = ctx.currentTime;
    master.gain.setTargetAtTime(g.master, t, 0.05);
    sfx.gain.setTargetAtTime(g.sfx, t, 0.05);
    amb.gain.setTargetAtTime(g.amb, t, 0.05);
    mus.gain.setTargetAtTime(g.mus, t, 0.05);
  };
  mix.apply(prefs);
  return mix;
}
