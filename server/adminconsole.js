// The owner's console (/admin/; the owner, 11-16: "an analytics page that gives me a real-time look at what's currently
// happening, the last few hours, the last day, the last few days. Who has logged on, what they're up to, where they're
// logging in from - a dashboard. Right now clicking in and out of different pages is clunky. Great to see this well on
// mobile and on desktop, for me only."). One page, tabs: Now, Trends, Where from, Moderation, Server, Tools (the older pages
// - players, bug reports, the review list, the admin log, the news list, the long analytics - one tap away). It polls
// /admin/api every few seconds (server/adminhttp.js: the same session cookie, the role checked on every request) and draws
// with no libraries: the charts are inline SVG made here (server/adminconsole-page.js, served as /admin/console.js). The
// game's look: navy, gold, cream. A phone gets one column and big tabs; a desktop a grid.
// Privacy: no address, email or account id reaches the page - a player is a name and a ref good for this session.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from './httputil.js';

export const CONSOLE_CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
let SCRIPT = null;
export const consoleScript = () => (SCRIPT ??= readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'adminconsole-page.js'), 'utf8'));

const CSS = `:root{--ink:#070b16;--navy:#0f1830;--navy2:#172447;--navy3:#22325e;--edge:#3a4a78;--gold:#e2bd57;--gold-hi:#f4d98a;--cream:#f3ead2;--dim:#a6aec4;--money:#6cd06c;--danger:#ff6b5a;--info:#5ab0ff;--heat:#ffa63d;--line:rgba(243,234,210,.12);--panel:linear-gradient(180deg,#15223f,#0d162d)}
*{box-sizing:border-box}html,body{margin:0;background:var(--ink);color:var(--cream);font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
a{color:var(--info)}
header{position:sticky;top:0;z-index:5;background:linear-gradient(180deg,#0f1830f2,#0b1226f2);border-bottom:2px solid var(--gold);padding:10px 16px 0;backdrop-filter:blur(6px)}
.top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.brand{font-weight:800;letter-spacing:.04em;color:var(--gold);font-size:17px;text-transform:uppercase}
.brand small{display:block;color:var(--dim);font-weight:600;letter-spacing:.02em;text-transform:none;font-size:12px}
.live{margin-left:auto;display:flex;align-items:center;gap:7px;font-size:13px;color:var(--dim)}
.dot{width:10px;height:10px;border-radius:50%;background:var(--money);box-shadow:0 0 0 0 #6cd06c88;animation:pulse 2s infinite}.dot.off{background:var(--danger);animation:none}
@keyframes pulse{0%{box-shadow:0 0 0 0 #6cd06c88}70%{box-shadow:0 0 0 8px #6cd06c00}100%{box-shadow:0 0 0 0 #6cd06c00}}
.kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:10px 0}
.kpi{background:var(--panel);border:1px solid var(--edge);border-radius:10px;padding:8px 10px;min-width:0}
.kpi b{display:block;font-size:24px;line-height:1.1;color:var(--cream);font-variant-numeric:tabular-nums}
.kpi span{font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.kpi.gold b{color:var(--gold-hi)}
nav.tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px}
nav.tabs::-webkit-scrollbar{display:none}
nav.tabs button{flex:0 0 auto;min-height:44px;padding:0 16px;border:0;border-bottom:3px solid transparent;background:none;color:var(--dim);font:700 15px system-ui,sans-serif;cursor:pointer}
nav.tabs button.on{color:var(--gold-hi);border-bottom-color:var(--gold)}
nav.tabs button .n{display:inline-block;min-width:20px;margin-left:6px;padding:0 6px;border-radius:10px;background:var(--danger);color:#fff;font-size:12px;line-height:20px}
main{padding:14px 16px 40px;max-width:1500px;margin:0 auto}
section{display:none}section.on{display:block}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:12px 14px;min-width:0}
.card.wide{grid-column:1/-1}
.card h2{margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
.card h2 small{color:var(--dim);letter-spacing:0;text-transform:none;font-weight:500;margin-left:6px}
.bars{display:grid;grid-template-columns:minmax(80px,auto) 1fr auto;gap:5px 10px;align-items:center;font-size:14px}
.bars i{display:block;height:10px;border-radius:5px;background:var(--gold)}
.bars .v{font-variant-numeric:tabular-nums;color:var(--dim);text-align:right}
.players{width:100%;border-collapse:collapse;font-size:14px}
.players th{text-align:left;color:var(--dim);font-weight:600;font-size:12px;padding:4px 8px;border-bottom:1px solid var(--line)}
.players td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
.players tr{cursor:pointer}.players tbody tr:hover{background:#ffffff08}
.nm{font-weight:700}.nm.gu{color:#a3a8b0;font-weight:500}.crown{color:var(--gold);margin-right:4px}
.tag{display:inline-block;padding:0 7px;border-radius:9px;font-size:12px;line-height:19px;background:var(--navy3);color:var(--dim);margin-left:6px}
.tag.gu{background:#2c3244}.tag.role{background:#3a2f12;color:var(--gold-hi)}.tag.w{background:#4a1d18;color:#ffb3a8}
.sub{color:var(--dim);font-size:13px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
.chips button{min-height:40px;padding:0 16px;border-radius:20px;border:1px solid var(--edge);background:var(--navy2);color:var(--cream);font:700 14px system-ui,sans-serif;cursor:pointer}
.chips button.on{background:var(--gold);color:var(--ink);border-color:var(--gold)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
.tile{background:#0b1226;border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.tile b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.tile span{font-size:12px;color:var(--dim)}
svg.chart{display:block;max-width:100%}.chartbox{width:100%;min-height:140px}
@media (min-width:900px){.card.half{grid-column:span 1}.grid.tr{grid-template-columns:1fr 1fr}}
.cmp{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}
.cmp th,.cmp td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right}.cmp th:first-child,.cmp td:first-child{text-align:left}
.cmp thead th{color:var(--gold);font-size:12px}
.list{margin:0;padding:0;list-style:none}.list li{padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}.list li:last-child{border:0}
.list small{color:var(--dim)}
.bad{color:var(--danger)}.ok{color:var(--money)}
.tools{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.tools a{display:flex;flex-direction:column;justify-content:center;min-height:72px;padding:10px 14px;border-radius:12px;border:1px solid var(--edge);background:var(--panel);color:var(--cream);text-decoration:none;font-weight:700}
.tools a span{font-weight:500;color:var(--dim);font-size:13px}
.tools a:hover{border-color:var(--gold)}
.note{color:var(--dim);font-size:12px;margin-top:8px}
.empty{color:var(--dim);padding:10px 0}
@media (max-width:700px){.kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.kpi:nth-child(n+4){display:none}.kpi b{font-size:20px}.players .hide-s{display:none}.grid{grid-template-columns:1fr}.brand{font-size:15px}}`;

export function consolePage(w) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0f1830"><title>Console - City Life Auto</title><style>${CSS}</style></head>
<body><header><div class="top"><div class="brand">City Life Auto <small>Owner's console · ${esc(w.name)} (${esc(w.role)})</small></div><div class="live"><i class="dot" id="dot"></i><span id="ago">connecting…</span></div></div>
<div class="kpis" id="kpis"></div>
<nav class="tabs" id="tabs"><button data-t="now" class="on">Now</button><button data-t="trends">Trends</button><button data-t="where">Where from</button><button data-t="mod">Moderation</button><button data-t="server">Server</button><button data-t="tools">Tools</button></nav></header>
<main><section id="now" class="on"></section><section id="trends"></section><section id="where"></section><section id="mod"></section><section id="server"></section><section id="tools"></section></main>
<script src="/admin/console.js"></script></body></html>`;
}
