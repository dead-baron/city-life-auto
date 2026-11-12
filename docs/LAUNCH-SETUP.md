# Launch setup: what the owner registers and sets

The launch foundation (accounts and sign-ins, roles and the admin log, chat and moderation, anti-cheat, analytics) runs
on the game server. Everything here is switched on by environment variables on the server. **Nothing secret goes in
the repository**: keys and secrets live only in the server's environment file.

## Signing in, linking, and guests

- **Sign in** (a provider button, or a passkey) logs into the account that sign-in belongs to, on any device.
- **Link to this account** adds a sign-in to the character on this page, so a guest keeps its progress. It's a separate
  button. A sign-in that's already on another account is never moved.
- A sign-in no account uses yet asks: link it to the character I'm playing, or start a new account. Nothing is merged
  silently.
- Starting a new account, or signing into another one, keeps the guest on this device as the previous character
  (Settings can go back to it).
- Every flow is bound to the page that started it, so a sign-in someone else set off in your browser can't be finished
  by your page. Open an email link in the browser you asked from.
- **Guests rename** as before while no provider is switched on. Once one is:
  - names are for signed-in members (filtered, unique, once a month);
  - guests can't start or lead a crew or post a bounty, and are told to sign in.
- An email link opened in another browser asks first: "Sign in as <name>? This replaces the character on this device".
- The account panel keeps up to three previous characters on a device ("Switch back to <name>").
- **Start fresh** resets the character and keeps the account: its sign-ins, passkeys, role, strikes and ban record.

## What works with no keys at all

- **Guests**: play at once as GuestNNNN. Progress is saved on the server. A **transfer code** (Settings → Account →
  Make a transfer code: 10 characters, one use, 10 minutes) moves a guest to another device. The old device is signed
  out. Guests can't rename.
- **Passkeys**: the device's own fingerprint, face or PIN sign-in. There's no third party to register with.
- **Chat, moderation, roles, the admin log, anti-cheat and the self-hosted analytics dashboard.**

Google, Discord, Reddit and email buttons stay hidden until their keys are set (the page reads `/launch.json`).

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
| `CLA_PUBLIC_URL` | The server's public address. The OAuth redirect URIs and magic links point here. | `https://play.deadbaron.com` |
| `CLA_PAGE_ORIGINS` | The pages that may sign in (comma-separated origins). | `https://deadbaron.com,https://www.deadbaron.com,https://dead-baron.github.io` |
| `CLA_DEV_OPEN` | `1`: anyone can open Dev Debug Mode (testing). `0`: **launch**, only admins and the owner. | `1` |
| `CLA_OWNER_ID` | The owner's account id (Settings → Account shows it). If unset, see "The owner's account". | unset |
| `CLA_REQUIRE_AGE` | `1`: the server refuses a page that hasn't confirmed the 17+ gate. | `0` |
| `CLA_GUESTS_PER_HOUR` | New guest characters an hour from one address (0 = no limit). Schools and phone networks share one address between many players, so set it high if at all (200+). | `0` |
| `CLA_BLOCK_BANNED_DEVICES` | `1`: a browser marked by a banned account can't make a new guest. | `1` |
| `CLA_RP_ID` / `CLA_RP_NAME` | The passkey domain (the page's registrable domain) and the name devices show. | `deadbaron.com` / `City Life Auto` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in. | unset (off) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord sign-in. | unset (off) |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Reddit sign-in. | unset (off) |
| `RESEND_API_KEY` | Email magic links (Resend). | unset (off) |
| `CLA_EMAIL_FROM` | The sender of the magic links. | `City Life Auto <login@deadbaron.com>` |
| `GA_MEASUREMENT_ID` | Google Analytics 4 web stream id (`G-XXXXXXXXXX`). It's public and served to the page. | unset (off) |
| `GA_API_SECRET` | GA4 Measurement Protocol secret, for server events. | unset (server events off) |

`CLA_SECRET` (already in use) signs the login tokens. Never change it once players exist: every token would stop
working.

## 1. Google sign-in

1. Go to <https://console.cloud.google.com/>. Create a project, "City Life Auto".
2. **APIs & Services → OAuth consent screen**:
   - user type **External**;
   - app name "City Life Auto", a support email and the logo;
   - authorized domain `deadbaron.com`, plus links to the privacy policy and the terms;
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

## 3. Reddit sign-in

1. Sign in to Reddit with the account that will own the app, then go to <https://www.reddit.com/prefs/apps>.
2. Choose **create another app...**:
   - name "City Life Auto";
   - type **web app**;
   - redirect uri `https://play.deadbaron.com/auth/reddit/callback`.
3. The client ID is the string under the app's name. The secret is labeled **secret**.
4. Set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`. Restart. (Scope `identity`, a temporary token.)
5. Reddit's Data API terms apply to commercial use. Read them before you put money into the game.

## 4. Email magic links (Resend)

1. Sign up at <https://resend.com>.
2. **Domains → Add domain** `deadbaron.com`. Add the DNS records it shows (SPF and DKIM TXT records, and the MX record
   for bounces) at your DNS provider, then wait for **Verified**.
3. **API Keys → Create API key**, with sending access only. Copy it into `RESEND_API_KEY`.
4. Optionally, set `CLA_EMAIL_FROM` to an address on the verified domain. Restart.
5. The link works once, for 15 minutes. Opening it shows one "Sign in" button, so a mail scanner that opens the link
   doesn't use it up. Email addresses are never stored: only a keyed hash, used to recognize the account.

## 5. Passkeys

Nothing to register. Keep `CLA_RP_ID` set to the page's registrable domain (`deadbaron.com` while the page is
served at deadbaron.com). A passkey belongs to its domain: one made on `deadbaron.com` doesn't work on
`dead-baron.github.io`, so pick the page's domain before launch and keep it. Every page origin must be listed in
`CLA_PAGE_ORIGINS`.

## 6. Google Analytics 4

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

## 7. The owner's account, roles and the protected pages

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
  - `/admin/dashboard`: analytics, owner only;
  - `/admin/log`: the admin log, owner only;
  - `/admin/reviews`: reports, filter hits and cheat flags, admins and up;
  - `/admin/perf` and `/admin/clienterrors`: how devices load and run the game, and the pages' errors, admins and up.
    The old `/perf` and `/clienterrors` addresses redirect here.

## 8. At launch

1. Set `CLA_DEV_OPEN=0`, so only admins have the debug powers.
2. Set `CLA_REQUIRE_AGE=1` once the page with the gate is live.
3. Check that `/launch.json` shows the providers you expect.
4. Have a lawyer review the terms, the privacy policy and the in-game notice before any money changes hands.
