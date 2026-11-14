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
  emoteS: 2,              // an emote's animation on the body (moving cuts it short)
  inboxMax: 30, contactsMax: 100, logMax: 60,
  strikesToMute: 3, muteH: 24, filterStrikeGapS: 600,
  reportsToStrike: 3, reportWindowH: 24, reportGapS: 30,
};
// The emotes (the owner, 2026-11-13: apart from chat, a button of their own; "an emoji that pops up instead of text"):
// emoji - what pops up over the head (no words there); text / me - the line in the chat log of the people near ("Ann
// waves") and your own ("You wave"); every one but dance plays a short animation on the body (server/systems/emote.js,
// emoteS seconds: the descriptor's gt 'emote' and em, its id - client/art2/dances.js poses it). Dance
// starts the dance button's own dance (server/systems/dance.js) and puts "Ann started dancing" in the log: no emoji.
export const EMOTES = {
  wave: { n: 'Wave', emoji: '\u{1F44B}', text: 'waves', me: 'wave' }, cheer: { n: 'Cheer', emoji: '\u{1F64C}', text: 'cheers', me: 'cheer' },
  laugh: { n: 'Laugh', emoji: '\u{1F602}', text: 'laughs', me: 'laugh' }, thumbs: { n: 'Thumbs up', emoji: '\u{1F44D}', text: 'gives a thumbs up', me: 'give a thumbs up' },
  point: { n: 'Point', emoji: '\u{1F449}', text: 'points', me: 'point' }, shrug: { n: 'Shrug', emoji: '\u{1F937}', text: 'shrugs', me: 'shrug' },
  dance: { n: 'Dance', emoji: '', text: 'started dancing', me: 'started dancing' }, clap: { n: 'Clap', emoji: '\u{1F44F}', text: 'claps', me: 'clap' },
  facepalm: { n: 'Facepalm', emoji: '\u{1F926}', text: 'facepalms', me: 'facepalm' }, salute: { n: 'Salute', emoji: '\u{1FAE1}', text: 'salutes', me: 'salute' },
  sorry: { n: 'Sorry', emoji: '\u{1F647}', text: 'apologizes', me: 'apologize' }, angry: { n: 'Angry', emoji: '\u{1F620}', text: 'is angry', me: 'are angry' },
};
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
