#!/usr/bin/env python3
"""The soundtrack's songs for the game, from the owner's approved takes (tools/music/analyze.py's picks, his ear's yes).

  python3 tools/music/make-songs.py TAKES_DIR [--only T03,C04]

TAKES_DIR holds <ID>/MASTER.flac (the handoff's Takes folder). For every take in docs/audio/loops-2026-11-22
(_songs.json: the primaries, _alternates.json: their alternates; <ID>.json: the loop and the ending measured), writes
  assets/music/songs/<ID>-loop-<hash>.opus/.mp3  the loop, cut on its bar lines the title track's way (make-loop.py:
                                                 the end lined up with the start to the sample, an equal-power blend
                                                 into what led into the start, a wrap-around margin each side),
  assets/music/songs/<ID>-full-<hash>.opus/.mp3  the whole take from the top, its intro and all, to its ending - its
                                                 own, or the new one (the downbeat after its last full phrase, that
                                                 beat ringing, faded over two beats),
and client/sound/songs.js: by cue, the primary and its alternates; by take, the files, lengths and loudness.
Mono where the two channels are alike (analyze.py's stereo_alike at 0.95 or more: half the download and the memory).
Each file's peak a decibel under full scale; its loudness measured (the player brings every song to the same level).
"""
import argparse
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
spec = importlib.util.spec_from_file_location('makeloop', os.path.join(os.path.dirname(__file__), 'make-loop.py'))
ML = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ML)
SR = ML.SR
DATA = os.path.join(ROOT, 'docs', 'audio', 'loops-2026-11-22')
OUT = os.path.join(ROOT, 'assets', 'music', 'songs')
MONO_AT = 0.95
KBPS = {('opus', 1): 56, ('opus', 2): 80, ('mp3', 1): 80, ('mp3', 2): 112}


def lufs_of(wav):
    ebu = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[0-9.]+) LUFS', ebu)[-1])


