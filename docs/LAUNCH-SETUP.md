# Launch setup: what the owner registers and sets

The launch foundation (accounts and sign-ins, roles and the admin log, chat and moderation, anti-cheat, analytics) runs
on the game server. Everything here is switched on by environment variables on the server. **Nothing secret goes in
the repository**: keys and secrets live only in the server's environment file.

## Signing in, linking, and guests

- **The ways in** (the owner, 11-12): **Guest** (plays at once), **Email + password**, **Google**, **Discord**, and
  passkeys. Reddit and the email magic links are gone: accounts that used them keep their progress (an old magic-link
  account sets a password with Forgot password).
- **Sign in** (email + password, a provider button, or a passkey) logs into the account that sign-in belongs to, on any
  device.
- **Link to this account** adds a sign-in to the character on this page, so a guest keeps its progress. It's a separate
  button. A sign-in that's already on another account is never moved.
- A sign-in no account uses yet asks: link it to the character I'm playing, or start a new account. Nothing is merged
  silently. **Create account** (email + password) asks the same question.
- Starting a new account, or signing into another one, keeps the guest on this device as the previous character
  (Settings can go back to it).
- Every flow is bound to the page that started it, so a sign-in someone else set off in your browser can't be finished
  by your page. The email + password calls are accepted only from the game's own pages (the Origin is checked).
- **Names:** guests pick and change theirs (filtered, unique, ten minutes between changes), but never a name a signed-in
  member owns, nor its lookalike (`B0b` for `Bob`). A member who picks a name only guests hold takes it: those guests
  go back to a Guest number and are told why. A guest who signs up or links keeps their name; from then on it's
  protected. Members' usernames change once a month.
- Over the head, members' names are white and guests' a soft grey (the police blue and the title colors a dimmer shade
  for guests); the players list says "Guest".
- While any sign-in is on offer (email + password always is, unless `CLA_PASSWORDS=0`), guests can't start or lead a
  crew or post a bounty, and are told to sign in.
- The account panel keeps up to three previous characters on a device ("Switch back to <name>").
- **Start fresh** resets the character and keeps the account: its sign-ins, passkeys, role, strikes and ban record.

## What works with no keys at all

- **Guests**: play at once as GuestNNNN (and can pick a name). Progress is saved on the server. A **transfer code**
  (Settings → Account → Make a transfer code: 10 characters, one use, 10 minutes) moves a guest to another device. The
  old device is signed out.
- **Email + password**: sign up and sign in need no keys. Without `RESEND_API_KEY`, "Forgot password" says resets
  aren't available yet, and no confirm-your-email mail is sent.
- **Passkeys**: the device's own fingerprint, face or PIN sign-in. There's no third party to register with.
- **Chat, moderation, roles, the admin log, anti-cheat and the self-hosted analytics dashboard.**

- **The Privacy Policy and the Terms** (drafts): `/legal/privacy` and `/legal/terms` on the game server.

The Google and Discord buttons stay hidden until their keys are set (the page reads `/launch.json`).

## Where the settings go

The easy way: on the Oracle server (SSH in, or the SSH button in the Oracle Cloud console), run

```
sudo bash ~/city-life-auto/deploy/set-keys.sh
```

It asks for each key in turn: paste the value and press Enter, press Enter alone to keep or skip one, or type `-` to
clear it. Secrets stay hidden while you paste them. It writes them to `/etc/city-life-auto.env` (readable by root
only), points the game service at that file the first time, restarts the server and prints which sign-ins are now on.
Run it again whenever you add a key. The settings it doesn't ask about (the table below) can go in the same file by
hand.

By hand, the same thing:

```
sudo install -m 600 /dev/null /etc/city-life-auto.env
sudo nano /etc/city-life-auto.env          # one KEY=value per line (below)
sudo systemctl edit city-life-auto         # add the two lines below, save
    [Service]
    EnvironmentFile=/etc/city-life-auto.env
sudo systemctl restart city-life-auto
```

