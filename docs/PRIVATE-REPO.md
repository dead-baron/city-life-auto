# Making the development repository private (the owner's go, 11-27)

**Why:** today anyone can download the whole project - the server (its anti-cheat checks, the economy, the staff tools),
the tools, every design and decision document, the unreleased branches. A copy of the browser's page can always be
taken (that's true of every web game); the rest needn't be.

**What changes for players:** nothing. The game stays at https://deadbaron.com/city-life-auto/ (same address, so their
saved logins, Google and Discord sign-in all keep working), served by GitHub Pages - from a new public repository that
holds only the page (`tools/build-play.mjs`: the page, `client/`, `shared/`, `assets/`, the About page). The game server
publishes each new build there as it updates (`deploy/publish-play.sh`, from `deploy/auto-update.sh`), page first and
then itself, as today. All of it is free: private repositories and Pages from a public one cost nothing on GitHub Free.

**Already done (11-27):** the game server no longer hands anyone its own code (`server/index.js` STATIC_ROOTS - it did
for the paused offline practice); the build and publish scripts; an all-rights-reserved `LICENSE`.

## The steps (about 20 minutes; the page is down for a few minutes between steps 1 and 4 - pick a quiet time)
1. **GitHub -> dead-baron/city-life-auto -> Settings -> General -> Repository name:** `city-life-auto-dev` -> Rename.
   (Its Pages site moves to /city-life-auto-dev/ - that's the downtime. Then Settings -> Pages -> turn it off.)
2. **Create a new public repository** `dead-baron/city-life-auto` - empty: no README, no license, no .gitignore.
3. **On the game server** (SSH in): `cd ~/city-life-auto && git pull && bash deploy/setup-private.sh dead-baron/city-life-auto-dev dead-baron/city-life-auto`
   It prints two keys and waits:
   - the first: **city-life-auto-dev -> Settings -> Deploy keys -> Add deploy key**, read only;
   - the second: **city-life-auto (the new one) -> Settings -> Deploy keys -> Add deploy key**, tick *Allow write access*.
   Press Enter. It points the server at the private repository and publishes the page to the public one.
4. **The new public repository -> Settings -> Pages:** Deploy from a branch, **main**, **/ (root)** -> Save. In a minute
   or two the game is back at the same address.
5. **city-life-auto-dev -> Settings -> General -> Danger zone -> Change visibility -> Private.**
6. **Tell Claude** the new name (`dead-baron/city-life-auto-dev`) - a new chat adds it as the repository it works in.

## Afterwards
- Everything works as before: Claude pushes to `main` of the private repository; the server pulls it every 2 minutes,
  publishes the page, waits for Pages, restarts. If publishing fails the server waits too (the console's Status tab says
  why) rather than running ahead of the page.
- Undo: make the development repository public again and turn its Pages back on; nothing else depends on it.
- Not covered: copies anyone already made while it was public, and the page's own code, which every browser downloads.
