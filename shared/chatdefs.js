// Chat (the owner, 11-03): the channels, the emotes and the limits - read by the server (server/chat.js) and the page
// (client/chat.js). No global or district chat: you talk to people near you, your crew, your faction, and by phone
// to the people you've met.
//   near    - proximity text, about 40 m, as speech bubbles over heads and a line in the log
//   crew    - your crew (free text)
//   faction - police on duty, or the gang you're in (biker groups: FACTIONS.biker, off until they exist)
//   phone   - a message to one contact (someone you've met, traded or crewed with) or a crewmate, anywhere; kept
//             for them while they're offline
export const CHANNELS = ['near', 'crew', 'faction', 'phone'];
export const CHAT = {
  nearM: 40,              // proximity chat reaches this far (1 tile = 1 m = 32 px)
  metM: 15,               // someone this close for metS seconds becomes a contact
  metS: 4,
  maxLen: 200, guestMaxLen: 120,
  // per player: lines a window (all channels together) - guests get less
  rate: { n: 6, s: 10 }, guestRate: { n: 3, s: 10 },
  phoneRate: { n: 20, s: 60 }, guestPhoneRate: { n: 5, s: 60 },
  dupS: 20,               // the same line again this soon is dropped
  emoteGapS: 2,           // one emote this often at most
  emoteS: 2,              // an emote's animation on the body (moving cuts it short; EMOTES' s for the longer ones)
  balloonS: 2,            // an emote's balloon over the head: pops up, holds, blinks out - the bounty skull gives way meanwhile
  zzzS: 5,                // asleep (the Sleep pose): the Zzz balloon again this often
  bubbleMax: 48,          // a line said near you longer than this goes to the chat log only, not a speech bubble (QUICK lines always bubble)
  typingS: 6,             // the typing dots over a head go after this long with no word from the page that it's still typing
  inboxMax: 30, contactsMax: 100, logMax: 60,
  strikesToMute: 3, muteH: 24, filterStrikeGapS: 600,
  reportsToStrike: 3, reportWindowH: 24, reportGapS: 30,
};
// The emotes (the owner, 2026-11-13: apart from chat, a button of their own; round 2, 11-13: "emotes are body animations
// first"). Every one plays on the body (server/systems/emote.js: the descriptor's gt 'emote' and em, its id -
// client/art2/dances.js and poses.js pose it) for s seconds (CHAT.emoteS when not given), or - hold - until you move.
// tab: the picker's tab ('emote' | 'pose'; the Dances tab is DANCES below; none: not in the picker). b: the pixel
// balloon over the head (client/emotes.js BALLOONS) - only where it adds meaning: a laugh, anger, love, ?, !, sorry,
// sleep, an idea. log: a line in the log of the people near ("Ann sat down") - dancing and the lasting poses only, no
// log spam for the rest. text / me: that line for the people near and your own. The server decides who's sent what
// (server/chat.js emote: emoteWire).
export const EMOTES = {
  wave: { n: 'Wave', tab: 'emote', text: 'waves', me: 'wave' },
  cheer: { n: 'Cheer', tab: 'emote', text: 'cheers', me: 'cheer' },
  laugh: { n: 'Laugh', tab: 'emote', b: 'haha', text: 'laughs', me: 'laugh' },
  thumbs: { n: 'Thumbs up', tab: 'emote', text: 'gives a thumbs up', me: 'give a thumbs up' },
  love: { n: 'Love', tab: 'emote', b: 'heart', text: 'loves it', me: 'love it' },
  huh: { n: 'Huh?', tab: 'emote', b: 'question', text: 'is puzzled', me: 'are puzzled' },
  wow: { n: 'Wow!', tab: 'emote', b: 'exclaim', text: 'is surprised', me: 'are surprised' },
  idea: { n: 'Idea', tab: 'emote', b: 'idea', text: 'has an idea', me: 'have an idea' },
  point: { n: 'Point', tab: 'emote', text: 'points', me: 'point' },
  shrug: { n: 'Shrug', tab: 'emote', text: 'shrugs', me: 'shrug' },
  clap: { n: 'Clap', tab: 'emote', text: 'claps', me: 'clap' },
  facepalm: { n: 'Facepalm', tab: 'emote', text: 'facepalms', me: 'facepalm' },
  salute: { n: 'Salute', tab: 'emote', text: 'salutes', me: 'salute' },
  sorry: { n: 'Sorry', tab: 'emote', b: 'sweat', text: 'apologizes', me: 'apologize' },
  angry: { n: 'Angry', tab: 'emote', b: 'anger', text: 'is angry', me: 'are angry' },
  dance: { n: 'Dance', log: 1, text: 'started dancing', me: 'started dancing' },   // (the Dances tab, the dance button)
  sit: { n: 'Sit', tab: 'pose', hold: 1, log: 1, text: 'sat down', me: 'sat down' },
  lie: { n: 'Lie down', tab: 'pose', hold: 1, log: 1, text: 'lay down', me: 'lay down' },
  sleep: { n: 'Sleep', tab: 'pose', hold: 1, log: 1, b: 'zzz', text: 'fell asleep', me: 'fell asleep' },
  phone: { n: 'Scroll phone', tab: 'pose', hold: 1, log: 1, text: 'is on their phone', me: 'are on your phone' },
  lean: { n: 'Lean', tab: 'pose', hold: 1, log: 1, text: 'leans back', me: 'lean back' },
  crouch: { n: 'Crouch', tab: 'pose', hold: 1, log: 1, text: 'crouches down', me: 'crouch down' },
  kneel: { n: 'Kneel', tab: 'pose', hold: 1, log: 1, text: 'kneels', me: 'kneel' },
  faceplant: { n: 'Faceplant', tab: 'pose', s: 3, text: 'faceplants', me: 'faceplant' },
  pushups: { n: 'Push-ups', tab: 'pose', s: 4, text: 'does push-ups', me: 'do push-ups' },
  flex: { n: 'Flex', tab: 'pose', s: 3, text: 'flexes', me: 'flex' },
  cry: { n: 'Cry', tab: 'pose', s: 3, text: 'cries', me: 'cry' },
  beckon: { n: 'Come here', tab: 'pose', s: 2.5, text: 'beckons', me: 'beckon' },
  watch: { n: 'Check watch', tab: 'pose', s: 2.5, text: 'checks the time', me: 'check the time' },
  guitar: { n: 'Air guitar', tab: 'pose', s: 3, text: 'plays air guitar', me: 'play air guitar' },
  stretch: { n: 'Stretch', tab: 'pose', s: 3, text: 'stretches', me: 'stretch' },
};
// the picker's Dances tab: the dance button's moves (shared/dance.js DANCE_PLAYER), one each - { t: 'emote', e: 'dance',
// m: its index here } starts that very move (server/systems/dance.js start)
export const DANCES = ['Two-step', 'Bounce', 'Fist pump', 'Disco point', 'Spin', 'Toprock', 'Robot', 'Freeze', 'Sway', 'Jump'];
// what the people near are sent for an emote, beyond who and which (server/chat.js, systems/director.js): its balloon,
// and whether it goes in their log - nothing at all for one with neither (the body says it)
export function emoteWire(e) {
  const E = Object.hasOwn(EMOTES, e) ? EMOTES[e] : null;
  return E ? { ...(E.b ? { b: E.b } : null), ...(E.log ? { lg: 1 } : null) } : null;
}
// the pad's quick radial (hold LB: client/emotes.js): its slots clockwise from the top - type a line (the on-screen
// keyboard), the near quick lines by their index in QUICK.near, emotes, and More (every emote: the phone's Emote screen)
export const RADIAL = ['type', 'q:0', 'q:4', 'q:2', 'q:3', 'q:5', 'e:wave', 'e:laugh', 'e:thumbs', 'e:love', 'e:huh', 'more'];
// the factions that have a chat: biker groups don't exist yet (the owner, 11-04) - their channel waits behind this flag
export const FACTIONS = { police: true, gang: true, biker: false };
export const REPORT_WHY = ['hate', 'sexual', 'harassment', 'spam', 'cheating', 'name', 'other'];
export const REPORT_LABEL = { hate: 'Hate speech', sexual: 'Sexual content', harassment: 'Harassment or bullying', spam: 'Spam', cheating: 'Cheating', name: 'An offensive name', other: 'Something else' };
// The quick lines (the chat's chips and the phone's Messages app - a pad or a thumb picks one, no typing): each goes as an
// ordinary line of its channel, through the same filter and limits as anything typed. The crew's are the Crew app's
// own (shared/rules.js CREW.says reads them from here).
export const QUICK = {
  near: ['Hi!', 'Need a ride?', 'Follow me', 'Wait up!', 'Thanks!', 'Sorry!', 'Nice ride!', 'Race you?', 'Watch out!', 'Bye!'],
  crew: ['On my way!', 'Need backup!', 'Meet me where I am', 'Go go go!', 'Get in!', 'Lie low for a bit', 'Nice one!', 'Thanks!'],
  faction: ['Need backup!', 'On my way!', 'Heads up - trouble here', 'All clear', 'Fall back!', 'Good work'],
  phone: ['Hey!', 'Where are you?', 'On my way', 'Want to team up?', 'Thanks!', 'Later!'],
};
