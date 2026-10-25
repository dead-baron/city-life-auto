## 2026-10-24 - ui3: one hub - MENU · PHONE · MAP on the HUD, and the map, the phone, the bag, the people and the settings in one panel (UI overhaul, phase 3)

The owner approved the UI/UX overhaul on 2026-10-24; decision 3 is "one hub instead of five ways in". Before this the
same places could be reached from the HUD's seven round buttons, the hub's round tabs, the 15-line pause list, the
phone and the keys. Now there is one way in, and every old entry has a home.

### The HUD row
- **Three labelled buttons, MENU · PHONE · MAP**, replace the seven round ones (☰ 📱 🎒 ▦ ⚙ ⛶ 🐞). Each has a line icon,
  and on a keyboard a key badge (ESC / P / M). They are 48 px tall on desktop and 44 px on touch.
- **Placement.** Top centre on a desktop and on a sideways phone. Beside the minimap on a short window and on a 740 px
  phone. Upright, the row sits under the minimap, and the notes, the bars and the prompt move down to make room.
- **The bag.** I opens the hub's BAG tab, and so does a tap of the touch ITEMS slot. Holding ITEMS opens the quick
  wheel, as holding X / View does.
- **Settings, fullscreen, players online and the debug menu** are in the hub. The debug menu is the last line of
  Settings › Help, quiet, and ` still opens it.

### The hub
- **One panel.** It fills the screen on a phone and is a large centred panel (1160 x 760) on a desktop. Its bar holds
  RESUME first, then the tabs MAP · PHONE · BAG · PEOPLE · SETTINGS, then ✕. Upright, the bar is RESUME, the tab's name
  and ✕, with the five tabs on a row under them.
- **How it works.** Each tab is one of the old overlays (bigmap, phone, inv, players, settings), shown one at a time in
  the hub's frame, so their code and their pad navigation carry on. The game keeps running behind it.
- **Opening it.** Esc, Start or MENU opens the hub on the last tab used. P / M / I (D-pad ← / →, the HUD's PHONE and
  MAP) open a tab straight away, and pressing the same one again closes it.
- **Moving round it.** LB / RB (Tab on a keyboard) change the tab. The D-pad moves through RESUME, the tabs and the
  tab's contents, and focus starts in the contents. On a keyboard ← / → now step sideways through a grid. B / Esc goes
  back (an app, a map category, a bag item's details) and then closes. A click or tap round the desktop panel closes it.
- **The title screen.** Settings opens in the same frame on its own, with no tabs and no RESUME.
- **Where the pause list went:**
  - Settings › Help: unstuck, surrender (pressed twice), cinematic mode, fullscreen, exit to the title, install,
    repair, leave Dev Debug Mode, and the debug menu last.
  - Settings › Account: your look.
  - The phone's quick row: the cop's cruiser. The phone's Camera app is the cinematic mode too.
- Nothing is lost (test/hub.test.js lists each one).

### The Phone tab
- **The job you're on comes first.** It shows what it is, the step you're on (live, from your self record), the pay,
  Show on map (it opens the MAP tab on it) and Quit job (pressed twice).
- **Then every app in one grid of line SVG icons, with no paging.** The apps are Jobs, Places, Transit, City feed,
  Bounties, Homes, Skills, Crew, Log and Camera. The actions (Nearest ATM, Dance, the cruiser, clear the waypoint) sit
  in a QUICK row of their own, apart from the apps.
- **In an app**, its name is in the header with a 44 px ◀ Back.
- **The Log app** shows every note in full, newest first, with how long ago and its tone. The store is
  client/notelog.js: every note the HUD shows goes in (hud.js toast), the same note again within a minute is counted,
  the last 80 are kept, and this tab's session keeps them over a reload. UI-4 makes the notes one line and sends their
  detail here.

### Jobs, easy to take on
- **The Jobs app lists short cards** (client/jobcard.js), grouped and nearest first. Each card shows what the job is,
  the pay as a range with what it is paid for ("$150-$420 a call"), how far it is, the first step ("Get in the fire
  engine at Fire Station 7") and Accept.
- **One tap accepts it.** The server signs you on, its waypoint is set and the hub closes.
- **Where the numbers come from.** server/systems/phone.js gives every board entry `lo`, `hi`, `per` and `step`, all
  computed from shared/rules.js: FIRE.pay and MEDIC.pay per call, with the fast bonus in the top; CAB's fare over
  CAB.trip; BUSJOB per stop and passengers; TOWJOB; SAR; CHARTER; COAST; DUST; FARM.
- **The same card at a job's place.** Act at a hospital's doors, a fire station, a taxi rank, a bus stop, an impound lot
  or a rescue helipad no longer signs you straight on. It brings the job's card over the game ({ t: 'jobcard' }), with
  Accept and Not now. The interactions carry a `card` (firefighter, paramedic, taxijob, towjob, busjob, sar.js), and
  players.js doAct offers it (phone.js offerCard). Accept ({ a: 'take', card: 1 }) signs on at that place, by its own
  start, as long as you're still within 400 px. The interactions' `run` is unchanged, so their tests still sign on
  directly.

### The Bag tab (the owner: "much cleaner and modern and easier to work through")
- **A grid of cells by category** (client/bag.js, which replaces inventory.js createInventory). The categories are
  weapons, healing, food and drink, clothes, fishing, tools and lights, hunting, garden, valuables and other. Each cell
  has a big glyph or the weapon's own art, the name and the count, with IN HAND or SLOT n tags.
- **Filter and sort.** Category chips (only the ones you have something in) filter the grid, and it sorts by kind, A-Z,
  most or value. Both choices are remembered in this browser.
- **A details pane beside the grid** shows the name, the category, what it does, how many you have (or the rounds) and
  the actions:
  - Use or Turn on/off;
  - Equip or Put away;
  - the plasma blade's colours;
  - pin to quick-wheel slot 1-4;
  - Drop one or Drop all, each pressed twice.
- **Drop is new on the server** (cargo.js dropItem, session `inv drop`). The thing goes into a bag at your feet for
  DROP_LIFE_S (300 s, shared/rules.js), and anyone can pick it up. A weapon goes with its rounds, and you're back to
  fists if it was in your hand. You can't drop things from a vehicle or while held.
- **The layout.** Upright, the details come up as a sheet from the bottom with a ✕. The quick wheel's four slots sit
  under the grid. A hidden `bag-craft` section keeps crafting's place in the layout; crafting itself isn't built.

### The Settings tab
- **Sections.** Controls · Sound · Graphics · Account · Help sit down the left (a scrolling row upright), with the
  Danger zone (Start fresh) apart at the foot. The existing settings rows and their handlers are unchanged and moved
  into their sections.
- **Controls show the device you're on**, with Keyboard and mouse · Gamepad · Touch one tab away. The bindings come
  from shared/controls.js, in groups: on foot, at the wheel, in the air, menus. The device's own options show with
  them, and the other devices' options hide: keyboard driving; gamepad driving and the stick-fire; vibration on a pad
  or a phone.
- **Every row, select, nav button and toggle is 44-48 px.**

### The Map and People tabs, and a sideways phone
- **MAP (LandHub):**
  - the map, with zoom in, zoom out and find-me on it (44 px);
  - beside it a panel: your job's card and your waypoint's (with Clear);
  - SHOW, a two-column grid of category chips (aria-pressed);
  - FIND A PLACE, the categories' lists;
  - the legend, then players online.
- The old top bar (the logo, the round tabs, the clock and bars, the money) and its foot are gone. The control hints
  sit at the panel's foot.
- **PEOPLE:** players online (the dev buttons as before) and your crew. The Crew app's view moved into exported
  functions of client/phone.js (`crewHtml`, `wireCrew`), so the tab and the app share it.
- **A shop's menu on a sideways phone:** a compact one-line head (title, ✕), a two-line description, the wallet line,
  and the list from high up. Its list scrolls on its own, with a fade at the foot while there's more (`.cue-down`; the
  bag's grid has it too). The bag at 844x390 keeps its details beside the grid (260 px).

### Controls tables and the README
- **shared/controls.js** gains `hub` (ESC / MENU / MENU), `hubtab` (TAB / LB / RB / TAP A TAB) and `climb` / `descend`
  for every device.
- **The touch words** for the HUD's row and ITEMS (PHONE, MENU, ITEMS, HOLD ITEMS) are set in one `Object.assign`
  after TOUCH, so the lines the touch controls' own rework edits stay as they were.
- **The README controls table:** the hub, the bag (tap ITEMS), taking a job, the notes' log, the quick wheel (hold
  ITEMS), and every "☰ / ⚙ / 🎒 / pause menu" route rewritten to the hub's.

### Page weight
- **The page went from 498.2 KB to 497 KB** (budget 498, not raised). Four things load only when first needed:
  - the hub's tabs: hub.js for Settings and People, bag.js, phone.js and jobcard.js;
  - the map (worldmap.js, as before).
- **What came off the page:** the old bag (createInventory), the pause list, the round tabs and their top bar
  (buildHubs, hubGo, uiTop) and help-tpl.
- **style.css** dropped the pause, round-tab, top-bar and old-bag rules and gained the hub's. The title screen's assets
  are at 242 KB (290).

### Tests
- **test/hub.test.js (new):**
  - the row and the hub's tabs; every old pause item reachable; Esc / Start / MENU / P / M / I / LB / RB / Tab and the
    D-pad's focus;
  - the tabs lazy;
  - the log store;
  - the job card (the markup, the server's ranges and steps; Act at a fire station brings the card and doesn't sign on;
    Accept signs on; walking off refuses it);
  - the bag (its categories, its messages; the server's Drop of an item, all of it, a weapon in hand; refused from a
    car);
  - Settings' sections and its device filter (the bindings per device from the tables);
  - the sideways shop menu and its cue.
- **test/hudlayout.test.js** checks the HUD row on every screen and device: three buttons, MENU · PHONE · MAP
  labelled, key badges only on a keyboard, 44 px on touch, not on each other or on the HUD, upright in the top band and
  clear of the middle. The rest of its checks still pass with the row in place.
- **Updated for the new layout:** test/startfresh.test.js (Start fresh in the Danger zone) and test/hudlayers.test.js
  (the hub over the notes).
- **The HUD's share of the screen, on foot** (the audit's coverage): desktop 5.8% -> 6.5%, 844x390 25.2% -> 24.7%,
  390x844 25.5% -> 25.3%. The middle third stays clear. Touch targets under 44 px in the hub's screens went to 0; there
  were 9 in the old bag alone.
- **Two failures that aren't this phase's.** test/sound.test.js: the server's `bt` event, the shelters' boards from
  server/systems/transit.js, has no sound entry. test/worldmap.test.js: the baked world map's signature is not the
  test city's. Neither file is touched here.
- **Taxi ranks at stations.** In the built city a rank's Act is the station's own (its timetable, boarding), which
  takes precedence over the taxi sign-on, so the card is tested at a fire station. Signing on as a taxi driver from the
  Jobs app works.
- **Merged with the aim stick's return (fix-ui2, ff0eaac4).** The right aim stick, its ring-fire and the FIRE ON
  toggle (a utility slot) are back. Their setting, "The aim stick pushed into its red ring fires", is in Settings ›
  Controls with `data-for="touch"`, so it shows on the Touch tab only. TOUCH.aim reads AIM STICK in the bindings.
  ITEMS keeps its tap (the bag) and its hold (the quick wheel) beside the stick's handlers in client/input.js.
- **Captured** before and after, every screen at desk 1440x900, land 844x390 and port 390x844, on the dev server: the
  session's scratchpad ui3-shots.
