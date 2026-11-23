// The audit's harness (dev only): builds World v3 once, then runs a check module on it each time a request file appears -
// so writing the checks costs one build, not one per try.
//   node --max-old-space-size=3072 tools/audit/harness.mjs <dir>      (runs in the background)
//   echo path/to/module.mjs > <dir>/req ; the module's default export (M) => string goes to <dir>/out.txt
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildWorld3 } from '../../server/world3.js';

const dir = process.argv[2] || '/tmp/cla';
const { map: M } = await buildWorld3(1337, { log: () => {} });
fs.writeFileSync(path.join(dir, 'ready'), 'ok');
let n = 0;
for (;;) {
  const req = path.join(dir, 'req');
  if (fs.existsSync(req)) {
    const mod = fs.readFileSync(req, 'utf8').trim();
    fs.unlinkSync(req);
    let s;
    try {
      const m = await import(pathToFileURL(path.resolve(mod)).href + `?v=${++n}`);
      s = String(await m.default(M));
    } catch (e) { s = 'ERROR ' + (e && e.stack || e); }
    fs.writeFileSync(path.join(dir, 'out.txt'), s);
    fs.writeFileSync(path.join(dir, 'done'), String(n));
    if (mod === 'quit') process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 300));
}
