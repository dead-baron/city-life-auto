import { closure } from '../tools/perf.mjs';
import { readFileSync } from 'node:fs'; import { gzipSync } from 'node:zlib';
const f = closure(['client/boot.js', 'client/main.js']); let gz = 0; for (const x of f) gz += gzipSync(readFileSync(x), { level: 6 }).length;
console.log((gz / 1024).toFixed(3));
