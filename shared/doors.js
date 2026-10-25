// The street fronts' doors (the owner's notes 2, p16): which slide and which swing, their paint, and the shops whose door
// has a bell - for the bake (statics.js liveDoors), the page (client/art2/game/doorart.js: the whole story) and its
// sound (client/sound/places.js: the bell rings as anyone goes in). Sliding glass for the marts, banks, clinics and
// modern shops; the rest swing.
export const SLIDE = new Set(['grocery', 'gasstation', 'gas', 'pharmacy', 'bank', 'hospital', 'clinic', 'sports', 'clothing', 'police', 'mart', 'lobby',
  'office', 'gallery', 'arcade', 'boutique', 'electronics', 'terminal', 'hotel', 'showroom']);
export const doorStyle = (kind) => (SLIDE.has(kind) ? 'slide' : 'hinge');
// the bell: the corner store, the pawn shop, the diner and the cafe, the barber, the hardware store, bait and tackle, the
// fish market, a bakery (a walk-in's kind, or a hand plan's trade - its 'mart' is its corner store)
export const BELL = new Set(['convenience', 'pawn', 'barber', 'hardware', 'tackle', 'fishmarket', 'coffee', 'diner', 'bakery', 'cafe']);
export const BELL_TRADES = new Set(['mart', 'pawn', 'barber', 'bakery', 'cafe', 'diner']);
export const rings = (u) => !!u && (BELL.has(u.kind) || (!!u.trade && BELL_TRADES.has(u.trade)));
// a walk-in's door (u) by its trade - a shop with a bell swings - else the front's look (statics.js shop kinds)
export const unitDoor = (u, shopKind) => (u ? (rings(u) ? 'hinge' : doorStyle(SLIDE.has(u.kind) ? u.kind : u.trade || u.kind)) : doorStyle(shopKind));
export const DOOR_COLS = ['#2e5a3e', '#7a2a2a', '#23324e', '#6a4a2e', '#34343a', '#2e6a6a', '#8a6a2a', '#5a2a4a'];   // (a hinged door's paint)
