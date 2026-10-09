// The game's sound (client/audio.js loads this once the first tap or key has woken the audio): the mixer, the
// engine and its voices, the vehicles, the ambience, the places' music and bells, people, and the table of what
// each server event sounds like. main.js calls in through audio.js: sfx (its own old names), soundEvent (every
// server event), soundFrame (each frame the world is drawn).
import { createMixer } from './mixer.js';
import { SoundEngine } from './engine.js';
import { INSTR, LEGACY } from './instruments.js';
import { EVENT_SOUNDS } from './events.js';
import { VehicleSounds } from './vehicles.js';
import { Ambience } from './ambience.js';
import { Music } from './music.js';
import { Places } from './places.js';
import { People } from './people.js';
import { surfaceAt } from './surface.js';

export function createSound(ctx, prefs, { mobile = false } = {}) {
  const mix = createMixer(ctx, prefs);
  const E = new SoundEngine(ctx, mix, { voices: mobile ? 14 : 26 });
  const veh = new VehicleSounds(E, { voices: mobile ? 3 : 6 });
  const amb = new Ambience(E);
  const music = new Music(E);
  const places = new Places(E, music);
  const people = new People(E);
  const titleEl = document.getElementById('title');
  let S = null, quiet = false, scene = 'title', lastFrame = 0, inside = false, lastT = ctx.currentTime;
  const unquiet = () => { quiet = false; };
  const A = {
    S: null,
    at: (n, x, y, v, p) => E.play(n, x, y, v, p),
    ui: (n, v, p) => E.play(n, undefined, undefined, v, p),
    mute: (n, s) => E.mute(n, s),
    surf: (x, y) => (A.S && A.S.map ? surfaceAt(A.S.map, x, y) : 'pavement'),
  };
  const sys = {
    E, mix, veh, amb, music, places, people,
    get scene() { return scene; },
    // main.js's own sfx(name, vol) calls: their old names, no place (vol already has the distance in it)
    legacy(name, vol) {
      if (quiet || E.isMuted(name)) return;
      const n = name in LEGACY ? LEGACY[name] : name;
      if (n && INSTR[n]) E.play(n, undefined, undefined, vol);
    },
    // a server event: its sound, placed where it happened; main.js's own sfx calls while it handles the event stay
    // quiet (they'd be the same sound again, with no place). False for a kind the table doesn't know (those play).
    event(ev, state) {
      S = state; A.S = state;
      if (!ev || !Object.prototype.hasOwnProperty.call(EVENT_SOUNDS, ev.e)) return false;
      const fn = EVENT_SOUNDS[ev.e];
      if (fn && state && state.map) { try { fn(ev, A); } catch (e) { console.warn('[sound] event', ev.e, e); } }
      if (!quiet) { quiet = true; queueMicrotask(unquiet); }
      return true;
    },
    // each frame the world is drawn (main.js tickVisuals): the listener, the vehicles, the ambience, people, places
    frame(F, state) {
      S = state; A.S = state;
      const t = ctx.currentTime, dt = Math.min(0.1, Math.max(0.001, t - lastT));
      lastT = t; lastFrame = performance.now();
      if (!F || !state.map) return;
      E.update(F.sp && F.spec ? F.sp : state.cam, inside);
      if (scene === 'title') { veh.silence(); amb.silence(); return; }
      inside = places.update(F, state, t, scene);
      veh.update(F, state, dt);
      amb.update(F, state, dt, inside);
      people.update(F, state, dt);
      music.tick();
    },
    // a few times a second whatever the frame does: the scene (the title screen has its music), the music's notes
    pulse() {
      const title = !!(titleEl && !titleEl.classList.contains('hidden'));
      const was = scene;
      scene = title ? 'title' : 'game';
      music.set('title', title && !document.hidden ? 0.55 : 0);
      if (scene !== was && scene === 'game') music.set('title', 0);
      if (document.hidden) music.silence();
      if (performance.now() - lastFrame > 600) { veh.silence(); amb.silence(); places.music.set('club', 0); places.music.set('shop', 0); places.music.set('lobby', 0); }
      music.tick();
      E.update(null, inside);
    },
    setPrefs(p) { mix.apply(p); },
  };
  setInterval(() => { try { sys.pulse(); } catch (e) { console.warn('[sound]', e); } }, 90);
  return sys;
}
