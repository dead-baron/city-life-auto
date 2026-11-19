// Puts docs/audit/REPORT.md together from its parts (docs/audit/parts/*.md) and hits.json: the summary table, the world
// checks with each one's table (<!-- table:check --> markers), the placeholder scan, the systems notes, the test run, what
// needs eyes.   node tools/audit/build-report.mjs
import fs from 'node:fs';

const P = (f) => new URL(`../../docs/audit/${f}`, import.meta.url);
const H = JSON.parse(fs.readFileSync(P('hits.json'), 'utf8'));
const part = (f) => fs.readFileSync(P(`parts/${f}`), 'utf8').trim();
// severity: the owner's own repeated notes and what blocks or breaks play high; looks medium; tidy-ups low
const SEV = {
  plantOnWalk: 'high', northDoor: 'high', interiorOverlap: 'high', lobbyDoor: 'high', rampCrossesRoad: 'high', railOverWater: 'high',
  planterOnWalk: 'medium', frontNames: 'medium', signCovered: 'medium', doorOnGrass: 'medium', wallOnly: 'medium', dockOverlap: 'medium',
  railOverWaterArt: 'medium', portalOnFlat: 'medium', festoonDensity: 'medium', cropInTown: 'medium', heliOffPad: 'medium', bigEmptyPlaza: 'medium',
  deadBoat: 'low', binBags: 'low', drinkSign: 'low', parked: 'low', atmStray: 'low', beachWater: 'low', nameCovered: 'low',
};
const NEW = new Set(Object.keys(SEV).filter((k) => !['parked', 'atmStray', 'beachWater', 'nameCovered'].includes(k)));
const order = { high: 0, medium: 1, low: 2 };
const rows = Object.entries(H.counts).filter(([k, c]) => c.n || NEW.has(k)).sort((a, b) => (order[SEV[a[0]] || 'low'] - order[SEV[b[0]] || 'low']) || b[1].n - a[1].n);
const sum = ['| Check | Count | Severity | Kind |', '|---|---:|---|---|'];
for (const [k, c] of rows) sum.push(`| ${k} | ${c.n} | ${SEV[k] || 'low'} | ${NEW.has(k) ? (['signCovered', 'doorOnGrass', 'wallOnly'].includes(k) ? 'world row (from egret)' : 'world row (new)') : 'world row (existing)'} |`);
const extra = [
  ['Placeholder art on the overlay (car soccer, transit boards, markers, pool/casino tables)', '~30', 'high'],
  ['Casino / card tables are list menus, poker tables give video poker', '2 systems', 'high'],
  ['Kayak (motorboat physics, standing rider)', '1 system', 'high'],
  ['Skateboard: no carry, stand-in thrown board, snap', '1 system', 'medium'],
  ['Airborne shadows: no single rule (streaks)', '4 paths', 'medium'],
  ['Night lights: vehicles get no reserved share of the cap', '1', 'medium'],
  ['NPCs: nothing keeps them off game areas / furniture', '1 class', 'medium'],
  ['Street-race grid overlaps (36 px apart for 48-50 px cars)', '1', 'medium'],
  ['Character creator "My looks" strip not built', '1', 'medium'],
  ['Guide: entries that promise table play; tennis / skateboard entries missing', '4', 'medium'],
  ['Live director scenes built but off (DIRECTOR.live false)', '3 scenes', 'medium'],
  ['npm test: likely-real failures to recheck on Linux (Lucky Mesa porte-cocheres, tree crowns over doors, hidden doors, prison weapon...)', '13 of 52', 'high', 'tests (section 4)'],
];
for (const [k, n, s, w] of extra) sum.push(`| ${k} | ${n} | ${s} | ${w || 'code (sections 2-3)'} |`);
let checks = part('checks.md');
const tables = fs.readFileSync(P('parts/tables.md'), 'utf8').split(/\n(?=#### )/);
const tbl = new Map(tables.map((t) => [t.match(/^#### (\w+)/)?.[1], t.replace(/^#### .*\n/, '').trim()]));
checks = checks.replace(/<!-- table:(\w+) -->/g, (m, k) => (tbl.get(k) ? `\n${tbl.get(k)}\n` : ''));
const out = [
  '# City Life Auto - the whole-game audit (2026-11-19)',
  '',
  'Find-and-report pass over World v3, the page and the server, against `docs/audit/PREBETA-LIST.md` and `docs/DECISIONS.md`.',
  'Nothing in the game changed: the audit adds lint rows (each at today\'s count, so `npm test` passes and a count can only',
  'come down), its tools (`tools/audit/`) and this report. Every world hit: `docs/audit/hits.json` (check, x, y in tiles,',
  'district, note).',
  '',
  '## Summary',
  '',
  ...sum,
  '',
  checks,
  '',
  part('placeholders.md'),
  '',
  part('systems.md'),
  '',
  part('tests.md'),
  '',
  part('eyes.md'),
  '',
];
fs.writeFileSync(P('REPORT.md'), out.join('\n'));
console.log(sum.join('\n'));
