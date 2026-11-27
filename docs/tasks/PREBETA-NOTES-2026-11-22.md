# The owner's pre-beta notes, feedback, ideas, tests and audits (2026-11-22)

The words of his 15-page PDF, taken out by a script. Its 14 pictures are NOT here: read the PDF itself for those. **Triaged 11-22 03:40 (Opus 5.5, with the pictures): the triage is at the top, his words below it.**


## Triage (11-22, the pre-beta chat): each note, its ripple check, its package, its guard

Packages are MASTER-HANDOVER section 5: **1** go-live of `prebeta-art`, **2** the world batch, **3** systems and UI
fixes by area, **4** music and instruments, **5** regression checks, **6** art on Fable, **7** launch. "Guard" is the test
or lint row that keeps it fixed (or eyes-only). Counts are from the code; the ones that need the built world are marked
"world count" and are taken by one counting run before the world batch.

| # | His note (short) | Ripple: same thing elsewhere / same kind / same cause | Pkg | Plan | Guard |
|---|---|---|---|---|---|
| N1 | Bag: the quick bar doesn't show what's in it; unclear how to equip guns / melee / thrown; a stray yellow button over the plasma blade; ammo text off-style, crowds the name | One bag screen (`client/bag.js`), every item in it; the quick bar is one row of 4. The yellow piece is the slot chip ("IN HAND") of the tile above, cut by the scroll. Same cause: tile chips laid over the tile | 3 (UI) | Now: the quick bar draws the item picture in each slot; EQUIPMENT slots say how to fill them; chips inside their tile; ammo on its own line in the pixel face | test row in `test/bag*.test.js` |
| N2 | Item icons still weak vs the concepts; a UI/UX polish pass on every device and orientation | Every item/weapon picture (`client/itemart.js`, ~200), every menu | 6 (Fable) | Saved for Fable: art. Logged | eyes-only (sheet) |
| N3 | Wanted levels come too easily | One heat table (`law.js` CRIMES + `rules.js`); the tally before the first star (11-07) | 3 (police) | Now: measure what one punch, one hit car, one shot gives, then soften; numbers into `rules.js` | `test/law*.test.js` row: N minor acts before a star |
| N4 | A bounty from fighting the police; bounties are meant to be player-placed only | `law.js` gives a "city bounty" at 4+ stars (`cityBounty`); shown as a bounty on the HUD and paid to hunters | 3 (police) | Now: no city bounty - the stars alone; hunters and police still paid for wanted takedowns, under its own name | test: 5 stars -> `bounty` 0 |
| N5 | BRUTE / TOUGH tags cover the NPC; above it, and not for long | One drawing (`main.js drawWorldLabels`): the brawl health bar and tag sit at the chest (24 px up, under the head's 46); the player name tag has the same fault (N19) | 3 (UI) | Now: one head-top anchor for every overhead label; the tag shows ~3 s when a fight starts | test: every overhead label's y above the head |
| N6 | Two identical NPCs side by side outside the hospital | NPC looks (`npclooks.js`/`personas.js`): seeded per spawn; twins possible in a spawn burst | 3 (NPCs) | Check the seed; no twin within a screen | test: twins in a spawn burst |
| N7 | How to reach the quick bar in play, desktop and phone | Keys 1-4 on desktop? the quick wheel on pad; touch has BAG only | 3 (UI) | With N1: number keys shown on the HUD's slots (desktop), a quick-bar strip on touch - design below N22 | README controls + `test/controls` |
| N8 | Using an instrument from the bag leaves the bag open | Every "Use" that starts an activity from the bag (instruments, mat, boombox, rod, light...) | 3 (UI) | Now: Use closes the bag when the item starts something | test: Use on each activity item closes the bag |
| N9 | The instrument game looks poor (blurred arrows with shadows); wants an SNES rhythm-game look; real songs, not random beats | The gig screen (`client/leisure/`), all five instruments, the mat | 4 (music) | Look: with the music package; songs need his recordings (folder access) | eyes-only |
| N10 | See yourself play; NPCs react, tip; players can tip | Buskers (NPC), the player's gig, the mat | 4 | Design with the music package (the busker on the music clock) | - |
| N11 | The event highlight still covers the NPC; subtler; easier from afar, fades when close | One drawing (`main.js drawEventArrows`), all 17 event kinds | 3 (UI) | Now: smaller brackets, no chevron within ~2 screens' third, fades as you near | test row on the mark's size/alpha by distance |
| N12 | The highlight doesn't stay on a moving target | Same function draws at the event's last server spot, not the person | 3 (UI) | Now: anchored to the event's person (`ev.e`/`thief`) when known | test: mark follows the entity |
| N13 | Four robbers at once inside a hospital: planned or a bug? | The calm-streets cap (`events.js busyNear`) counts happenings round a player; to check whether interiors and snatches are counted | 3 (NPCs/events) | Investigate; answer him | test: no more than CALM_STREETS.incidents near one spot |
| N14 | The hospital's inside is dark at night | Every walk-in interior at night (world count) | 3 / 2 | Interiors lit by their own lamps at night | lint/test: interior light level at 23:00 |
| N15 | Street performers have no animation; it should follow the beat; the player's too | Every busker kind (NPC), the player's five instruments | 4 | With the music clock (one beat for both) | eyes-only + test of the pose clock |
| N16 | Going in / out pops; a smoother transition | One cutaway (`client/interiors.js`), every door | 3 (UI) | A short fade of the roof (~250 ms) both ways | eyes-only |
| N17 | The awning over a door hides it; fade it as you step under | Every awning / canopy over a door (world count) | 3 (renderer) | The awning fades with the roof when you're under it | eyes-only |
| N18 | An ATM under an awning | Every ATM against an awning (world count; `atmStray` 53 is the lint's nearest row) | 2 | New lint row `atmUnderAwning`, fixed in the world batch | lint |
| N19 | Player names over the character | Same cause as N5 (one label anchor) | 3 (UI) | Now, with N5 | as N5 |
| N20 | The hospital: two cut-off green signs; one good lit sign; looks like an apartment block; the glowing front washes out the name; the map icon over the H; better storefronts; see-through windows?; two ATMs side by side | Hospitals: 6 (Old Town, Northshore, Civic, Mesa, the desert's, the hand-made one) + clinics (world count); the icon-over-door rule for every place; ATMs within a few tiles of another (world count) | 2 + 6 | Signs/icon/ATMs: lint rows and the world batch. The hospital's look and storefronts: art on Fable (buildings pass). See-through windows: possible as a baked "lit interior" layer in the window art (cheap); live see-through costs every frame - say no for the beta | lint rows `signCut`, `atmPair`, `iconOverSign` |
| N21 | The big map: a dashed diagonal line (a subway at 45 degrees?); labels covered by the numbered circles | The map's labels and markers (`client/worldmap.js`), every label | 3 (UI) | Check the line's source; labels laid out so a marker never covers a name (move the name) | test: no label under a marker |
| N22 | Chat: long lines show in the log only; wants a small always-there chat feed, separate designs for desktop / phone upright / phone sideways; keep bubbles for quick phrases, maybe a sign above a player who's typed a long line; log and events in the same box?; a character limit? | Chat UI (`client/chat.js`) on 3 layouts; the HUD notes | 3 (UI) | Design first (a new HUD element: his pick - DECISIONS "variants only where they earn it"). The limit exists: 200 characters (guests 120), plus rate limits | test per layout |
| N23 | Roof signs cut off by the roof | Every sign on a roof (world count) | 2 | Lint row `roofSignCut`, fixed in the world batch | lint |
| A1 | How long to afford a first car / house | `rules.js` prices vs pay per job | 3 (economy) | A report with numbers | - |
| A2 | How long to join the police | `law.js` officer requirements | 3 | Report | - |
| A3 | How hard are crimes punished; how hard is Samaritan back | heat, fines, Samaritan losses/gains | 3 | Report | - |
| A4 | Earn vs lose on death: balance; does crime pay; do honest jobs pay | payouts, death losses | 3 | Report with proposals (his call: prices are "ask first") | - |
| A5 | Switching paths after the FTUE's answer (honest -> crime...) | the phone's Jobs, What's next, the Guide | 3 | Report, then fix gaps | guide test |
| A6 | The illegal mushrooms: pointed to them? a guide once picked (illegal, worth a lot, where to sell, the risk) | foraging, the Guide, first-time moments | 3 | A first-time moment on picking one | ftue test |
| A7 | Crime not caught shouldn't cost Samaritan points; explain the mix to players | `law.js` Samaritan losses (on the crime or on being seen?) | 3 | Check; if unseen crime costs points, change to "only when seen / caught"; a Guide entry | test: unseen crime keeps Samaritan |

---

City Life Auto prebeta notes/feedback/ideas/tests/audits

       Inventory needs work. Quick Bar doesnt show what’s equipped to it. It isnt clear how to
       equip guns or melee or thrown stuff. There is part of a yellow button above the plasma
       blade im not sure why its there. Ammo text is a little out of place and style and
       sometimes gets too close to the name of the equipment.

       The icons for the equipment and gear and everything are still kind of bad, I’d like to get
       closer to the concepts we had. Maybe this is a job for a focused Fable 5.2 session and
       maybe should include a polish pass over all the UI and UX across all devices and
   orientation (portrait/landscape on mobile)

● You get wanted levels too easily still.

● I think I got a bounty put on me when fighting the police. The bounty system was
   supposed to be something players put on each other, I wasn’t planning on having it
   something you get for committing crimes around the city.

● Character types that show up over NPCs like Brute or Tough, they cover the NPC right
   now. I think having it show above the NPC a bit so its not covering it up, and I dont think
   it needs to stay on for long we just need something that indicates this specific NPC is a
   bit harder to fight.
●

   This hasn’t happened very often but I think I see two identical NPCs next to each other
   outside the hospital. Its okay if this happens randomly because thats just how things
   turned out, but I’m hoping with the additional work and customizations we’ve added in
   the fable 5.2 focus polish passes on the characters/humans in the game that this doesnt
   happen too often.

● For UI, I’m not sure how to access my quick bar when I’m in game (currently looking on
   desktop, not sure if its different for mobile) but I’d like to figure out how to make the quick
   bar work well for desktop and mobile so its easy to get to things like your instrument or
   healthkits or fireworks, etc.

●

   Another inventory issue, if you are playing an instrument like bucket drums and you
   press use from the inventory you cant close the ‘bag’ or inventory screen so you can’t
   see yourself playing.
●

   Also with instruments the UI doesnt look very good, especially the arrows with shadows
   on it, just looks blurry and hard to read. We should spruce this up more to be more like
   an SNES looking beat saber or dance dance revolution or guitar hero. We should have
   more interesting songs too right now they are just random beats that dont make a lot of
   sense, it would be cool to play along with some good music or songs or to make a good
   beat out of it (for all the instruments)

   Lets make sure we can see ourselves playing and whats happening on the street too, it
   would be good to see yourself play and having NPCs come up and react whether they
   like it or not. Maybe some NPCs give tips. Maybe other players have an option to tip
   you some money.

●

   The latest UI indicator that shows an event happening is better than the arrows but it still
   covers up the NPC a lot. It could be more subtle I think and maybe easier to see when
   you’re further away or might not notice it but I think once you start getting closer to it
   maybe it is a little faded away so its easier to see what is happening. With the Square
   corners, the arrow, the health bars, the ‘TOUGH’, its just hard to tell whats happening
   between those NPCs, like this example here.

●

   We can also see these indicators dont always stay on their focus, like these 4 robbers in
   this hospital. The indicator flashes but the robbers are running so the indicator will just
   show over nothing sometimes which is weird. If we can get the indicator to stay with the
   focus better we should do that.

   Unrelated to the indicator, i haven’t seen an event like this before where 4 robbers
   popped up inside of the hospital like this. Is this a planned event? I dont think its bad, it
   could be cool to have a group of robbers like this so that’s fine if its planned. But if its a
   bug that is making multiple events happen all of a sudden and this could flood an area
   with events then we should look into it.

   Also the interior of this hospital at night is really dark shouldn’t it be lit up inside?

●

   Street performers could use some work, right now I think this is a performer who is
   playing bucket drums but you really couldn’t tell what they were doing until you got close
   to them. They dont have an animation and should use one (preferably one that lines up
   with whatever beat they’re playing) and same with street performers in general.
   Including when a player is playing an instrument, the animation should line up with them.

●

   When going into an interior the inside view pops up and exiting the exterior pops up. Is it
   possible to have a slightly smoother transition here?

   Also the awning over the doorway still hides a lot, maybe that should be part of the
   interior as well so as soon as you go under the awning (if a place has one) it makes the
   awning partly transparent or hides it more so you can see the doors open as you go
   inside.

   Also in this shot you can see the ATM is hidden under the awning which makes it kind of
   weird, we should make sure ATMs arent under awnings like this.

●

   Names of players show over the player right now, they should show slightly above the
   player so it doesn’t cover the player’s character for other player’s viewing.

●

   In this shot we see the green hospital sign on the left side has two signs, both of them
are slightly cut off. We just need one good sign (one that glows at night and might still
light up during the day so its easy to see. Not sure if we need to differentiate hospitals
and clinics but should this hosptial have the green sign and the hospital awning and
emergency sign too?

In general, the design of the hospital (and maybe all of them) is off. It looks like an
apartment building from the outside. The front of the hospital is one long glowing side of
the building and it glows so hard that it washes out whatever the name/text is.

The green hospital icon sits over the H on the awning so separating these things out
would be better (I think the icons go over the doors by default so maybe designing
around that would be best so icons dont cover up identifying features of a building, like
the H on this hospital awning for example.

In general I think storefronts and buildings need better designs. Can windows actually
be see through and you can see what’s inside from the outside or would that be too
much of a performance issue?

We can also see there are two ATMs next to each other on the same building, we dont
need ATMs this close to each other (unless maybe its at a bank and there are multiple
ATMs in a row by design then that would be okay.)
●

   Looking at this minimap there is a dashed line that cuts across the map here. Is this a
   subway or something? Is this accurate does the subway actually turn at a 45* angle like
   this and cut through? Not sure if this is a bug or how it works.

   You can also see the ‘You Are Here’ text is covered by the ‘1’ circle, so we should sort
   that out so text and icons aren’t covering each other up so much. You can see it with the
   Civic Center and the ‘5’ circle too. Not sure if there is an elegant way to solve for that so
   it happens less.

●

   Looking at desktop (not sure how it shows up on mobile) I’m seeing if I type out a long
   message that message seems to show up in the message UI but doesnt show up as a
   bubble above my head. Which is a choice we made and I think we should stick with not
   having a bubble above your head, but as this system works now there isn’t an active
   chat box on screen so you wouldn’t really know people are talking unless you had this
   open? We should have a dedicated UI container that has player’s chat going, something
   that doesn’t necessarily take up a ton of the screen (especially on mobile in portrait and
   landscape) but will show an ongoing chat when thats happening. Maybe we only have
   text show up in a speech bubble when its one of the prewritten quick messages? And
   the rest of the chat goes into the chat box? Should we have log messages or events
and updates and things also live in that same chat box so all that text is contained in one
area? I do like having speech bubbles with things people are typing pop up above the
player so maybe if theres a good way to work this system out to keep speech bubbles
happening not just for quick chat options but still shows you when someone is chatting
and maybe indicates above the player somehow even when its a longer message the
player has written out…

Also just a quick question do we have a character limit on this chat? I feel like this will
be easy to spam or messages will be really long and get lost or something, we need to
have a good chat system and information system that works together without crowding
the screen, especially on mobile. We can design theses systems to work best for the
platform they’re on, so Desktop obviously has more room to display more messages and
work best for desktop, but mobile is smaller and needs to work in landscape and mobile
so we’ll want to figure out how we can design this to work for mobile in portrait/landscape
and probably design it separately from desktop so both are optimized to work best for
the platform its on.

   ●

        These signs on the top of these buildings are cut off through the roof. We should make
        sure we’re polishing up details like this so things dont get cut off like that.

   ●

Tests/Checks/Audits

   -   How long does it take to make enough money to buy things, like your first house or car
   -   How long does it take to join the police?
-   How hard are you penalized for crimes and how hard is it to earn good Samaritan points
     back, I want to make sure people on an honest path trying to avoid crime don't get
     penalized too hard if they accidentally do something
-   How is the balance of time spent making money and buying things vs. dying and losing
     those things you bought, what's a good balance to have here so players don't become
     infinitely rich and money isn't important but they aren't losing too much if things go
     wrong? Does crime pay enough to make the risk worth it? Do good honest jobs pay
     enough?
-   The player chooses an option at the start whether they want to do crime or honest work
     or hunt/fish or free roam. No matter the decision do we have a system or guide, in
     assuming in the phone with jobs or something, that helps the player try our different
     paths and jobs, like if they choose honest work but then decide they want to do some
     crime can they easily connect to a crime job or crime path and start doing those kind of
     jobs?
-   We have illegal mushrooms you can find in certain parts of the world, will we ever have
     players pointed towards that kind of work and what to do with them? Like do they have
     to find it first and if they pick it then a guide shows up to explain it's illegal but worth a lot
     and where to sell it if they want to make money off of it but the risks involved in doing
     so? Something like that.
-   And id say if you do crime work but you don't get caught I don't think it should count
     against your good Samaritan score, like if you sell illegal mushrooms but otherwise do
     good work and don't kill people or get caught doing crimes you could still be on a good
     Samaritan path and work as a police officer or work towards other good Samaritan
     perks. If this doesn't exist already we should set it up like this. And we should have a
     way to explain this to players so they know they have options and the risks involved but
     also the strategy to mix crime and honest work to take on a higher risk of you get caught
     and don't want to lose good Samaritan points but will make good money and not lose
     Samaritan points if you pull certain crimes strategically and under the radar. If that
     makes sense.
