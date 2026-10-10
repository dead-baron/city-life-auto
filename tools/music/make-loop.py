#!/usr/bin/env python3
"""Make a looping music track for the game from a master recording (the owner's tracks: a FLAC or WAV master).

  python3 tools/music/make-loop.py MASTER --name title --start 22.445 --end 66.787 [--bars 16] [--stereo]

--start and --end are the loop's first and last downbeats, in seconds on the master (the bar lines: find them by ear
or with a beat tracker - a generated track's tempo can creep, so take them from the recording, not from a BPM). The
script:
  1. lines the end up with the start to the sample (the kick on the end's downbeat against the one on the start's),
  2. crossfades the last 90 ms before the end into what comes before the start, so the loop runs on with no seam,
  3. pads it with a wrap-around margin each side (the loop's own end before it, its start after it): the file then
     repeats itself across both seams, so a decoder that adds or trims a few samples at the start (MP3 does) still
     loops cleanly - the player only has to jump back by exactly the loop's length,
  4. encodes it as Opus (most browsers) and MP3 (older Safari), mono unless --stereo, its peak a decibel under full
     scale, and measures its loudness (the player brings every track to the same loudness),
  5. decodes both files again with ffmpeg and checks the repeat across the seam,
  6. writes them as assets/music/NAME-HASH.opus and .mp3 (the hash in the name: a new cut is a new file, never a
     stale copy from a cache) and the track's entry in client/sound/tracks.js.

Needs numpy and ffmpeg (with libopus and libmp3lame).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SR = 48000
MARGIN = 0.25   # s of wrap-around each side
XFADE = 0.09    # s


def decode(path, ch):
    raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', str(ch), '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype='<f4').reshape(-1, ch).astype(np.float64)


def align_end(x, s, e, search=0.006, win=0.03):
    """the end, moved by up to +-search s so the waveform after it matches the one after the start best"""
    m = x.mean(1)
    a = m[s:s + int(win * SR)]
    best, lag = -2.0, 0
    r = int(search * SR)
    for d in range(-r, r + 1):
        b = m[e + d:e + d + len(a)]
        c = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))
        if c > best:
            best, lag = c, d
    return e + lag, best


def make(x, s, e):
    L = e - s
    body = x[s:e].copy()
    n = int(XFADE * SR)
    w = np.sin(np.linspace(0, np.pi / 2, n)) ** 2   # 0 -> 1
    # equal power: the end fades out while what led into the start fades in
    body[L - n:] = x[e - n:e] * np.sqrt(1 - w)[:, None] + x[s - n:s] * np.sqrt(w)[:, None]
    r = int(MARGIN * SR)
    return np.concatenate([body[L - r:], body, body[:r]]), L, r


def seam_error(y, L, r):
    """how far the file is from repeating itself with period L across its margins (dB under the signal)"""
    a = y[:2 * r]; b = y[L:L + 2 * r]
    if len(b) < len(a):
        return 0.0
    return 10 * np.log10((np.sum((a - b) ** 2) + 1e-20) / (np.sum(a ** 2) + 1e-20))


def find_offset(dec, ref, r):
    """where the reference starts in a decoded file (a decoder may add or trim samples at the start)"""
    m, q = dec.mean(1), ref.mean(1)
    a = q[r:r + SR // 2]
    best, off = -2.0, 0
    for d in range(-2400, 2401):
        b = m[r + d:r + d + len(a)]
        if r + d < 0 or len(b) < len(a):
            continue
        c = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))
        if c > best:
            best, off = c, d
    return off


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('master')
    ap.add_argument('--name', required=True)
    ap.add_argument('--start', type=float, required=True)
    ap.add_argument('--end', type=float, required=True)
    ap.add_argument('--bars', type=int, default=0)
    ap.add_argument('--stereo', action='store_true')
    ap.add_argument('--opus-kbps', type=int, default=0)
    ap.add_argument('--mp3-kbps', type=int, default=0)
    ap.add_argument('--gain-db', type=float, default=-1.0)
    a = ap.parse_args()
    ch = 2 if a.stereo else 1
    x = decode(a.master, ch)
    s, e0 = int(round(a.start * SR)), int(round(a.end * SR))
    e, corr = align_end(x, s, e0)
    y, L, r = make(x, s, e)
    y *= 10 ** (a.gain_db / 20) / max(np.abs(y).max(), 1e-9)   # (the peak a decibel under full scale: a lossy decode can overshoot)
    print(f'loop {L / SR:.4f} s ({L} samples at {SR}), end moved {(e - e0) / SR * 1000:+.1f} ms (match {corr:.2f}); file {len(y) / SR:.3f} s; seam error {seam_error(y, L, r):.1f} dB')
    opus_k = a.opus_kbps or (96 if ch == 2 else 64)
    mp3_k = a.mp3_kbps or (128 if ch == 2 else 96)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'loop.wav')
        pcm = (np.clip(y, -1, 1) * 32767).round().astype('<i2')
        import wave
        with wave.open(wav, 'wb') as w:
            w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        ebu = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
        lufs = float(re.findall(r'I:\s+(-?[0-9.]+) LUFS', ebu)[-1])
        print(f'loudness {lufs:.1f} LUFS')
        outs = {}
        for ext, args in (('opus', ['-c:a', 'libopus', '-b:a', f'{opus_k}k', '-application', 'audio']), ('mp3', ['-c:a', 'libmp3lame', '-b:a', f'{mp3_k}k'])):
            tmpf = os.path.join(tmp, f'loop.{ext}')
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', wav, *args, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', tmpf], check=True)   # (bitexact: the same cut gives the same file, and the same name)
            data = open(tmpf, 'rb').read()
            h = hashlib.sha1(data).hexdigest()[:8]
            dec = decode(tmpf, ch)
            off = find_offset(dec, y, r)
            # the decoded file, lined up with what went in: does it still repeat across the seam?
            d = dec[max(0, off):]
            err = seam_error(d, L, r - max(0, -off))
            outs[ext] = {'file': f'assets/music/{a.name}-{h}.{ext}', 'bytes': len(data), 'kbps': opus_k if ext == 'opus' else mp3_k, 'decodedOffset': off, 'seamDb': round(err, 1), 'data': data}
            print(f'{ext}: {len(data) / 1024:.0f} KB at {outs[ext]["kbps"]} kbps; decoded it starts {off:+d} samples off; repeats across the seam to {err:.1f} dB')
    os.makedirs(os.path.join(ROOT, 'assets', 'music'), exist_ok=True)
    for f in os.listdir(os.path.join(ROOT, 'assets', 'music')):   # (the track's old cuts)
        if re.match(rf'^{re.escape(a.name)}-[0-9a-f]{{8}}\.(opus|mp3)$', f):
            os.remove(os.path.join(ROOT, 'assets', 'music', f))
    for o in outs.values():
        with open(os.path.join(ROOT, o['file']), 'wb') as f:
            f.write(o.pop('data'))
    entry = {'opus': outs['opus']['file'], 'mp3': outs['mp3']['file'], 'loop': round(L / SR, 6), 'margin': MARGIN, 'channels': ch, 'lufs': lufs,
             'bytes': {'opus': outs['opus']['bytes'], 'mp3': outs['mp3']['bytes']}, 'bars': a.bars or None,
             'from': f'{os.path.basename(a.master)} {a.start:.3f}-{e / SR:.3f} s'}
    path = os.path.join(ROOT, 'client', 'sound', 'tracks.js')
    tracks = {}
    if os.path.exists(path):
        m = re.search(r'export const TRACKS = (\{.*\});', open(path, encoding='utf-8').read(), re.S)
        if m:
            tracks = json.loads(m.group(1))
    tracks[a.name] = entry
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// The recorded music (made by tools/music/make-loop.py - edit there, not here): each track is a loop cut on\n'
                '// its bar lines from the owner\'s master, padded with a wrap-around margin each side, as Opus and as MP3. The\n'
                '// player (track.js) loops it from margin to margin + loop.\n')
        f.write('export const TRACKS = ' + json.dumps(tracks, indent=1) + ';\n')
    print('wrote', ', '.join(o['file'] for o in outs.values()), 'and client/sound/tracks.js')


if __name__ == '__main__':
    sys.exit(main())
