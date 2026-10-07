// Foraging: what grows wild for the picking - mushrooms on the redwood floor of Highland Woods (at the feet of the
// giants, on the nurse logs, round the old stumps of the fairy rings) and the rare golden stars of the tidepools.
// The spots are laid out with the map (map.js redwoodGroves, naturesites.js tidepools: m.forage, { x, y, k }),
// picked on the server (server/systems/foraging.js: a few at a time, then the spot is bare until it grows back -
// rules.js FORAGE_REGROW_S), and drawn where they grow by the art v2 host while they're there (the art:
// client/art2/forage.js; the glowing ones light up the dark). The items and who buys them: shared/items.js.
//   KINDS[k]  { item, verb (the action prompt), n: [min, max] picked at once, glow (a light at night: [r, g, b]),
//              art (client/art2/forage.js kind; 'star' the tidepools' sea star), tip (said when you pick it) }
export const FORAGE_KINDS = {
  goldTrumpet: { item: 'goldTrumpet', verb: 'Pick the golden trumpets', n: [2, 4], art: 'goldTrumpet', tip: 'Good eating - the market in Old Town pays best.' },
  bunCap: { item: 'bunCap', verb: 'Pick the bun caps', n: [1, 3], art: 'bunCap', tip: 'Good eating - the market in Old Town pays best.' },
  shelfOyster: { item: 'shelfOyster', verb: 'Cut the shelf oysters off the log', n: [2, 3], art: 'shelfOyster', tip: 'Good eating - the market in Old Town buys them.' },
  redcap: { item: 'redcap', verb: 'Pick the redcap', n: [1, 1], art: 'redcap', tip: "Pretty, and poison - don't eat it. A pawn shop takes curiosities." },
  ghostglass: { item: 'ghostglass', verb: 'Pick the ghostglass caps', n: [1, 2], art: 'ghostglass', glow: [0.55, 0.75, 1], tip: 'Illegal. Only the Back-Alley Exchange buys them - get caught with them and the police take them.' },
  goldStar: { item: 'goldStar', verb: 'Lift the golden star from the pool', n: [1, 1], art: 'star', glow: [1, 0.8, 0.35], tip: 'A rare glowing sea star - collectors pay well (the pawn shop, or more at the Back-Alley Exchange).' },
};
// what to put at the foot of a giant redwood (by a hash u 0..1): mostly good eating, now and then a redcap
export function mushroomAtFoot(u) { return u < 0.42 ? 'goldTrumpet' : u < 0.74 ? 'bunCap' : 'redcap'; }
