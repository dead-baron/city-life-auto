// The arcade's screen drawn at the size it's shown (the owner, 10-23: "Arcade games are really blurry right now
// (especially the text), is this by design?"): the cabinets' games draw on a little screen (256 x 224, the pool table
// 256 x 160) that CSS stretches over most of the window - drawn at that size and stretched, the circles, lines and
// text came out soft and smeared. fitScreen gives the canvas as many pixels as it covers on the device (its CSS size x
// devicePixelRatio) and scales the drawing to it, so the games keep drawing in their own 256-wide coordinates and
// come out sharp; pixel art (STARFALL: its sprites and its blocky font) at a whole number of device pixels to each of
// its pixels, image smoothing off, so every pixel stays square. Called at the top of each draw: the size is looked
// at every frame (a window turned or resized), the canvas only resized when it changes.
// (Loaded with the games - client/arcade.js, skeeball.js, pinball.js, airhockey.js, pool.js, racebook.js - never with
// the page.)
export function fitScreen(cv, g, W, H, pixel = false) {
  const r = cv.getBoundingClientRect(), dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
  let k = r.width > 0 ? (r.width * dpr) / W : 1;
  k = pixel ? Math.max(1, Math.floor(k + 0.02)) : Math.max(1, Math.min(6, k));
  const bw = Math.round(W * k), bh = Math.round(H * k);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  g.setTransform(bw / W, 0, 0, bh / H, 0, 0);
  g.imageSmoothingEnabled = !pixel;
  return k;
}
