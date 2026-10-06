// A 3 x 5 pixel font for the words painted into art v2: shop signs, road markings, plaques. Only
// generic words go through it (PAWN, LIQUOR, BUS ONLY) - never real brand names.
//
// drawText(plot, text, x, y, opt) calls plot(px, py, k) for each lit pixel; k is 0 for the letter body
// and 1 for its drop shadow when opt.shadow is set. opt: { sx, sy (pixel scale), gap, shadow }.
// textWidth(text, opt) -> width in px.
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111101101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101101111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '-': '000000111000000', '.': '000000000000010', '&': '010101010101011', "'": '010010000000000',
  '!': '010010010000010', '$': '011110010011110', '+': '000010111010000', ' ': '000000000000000',
};
export function textWidth(text, opt = {}) {
  const sx = opt.sx || 1, gap = opt.gap ?? 1;
  return text.length * (3 * sx + gap * sx) - gap * sx;
}
export function drawText(plot, text, x0, y0, opt = {}) {
  const sx = opt.sx || 1, sy = opt.sy || sx, gap = opt.gap ?? 1;
  for (const pass of opt.shadow ? [1, 0] : [0]) {
    let x = x0;
    for (const ch of text.toUpperCase()) {
      const g = GLYPHS[ch] || GLYPHS[' '];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        if (g[r * 3 + c] !== '1') continue;
        for (let yy = 0; yy < sy; yy++) for (let xx = 0; xx < sx; xx++) plot(x + c * sx + xx + pass, y0 + r * sy + yy + pass, pass);
      }
      x += 3 * sx + gap * sx;
    }
  }
}
