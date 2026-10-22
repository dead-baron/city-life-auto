// Player names (the owner's M9 note, 10-03: "optional account: ... a username"): a new character is "Guest" and four
// digits; Settings' account section changes it. What a name may be - the same check on the page (client/main.js) and on
// the server (server/systems/players.js rename), which also keeps names unique and changes no more often than gapS.
export const NAME = { min: 3, max: 16, gapS: 600, tryS: 2 };   // (tryS: a moment between attempts - each one looks through every profile)

// the game's own words, and someone else's guest number - looked for on the letters alone ("Admin_2", "Guest 1234"),
// and the long ones at the start too ("ModeratorBob", "OfficialSupport")
const RESERVED = /^(guest|admin|administrator|moderator|mod|staff|official|support|system|server|police|claude|anthropic|deadbaron|citylifeauto)$/;
const RESERVED_START = /^(admin|moderator|official|anthropic|deadbaron|citylifeauto)/;
// unmistakable abuse, looked for with the letters run together and the usual digit swaps undone (only words that don't
// turn up inside ordinary names - "Saltwater", "Swanky")
const BAD = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'whore', 'hitler', 'retard', 'kkk'];

// one name with another's look: the same letters and digits, any case, separators aside ("Big_Al" is "big al")
export function nameKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

export function cleanName(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (s.length < NAME.min || s.length > NAME.max) return { err: `A name is ${NAME.min} to ${NAME.max} characters.` };
  if (!/^[A-Za-z][A-Za-z0-9 _.-]*$/.test(s)) return { err: 'Letters, numbers, spaces, dots, dashes and underscores only - and it starts with a letter.' };
  const flat = s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
  const letters = s.toLowerCase().replace(/[^a-z]/g, '');
  if (RESERVED.test(letters) || RESERVED.test(flat) || RESERVED_START.test(letters) || RESERVED_START.test(flat)) return { err: 'That name belongs to the game - pick another.' };
  if (BAD.some((w) => flat.includes(w))) return { err: 'Pick another name.' };
  return { name: s };
}