Caddy already proxies everything on `play.deadbaron.com` to the server, including `/auth/...`, `/admin/...` and
`/launch.json`. Nothing changes there.

## The settings

| Variable | What it is | Default |
|---|---|---|
| `CLA_PUBLIC_URL` | The server's public address. The OAuth redirect URIs and the emails' links point here. | `https://play.deadbaron.com` |
| `CLA_PAGE_ORIGINS` | The pages that may sign in (comma-separated origins). | `https://deadbaron.com,https://www.deadbaron.com,https://dead-baron.github.io` |
| `CLA_DEV_OPEN` | `1`: anyone can open Dev Debug Mode (testing). `0`: **launch**, only admins and the owner. | `1` |
| `CLA_OWNER_ID` | The owner's account id (Settings → Account shows it). If unset, see "The owner's account". | unset |
| `CLA_REQUIRE_AGE` | `1`: the server refuses a page that hasn't confirmed the 17+ gate. | `0` |
| `CLA_GUESTS_PER_HOUR` | New guest characters an hour from one address (0 = no limit). Schools and phone networks share one address between many players, so set it high if at all (200+). | `0` |
| `CLA_BLOCK_BANNED_DEVICES` | `1`: a browser marked by a banned account can't make a new guest. | `1` |
| `CLA_RP_ID` / `CLA_RP_NAME` | The passkey domain (the page's registrable domain) and the name devices show. | `deadbaron.com` / `City Life Auto` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in. | unset (off) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord sign-in. | unset (off) |
| `CLA_PASSWORDS` | `0` switches email + password sign-in off. | `1` (on) |
| `RESEND_API_KEY` | Resend: the password-reset and confirm-your-email mails. | unset (resets off) |
| `CLA_EMAIL_FROM` | The sender of those mails. | `City Life Auto <login@deadbaron.com>` |
| `CLA_MAIL_ADDRESS` | Your postal address, at the foot of every news email (section 7). | unset (a placeholder) |
| `CLA_CONTACT` | The contact the Privacy Policy and the Terms give (an email address). | unset (a placeholder) |
| `GA_MEASUREMENT_ID` | Google Analytics 4 web stream id (`G-XXXXXXXXXX`). It's public and served to the page. | unset (off) |
| `GA_API_SECRET` | GA4 Measurement Protocol secret, for server events. | unset (server events off) |

`CLA_SECRET` (already in use) signs the login tokens. Never change it once players exist: every token would stop
working.

## 1. Google sign-in

1. Go to <https://console.cloud.google.com/>. Create a project, "City Life Auto".
2. **APIs & Services → OAuth consent screen**:
   - user type **External**;
   - app name "City Life Auto", a support email and the logo;
   - authorized domain `deadbaron.com`, plus links to the privacy policy
     (`https://play.deadbaron.com/legal/privacy`) and the terms (`https://play.deadbaron.com/legal/terms`);
   - scopes: add only **openid**. The game asks for nothing else: no email, no profile.
3. Choose **Publish app**. While it's in "Testing", only the test users you list can sign in.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - application type **Web application**;
   - Authorized redirect URI: `https://play.deadbaron.com/auth/google/callback`.
5. Copy the client ID and the client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Restart.

## 2. Discord sign-in

1. Go to <https://discord.com/developers/applications> and choose **New Application** ("City Life Auto").
2. **OAuth2**: under Redirects, add `https://play.deadbaron.com/auth/discord/callback`. Save.
3. Copy the **Client ID**. Choose **Reset Secret** and copy the secret.
4. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`. Restart. (The game asks only for the `identify` scope.)

## 3. Email + password, and its emails (Resend)

Email + password works with no keys. Resend sends its two emails: the password reset and the confirm-your-email link.

1. Sign up at <https://resend.com>.
2. **Domains → Add domain** `deadbaron.com`. Add the DNS records it shows (SPF and DKIM TXT records, and the MX record
   for bounces) at your DNS provider, then wait for **Verified**.
3. **API Keys → Create API key**, with sending access only. Copy it into `RESEND_API_KEY`.
4. Optionally, set `CLA_EMAIL_FROM` to an address on the verified domain. Restart.

How it behaves:

- **Passwords**: at least 10 characters, up to 200 (long passphrases welcome); the most common ones are refused. Kept
  only as a scrypt hash with a random salt each. Never logged, never in a URL.
- **The address**: only a keyed hash finds the account. The address itself is kept only if the player asks for news
  (section 7).
- **Wrong passwords**: 8 for one address inside 15 minutes lock that address's sign-in for 15 minutes. Every limit
  counts by address too, whether or not an account uses it, and sign-in always says "Wrong email or password." Forgot
  password always gives the same answer. (Create account can't help saying an address is taken: beta accounts play at
  once. The rate limits keep it from being a lookup service.)
- **Forgot password**: a link by email, working once for 30 minutes. It opens a page that asks for the new password, so
  a mail scanner opening the link changes nothing. A new password signs the account out on its other devices.
- **Confirm your email**: sent on sign-up when Resend is on. It's one button, it isn't needed to play, and the account
  keeps a `verified` flag.
- Accounts from the old magic links set a password with Forgot password (same address).

## 4. Passkeys

Nothing to register. Keep `CLA_RP_ID` set to the page's registrable domain (`deadbaron.com` while the page is
served at deadbaron.com). A passkey belongs to its domain: one made on `deadbaron.com` doesn't work on
`dead-baron.github.io`, so pick the page's domain before launch and keep it. Every page origin must be listed in
`CLA_PAGE_ORIGINS`.

## 5. Google Analytics 4

1. Go to <https://analytics.google.com>. **Admin → Create → Property** ("City Life Auto"), with your time zone and
   currency.
2. **Data streams → Add stream → Web**, URL `https://deadbaron.com`. Turn off the Enhanced measurement items you don't
   want. Page views stay on; form interactions and video can go.
3. Copy the **Measurement ID** (`G-...`) into `GA_MEASUREMENT_ID`.
4. In the stream, **Measurement Protocol API secrets → Create**. Copy the secret value into `GA_API_SECRET`.
5. **Admin → Custom definitions → Create custom dimension**:

   | Dimension name | Scope | Event parameter / user property |
   |---|---|---|
   | Device class | User | `device_class` |
   | Graphics preset | User | `graphics_preset` |
   | Faction | Event | `faction` |
   | Region | Event | `region` |
   | Source (money) | Event | `source` |
   | Cause (death) | Event | `cause` |
   | Job | Event | `job` |

6. **Admin → Events** (they appear after the first day): mark **sign_up** and **tutorial_complete** as key events.
7. **Admin → Data settings → Data collection**: leave Google signals **off** (the game turns it off too).
8. Restart the server.

How it behaves:

- The first-launch gate asks for **17+** and **Accept / Essential only**.
- gtag.js loads only after Accept, and only when the measurement ID is set. With Essential only, nothing is loaded and
  nothing goes to Google, from the page or from the server.
- Consent Mode v2 defaults everything to denied. Accept grants `analytics_storage` only, because the gate asks about
  analytics. The three ad signals stay denied until the game shows ads and the gate's text says so.
- The server sends gameplay events through the Measurement Protocol, for players who accepted, under the page's GA
  client ID:
  - `sign_up` and `login`, by method;
  - `earn_virtual_currency` and `spend_virtual_currency`, summed per source each minute;
  - `player_death` (cause), `job_complete`, `crime`, `select_content` (leisure);
  - `tutorial_begin` and `tutorial_complete`.
- The page sends:
  - its page view;
  - the funnel: `play_click`, `in_world`;
  - `perf_report` (frame-rate and load-time buckets, device class, graphics preset);
  - `client_error` (where only, a few a page).
- The account ID goes to Google only as a keyed hash (`user_id`). Names and emails never do.
- GA is the audience view. The owner's dashboard (below) is the source of truth for the economy, retention by account,
  concurrency and cheat flags.

## 6. The owner's account, roles and the protected pages

- **Bootstrap the owner** in one of two ways:
  - set `CLA_OWNER_ID` to your account ID;
  - or leave it unset. While there's no owner, each server start prints a one-time code in the log
    (`journalctl -u city-life-auto | grep roles`). Enter it in Settings → Account → Claim ownership. It works once.
- **Sign in on the owner's account** with a passkey or a provider first, so it isn't a guest that a cleared browser
  could lose.
- **The owner hands out admin and helper** from the staff tools (`{ t: 'admin', a: 'role' }`).
  - Admins get the debug powers (once `CLA_DEV_OPEN=0`), plus kick, ban, chat mutes and strikes, and the review list.
  - Helpers get refund a purchase, rescue a stuck player, restore an item, and view a player's recent log.
- **Every privileged action** is appended to `<data>/admin-log.jsonl`, refusals included. Each line carries the hash of
  the one before it, so the log page says whether the file was edited.
- **The protected pages** open from Settings → Account → Staff tools. A one-time link (a minute) sets a session cookie
  for an hour:
  - `/admin/players`: who's online now (account and sign-in, role, district, wanted, money, session and total play time,
    first seen, sessions, device class and browser, what they're doing, chat strikes, anti-cheat flags) and who was on in
    the last 24 hours. It refreshes itself every 15 s. Each player has a page with their recent log, purchases, strikes,
    ban, recent chat and review-list items. Its buttons (kick, ban, unban, mute, unmute, strike, rescue, prison) are the
    staff commands themselves, so the same powers apply and each one goes in the admin log. Kick, ban, mute, strike and
    prison ask again first. Helpers and up can see it; helpers only get Rescue;
  - `/admin/dashboard`: analytics, owner only;
  - `/admin/log`: the admin log, owner only;
  - `/admin/news`: the news list, owner only (section 7);
  - `/admin/reviews`: reports, filter hits and cheat flags, admins and up;
  - `/admin/perf` and `/admin/clienterrors`: how devices load and run the game, and the pages' errors, admins and up.
    The old `/perf` and `/clienterrors` addresses redirect here.

## 7. The news list (opt-in)

- Create account has an **unticked** "Email me game news and updates" box. Google and Discord ask for no more than
  before: members turn on **Game news by email** in Settings → Account and type an address there.
- Kept apart from the sign-ins, in `<data>/news.json`: the address, when it opted in and where (sign-up or Settings),
  and its own unsubscribe token. Unsubscribing, or turning it off in Settings, deletes the entry.
- **Export**: Settings → Account → Staff tools → News list (owner only) shows the count and a CSV download: email, when,
  where and the `unsubscribe_url`. Every download goes in the admin log.
- **Sending** (no sending in the game yet): import the CSV as an audience in Resend's **Broadcasts**. Every news email
  must carry its unsubscribe link (the `unsubscribe_url` column, or Resend's own) and your postal address
  (`CLA_MAIL_ADDRESS`). Export again before each send, because players who unsubscribe in the game leave the list.

## 8. At launch

1. Set `CLA_DEV_OPEN=0`, so only admins have the debug powers.
2. Set `CLA_REQUIRE_AGE=1` once the page with the gate is live.
3. Check that `/launch.json` shows the providers you expect.
4. Have a lawyer review the terms, the privacy policy and the in-game notice before any money changes hands. The
   drafts (`server/legal.js`, at `/legal/privacy` and `/legal/terms`) are marked DRAFT at the top. Set `CLA_CONTACT`
   and `CLA_MAIL_ADDRESS` so their placeholders are filled.
