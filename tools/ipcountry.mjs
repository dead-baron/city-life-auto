// The console's country-by-IP table by hand (server/geo.js fetches it by itself on the server; this is for a machine
// without the network, or to check a file): DB-IP's "IP to Country Lite" CSV (https://db-ip.com/db/download/ip-to-country-lite,
// CC BY 4.0; .csv or .csv.gz) packed into the table the server reads - put it in the server's data dir as ipcountry.bin.
//   node tools/ipcountry.mjs dbip-country-lite-2026-11.csv.gz [out.bin]   ·   node tools/ipcountry.mjs --look out.bin 8.8.8.8
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packTable, createGeo, TABLE_FILE } from '../server/geo.js';

const [a, b, c] = process.argv.slice(2);
if (a === '--look') {
  const d = mkdtempSync(join(tmpdir(), 'geo-'));
  copyFileSync(b, join(d, TABLE_FILE));
  console.log(c, createGeo({ dir: d }).byIp(c));
  rmSync(d, { recursive: true, force: true });
} else if (a) {
  const raw = readFileSync(a), csv = (a.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8');
  const bin = packTable(csv), out = b || TABLE_FILE;
  writeFileSync(out, bin);
  console.log(`${out}: ${bin.readUInt32LE(4)} v4 and ${bin.readUInt32LE(8)} v6 ranges, ${(bin.length / 1048576).toFixed(2)} MB`);
} else console.log('node tools/ipcountry.mjs <dbip-country-lite.csv[.gz]> [out.bin]  |  --look <table.bin> <address>');
