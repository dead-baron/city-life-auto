# Security audit: accounts, safety, admin and the HTTP side

Scope: `server/launch.js`, `accounts.js`, `auth.js`, `authhttp.js`, `passwords.js`, `webauthn.js`, `roles.js`, `admin.js`,
`adminhttp.js`, `adminconsole*.js`, `adminlog.js`, `devmode.js`, `dev.js` (how it is reached), `chat.js`, `chatfilter.js`,
`moderation.js`, names (`shared/names.js`, `launch.js rename`), contacts/blocks, `index.js` routes, the CDNs, `bugreports.js`,
`perfreports.js`, `limits.js`, `line.js`, `config.js`, `ws.js`, `deploy/`, and a secrets sweep. Read-only: no game code changed.
Proof scripts are in `tools/audit/sec-acct-*.mjs` (report-only; the two `*crash*`/`badpath` ones start a private server on
127.0.0.1 with a temp data dir).

| # | Issue | Severity | How someone does it | File:line | Suggested fix |
|---|---|---|---|---|---|
| 1 | One game message stops the whole server | **critical** | Join as a guest (hello, no token), send `{"t":{"toString":1}}`. `String(msg.t)` throws "Cannot convert object to primitive value"; nothing catches it and the process exits. 47 more fields in chat, mod, friend, emote, admin, name and acct do the same (`String(msg.x)` / template strings on a JSON object). Repeat it after every restart and the city stays down. **Proved:** `sec-acct-wscrash.mjs` (server exits, code 1), `sec-acct-fuzz.mjs` (47 throwing fields). | `server/session.js:95` (also `:98` route has try/finally, no catch); `server/ws.js:59,85`; e.g. `server/chat.js:150,332,412`, `server/admin.js:108,131`, `server/launch.js:176` | Catch in `ws.js _deliver` (or session `onMessage`) and drop the message, logging it. Add `process.on('uncaughtException'/'unhandledRejection')` that logs. Then use type checks (`typeof x === 'string' ? x : ''`) in place of `String(x)` on message fields. |
| 2 | One HTTP request stops the whole server | **critical** | `GET /%FF` (a valid %XX escape that is not UTF-8, so Caddy/Go passes it on). `decodeURIComponent` throws inside the async request handler; the unhandled rejection ends the process. **Proved:** `sec-acct-badpath.mjs` (server exits, code 1, URIError at index.js:97). Not tested through the live Caddy; Go's URL parser accepts `%FF`. | `server/index.js:95-97` | Wrap the handler body in try/catch (400 on a bad path); add the process-level handlers from #1. |
| 3 | No limit on new guests: saves can stop for good, and bots can fill the city | **high** | A script opens sockets and sends `hello` with no token, over and over. Each hello makes and keeps a profile (721 bytes). Nothing deletes a guest that never comes back, and every per-address limit is off by default (`CLA_GUESTS_PER_HOUR=0`; `CLA_MAX_PER_IP`/`CONN_PER_MIN`/`HTTP_PER_MIN` are commented out in the unit file). profiles.json is one string built on the main thread every 5 s. Around 0.7 M guests it passes V8's string limit: every save throws and nothing is saved again until a restart rolls the profiles back. Long before that, saves stall the tick and every rename scans all profiles. The same bots can also hold the city's 120 places and the line's 200, so real players get "full". **Proved:** `sec-acct-guests.mjs` (20 000 hellos from one address: 20 000 profiles, 0 refused). | `server/launch.js:113-121`; `server/config.js:38-40,86`; `deploy/city-life-auto.service` (limits commented); `server/file-store.js:51-72`; `server/launch.js:145-149` | Turn on `CLA_MAX_PER_IP` / `CLA_CONN_PER_MIN` for the beta and set a `CLA_GUESTS_PER_HOUR` (e.g. 200). Don't keep a guest profile until it has played (or remove untouched guests after N days). Make a failed save loud (alert, keep the last good file). |
| 4 | The open debug mode is on unless someone turns it off | **high** (config) | `CLA_DEV_OPEN` defaults to `'1'`, and the deploy unit doesn't set it. If the env line is missing on the beta box (a rebuilt box, a typo, or the step skipped), every stranger gets the debug menu: `bring` and `goto` any player, god mode on others, unlimited money and guns, plus every player's id and exact position in `plist`. This matters more in a 13+ game. | `server/config.js:63`; `server/devmode.js:18,25,119-128`; `server/dev.js:926-973`; `deploy/city-life-auto.service` | Make the code default closed (`env('CLA_DEV_OPEN','0')`). Set it on purpose on test boxes, and log the mode loudly at start. |
| 5 | Bans, kicks and chat mutes end with a new guest | **medium** | The banned or muted person clears site data (or uses a private window, or a script) and connects with no token. The device check runs only if the page sends its own marker `dm`; leave it out and nothing else is checked. No address is kept, and a new guest starts with no strikes or mute. **Proved:** `sec-acct-guests.mjs` (banned → new guest let in; muted → new guest chats). | `server/launch.js:113-121`; `server/accounts.js:236,262-267` | Accept that guests are cheap, but raise the cost: a short-lived ban list of hashed addresses (the `keyedHash` is already there) for the ban's first hours. New guests from a recently banned address start muted or are kept out of chat for a while. Require a sign-in to chat after a ban from that address. |
| 6 | Pre-account takeover through an email that was never confirmed | **medium** | The attacker signs up with the victim's email (no inbox proof; the account plays at once) and links their own Google/Discord to it. Later the victim tries to sign up, is told "use Forgot password", resets, and plays on that account. The reset signs out other devices but leaves the attacker's linked provider, so the attacker signs in whenever they like. **Proved:** `sec-acct-prehijack.mjs`. | `server/authhttp.js:287-313` (signup), `:232-247` (reset keeps other logins); `server/accounts.js:96-112` | When a reset (or verify) confirms an address whose login was never confirmed, remove the account's other sign-ins and passkeys (or ask). Or don't allow linking anything to an account until its email is confirmed. Say in the reset email which other sign-ins exist. |
| 7 | Throwaway guests can push open safety and hate items off the Review list | **medium** | The list keeps the newest 500 and cuts the rest, open or not. Reports from new guests count 0 toward a strike, but each one still adds its own item. 500 fresh guests each reporting once (or a few guests reporting every online player) wipe the list. **Proved:** `sec-acct-reviews.mjs` (an open "asked someone's age" flag is gone). | `server/moderation.js:28-37` (`list.length = MAX_REVIEWS`); `server/chat.js:422-430` | Never drop open items: cap only resolved ones, or merge reports per target. Don't make a review item for weight-0 reporters; add them to the target's existing item as a count. |
| 8 | Names that pass as the founder or staff | **medium** | Any free email sign-up becomes a member, and members aren't checked for lookalikes of other members (only guests are). Taken in the test: `Dead8aron` (cleanName doesn't undo 8→b), `St3ve` (an admin's name), `TheDeadBaron`, `Real_DeadBaron`, `DeadBarron`, `Admln`, `TheAdmin`, `SteveAdmin`, `Staff_Steve`, `Mod_Steve`, `GM_Steve`, `GameMaster`, `Owner`, `Founder`, `Helper`, `SupportTeam`, `Developer`. **Proved:** `sec-acct-names.mjs`. | `server/launch.js:182` (`!member &&`); `shared/names.js:7-8,20-22` (`RESERVED` anchored ^$, flat misses 8) | Check `memberOwns(lookKey)` for members too. Match the reserved words anywhere in the flat name (owner/founder/staff/gm/dev/helper/admin/mod/deadbaron), using `lookKey` (which has 8→b and i→l). |
| 9 | Crew names and tags skip the word filter | **medium** | Found a crew named after a slur (crews.js `found` uses `cleanName` only, with a 9-word BAD list). 86 of 96 listed hate and sexual words pass. The tag (up to 4 letters, or the initials) shows next to every member's name for everyone; initials can spell anything. **Proved:** `sec-acct-names.mjs` (last line). | `server/systems/crews.js:254-262,234-238` | Run `filter().nameOk` on the crew name and on the tag. |
| 10 | Contact masking and the word filter are easy to get around | **medium** (13+ audience) | Phone numbers in fullwidth or Arabic-Indic digits, or with U+2060 word joiners between the digits, come through. So do `bob@gmail` (no TLD), `evil．com` (fullwidth dot), `sn@p bob_99`, `s n a p bob_99`, `dc bobby99`, and `@bobby99`. `discord . gg / abc123` masks the domain but leaves the invite code. Word filter: one look-alike letter it doesn't know (ɑ ı օ ꜱ ս ...) lets 89/96 listed words through; splitting a word in two lets 55/96 through. **Proved:** `sec-acct-chatfilter.mjs`. | `server/chat.js:157` (strips only some invisibles, no NFKC); `server/chatfilter.js:11,21,153-158` (`\d` is ASCII-only, FOLD is short) | NFKC-normalise and strip every `\p{Cf}`/`\p{Mn}` before both filters, then run `contact()` on that folded copy. Fold a confusables table (Unicode `confusables.txt` for Latin targets). Mask a bare `discord.gg`/`gg/` code. Treat `@handle` as a handle. |
| 11 | Bug reports: one address can use the server's whole hourly allowance, and the text goes unfiltered to Discord | low | 6 reports per 10 min per address against 30 an hour for everyone: one person (one guest after another) blocks reports for all. The text isn't run through the word or contact filters before it's posted to #bug-reports (mentions are off, which is good). | `server/bugreports.js:123-125,86-94` | A per-address hourly cap well under the global one; run `filter().check` + `contact()` on the text sent to Discord. |
| 12 | Admin log: junk lines from guests; the chain is unkeyed | low | Each new guest connection may append one "refused" line a minute (the refusal memory is per player object), so bots grow the append-only file without limit and bury real actions on /admin/log. The hash chain is plain sha256, so anyone who can write the file can rebuild the chain and the head. | `server/admin.js:77,129-132`; `server/adminlog.js:12` | Don't log refusals from accounts with no role (count them instead); HMAC the chain with the server secret. |
| 13 | Email sign-in lockout as a denial of service | low | 8 wrong passwords for an address lock it for 15 min, and the attacker can renew that forever from a few addresses. | `server/authhttp.js:186-189,277`; `shared/rules.js:155` | Lock per (address, network) pair, or add a delay instead of a lock; a reset link always gets in. |
| 14 | Global caps that one script can use up for everyone | low | `/auth/transfer` has a global 200 per 10 min (one script blocks transfer codes for everyone). The passkey challenge map holds 5000, the oldest dropped (30 options a minute per address evicts other people's challenges). | `server/authhttp.js:461`; `server/webauthn.js:186` | Per-address caps only; a bigger map with a per-address share. |
| 15 | Anyone can put any address on the news list | low | Sign-up with `news: true` and someone else's address, or the in-game Account → news with any address. No double opt-in. | `server/authhttp.js:310`; `server/launch.js:200-209` | Send a confirm link first, and add the address only once it's clicked. |
| 16 | `/stats` is public with `ACAO: *` | low | Anyone reads the number of connected addresses, review and flag counts, memory, the line and the data meter. | `server/index.js:114-117,172-195` | Keep /stats for the health check only (a few numbers) and move the rest behind the staff login. |
| 17 | The age gate is self-declared and off on the server by default | low | `CLA_REQUIRE_AGE` defaults to 0; the page's `age17` is just believed. LAUNCH-SETUP.md still says "17+". | `server/config.js:83`; `server/launch.js:102,117,221,250`; `docs/LAUNCH-SETUP.md:85,194` | Set `CLA_REQUIRE_AGE=1` for the beta; fix the doc to 13+. |
| 18 | Tokens never expire; staff web sessions outlive "sign out everywhere" | low | A token copied from localStorage (shared computer, XSS) works until the player presses Sign out everywhere. An `/admin` session cookie survives that for up to an hour. | `server/auth.js:14-33` (iat unused); `server/adminhttp.js:28,38-44` | Expire tokens by `iat` (rolling: re-issue on each hello). End the admin sessions for a pid on signOutEverywhere. |
| 19 | Some unban-type actions skip the rank check | low | An admin can `unban`, `undelete` or `namefree` someone the owner acted on (kick/ban/mute check `over()`; these don't). | `server/admin.js:205-240` | Apply `over()` (or "the one who banned, or higher") to unban and undelete. |
| 20 | Log forging and the trusted forwarded address | low/info | `diag` writes up to 300 chars of player text (newlines included) to the journal, once per connection. `ws.js` takes `X-Forwarded-For` without checking, but only for the console's country. `clientIp` takes the first XFF entry: safe only because Caddy ≥2.5 replaces the header. | `server/session.js:133`; `server/ws.js:25`; `server/limits.js:76` | Strip control characters from logged player text; use `clientIp(req, trustProxy)` in ws.js. Pin Caddy ≥2.5 in setup (or take the last XFF entry). |

## Details

**1 and 2: crashes.** Both go through the same gap: the server has no `uncaughtException` / `unhandledRejection` handler. Most message
handlers coerce fields with `String(x)`, which is fine for numbers and arrays but throws for a parsed object with an own
`toString` (or `valueOf`) that isn't a function. The very first coercion (`session.js:95`, the money watcher's label) runs for
every message from a joined player, before any routing, so any guest can do it. `sec-acct-fuzz.mjs` lists the 47 throwing
(type, field) pairs in the launch hooks alone; game systems outside this scope likely have more. The live server restarts
(systemd `Restart=always`), but World v3 takes about a minute to start, and the attack repeats in one message. The HTTP one needs no
join at all. Fixing at the two choke points (ws `_deliver` try/catch, and an outer try/catch in the request handler) covers both
classes at once.

**3: guest growth.** Real joined guests carry more than the 721 bytes measured here (looks, position, FTUE), so the string limit comes sooner.
Nothing in `purgeDeleted` or `store` ever removes a guest. With the per-address limits off and no guest cap, one machine through
Caddy is enough. `CLA_GUESTS_PER_HOUR` was left at 0 on purpose (shared school/phone addresses), but 200/h per address
already stops a script and leaves room for a school.

**4: default open.** DECISIONS 31-33 say the beta sets `CLA_DEV_OPEN=0`. The code still fails open, and `/launch.json` and
`whoami` tell anyone whether it is open. While it's open (today), `plist` gives every viewer in dev mode every player's pid and
exact x/y, so any stranger can find and teleport to or `bring` a 13-year-old.

**6: pre-hijack.** The victim does get a "Confirm your email" mail when the attacker signs up, and Settings → Account shows
"Google" among the account's sign-ins, but nothing in the reset tells them that someone else can still sign in.

**10: filters.** Splitting a word in two gets through mostly because the `word` and `pre` lists are matched per token. Look-alikes
get through because `FOLD` covers only about 30 Cyrillic and Greek letters and NFKD doesn't map Latin small capitals,
dotless i, Armenian, and so on. The contact masking runs on the raw text, not on the skeleton the word filter builds.

## Checked and fine

- **Debug powers at `CLA_DEV_OPEN=0`:** `dev` commands are gated per command (`session.js:201`: `player.devMode && mayDev`, with
  the role read from the account each time). `devmode` sends only `tryPassword`, which refuses non-admins. `devMode` is never saved
  (players.js ends it on leave). `opts.dev` is only `CLA_DEV=1` / the capture server. The `GODMODE` default password only
  feeds `tryOldPassword`, which nothing calls. `grant` refuses non-admins. Views editing uses `mayStaff`.
- **Roles:** checked on the server for every `admin` message. `POWERS[...]` lookups are safe against `constructor`/`__proto__`.
  Kick/ban/mute/strike/prison/bring/send check rank (`over`). Only the owner grants roles, and never "owner". Guests can't hold
  a role. The owner claim is 12 chars of 31 (~59 bits), 5 tries / 10 min, and only while no owner exists.
- **OAuth:** `state` + an HttpOnly SameSite=Lax nonce cookie + PKCE + the page's own nonce (`pn`) on redeem/link. Redirects go
  only to listed origins (`pageUrl`, no open redirect). Linking needs the page's Bearer token and its `pn`. An identity linked
  elsewhere is never moved. Scopes are minimal (Google `openid`, Discord `identify`).
- **Passwords:** scrypt (2^15, salted), timingSafeEqual, a dummy hash for unknown addresses, and one error for every failure. `forgot`
  always gives the same answer, with per-address and per-IP limits. The reset link is HMAC'd with the password's fingerprint
  (single use), lasts 30 min, changes only by POST, and signs out everywhere. Verify and reset links can't be swapped (the kind is
  in the MAC). The pages have a strict CSP, DENY framing, and no-referrer.
- **Passkeys:** single-use challenges; type/challenge/origin/crossOrigin/rpId/UP checked; ES256/RS256 only; RSA ≥2048; the
  CBOR depth/length are capped; a counter going backwards is flagged.
- **Tokens:** HMAC-SHA256, constant-time compare, pid format checked, and generations for sign-out-everywhere. Bans are checked at
  login and at every endpoint (`who()`, redeem, link-confirm, transfer, passkey, reset, forgot, /report, /admin).
- **Admin web:** a one-time link (60 s) → an HttpOnly Strict Secure cookie (path /admin, 1 h). The role is re-checked on every
  request. POSTs need the CSRF token and are refused cross-site. Every value on every page goes through `esc()`. The console has
  CSP `script-src 'self'` and no IP, email or account id. Bug screenshots are sniffed (WebP/JPEG only) and served with CSP `none` +
  nosniff. The news CSV export is owner-only and logged.
- **HTTP routes:** `/art/` and `/world/` match strict regexes and serve from computed names or an in-memory map (no traversal). Static
  files: `..` refused, a whitelist of roots, and `chatwords.json`/`config`/`auth*` refused (`server/` itself is public on purpose: the
  practice worker). `/capture/` 404s unless `CLA_CAPTURE=1` and the request comes from 127.0.0.1. `/perf` and `/clienterrors` are behind the
  staff login, as text/plain. CORS on /auth and /report goes only to the game's origins. WS frames are capped at 64 KB, fragments included, with a 120 msg/s
  flood guard.
- **Proxy:** the deploy binds 127.0.0.1 (so `trustProxy` is on) and Caddy is the only way in. Caddy ≥2.5 replaces a client's XFF.
- **Secrets:** a git grep for API keys, webhooks, client secrets, private keys and `.env` files found nothing. `CLA_SECRET` is generated
  0600 when unset. `set-keys.sh` keeps keys in a root-only 0600 env file and never echoes them. Nothing logs tokens, emails or
  addresses (and the Caddyfile has no access log). Bug reports keep no IP or email, and the webhook URL is never logged.
- **What other players see:** `plist` (outside dev mode) shows name, a role word, wanted level, district, and guest/founder flags. Chat ids are
  keyed hashes of the pid. Crew, bounty and contact lists carry names, not pids. The country goes only to the staff console.
- **Contacts and blocks:** texting needs a contact (met or crew) or a friend; a "friends and crew only" setting is available. A block silently drops their lines, texts,
  friend requests and inbox mail. Inbox and friend requests are capped.
- **Guest limits:** crews and bounties check `guestLimited` on the server, and chat has tighter limits for guests. Free, unverified email sign-ups
  lift these limits at 6 an hour per address (the decision allows it).
- **The line:** only a genuine token can skip it (staff, or the same pid within 2 min); the ban is still checked after admission.
