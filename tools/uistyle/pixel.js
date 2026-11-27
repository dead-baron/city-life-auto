// The pick sheet's variant C: variant B's hard frames (hard.js, run first) and pixel icons - every line glyph on the
// screen redrawn on a grid of two screen pixels to one (13 x 13 for a 26 px icon), one pixel to a line, hard edged (a preview made from the line icons
// themselves: the real set would be drawn by hand on that grid).
return new Promise((done) => {
  const svgs = [...document.querySelectorAll('#hub svg.gl')].filter((v) => !v.dataset.px && v.getBoundingClientRect().width > 0);
  if (!svgs.length) return done(0);
  let left = svgs.length;
  for (const v of svgs) {
    const r = v.getBoundingClientRect(), col = getComputedStyle(v).color, k = 2, G = Math.max(8, Math.round(r.width / k));
    const c = v.cloneNode(true); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('width', 24); c.setAttribute('height', 24); c.setAttribute('stroke', '#000'); c.setAttribute('stroke-width', String(Math.round(24 / G * 10) / 10)); c.setAttribute('stroke-linecap', 'square'); c.setAttribute('stroke-linejoin', 'miter'); c.style.color = '#000';
    for (const h of c.querySelectorAll('.h')) h.remove();
    const img = new Image();
    img.onload = () => {
      const a = document.createElement('canvas'); a.width = G; a.height = G; const g = a.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(img, 0, 0, G, G);
      const d = g.getImageData(0, 0, G, G), m = col.match(/[\d.]+/g).map(Number);
      for (let i = 0; i < d.data.length; i += 4) { const on = d.data[i + 3] > 96; d.data[i] = m[0]; d.data[i + 1] = m[1]; d.data[i + 2] = m[2]; d.data[i + 3] = on ? 255 : 0; }
      g.putImageData(d, 0, 0);
      a.style.cssText = `width:${G * k}px;height:${G * k}px;image-rendering:pixelated;display:block`; a.className = v.getAttribute('class').replace('gl', 'glpx'); a.dataset.px = '1';
      v.replaceWith(a);
      if (--left === 0) done(svgs.length);
    };
    img.onerror = () => { if (--left === 0) done(-1); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c));
  }
});
