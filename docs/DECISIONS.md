# City Life Auto - decisions register

The owner's standing decisions, one line each: the decision, its date, its source.

## How this is used
- **Every job reads this file before starting** and follows it. A brief that contradicts a line here is checked with
  the owner first.
- **A new owner decision goes in here in the same change** (in chat, or settled with him during a job): one line under
  its topic, with its date and source. The lead also adds the decisions made in chat.
- **Nothing is deleted.** A reversed decision stays, marked `SUPERSEDED by ...`. An undecided question is marked `OPEN`.
  When sources disagree, the latest wins and the line says so.
- Sources: `DEVLOG mm-dd` = docs/DEVLOG.md entry of that date; `launch-plan 11-03`, `ftue-design 11-04`,
  `decisions-11-14`, `beta-checklist 11-14`, `monetization-plan 11-13` = the claude.ai project docs
  (`claude/...`); `queue` = the lead's job queue (owner lines from chat); `chat` = told to Claude in chat;
  PROGRESSION.md, WORLD-V3.md, DESIGN-NOTES.md, ARCHITECTURE.md = docs/.
- First built 2026-11-14 from the repo docs, the DEVLOG, the queue and the lead's notes. The decision docs
  decisions-10-11, 11-04 and 11-06 were added by the lead the same day.

