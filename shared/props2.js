// Street furniture drawn in code (client/render/newprops.js) rather than cut from a concept sheet:
// bus shelters, phone boxes, bollards, alley crates, AC units and trash piles. Their sizes (world px)
// join the generated PROP_SIZES so placement, smashing and drawing treat them like any other prop.
import { PROP_SIZES } from './prefab-data.js';

export const EXTRA_PROP_SIZES = {
  busstop: [96, 54], phonebox: [26, 40], bollard: [10, 16], crates: [40, 40], acunit: [34, 30],
  trashpile: [38, 26], billboard: [132, 84],
  // out in the country (shared/countryside.js, client/render/country.js)
  tent: [44, 34], campfire: [24, 20], picnic: [38, 30], upole: [18, 58], radiotower: [50, 172], turbine: [30, 186],
  pumpjack: [130, 90], otank: [100, 108], flare: [20, 82], solar: [64, 30], dscreen: [210, 132], dspeaker: [10, 18],
  dome: [200, 172], scope: [16, 26], marquee: [84, 76], rwlight: [8, 8],
};
Object.assign(PROP_SIZES, EXTRA_PROP_SIZES);
