#!/usr/bin/env python3
"""The owner's listening page for the soundtrack's loops, endings and full songs (tools/music/analyze.py's output).

  python3 tools/music/review-page.py OUTDIR songs.json [alternates.json] [--approved ID-loop,ID-ending,...]

Writes OUTDIR/index.html beside the clips: by song, the primary take first, then its alternates. Each clip has
"sounds right / redo" and a note; "Copy my notes" gives the text to paste back into the chat (kept in the browser
between visits).
"""
import html
import json
import os
import sys


def mmss(t):
    t = float(t)
    return f"{int(t // 60)}:{t % 60:04.1f}"


def clip(cid, label, text, src, approved):
    mark = '<span class="ok">approved 11-22</span>' if approved else ''
    return f"""<div class="k" data-key="{cid}"><b>{label}</b> {mark} {text}
 <audio controls preload="none" src="{src}"></audio>
 <div class="v"><label><input type="radio" name="{cid}" value="good"> sounds right</label><label><input type="radio" name="{cid}" value="redo"> redo</label><input class="n" placeholder="what's wrong (optional)"></div></div>"""


def take(s, i, approved, role):
    l, e = i['loop'], i['ending']
    pre = min(2.0, l['start'])
    seams = [pre + l['seconds'], pre + 2 * l['seconds']]
    flags = []
    if abs(l.get('seam_level_jump_db', 0)) > 6:
        flags.append(f"the loudness changes {l['seam_level_jump_db']:+.0f} dB across the join - listen closely")
    if l['next_bar_like_first'] < 0.97 or l['last_bar_like_before'] < 0.97:
        flags.append('the join is a weaker match than most')
    full_end = 'its own ending' if e['kind'] == 'own' else f"the new ending at {mmss(e['at'])}"
    end_note = ('Its own ending, kept: the clip is its last 30 seconds.' if e['kind'] == 'own' else
                f"Cut at {mmss(e['at'])} of {mmss(i['seconds'])} (the downbeat after the last full phrase), that beat left ringing and faded. "
                f"The new ending comes at {mmss(e['at'] - e['preview_from'])} into the clip.")
    loop_note = (f"{l['bars']} bars, {l['seconds']:.1f} s, from {mmss(l['start'])} to {mmss(l['end'])} of the song. Played three times; the joins are at "
                 f"<a href=\"#\" data-t=\"{seams[0]:.2f}\">{mmss(seams[0])}</a> and <a href=\"#\" data-t=\"{seams[1]:.2f}\">{mmss(seams[1])}</a>."
                 + ''.join(f'<span class="f">{x}</span>' for x in flags))
    tid = s['id']
    return f"""<div class="t {role}"><h3>{'Primary' if role == 'p' else 'Alternate'} {tid} <small>{i['bpm']} BPM (written {s['bpm']:.0f}) · {i['seconds']:.1f} s</small></h3>
{clip(tid + '-full', 'Song from the top', f'The whole take, intro and all, to {full_end}: for a boombox or a song starting fresh.', tid + '-full.opus', False)}
{clip(tid + '-loop', 'Loop', loop_note, tid + '-loop3.opus', tid + '-loop' in approved)}
{clip(tid + '-ending', 'Ending', end_note, tid + '-ending.opus', tid + '-ending' in approved)}
</div>"""


