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
- Finish or hide, the pre-beta calls (11-24 08:44; chat: "Lets Agreed on your suggestions"): the casino floors and card
  tables kept (their art in the Fable pass); car soccer kept, its arena art (ball, pads, goals, scoreboard, the boost
  flame - branch `arenaart`) on the Fable list; the raceway and the water races kept, their markers and grid on the
  Fable list; tennis kept (the racket swing with the people pass); the kayak races hidden until the kayaker sits in it
  and paddles (shared/hidden.js - kayaks still hire and ride); the cinema **redesigned before the beta** ("for the
  cinema lets redesign before the beta") - a lobby and separate auditoriums, in the Fable chat's world-art work.

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
- The owner's console opens on a Status tab: the server's health at a glance - problems flagged in plain words, the art redraw's progress and time left, updates, rollbacks and backups (11-23 07:09: "Can we make the status easier to read and more organized? ... flag any issues the server may be having ... see if the art is being redrawn and how far that is into it"). (11-23; chat)
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
- The "Before you play" screen has no 13+ checkbox: its text says playing confirms 13+ (under 18 with permission) and either button (Accept / Essential only) confirms it; analytics as a small note, the two buttons equally easy. Shown once. (11-20; chat)
- Car soccer: no goal replay (it confused) - a goal shows GOAL! and the scorer, the ball stays in the net, then kick-off puts the ball and every car back at the start. (11-17 21:05; chat)
- Minimal HUD: a dot or one fading line, never a new on-screen panel; new UI lives in the phone. (10-24; agent-rules, chat)
- World events (someone collapsed, a fire...): no arrow pointing at them off screen - you see one when it's on screen, marked by an SNES-style pixel highlight (corner brackets and a chevron in its colour); the radar still shows them. (11-17 20:34; chat)
- Nothing lingers: prompts fade after a few s, big moments go by themselves (2.6 s), sit long and the UI fades. (10-10; DEVLOG 10-10, 11-03, 11-04)
- The touch sticks' behavior is untouchable (layout may move, behavior may not). (10-24; agent-rules, queue 11-06)
- The aim stick stays (drag-to-aim on FIRE was rejected). (10-24; DEVLOG 10-24)
- Every screen and mode has a way to back out on every device and control scheme. (11-12; chat, queue)
- The Bag is the Inventory, overhauled: easy to navigate and see what you have, using the screen on desktop and phones (landscape and portrait) - your character in the middle of their slots, change or take off clothes (one piece or everything) from it, weapons and gear clearly shown and equipped from it; the concepts U6/U14/U15/CC10/UIC-19 and similar games (GTA's wheel, Stardew/Terraria's hotbar, Zomboid's slots) as the guide. (11-16; chat: "The inventory system needs a huge overhaul ... It doesn't need to be called a bag, just Inventory", DEVLOG 11-16)
- Switch weapons and use items without opening the Inventory: the quick bar's keys (1-4 weapon slots, 5-8 items), Tab or the mouse wheel to step, a wheel on hold (Tab, RB, the weapon button's hold on touch). (11-16; chat: "scroll through different items and equipment and weapons without digging through the inventory", DEVLOG 11-16)
- Playing an instrument: the Inventory gets out of the way and the pad is a compact see-through strip at the foot; your character visibly plays it in the world. (11-16; chat: "When I'm trying to play an instrument I can't see what I'm doing ... If I equip something like an instrument I should see my character playing it", DEVLOG 11-16)
- Changing clothes from the Inventory is no free wanted-level escape: refused while wanted except inside your own home, and only a change at home or a store's fitting room counts as a disguise, as before. (11-16; Claude's call in the inventory job, DEVLOG 11-16)
- Back and close in the same place on every screen. (11-03; DEVLOG 11-03 UI-10)
- Portrait stays fully playable (no landscape-only). (11-12; queue)
- HUD look: Direction A, the SNES pad - navy panels, gold rim, CLA Pixel everywhere in the HUD. (11-12; DEVLOG 11-12)
- Menus in the pixel font too: CLA Pixel for every menu and the page default (Bold for heads, labels and buttons, Regular for what you read); no Barlow / system fonts in player screens (Barlow only a missing-glyph fallback); the age gate and Account panel in the UI v2 look; SIGN IN on a sideways title. (11-19; the owner 11-17 "not in the SNES pixel font", QUICKWINS task) - SUPERSEDES UI-1's "Barlow Condensed for everything you read" (10-24).
- Button rule: a fixed action gets a simple symbol (FIRE crosshair, ROLL chevrons), a situational one gets a word (ACT shows its verb, BRAKE...). (11-12 19:28; queue) - SUPERSEDES words-only (19:26), symbols + chips (19:22), game-icons silhouettes (17:29).
- The vehicle button: simple enter/exit door symbols; GET IN / ON / EXIT / OFF words only in tips and the Guide. (11-12 19:37; queue)
- Button sizes 60 / 52 / 40 px, translucent navy with an accent rim, one word size, measured centering. (11-12; queue)
- ACT shows only while a prompt names it. (11-13; DEVLOG 11-13)
- On touch the prompt's card has no button chip (the ACT button says the verb; nothing on the card looks pressable), sits in clear space - upright above the cluster's buttons, never under one - and is two lines at most, never cut in a word. (11-14; chat: "it looks like you're supposed to press the popup because it has a button in it", DEVLOG 11-14)
- Touch buttons never touch: 6 px clear between any two, 12 round ACT (its pulse ring), at every layout; the sticks unchanged. (11-14; chat: "the act or look button overlaps the other button so it's a little too close together", DEVLOG 11-14)
- Right aim stick stays in the corner, action buttons on arcs round it; in portrait a tight thumb cluster. (11-12; queue, DEVLOG 11-06)
- The UI's style (the owner, 11-24 09:39: "is there still a UI pass to make all the buttons and UI and icons and everything look right and blend in well with the authentic SNES art style we're shooting for? Some UI still looks overly polished and not that 16-bit SNES style we want (like frames and some text and some icons etc)"; and "Right now the inventory just has placeholder vector icons for clothes items"): a UI style pass is part C of the Fable art pass - every screen set beside the UI kit (UIK-00) and UIC-01..21 for its frames, type and icons; and every clothing piece gets a picture of itself in the Inventory (today one line glyph a slot with a colour dot, `client/bag.js` `SLOT_GLYPH`). OPEN: whether the buttons', apps' and HUD's clean line icons become pixel icons (the next line, 11-06, kept the line set) - his pick from a sheet, since it sets a look. (11-24; chat)
- The Clean (Lucide) icon line kept; the pixel icon set does NOT ship (branch pixelicons unmerged). (11-06; queue)
- Item and weapon pictures: every item and weapon has its own pixel picture after IC1-IC5 (`client/itemart.js`), shown in the bag (tiles, details, quick bar) and the quick wheel - the owner picked the pixel pictures from the side-by-side sheet (11-21: "Items are looking good"), with a second pass on the ones he named: a traditional pickaxe and axe, feathers that read as feathers, mushrooms that read as mushrooms, a geode with shine and sparkle, raw meat that reads as meat; the weapons polished again (katana, sword, knife, hunting knife, fists, the bow aiming forward, plasma blade, bat, sledgehammer, crowbar, flamethrower). SUPERSEDES, for items and weapons only, "the pixel icon set does NOT ship" (11-06): the buttons, the apps and the HUD keep the clean line set. His 09:55 notes: the steaks tell apart (a slight colour variation), a better pickaxe, a katana that reads as one, the hunting knife a buck knife, the bat a bat and not a club, the silencer visibly attached to the silenced pistol rather than one long barrel. Goes live after his review. (11-21 09:27, 09:55; chat, DEVLOG 11-21)
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
- The small ambient creatures (pigeon, gull, butterflies, dragonfly, bee, frog, rabbit) keep their painted look - a redraw at the art pixel was turned down ("looked a bit better before"); only the sparrow's redraw stays; a light polish on the painted ones is his to judge. (11-21 09:27; chat, DEVLOG 11-21)
- Animal notes of 11-21 09:55: the monarch could look better and the rabbit gets the pink in its ears back and looks a little better (both now their own pictures at the art pixel, like the sparrow; the other two butterflies with the monarch); the cats need a better polish, the face above all; the grizzly's hump is too big; the moose's legs thinner and its antlers more defined. (11-21 09:55; chat, DEVLOG 11-21)
- Art polish order (11-21 08:05): the animals and wildlife first (pets, farm, wild, birds, fish - "some dont look very good at all", close to the concepts), then the UI's icons with the unfinished `inventory` branch, then the nature kit, then buildings, storefronts and interiors a district at a time, vehicles last. (11-21; chat, DEVLOG 11-21)
- No red cross on anything (protected emblem): clinics and pharmacies a white cross on green. (10-18; DEVLOG 10-18)
- No snow: summits drawn as scree and rock. (10-17; DEVLOG 10-17)
- Placeholder art, markers and waypoints get replaced with real SNES-style art game-wide. (11-13; queue)
- Characters: keep the system (it generally looks good); make every look option read clearly - premium hats and glasses; same bar for NPCs. (11-13; queue)
- The player characters keep the game's current sprite art; never swap in the high-detail close-up renderer (the menu avatar uses the game sprite, scaled up). Character polish later is staged and switchable, approved sheet by sheet. (11-14; chat: "Lets not revert the player character art back to what is showing in the avatar")
- Character polish: proportions A (about 3.1 heads: a neck, shoulders, longer legs, hands, full faces), as built on the `characters` branch; still behind its switch until the owner approves it in the game. Next passes take the people toward all the character concepts (docs/characters/concepts). (11-19; chat) - SUPERSEDED 11-20 (the chunky build, below).
- Character polish ON for everyone (11-22 12:41): "I think the human/player art is ready to turn on to go live ... it looks pretty good". On unless switched off (`cla.polish` '0'); the debug menu's *Character polish* still turns it off on one screen to show the old people. The old people kept safe: the branch `people-before-polish` (the live version just before), and their drawing stays in `people.js` under the pass. (11-22; chat)
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
- The page's code budget is raised (540 -> 560 KB): "Okay to raise the limit" - the page was at 540.46 KB, and the next performance fixes (P2: the classic lights' and the rain's per-frame garbage) are page code. (11-24 08:15; chat; tools/perf.mjs)
- Every wardrobe piece is checked for skin showing through, from every side, not only the standard outfit: "T shirt dress and jersey dress have skin pixels showing through (I thought we were doing checks on this to make sure)". (11-20 22:19; chat; tools/bodycheck.mjs wardrobe(), test/bodyshape.test.js)
- All of the missing work is to be finished and every note accounted for, the animations checked, anything else from the concepts added: "You can do a large batch and finish everything missing ... Please make sure all animations work well. Make sure all customizations and everything are in. Feel free to add anything you can find from the concepts." (11-20 22:19; chat - OPEN: 20 concept items are not built, listed in the DEVLOG entry of that hour)
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
- Facial hair is only what reads at the game's size: "if we want to add a bigger beard and obvious facial hair we should go for it but otherwise it might not be worth it for some of these that don't show anything at all or anything visibly clear." Eight styles stay, drawn to be seen (stubble, short, full and long beards, goatee, moustache, handlebar, mutton chops); a chin strap, a soul patch and a Van Dyke are drawn as the nearest of those and aren't offered while the pass is on; the five added on 11-20 (circle beard, horseshoe, walrus, pencil, Fu Manchu) are taken out. (11-21 01:03; chat)
- The scarf gets one more round, then goes: "let's ditch it unless we can get it right this next round. It should just bunch up around the neck and maybe cover the bottom of the face over the mouth and wrap all the way around and dangle down a bit on the chest like scarves do." Rebuilt as a shape (a roll round the neck, an end down the chest). **KEPT: "Scarf looks good lets keep it."** (11-21 01:03, kept 07:40; chat)
- Everything left for the characters and the NPCs is done in one overnight run, unattended: "can you do everything left for the character/npc characters and work until it's done! I'll check in tomorrow morning". Still on the branch, nothing live. (11-21 01:31; chat)
- The handlebar moustache "looked better before but just want to make sure it looks okay to an angle and side": the front is unchanged (it was the same pixels in both rows of the sheet); at three quarters and from the side it is one bar on the mouth's row now. (11-21 01:31; chat)
- **CONFIRMED 11-21 07:40 ("Everything else sounds good") - Claude's calls overnight:** the hair length slider is dropped (length is the style; the Hair tab filters Short / Medium / Long); dogs on leads and a bike with a basket are out of the wardrobe's scope (world things); the bodybuilder build is men only until the women's underwear cut passes the body check; a look's code may be two letters longer (dyed tips, a beard's color) and a stoop uses a spare bit - older codes read as before. (11-21; DEVLOG)
- Beards and moustaches have texture like the hair, not one solid color: "I think beards need similar texture as hair ... Is this a good idea to adjust with a little texture like hair has?" - yes: three tones (shade, body, lit - the lit one the hair's own highlight) and clumps. (11-21 04:54; chat)

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
- Summit Tarn's fall and the sea cave, second try (the owner, 11-21 19:18, of the granite rim and the bluff built that afternoon on `nature-world`: "Both of these fixes do not work ... just added a line of cliffs that dont look good and dont consider topographical levels"; "I dont want to spend too much time fixing these two areas"; "maybe it just needs a tiny little stream waterfall"; "maybe we just need to find a better spot where the cave entrance can fit naturally"). Rules taken from it: no line of cliff pieces laid on flat ground to fake a height the land doesn't have; a fall is as big as the drop the land really has - Summit Tarn drains over a low sill into its stream; a cave goes into a rock mass that stands as a hill of its own (as the mine's does), or into a cliff the land already has. The rim and the bluff are withdrawn. (11-21; chat)
- Summit Tarn's low sill and the sea cave's rock hill are placeholders (the owner, 11-21 20:11: "They're decent placeholders for now but let's make note of fixing them later. Please move onto water."). To fix later, with real ground levels where each stands: the tarn on a shelf with its fall down a rock face (concept N5); the sea cave into a cliff or headland the land really has (concepts N3, N8). On the pre-beta list's later-art section. (11-21; chat)
- Variety is checked, not hoped for (the owner, 11-21 13:08: "Is there a way to make sure these environments are using the variety of each tree and plant and rock and mushroom ... seeing the same tree used multiple times near each other"): a plant's shape is laid out by place so its twin (same species, shape, size, colour) does not stand near it; `test/undergrowth.test.js` counts twins and pictures per place over the built world. (11-21; chat)
- Water is part of the nature polish (the owner, 11-21 13:08: "Can this also include water and water generation, we've struggled with getting the vfx showing ripples and reflections and light and interactions with water correct ... I'm always finding glitches on the surface ... across the world in different types of water bodies"): every kind of water body is recorded moving, at several times of day, and checked for flicker and seams before it is called done. (11-21; chat)
- Nothing grows through a fence (the owner, 11-21 12:20: plants "across sidewalks or through fences"; the lupines through the pasture's rail fence in the day's own picture): the page's undergrowth, drifts and beds leave every tile a fence, wall or hedge line crosses (`statics.js` `fenceLine` -> `addGreenery`; `test/undergrowth.test.js`). The audit had no row for it (its fence row is railings over water). (11-21; chat)
- The nature concepts as scenes (11-21 11:48): "recreating scenes from all the nature concepts as close as we can get it (but keeping our art style and colors) and then recycling those props and prop variations throughout all the appropriate biomes and regions and locations" - and a full kit that makes the world "natural and alive and immersive and believable" while performance stays good across the devices. Approved 12:12 ("That sounds good to me"): an audit first, piece by piece, of the nature sheets against what the game has, then the pieces built by biome and placed by rule - pine/oak forest and meadow first, then redwood, mountain, desert, coast and jungle, the water's edges last. The audit (project doc `claude/nature-audit-2026-11-21.md`) found most of the scenes already built by October's nature program: per biome the work is their look at the art pixel, the same kit spread by rule beyond the hand-made places, and a short list of missing pieces. Solid pieces are server-placed props, walk-through ones a rule in the page's undergrowth; the whole batch on `nature` for one re-bake. (11-21 11:48, 12:12; chat, DEVLOG 11-21)
- The plants' painted light (11-21 11:48, his question on the oaks' dark lower right; picked 11-22 09:15): the left-right light is the game's sun alone (`client/art2/flora.js` `SIDE` 0) - "shouldn't it all work with the in-game light?". A plant's picture keeps its shape and its up-down shading; the side it is lit from follows the sun through the day. (11-22; chat, the sheet `plants-light.png`)
- The Fable art pass's order (the owner, 11-24 09:25: "We were working on the nature pass first so I want to make sure that gets prioritized to finish it up ... for the city wide ... it should be a bigger pass too to see what artwork can use a polish and how things are placed in world to feel hand crafted and close to the concepts"; 09:39: "I think this order is looking good let's do it"): the order of 11-21 08:05 stands - nature finished first (water, then the biomes in the order of 11-21 12:12), then buildings and districts as one concept-led pass a district at a time (the shared kit of fronts, signs, roofs and landmarks; the cinema; the craft pass's waves), then the people's faces, the UI's style and the clothing pictures, the game art, vehicles last. Later notes (11-22, 11-23) are folded into the place they belong to; each part's first report names the concepts opened for it. (11-24; chat, project doc `claude/art-pass-plan-2026-11-24.md`)
- Mouths (the owner, 11-24 09:39: "I think mouths I noted are tied to makeup actually ... my character had black lipstick on. If that's working as intended then I think we're good with how mouths work"): it is as intended - the small faces have no mouth (11-19, `POLISH.mouthOn`), painted lips (lipstick, glam, goth, a clown's) always show. What stays to do is a face polish: painted lips drawn the same in every frame and direction ("drawn consistently if we do have lipstick"), fewer stray pixels, features that read - without overwriting the earlier character work ("Please don't break things during this"): each fix measured against a snapshot of every figure, as on 11-20. SUPERSEDES the 11-23 note's "a softer, thinner line or none". (11-24; chat)
  - The owner, 11-25 01:34, playing the live build: "The player characters and mouths might already work just fine
    ... I do notice my mouth because I think im using black lipstick and it makes some funny and good expressions I
    think a mouth like this might work how it is now but maybe a very soft lipstick option or default mouth option.
    Either way if we give expression to the mouth if the NPC does have a mouth we want to make sure the mouth is
    expressive and built into any other animations or idle movement or emotes or anything." So: painted lips stay as
    they are; to add in the faces step (plan C.1) - a very soft lip colour (a tone or two off the skin) as a makeup
    choice, and whether it is the default is his pick from a sheet; and wherever a face has a mouth, the mouth takes
    part in the emotes, the idle and the other animations (smile, open, flat), held in place over every frame.
    The 11-19 rule (no mouth on the small faces unless painted) stands until he picks.
- The sea deeper blue offshore, a shelf of clear shallows along the sand (the water pass, 11-24): kept - the owner,
  11-24 14:37, on the pictures: "I think the new sea looks fine."
- The redwood forest opened up (the owner, 11-24 18:00: "I'd like to give you some creative flexibility on the redwood
  forest because currently it's not working as well as I think it could ... if a decision I've made conflicts with
  polishing and maybe overhauling the redwood area let me know"): an overhaul, proposed in
  `docs/tasks/REDWOOD-OVERHAUL-2026-11-24.md` - the giants as trunks with no crown in the walking view, crossings
  square to the water, a fern kit, finds placed by hand rules and never hidden. It would replace his crown mix of
  11-21 15:39; the tree treatment is his pick from variants before it is rolled out.
  - The owner, 11-24 18:13: "I want to go with your suggestion for the redwood area. Let's power through this area." -
    the overhaul is approved as a whole.
  - The giants as trunks: REJECTED on sight (the owner, 11-24 18:47: "I don't think the disolve looks good ... what I
    see is not looking good compared to what we have already"). Built two ways (a cut top; a top thinned out upward),
    neither committed. The giants keep their tops. The lesson kept: a new look goes to him as variants first, even
    after "go with your suggestion".
  - OPEN, his pick from `report-13` / `report-14`: A the trees as they are; B every giant's crown carried high (today's
    form over paths: boughs from 0.76 of its height, fullness 0.5); C a small crown higher still (0.82, 0.45, 0.7 as
    wide); D smaller again (0.86, 0.4, 0.55). The rest of the overhaul (crossings, water, ferns, finds, places) does
    not wait on it.
- The water's bank (the owner, 11-24 21:40: "The ridge along the river is a little too uniform like just a brown
  outline to the river edge ... it can blend in with the water in some places, it can be a rocky/stone beach, it can
  be dirt and sand beach, it can just blend in with the vegetation into the water, it should be a good natural mix
  just line in nature but not just this perfect brown outline between the land and water"): wild banks vary along
  the shore by rule (groundbake.js `bankKind`); designed ground (lawns, parks, golf) keeps its lip.
- Crossings (the owner, 11-24 21:40: "The stones in the water between trails is a great detail. All the stones look
  about the same so some variation in the stone would be good ... it doesnt just have to be stones that connect paths
  it can be some fallen logs or makeshift log/stick/natural bridges"): stones vary; a narrow path may take a fallen
  log; a makeshift stick bridge is a piece still to draw.
- Vehicles in water (the owner, 11-24 21:40): never an instant loss in shallow water - splash, slow, stall, and sink
  only in deep water; off-road vehicles ford deeper. Logged for the pre-beta (`docs/audit/PREBETA-LIST.md`); not built
  in the art pass.
- Natural lakes get natural shapes (the owner, 11-24 21:40: "The lake looks better like this so this would be
  acceptable ... For these natural lakes like this some natural shape looks better"); Mirage Lake's offshoot cove on
  its west side added at his suggestion.
- The dark on plants (the owner, 11-24 22:23: "Its not an outline ... Its the dark/basically black shading on the
  underside of this art that makes it stick out ... These should be reacting to global lighting"): measured - 102 of
  121 plant kinds have over 15% of their pixels near-black when lit at noon, painted dark and turned from the sun at
  once. The fix proposed (a floor under a leaf's painted shade; light that wraps round leaves in the light pass) is
  his pick from `report-26` (B, C, D). OPEN. Brought forward from the plan's "11-23, across biomes" line; before the
  pre-beta.
  - The owner, 11-24 23:06, on B/C/D: "looks better between B and C but its not right yet, it seems drawn differently
    than other art in the game, can we compare this to the style anchors ... it might be taking a concept too literally
    ... look at the original fern in A and however this was created I think is how the world art is being created to
    react to the lighting in-game better?" Compared and measured: he is right on both counts. (1) The concept sheet
    NK1-M's plants go to black (38 to 55% of a plant under 50/255; its darkest tenth is 3, 5, 8) and the plants copied
    that; the style anchor R1-D's darkest green is 25, 57, 45 - never black, and green, where the plants' darks lean
    blue. The anchor rules (DECISIONS: colours game-wide from R1-D), so the concept was taken too literally. (2) The
    sword fern has its form painted and every leaf pixel facing up, so the game's light falls on it evenly (9% under
    50); the other plants carry rounded surface directions, so the light shades them a second time on top of the
    paint. Proposed (`report-30`, `report-31`; E, F, G): every plant made as the fern is - leaf surfaces turned up
    (three quarters, or fully), the form left to the paint - and no leaf tone below the anchor's dark green, pulled to
    its hue. Near-black falls from 27% of a plant to 15% (E), 8% (F), 7% (G); kinds over 15%: 102 -> 58 / 18 / 16.
    Cast shadows, time of day and weather still fall on plants as on everything. OPEN: his pick of E, F or G.
- Banks, again (the owner, 11-24 23:18: "I do like the 'after banks' work here but that harder edge from before i
  called the brown outline could still be a good detail in some areas ... Lets try blending the surface and underwater
  art between land and water, some more stones on land, some less stones in water, a few harder edges, some softer
  transition between land and water, a good blend of things ... apply this logic across rivers/streams/creeks and
  land"): built the same hour (groundbake.js: the bank going under in tongues, stones on banks; fewer rocks in running
  water); the earth lip kept on about a fifth of a wild shore.
- Review pictures are at the game's pixel (the owner, 11-24 23:26 / 23:31, on seeing two pixel sizes in close-ups
  rendered at the world pixel): from here every picture for him is rendered at 1 art pixel and enlarged whole.
  Whether the ground - painted finer and halved by the bake - reads soft beside plants drawn at the art pixel is to
  be judged in a running game; redrawing the ground materials at the art pixel would be its own piece of work.
- Wild flowers (the owner, 11-24 23:37, on the lupines / foxgloves: "all the stems are so straight it kind of feels
  out of place in the world (unless its part of a garden or flower pot)"): the spike flowers get natural variation -
  leaning, curved, uneven stems, leaves at the foot - and a wider variety; the straight form stays for gardens and
  pots. Not built yet (the bake's code budget).
- The project to go private before marketing (the owner, 11-24 23:40): logged with a plan in
  `docs/audit/PREBETA-LIST.md`; his to schedule - not art.
- Plants lit evenly, never black - built (the owner, 11-25 00:04: "you can still see many plants with the dark
  shadow on it ... Can we identify these and others across the entire environment/nature art packs and make sure
  they dont have these hard shadows baked into them?"): `flora.js` `leafLight` on every plant the world places
  (variant F of `report-30`: leaf pixels turned three quarters up, no leaf tone under the style anchor's dark green);
  `test/leaflight.test.js` holds all 121 kinds. The lighting standard for nature art from here: the form is in the
  paint within the anchor's range, leaf surfaces face up, the game's light does the rest.
- One pixel size, and sizes are drawn, not resampled (the owner, 11-25 00:04: "when you resize and flip horizontally
  ... is that where pixel size lost consistency? ... Can different variations/sizes be redrawn with the right pixel
  size?"): checked - every plant kind is made at the art pixel at each of its sizes (floraArt runs the maker at the
  size; a mirror is exact), tested (test/floraart.test.js). What differs is how finely a plant is drawn on that grid
  (a fir in clumps of two or three pixels, a fern in single pixels) and that the ground and the voxel props are made
  at the world pixel and halved by the bake.
- NPC and wildlife behaviour, the shop door's hop and the shop signs (the owner, 11-25 00:22 / 00:33): logged in
  `docs/audit/PREBETA-LIST.md`; the quail family rule - group behaviours stay whole - recorded with it.
- The open ground round you is never hidden (the owner, 11-25 01:13: "Could we have more buildings go transparent
  when they're blocking an alley or street"; 01:24: "when you're on the street you can still see behind the buildings
  so nobody can hide ... it would be good to see the entire street and sidewalk from anywhere in the street here, or
  a wider range. Whatever would help people play the game and not have trouble seeing behind buildings"): built
  page-side (host.js `_fades`; `FADE_REACH` 20 tiles along, `FADE_ACROSS` 7 up and down) - the street, sidewalk or
  alley you stand on is followed out from your tile, and every building whose picture lies over that ground fades.
  A building faced from its own street keeps its front - so the alley BEHIND the row you face stays hidden until you
  step into it: opening that too would ghost the shopfronts, and is his call. Not seen in a running game.
- A faded building is all but clear (the owner, 11-25 03:05, on the live see-through streets: "we need the buildings
  to be totally transparent like as transparent as it is around my character. Maybe a little bit of gradient or
  dissolve around the edges but it should be really clear you can see past these building blocks ... And have a good
  transition kind of like how we have for entering buildings now"): engine.js `GHOST` 0.6 -> 0.94, a rim that
  dissolves in over 12 px along its outline and its footprint (`GHOST_EDGE`, `EDGE_PX`); the eased transition as it
  was (0.35 s in, 0.5 s out). This replaces the 10-23 "a ghost, not the whole of it at once"; a thin thing (a mast's
  hut, a tree) keeps its lighter ghost. On the branch; live on his word.
- The bake's code budget 1,080 -> 1,100 KB (the owner, 11-25 03:05: "Yes raise the bake code limit as you need").
- The fern kit approved (the owner, 11-25 03:05: "Fern looks good to me, I would go easy on the gold bracken and use
  it sparingly and in places that would make sense logically, and sometimes in little clusters but mostly just good
  detail to add in sparingly among the other green fern").
- The project stays public for now (the owner, 11-25 03:05: "If this can cause performance or connection or any issues
  for the players Id rather just focus on getting a clean fun great game out first and just make it bet best and
  first known ... even if some people try cloning"): Claude's answer recorded in PREBETA-LIST - no effect on players
  once done, about a day, a deploy risk while it is done; the one cheap step (stop sending server source to browsers)
  can be taken on its own. His call when; not scheduled.
- The giant redwoods' tops are a mix of three (the owner, 11-25 03:20: "can we do a mix of all three (A and both J
  column and J ragged?)"): the tapering spire as it was, a column under a round top, a column under a ragged top -
  two of each among a giant's six shapes (statics.js `RW_TOP`). The young redwoods keep their cones.
- Art with the dark shadow painted in is redrawn from its source, not corrected afterwards (the owner, 11-25 03:29:
  "the art that has the super dark shadow drawn into it all of those just need to be redrawn from scratch ... trying
  to get rid of it seems to change the color of the asset and it doesnt blend in with the other nature in the area
  ... lets get a list and redraw all of them and just let me know what needed the redraw"). So: the palettes' shade
  tones and the painters' shading are what change; no lift of the finished picture; a census over the baked world
  (tools/nature/darkscan.mjs) and a list of what was redrawn.
- The mountains' crags are look B (the owner, 11-25 07:19, of three variants: "B for the mountain/cliffs is best, also
  were not doing snow yet so let's not do any snow for now"): a granite cliff one sheer wall half as tall again, its
  top the grey of the rock behind it, that rock in big light slabs rising in ledges along the land's contours. No
  snow is drawn on the benches. (Claude's question whether this meant "the world's existing snowfields" was wrong:
  no snow has been drawn since 10-17 - the ground above the snow line is pale cut granite and scree; shown to him
  11-25 09:15.)
- The El and the highway decks do NOT go see-through for now (the owner, 11-25 09:03, on the picture under a deck:
  "The highway/bridge transparency not sure that's right yet, maybe we leave that alone for now"): statics.js
  `DECK_SEE` false - the rule and its test are kept for when he says.
- The summits are built as knobs of rock from the plan (the owner, 11-25 09:03: "Build the summit from plans" -
  docs/tasks/MOUNTAIN-LOOK-2026-11-25.md).
- The redwoods get a network of creeks like Fernwater Creek (the owner, 11-25 09:03: "Creek looks good let's go with
  it").
- Summit Tarn may be changed (the owner, 11-25 13:33, to "a wall of rock behind its north shore?": "Yes you can change
  the summit tarn if you think it looks or works better").
- Water under a road reads as a bridge: the road going over it, the water lined up either side (the owner, 11-25
  13:33, on a creek's stone headwalls: "it doesnt look like the stream is goin under the road, just looks like its
  leading into a skinny concrete structure. Lets make sure water under roads looks more like a bridge with the road
  going over it, or just have the water line up correctly so its clear it goes under the road"). The same eye for the
  trains' tunnel mouths ("the tunnel entrance and exit doesnt quite line up with what the tunnel is leading into").
- A stream joins the larger water it runs toward (the owner, 11-25 13:35, on a stream that ended in a pool at the
  sea's edge: "Lets make sure streams and flowing water is still connecting to the larger bodies of water its going
  towards, doesnt just close off right before the open water").
- Faces and lips, when the art pass reaches them (part C): look only, and fix only what is plainly off (the owner,
  11-25 12:45: "these might already be working okay so lets be careful not to try to over fix or over polish and
  make it not better than it already is. Would be okay to do a pass on it just to consider if something is off and
  could be fixed"). No redraw of the faces; anything beyond a plain fault is shown to him first.
- The summits as built, the high mountains' shading and the creek network are good (the owner, 11-25 11:57, on
  `report-46` to `report-49`: "This looks good lets keep moving forward"). The whole suite and the re-bake: asked by
  him whether now or after more art - Claude's answer: art while he is here, the gate when he stops for the day; no
  merge before his word on that.
- The re-bake comes after the summits and the creek network are in (the owner, 11-25 09:30: "Let's rebake after the
  summits and Creek work"): the art branch goes out then, in one re-bake - not before, and not held for the rest of
  the art polish.
- Live 11-25 09:10 (PR #49, his word "Push the transparent buildings and emotes"): faded buildings all but clear;
  emotes run through their frames.
- WebGL2 stays a requirement (the owner, 11-24 21:40: "which i dont want to change because that seems standard on
  the consoles we are aiming for").
- The lake that was "a perfect oval" (his note of 11-23) is Mirage Lake (the owner, 11-24 18:13: "I think it was
  mirage lake that was very oval in shape yes. It's one that shows up in the cinematics"): its shore to be reshaped
  (`shared/world3-mirage.js`, a hand-made place), its beach, palms and jetty kept right, the cinematics that show it
  reshot after.
- The art pass's checks (the owner, 11-24 14:35: "Keep a list of things to check and I will check them when we push
  everything live, but since a lot of this is a world art update i think we should wait until we get all the art done
  first, or at least a large chunk"): what wants his eye is kept in `docs/tasks/ART-CHECK-LIST.md` (project copy
  `claude/art-check-list.md`), each line with where to look and what was changed; the art collects on its branch and
  goes live in large batches, not piece by piece. One exception proposed to him the same hour: a look that is baked in
  and that later work builds on (so far: the sea deeper blue offshore) is better judged from the pictures sent when it is
  made - changing it after a batch is live costs another re-bake.
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
- The owner's soundtrack and instrument kit arrived (11-22 02:48): 25 core songs with a chosen primary take each, backups, 20 more recordings under 12 optional cues, a guitar kit and an instrument set, with an implementation brief from ChatGPT that says to rebuild every song in the engine. He asked Claude's opinion ("it doesnt have to be how chatgpt is suggesting"). Claude's advice: keep the 11-12 decision - play the recordings, do speakers and distance in the engine, loops only where a place has one bed of music, the engine plays the player's own instrument in the gigs. `docs/tasks/MUSIC-HANDOVER.md`. - OPEN: the owner to say recordings or rebuilt; until then 11-12 stands. (11-22; chat)
- Music lives in the world, the same for everyone (the owner, 11-22 03:07: "synced across all players so you're hearing the same music at the same time in the same places in a proximity kind of way"): a source's song and how far into it is are set by the server's clock, so a song is often joined partway; not every place has music or has it all the time; no place repeats one song on every visit; the hospital lobby always plays its bossa nova, over ceiling speakers, pleasant, not annoying - heard on waking there. Each source sounds like what it comes from (a night club's good speakers are clean; a cheap radio is not). A loud interior is muffled from outside, louder toward the door, full quality inside, and the reverse on leaving. Sources he named: speakers, the street, car radios, the radio while gardening or farming, lobbies, stores, casino, bar, night club, dancing, street and NPC musicians, arcades, the music minigames. Where a song has no clean ending, measure it and make a loop or an ending. Plan: `docs/tasks/MUSIC-HANDOVER.md`. (11-22; chat)
- The soundtrack is the owner's recordings, cut and joined - not rebuilt (11-22 10:12: "Were these recreated?" - no; every loop, ending and full song of the 25 primaries and 31 alternates approved by ear, 11-22 10:12 and 11:13). Each take plays as the full song from the top (radios, tapes, a boombox: "it makes more sense to start the song from the beginning") or as its loop (a bed: shops, lobbies, the club). The alternates in rotation: the primary about 70%, the alternates the rest ("should go with the primary song the most but might be nice to have some variety"). Both Opus and MP3 copies kept (only one is fetched by a player; MP3 for browsers without Opus) - 11-22 12:51 "sounds good". On for everyone without waiting for his listen (11-22 13:12: "I don't think I need to wait for me to check the music you can go for it"); the debug menu's *Recorded music* turns them off on one screen. (11-22; chat)

## World and places
- The farms back from the beach (11-22 16:45: "We should get the farm away from the beach"): no crop field, strip or orchard within 6 tiles of a beach's sand; a beach town's district may hold farms well back from the sand. `shared/world3-croptidy.js`. (11-22; chat)
- Greenfield Park's Lane Mart and Park West Coffee get rooms you walk into, like the other shops (11-23 07:09: "I think they should get rooms yes") - the city arrival's own shops, laid with the hand-built block. (11-23; chat)
- Bin bags: a few piled beside some bins in the rough districts - "a few bags but not too many, just some bins have some bags piled next to it in rough neighborhoods" (11-23 07:09); never a bag on its own away from a bin (the binBags lint row stays). (11-23; chat)
- A casino's entrance faces the street (11-23 07:09: "Yes entrances should face street on casino"). The Strip's south-side resorts and Old Downtown's south-row casinos already front their street (the boulevard; the covered street of lights - the concepts), on the north side the camera doesn't see: kept, and their doors made to read - a lit marquee over the roof edge on the street side, a doorman or valet spot, an A-board; Old Downtown's back row moved off the casino rooms (the owner's pick of three, 11-23: "Keep, make doors read"; re-planning both blocks to face south was the other way). (11-23; chat)
- An ATM that can't be set into a wall (a kiosk that is some street's only cash) gets a booth of its own (11-22 16:45: "Booth works for atms") - art, for Fable; until then it stands as a kiosk. (11-22; chat)
- Every boat that looks usable is usable (11-17; 11-22 15:03 for the moored ones: "Let's make them drivable"): the canoes and rowboats on the shores become kayaks and rowboats in the water beside them; the moored sailboats, yachts and fishing boats become a Gull 26 Sailboat, a Seaview 32 Cruiser and a Fishing Trawler - parked boats, anyone's to take. `shared/world3-boats.js`. (11-22; chat)
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
- Every business players use is walked into: a room behind its door, its service at the counter inside - never at the wall (the countryside's hand-built villages too: `b.rooms`; a charter office is a walk-in, its desk inside). Every business and home door is on a path (pavement, plaza, boardwalk, gravel) that reaches a road or the quay; nothing walkable left as grass right up to a front. Nothing covers a sign: no ATM, prop or badge over a name board's words or an OPEN sign (the ATM stands under the sign board; the OPEN moves clear of it). Placement lint rows signCovered, doorOnGrass, wallOnly. (11-16; chat: "These places in Egret Point don't have interiors, they just have you interact at the wall. They also don't have sidewalks or walkways leading up to the buildings, they just sit on grass. The open sign on this building is covered by this ATM.")
- A neon board's words keep a dark row clear of its lit rim (the Gaff Hook's rooftop BAR read "Uar"). (11-16; chat)

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
- Tri-faction rules (heat, peak-wanted memory, disguise, Enforcer badge, bounties, carjack temperaments) as in ARCHITECTURE.md's table. (10-03; ARCHITECTURE.md) - bounties SUPERSEDED 11-22 (next line).
- Bounties are only what players place on each other: no "city bounty" for crimes (it came at 4+ stars). (11-22; the owner's notes: "The bounty system was supposed to be something players put on each other, I wasn't planning on having it something you get for committing crimes around the city")
- Wanted levels come less easily (11-22; the owner's notes: "You get wanted levels too easily still"; "people on an honest path ... don't get penalized too hard if they accidentally do something"): the tally before the first star 36 (was 24), small crimes before a star 5 (was 4), and running someone down is a lesser crime (22 heat, not a felony; was 40 and a felony). Claude's numbers, his to tune.

## Weapons and loadout
- Loadout: 2 guns, 1 melee, 1 throwable carried; the rest in your stash. (11-03; launch-plan 11-03) - built 11-14 (branch weaponstash, not live yet).
- Carry upgrades later: shoulder holster +1 gun, back sling +1 long gun, chest rig +1 melee +1 throwable (caps 4 / 2 / 2). (11-03; DEVLOG 11-03 UI-10)
- Weapons at risk: guns, bows, launchers, grenades, illegal items and dear blades drop on death as pickups anyone can take (a minute); fists, police issue and cheap legal tools stay. (11-14; decisions-11-14*, DEVLOG 11-14) - SUPERSEDES "a weapon you buy is yours forever; death drops cargo, never weapons" (11-03).
- Arrest: illegal guns confiscated for good; legal guns go to your stash. (11-14; DEVLOG 11-14) - conflicts with launch-plan's impound lot (fee to get a seized gun back): OPEN if the impound idea is still wanted.
- One stash per character: your home's safe and every gun / pawn shop counter. (11-14; decisions-11-14*)
- The stash holds what you own and don't carry - items and weapons - one pool reached from many doors: inside your home,
  gun and pawn counters, your (or your crew's) hideout office, later bank boxes. Clothes stay in your wardrobe: always
  yours, never at risk, so there's nothing to stash (Claude's call, 11-23). Nothing in the stash is ever lost; what you carry is at
  risk; carrying is limited by your backpack. The Inventory is a real inventory: your character with its loadout and
  clothes, drag items into slots or select and EQUIP / USE, and at a stash door carried and stash side by side. (11-23)
- The Inventory's clear-the-outfit button says REMOVE ALL - "take it all off" read as suggestive (the owner, 11-23).
- REMOVE ALL leaves the underwear on. The underwear's own X, swapping it, or a towel in its place (a bath towel or one
  round the hips - everyone has both) only where you can change: at home, at a bathhouse, under a shower. (11-23)
- Buy straight to the stash (bulk), drop weapons, hand one to a crewmate nearby. (11-14; queue)
- Phone "Find my weapons": a waypoint to the nearest stash. (11-14; DEVLOG 11-14)
- No weapon blueprints or crafting. (11-03; launch-plan 11-03)
- Ammo is the money sink. (11-03; launch-plan 11-03)
- Only the plasma blade deflects; other guards stop blows, not arrows. (10-10; DEVLOG 10-10)
- The plasma blade comes in colors you choose. (10-09; DEVLOG 10-09)
- A SAM launcher to fight helicopters, without making them weak. (10-16; DEVLOG 10-22)

## Controls (keyboard and mouse)
- The gun is down unless the right mouse button is held (aim: the gun up, pointed at the cursor) or you fire (left
  click, at the cursor) - as on a pad; right button held unarmed or with a melee weapon: block. Not twin-stick (the gun up
  whenever the mouse had moved, 11-13 to 11-23). The owner, 11-23 21:37: "You used to only hold up the weapon when you
  were aiming ... hold right click and that's when you would aim". (11-23)

## Vehicles and the car
- Things a vehicle hits react, for the pre-beta (11-23 20:10, "anything that a vehicle can knock over or drive through or
  destroy should have a visible reaction not just disappear"): fences - chain-link, wooden, the rest - are knocked flat or
  smashed through when hit hard enough (not just a wall); trees fall over; bus shelters, benches and the like are knocked
  over or break apart; nothing just vanishes when hit. Someone sitting on a bench or at a bus stop that's hit is thrown
  off as it breaks. (Supersedes the 11-23 P6 rule "a vehicle is held by every fence" at speed: slow, a fence still holds.)
- A vehicle's trunk is its own small inventory, not a door to the stash (about 6 slots in a car, 2 on a motorbike): it stays
  in a parked car, waits at the impound lot with an impounded one, and spills as pickups when the vehicle is destroyed -
  the owner took Claude's suggestion over a trunk that shares the stash (it would let anyone bank loot mid-run). (11-23)
- Cargo crates always show: on a car's roof, in a truck's bed, on a bike's rack, a boat's deck or in your hands - never in
  a trunk or the inventory, so other players can see who carries something worth taking. (11-23)
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

- The balance audit's proposals (11-24 08:44; chat: "I think for the balance stuff that all looks good"): 1) pay left
  as it is until the first test weekend's money sources, then aimed at a median home ~5-8 h of honest work and a mid car
  ~3 h; 3) the other road - the daily goals' second is a crime lead for the honest careers and an honest one for crime
  (goals.js roll); 4) the first time you're knocked down, its line says the cash you carry drops - bank it at any ATM
  (ftue.js MOMENTS.down). (docs/audit/BALANCE-2026-11-22.md)

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
- One chat per work package, one at a time, all under the project; each starts from `docs/MASTER-HANDOVER.md` and ends by updating it (the owner, 11-22 00:23: "a master handover which every time I start a new chat ... it knows I'm coming from one chat with all the information needed ... takes all the past information and feedback and everything and applies it consistently"). Notes for another area are logged, not acted on, in the chat where they come up. (11-22; chat) - CHANGED 11-22 02:48, next line.
- Chats by phase, not by package (the owner, 11-22 02:48: "I think id rather split chats up between prebeta, beta, launch ... be able to talk through different parts of the game in one chat like I want to be able to talk about UI and music and art and game design and feedback and troubleshooting all in one chat because right now it feels like a more natural way to create"): one chat per phase; he talks about any area in it; the work still goes one package at a time, and a note for another package is logged until its turn unless he says now. The phase chat is restarted from the master handover at a go-live, after two collapses, or when it slows. (11-22; chat)
- What may go to main without asking - PROPOSED, NOT IN FORCE until the owner says yes (the owner, 11-22 03:07: "I like being able to make the call to push to main, I dont want to become too much of a blocker ... consider what can be pushed to main and what is worth checking in before pushing"). Claude's proposal. Goes without asking, told to him after in one line: a change to the page only (`client/`), with no new `world` or `art` hash, no change in `server/` or `shared/` (so no restart), its tests passing, that fixes or adjusts something he has already seen and approved - a layout or text fix, a bug in a menu, a sound level, a Guide entry; and docs. Asked first, one question per batch: anything in `server/` or `shared/` (the server restarts, players reconnect); a new `world` hash (every player fetches the city again) or `art` hash (about five hours of re-baking); anything touching saved progress, prices and the economy, accounts, privacy, payments or legal text; a new feature, or a look he has not seen; a raised performance budget; anything with a test failing or not run. Always his word: the first merge of `prebeta-art`, and every go-live of a phase. After the beta opens, a restart costs players more: revisit then. (11-22; chat) - IN FORCE from 11-22 03:23, read from his opening message of the pre-beta chat (not a word-for-word yes - he can change it): "anything that is ready to push live I'd like to push live so I can check it out"; "just go with the prebeta stuff and get it all fixed and pushed ... if you're not sure of something but have an idea you can go for it and just call it out". The same message is his go-ahead for the first merge of `prebeta-art` (one art re-bake; "until then I think its okay to redraw the world when needed or save up some work"). (In practice, 11-22: the session's permission guard refused Claude's push to `main`, so a go-live is a pull request the owner merges - PR #1 for `prebeta-art`.)
- Merging to main (the owner, 11-22 13:12): "you can go ahead and merge things more often you don't need to wait for me on some of these merges". Claude merges its own pull requests when their tests pass, and tells him after in a line - pre-beta, while few play; batch server changes (each restarts the server) and say what a merge costs players (a reconnect, a world fetch, an art re-bake). Still his word first: a world update (the world batch), anything touching saved progress, prices, accounts, privacy, payments or legal text, a raised performance budget, and launching the beta. Supersedes the proposal above for the pre-beta. (11-22; chat)
- Nothing gets lost: every owner note goes into a doc and the task list. (10-08; DESIGN-NOTES.md)
- A new chat catches up by package (the owner, 11-22 02:33: "have the next chat look at all documents and concepts first to catch up or something"): it reads the titles of every project doc and the concepts' index, reads the package's own documents in full, and looks at the approved style targets and every concept listed for a place before touching it - not all 45 docs and 460 pictures each time (usage). `docs/MASTER-HANDOVER.md` section 1. (11-22; chat)
- Pictures the owner attaches (11-22 02:33: "gauge if something is a quick screenshot to point something out as feedback or if it's a concept that should be kept as a reference, if unsure call it out ... if you do save something call it out"): feedback screenshots are logged in words and not kept; concepts and references are committed under `docs/art-v2/`, indexed in the concepts catalogue, and he is told where; if unsure, ask in one line. (11-22; chat)
- A chat ends with a loose-ends sweep: what the owner said in it that is in no file yet is logged or named as left out. (11-22; chat - Claude's step, after his question on what gets lost between chats)
- The owner trusts Claude with production and build-order calls; tune together afterwards. (10-05; chat)
- Art polish runs on Fable 5.2 (High) until its usage is spent; then back to Opus 5.5 for the pre-beta fixes, after the owner's further pre-beta notes - the pre-beta list waits for that unless an item is art already in hand. (11-21 08:05; chat)
- Pushing to main deploys live: push only when tests pass; batch server changes; agents never push (the lead merges). (CLAUDE.md, agent-rules)
- Go live after Claude's own screenshot review - no wait for the owner (one capture round), to save usage. (11-12; queue)
- Visual direction: show 2-3 variants side by side for the owner to pick before wiring in (HUD, icons, logo). (11-12; queue) - NARROWED 11-22, next line.
- Variants only where they earn it (the owner, 11-22 00:27: "Do I really need to have variations for everything to review? ... Can we not make some sweeping decisions"; 00:37: "sounds logical as a standing rule"): 2-3 variants only for a new look that sets a direction and is costly to reverse (logo, HUD style, a new art style). Everything else: Claude picks, builds it, and says the pick and why in one line; the owner redirects if he wants. A ruling he has given once is applied everywhere without asking again. Two checks decide the size of a pick (his, 00:37): how many places it touches (count them first - many places or hard to undo means show him, few means pick); and whether the alternatives are worth keeping as variety in the world (several good shop fronts, trees or signs go in as different ones in different places, not one chosen and the rest thrown away). (11-22; chat)
- The ripple check (the owner, 11-22 00:37: "I don't want to call out every hospital needs a makeover individually ... if I call out an issue with something there is a quick logical test/audit ... that would keep tabs of related art or mechanics"): a note about one thing is read as a note about its class. Before fixing, widen it in three steps - the same thing elsewhere (the other hospitals), the same kind of thing (other buildings with the same fault), the same cause (the shared rule or code that made it, and whether it also touches how players use the place) - and count each step from the world's data and the code, not from renders (cheap). Tell him the counts in one line and what is fixed now against logged for later; fix the class; leave a test or lint row, or a row in the register marked eyes-only. This is the class-fix rule with the counting made a fixed first step. (11-22; chat)
- At most 3 agents at once; keep agent runs lean (usage). (11-14; chat, queue)
- Heavy commands (server, browser, capture, bake, full tests) under `flock /tmp/cla-heavy.lock`, one at a time; small Node heaps; WIP commits often. (11-13; agent-rules)
- Delete capture frames and temporary builds once looked at (fixed disk). (11-13; agent-rules)
- Reports short (under 200 words); 2-3 small screenshots at most. (11-12; agent-rules)
- Raising a performance budget is a decision: say why in the DEVLOG. Page budget now 540 KB (11-07, "a modest raise is fine"). (CLAUDE.md; DEVLOG 10-21, 10-26, 11-07)
- The renderer's code budget 411 -> 414 KB for character pass 2 (the catalogue's underwear, concept pieces and hairstyles). (11-19; DEVLOG 11-19, docs/characters/NOTES.md) - OPEN: raised by Claude on the characters branch, the owner to confirm. - CONFIRMED by the owner 11-19 (Art direction, above); pass 3 stays inside it (413.97 KB).
- The renderer's code budget 414 -> 429 KB, 28 -> 29 files for character pass 5: the pass's own file (`client/art2/peoplepolish.js`, 14.3 KB) is counted in it now, as the task told (it sat in no budget); 428.6 KB measured by hand, inside the 430 the owner allows for the character work. (11-19; docs/tasks/CHARACTERS5.md, DEVLOG 11-19)
- Bake code budget, combined (11-21): `characters` holds it at 1080 KB (the owner, 11-20 20:15); `animals` (+4) and `nature` (+2) asked for 1024 and 1022 on their own branches - both fit inside 1080, so the combined branch keeps 1080 and those two raises are not needed. (11-21; branch `prebeta-art`)
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
