// Chat (the owner, 11-03): the channels, the emotes and the limits - read by the server (server/chat.js) and the page
// (client/chat.js). No global or district chat: you talk to people near you, your crew, your faction, and by phone
// to the people you've met.
//   near    - proximity text, about 40 m, as speech bubbles over heads and a line in the log
//   crew    - your crew (free text)
//   faction - police on duty, or the gang / biker group you're in
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
  emoteGapS: 2,
  inboxMax: 50, contactsMax: 200, logMax: 60,
  strikesToMute: 3, muteH: 24, filterStrikeGapS: 600,
  reportsToStrike: 3, reportWindowH: 24, reportGapS: 30,
};
export const EMOTES = {
  wave: { n: 'Wave', text: 'waves' }, cheer: { n: 'Cheer', text: 'cheers' }, laugh: { n: 'Laugh', text: 'laughs' },
  thumbs: { n: 'Thumbs up', text: 'gives a thumbs up' }, point: { n: 'Point', text: 'points' }, shrug: { n: 'Shrug', text: 'shrugs' },
  dance: { n: 'Dance', text: 'dances' }, clap: { n: 'Clap', text: 'claps' }, facepalm: { n: 'Facepalm', text: 'facepalms' },
  salute: { n: 'Salute', text: 'salutes' }, sorry: { n: 'Sorry', text: 'apologizes' }, angry: { n: 'Angry', text: 'is angry' },
};
export const REPORT_WHY = ['hate', 'sexual', 'harassment', 'spam', 'cheating', 'name', 'other'];
