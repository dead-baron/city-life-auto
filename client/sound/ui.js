// The Sound section of the Settings screen: sound on or off, music on or off, and the volumes (master, effects,
// ambience, music). Saved with the other settings (client/input.js 'cla.settings', under `sound`).
import { soundPrefs, setSoundPref } from './mixer.js';

const ROWS = [
  ['on', 'Sound', 'check'],
  ['music', 'Music (the title screen, the clubs, the shops)', 'check'],
  ['master', 'Master volume', 'range'],
  ['sfx', 'Effects', 'range'],
  ['amb', 'Ambience (the city, nature, the weather)', 'range'],
  ['mus', 'Music volume', 'range'],
];

export function buildSoundUi(el, settings, save, apply) {
  if (!el.dataset.built) {
    el.dataset.built = '1';
    el.classList.add('soundbox');
    el.innerHTML = '<div class="snd-h">SOUND</div>' + ROWS.map(([k, label, kind]) => (kind === 'check'
      ? `<label class="srow"><span>${label}</span><input type="checkbox" data-snd="${k}"></label>`
      : `<label class="srow snd-vol"><span>${label}</span><input type="range" min="0" max="100" step="5" data-snd="${k}"><b data-sndv="${k}"></b></label>`)).join('');
    for (const inp of el.querySelectorAll('[data-snd]')) {
      const k = inp.dataset.snd;
      const on = () => {
        const p = setSoundPref(settings, k, inp.type === 'checkbox' ? inp.checked : Number(inp.value) / 100, save);
        if (p) { apply(p); sync(el, p); }
      };
      inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', on);
    }
  }
  sync(el, soundPrefs(settings));
}
function sync(el, p) {
  for (const inp of el.querySelectorAll('[data-snd]')) {
    const k = inp.dataset.snd;
    if (inp.type === 'checkbox') inp.checked = !!p[k];
    else { inp.value = String(Math.round(p[k] * 100)); inp.disabled = !p.on || (k === 'mus' && !p.music); }
  }
  for (const b of el.querySelectorAll('[data-sndv]')) b.textContent = String(Math.round(p[b.dataset.sndv] * 100));
}