def main():
    out, prim = sys.argv[1], json.load(open(sys.argv[2]))
    alts = json.load(open(sys.argv[3])) if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else []
    approved = set()
    if '--approved' in sys.argv:
        approved = set(sys.argv[sys.argv.index('--approved') + 1].split(','))
    J = {}
    for s in prim + alts:
        J[s['id']] = json.load(open(os.path.join(out, s['id'] + '.json')))
    by = {}
    for s in prim:
        by.setdefault(s['cue'], {'title': s['title'], 'p': None, 'a': []})['p'] = s
    for s in alts:
        by.setdefault(s['cue'], {'title': s['title'], 'p': None, 'a': []})['a'].append(s)
    secs = []
    for cue in sorted(by):
        g = by[cue]
        parts = ([take(g['p'], J[g['p']['id']], approved, 'p')] if g['p'] else []) + [take(s, J[s['id']], approved, 'a') for s in g['a']]
        n = len(g['a'])
        secs.append(f"""<section><h2>{cue} · {html.escape(g['title'])} <small>{'no alternates' if not n else f'{n} alternate' + ('s' if n > 1 else '')}</small></h2>{''.join(parts)}</section>""")
    nalt = len(alts)
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>City Life Auto - the soundtrack to check</title>
<style>
body{{font:15px/1.45 system-ui,sans-serif;background:#16181c;color:#e6e6e6;max-width:920px;margin:24px auto;padding:0 16px}}
h1{{font-size:22px}} h2{{font-size:18px;margin:0 0 6px}} h3{{font-size:15px;margin:4px 0}} small{{color:#8a8f98;font-weight:400}}
section{{background:#1f2228;border-radius:10px;padding:14px 16px;margin:14px 0}}
.t{{border-top:1px solid #2c3038;padding-top:8px;margin-top:8px}} .t.a h3{{color:#b9c7ff}}
.k{{margin:8px 0 4px}} audio{{width:100%;margin:6px 0 2px}}
.f{{display:block;color:#f2c14e;font-size:13px}} .ok{{color:#7ed492;font-size:13px}} .v{{display:flex;gap:14px;align-items:center;font-size:14px}}
.n{{flex:1;background:#14161a;border:1px solid #333;color:#ddd;border-radius:6px;padding:4px 8px}}
a{{color:#7fb6ff}} button{{font:inherit;padding:8px 14px;border-radius:8px;border:0;background:#3b6fd8;color:#fff;cursor:pointer}}
#out{{width:100%;height:160px;background:#14161a;color:#ddd;border:1px solid #333;border-radius:6px;margin-top:8px}}
</style></head><body>
<h1>The soundtrack to check: 25 songs, {nalt} alternates</h1>
<p>Every clip is your own recording, cut and joined - nothing re-made. Each take has three clips:</p>
<ul>
<li><b>Song from the top</b> (new): the whole take with its intro, to its ending - what a boombox or a jukebox plays.</li>
<li><b>Loop</b>: the stretch a shop or lobby repeats, three times over; click a join's time to jump just before it.</li>
<li><b>Ending</b>: how the song finishes on a radio.</li>
</ul>
<p>The primaries' loops and endings you approved this morning are marked; their full songs are new. The alternates are all new: in play they come up about 30% of the time between them, the primary the rest. Mark what you hear, then press the button at the bottom and paste the text into the chat.</p>
{''.join(secs)}
<p><button id="go">Copy my notes</button></p><textarea id="out" readonly></textarea>
<script>
document.querySelectorAll('a[data-t]').forEach(a=>a.onclick=e=>{{e.preventDefault();const au=a.closest('.k').querySelector('audio');au.currentTime=Math.max(0,+a.dataset.t-3);au.play();}});
const K='cla-loop-review-2';let st={{}};try{{st=JSON.parse(localStorage.getItem(K)||'{{}}')}}catch(e){{}}
const save=()=>{{try{{localStorage.setItem(K,JSON.stringify(st))}}catch(e){{}}}};
document.querySelectorAll('.k[data-key]').forEach(k=>{{const key=k.dataset.key,r=st[key]||{{}};
 k.querySelectorAll('input[type=radio]').forEach(x=>{{if(r.v===x.value)x.checked=true;x.onchange=()=>{{st[key]={{...(st[key]||{{}}),v:x.value}};save();}};}});
 const n=k.querySelector('.n');n.value=r.n||'';n.oninput=()=>{{st[key]={{...(st[key]||{{}}),n:n.value}};save();}};}});
document.getElementById('go').onclick=()=>{{const t=Object.entries(st).filter(([k,r])=>r.v||r.n).map(([k,r])=>k+': '+(r.v||'-')+(r.n?' - '+r.n:'')).join('\\n')||'(nothing marked)';const o=document.getElementById('out');o.value='Soundtrack review notes\\n'+t;o.select();try{{navigator.clipboard.writeText(o.value)}}catch(e){{}}}};
</script></body></html>"""
    with open(os.path.join(out, 'index.html'), 'w') as fh:
        fh.write(page)
    print('index.html', len(page))


if __name__ == '__main__':
    main()
