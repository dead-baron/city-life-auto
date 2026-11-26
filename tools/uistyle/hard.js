// The UI style pass's pick sheet (the art pass, part C2): variant B - hard pixel frames. Run in the page before a
// shot (tools/uishots.py UISHOT_JS); changes nothing in the game's own CSS. Square frames with a one-step notch cut
// out of each corner, no soft shadow (a hard drop of black instead), flat fills in place of gradients, the gold rim
// kept. The round buttons stay round (UIK-00 4D).
if (!document.getElementById('uistyle-try')) {
  const s = document.createElement('style'); s.id = 'uistyle-try';
  const N = (n) => `polygon(0 ${n}px, ${n}px ${n}px, ${n}px 0, calc(100% - ${n}px) 0, calc(100% - ${n}px) ${n}px, 100% ${n}px, 100% calc(100% - ${n}px), calc(100% - ${n}px) calc(100% - ${n}px), calc(100% - ${n}px) 100%, ${n}px 100%, ${n}px calc(100% - ${n}px), 0 calc(100% - ${n}px))`;
  s.textContent = `
    :root { --r1: 0px; --r2: 0px; --r4: 0px; --panel-bg: #111b38; --plate-sh: 0 4px 0 rgba(0,0,0,.6); --shadow: 0 6px 0 rgba(0,0,0,.6); }
    .hub-frame, .panel, .ui-panel { clip-path: ${N(4)}; border-width: 4px; }
    .bag-detail, .bag-eq, .bag-cell, .iv-fig, .iv-qb, .bag-slot, .bag-find, .bag-sort select, .btn, .btn-1, .btn-d, .chip, .iv-sb, .set-bind, .sw, #hub .card, #hub .row, #hub section { clip-path: ${N(2)}; }
    .btn, .btn-1, .btn-d, .chip { box-shadow: none !important; }
    .btn-1, .chip.on, .bag-cats .chip.on { box-shadow: inset 0 -3px 0 rgba(0,0,0,.28) !important; }
    #hub-bar { border-bottom-width: 4px; }
    #hub * { text-shadow: none; }
    #hub-title, .bag h3 { text-shadow: 2px 2px 0 #000; }
    .iv-fig { background: #0d1630 !important; }
  `;
  document.head.appendChild(s);
}
return 1;
