"""Torch-free Real-ESRGAN (SRVGGNetCompact) 4x upscaler in pure numpy.

Used by build_art.py to turn the low-resolution building lots cut from the concept sheet into
crisp, high-detail art (1 art px = 1 world px) instead of stretching sheet pixels 2x.

Weights: realesr-animevideov3.pth (BSD-3, xinntao/Real-ESRGAN release v0.2.5.0). The .pth zip is
read without torch by a tiny unpickler that rebuilds tensors as numpy arrays.

    python3 tools/sr_upscale.py <weights.pth> in.png out.png
"""
import pickle
import sys
import zipfile

import numpy as np


class _Storage:
    def __init__(self, key, dtype):
        self.key, self.dtype = key, dtype


_DTYPES = {'FloatStorage': np.float32, 'HalfStorage': np.float16, 'DoubleStorage': np.float64, 'LongStorage': np.int64}


def load_pth(path):
    z = zipfile.ZipFile(path)
    root = z.namelist()[0].split('/')[0]
    raw = {}

    def rebuild(storage, offset, size, stride, *_):
        if storage.key not in raw:
            raw[storage.key] = np.frombuffer(z.read(f'{root}/data/{storage.key}'), dtype=storage.dtype)
        buf = raw[storage.key]
        itm = buf.itemsize
        if not size:
            return buf[offset:offset + 1].reshape(()).astype(np.float32)
        return np.lib.stride_tricks.as_strided(buf[offset:], shape=tuple(size), strides=tuple(s * itm for s in stride)).astype(np.float32)

    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == '_rebuild_tensor_v2' or name == '_rebuild_tensor':
                return rebuild
            if name in _DTYPES:
                return name
            if mod == 'collections' and name == 'OrderedDict':
                import collections
                return collections.OrderedDict
            if name == '_rebuild_parameter':
                return lambda data, *_: data
            raise pickle.UnpicklingError(f'blocked {mod}.{name}')

        def persistent_load(self, pid):
            _, typ, key, *_ = pid
            return _Storage(key, _DTYPES[typ if isinstance(typ, str) else typ])

    sd = U(z.open(f'{root}/data.pkl')).load()
    if 'params_ema' in sd:
        sd = sd['params_ema']
    elif 'params' in sd:
        sd = sd['params']
    return sd


def conv3(x, w, b):
    """x: (H, W, Cin); w: (Cout, Cin, 3, 3) -> (H, W, Cout), zero padding 1."""
    h, wd, cin = x.shape
    xp = np.pad(x, ((1, 1), (1, 1), (0, 0)))
    cols = np.empty((h, wd, 9, cin), np.float32)
    k = 0
    for dy in range(3):
        for dx in range(3):
            cols[:, :, k, :] = xp[dy:dy + h, dx:dx + wd, :]
            k += 1
    wm = w.transpose(2, 3, 1, 0).reshape(9 * cin, -1)
    return (cols.reshape(h * wd, 9 * cin) @ wm + b).reshape(h, wd, -1)


def prelu(x, a):
    return np.where(x >= 0, x, x * a)


class Compact:
    def __init__(self, sd, scale=4):
        idx = sorted({int(k.split('.')[1]) for k in sd if k.startswith('body.')})
        self.layers = []
        for i in idx:
            w = sd[f'body.{i}.weight']
            if w.ndim == 4:
                self.layers.append(('conv', w, sd[f'body.{i}.bias']))
            else:
                self.layers.append(('prelu', w.reshape(1, 1, -1)))
        self.scale = scale

    def run(self, img):
        """img: (H, W, 3) float32 0..1 -> (H*s, W*s, 3)."""
        x = img
        for L in self.layers:
            x = conv3(x, L[1], L[2]) if L[0] == 'conv' else prelu(x, L[1])
        s = self.scale
        h, w, _ = x.shape
        out = x.reshape(h, w, 3, s, s).transpose(0, 3, 1, 4, 2).reshape(h * s, w * s, 3)
        out += np.repeat(np.repeat(img, s, 0), s, 1)
        return np.clip(out, 0, 1)

    def upscale(self, img, tile=96, pad=8):
        h, w, _ = img.shape
        s = self.scale
        out = np.zeros((h * s, w * s, 3), np.float32)
        for y0 in range(0, h, tile):
            for x0 in range(0, w, tile):
                y1, x1 = min(h, y0 + tile), min(w, x0 + tile)
                py0, px0, py1, px1 = max(0, y0 - pad), max(0, x0 - pad), min(h, y1 + pad), min(w, x1 + pad)
                r = self.run(img[py0:py1, px0:px1])
                out[y0 * s:y1 * s, x0 * s:x1 * s] = r[(y0 - py0) * s:(y0 - py0 + y1 - y0) * s, (x0 - px0) * s:(x0 - px0 + x1 - x0) * s]
        return out


_model = {}


def upscale_pil(pil_img, weights):
    from PIL import Image
    if weights not in _model:
        _model[weights] = Compact(load_pth(weights))
    m = _model[weights]
    rgba = pil_img.convert('RGBA')
    arr = np.asarray(rgba.convert('RGB'), np.float32) / 255
    up = m.upscale(arr)
    res = Image.fromarray((up * 255 + 0.5).astype(np.uint8), 'RGB')
    alpha = rgba.getchannel('A').resize(res.size, Image.NEAREST)
    res.putalpha(alpha)
    return res


if __name__ == '__main__':
    from PIL import Image
    upscale_pil(Image.open(sys.argv[2]), sys.argv[1]).save(sys.argv[3])
