// Player names (the owner's M9 note, 10-03: "optional account: ... a username"): a new character is "Guest" and four
// digits; Settings' account section changes it. What a name may be - the same check on the page (client/main.js) and on
// the server (server/systems/players.js rename), which also keeps names unique and changes no more often than gapS.
export const NAME = { min: 3, max: 16, gapS: 600 };

// the game's own words, and someone else's guest number
const RESERVED = /^(guest\d*|admin|administrator|moderator|mod|staff|official|support|system|server|police|claude|anthropic|deadbaron|citylifeauto)$/;
// unmistakable abuse, looked for with the letters run together and the usual digit swaps undone
const BAD = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'whore', 'hitler', 'retard', 'twat', 'wank', 'kkk'];

export function cleanName(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (s.length < NAME.min || s.length > NAME.max) return { err: `A name is ${NAME.min} to ${NAME.max} characters.` };
  if (!/^[A-Za-z][A-Za-z0-9 _.-]*$/.test(s)) return { err: 'Letters, numbers, spaces, dots, dashes and underscores only - and it starts with a letter.' };
  const flat = s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
  if (RESERVED.test(s.toLowerCase().replace(/[ _.-]/g, '')) || RESERVED.test(flat)) return { err: 'That name belongs to the game - pick another.' };
  if (BAD.some((w) => flat.includes(w))) return { err: 'Pick another name.' };
  return { name: s };
}
