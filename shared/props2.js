// Street furniture drawn in code (client/render/newprops.js) rather than cut from a concept sheet:
// bus shelters, phone boxes, bollards, alley crates, AC units and trash piles. Their sizes (world px)
// join the generated PROP_SIZES so placement, smashing and drawing treat them like any other prop.
import { PROP_SIZES } from './prefab-data.js';

export const EXTRA_PROP_SIZES = {
  busstop: [96, 54], phonebox: [26, 40], bollard: [10, 16], crates: [40, 40], acunit: [34, 30],
  trashpile: [38, 26], billboard: [132, 84],
};
Object.assign(PROP_SIZES, EXTRA_PROP_SIZES);