def encode(y, ch, name, tmp, loop=None):
    """the files for one cut: [{ext, file, bytes, kbps, ...}], and its loudness"""
    wav = os.path.join(tmp, name + '.wav')
    pcm = (np.clip(y, -1, 1) * 32767).round().astype('<i2')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    lufs = lufs_of(wav)
    outs = {}
    for ext in ('opus', 'mp3'):
        k = KBPS[(ext, ch)]
        args = ['-c:a', 'libopus', '-b:a', f'{k}k', '-application', 'audio'] if ext == 'opus' else ['-c:a', 'libmp3lame', '-b:a', f'{k}k']
        f = os.path.join(tmp, f'{name}.{ext}')
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', wav, *args, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', f], check=True)
        data = open(f, 'rb').read()
        o = {'file': f'assets/music/songs/{name}-{hashlib.sha1(data).hexdigest()[:8]}.{ext}', 'bytes': len(data), 'kbps': k, 'data': data}
        if loop:
            L, r = loop
            dec = ML.decode(f, ch)
            off = ML.find_offset(dec, y, r)
            o['decodedOffset'] = off
            o['seamDb'] = round(ML.seam_error(dec[max(0, off):], L, r - max(0, -off)), 1)
        outs[ext] = o
    return outs, lufs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('takes')
    ap.add_argument('--only', default='')
    ap.add_argument('--manifest-only', action='store_true', help='rewrite shared/songtimes.js from client/sound/songs.js, no encoding')
    a = ap.parse_args()
    prim = json.load(open(os.path.join(DATA, '_songs.json')))
    alts = json.load(open(os.path.join(DATA, '_alternates.json')))
    only = set(x for x in a.only.split(',') if x)
    path = os.path.join(ROOT, 'client', 'sound', 'songs.js')
    M = {'cues': {}, 'takes': {}}
    if os.path.exists(path):
        m = re.search(r'export const SONGS = (\{.*\});', open(path, encoding='utf-8').read(), re.S)
        if m:
            M = json.loads(m.group(1))
    for s in prim + alts:
        c = M['cues'].setdefault(s['cue'], {'title': s['title'], 'primary': None, 'alts': []})
        if s in prim:
            c['primary'] = s['id']
        elif s['id'] not in c['alts']:
            c['alts'].append(s['id'])
    os.makedirs(OUT, exist_ok=True)
    for s in prim + alts:
        tid = s['id']
        if a.manifest_only or (only and tid not in only):
            continue
        info = json.load(open(os.path.join(DATA, tid + '.json')))
        ch = 1 if info['stereo_alike'] >= MONO_AT else 2
        x = ML.decode(os.path.join(a.takes, tid, 'MASTER.flac'), ch)
        lp, en = info['loop'], info['ending']
        entry = {'cue': s['cue'], 'title': s['title'], 'role': 'primary' if s in prim else 'alternate', 'channels': ch, 'bpm': info['bpm'],
                 'approved': '2026-11-22'}
        with tempfile.TemporaryDirectory() as tmp:
            # the loop
            st, e0 = int(round(lp['start'] * SR)), int(round(lp['end'] * SR))
            e, corr = ML.align_end(x, st, e0)
            y, L, r = ML.make(x, st, e)
            y = y * (10 ** (-1 / 20) / max(np.abs(y).max(), 1e-9))
            lo, ll = encode(y, ch, f'{tid}-loop', tmp, (L, r))
            # the full song, from the top to its ending
            if en['kind'] == 'own':
                f = x.copy()
            else:
                b = int(round((en['at'] + en['ring_s']) * SR))
                f = x[:b].copy()
                f0 = int(round((en['at'] + 0.06) * SR))
                n = len(f) - f0
                if n > 0:
                    f[f0:] *= (np.linspace(1, 0, n) ** 2)[:, None]
            # (trailing silence trimmed: the next song starts when this one has really ended)
            loud = np.where(np.abs(f).max(1) > 10 ** (-60 / 20))[0]
            if len(loud):
                f = f[:min(len(f), loud[-1] + int(0.25 * SR))]
            f = f * (10 ** (-1 / 20) / max(np.abs(f).max(), 1e-9))
            fo, fl = encode(f, ch, f'{tid}-full', tmp)
        for old in os.listdir(OUT):
            if re.match(rf'^{tid}-(loop|full)-[0-9a-f]{{8}}\.(opus|mp3)$', old):
                os.remove(os.path.join(OUT, old))
        for o in list(lo.values()) + list(fo.values()):
            with open(os.path.join(ROOT, o['file']), 'wb') as fh:
                fh.write(o.pop('data'))
        entry['loop'] = {'opus': lo['opus']['file'], 'mp3': lo['mp3']['file'], 'loop': round(L / SR, 6), 'margin': ML.MARGIN, 'lufs': ll,
                         'bytes': {'opus': lo['opus']['bytes'], 'mp3': lo['mp3']['bytes']}, 'bars': lp['bars'],
                         'seamDb': {'opus': lo['opus']['seamDb'], 'mp3': lo['mp3']['seamDb']}, 'from': f"{lp['start']:.3f}-{e / SR:.3f} s"}
        entry['full'] = {'opus': fo['opus']['file'], 'mp3': fo['mp3']['file'], 'seconds': round(len(f) / SR, 3), 'lufs': fl,
                         'bytes': {'opus': fo['opus']['bytes'], 'mp3': fo['mp3']['bytes']},
                         'ending': 'own' if en['kind'] == 'own' else f"new, at {en['at']:.3f} s"}
        M['takes'][tid] = entry
        print(tid, s['title'], f"ch{ch} loop {L / SR:.2f}s seam {lo['opus']['seamDb']}/{lo['mp3']['seamDb']} dB, full {len(f) / SR:.1f}s,",
              f"{(lo['opus']['bytes'] + fo['opus']['bytes']) // 1024} KB opus", flush=True)
    M['takes'] = dict(sorted(M['takes'].items()))
    M['cues'] = dict(sorted(M['cues'].items()))
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('// The soundtrack (made by tools/music/make-songs.py - edit there, not here): the owner\'s songs by cue - the\n'
                 '// primary take and its alternates - and each take as a loop (a bed: cut on its bar lines, a wrap-around margin\n'
                 '// each side, played from margin to margin + loop) and as the full song from the top to its ending. Opus, MP3\n'
                 '// where Opus won\'t play. All approved by the owner by ear, 2026-11-22. Loaded only when music is wanted.\n')
        fh.write('export const SONGS = ' + json.dumps(M, indent=1) + ';\n')
    print('wrote', path)
    times(M)


def times(M):
    """shared/songtimes.js: what the server and the page both need to agree what plays when - by cue, its takes (the
    primary first): [take, the full song's seconds, the loop's seconds, BPM, the first downbeat (s)]. Tiny on purpose:
    shared/music.js imports it (the page's start-up budget); the files themselves are client/sound/songs.js, loaded lazily."""
    out = {}
    for cue, c in M['cues'].items():
        rows = []
        for tid in [c['primary']] + c['alts']:
            T = M['takes'].get(tid)
            if not T:
                continue
            info = json.load(open(os.path.join(DATA, tid + '.json')))
            rows.append([tid, T['full']['seconds'], T['loop']['loop'], info['bpm'], info['first_downbeat'] or 0])
        out[cue] = rows
    path = os.path.join(ROOT, 'shared', 'songtimes.js')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('// The owner\'s songs, by cue: each take (the primary first) as [take, full song s, loop s, BPM, first downbeat s] -\n'
                 '// made by tools/music/make-songs.py from the measured takes (docs/audio/loops-2026-11-22); edit there, not here.\n'
                 '// The files: client/sound/songs.js (the page, lazily). Which take plays when: shared/music.js takeOf.\n')
        fh.write('export const SONG_TAKES = {\n' + ',\n'.join(f"  '{k}': {json.dumps(v)}" for k, v in out.items()) + ',\n};\n')
    print('wrote', path, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
