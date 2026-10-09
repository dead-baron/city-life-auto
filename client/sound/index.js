// The game's sound (client/audio.js loads this once the first tap or key has woken the audio): the mixer, the
// engine and its voices, the vehicles, the ambience, the places' music and bells, people, and the table of what
// each server event sounds like. main.js calls in through audio.js: sfx (its own old names), soundEvent (every
// server event), soundFrame (each frame the world is drawn).
import { createMixer } from './mixer.js';
import { SoundEngine } from './engine.js';
import { INSTR, LEGACY } from './instruments.js';
import { EVENT_SOUNDS, meleeSwing } from './events.js';
import { WEAPONS } from '../../shared/items.js';
import { VehicleSounds } from './vehicles.js';
import { Ambience } from './ambience.js';
import { Music } from './music.js';
import { Places } from './places.js';
import { People } from './people.js';
import { surfaceAt } from './surface.js';

// How many one-shot voices and engine voices: few enough for a phone's audio thread (tools/sound/bench.py).
export const VOICES = Object.freeze({ phone: 12, computer: 22, enginesPhone: 2, enginesComputer: 4 });

export function createSound(ctx, prefs, { mobile = false, timer = true } = {}) {
  const mix = createMixer(ctx, prefs);
  const E = new SoundEngine(ctx, mix, { voices: mobile ? VOICES.phone : VOICES.computer });
  const veh = new VehicleSounds(E, { voices: mobile ? VOICES.enginesPhone : VOICES.enginesComputer });
  const amb = new Ambience(E);
  const music = new Music(E);
  const places = new Places(E, music);
  const people = new People(E);
  const titleEl = document.getElementById('title'), tutEl = document.getElementById('tutorial');
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
      let n = name in LEGACY ? LEGACY[name] : name;
      if (name === 'swing' && S && S.me) n = meleeSwing(WEAPONS[S.me.weapon]);   // (your own swing, the moment you press: by what's in your hand)
      if (n && INSTR[n]) E.play(n, undefined, undefined, vol);
    },
    // a server event: its sound, placed where it happened. main.js's own sfx calls while it handles the event stay
    // quiet (they'd be the same sound again, with no place) - but only if the event's sound really started (or was
    // too far off to hear): one dropped for want of a voice or by a rate limit lets the old sound play instead, so
    // nothing is ever simply lost. False for a kind the table doesn't know (those play).
    event(ev, state) {
      S = state; A.S = state;
      quiet = false;
      if (!ev || !Object.prototype.hasOwnProperty.call(EVENT_SOUNDS, ev.e)) return false;
      const fn = EVENT_SOUNDS[ev.e];
      const st = E.stats, p0 = st.played, f0 = st.far, d0 = st.pool + st.gap + st.budget;
      if (fn && state && state.map) { try { fn(ev, A); } catch (e) { console.warn('[sound] event', ev.e, e); } }
      if (eventHeard(fn, st.played - p0, st.far - f0, st.pool + st.gap + st.budget - d0)) { quiet = true; queueMicrotask(unquiet); }
      return true;
    },
    // each frame the world is drawn (main.js tickVisuals): the listener, the vehicles, the ambience, people, places
    frame(F, state) {
      S = state; A.S = state;
      const t = ctx.currentTime, dt = Math.min(0.1, Math.max(0.001, t - lastT));
      lastT = t; lastFrame = performance.now();
      if (!F || !state.map) return;
      E.update(F.sp && F.spec ? F.sp : state.cam, inside);
      const me = state.ents && state.ents.get(state.myPedId);   // (where you are: your own sounds are never cut off)
      if (me && me.rx !== undefined) { E.me.x = me.rx; E.me.y = me.ry; E.me.live = true; } else E.me.live = false;
      if (scene === 'title') { veh.silence(); amb.silence(); return; }
      inside = places.update(F, state, t, scene);
      veh.update(F, state, dt);
      amb.update(F, state, dt, inside);
      people.update(F, state, dt);
      music.tick();
    },
    // a few times a second whatever the frame does: the scene (the title screen has its music), the music's notes
    pulse() {
      const title = !!(titleEl && !titleEl.classList.contains('hidden')) || !!(tutEl && !tutEl.classList.contains('hidden'));   // (the title screen, the city tour)
      const was = scene;
      scene = title ? 'title' : 'game';
      music.set('title', title && !document.hidden ? 0.7 : 0);
      if (scene !== was && scene === 'game') music.set('title', 0);
      if (document.hidden) music.silence();
      if (performance.now() - lastFrame > 2000) { veh.silence(); amb.silence(); places.music.set('club', 0); places.music.set('shop', 0); places.music.set('lobby', 0); }
      music.tick();
      E.update(null, inside);
    },
    setPrefs(p) { mix.apply(p); },
    // for the debug menu: the voices in use, the engines, the beds, and what became of the sounds asked for
    status() {
      const t = ctx.currentTime;
      return { state: ctx.state, voices: E.pool.active(t) + '/' + E.pool.max, engines: veh.voices.filter((v) => v.veh).length + '/' + veh.voices.length, beds: amb.heard(), ...E.stats };
    },
  };
  if (timer) setInterval(() => { try { sys.pulse(); } catch (e) { console.warn('[sound]', e); } }, 90);
  return sys;
}

// Was an event heard (pure: test/sound.test.js)? fn: its table entry (null: nothing to hear, its data only); played:
// how many of its sounds started; far: how many were too far off to hear; dropped: how many found no voice or were
// rate-limited. Heard (so main.js's old sfx for it stays quiet) if anything started, if there was nothing to play, or
// if it was simply out of earshot; not heard if something was dropped and nothing played - then the old sound plays
// in its place.
export function eventHeard(fn, played, far, dropped) {
  if (!fn || played > 0) return true;
  return dropped === 0;
}
