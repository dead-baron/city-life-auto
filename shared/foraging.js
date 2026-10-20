// Foraging: what grows wild for the picking - mushrooms on the redwood floor of Highland Woods (at the feet of the
// giants, on the nurse logs, round the old stumps of the fairy rings) and the rare golden stars of the tidepools.
// The spots are laid out with the map (map.js redwoodGroves, naturesites.js tidepools: m.forage, { x, y, k }),
// picked on the server (server/systems/foraging.js: a few at a time, then the spot is bare until it grows back -
// rules.js FORAGE_REGROW_S), and drawn where they grow by the art v2 host while they're there (the art:
// client/art2/forage.js; the glowing ones light up the dark). The items and who buys them: shared/items.js.
//   KINDS[k]  { item, verb (the action prompt), n: [min, max] picked at once, glow (a light at night: [r, g, b]),
//              art (client/art2/forage.js kind; 'star' the tidepools' sea star), tip (said when you pick it),
//              needs (a tool it takes: 'pick' any pickaxe, or an item id - the trowel, the gold pan), rare: [item, p]
//              (now and then this instead), extra: [item, p] (now and then this as well), sting (the chance the bees
//              get you, taking a hive's comb by day) }
//
// The wilds' finds (Nature-D1, 2026-10-20), laid out with the map (map.js naturalFinds: some 2,300 across the
// wilds, each where it belongs), and what they're worth (items.js; who buys them in brackets):
//   berries    blackberries, blueberries, raspberries on the bushes at the woods' edges and in the meadows     $4 (market)
//   herbs      sage, mint and chamomile in the open meadows                                                      $7 (market)
//   hive       wild honeycomb in an old tree in the woods - the bees may sting                                 $28 (market)
//   truffle    black truffles under the trees of the woods - dug with a trowel                                $160 (market)
//   geode      in the rock of the desert's canyons and the peaks - with a pickaxe; now and then amethyst  $60 / $240 (assay, pawn)
//   fossil     a fern in the shale of the desert's rock - with a pickaxe; now and then an ammonite        $70 / $130 (pawn)
//   arrowhead  an old stone point lying in the desert's sand and washes                                         $45 (pawn)
//   mussels    river mussels in a river's shallows; now and then a pearl inside                         $3 / $210 (market / pawn)
//   goldpan    a gravel bar on a creek - panned with a gold pan: flakes, now and then a nugget          $16 / $90 (assay)
//   antler     a shed antler on the floor of the woods and the high meadows                                    $30 (the lodge, trappers)
//   feather    an eagle's feather by the lakes and the cliffs: protected - kept, or fletched into arrows, never sold
export const FORAGE_KINDS = {
  goldTrumpet: { item: 'goldTrumpet', verb: 'Pick the golden trumpets', n: [2, 4], art: 'goldTrumpet', tip: 'Good eating - the market in Old Town pays best.' },
  bunCap: { item: 'bunCap', verb: 'Pick the bun caps', n: [1, 3], art: 'bunCap', tip: 'Good eating - the market in Old Town pays best.' },
  shelfOyster: { item: 'shelfOyster', verb: 'Cut the shelf oysters off the log', n: [2, 3], art: 'shelfOyster', tip: 'Good eating - the market in Old Town buys them.' },
  redcap: { item: 'redcap', verb: 'Pick the redcap', n: [1, 1], art: 'redcap', tip: "Pretty, and poison - don't eat it. A pawn shop takes curiosities." },
  ghostglass: { item: 'ghostglass', verb: 'Pick the ghostglass caps', n: [1, 2], art: 'ghostglass', glow: [0.55, 0.75, 1], tip: 'Illegal. Only the Back-Alley Exchange buys them - get caught with them and the police take them.' },
  goldStar: { item: 'goldStar', verb: 'Lift the golden star from the pool', n: [1, 1], art: 'star', glow: [1, 0.8, 0.35], tip: 'A rare glowing sea star - collectors pay well (the pawn shop, or more at the Back-Alley Exchange).' },
  // Nature-D1: the wilds' finds
  berries: { item: 'wildBerries', verb: 'Pick the berries', n: [3, 6], art: 'brambleBerries', tip: 'Blackberries, blueberries and raspberries - eat them as you go, or the Old Town Market buys them.' },
  herbs: { item: 'wildHerbs', verb: 'Gather the herbs', n: [2, 4], art: 'meadowHerbs', tip: 'Sage, mint and chamomile - the Old Town Market buys wild herbs.' },
  hive: { item: 'wildHoneycomb', verb: 'Take the honeycomb', n: [1, 2], art: 'wildHoneycomb', sting: 0.45, tip: 'Wild honey - the Old Town Market pays well. (The bees are slower at night.)' },
  truffle: { item: 'blackTruffle', verb: 'Dig for truffles', needs: 'trowel', n: [1, 2], art: 'truffle', tip: 'Black truffles - the Old Town Market pays a fortune for them.' },
  geode: { item: 'geode', verb: 'Crack the geode out of the rock', needs: 'pick', n: [1, 1], art: 'geode', rare: ['amethystGeode', 0.2], tip: 'The assay office or a pawn shop buys geodes - an amethyst one for much more.' },
  fossil: { item: 'fossilFern', verb: 'Split the shale', needs: 'pick', n: [1, 1], art: 'fossil', rare: ['ammonite', 0.3], tip: 'A fossil - pawn shops buy them, and pay more for an ammonite.' },
  arrowhead: { item: 'arrowhead', verb: 'Pick up the old arrowhead', n: [1, 1], art: 'arrowhead', tip: 'An old stone point, long lost - pawn shops buy them.' },
  mussels: { item: 'riverMussels', verb: 'Gather the river mussels', n: [2, 4], art: 'rockMussels', extra: ['riverPearl', 0.12], tip: 'River mussels - the Old Town Market takes them. Now and then there\'s a pearl inside.' },
  goldpan: { item: 'goldFlakes', verb: 'Pan the gravel for gold', needs: 'goldPan', n: [1, 3], art: 'goldGravel', extra: ['nugget', 0.06], tip: 'Gold flakes - the assay office buys gold.' },
  antler: { item: 'antlerShed', verb: 'Pick up the shed antler', n: [1, 1], art: 'antlerShed', tip: 'A shed antler - the hunting lodges and the trappers buy them.' },
  feather: { item: 'eagleFeather', verb: 'Pick up the eagle feather', n: [1, 1], art: 'eagleFeather', tip: 'An eagle\'s feather. Eagles are protected - nobody may buy it, but it fletches fine arrows.' },
};
// the tool a find takes, by its needs: [what counts, its name]
export const FIND_TOOLS = { pick: [['pickStone', 'pickIron', 'pickSteel', 'pickDiamond'], 'a pickaxe'], trowel: [['trowel'], 'a garden trowel'], goldPan: [['goldPan'], 'a gold pan'] };
// what to put at the foot of a giant redwood (by a hash u 0..1): mostly good eating, now and then a redcap
export function mushroomAtFoot(u) { return u < 0.42 ? 'goldTrumpet' : u < 0.74 ? 'bunCap' : 'redcap'; }