## Product and launch
- Path: public beta (= Season 0), then the official launch (= Season 1); everything wiped before the official launch. (11-07; PROGRESSION.md, chat)
- The beta is a testing phase: progress-safety measures can wait for the official launch. (11-08; chat)
- A season ends only when the owner ends it (admin `season` command), never by itself. (11-08; DEVLOG 11-08)
- Season length about 10 weeks. (11-07; PROGRESSION.md)
- Beta gift: "Founding Citizen" jacket + gold "Beta" plate, tied to the account, survives the wipe. (11-07; PROGRESSION.md) - the plate by the name SUPERSEDED 11-16: no Beta plate on name tags; the plate stays on the player's own card (Skills badges), the jacket unchanged.
- Name tags show just the name (no "beta" tag); guests told apart without the word - members bright white with a dark edge, guests softer grey without it (lightness, not hue). (11-16; chat: "we don't need to have the 'beta' tag on every player like that")
- The game is for players 13+ (under 18 with a parent or guardian's permission): the age gate at first launch says so (`CLA_REQUIRE_AGE`; the stored field keeps its name age17), the Terms describe the content plainly (crime, shooting, cartoon blood, chases, chat with strangers) with a parents' contact line, the Privacy Policy says not for under-13s. An open, easy beta: no new gates, game content unchanged; age checks and platform rules revisited before full launch. The Discord is 13+ too, no age-restricted channels for now. (11-15; chat, DEVLOG 11-15) - SUPERSEDES "rated 17+" (11-04).
- No kids in the game at all; no schools or colleges. (10-16; chat, DEVLOG 10-17)
- Beta plan: after the running jobs - polish fixes, a bug reporter, the character polish pass, beta hardening - then FEATURE FREEZE. (11-14; beta-checklist 11-14*, queue)
- Bug reporter: "Report a bug" in pause menu + phone (text, optional screenshot, location, device, build, fps, errors); stored on server, listed at /admin; optional Discord webhook. (11-14; queue)
- Nightly backup of the server's data dir (~/cla-backups, the newest 14, owner-readable only); bug reports in /admin/bugs and the Discord's #bug-reports (webhook); the Discord invite a config value (`CLA_DISCORD_INVITE`). (11-14 23:54; queue)
- Beta hardening: `CLA_DEV_OPEN=0`, full test run, worldmap picture rebuilt, a bot load test of the server, Discord/community links in Settings/title. (11-14; queue)
- Open debug mode stays while testing; at launch it closes (`CLA_DEV_OPEN=0`) and admin mode takes over. (11-03; launch-plan 11-03)
- Claim the owner account, then `CLA_DEV_OPEN=0` (strangers are already in the game). (11-12; queue)
- Hosting stays free for now (Oracle Always Free, 2 OCPU / 12 GB; may go to 4 / 24); scale later. (10-15; chat, DEVLOG 11-07)
- A city holds 100 players at once (`CLA_MAX_PLAYERS`); past it, a line at the door on the title ("The city's full - you're #3 in line", Cancel), first come first served; staff and players back within ~2 min (a drop, a restart) skip it; the line itself capped (200: "try again in a few minutes"). Later several cities - a line that's often long is the signal to add one. (11-17; chat)
- Later platforms: Android, iOS, Xbox, Steam, Epic, with cross-play, once the web version is locked down. (11-03; chat)
- Marketing: trailers and devlog videos on TikTok, YouTube, LinkedIn; posts on Reddit and Discord, pointing to the web beta; traditional campaigns at platform launch. (11-13; chat)
- Priority order (11-14): police low stars -> Sandpiper water -> casinos + watchable games -> weapons stash + valet -> director scripts + arena art -> beta readiness. (11-14; decisions-11-14*, queue)
- Treasure hunting is the first new feature after launch prep. (11-03; launch-plan 11-03)
- Full progress reset when the FTUE shipped, as a progress-epoch bump; a future full reset (e.g. at launch) is one more bump; account records (sign-ins, roles, bans, mutes) kept. (11-04; decisions-11-04)
- Start fresh on a signed-in account resets progress and keeps the account; kicked or banned pages stop reconnecting. (11-04; decisions-11-04)
- /perf and /clienterrors behind the owner/admin login (clients can still post errors). (11-04; decisions-11-04)

- App icon: the neon logo (City Life over Auto, the skyline) on a navy-to-magenta dusk, from the title art (assets/icons; option A of four). (11-17; chat)
## Accounts, sign-in and privacy
- One account, many sign-ins; our own account record with providers linked. (11-03; launch-plan 11-03)
- Sign-ins: Guest, Email + password, Google, Discord. Reddit and email magic links OUT. (11-12; DEVLOG 11-12) - SUPERSEDES the 11-03 lineup (Google, Discord, magic link).
- Guests play at once; "Link to this account" later keeps all progress. (11-12; DEVLOG 11-12)
- Guests may pick/rename (filtered) but can't take a name a member owns; on sign-up the name is kept if free, then protected. (11-12; queue) - SUPERSEDES "guests stay GuestNNNN, can't rename" (11-03).
- Guest names: soft grey over the head (members bright white), role colors a dimmer shade; "Guest" only on the player card; no tag, no symbol. (11-12 12:30; queue) - SUPERSEDES the "guest" tag (11-12 12:11).
- Guests can't start or lead a crew or post bounties; tighter chat limits. (11-03; launch-plan 11-03, DEVLOG 11-04)
- Usernames: filtered, unique, 3-16 characters, changeable once a month. (11-03; launch-plan 11-03)
- A guest transfer code moves a guest to another device. (11-03; launch-plan 11-03)
- Email: "game news" opt-in checkbox, unchecked; email stored only when ticked; unsubscribe link + Settings toggle. Provider email scope only for the opt-in. (11-12; queue)
- The owner wants to be able to email (opted-in) players. (11-12; queue)
- Roles: owner (grants admin/helper), admin (debug powers, kick, ban, mute), helper (refund, rescue, restore); every privileged action in an append-only, hash-chained admin log. (11-03; launch-plan 11-03)
- Admin angel: opt-in arrival (beam, wings), can't hurt or be hurt while in it; incognito admins are normal players with logged powers. (11-03; launch-plan 11-03) - not built.
- The founder (the owner's account only): a gold crown by his name for everyone, in any look, and "Founder" on his card. (11-16; chat)
- The Dead Baron look (skeleton, cyan angel wings, round pink glasses, in the game's own people art) is an outfit he puts on for fun, not his character: his regular character every time he plays; on only with the admin panel's switch, off when he switches it off or logs in again (never saved); admin mode alone doesn't put it on. (11-16; chat) - SUPERSEDES "in admin mode his character is the avatar" (11-16, earlier the same day).
- Admin tools in one place: an in-game admin panel (admin mode, the debug menu's first tile) - watch a player or the free camera, go to / bring / send a player to a place, heal, revive, unstick, end a stuck job, gift money / items / weapons / bought cosmetics, mute / prison / kick / ban - every power server-checked and in the admin log. (11-16; chat)
- The owner's console at /admin/ (admins and the owner): live Now, Trends (1 h to 7 days), Where from, Moderation, Server and the older tools as one page, phone and desktop; no IP, email or account id on it; country from the address (DB-IP Lite, CC BY 4.0) or the device's time zone, the address never stored. (11-16; chat: "a real-time look at what's currently happening ... for me only")
- Analytics: self-hosted, server events, a private owner dashboard; consent asked at first launch. (11-03; launch-plan 11-03, DEVLOG 11-04)
- Anti-cheat: server authority plus movement audits, rate limits, economy anomaly flags, bans; no client obfuscation. (11-03; launch-plan 11-03)
- Legal: ToS / privacy / in-game notice drafts (mature themes, online interactions not rated, never share personal info); a lawyer reviews before money changes hands. (11-03; launch-plan 11-03)
- Safe exit: LOG OFF = 10 s still countdown; instant in your own property or a hotel room; not while wanted or within 60 s of combat. (11-03; launch-plan 11-03, DEVLOG 11-04)
- Prison: an admin can send a misbehaving player there. (11-07; DEVLOG 11-07)
- Google and Discord appear as the standard provider buttons ("Continue with Google" with Google's G, Discord's blurple), above email and password; Google is set up openid-only and in production, no branding verification for now (the consent screen shows the domain); deadbaron.com/city-life-auto/about/ is the public home page for when it's verified. (11-14; chat)
- No postal address yet: no news emails until there is one (a PO box or a virtual mailbox, not his home); password resets and confirm emails don't need one. (11-14; chat)
- The player Discord: https://discord.gg/zuVSkbfjg (never expires), linked from the title screen (a small button), Settings and the About page; bug reports post to its #bug-reports. Server plan: Claude Doc "City Life Auto Discord server plan". (11-15; chat)
- The title screen has no neon sign sound; its music is fetched ahead so it starts on the first tap, click or key (browsers allow no sound before one). (11-15; chat)
- Touch: the right thumb's spot over the aim stick never sits empty - with nothing to act on, the vehicle button (GET IN / GET ON / EXIT / OFF) takes ACT's place there, in its own green; frequent buttons stay round the stick, rare ones at the edges. (11-15; chat)
- Signed in, the title card says ACCOUNT (not SIGN IN) and the note says progress is saved to the account; the panel offers Sign out (this device becomes a new guest; the account kept in Switch back to) and Switch account. (11-15; chat)
- The Privacy Policy and the Terms show no "DRAFT - not yet reviewed by a lawyer" banner for now (Google's brand review); a lawyer still looks them over before full launch. (11-15; DEVLOG 11-15)
- Players delete their own account (Settings > Account > Delete account, two taps): out of the game at once, restorable for ACCOUNT.deleteDays (30) - RESTORE on the title, or staff's undelete - then erased automatically. No deleting by email; the contact address stays only as a fallback for parents who can't get in. The owner's account can't be deleted this way. (11-15; chat, DEVLOG 11-15)
- The server's analytics daily totals are kept two years (was 90 days); the privacy page says GA keeps 14 months (the owner sets GA's retention to 14 months). (11-15; chat)
- No Credits section on the privacy page (game-icons.net isn't used; Kenney's prompt tiles are CC0, credit not required - their LICENSE files stay in the code). (11-15; chat)
- Usernames: free renames for everyone (only the 10 minutes between changes; was 30 days for members - a 7-day wait maybe later, `USERNAME_GAP_DAYS`). No hoarding: you hold only the name you have, plus the one you just dropped for 24 hours (nobody grabs it to pass as you). Every account keeps its name history, shown to staff on the Players page; admins and the owner also have "Let them change their name now". (11-15; chat)
- The owner's account may use the game's reserved names (DeadBaron); everyone else can't. (11-14; chat)
- Guests can't lead or create crews or post bounties - enforced once a sign-in provider is enabled. (11-04; decisions-11-04)
- An email sign-in link attaches a sign-in to an account only in the browser that asked for it. (11-04; decisions-11-04) - SUPERSEDED by email+password, magic links removed (11-12).

## Chat and emotes
- No global chat and no district chat; phone messages to contacts you've met instead. (11-03; launch-plan 11-03, DEVLOG 11-04)
- Channels: proximity (~40 m, bubbles + log), crew, faction (police on duty, your gang), phone; each toggles. (11-03; launch-plan 11-03)
- The biker faction channel waits until biker groups exist. (11-04; DEVLOG 11-04)
- Moderation: word filter (hate/sexual masked, variants caught), rate limits, mute/block/report, strikes (3 = 24 h chat mute). (11-03; launch-plan 11-03)
- Chat on every device; on touch the chat button sits by the left thumb. (11-12; DEVLOG 11-12, queue)
- Emotes are separate from chat, with their own button. (11-13; DEVLOG 11-13)
- Speech bubbles clear above the head, bigger text, a small pop; quick phrases as bubbles, long typed lines to the log (or a capped bubble). (11-13; queue)
- Keep the chat and name filter as it is; report and block easy to find; a block can be undone (an Undo right after, Unblock in Messages' Blocked list and Settings > Chat). (11-15; chat, DEVLOG 11-17)
- Friends: a way to add a specific person (crews are only 4) - a request, Accept / Decline; friends starred and first in the contacts, never pushed out. (11-15; chat, DEVLOG 11-17)
- Contact details (phone numbers, emails, links other than ours, street addresses, social handles) masked in every chat line; lines fishing for personal info (age, home, school, real name, photos, another app) flagged to the staff's Review list, not blocked. (11-15; chat, DEVLOG 11-17)
- Messaging privacy: "Remove contact" and a "Who can text me" choice (everyone I've met / friends and crew only). (11-15; chat, DEVLOG 11-17)
- Typing indicator: three dots pulsing in a small bubble, no word "typing". (11-13; queue)
- No Unicode emoji over heads: our own 16x16 pixel emotion balloons in the game palette (Kenney CC0 as base, credited). (11-13; queue)
- Imanor balloon sheets: animation timing reference only until the license is known. (11-13; queue) - OPEN: license.
- Balloon animation: SNES pop and settle in place, ~1.5 s hold, blink out - not floating high. (11-13; queue) - exit SUPERSEDED 11-14 (below).
- Balloons go out with expression, not a blink: a small expression while they hold (heart beats, ! jolts, ? tilts...), then a squash up and a pop (heart, laugh, idea: pixel sparkles) or a shrink into the tail; the typing dots and speech bubbles shrink away too. (11-14 18:56; chat)
- The bounty skull hides while a balloon shows, then comes back. (11-13; queue)
- Emotes are body animations first; a balloon only where it adds meaning (laugh, angry, love, ?, !, sweat, sleep). (11-13; queue)
- "Come here" reads as a beckon: the balloon a hand with its finger crooked toward you (motion ticks), the pose an arm out toward the camera, palm up, the fingers curling in twice - not a point or a pull. (11-14 19:27; queue) - SUPERSEDED 11-14 20:46 (below).
- "Over here" replaces "Come here": the character points down at the spot beside them twice; the balloon a bold down arrow bouncing twice. (11-14 20:46; chat)
- Picker tabs: Emotes / Dances / Poses; lasting poses hold until you move; only lasting poses log to nearby chat. (11-13; queue)
- Desktop gets an emote button by Chat; controller gets a hold-to-open radial for quick lines and emotes. (11-13; queue)
- Emotes round 3 (LOL/LMAO/ROFL, new dances, NPC emotes): DEFERRED. (11-14; decisions-11-14*, queue)
- Biker faction chat hidden behind a flag until biker groups exist. (11-04; decisions-11-04)
- Your own log stays quiet for emotes and dances: one line when you start dancing, none per move or per emote. (11-14; chat)

## Monetization
- Never sell power: ads and cosmetics only. (11-03; launch-plan 11-03, monetization-plan 11-13*)
- Keep an ongoing monetization plan doc plus a one-page summary. (11-13; chat)
- Plan of 11-13: Job Center computer (watch ads for in-game cash, capped a day); pause ads at death screen / safe exit, none in a first session; Supporter pack; cosmetics + season pass; ad-free upgrade; donations. (11-13; monetization-plan 11-13*) - OPEN: owner still weighing the model per platform.
- 11-03's "one death-screen interstitial per 15-20 min" is folded into the 11-13 pause-ad plan. (11-13; monetization-plan 11-13*)
- Free on every platform; order web beta -> web game portals -> Android/iOS -> Steam/Epic -> Xbox, each only once the last retains players. (11-13; monetization-plan 11-13*) - plan.
- Donate / tip button "Support Dead Baron" on title and Settings. (11-03; launch-plan 11-03) - SETTLED 11-16: Ko-fi.
- Donations through Ko-fi (ko-fi.com/deadbaron, 0% on donations): "Buy a ❤️ for Dead Baron", $3 a heart; a SUPPORT button on the title and "Support the game" in Settings (CLA_SUPPORT_URL, "off" hides them for portal builds). Ads: apply now, no interrupting ads in the beta (opt-in rewarded ads only once approved). (11-16; chat)
- Supporters get a Discord role through Ko-fi's Discord rewards (one-time supporters included); cosmetic thanks only, never gameplay. (11-16; chat)
- Ads account (AdSense / Ad Placement API) is the owner's sign-up. (11-03; launch-plan 11-03) - OPEN: when.

## HUD and controls
- Car soccer: no goal replay (it confused) - a goal shows GOAL! and the scorer, the ball stays in the net, then kick-off puts the ball and every car back at the start. (11-17 21:05; chat)
- Minimal HUD: a dot or one fading line, never a new on-screen panel; new UI lives in the phone. (10-24; agent-rules, chat)
- World events (someone collapsed, a fire...): no arrow pointing at them off screen - you see one when it's on screen, marked by an SNES-style pixel highlight (corner brackets and a chevron in its colour); the radar still shows them. (11-17 20:34; chat)
- Nothing lingers: prompts fade after a few s, big moments go by themselves (2.6 s), sit long and the UI fades. (10-10; DEVLOG 10-10, 11-03, 11-04)
- The touch sticks' behavior is untouchable (layout may move, behavior may not). (10-24; agent-rules, queue 11-06)
- The aim stick stays (drag-to-aim on FIRE was rejected). (10-24; DEVLOG 10-24)
- Every screen and mode has a way to back out on every device and control scheme. (11-12; chat, queue)
- Back and close in the same place on every screen. (11-03; DEVLOG 11-03 UI-10)
- Portrait stays fully playable (no landscape-only). (11-12; queue)
- HUD look: Direction A, the SNES pad - navy panels, gold rim, CLA Pixel everywhere in the HUD. (11-12; DEVLOG 11-12)
- Button rule: a fixed action gets a simple symbol (FIRE crosshair, ROLL chevrons), a situational one gets a word (ACT shows its verb, BRAKE...). (11-12 19:28; queue) - SUPERSEDES words-only (19:26), symbols + chips (19:22), game-icons silhouettes (17:29).
- The vehicle button: simple enter/exit door symbols; GET IN / ON / EXIT / OFF words only in tips and the Guide. (11-12 19:37; queue)
- Button sizes 60 / 52 / 40 px, translucent navy with an accent rim, one word size, measured centering. (11-12; queue)
- ACT shows only while a prompt names it. (11-13; DEVLOG 11-13)
- On touch the prompt's card has no button chip (the ACT button says the verb; nothing on the card looks pressable), sits in clear space - upright above the cluster's buttons, never under one - and is two lines at most, never cut in a word. (11-14; chat: "it looks like you're supposed to press the popup because it has a button in it", DEVLOG 11-14)
- Touch buttons never touch: 6 px clear between any two, 12 round ACT (its pulse ring), at every layout; the sticks unchanged. (11-14; chat: "the act or look button overlaps the other button so it's a little too close together", DEVLOG 11-14)
- Right aim stick stays in the corner, action buttons on arcs round it; in portrait a tight thumb cluster. (11-12; queue, DEVLOG 11-06)
- The Clean (Lucide) icon line kept; the pixel icon set does NOT ship (branch pixelicons unmerged). (11-06; queue)
- HIT shows what you hit with (fist bare-handed, else the weapon). (11-05; DEVLOG 11-05)
- Buy/sell/pay button shows "$", not coins; FIRE ON shows an auto-fire symbol, not infinity. (11-06; queue)
- Gamepad: RT fires, right stick only aims (stick-full-fire is an option, off by default); RB/LB tap cycles, hold opens the wheel. (10-09; DEVLOG 10-09)
- Controller menus: left/right move left/right. (10-08; DESIGN-NOTES.md)
- Boost is its own action: keyboard Shift, pad B, a touch BOOST button. (11-12; DEVLOG 11-12)
- Camera: a public photo mode; staged / follow / tour / showcase stay debug. (11-12; queue)
- The debug button stays on the HUD while testing. (10-26; DEVLOG 10-26)
- One Quit for every activity (tracker or phone); walking away ends it after a few s with a toast. (11-12; queue)
- The death / knocked-out screen never covers the scene; its buttons can be backed out of. (10-10; DEVLOG 10-10)
- No "Police remember you" chip. (11-03; DEVLOG 11-03)
- No see-through outline behind plants (10-09), on riders in the open (10-23), or behind people (11-14). (DEVLOG)
- Shop symbols over doors when close: subtle, can be turned off. (10-08; DEVLOG 10-22)
- The places' icons (minimap, big map, over doors) a little bigger again, simple and clearly visible - bigger, cleaner icons, not more of them. (11-14; queue)
- The graphics row stays on the title screen. (10-11; DEVLOG 11-03)
- Shop signs in a readable face. (11-03; DEVLOG 11-03)
- Controls in text are `[[action]]` names from shared/controls.js (each device draws its glyph). (11-04; CLAUDE.md)
- Title screen keeps the graphics row (Low / Medium / High / Ultra / Custom). (11-04; decisions-11-04)
- Small phones: touch buttons scale down so all slots fit on a 360-px phone. (11-04; decisions-11-04)
- Control hints (a device glyph + what it does - the HUD's hint strips): each at most twice per player (counted per device and character: the strips are the page's own), then never again - the Guide carries it; no swimming hint at all. A glyph's label (keys, pad buttons, touch words, LEFT THUMB) in the HUD's pixel face, on one line, its chip sized to its words - never clipped or squeezed. (11-16; chat: "they show up once or twice then don't need to keep going, the guide will have info", DEVLOG 11-16)
- Fishing: the prompt and the FISH action only with the rod in hand (taken out like a weapon, or Use on it in the bag), from the bank, a dock or a boat - never while swimming; a rod in the bag gets one first-time line at most. One fishing line, tip to bobber. Every species its own pixel art (the catch card, the phone's Fish log, the cooler). The catch card never under the notes or the HUD. (11-16; chat + four phone shots, DEVLOG 11-16)
- Icons: the clean line set; the 16-bit pixel icon set parked (11-06; decisions-11-06) - SUPERSEDED for touch faces by the 11-12 button rule (symbols for fixed actions, words for situational).
- Safety mode (press twice to commit a crime) OFF by default, switchable in Settings. (11-06; decisions-11-06) - supersedes 'on for new characters' (10-11).
- Mini-games: a close button on touch; each arcade game shown as its real machine; SNES art for pool, air hockey, skee-ball, pinball; multiplayer where a game works with two; bigger bowling lanes, multiplayer bowling. (11-06; decisions-11-06)

- The title screen's CHARACTER is the character creator: body, face and hair change freely there; clothes from what you own. In the city, body and face at the mirror at home, hair at a barbershop; wanted, cuffed or in uniform, no change anywhere. (11-17; chat: "customize your character and have it commit in the main menu")
- Everyone has a starter wardrobe of everyday pieces (rules.js STARTER_WARDROBE) on top of what they own; the creator previews everything, padlocked pieces showing their store, and Done puts on what you own and leaves the locked pieces off, saying which. (11-17; chat)
## Art direction
- 16-bit SNES pixel art with modern lighting and atmosphere (Octopath Traveler, Eastward for environment and light), a GTA vibe. (10-05; chat)
- Not true top-down: vehicles 3/4 angled, people and building fronts slightly angled, like the concepts. (10-05; chat)
- Claude's code generators are the backbone; the owner's concepts are the targets ("treat concepts as real places"). (10-31; chat, DEVLOG 10-31)
- No old art anywhere, not even as a fallback. (10-06; DESIGN-NOTES.md)
- Trees much taller than people; taller buildings that never block the player's view. (10-05; chat)
- No huge plain buildings or towers: break them up and vary them; keep a few real landmark towers downtown. (11-06; queue, DEVLOG 11-07)
- No district all one color. (10-17; DEVLOG 10-17)
- No red cross on anything (protected emblem): clinics and pharmacies a white cross on green. (10-18; DEVLOG 10-18)
- No snow: summits drawn as scree and rock. (10-17; DEVLOG 10-17)
- Placeholder art, markers and waypoints get replaced with real SNES-style art game-wide. (11-13; queue)
- Characters: keep the system (it generally looks good); make every look option read clearly - premium hats and glasses; same bar for NPCs. (11-13; queue)
- The player characters keep the game's current sprite art; never swap in the high-detail close-up renderer (the menu avatar uses the game sprite, scaled up). Character polish later is staged and switchable, approved sheet by sheet. (11-14; chat: "Lets not revert the player character art back to what is showing in the avatar")
- Character polish pass on Fable: staged, review sheets per pass (faces, then hands/arms, then clothing), the owner approves each before live. (11-14; beta-checklist 11-14*, queue)
- Title card avatar: a portrait (head to waist), centered, every face in the same spot; non-looping idles (blink, glance...). (11-14; DEVLOG 11-14) - SUPERSEDES the whole-figure avatar (11-14).
- Logo: the owner's neon design, rebuilt in-engine - no black outlines; D3 = his letters cleaned + a fresh crisp skyline on an even grid; fonts only if he asks. (11-14 15:04; queue) - OPEN: owner picks the variant.
- The logo's neon flicker sound: softer, a real tick/buzz and low hum, quieter. (11-14; queue)
- Dead Baron studio intro: short, SNES-style. (11-03; DEVLOG 11-03)
- Mini-game and arcade art in the SNES style; each game its real machine. (11-06; queue)
- Fancy casinos look fancy, tiered by how upscale (chandeliers, carpet, marble, gold). (11-14; queue)
- Interactive vegetation is very important: grass and crops part round people and rise back within seconds (no track); vehicles flatten a lasting swath. (11-14; chat, DEVLOG 11-14)
- Explosions epic and beautiful. (10-09; DEVLOG 10-09)
- Burning NPCs: fewer deaths, less disturbing; they flee, find water, stop-drop-roll. (10-15; DEVLOG 10-21)
- Bathhouses: nudity pixelated (Sims-style); no swimsuit required. (11-01; DEVLOG 11-01)
- Logo (final, 11-14): the owner's concept rebuilt in-engine - D4's "City Life" (even rims), D4's smooth tapered swoosh and line-work-only neon skyline with lit windows, plus D3's bold "Auto" polished (even gold rim, clean joins, a proper A counter); no black outlines. The title screen rebuilt around it (logo by height with a fixed gap, 2x2 buttons, darker night with a halo, the player's portrait on CHARACTER), and a softer neon flicker sound. (11-14; chat)
- The logo's "Auto" is A3: rebuilt cream letters with a gold rim (drawn new on the grid, not traced; no dark fill), a forward slant, two speed lines joined into the A. (11-14 18:10; chat) - SUPERSEDES D3's polished Auto in the final logo.
- Title backdrop (11-14 19:45): a big city far off - two rows of towers (a hazier back row), setbacks, stepped towers with spires, a water tower, antennas with blinking red lights, a lit billboard, tiny neon strips, irregular lit floors; no palm trees; full pixel clouds at two depths drifting slowly (far ones slower); the searchlight a cone brightest at its rooftop lamp, fading to nothing well before the top, soft dithered edges. (11-14; chat)
- Title backdrop on a phone upright: the skyline at its far-away scale (2 px an art px), only lifted a little. (11-14 19:30; chat)
- The logo misbehaves now and then: mostly "Auto" (sometimes another piece), a subtle blink / dim / one-letter stutter with a faint tick, at random 8-25 s gaps - never a repeating loop; reduced motion none. (11-14 18:56; chat)
- The title's backdrop alive but very subtle, in the game's pixel style: faint twinkling stars, thin drifting clouds, windows going on and off, car lights along the skyline's foot, an occasional searchlight sweep, now and then a helicopter or a plane; paused when hidden; reduced motion = still stars. On a phone upright the city is raised behind the lower menu. (11-14 18:56-18:59; chat)
- Character creator: the stage never moves or resizes between views, poses or zoom; the character stands centred on it by the rig's feet, not its sprite's box. (11-14 18:56; chat)
- Title backdrop: no clouds for now (they didn't look good); stars, twinkling windows, car lights, the searchlight and the odd aircraft stay. (11-14; chat)

- Art polish order after the characters (11-21 08:05): animals, then the UI's item and weapon pictures, then the nature kit, then buildings and districts, vehicles last - on Fable 5.2 while its usage lasts, then Opus 5.5 for the pre-beta fixes. (11-21; chat)
- Nature kit (11-21 09:27: "please start on the nature kit"): every plant the world plants is made at the art pixel (`flora.js` `floraArt`), not painted in world px and halved - branch `nature`, one art batch, live after his review. (11-21; chat, DEVLOG 11-21)
- The greens stay as they are (11-21 11:11: "I didnt think the greens were bad in today's build ... id rather the colors were determined as a whole for the entire game with a style anchor"). The game's colours are set as a whole from the style anchor - the approved Round 1 targets, R1-D's palette (`docs/art-v2/SPEC.md`, `client/art2/palette.js`) - not sheet by sheet: a later concept sheet's lighting (the plant sheets' golden hour) is not a reason to re-tone one kind of thing. Claude's suggestion to lean the plants' greens to the plant sheets' olive is withdrawn. (11-21 11:11; chat, DEVLOG 11-21)
- Variety in nature (11-21 11:40, the owner's question: "Should we add a few variations to each nature prop so that things dont look repetitive and theres a lot of variety throughout the world in nature?"): yes, on the `nature` branch with the rest of the batch - twice the shapes of each plant (6, or 8 for the ten commonest trees; boulders 4 and 5), and each shape its own build (taller or shorter, wider or narrower, a crown off its trunk, a palm leaning either way, a saguaro with none to three arms), because more shapes of one build didn't read as variety. Colours stay on the palette. His to confirm on the sheets. (11-21 11:40; chat, DEVLOG 11-21)
- More of nature's variety (11-21 11:48): "better variations in the cactus" - each saguaro its own arms (a young spear, one arm, two, three or four at their own heights, a bud of an arm, in flower or in fruit), the prickly pears and barrel cacti in clumps of their own size and number; "these flowers and berries look good is it cheap to offer more colors and variations?" - yes: a stand of flowers or berries takes one of the palette's other colours (a drift one colour, a few strays), 2 to 4 per kind. On `nature`, his to confirm on the sheets. (11-21 11:48; chat, DEVLOG 11-21)
- Missing solid nature pieces go in with the world batch (the owner, 11-21 13:08: "That's fine to add them with the batch"); and "please do create any missing art you find that would be useful". (11-21; chat)
- Waterfalls and their cliffs are part of the nature push (the owner, 11-21 13:08, of Summit Tarn's fall: "that doesn't look good. It needs that cliff and art and everything filled in like the concepts ... procedurally generated waterfalls or however those are built need to be addressed with this nature push too. They should look natural and like the concepts"). Every fall is set beside its concept (N5, NR1-E, NK1-J, N1-E); a fall drops down a rock face into a pool, never onto flat ground. (11-21; chat)
- Waterfalls: look 2 (the owner, 11-21 14:34: "I think look 2 looks good, lets go for it") - the sheet in ropes and veils with more of the wet rock dark through it (`water.js` `FALL_LOOK` 2). A fall is one body of water flowing into another (the same message: "a clear division between the water it comes from and the color of the water at the top ... Some waterfalls seem to just appear out of nowhere"): where a river or lake lies above its lip, the fall draws no pool of its own and the source runs to the lip; where nothing does (Coral Cay's), it comes out of a cleft in the rock - a spring - unless a stream is built to it in the world batch; "cliffs and natural structure that supports the waterfall" are built in - the rock that changes the world's ground with the world batch. (11-21; chat)
- Coral Cay's falls get a source in the world (the owner, 11-21 14:54: "I think a little stream and small pool feeding into it would be best"): a small pool on the cliff top above each fall with a little stream running into it, built with the world batch (`shared/world3-tropic.js`). The fall then takes it as its source by itself (`statics.js` `putFall` reads the map); until then it comes out of the spring's cleft. (11-21; chat)
- The redwoods' crowns by where the tree stands (the owner, 11-21 15:35-15:39: "Would having a combo of A B and C make sense ... use C for areas it's covering the paths but in other areas a combo of A or B"): a redwood whose boughs would hang over a trail, a clearing or a hand-made place, a creek, a road or a bridge carries its crown high (the common redwood's C; the giants' and the young redwoods' own high-crowned versions); deeper in the wood the common redwood is a mix of A, B and C by place. In the picture that raised it the cover was mostly the giants' crowns, not the common redwood's - so the rule covers all of them (`statics.js` `crownOver`, `redwoodAt`). The greens are not touched (the owner, 11:11). (11-21; chat)
- A fall, a cave, a lake's edge is part of the land, never a piece standing on it (the owner, 11-21 17:32, of Summit Tarn: "a rock wall or cliff or land structure that this waterfall is embedded in that holds up the body of water at the top above the body of water below"; 17:33, of the sea cave: "it doesn't look like a cave going into a mountain or large rock structure it just looks like a standalone cave entrance ... There should be some concepts that help"). Raised three times in a day, so not left for the later world batch: built now on branch `nature-world` (off `nature`; it changes the world's solid ground, so it has its own branch and its own tests). Rules: a lake that spills is held by a rim of solid rock from wall to wall with the fall in the rim's one notch; a cliff of several pieces is one wall (the pieces run on into each other, one height, one stone - the ground rock's own); a cave mouth is set in a face as tall and as deep as the rock either side of it. (11-21; chat)
- Variety is checked, not hoped for (the owner, 11-21 13:08: "Is there a way to make sure these environments are using the variety of each tree and plant and rock and mushroom ... seeing the same tree used multiple times near each other"): a plant's shape is laid out by place so its twin (same species, shape, size, colour) does not stand near it; `test/undergrowth.test.js` counts twins and pictures per place over the built world. (11-21; chat)
- Water is part of the nature polish (the owner, 11-21 13:08: "Can this also include water and water generation, we've struggled with getting the vfx showing ripples and reflections and light and interactions with water correct ... I'm always finding glitches on the surface ... across the world in different types of water bodies"): every kind of water body is recorded moving, at several times of day, and checked for flicker and seams before it is called done. (11-21; chat)
- Nothing grows through a fence (the owner, 11-21 12:20: plants "across sidewalks or through fences"; the lupines through the pasture's rail fence in the day's own picture): the page's undergrowth, drifts and beds leave every tile a fence, wall or hedge line crosses (`statics.js` `fenceLine` -> `addGreenery`; `test/undergrowth.test.js`). The audit had no row for it (its fence row is railings over water). (11-21; chat)
- The nature concepts as scenes (11-21 11:48): "recreating scenes from all the nature concepts as close as we can get it (but keeping our art style and colors) and then recycling those props and prop variations throughout all the appropriate biomes and regions and locations" - and a full kit that makes the world "natural and alive and immersive and believable" while performance stays good across the devices. Approved 12:12 ("That sounds good to me"): an audit first, piece by piece, of the nature sheets against what the game has, then the pieces built by biome and placed by rule - pine/oak forest and meadow first, then redwood, mountain, desert, coast and jungle, the water's edges last. The audit (project doc `claude/nature-audit-2026-11-21.md`) found most of the scenes already built by October's nature program: per biome the work is their look at the art pixel, the same kit spread by rule beyond the hand-made places, and a short list of missing pieces. Solid pieces are server-placed props, walk-through ones a rule in the page's undergrowth; the whole batch on `nature` for one re-bake. (11-21 11:48, 12:12; chat, DEVLOG 11-21)
- The plants' painted light (11-21 11:48, his question on the oaks' dark lower right): a plant's picture carries its own shading, lit from the upper left (the art's convention), and the game's sun, shadows and weather are added on top. Leaving the left-right light to the game alone was tried (sheet sent); OPEN: his pick - as now, or the side light left to the game. (11-21 11:48; chat)
- Outlines, one rule (11-21 11:11: "some have dark outlines and others dont"): everything that stands up - people, animals, vehicles, props, every plant - has the art spec's outline (one art pixel, a dark tone of the colour beside it, never black, none along the foot); the ground and what is strewn on it have none. No softer outline for one family of plants. (11-21 11:11; chat, DEVLOG 11-21)
## Music and sound
- No soundtrack over play: music lives in the world (venues, shops, radios); only the main menu (maybe the tutorial) has soundtrack. (10-08; DEVLOG 10-08, chat)
- The owner makes the music (ComfyUI, his own workflow, one prefilled JSON per piece); played as recordings, not rebuilt in the engine. (11-12; queue, chat)
- The engine plays only instruments the player plays. (11-12; queue)
- Claude's in-game music studio: PAUSED (10-10) - SUPERSEDED by the owner's own pipeline (11-12).
- Title track: the owner's "Chill closer"; the first title track kept as the train arrival's music. (11-12; DEVLOG 11-12)
- Sound effects synthesized, SNES-flavored. (10-08; DEVLOG 10-08)
- The casino games make subtle sounds: a card flick, the roulette ball's rattle and click, slot reels ticking, a small win chime. (11-14; queue)
- The hospital lobby plays a gentle bossa nova elevator tune ("Visiting Hours": nylon guitar, soft electric piano, brushes, a light melody), "cheesy but not too cheesy", as if from ceiling speakers (thin, muffled, a slight room echo); the other lobbies share it. (11-17; chat)

## World and places
- World v3: the whole world handcrafted, district by district; Claude has full creative control within the world's size and region placements. (10-17; chat)
- Each district goes live when done; no test server. (10-17; chat) - SUPERSEDES "World v3 on a test server" (10-11).
- Highways loop logically with long stretches; the main line loops the whole world, double track, scenic. (10-10; WORLD-V3.md part 5)
- Metro City is the largest, densest heart; islands closer together; plenty of bridges so exits can't be camped. (10-10; WORLD-V3.md part 7)
- Gangs only in isolated rough corners; none in the north-west forest; Lucky Mesa's syndicate is Vegas-mafia, not touchy. (10-16; DEVLOG 10-21, 10-22)
- The city arrival is beside Greenfield Park west (hand-built block: park, shops, cheap dealer, steal alley); the other three arrival stations get the same. (11-06; queue)
- Station forecourt loops carry no through-traffic (taxi rank / parked cars at most); the Metro lot enlargement dropped. (11-06; queue)
- What's meant to be seen is seen: signs, doors, activities, interactables never hidden by roofs, trees, decks (visibility audit + test). (11-06; queue)
- Placement lint: boats on clear water, signs not overlapping, no duplicate place signs, parked cars on road or lot only. (11-13; queue, DEVLOG 11-14)
- A sign's words fit its board or pediment, whole, or the sign isn't drawn (lint textClipped); a bank's BANK in the stone over its name board is the name twice. (11-15; chat, First Pixel Bank)
- One name sign per building frontage: a front's portico lettering, shop sign, plaques and neon never say the same name twice (lint nameTwice). (11-15; chat: "Some signs still have duplicates")
- Placement lint, more (fix the class, every hit): a building's own name (plaque, shop sign, blade) never half hidden by another board on its front or by a canopy, porch, porte-cochere or sign in front of it; a blade names only the business at street level; no plant on a house's path, driveway or door step; an ATM only set into a building's front wall or inside, never alone on a pavement. (11-14; queue - the owner's phone notes)
- Fenced places have openings on at least two sides. (11-12; DEVLOG 11-12)
- No fences across driveways; garden plots in sight, not behind the house. (10-17; DEVLOG 10-17, 10-24)
- Walk-in interiors compact, near the entrance. (10-17; DEVLOG 10-17)
- Interior renumbering: owned homes bought back at their deed (`WORLD_VERSION` bump) rather than kept. (11-06; DEVLOG 11-06)
- Black bin bags only a few, near cans or in rough alleys. (10-10; DEVLOG 10-10)
- Pool tables in suitable bars and food places; a home pool table only if cheap. Blackjack and poker in saloons and biker bars. (11-14; queue)
- Coral Cay gets a police station (Island Threads converted). (11-07; DEVLOG 11-07)
- Beaches: no water slivers along piers / boardwalks over sand (fix the class); pier sides over sand step on/off freely. (11-14; queue)
- Skatepark ledges and boxes block people on foot (skaters still grind). (11-14; queue)
- A cinematic Showcase list of the best hand-crafted places, for the owner's videos. (11-12; DEVLOG 11-12)
- Property on public servers: plenty of properties, shared with claims; the outside stays risky and social. (10-06; DESIGN-NOTES.md)
- World v3 frame 14 x 9 squares of 504 m: a vast forest west, a large desert east, a broken north coast with surf facing north; ocean on every side (an island continent). (10-12; decisions-10-11 G)
- Big plain towers split into several buildings of different heights with setbacks, rooftop detail and street-level shops; a few real landmark towers stay downtown. (11-06; decisions-11-06)
- Caves: no lost-in-the-dark arrow; the cave art is OK; the character must be the real sprite. (11-06; decisions-11-06)
- Chess tables out from behind trees, and more of them. (11-06; decisions-11-06)
- Homes: going inside your own home is a separate space (its own little level). (10-11; decisions-10-11)
- Open up the blocks (priority, before the beta and filming): big plain building footprints broken into smaller buildings with walkable, lived-in alleys and courtyards; varied roofs; landmarks and buildings with a reason kept whole. (11-14; chat)
- No big overhangs over entrances: porte-cocheres and entrance canopies (over about 4 x 2 tiles) removed everywhere - the door lit by wall lamps either side, the name on the facade; small awnings stay; a filling station's canopy over its pumps stays. (11-14 20:33; chat)
- Lights belong to things: lamp posts at a rhythm along the kerbs, strings of lights only as catenaries between two anchors (posts, walls), lit shop windows and signs, a stall's bulb under its awning - no light without a source; open spaces get a purpose and edges, not oversized empty plazas. (11-14 20:28; chat - the district craft passes, Midtown first)
- Cinematics: fix the fundamentals (time of day, no roof flicker, real street racing, chases in view), add "Save this view" so the owner scouts the shots, then ~10 hero shots refined with him before adding more. (11-14; chat)
- Every place crafted from the concepts, district by district (the craft passes): no oversized empty plazas or lots - an open space gets a purpose and edges; lights belong to things (lamp posts at a rhythm along kerbs and paths, strings of lights only as catenaries between two anchors - posts or walls, lit windows and signs; no light without a source); props in groups that tell a story; NPCs that fit the place. (11-14 20:28; chat)
- Hanging lights only where they have something to hang from (a building face, an awning, a post or lamp post, a tree, a pergola or stall frame; a run with a bare end gets a drawn post or goes); never over open ground or a road without anchors both sides; every line hangs with some slack (a sag, not straight across); larger bulbs spaced along a dark wire - bistro lights, not Christmas fairy lights; lanterns look like lanterns - the red paper lanterns of the concepts (WC422: red body, darker ribs, gold/black caps, a tassel), larger, on the same slack lines. (11-16; chat: "more like bistro lights than Christmas lights ... like the red lanterns in the concepts ... a little slack in the line")

## Police and crime
- Lenient before the first star: lesser crimes seen go on a tally with a warning; an officer's sighting counts double. (11-07; DEVLOG 11-07)
- Cops at 1-3 stars: worse drivers, slower to cuff, easier to shake; only 4-5 stars bring sharp drivers and tactics. (11-07; DEVLOG 11-07)
- The police helicopter comes at 4 stars (was 3). (11-07; DEVLOG 11-07)
- Five stars take longer to reach. (10-22; DEVLOG 10-23)
- Custody must be escapable: fighting free at 1-2 stars usually works with honest mashing; breaking out gets a real head start. (11-14; DEVLOG 11-14)
- In custody no panel covers the screen: the BUSTED moment and one fading line; the action button changes state while there's a chance to make a break for it (red, beating, ESCAPE on touch; the prompt's card red on a keyboard or pad). (11-15; chat: "we don't need that constant message covering the entire screen but the act button could change state")
- Melee never sets anyone on fire. (11-15; chat)
- Police and NPCs chasing indoors walk round shop counters and solid furniture. (11-15; chat)
- Fighting the police raises your wanted level, but you still get a chance to run, hide and wait it out. (11-14; DEVLOG 11-14)
- The cruiser taking you in must reach a station (fallback after N s stuck); never drives into the sea. (11-07; DEVLOG 11-07)
- A police station's cell by default; prison only for 5 stars + a long arrest record, or an admin. (11-07; DEVLOG 11-07)
- Prison: about 5 min max; breakouts and prison-break quests. (10-05; DEVLOG 10-22)
- Nobody beats you up while the police hold you. (10-09; DEVLOG 10-09)
- NPC street fights: whoever started it is fair game; police break it up by tackling, not shooting. (10-10; DEVLOG 10-10)
- Poaching the park's koi is a crime. (10-18; DEVLOG 10-18)
- Tri-faction rules (heat, peak-wanted memory, disguise, Enforcer badge, bounties, carjack temperaments) as in ARCHITECTURE.md's table. (10-03; ARCHITECTURE.md)

## Weapons and loadout
- Loadout: 2 guns, 1 melee, 1 throwable carried; the rest in your stash. (11-03; launch-plan 11-03) - built 11-14 (branch weaponstash, not live yet).
- Carry upgrades later: shoulder holster +1 gun, back sling +1 long gun, chest rig +1 melee +1 throwable (caps 4 / 2 / 2). (11-03; DEVLOG 11-03 UI-10)
- Weapons at risk: guns, bows, launchers, grenades, illegal items and dear blades drop on death as pickups anyone can take (a minute); fists, police issue and cheap legal tools stay. (11-14; decisions-11-14*, DEVLOG 11-14) - SUPERSEDES "a weapon you buy is yours forever; death drops cargo, never weapons" (11-03).
- Arrest: illegal guns confiscated for good; legal guns go to your stash. (11-14; DEVLOG 11-14) - conflicts with launch-plan's impound lot (fee to get a seized gun back): OPEN if the impound idea is still wanted.
- One stash per character: your home's safe and every gun / pawn shop counter. (11-14; decisions-11-14*)
- Buy straight to the stash (bulk), drop weapons, hand one to a crewmate nearby. (11-14; queue)
- Phone "Find my weapons": a waypoint to the nearest stash. (11-14; DEVLOG 11-14)
- No weapon blueprints or crafting. (11-03; launch-plan 11-03)
- Ammo is the money sink. (11-03; launch-plan 11-03)
- Only the plasma blade deflects; other guards stop blows, not arrows. (10-10; DEVLOG 10-10)
- The plasma blade comes in colors you choose. (10-09; DEVLOG 10-09)
- A SAM launcher to fight helicopters, without making them weak. (10-16; DEVLOG 10-22)

## Vehicles and the car
- The first car is earned by your FTUE path: Honest = cash to buy a beater at the station's used lot; Hustle = steal one in the alley; Outdoors = a cheap pickup; Roam = cash + the dealer marked. (11-06; queue, DEVLOG 11-06) - SUPERSEDES the free starter car (11-03).
- The free starter car stays only with players who already had one. (11-06; CLAUDE.md)
- Hustle path gets pocket money ($200: food, ammo, bail - not enough for a lot car). (11-07; DEVLOG 11-07)
- First-car stock is per player or plentiful; never spawned on top of each other. (11-06; queue)
- Your car is marked as yours. (11-06; DEVLOG 11-06)
- Your car stays where you left it (logoff, restart) and shows on your map; "Have my car delivered" by a valet for a fee - no teleport. (11-14; decisions-11-14*, DEVLOG 11-14) - settles "Find My Car".
- Cancelling a job gives its vehicle back; players can't spawn unlimited aircraft. (10-23; DEVLOG 10-23)
- Fire engines: you get out and use the hose (no deck cannon, no any-engine hose); a hose icon on FIRE by your engine at most. (11-06; queue)
- Skateboards are world vehicles you own, carry and lose; park boards borrowed; a board breaks (respawns in a skate session). (11-03; launch-plan 11-03, DEVLOG 11-04)
- Skateboards about bicycle speed. (10-18; DEVLOG 10-18)
- Surfboard: not forced on in the sea; paddling faster than swimming. Rollerblades: wearable gear. (11-03; launch-plan 11-03)
- Vehicles tough: explode only in a serious crash; at 0 health slow, smoke, burn, then explode. (10-06; DESIGN-NOTES.md)
- Aircraft drawn at their height. (10-11; DEVLOG 10-11)
- No skipping a taxi or rideshare ride. (10-06; DESIGN-NOTES.md)
- Traffic: pedestrian hits stay rare (about once per 110 h of driving); cars on minor roads wait at the line; a working ambulance is a blocker cars go around. (11-04; decisions-11-04)
- No traffic jam at arrival: NPC traffic never drives into station forecourt loops. (11-06; decisions-11-06)
- No blocking the box: NPC traffic goes into a junction only when nothing in it crosses its way and its road out has room for it; whoever waited first goes first; a long vehicle turning has the box to itself; a knot in a box is untied on screen (one goes, the ones in its way back off) - no more "go anyway" after a wait. (11-14; DEVLOG 11-14)

## Economy, jobs and progression
- The progression plan approved as written, every default included: 3 careers x 8 ranks, "What's next", daily/weekly goals, contacts, extraction payouts, the event calendar, district reputation, sinks, seasons. (11-07; PROGRESSION.md)
- Big money from visible crate runs, paid only on delivery; a gold carrier shows on every minimap, iron/steel only nearby. (11-07; PROGRESSION.md)
- A money sink should feel like care, never a tax; cosmetics never add combat power. (11-07; PROGRESSION.md)
- Property upkeep: skipped a week -> repossessed, furniture kept in storage. (11-07; PROGRESSION.md)
- Repossession refund 50%. (11-08; queue) - OPEN: owner to confirm.
- `SEASON.beta` switched off at Season 1. (11-08; queue) - OPEN: owner to confirm.
- Vest (armor) prices and 3% rent: OK'd. (11-12; queue)
- Leaderboards per career; top 10 get a unique cosmetic. (11-07; PROGRESSION.md)
- Tune the economy from real telemetry after the first test weekend. (11-03; launch-plan 11-03)
- More honest jobs (flying, coast guard, firefighter, taxi, bus, forklift...). (10-11; DEVLOG 10-11)
- Search and rescue missions in the wilderness, from their own HQs. (10-24; DEVLOG 10-24)
- ATMs: a pop-up (Deposit all / Use ATM), on foot only. (10-06; DEVLOG 10-22)
- Air hockey is two-player (or vs the machine); a game in progress can only be watched. (11-07; DEVLOG 11-07)
- Games watchable from outside, for ALL games (pool, hockey, skee-ball, cabinets, bowling, chess, cards, dice, roulette, darts): light server sims only while someone is near. (11-13; queue)

## Director and content
- Scripted scenes for trailers, with player-like NPC actors and set camera moves; also as occasional live-world events. (11-13; chat, DEVLOG 11-13)
- Features a scene needs but the game lacks are built for the game first. (11-13; chat)
- Actors look like ordinary NPCs in the live world. (11-13; DEVLOG 11-13)
- No text bubbles in scenes; closer framing; the camera stays the player's (zoom is an offset). (11-13; DEVLOG 11-13)
- Next: autoplay scripts for the remaining scenes. (11-14; queue)
- Car soccer arena art: PAUSED (branch arenaart), resumes with the director work. (11-12; queue)
- The cinematics menu is a curated shot list in sections (city at night, nature, coast, action, people, vehicles, weather): one tap a shot - its place, time, weather, cast and its own camera move, 10-30 s - or a section / all back to back; the best-looking places and a diverse range of subjects. (11-14 15:11; chat, DEVLOG 11-14)
- A shot owns the camera while it runs; any touch, key or button hands it back (the free camera stays for his own shots). Action stays outdoors and in view - nobody disappears into a building. (11-14 15:11; chat)
- Explosions are the game's SNES-style pixel art (the explosion sprite, pixel flames and smoke), never gradient placeholders. (11-14 15:11; chat)
- Cinematics, the plan after the first shot list ("The cinematic shots really aren't good ... all the same nighttime scene"): fix the fundamentals first - each shot exactly its own time and weather, roofs drawn solid in a shot (no interior/exterior flicker) unless it's an interior, frames over streets, plazas and open ground (never a roof in the middle), people about, street races that race (through the lights, weaving through traffic, people diving clear), chases on wide streets in view; then "Save this view" so he scouts; then ~10 hero shots refined with him. (11-14 20:21; chat, queue)
- The shot list shows only the shots that pass the sanity check (subject in frame, open ground at street level, the right time, people present); the rest wait under "More (unreviewed)". Play all plays the kept ones. (11-14; queue)
- Saved views live on the server (kept with the world's state); saving, renaming and deleting are the owner's and admins' (anyone on a private dev server); anyone in dev mode can go to and play them. (11-14; queue)
- The Camera's clean screen (all the UI off) has nothing on it, not even the close X: it comes back on a tap or a key; Esc / B still exit. (11-17; chat)

## FTUE and Guide
- The tutorial IS the first goal: train arrival, one question ("What brings you to town?"), at most 3 steps, then first-time moments. "Short and sweet, general direction." (11-04; ftue-design 11-04, CLAUDE.md)
- The old city tour is retired. (11-04; CLAUDE.md)
- Skippable everywhere, never blocks play, one fading line each; only new characters, every character once. (11-04; CLAUDE.md)
- Full progress reset shipped with the FTUE (`PROGRESS_EPOCH`); a future full reset = bump it. (11-04; DEVLOG 11-06)
- Arrival stations: pick city / coast / desert / country; a staged train on its own track, tunnel to tunnel. (11-06; DEVLOG 11-06)
- First-time moments wait until you're back up. (11-06; DEVLOG 11-06)
- The Guide (phone) is the in-game wiki; its numbers come from the data files, its controls from shared/controls.js. (11-04; CLAUDE.md)
- Teach the new thing: a changed system updates its Guide entry and first-time moment in the same change; a new job, place, activity or control gets an entry. (11-04; CLAUDE.md)
- Player-facing numbers live in shared/rules.js (`FTUE` for the FTUE's own). (11-04; CLAUDE.md)
- Everything is decided on the server. (11-04; CLAUDE.md)
- The first car is earned by the path picked at "What brings you to town?" (honest: a cheap dealer/junkyard beater; hustle: the steal alley, the crime tutorial; outdoors: a cheap pickup; roam: cash + the dealer marked), within the FTUE's three steps; every arrival station has a lot and a steal alley close by. Replaces the free starter car. (11-06; decisions-11-06)

## Process
- Read this file before any task; a new owner decision goes into it in the same commit. (11-14; chat)
- Nothing gets lost: every owner note goes into a doc and the task list. (10-08; DESIGN-NOTES.md)
- The owner trusts Claude with production and build-order calls; tune together afterwards. (10-05; chat)
- Pushing to main deploys live: push only when tests pass; batch server changes; agents never push (the lead merges). (CLAUDE.md, agent-rules)
- Go live after Claude's own screenshot review - no wait for the owner (one capture round), to save usage. (11-12; queue)
- Visual direction: show 2-3 variants side by side for the owner to pick before wiring in (HUD, icons, logo). (11-12; queue)
- At most 3 agents at once; keep agent runs lean (usage). (11-14; chat, queue)
- Heavy commands (server, browser, capture, bake, full tests) under `flock /tmp/cla-heavy.lock`, one at a time; small Node heaps; WIP commits often. (11-13; agent-rules)
- Delete capture frames and temporary builds once looked at (fixed disk). (11-13; agent-rules)
- Reports short (under 200 words); 2-3 small screenshots at most. (11-12; agent-rules)
- Raising a performance budget is a decision: say why in the DEVLOG. Page budget now 540 KB (11-07, "a modest raise is fine"). Bake code 1020 -> 1022 KB on branch `nature` (11-21, Claude's call under this rule; `animals` has it at 1024 for its own 4 KB: merged 1026). (CLAUDE.md; DEVLOG 10-21, 10-26, 11-07, 11-21)
- Each art change costs ~5 h of server rebake: batch art changes; avoid re-keying world/art unless the task needs it. (11-07; queue, agent-rules)
- Don't slow the server's start (health window). (agent-rules)
- The run-up to the beta, by model (the owner, 11-21 14:03): Fable 5.2 (High) keeps on the art plan until its limit; then pause, the weekly reset, and Opus 5.5 (High) for the pre-beta fixes - the API-credit audits' lists, the pre-beta list, and a further list of notes, tests and audits the owner will hand over then; after that, what usage is left may go back to Fable for more art. All new art that is ready goes in for the beta; some usage is kept back for problems the beta shows. The finished branches are combined and tested on `prebeta-art` with `docs/tasks/PREBETA-HANDOVER.md`, so the fixes start from one branch. (11-21; chat)
- Checks before eyes (the owner, 11-21 14:03: "I spend a lot of usage catching issues that broke when another fixed, or fixes that weren't applied across the world ... having better checks and systems in place ... is important"): every note gets a test or lint row that guards it, or is marked eyes-only in the register; a fixed set of places is re-rendered before and after any world or art change and the changed ones listed. To build first in the pre-beta phase. (11-21; chat)
- Music and sounds to come at the switch (the owner, 11-21 14:03): his own music - to decide then: remade in the engine or played as audio like the main menu's - and a sound pack for the in-game instruments and the rhythm minigames (played alone, and along to his songs). With each song its tempo and where beat one falls, so the note charts line up. (11-21; chat)
- Branches written side by side (the owner, 11-21 12:20: "make sure we're not doubling up ... and the work we're doing now ... is not overwritten when we commit the other branches"): before work starts on something an audit or another branch may cover, check the waiting branches for it; before anything goes to main, trial-merge every waiting branch together (`git merge-tree`, nothing changed) and name the clashes; a clash is settled by keeping both sides, never by taking one branch's file whole. Checked 11-21: `audit`, `audit2`, `audit-security` are reports and lint rows only (no fixes; the world batch - `plantOnWalk` 2,914, `planterOnWalk` 422 and the rest - is still to build, once); `quickwins` is UI only; all of them, `characters`, `fsrow`, `animals`, `itemicons`, `nature` and `egret` merge with clashes only in DEVLOG.md, version.json, `tools/perf.mjs` (a budget number) and `tools/placementlint.mjs` (the counts list). The nature branch draws plants and rules the wild undergrowth; the towns' trees, shrubs, hedges and palms on walkways stay the world batch's. (11-21; chat)
- Stamp before every commit; a DEVLOG entry per feature (American English); README controls table current. (CLAUDE.md)
- American English everywhere, spelling and terms. (11-03; launch-plan 11-03)
- New features reachable from the debug menu while testing. (10-18; DEVLOG 10-18)
- Concept art Claude needs goes in the general Concept Art Prompt Pack; the World Building pack is the owner's. (10-17; chat)
- Offline practice: PAUSED - don't build on it until a plan is agreed. (10-20; CLAUDE.md)
- Debug menu: open to all testers with no password until the beta; at the beta, progress is reset and the debug menu is admin-only (the owner and whoever he grants). (11-14; chat)

## Future features (noted, not scheduled)
- Treasure hunting (map scraps, riddles, shovel, tiered chests as visible cargo). (11-03; launch-plan 11-03)
- VR in-game: arcade machine duel, home rigs, then lobby modes (battle royale, wargames) - needs instanced lobbies. (11-03; launch-plan 11-03, chat)
- Deferred 11-14: emotes round 3, buskers overhaul (+ bucket drummers, playable instruments), benches for players, dog walker variety, pets (phase 1 ambient, phase 2 adoption), the West (horses, ranching, train heists). (11-14; decisions-11-14*)
- Taller grass, overgrown patches you wade through, tall cornfields: after the beta opens (or with the art session). (11-14; queue)
- Animals overhaul (horses, coyotes, wolves, bears); sharks swim under and breach to attack. (11-13; queue)
- Salmon leap up falls in hops. Granite Hot Springs steam and stone. (11-14; queue)
- Arcade leftovers: more cabinet games, realtime air hockey, NPC pool opponent walks over, pool stakes. (11-07; queue)
- Life-sim ideas: photo commissions, bartending/barista, market stalls, fishing/skate tournaments, hosting buffs. (11-03; launch-plan 11-03)
- Player stats with a modest daily gym mini-game. (10-04; chat)
- Ride of the Valkyries on the helicopter radio (owner's MIDI kept). (10-10; DEVLOG 10-10)
