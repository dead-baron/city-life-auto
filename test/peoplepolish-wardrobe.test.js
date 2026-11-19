// The character polish pass switched on (docs/characters/NOTES.md), then everything the look system's own tests ask of
// today's people asked again of the polished ones: every hairstyle, face option, mark, piece and build draws; a held item
// never breaks the face; no two hairstyles alike; the eye colours show; every pair of glasses and every face option shows
// at the game's size; the newer outfits change the figure.
import { setPolish } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
setPolish(POLISH);
await import('./peoplelook.test.js');
await import('./outfits.test.js');
