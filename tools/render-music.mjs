#!/usr/bin/env node
// Render a studio song (client/sound/studio/songs/<id>.js) to a WAV for listening to drafts:
//   node tools/render-music.mjs <id> [out.wav]
// 16-bit stereo at the SNES's 32 kHz. Prints the length, where each section starts, the peak and the render time.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { renderSong } from '../client/sound/studio/render.js';

const id = process.argv[2];
if (!id) { console.error('usage: node tools/render-music.mjs <song id> [out.wav]'); process.exit(1); }
const file = id.endsWith('.js') ? path.resolve(id) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../client/sound/studio/songs', `${id}.js`);
const song = (await import(pathToFileURL(file).href)).default;
const out = process.argv[3] || `${path.basename(id, '.js')}.wav`;
const r = renderSong(song);

const n = r.L.length, data = Buffer.alloc(44 + n * 4);
data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8); data.write('fmt ', 12);
data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(r.sr, 24);
data.writeUInt32LE(r.sr * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r.L[i])) * 32767), 44 + i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r.R[i])) * 32767), 46 + i * 4);
}
writeFileSync(out, data);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
console.log(`${song.title || id}: ${mmss(r.seconds)} (${r.seconds.toFixed(1)} s), peak ${r.peak.toFixed(3)}, rendered in ${(r.ms / 1000).toFixed(1)} s -> ${out}`);
console.log('sections: ' + r.sections.map((s) => `${s.name}@${mmss(s.at)}`).join(' '));
console.log('parts (notes, dB while playing): ' + Object.entries(r.stats).map(([k, v]) => `${k} ${v} ${r.levels[k]}`).join(', '));
