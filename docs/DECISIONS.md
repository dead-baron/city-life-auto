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
- Character polish: proportions A (about 3.1 heads: a neck, shoulders, longer legs, hands, full faces), as built on the `characters` branch; still behind its switch until the owner approves it in the game. Next passes take the people toward all the character concepts (docs/characters/concepts). (11-19; chat) - SUPERSEDED 11-20 (the chunky build, below).
- People stay chunky: the game's 2-px art grid, never finer pixels than the world around them (a fine-pixel prototype in the real game looked "very out of place"). (11-20; chat: "Stay chunky, I don't like the fine pixel look")
- Underwear for both bases (lingerie styles included; opaque) with a "none" choice: underwear off shows the built-in mosaic, and a character may go with nothing on anywhere, the street included; "censored nudity" shows swimwear instead; NPCs never undressed. (11-19; chat) - built on the characters branch: an Underwear slot, the basics in the starter wardrobe; "Censored nudity" is a new Settings switch, off by default - OPEN: its default, and whether the lingerie is sold or free (docs/characters/NOTES.md). - SETTLED the same day (the next lines): no setting; the basics free, the lingerie sold.
- No "censored nudity" setting: nothing on is always shown under the built-in mosaic (you see nothing), for everyone. (11-19; chat) - SUPERSEDES the planned "Censored nudity" toggle.
- The renderer's code budget raised 411 -> 414 KB for the character pass's wardrobe (every page reads the catalogue). (11-19; chat)
- The character work may raise the renderer's code budget up to 430 KB rather than squeeze the art ("I'd rather this all looks better... not cut corners"). (11-19; chat)
- Character polish, the direction: the concepts' chunky build (about two and a half heads: a big head and hair, a wide body, thick arms, short legs) with a soft outline in the color of what it outlines, "slightly darker" so people sit with the world's benches and lamps; the mixed outlines of the world itself (dark on trees and benches, none on planters and stalls) can be looked at later. (11-20; chat: "the 'Chunky + Concept Hair, softer outline, deeper body' looks great") - SUPERSEDES proportions A (11-19).
- Shoes keep their size; they only must never show as one flat line. (11-20; chat)
- Hair is good for now (five rounds of the owner's notes on the sheet, 11-20). Hair bands are a neutral color, not red: charcoal, or a pale grey on hair too dark to show it. (11-20; chat)
- Small details may be a pixel or two bigger than life so they read and "make a statement": glasses, necklaces, a tiara, a bow tie, masks, bags, things held - "better to see what things are than to have the details totally lost". (11-20; chat) The full list of his notes on the wardrobe sheets: `docs/characters/OWNER-NOTES-1120.md`.
- "Nothing" is two mosaic patches in one style, the hips' and the chest's apart, like The Sims'. The set "Underwear" is just your underwear - the piece worn under, or the basics (boxers; a bra and panties); the undershirt and trunks it was stays as its own set. (11-20; chat)
- Small briefs and panties keep their triangle and get a strap round the hip; bras show their straps from the side; stripes on clothes follow the garment, not one screen line; striped underwear is added. (11-20; chat - OPEN: built in the next steps)
- The Founding Citizen jacket: all gold, a bomber that shines and sparkles - a premium item; a small VFX if it's cheap. (11-20; chat - OPEN)
- Jackets stay open for now; a zipped option is revisited after the beta. (11-20 13:42; chat)
- Eyes: an eye is its picked color with a white beside it (option D of four shown), for everyone; and everyone blinks. (11-20 13:56; chat: "I think D might look the best" - built as the polish pass's default; blinking OPEN)
- A woman's briefs and panties keep a strap that goes round the hip; women's chest and seat get "a little shape", as long as it doesn't break the character system. (11-20 13:56; chat)
- Women's builds: athletic is average with a little more shape (no big arms); curvy is athletic with slightly more shape (not a belly); big keeps a belly as its own shape under a bust, never one ball of back, chest and stomach; no points anywhere - a curve is a step. (11-20 15:20; chat)
- A layering check for the people: clothing, features and customizations must come together without stray pixels at every angle - to become a permanent test. (11-20; chat)
- For the character work the renderer's code budget is 470 KB and the bake's 1045 KB (the people's drawing is in both). (11-20 15:06; chat: "Lets up the render's size budget" - SUPERSEDES 440 / 1030 of the same morning)
- The people's bodies are checked, not eyeballed: every rule the owner has given for them is measured on the game's own art pixels for both sexes, the five builds, the eight directions, in underwear and in clothes, standing and walking (`tools/bodycheck.mjs`, `test/bodyshape.test.js`). A body change keeps it at nothing found; a new note from him becomes a rule there. (11-20 15:49; chat: "Is there a better way you can do this and check it out so that all the things we've discussed are fixed and checked and we nail it down this time?")
- Bodies, the rules so far: no points or one-pixel bumps; the legs two legs, front and back, up to the underwear; underwear whole across its middle and never missing; a strap on both shoulders; a neck from the side; lines and shade on skin and on white cloth soft, never near-black; a shirt's hem level; both eyes at an angle; feet in step with the legs. (11-20 15:20-15:49; chat)
- Body fixes are isolated: each is measured against a snapshot of every figure before it, and the report says which figures changed and by how much; nothing that works is reworked on the way. (11-20 16:51; chat: "this is WAY better so im hoping these fixes dont change everything and break them. Can we isolate these fixes?")
- Bodies, more rules (all in `tools/bodycheck.mjs`): in profile an arm is no longer than from the front; a line on bare skin is the skin's own shade, a leg's too; a strapped top in profile shows no lone pixel of itself and no lone pixel of skin; bare legs stay as far apart going up as they stand below; a bra's straps run up to the shoulder from behind and it reads as a band with straps at an angle; short hair has no pixel out on its own at the back of the head. (11-20 16:51; chat)
- The outline stays as it is: the soft outline in the color of what it outlines, at the "slightly darker" strength (option A of three shown). (11-20 17:44; chat: "I think A might be the best" - SUPERSEDES the open question of 16:51)
- The bodies are good: "overall its looking really great. I think we can call it good at this point and move on to everything else". Next is his wardrobe notes (`docs/characters/OWNER-NOTES-1120.md`), then the missing and weak pieces, then his review before anything goes live. (11-20 17:44; chat)
- Stripes: a stripe is one pixel thick everywhere and joined all the way across the garment; it follows the garment (rings round the trunk, the sleeves and the legs), never one ruler line across the screen. (11-20 18:54, 19:06; chat: "is there a way to make the full stripe connect all the way around")
- Stripes passed ("I think it looks great"); on the striped bra and panties he is "not sure it works well" - left as it is for now. The rest of the characters' work goes in big batches, shown as before / after sheets. (11-20 19:23; chat)
- The Founding Citizen jacket is a gold bomber - all of it gold, dark ribbing, shining - not the varsity jacket with gold sleeves. (11-20 13:33, built 19:23; `shared/lookcore.js` `shine`; docs/characters/OWNER-NOTES-1120.md)
- Jackets are worn open or done up, the player's choice (Front: Open / Zipped, or Buttoned on a coat, a cardigan or a blazer), "and we can test out how it works"; the Founding Citizen jacket is zipped unless opened. (11-20 20:53; chat: "Let's do a zipper and unzipped version and give players the option" - SUPERSEDES "jackets open till after the beta", 11-20 13:42; shared/lookcore.js canZip)
- The renderer's code budget is raised (470 -> 510 KB): "Is there a reason not to raise the render budget? If not lets raise it." (11-20 20:53; chat; tools/perf.mjs)
- No cravat as a piece of its own: "probably dont need this as an item by itself" - built, then taken out. (11-20 21:55; chat)
- Pieces are named in American English: suspenders, not braces ("Not sure what braces are do you mean suspenders?"). (11-20 21:55; chat)
- A bow tie is comically large: "one step bigger to give it a clear bowtie look". (11-20 20:53; chat)
- All of the characters' missing work goes ahead now: "Go ahead and start on all of it we are missing let's knock this out." (11-20 20:53; chat)
- The bake's code budget is raised (1045 -> 1080 KB): "Is it bad to raise the bake code? I feel like we should raise it?" (11-20 20:15; chat; tools/perf.mjs)
- Nothing on the wardrobe list is left alone because it is "readable enough": "We should do the weak or left alone parts too right?" - every piece he has a note on gets its pass. (11-20 20:15; chat)
- Small things on the chest and the face are drawn as pictures in art pixels (necklaces, lanyard, stethoscope, bow tie, buttons, straps, a camera, masks' faces), not decided one world pixel at a time. (11-20 20:15; peoplepolish.js NECK, masks)
- Earmuffs and headphones: nearer their first size, set outside the hair so they show - "maybe too big now", "probably better before". (11-20 20:15; chat)
- Underwear: the basics free (starter wardrobe), lingerie sold. Patrol police in a light-blue shirt (the concepts' clearest police read). (11-19; chat) - built in pass 3: officers, rookies and K9 handlers; a sergeant's stays navy under the chevrons, the dress uniform unchanged - OPEN: sergeants too? - SETTLED 11-19: sergeants stay navy (the rank reads). (docs/tasks/CHARACTERS4.md)
- Pieces only the character pass draws (small gear, carried props) are not sold - out of the stores' stock - while the pass is off (`shared/wardrobe.js` `PASS_SOLD`); the five draped pieces (hooded cloak, cape coat, sari, ghillie suit, morning dress) stay out of the city's random looks until they read better (still sold). (11-19; docs/tasks/CHARACTERS4.md)
- Underwear, the owner's notes on pass 4's sheet: women's briefs and panties the smaller, more triangular cut of pass 3 (pass 4's clean edges and cool pale cloth kept); the union suit has no buttons; the silk slip looks as it did in pass 3; with no underwear picked a man wears boxers and a woman a bra and panties (live on merge: `shared/lookcore.js` `lookArt`; the rest behind the pass's switch). The rest of pass 4's underwear stays. (11-19; docs/tasks/CHARACTERS5.md)
- Character hair: every style must be recognisable at game scale from all four directions - a bun is a round knot on the crown, not a spike; compared with the concepts' hair (CB3, CC2, C4). (11-19; docs/tasks/CHARACTERS5.md, docs/characters/owner-hair-1119.png)
- The people's small faces have no mouth, as the concepts draw them (pass 1's mouth off behind one constant, `POLISH.mouthOn`; painted lips stay); the owner looks at docs/characters/pass3/faces-mouth.png. (11-19; docs/tasks/CHARACTERS3.md)
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
- Raising a performance budget is a decision: say why in the DEVLOG. Page budget now 540 KB (11-07, "a modest raise is fine"). (CLAUDE.md; DEVLOG 10-21, 10-26, 11-07)
- The renderer's code budget 411 -> 414 KB for character pass 2 (the catalogue's underwear, concept pieces and hairstyles). (11-19; DEVLOG 11-19, docs/characters/NOTES.md) - OPEN: raised by Claude on the characters branch, the owner to confirm. - CONFIRMED by the owner 11-19 (Art direction, above); pass 3 stays inside it (413.97 KB).
- The renderer's code budget 414 -> 429 KB, 28 -> 29 files for character pass 5: the pass's own file (`client/art2/peoplepolish.js`, 14.3 KB) is counted in it now, as the task told (it sat in no budget); 428.6 KB measured by hand, inside the 430 the owner allows for the character work. (11-19; docs/tasks/CHARACTERS5.md, DEVLOG 11-19)
- Each art change costs ~5 h of server rebake: batch art changes; avoid re-keying world/art unless the task needs it. (11-07; queue, agent-rules)
- Don't slow the server's start (health window). (agent-rules)
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
