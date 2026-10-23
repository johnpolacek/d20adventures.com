# Decision history

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md)

This log retains durable decisions and dated evidence. Git owns detailed implementation history. Past validation does not establish current production health.

## 2026-10-23, reusable sets: the street, cellar and tunnel kits

Owner decision: the 27 encounters still without a 3D set get reusable kits, a street, a cellar and a tunnel, redressed per encounter. Only the Blackthorn mansion and the forgotten temple get bespoke sets. The Dust Settles reuses the library. The street kit is done: five dressings for Shadowing Silverhand, The Hideout, The Ambush, The New Dawn and Vengeance of the Blackthorn. The engine gained raised cast members for roofs and balconies. The cellar kit followed the same day: Silverhand's back room and the Blackthorn wine cellar, with cask, wine rack and torch builders. Then the tunnel kit: the four catacomb scenes from new `bore` and `cave` builders. Then the bespoke Blackthorn mansion: the ballroom, with and without the caged drake, the grounds by night, the stair hall, the upper corridor and Thaddeus's study, for thirteen encounters. Stage check and 78 desktop tests pass. See [March of Davos in 3D](plans/march-of-davos-sets.md).

## 2026-10-23, token functions require the server secret

Every function in `convex/userTokenManagement.ts` was public and took any user id, so anyone with the public Convex URL could credit or drain any account. All six now take the server secret, as the store, device and hosting functions do. `app/_actions/tokens.ts` is no longer a server action file, so a browser cannot call its credit helper either. Checked on the development deployment over the public HTTP API: no secret or a wrong one is refused, the right one passes. Deployed to Vercel and Convex production the same day. Production refuses calls with no secret or a wrong one.

## 2026-10-23, Vercel deployment storage

The project filled the Hobby deployment storage. Each deploy carries about 136 MB of `public/`, and every push deploys. Seven older production deploys removed. `vercel.json` now skips builds for wiki-only changes. Retention cannot be set by API on this plan. Stage art, about 88 MB, is left out of deploys and served from the public bucket through CloudFront rewrites. `pnpm stage:sync` uploads it. See [Vercel deployment storage](plans/vercel-deploy-storage.md).

## 2026-10-23, the Black Market in 3D

The Black Market for encounters 18 and 19: a court with the curtained doorway Garrick guards, and behind it a canvas-roofed lane of stalls and lanterns to the auction house's door, ready for the auction next. Seven builders, a painted stone texture, six standees. An engine fix: shots beyond a set's camera reach were being dragged toward their targets, which had shifted views of the library, the Silver Serpent, the docks and the Lower Districts. Stage check and 78 desktop tests pass. See [March of Davos in 3D](plans/march-of-davos-sets.md).

## 2026-10-23, the Lower Districts in 3D

March of Davos encounters 15 to 17 in 3D. A street of leaning jettied tenements with a house built across it, washing, lanterns and a hooded crowd, and the side alley where the Black Market's day signs are carved. Halfling urchins, a fiddler, a hooded local and a trinket-seller. New street builders. Each opening view was framed against its painting first. Stage check and desktop tests pass. Not yet checked in the running app. See [March of Davos in 3D](plans/march-of-davos-sets.md).

## 2026-10-23, the docks' quality pass

Review: the docks were not at the bar beside the arrival painting. The opening now frames like the painting, from a quay head looking east along the water with the ship right of centre. The ship is larger, bow toward the viewer, with a painted canvas for her sails, and the water lies 5.5 m down so her hull towers. Small cobbles and worn flags, a crowded harbour of boats, barges and ships, cream-canvas stalls, gulls, golden backlight and haze. The drake reads green, and the wrecked quay is denser. Stage check and desktop tests pass. See [March of Davos in 3D](plans/march-of-davos-sets.md).

## 2026-10-23, the docks in 3D

Third of the remaining March of Davos sets, for its five dock encounters. A golden harbour quay with the elven ship Star of Faelendar alongside, walkable by her gangway, warehouses with arcades, a treadwheel crane, Warehouse 14 in its corner with the chained crate, and the same quay wrecked after the drake, the cage in the hold eaten through. Harbour builders, a painted far shore, ten standees including the winged forest drake. Stage check and desktop tests pass. Not yet checked in the running app. See [March of Davos in 3D](plans/march-of-davos-sets.md).

## 2026-10-23, the Silver Serpent Tavern in 3D

Second of the remaining March of Davos sets. A long, dark dockside hall of tarred timber whose far end is an arch open on the foggy quay, as its painting has it: lanterns, glowing amber panels, a ring-lamp over the aisle, a carved sea map on the west wall, and a silver serpent over the bar. Nautical builders, four painted textures and five standees. Stage check and desktop tests pass. Not yet checked in the running app. See [March of Davos in 3D](plans/march-of-davos-sets.md).

## 2026-10-23, the Old Grand Library in 3D

Owner asked for 3D sets for the rest of March of Davos, one at a time, to the end. First, the Old Grand Library: a two-storey hall of bookcases under a painted vault and dome, saints in stained glass, midday sun down the floor to the red door, and the private archives behind it. Library builders, an `image` material for paintings, eight painted textures and four standees. Stage check and desktop tests pass. Not yet checked in the running app. See [March of Davos in 3D](plans/march-of-davos-sets.md).

## 2026-10-23, AI hero rule deployed

Owner: "deploy convex". The owner ran the deploy to Convex production `marvelous-mink-850` from `b4179f5`, so hosted games now get the AI hero rule. See [scene rails check](plans/scene-rails.md).

## 2026-10-22, both playtests judged in full

Owner picked judging all 161 rounds of both playtests, then probing the worst scenes. 47 rounds came back off the rails, most pushed by the GM. The worst scenes were all played before a fix: today's content and AI hero changes, and yesterday's "Silverhand keeps walking" and "a caught party goes to the ballroom", each committed minutes after its derail. Three new probes, Shadowing Silverhand, the wine cellar capture and Clan Conflict, stayed on the rails in all nine runs. All six probes now pass, 18 runs. 104 rounds name a content gap, and the repeated ones are listed in the plan. See [scene rails check](plans/scene-rails.md).

## 2026-10-22, AI heroes open no way out

Owner picked the AI hero rule next. After the content fixes, the derails left came from AI heroes, such as Milos proposing the catacombs to Silverhand. The AI hero prompt now says to open no way out of a scene: no hidden passage, trail, fleeing figure or place the story has not set before the party now, and a lead from earlier rounds stays behind. Its "someone to follow" became "someone leading the way". All three probes then ran clean, 0 of 9 runs off the rails, against 4 of 9 at the first baseline. Every study run reached the journal, every Silverhand run moved on to The Ambush, and Silverhand kept Joran's secret. Also fixed: `test:gm-core` had failed since the content commit changed March of Davos's hash. Gm-core and desktop tests pass. Convex not deployed. See [scene rails check](plans/scene-rails.md).

## 2026-10-22, probes before and after content fixes

Owner: "(a) first, then (b), then rerun (a)". Three scene probes ran three times each, before and after content fixes. Silverhand's traitor is now secretly Joran, who worked his crew as Lev. The owner liked it, "but don't want to give anything away", so Silverhand knows only Lev, names no place, and has never heard of Joran, and Joran tells it at the finale if asked. Astrid's door can be opened, her quarters are empty, and nothing lies beyond the study's compartment. Silverhand's probe went from 3 of 3 runs off the rails, with invented catacomb passages and a traitor called Dmitri Vasko, to 1 of 3, an AI hero proposing the catacombs. The study's probe never got through the door before, and every run found the journal after, with no tunnel stair. The Ambush stayed on the rails in all three reruns. The judge now sees how each next scene opens, which cleared its one false positive. See [scene rails check](plans/scene-rails.md).

## 2026-10-22, scene rails check

Owner asked for headless playthroughs that keep the GM on the rails, with "an automated check that flags turns leaving the authored scene", run after each prompt change. The owner picked scene probes, with a judge built first. `scene:judge` reads a save's rounds against each encounter's intro, notes, transitions and cast, and flags invented exits and acts against the notes, with who pushed each one and any gap in the content. `scene:probe` starts a fresh game at an encounter from the five real turns before it, pushes on the scene's exits with scripted replies, and judges every round. Both playtest saves are now in the repo as known cases. The judge flagged every known derail, the cistern chase and the tunnel stair, and passed 9 of 10 early rounds. It traced the cistern chase to Silverhand's notes, which never say who betrayed him or where that man went. One short probe of The Ambush stayed on the rails. Also found: the round summary reaches no GM prompt, only the last five turns. See [scene rails check](plans/scene-rails.md).

## 2026-10-22, the Dragonbone Inn in 3D

Owner: "More 3D sets. Do Dragonbone Inn." The inn's three encounters now play in 3D: its common room in the evening and late evening, the same room at dawn, and the backroom behind the bar. A stone hearth with a dragon's skull over the mantel, a bar of bottles and kegs, stairs, leaded windows, wheel chandeliers. Eleven new standees: Bram, Beric, Eamon and Elara from their portraits, a bard, and six patrons painted seated on their own stools. Two engine fixes: the camera passing straight from one room into another now takes the new room's lamps, and window glass casts no shadow. Every view passes the stage check and DPR 2 verification. 78 desktop tests pass. Not seen in the running app. See [the plan](plans/dragonbone-inn-stage.md).

## 2026-10-22, the end of a round written ahead

Owner picked writing the end of a round while the round is read, "across all adventures". The screen now keeps a round until it has been read, so the end of the round and the next round's NPC and AI turns are written meanwhile, never more than a round ahead. A walk saved on a round the game has moved past is kept within its encounter, and its save no longer holds the story. Played live in the browser preview in all four adventures: in March of Davos five turns, the round's end and two of the next round's turns were written during one round's reading; in The Road to Kordavos a whole round ahead; in The Midnight Summons the round's end started as Thalbern's roll was answered, through an encounter change. Desktop type check and tests pass. See [shorter waits](plans/shorter-waits.md).

## 2026-10-22, shorter waits

Owner: "Cut waiting time. NPC turns take 7 to 27 seconds each. Pre-write the next NPC turn while the current one is read. Skip or summarize minor NPC turns in non-combat rounds." In local play the next NPC's or AI hero's turn is now written while the story before it is read, and a run of them keeps writing ahead of the reader. The end of a round still waits until the round is read. A walk's save waits for the turn being written instead of being dropped. Three live runs with Claude in the browser preview: seven festival turns after Branka's reply were written in 74 seconds while the reader was on the second, where before each cost a wait of 8 to 12 seconds. Skipping was measured on the second playtest's save and not built: of 36 calm-round NPC turns no hero had engaged, 28 carried the scene, such as Bram's costumes and Clive on the cellar stair. Every NPC turn also spends a second model call deciding whether it rolls. Desktop type check and tests pass. See [shorter waits](plans/shorter-waits.md).

## 2026-10-22, round budget

Owner: "Cap stalled encounters", then "Add a round budget per encounter that nudges the GM toward its transition." The second playtest spent eight rounds in The Wine Cellar, and the round-end GM never saw how long a scene had run. Each encounter now has a round budget, 4 unless its frontmatter sets `roundBudget`. The round-end prompt says which round of the budget this is. From the budget's last round it asks the GM to transition if a condition is nearly met, or else move the scene toward a listed way out. Two rounds past, it asks for the transition that fits best. A way out that waits on the players' own choice stays theirs. Nothing is forced. Desktop and hosted games. gm-core, desktop tests and the wiki checks pass. No live run yet. Convex is not deployed. See [round budget](plans/round-budget.md).

## 2026-10-22, production deployed

Vercel built the website from main `cbe9de0`, and the owner deployed Convex to prod `marvelous-mink-850`. Hosted games now use the story rules from the second playtest. No schema change and no data cleared. No game has been played on prod since.

## 2026-10-21, second March of Davos playtest

Owner asked again for an automated playtest with fixes as they come, and every 3D angle brought up to commercial quality. The gate's line and table, the festival and Clan Conflict were played in the desktop app in Chrome at DPR 2, then the adventure ran on unattended with the tester's hero picking among the offered replies. Fixed so far: a new scene's first paragraph showed the wide opening view, an encounter change built the new scene twice, the name over the portraits lagged the narration, crowd figures blocked close-ups, the line's intro framed the back of the line, the paving was flat slabs, characters hovered, speech bubbles ran under the portraits, a dragged camera showed the back of a tower, story view had no speaker portraits, and one speaker's lines read as quotes side by side. The square, the conflict cut and the gate are now cobbled like the festival painting, at the old frame cost. The run reached Vengeance of the Blackthorn in 86 rounds, the first time that ending was played. Story fixes along the way: pronouns in every beats prompt, no invented exits from a scene, a return to a played encounter skips its intro, AI heroes back the player's side, the Ambush ends at the inn, a way into the ball without an invitation, and a party caught in the mansion goes to the speech. Desktop tests, gm-core, the stage check, the website type check and the March of Davos checks pass. Not deployed. See [March of Davos playtest](plans/march-of-davos-playtest.md).

## 2026-10-21, the gate split into the line and the table

Owner: the first round should be the heroes stuck in line, meeting other travelers, and the next the front of the line, time to pay. The gate is now two scenes. The Gates of Kordavos is one round in the line, with only the heroes in it: the sergeant bellows the festival law, and a family turned back, Blackthorn wagons waved past and a grumbling spice trader give them things to talk about. The Front of the Line is Garlan's table, a new encounter, where names, marks and the company's name are taken. In the app the party stands two groups back in the 3D line, then at the front. Four live runs with Claude: every line-round hero spoke to another hero, and the last two runs took three rounds from the line to the festival. Desktop tests, gm-core and the wiki checks pass. See [meeting at the gate](plans/meeting-at-the-gate.md).

## 2026-10-21, production deployed

Prod Convex had turns from before the 2026-10-14 story beats, which failed the schema. Owner: "we can clear any data as needed. the only user is me and i'm just testing." Prod's `turns`, `adventures`, `turnAudio`, `gmJobs` and `chat_messages` were emptied, and Convex deployed to prod. The website was already built from the latest main. Both answer. No game has been played on prod since.

## 2026-10-21, website build fix

The website's deploy failed in `pnpm install`: `convex codegen` type-checks Convex with the ES2021 library, and `Array.at` in `gm-core/src/story/clean.ts` became reachable when Convex began importing the knowledge ledger. It is now an index. `pnpm test:gm-core` now type-checks Convex as the deploy does.

## 2026-10-21, meeting at the gate

Owner: the March of Davos gate is where the heroes meet, make it a great experience. The adventure now has a premise: the heroes come alone and are strangers. Festival law lets no one through the gate alone, so they must choose each other and enter as one company in the gate book, which they name. The intro shows each hero in the party as the others see them, with a new `{hero: id}` label that drops heroes not playing. With `strangers: true` the core keeps who has heard each hero's name, from lines said aloud, and every prompt that plays one character is told which names it has not heard. Heroes who come on together from The Road know each other. Two live runs with Claude reached the festival in two rounds, every name used was one the speaker had heard, and the parties named themselves the Gate-ward Company and the Forest Road Company. Desktop tests, gm-core and the wiki checks pass. Convex is not deployed. See [meeting at the gate](plans/meeting-at-the-gate.md).

## 2026-10-21, what each character knows

Owner asked for an explicit and comprehensive way to keep AI hero and NPC knowledge. An adventure now keeps a ledger of facts, each naming every character who knows it. At the end of a round each set of characters who shared private beats gets one fact, and the GM records what was learned in a required `knowledge` field beside its beats. AI heroes, offered replies and NPC turns read the round as their character knows it, their own facts, and on the desktop only their own gear. NPC turns no longer read other characters' whispers, the players' own words, or others' private intro paragraphs. The GM reads every fact with who knows it. A finished adventure's chapter keeps its heroes' facts. Live with Claude: AI Thalbern remembered Garlan's whisper the next round and Milos did not, and with the field required the GM recorded the gate's dusk closing 2 of 2 times. Desktop tests, gm-core and the wiki checks pass. Convex is not deployed. See [what each character knows](plans/character-knowledge.md).

## 2026-10-21, what a hero knows

Owner, playing Thalbern at the March of Davos gate: the AI heroes asked about the river goods that only Thalbern was after. An AI hero read the whole round, Garlan's whisper to Thalbern included. A beat can now be private, seen or heard only by its actor or speaker and whoever it is aimed at. The GM marks one in every step, and an AI hero's move and a player's offered replies read the round without the private beats that hero is not in, and without other players' own words. On the desktop an AI hero's premise now holds only the chapters it lived. Covert Cargo's hidden intro paragraphs are private, and its premise no longer gives every hero Thalbern's errand. Live with Claude, 3 runs: Garlan's answer was private each time. A question asked with no word of a whisper stays open. Desktop tests, gm-core and the bridge checks pass. See [what a hero knows](plans/hero-knowledge.md).

## 2026-10-20, March of Davos played to an ending

The playtest reached an ending after 75 rounds, from the gate through the ball, the murder of Thaddeus and the tunnels to Joran in the forgotten temple. Final Confrontation had no transitions, so arriving there completed the adventure before the party could choose. It is now played, and siding with Joran, with Astrid or with neither leads to one of three new ending encounters from the adventure's Aftermath. The Dust Settles was reached in a replay. Other fixes from the run: the desktop app plays one NPC or AI hero per call, so turns arrive in 7 to 27 seconds instead of up to 110 behind one card. Spells and traps that strike now hurt. Speech from a crowd stays with its narration, and a narration naming one character gives that character the line. Off-stage NPCs skip unseen. Bridge, batches a to f, gm-core and desktop tests pass. See [the playtest](plans/march-of-davos-playtest.md).

## 2026-10-20, March of Davos content pass

The playtest's live GM found later encounters with named characters but no `npcs`, lines inside narration, and intros that call the players "you". 31 encounters gained or filled in their casts, seven NPC sheets were added, and eight existing sheets joined the adventure's source. `forest-drake` had been missing, so entering The Beast Escapes threw. Quotes became speaker lines and intros moved to the third person. The March of Davos bridge and batches a to f pass. Not yet played through in the app, and the desktop runtime pack is not rebuilt. See [the playtest](plans/march-of-davos-playtest.md#content-pass-2026-10-20).

## 2026-10-19, NPC turn card

Owner asked for something more tailored than "The GM is resolving the action…" on an NPC's turn, and picked three options: an authored line per NPC, a fallback line picked by the turn, and the NPC's portrait. Character sheets gain an optional `thinking` line. Garlan Ironfist has the first. A player's own action keeps the GM wording. Typechecks and desktop tests pass. Not yet checked in the running app. See [NPC turn card](plans/npc-turn-card.md).

## 2026-10-19, Clan Conflict in 3D

Owner reached Clan Conflict on desktop and saw a blank story view. Offered a scene, shipped encounter art for story view, or nothing, the owner chose the scene. The standoff stands at the south end of the harvest square, on a cut of the festival set made by `scripts/stage-sets/clan-conflict.ts` with a ring of onlookers, so the festival's own crowd is unchanged. Barok, Larya and two followers each have new standees. `stage:check`, the DPR 2 renders and the desktop tests pass. Not yet seen in the running app. See [Clan Conflict in 3D](plans/clan-conflict-stage.md).

## 2026-10-18, March of Davos gate: AI turns read before the round ends

Owner, in the desktop app with Thalbern and four AI heroes: the heroes merged into one figure, and Lyra, Milos and Poppen were skipped into round two. Two causes. Walks to a mark ended on the mark itself, so four heroes stood on `queueHead` and Thalbern stood on Garlan at `ledger`. Walks now stop beside anyone already there, clear of anything solid. And one Continue played the AI heroes after the last player and also ended the round, so the stage only told round two. In local play a Continue now plays the waiting NPC and AI turns or ends the round, never both. Hosted games still end the round in the same job. Website heroes with numeric ids (`1749159962941`) are now valid stage cast ids too. A second game showed one more cause: each round lists characters by initiative, and that new order rebuilt the stage and moved heroes between places in the line. The scene is now keyed by the party in a fixed order. Desktop tests and typechecks pass. Not yet checked in the running app.

## 2026-10-18, backdrops for the other outdoor sets

Owner chose to add backdrops to the other outdoor sets. Every set's shots were captured first. Three needed one: the Kordavos riverfront close-ups looked past the end of the paving, and the old forest path and Thalbern's home showed bright gaps between trees. Each got a painting. The forest trail, Kordavos gate and square, and Mordava piers were left alone. See [painted backdrop](plans/stage-backdrop.md).

## 2026-10-18, a second backdrop at the stones

Owner, in the desktop app: Thalbern's close-up could be better. He faces the valley, so it looked at a bare plain. Sets now take up to four `backdrops`, and the stones gained a dark forested ridge on that side. A misty layered-hills painting read as clouds, so the ridge is crisp and dark. The key now drops floating paint and fills enclosed magenta. See [painted backdrop](plans/stage-backdrop.md).

## 2026-10-17, painted backdrop

Owner reviewed the spikes: the painted backdrop is a definite improvement. The animated standee looked good, but the owner does not want to pay for video generation. Projection had good and bad parts. Decision: build the backdrop only. Sets now take a `backdrop`, painted and keyed by `scripts/stage-backdrops.ts`. The Old Standing Stones uses it in place of its mountain cones. A lavender ridge left by the magenta key is now corrected. Not yet checked in the packaged desktop app. See [painted backdrop](plans/stage-backdrop.md).

## 2026-10-17, stage art spikes

Owner asked whether a shared paint-over-and-project workflow suits our 3D, and chose to test three parts in a test directory. At the Standing Stones: a painted, keyed valley backdrop replaced the mountain cones and read like the encounter art from every shot facing it. GPT Image 2 painted over our render with 76% of edges within 2 px, Gemini 3 Pro Image 53%, chance 42%. Projected from the stones camera the painting looked like the art, and from other shots it smeared and put painted sky on trees. Veo 3.1 Fast animated Thalbern's standee into a clean 8 second loop. Minimax H3 cut to another scene mid-clip, and the fal account then ran out of balance. Nothing in `packages/stage` changed. See [Stage art spikes](plans/stage-art-spikes.md).

## 2026-10-15, crisp grass near the camera

Owner: the grass at the Standing Stones looked fuzzy. The paint filter, 540 to 900 px tall, smeared the 2 cm blades. Its final blend now keeps a quarter of the paint within 3 m of the camera and all of it by 18 m, and the balanced tier gains FXAA. The stage typecheck and `stage:check` pass. See [the stage engine](stage-engine.md#crisp-near-ground-2026-10-15).

## 2026-10-15, March of Davos story questions answered

Owner answered the eight questions, leaving three to me. Thaddeus ordered Milos Antonov's death and Astrid carried it out. The tunnel seal is on the grate. A barrel blast buries some of Astrid's soldiers rather than cutting them off. Eamon is a half-elf. The two Barok files were one man, now `barok-redbeard` alone. "Lower Districts" everywhere. The Forest Drake joins its fight's cast. Three typos fixed. The March of Davos check now expects 34 NPCs. All bridge checks, batch-e, authoring, stage and desktop checks pass. See [Concise narration](plans/concise-narration.md).

## 2026-10-15, the other three adventures trimmed

Owner chose to trim the three adventures after The Midnight Summons. Intros: The Road to Kordavos 245 words to 193, Covert Cargo 1,486 to 1,113, March of Davos 7,653 to 6,070, every fact and label kept. March of Davos was split between three helpers. Fixed along the way: Reinhard called Varius, a repeated scrollcase, Petra's lock that was a melted cage, a translucent real drake, a lit fuse ordered lit, and GM notes that repeated their intros. Covert Cargo's two stage cues follow the new wording. Eight story questions are left for the owner in [Concise narration](plans/concise-narration.md). All bridge checks, batch-e, the stage check and desktop tests pass. Not replayed.

## 2026-10-15, shorter roll outcomes

Owner: "yes just once" (Wollandora asked her question once in the live game), then chose to tighten roll outcomes. The outcome of a hero's roll is now at most 2 short sentences and 40 words, says what the action did, and does not retell the hero's action. It was 60 words, and the owner's live game ran 37 to 46. The owner's next two rolls came in at 36 and 28 words, neither retelling the action. See [Concise narration](plans/concise-narration.md).

## 2026-10-15, epic Continue and Send, and the roll card played live

Owner, playing The Midnight Summons: Continue and Send use the epic button. A new `xs` button size gives an epic button half the bevel, so its top shine stays thin on the stage's small buttons. Continue drops its waiting glow and takes a chevron, Send sits half-width on the right with Skip just before it, and both chevrons are hand-drawn, cap height and outlined like the lettering (Cinzel sits high on its line, so they are raised 0.1em). The owner then confirmed the one roll card with the live GM: "roll card looks good. live replay is working." See [One roll card](plans/one-roll-card.md).

## 2026-10-15, recorded dice roll

Owner: play a sound when the die is rolled, stop it when the roll finishes, and cycle through three recorded clips. The three ElevenLabs takes are in `public/stage/sounds/` and replace the Web Audio clatter and the landing tock in `components/stage/dice-sound.ts`. The roll card and the narration's roll both use them. Checked in headless Chrome: the takes load, play 1, 2, 3, 1, stop on landing, and a roll stopped before its take loads stays silent. Not listened to. See [Roll results](plans/roll-results.md).

## 2026-10-14, one roll card

Owner, after a Stealth roll: three screens for one roll, the roll card, a "GM is writing" card that cut the die off, and the roll again in the reader. "I think it should be all one UI." The roll card now holds the roll from the throw to the GM's answer: the die lands, the verdict stamps in, "The GM is resolving the roll…" shows, then Continue opens the reader after the roll. Walks no longer show the "GM is writing" card. Checked in the desktop preview with the GM's answer faked. See [One roll card](plans/one-roll-card.md).

## 2026-10-14, a finished adventure's home screen, and old saves wiped

Owner: "Why does it say Adventure Complete and Continue on the homepage. If complete, there is nothing to continue?" Continue opened the finished game's ending. A finished adventure now offers "Continue: {next adventure}" with its heroes carried over, or Begin when there is no next one, and "Read the ending". The Adventures page says "Read the ending" on a finished game too. Checked in the desktop preview. The owner also expected old data wiped, not converted: the saved games and old validation saves on the owner's machine are deleted, heroes kept, and the conversion code removed.

## 2026-10-14, turns keep beats only

Owner chose to remove the old narrative text, label the other three adventures, and fix Wollandora asking twice. A turn's story is now its labelled beats and nothing else: the narrative string, its dice and reply markers, the stage's speaker and camera guessing, and Storyview's attribution call are gone. All four Myr adventures' intros are labelled. Old desktop saves are converted on load. The dev database had no turns to wipe. One slip: a commit briefly left main importing deleted files, fixed by the next commit a minute later. See [Structured narrative](plans/structured-narrative.md).

## 2026-10-14, structured narrative planned

Owner, after two fixes to the stage's speaker guessing: "Maybe we need to have more structured data around dialogue." Then, offered speakers only or a full structure: "we only have test data right now. it is easy now to throw everything away and do it right from the start". The owner chose the full structure with camera data, spell effects and objects in 3D, The Midnight Summons first. A turn becomes a list of labelled beats: narration, action, line, roll and reply. See [Structured narrative](plans/structured-narrative.md).

## 2026-10-14, one bubble a speaker

Owner, in Meeting at the Stones: two bubbles stacked over Wollandora. Her two lines in a row, "I saw a river boat…" and "Will you go, Thalbern?", read as one paragraph, and the desktop app gave each line its own bubble over the same head. `apps/desktop/src/stage-play.tsx` now joins one speaker's lines in a paragraph into one bubble, and the plate shows them all. Checked by a throwaway script over the owner's save: the one stacked paragraph is now one bubble. Not checked on screen.

## 2026-10-14, the journal numbers a scene's turns and shows rolls as cards

Owner: the journal repeated the encounter's title over every turn of a fight, and the dice rolls read as plain sentences. `components/stage/journal.tsx` now shows a run of turns under one title once, with a rule and "2 of 5" between them. Each roll is a card: a small d20 on the natural roll, the sum against the DC, and the verdict stamped in its colour. A natural 20 that succeeds turns the die gold, a natural 1 that fails chars it, as on the roll card. The desktop app passes its rolls to the journal as data, not text. Checked on a throwaway page at DPR 2. Not checked in the desktop app itself.

## 2026-10-13, a speech tag is read for who it names

Owner, two hours after the fix below, in The Missing Relics: Thalbern's own reply, "Thalbern meets Wollandora's gaze and asks quietly, “Tell me all of it…”", showed over Wollandora. A different rule from the one fixed that morning, and older: the reader took the three words before "asks" as the speaker and found her name in them. No restart was needed, the app reloads the reader as it changes.

The tag rules in `readNarration` are tightened. See [Stage engine](stage-engine.md). A second bare line from an NPC, which had no bubble, now keeps the voice of the line before it. Checked by throwaway scripts: 70 written sentence shapes, all read right, and the owner's save with ten older ones, 108 paragraphs with quotes. Against that morning's reader 7 changed, each read against its text: the owner's line went to Thalbern and 6 lines with no bubble went to Wollandora. Every one of the 16 in the owner's save is now right. 11 of the 108 still have no speaker. Then in the desktop preview on a copy of the owner's save. No permanent test was added.

The reader still guesses from the prose. The game knows whose turn wrote each line and does not record it.

## 2026-10-13, a quote on its own line goes to its speaker

Owner, in Meeting at the Stones: Wollandora's "Thalbern, we have a problem." showed in a bubble over Thalbern and on his plate. The NPC's turn wrote one sentence of action and then each spoken line alone on its own line, which is how the turns read since the concise narration pass of the same day. Alone in its paragraph, the quote had no speech tag and no sentence beside it, so the reader gave it to the nearest name, the one she was speaking to. Her next line, with no name in it, got no bubble at all.

`readNarration` now carries the speaker across the line break, never gives a quote to someone it names, and reads an opening pronoun as the subject of the sentence before. See [Stage engine](stage-engine.md). Checked by a throwaway script over the owner's save and ten older saved playthroughs, 92 paragraphs with quotes: 23 changed, each read against its text. 17 lines that had no bubble found their speaker, 4 wrong ones are right, and 2 wrong ones now have none. Those 2 are Wollandora's, in old turns whose character list leaves her out, so the script could not name her. The 19 Covert Cargo paragraphs did not change. Then in the desktop preview on a copy of the owner's save, both lines over Wollandora with her plate. No permanent test was added.

## 2026-10-13, health on the portrait strip

Owner, mid-fight in The Midnight Summons: "the owlbear just struck my character thalbern but i have no way to see my current health". The save held it, 70% and Bleeding, but the desktop app showed it only in the character card, two clicks on a portrait away.

The turn order strip in `components/stage/turn-order.tsx` now draws a health bar under every portrait, green above 75%, yellow to 51%, orange to 26%, red below, the website's four tiers. A hero's portrait carries the number where an NPC's carries its tag. The tooltip gives name, health and status. Checked in the desktop preview against a copy of the owner's save at 70% and at 20%. The small-window layout was not checked. Decided without the owner: NPCs get a bar too, with no number.

## 2026-10-13, concise narration

Owner: "I think our narrative prose is too verbose. Can we keep all the meaningful information and story details while being more concise?" An audit of three saved Midnight Summons playthroughs from 2026-10-03 found the GM's round-end narrative was 53% of the words, at 180 words a time, and the only prose with no length rule. It also retold the round and ran into the next intro. The owner chose to fix the prompt and trim the authored text.

The round-end prompt for the four Myr adventures now limits the narrative to 3 sentences when the encounter continues and 2 when it changes, tells nothing twice, and is shown the next encounter's intro so the bridge stops short of it. The Midnight Summons intros went from 632 words to 513 with every fact kept, both endings are in the present tense, and Wollandora's notes say her briefing is given once. Fixed on the way: a note naming an encounter that does not exist, a rescue threshold stated three ways, and gear in an ending that Thalbern's sheet does not have. The 25% threshold and the sword and dagger were decided without the owner.

`pnpm test:gm-core`, the four bridge checks, batch E, the public flow check and the desktop tests pass. One live replay on the built desktop runtime with Claude, eight turns to the ending: 157 words a turn against 297, and the round end at 36 words against 180, every one within its limit and none retelling the round. One path and one model only.

A second pass the same day, at the owner's choice: an NPC's turn is 2 sentences of narration with its spoken lines extra, a player's action is kept as written or rewritten with nothing added, and a comma before a closing quote no longer gains a space, which had marked every spoken line. A second replay of the same path: 143 words a turn, NPC turns at 53 words against 73, every reply in the story as written. See [the plan](plans/concise-narration.md).

## 2026-10-13, Antigravity replaces the Gemini CLI

Owner: "Google replaced Gemini CLI with the Antigravity CLI". The Gemini CLI has refused personal sign-in since the spike. The desktop app's fourth GM is now `agy`, and `gemini` is no longer listed. Antigravity has no ACP mode, so it runs in print mode over streamed JSON as a custom agent with no tools, written into the session's scratch folder. A tool step, or another agent in `init`, fails the session. The app picks the model from `agy models` at each session start, the Gemini Flash model at medium effort, since the CLI's default took 44 seconds on a one-word reply and the CLI also offers Claude and GPT models. On a scratch save of The Midnight Summons a reply, a roll and a round end played in 38, 12 and 32 seconds. Each GM action is kept as a conversation in the player's Antigravity history, and its docs name no way to turn that off. Not checked in the app itself. Details in [the plan](plans/antigravity-cli.md).

## 2026-10-13, the Game Master picker names the model

Owner: "the game master select should be better designed and should show the full model (e.g. Claude Opus 5.5 medium effort)", then "make the Cancel button be a ghost button". Party setup in the desktop app now lists each installed CLI by the model it runs and its effort, in the site's dropdown. Each CLI is asked what it would run without a prompt, one request per CLI, and the last answers are kept for the next launch. The Claude CLI does not report its default effort, so the app now passes `--effort medium`, taken from the owner's example. Before this it passed none, so the GM's effort on Claude may have changed. Codex stays at low. Gemini's CLI refuses sign-in on the owner's machine and shows by name only. Checked in the WebKit preview, not in the app itself. Details in [the plan](plans/gm-model-picker.md).

## 2026-10-13, the next adventure remembers the last

Owner: "do story memory". Continuing from an ending in the desktop app now writes a chapter for the finished adventure into the new save: its last scenes, who played, the end of the GM's running summary and the threads left open. Chapters add up along the chain whoever the heroes are, so March of Davos is told of all three intro adventures. They reach the GM inside the premise as "THE STORY SO FAR", marked as settled fact that outranks an adventure's notes, and known only to the heroes each chapter names. Replies offered to a player carry only the chapters their hero lived. A hero who goes on keeps their gear, not their wounds. No model writes the recap. March of Davos's docks, warehouse and ledger say what changes if the crate never reached the city. Decided without the owner: no recap call, wounds stay behind, and memory needs the Continue button. Tested with a stub GM only. Details in [the lead-in plan](plans/adventure-lead-in.md).

## 2026-10-13, heroes carry over from one adventure to the next

Owner: "do carry-over". Each intro adventure now names its successor in `nextAdventure`, a field the website already used. The desktop app's ending panel offers "Continue: <next adventure>", which opens that adventure's party setup. Heroes who can go on keep their seats and whoever played them, and the next adventure's suggested party fills the rest: Thalbern goes from The Midnight Summons into Covert Cargo, and the player's own heroes go from The Road into March of Davos. Lyra, Poppen and Thalbern are March of Davos premades, with sheets that say why each came into the city. A hero goes on as a fresh sheet: health, gear and memory do not carry yet. Tried in the app's browser preview, not in the Tauri window. Details in [the lead-in plan](plans/adventure-lead-in.md).

## 2026-10-13, the three intro adventures are stitched to March of Davos

Owner: "the point of these adventures is to lead into march of davos. midnight summons leads into covert cargo leads into Road to Kordavos, then finally into March of Davos the featured adventure." A read of all four found the first link strong and the rest thin: March of Davos never mentioned Covert Cargo's crate or its people, the elves' home had two names, players never heard "Blackthorn" in Covert Cargo, and no ending pointed on. Owner chose story stitching first. The settlement is Faelendar everywhere, the scrollcase carries the Blackthorn seal, the Oath Stone and Silas are in March of Davos's docks, warehouse and ledger, the Road carries the rumor, and each ending names the next adventure. March of Davos assumes the tug got away with the crate. Text only: nothing carries between playthroughs yet. Details in [the lead-in plan](plans/adventure-lead-in.md).

## 2026-10-13, the boat fight most often ends with Lyra overboard

Owner: "Maybe we favor tossing Lyra overboard and they get away. That should be the most likely outcome." Read as Silas and Reinhard getting away with the crate. Battle on the Boat now says so in both men's behavior, in its GM notes and as its first transition. A new encounter, Overboard, has Lyra haul herself out by the gangway while the tug goes downstream, and is where the three heroes most likely meet. It plays on a second pier set with the tug cut out. Likely, not forced: nothing in the engine makes it happen. Not yet played with a live model. Details in [three heroes](plans/covert-cargo-three-heroes.md).

## 2026-10-13, Covert Cargo has three heroes

Owner: "let's make this a three player adventure, with thalbern tracking the ship in a different area than Poppen and they don't know about each other unless they pass d20 checks. The elves that are trading the crate will leave once they have payment." Thalbern is now a third hero, in a thicket on the bank below the stern, about eleven metres from Poppen's bushes. The premise says neither watcher knows of the other, and each pier encounter's GM notes set the Perception check that changes it. The elves leave when paid: the premise says so, and The Transaction's staging walks them off by the gangway and up the trail. Thalbern cannot be both a hero and the rescuer, so the rescue of 2026-10-12 is removed from this adventure, with The Ranger and The Ranger's Aid. That removal was not put to the owner. Staging exits gained `via`. Not yet played with a live model. Details in [three heroes](plans/covert-cargo-three-heroes.md).

## 2026-10-12, Cmd+R reloads the desktop app in development

The app keeps its own copy of the save in memory, so a save edited on disk still shows the old text until the window reloads. Owner had no way to reload it: "this is not a browser". In development builds Cmd+R, or Ctrl+R, now reloads the window. An agent can also reload it by touching `apps/desktop/index.html`, which makes the dev server send a full reload. Checked in the browser preview, not in the Tauri window.

## 2026-10-12, the GM does not ask the players what they do

Owner, in Covert Cargo: a round's narration ended on its own step, "What do Lyra and Poppen do?", which "pulls me out of immersing in the game". The round prompt for wiki adventures had no rule against it, and three of seven rounds in that save ended that way. The prompt now says to end on the story, and `dropPlayerPrompt` removes an unquoted closing question put to the players before the round is saved. Questions a character speaks stay. The interface already asks for each hero's action.

## 2026-10-12, Thalbern shoots from the treeline

Owner, after a Covert Cargo rescue in the app: Thalbern "first appears inside the cabin then all of a sudden silas and reinhard are gone". He should be in the woods near Poppen, kill Reinhard or Silas with one arrow that cannot miss, and tend the wounded after the other flees, over a couple of rounds. The rescue is now two encounters. The Ranger's intro has the arrow kill Reinhard, and Silas flees on his turn. The Ranger's Aid brings Thalbern through the saloon door. An NPC turn can now `flee`, a standee can lie down, stagings have `exits`, and the desktop stage lays out the dead and sends off the fled. Reinhard is always the one shot. Not yet played with a live model. Details in [the rescue plan](plans/covert-cargo-rescue.md).

## 2026-10-11, March of Davos keeps its secrets, and two names are fixed

Owner asked whether March of Davos needs a premise too. It does not: every encounter treats the heroes as one group. Checked with the real GM on throwaway saves at the gate, The Lady and the Bishop, and Face to Face with Silverhand. Twelve runs of the NPCs' turns and the round's end, half with a hero asking outright who leads the Covenant, and six runs of replies offered to a hero. No secret came out in any. The old prompts were not run, so this shows it holds now, not why. Two names changed on the owner's say. Silverhand's sheet was named "Silverhand (Kazimir Raskov)", which put his secret name in every prompt, so it is now "Silverhand". The bishop was "Nicolai" on his sheet and "Nikolai" in one intro, and is now "Nicolai" throughout. See [Adventure premise](plans/adventure-premise.md).

## 2026-10-11, characters know only what the story shows them

Owner, in Covert Cargo: "Lyra and the NPCs seem to have knowledge of Poppen but they should not. Lyra has never met him. No one knows he is there." Nothing told the GM who knows whom, and the narrator names every hero, so a reply offered for Lyra had her shout "Poppen, now!". Every prompt that writes for a character now carries a who-knows-what rule. The rule alone did not fix it, so an adventure page can author a `## Premise`, which reaches the same prompts, the players' side included. Covert Cargo's premise is the owner's statement. With the real GM on a snapshot of the owner's save, offered replies named Poppen 3 of 3 times before and 0 of 3 after. Not checked in the running app. See [Adventure premise](plans/adventure-premise.md).

## 2026-10-11, known spells are cast with Intelligence

Owner was surprised by Lyra's Fog Cloud check: 11 - 1 = 10 against DC 13. The roll's ability bonus came from a short list of spell names in `modifier-utils.ts`, and Fog Cloud was not on it, so she rolled with no Intelligence and only the GM's -1 for the situation. A check named for any spell on the character's own list now uses Intelligence. With it that roll is 13, a success. The DC itself is the GM's choice under "adjust the difficulty based on the type of spell". Owner then chose an easy check for spells nobody resists, DC 5 to 8, in the roll rules of `roll-requirement-service.ts` and `narrative-service.ts`. One run through the Claude CLI with Lyra: Fog Cloud DC 8, Detect Magic DC 8, Light DC 5, Ray of Frost DC 13, Charm Person DC 16. See [Gameplay flows](gameplay-flows.md).

## 2026-10-11, the boat fight no longer leads to The Fake

Owner, in Covert Cargo: after Lyra confirmed the magic and the fight began, the NPCs reacted as if she had called the relic worthless. Battle on the Boat had a transition to The Fake "if Poppen tries to cause a distraction outside the boat or gets spotted". Poppen knocked on the door as the harbor watch, so the GM followed it, and The Fake's intro was added after the elves had left. The transition came from the legacy plan and is removed. The Fake is now reached only from The Shipment. The website's S3 copy of the adventure is not changed.

## 2026-10-11, the host's app runs NPC turns by itself

Owner chose this for hosted games. After a job that changed the game, the host worker queues its own Continue when an NPC, an AI hero, or the round's end is next, before reporting the first job done. A Continue job now also ends the round. Each is queued once, and never when no person has a living hero. Narration that arrives while a player is still reading no longer jumps them forward. Runtime tests only, no hosted game was played. See [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-11, NPC turns run without a click in local play

Owner, at Reinhard's turn: "how come we have to click Continue NPC turn, shouldn't it just automatically do it". No decision stood behind the button. In local play the app now continues on its own once the narration has been read: NPC turns, AI heroes' turns, and the end of a round. New narration is read before the next one starts. A failure is tried once and leaves the button. Checked in the app's browser preview on a copy of the owner's save with the Claude CLI, which caught a first version firing before the new narration was read. Hosted games are unchanged. See [Desktop local play](plans/desktop-local-play.md).

## 2026-10-11, skip a hero's turn

Owner, at Lyra's turn: "Can we get a small Skip button to the left of Send (text only button)". The GM card now has it. A skip marks the hero done for the round, writes nothing into the story, and asks no AI. Local play has a `skip` command and hosted games a `skip` job, which the website's play page also sends. Checked in the app's browser preview on a copy of the owner's save. Hosted play is covered by a runtime test only. See [Skip a hero's turn](plans/skip-turn.md).

## 2026-10-11, untagged quotes go to the sentence's subject

Owner, in The Shipment: Lyra's line showed in a bubble over Silas and on his plate. The paragraph had no speech tag, so the reader gave the quote to the nearest name. `readNarration` now gives an untagged quote to whoever the sentence beside it is about. Checked against 16 paragraph cases by script, not in the app. See [Stage engine](stage-engine.md).

## 2026-10-11, suggested replies in hosted games

Owner kept suggestions automatic and chose hosted games next. A player's page now asks the host's GM for suggestions as a `suggest` job, for a hero that player controls. The host worker writes them through the host's CLI and the replies come back on the job, which both the app and the website's play page read from their polls. Asking again for the same hero and turn answers with the same job. Suggest jobs never mark the GM busy, never show an error, and wait behind players' actions. Checked against the local website and dev Convex with a throwaway Midnight Summons game: the play page asked on its own, the bundled worker ran the job through Claude, and three chips appeared and filled the reply box. Not checked: the app's own play view as host, two accounts, and the host offline. See [the plan](plans/turn-suggestions.md).

## 2026-10-11, suggested replies on a hero's turn

Owner, at Lyra's turn in The Shipment: "could we offer suggestions that the player can accept (will fill in the text area)". The GM card now shows three short chips over the reply box in local play. Clicking one fills the box with a full reply, which the player can edit before Send. The player's own AI writes them from the turn's narrative, the hero's sheet and saved state, and who else is present. It never sees the encounter's GM notes. The request starts when the hero's turn comes up and runs outside the game lock, so it cannot block Send. Checked on a copy of the owner's Covert Cargo save: Claude returned three replies in about 5 seconds, and in the browser preview the chips loaded, filled the box, and enabled Send. Runtime tests, desktop and GM core type checks, GM core checks, and `cargo check` passed. The AI companion's prompt is byte for byte the same. Not yet seen in the packaged app. Hosted games offer none yet. See [the plan](plans/turn-suggestions.md).

## 2026-10-11, table chat in hosted games, and guests can act from the website

Owner: "Do we have chat working so the participants in the session can chat?" Hosted games had none. The play view now has a Chat button that opens the journal's Table chat, live, with a box to send and a count of new lines. The app's lobby has the same chat, and the website lobby shows its chat button in any hosted game. Checking it found that no website guest could reply, roll, or continue: a type re-export in `app/_actions/hosted.ts` broke every action in the file. Fixed, and a guest's reply and roll then ran through the host worker and Claude. The app's own screens were not checked, since computer use was unavailable. Details in [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-11, the host can invite the only hero and watch

Owner: "can we make it possible for me to invite a different player to play the solo adventure and just watch?" Invite showed only for adventures with more than one seat, and a hosted game needed a hero for the host. Now Invite shows on every adventure. A party of one invited hero leaves the host none: the guest plays and the host watches. Start waits for a guest to be seated. Checked on the local website with the test user as host. The app's own screens were not checked, since computer use was unavailable. Details in [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-11, turn cameras stay inside the saloon

Owner, playtesting Covert Cargo's The Shipment: on Lyra's turn the camera went out on deck and looked in through the door. The swing found its first clear view there, five metres back through the open door, and turned her round to face it. A character in a room is now framed from inside the room, past the others there when a spot allows. Lyra's turn frames her from aft over the crate. Checked in `/dev/stage` across the six saloon stagings. Named shots did not move. Poppen's turn in The Crate shows only his head over the crate. See [the stage engine](stage-engine.md).

## 2026-10-10, pushes to main no longer wait for a yes

Owner approved every push that day and agreed to drop the question. `AGENTS.md` now reads "Push changes: allow". This holds during alpha, with work on main.

## 2026-10-10, guests can choose among every hero

Owner, at Covert Cargo's party setup: "there does not seem to be a way to invite a player to be either character in this screen." The last You seat could not switch to Invite. Now it can when another hero is invited. With every hero on Invite, guests choose first and the host plays the hero left, seated when the game starts. On the website, a guest's lobby now shows the host's seat and waits for the host, and only the host can start a hosted game. Details in [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-10, the owner's dev adventures cleared

Owner: "please remove all my test adventures. i want to start fresh." All eight adventures owned by the owner's account in dev Convex were deleted, four hosted that day and four from July to September, after a snapshot export. `deleteAdventureCascade` now also deletes a hosted game's GM jobs. The owner deleted the test user's two adventures the same day. Two audio rows whose adventures were already gone remain. Production was not touched.

## 2026-10-10, the host can remove a seated guest

Owner chose Remove for a seated guest. Before the game starts, the host removes a guest from the app's lobby with an optional note. The seat opens again, the guest sees the note, and that guest needs the host's approval to sit down again. Details in [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-10, any hero seats auto-approve by default

Owner: "let's also have auto-approve be the default". An any hero seat now seats the guest's hero at once. Ask me in party setup turns on the host's approval for the game. The app's lobby opens a guest's hero sheet, from a request or from a guest at the table. A seated guest cannot yet be removed, which matters more now that seating is automatic. Details in [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-10, any hero seat with the host's approval

Owner: an any hero seat, "if allowed on the adventure, host has right to approve or reject with note". Where an adventure takes custom heroes, party setup can add a seat for a guest's own hero. The guest asks to join with one, and the host approves or rejects it in the app's lobby, with an optional note on a rejection. This restores the 2026-10-08 decision that guests may bring their own characters, now behind the host's approval. Details in [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-10, invite a player to a seat from party setup

Owner: "i want to be able to invite another player to play as poppen from this screen". Each party seat is now You, AI, or Invite. An invited seat hosts the game on the website with that hero held, and its link opens to joining as that hero. Checking it found that the website lobby returned 404 to everyone not already in the game, so no invite link had worked. That is fixed for games still waiting for players. Held seats set aside the 2026-10-08 decision that guests make their own characters, and the app no longer starts an open table. Details in [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-10, desktop header matches the website

Owner asked for the app's header to match the website's type, and for the linked account to be the round picture, without tokens, which are being deprecated. The app dropped the Cinzel Decorative 700 face, since the website has 400 alone. `/api/desktop/me` now returns the account picture as a data URL, and the header shows it with a menu holding the account and Unlink. Details in [Desktop site style](plans/desktop-site-style.md).

## 2026-10-10, pnpm dev starts the desktop app too

Owner: "should we just make pnpm dev automatically spin up everything we need". `pnpm dev` now runs Convex, the website, and the desktop app with `D20_SITE_URL` pointed at the local website. `pnpm dev:web` is the old website-only command, used by `pnpm test`, `test:setup`, and `wt:dev`. `pnpm dev:app` starts the app alone against the local website. Quitting the app leaves the website running. `pnpm desktop:dev` still targets d20adventures.com. Not yet run end to end.

## 2026-10-10, work on main during alpha

Owner: "we are back in alpha with no players so can just work off main. eventually when in beta we will do worktrees." Work is committed directly on main, with no feature branches and no worktrees. This replaces the 2026-10-08 decision to use feature branches off main. `AGENTS.md` carries the rule.

## 2026-10-10, open branches merged into main

Owner asked for everything on main and the old worktrees and branches removed. Merged `feature/desktop-site-style`, `feature/covert-cargo-rescue`, `feature/host-mode`, and the desktop spike's last log entry. Host mode is on main but not shipped. The Convex lockdown and Anthropic's answer on provider terms still gate it, and the app's hosting screens have not been tried in the running app. Removed the gm-core, stage-turn-mock, and desktop spike worktrees, and deleted every merged local branch. The worktrees' Convex projects still need deleting in the dashboard.

## 2026-10-10, host mode resumed

Owner resumed host mode to invite a browser player from party setup. Merged `main` into `feature/host-mode` for review in the running app.

## 2026-10-10, desktop site style plan

Owner: the desktop app's UI is too different from the website, and the website's design is preferred. An audit found the app and the site share only the display font, the d20 painting, and the epic button. The site is black, blue, indigo, and amber with mono labels. The app is brown, gold, and cream, because its screens were built from the stage HUD's parts. The plan moves the app to the site's tokens and components in four phases, with the HUD last and reviewed over every set first. The owner chose the three defaults the same day: restyle the HUD too, add the site's parchment header outside play, and keep the 3:4 module covers in the site's card frame. See [Desktop site style](plans/desktop-site-style.md).

Implemented the same day on `feature/desktop-site-style`: one shared theme stylesheet for the website and the app, the site's header on every screen outside play, and the title screen, pages, New game, hero creator, and hosted lobby in the site's look. The HUD's colours and surfaces changed in one commit, so it reverts in one step. HUD type, literal colours, and components wait for the owner's review over each set. The desktop app also opens in a browser tab in development now, for screen checks without Tauri.

Owner, same day: the Adventures page keeps three intro adventures in a row with the featured adventure full width below, and it is the one place to choose an adventure. Begin on the title screen opens it, and party setup lost its row of adventure tabs.

Owner, same day: "put this branch on main. let's work on main". `feature/desktop-site-style` merged into main and was deleted. The rest of the desktop site style work is committed on main.

## 2026-10-10, Covert Cargo rescue and no player deaths

Owner found Covert Cargo badly balanced and asked for Thalbern to step in when anyone falls to half health, with no player deaths in this intro adventure. Decided: two authored manifest rules enforced by the GM core, `playerDeath: false` and `rescue`, because the GM never sees health numbers when it picks the next encounter. Covert Cargo gains Thalbern as an NPC, the encounter The Ranger, and rescue transitions from its five boat encounters. Implemented on `feature/covert-cargo-rescue`, not merged or deployed. GM core, wiki adventure, stage and 42 desktop checks pass. No live model play-through yet. See [the plan](plans/covert-cargo-rescue.md) and [the contract](wiki-adventures.md#safety-rules).

## 2026-10-10, removing saved adventures

Owner asked how to end an adventure. Starting a new one already keeps the old one under Your Adventures. Added Remove, with a confirm step, on each saved adventure. It deletes an archived save, or the current one, after which no adventure is current.

## 2026-10-08, desktop title screen and pages

Owner review of the desktop home: it now opens on the website's title screen, the d20 painting with "Experience the Thrill of the D20", Continue for the saved adventure, and white outline buttons. Adventures, Characters and Settings are separate pages styled after the website. The Realm of Myr card's Explore opens the website's setting page, so the app no longer has its own Realm page. This replaces the shelves under a live-scene banner in [the home screen plan](plans/zzz-completed/feature-desktop-home.md).

## 2026-10-08, host mode paused

Owner paused host mode to get the game right before hosting. Its work stays unmerged on `feature/host-mode`. See [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-08, host mode built on `feature/host-mode`

Owner asked to work in branches off main, not worktrees. Built on `feature/host-mode`: hosted website games whose GM jobs run in the host's desktop app through the host's CLI, a job queue in Convex, device-token host routes, the host worker, hosting screens in the app, and a stage-first play page for guests that shares the app's play view. An end-to-end run against the dev server processed a host's reply through Claude. Convex lockdown and the app's hosting screens in the running app remain. See [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-08, desktop home screen merged; guests get Stageview

The desktop home screen merged into main from `feature/desktop-home`: saved adventures with resume, heroes, new adventures and a Realm of Myr page built from the website's setting data. Owner review found cover titles overflowing small covers. Cover type now scales with the cover. See [the plan](plans/zzz-completed/feature-desktop-home.md). Owner chose the stage-first 3D view on the website for host mode guests, ahead of today's text turn page. See [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-08, host mode through the website only

Owner dropped the home Wi-Fi mode: friends join a hosted game through the website. The host's copy of an adventure covers the table, and guests make characters with the website's existing character creation. See [Desktop host mode](plans/desktop-host-mode.md).

## 2026-10-08, desktop home screen and host mode

Owner asked for a general home screen in the desktop app: start an adventure, learn about the setting, see adventures you play in or run, and your characters. Chosen layout: library shelves under a Continue banner over the live scene. Realm content reuses the website's setting data, shipped with the app. Owner also chose to start host mode now rather than after the home screen. The home screen is in progress on `feature/desktop-home`. Host mode is planned in [Desktop host mode](plans/desktop-host-mode.md), with guest identity, adventure ownership, guest heroes, relay transport, and provider terms open.

## 2026-10-08, alpha store scope and desktop linking

Owner set the store work as alpha: web checkout waits until at least beta. Every adventure is free in alpha, with March of Davos shown at $5 crossed out, so no grant tool is needed. Playing needs a linked account, alpha included. Implemented on `feature/adventure-store`: the catalog and entitlements, and linking the desktop app to a website account with a code approved on the website, the token in the Keychain. Not merged or deployed. See the [Adventure store plan](plans/feature-adventure-store.md).

## 2026-10-08, stable signing for desktop dev builds

Owner was re-approving Keychain access after every desktop rebuild. Debug builds were ad-hoc signed, and that signature changes each build. They now sign with the owner's Apple Development certificate before launch, so one "Always Allow" lasts. See [Desktop local play](plans/desktop-local-play.md#phase-2-desktop-shell-and-stage-first-play).

## 2026-10-07, selling adventures

Owner chose to make money by selling adventures rather than a host subscription. First-party adventures sell first, and a creator marketplace with a revenue cut comes later. Solo play and host mode are free. Host mode lets one player's app run the GM through their CLI while friends join from a browser. This replaces the 2026-10-01 server-GM token subscription for multiplayer. Estimated relay and asset cost is 1 to 5 cents per hosted game. A paid host subscription would have charged for a feature powered by the host's AI subscription. See [Desktop local play](plans/desktop-local-play.md#owner-decisions) and the [Adventure store plan](plans/feature-adventure-store.md).

Found while planning: the token ledger's Convex mutations are public and accept any user id. Recorded in [Maintenance](plans/maintenance.md).

## 2026-10-05, dice sounds

Owner chose a dice sound as the die lands. Rolls now clatter, land with a tock and end on a short cue for the verdict, all made in Web Audio. Scene settings has a sound switch. See [the plan](plans/roll-results.md).

## 2026-10-05, dice rolls as the hero of the narration

Owner wanted better graphics for roll results: "This is D20 adventures so the dice rolls are the hero." A roll in the narration was one sentence of numbers. It now shows the roller, a 3D d20 that tumbles and lands on the roll, the total against the DC, and a stamped verdict, with natural 20s and 1s called out as criticals. See [the plan](plans/roll-results.md).

## 2026-10-05, saloon wood and windows

Owner found the wood short of the paintings' detail and chose windows with depth. Four wood textures were painted from the interior paintings, and the saloon's windows became real openings with one-sided glass: warm from outside with the room showing through, clear from inside onto the night. See [the stage engine record](stage-engine.md#saloon-wood-and-windows-2026-10-05).

## 2026-10-05, the saloon raised to the art

Owner found the boat's interior below the quality bar. Against the crate, battle and fake paintings it was evenly lit, with flat blue window panels, striped thin timbers and box lanterns. Sets can now declare rooms that dim the sky's light and switch to their own lamps while the camera is inside. The saloon was rebuilt with upright red-brown boards, ribs, deep beams and knee braces, framed and shuttered windows, iron-bound posts, ship's lanterns, a studded porthole door, a chart table and gauges. See [the stage engine record](stage-engine.md#rooms-and-the-saloons-finish-2026-10-05).

## 2026-10-05, Covert Cargo's meeting inside the boat

Owner asked to check the 3D against the adventure's source and art. The source's later encounters put everyone in the cabin, while The Shipment's intro left the escorts on the pier and Poppen in reeds. Owner chose the logical staging: the whole meeting in one larger saloon, the elves guarding the deck, Poppen in the bushes at the treeline, and four intro lines edited to match. Every boat encounter now plays in that saloon, and walks route through its door. See [the plan](plans/covert-cargo-boat-meeting.md).

## 2026-10-04, the crate inside the tug

Owner pointed out that Covert Cargo's crate belongs inside the boat, as in the original art. The tug's saloon is now a room with an open door. Lyra opens the adventure inside it with the crate before her, and the camera looks over the crate at her. Aelar is offstage until the narration opens the cabin door, then walks out of it. See [the stage engine record](stage-engine.md#covert-cargos-crate-inside-the-tug-2026-10-04).

## 2026-10-04, speech bubbles for every speaker

Owner asked why some characters got speech bubbles and others not. A bubble needed a paragraph that named exactly one character. Speakers now come from the speech tag beside each quote, including pronouns and unnamed descriptions such as "the elf", so every quoted line in Covert Cargo's opening gets its speaker's bubble and plate. See [the stage engine record](stage-engine.md#narration-shots-2026-10-04).

## 2026-10-04, narration follows who each paragraph is about

Owner found the camera stayed wide on a paragraph about Lyra and the Continue and Skip buttons wrapping. Narration views now read names and pronouns across paragraphs, so a paragraph about Lyra frames Lyra, and a newcomer introduced without a name is not mistaken for the last character. The buttons keep to one line with drawn arrows, and long narrations get smaller progress dots. See [the stage engine record](stage-engine.md#narration-shots-2026-10-04).

## 2026-10-04, covers edge to edge, the camera follows the narration

Owner asked for covers with the art edge to edge and less text, reported the Lyra view blocked, and expected Continue to change the view with the story. Covers now carry only the title and the player count. Each paragraph of narration picks a view from the people it names or the place it describes. Named character shots swing clear of cabins, and characters turn toward a camera that had to swing round them. Poppen's reed shot looks over his shoulder at the pier. See [the plan](plans/desktop-module-covers.md#owner-feedback-same-day).

## 2026-10-04, module covers for the desktop New game screen

Owner asked for adventure art that feels like a D&D module. Each bundled adventure now has a painted portrait cover in the manner of a classic module, framed in our own trade dress with a module code, colour band, title and player count, beside the party setup. Covers come from the checked-in `scripts/adventure-covers.ts`. See [the plan](plans/desktop-module-covers.md).

## 2026-10-04, desktop heroes and Covert Cargo merged into main

Owner merged `feature/desktop-heroes` into main as `5baadf7` with `wt:finish`. It brings hero creation, the local roster and AI companions, all four Myr adventures in the desktop app, and Covert Cargo in 3D with painted textures, leaf cards, water reflections and character shots that swing clear of walls. Both plans are archived under [plans/zzz-completed](plans/zzz-completed/feature-desktop-heroes.md). The worktree's Convex project still needs deleting in the dashboard.

## 2026-10-04, Covert Cargo release check

Release builds passed with no warnings. In the packaged app the play view ran at a median 51 to 52 fps on the pier and 58 in the cabin and on the riverfront, balanced tier, with the machine swapping. The check found turn cameras inside the tug's saloon and behind the cabin wall. Character shots now swing round the character until the view is clear, and the cabin walls are solid. A rebuilt app showed both turns framed cleanly. See [the plan](plans/zzz-completed/covert-cargo-3d.md#release-check-2026-10-04).

## 2026-10-04, Covert Cargo speed pass

Owner asked to bring the river scenes back up. A frame bench found leaf drawing, leaf shadows in a 4096 map and the reflection as the main costs. Leaf cards no longer cast shadows on the pier, its shadow map is capped at 2048, leaf masses use fewer cards, painted wood is cheaper, and the reflection skips small growth. The river view went from 1.82M to 1.09M triangles. Balanced reads 66 fps and high 40 to 48 on a busy dev machine, with no visible change. See [the plan](plans/zzz-completed/covert-cargo-3d.md#speed-pass).

## 2026-10-04, Covert Cargo water reflections, rounder and wider tug

Owner picked water that reflects the boat and its windows, a rounder, taller cabin like the painting, and a wider boat. Stageview gained a tier-scaled planar reflection for water that opts in, so lit windows streak down the river as in the art. The tug is 5.6 m wide with a curved saloon bow of windows, a 3 m cabin and an overhanging upper deck. See [the plan](plans/zzz-completed/covert-cargo-3d.md#fifth-pass-reflections-a-rounder-cabin-a-wider-tug).

## 2026-10-04, Covert Cargo leaf cards, crate hold, bigger tug

Owner picked painted leaf cards, the crate hold's ropes, chains and posts, and a bigger boat. Crowns and bushes are now clusters of painted leaf cards, which cut the pier's triangles by more than half and paid for much denser woods. The cabin has knotted ropes, chains and iron-banded posts round the crate. The tug is 17 m. Within budget at 1.15M triangles. See [the plan](plans/zzz-completed/covert-cargo-3d.md#fourth-pass-leaf-cards-the-crate-hold-a-bigger-tug).

## 2026-10-04, Covert Cargo painted textures, crate, hillside and fog

Owner asked for wood like the art, a mossy wooded hillside beside the boat, a lot of fog, and a bigger, cooler boat and crate. No Blender or Godot was needed. Textures are painted from the art with the standee image model and wrapped along each board's grain. New detailed crate, a bigger tug, a heightfield hill with dense foliage and moss curtains, fog that starts 14 m out, and mist banks. Within budget at 2.42M triangles. Foliage shape and water reflections remain the main gaps. See [the plan](plans/zzz-completed/covert-cargo-3d.md#third-pass-painted-textures-props-hillside-fog).

## 2026-10-04, Covert Cargo boat and light matched to the art

Owner said the boat and lighting should match the art more exactly. The `riverboat` builder is now the painted tug with a lofted hull, lit saloon and glazed pilothouse. Sets gained static point lights. The pier is saturated blue with warm lamp light. The cabin is neutral and dim with warm lanterns and a teal door. Water reflections of the windows remain a gap. See [the plan](plans/zzz-completed/covert-cargo-3d.md#owner-feedback-second-pass).

## 2026-10-04, Covert Cargo in 3D

Owner asked for the two-player adventure as a full 3D experience from its art. On `feature/desktop-heroes`: every Covert Cargo encounter now has a scene. The Mordava pier before dawn, the riverboat's lamplit cabin, the Kordavos riverfront and an old forest path, with standees for Reinhard, Silas, Aelar and the two elven crew. New `riverboat`, `pier`, `ship`, tree moss and `ancient` tree builders. A checked-in generator writes the sets. Renders match the art's key frames and stay within budget after trimming the pier from 3.2M to 1.8M triangles. The desktop maps all nine encounters and its tests pass. The packaged-app check waits on an unlocked screen. See [the plan](plans/zzz-completed/covert-cargo-3d.md).

## 2026-10-04, desktop heroes, AI companions, and all four adventures

Owner chose stock figures first with art painted through Codex or Grok as an upgrade, You or AI per hero with AI as the default, and a short creation flow. On `feature/desktop-heroes`, unmerged: the desktop app bundles all four Myr adventures, keeps a local hero roster, drafts a hero from race, class, name and an idea in one CLI call, and starts a party of premades and roster heroes within each adventure's rules. AI heroes play through the core's companion path. Scenes map any party onto their slots. Fourteen stock standees and four premade standees were painted with the checked-in `scripts/stage-standees.ts`. Paint makes a hero's standee through the player's own Codex or Grok, keyed locally. With live Claude, The Road to Kordavos played to its end with two created heroes, one played by the AI. The packaged app showed a Grok-painted hero at the Kordavos gate and ran an AI turn. See [the plan](plans/zzz-completed/feature-desktop-heroes.md).

## 2026-10-03, desktop Stageview merged into main

Merged `feature/desktop-stage-play` into main as `e96a0de` with `wt:finish`. It brings the desktop app, the shared GM core, the stage package, both adventures' 3D sets and the Midnight Summons art. The branch plan is archived at [plans/zzz-completed](plans/zzz-completed/feature-desktop-stage-play.md). Remaining work is distribution, more 3D sets, and character creation. The worktree's Convex project still needs deleting in the dashboard.

## 2026-10-03, GM decisions see the whole round, every Midnight Summons branch played

Playing the last untested branches found that the GM's move-on decision saw only the last paragraph of the current round, so an NPC reply hid the player's action. That stalled Meeting at the Stones and explains earlier rounds held past an authored exit. The shared core now gives the decision the whole round, which also fixes web play. A live desktop run then hid from the owlbear, reached The Missing Relics, and ended in 7 rounds. Two content typos are fixed. Bleeding stays a label. See [the fix and run](plans/zzz-completed/feature-desktop-stage-play.md#gm-decision-sees-the-whole-round-2026-10-03).

## 2026-10-03, Standing Stones matched to the art, neutral night light

Owner feedback asked for neutral light, more ground detail, and stones much closer to the source art. Night sets now use a white camera fill and a neutral paint grade. New world-painted `rock`, `meadow`, `grass` and `water` materials and `flagstones`, `grass` and `mountain` builders give the ground and stones real detail. The Standing Stones were rebuilt and recomposed from measurements of the art, with the moon over the valley. Follow-up: darker night skies, a wider river, and Wollandora regenerated much closer to her art, with neutral night grading for characters too. The owner approved it, and all seven scenes rendered without errors in a release build. See [the art pass](plans/zzz-completed/feature-desktop-stage-play.md#standing-stones-art-pass-2026-10-03) and [authoring lessons](stage-authoring.md#lessons).

## 2026-10-03, first forest set and the 3D authoring pattern

Added a moonlit Valkarr forest trail for three Midnight Summons encounters, with woodland builders, a foliage material, night sky support, and standees for Thalbern, Wollandora, and the Owlbear. Recorded the authoring pattern: review on the web viewer first, then one check in the desktop app. See [Stage set authoring](stage-authoring.md).

## 2026-10-03, Midnight Summons fixes in the shared core and content

NPCs that skip or pass keep their real status instead of "skipping" or "passing". The progression rule now moves on once events satisfy a listed transition and waits only for unmade player choices. Live replays advanced after the owlbear evasion and still waited at the meeting. Wollandora's greeting fits either arrival, and a Back Home typo is fixed. Both core changes also apply to web play. See [the fixes](plans/zzz-completed/feature-desktop-stage-play.md#midnight-summons-fixes-2026-10-03).

## 2026-10-03, The Midnight Summons played to the end on desktop

The desktop app now bundles The Midnight Summons beside March of Davos, and New game picks the adventure. In the packaged app with live Claude, Thalbern finished the adventure in 7 rounds, including a three-round owlbear fight with an attack, an evasion, and Animal Handling, then the ending and starting over. The run found and fixed an end screen with no way forward. A second run had Thalbern beaten to 10% health, rescued by Wollandora, and refuse the mission, reaching the Back Home ending in 11 rounds with his wounds carried through. Open findings are an NPC status left as "passing", rounds the GM extends past an authored exit, an authored greeting that ignores the rescue, and a content typo. Fourteen desktop tests, typechecks, lint, and release builds passed. Details: [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md#the-midnight-summons-2026-10-03).

## 2026-10-03, desktop New game and archive

A finished or unwanted adventure could not be replaced without deleting the save file. The desktop app now opens on a title screen with Continue and New game, and a Menu button returns to it. Starting over archives the old adventure in the same SQLite file and transaction. Twelve desktop tests, typechecks, lint, a release build, and a packaged-app check on an isolated save passed. See [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md#new-game-and-archive-2026-10-03).

## 2026-10-03, Harvest Festival desktop scene

Resumed the handoff in `feature/desktop-stage-play` with owner decisions: keep four Codex drafts, regenerate Karim in Blackthorn black and gold, generate backs with the gate pipeline, keep performers on the ground in front of a low stage, and run the full native check. Added the Kordavos harvest square set and Harvest Festival staging, an encounter-to-scene map for desktop, festival map staging for the GM, and content-id cast ids so the unrelated `liora` NPC cannot collide. Engine additions are solid primitives, named stall goods, a ground `roads` flag, shared walk checks, and walk checks in `stage:check`. Native testing found and fixed a walk that stalled while the window was covered.

Eleven desktop tests, TypeScript, scoped Biome, `stage:check`, browser renderer checks at DPR 2, and two release builds passed. The packaged app with live Claude advanced from the gate to the festival on its second round, switched sets, focused and opened Madam Zephyra, saved Yeva's and Branka's walks, and reopened without replaying them. The user save was restored unchanged. Details: [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md#festival-results).

## 2026-10-03, Harvest Festival handoff

Owner initially authorized the second desktop 3D scene, then stopped generation and requested a handoff. Only planning documents changed. No scene, staging, runtime, or UI code was written, and no new build or tests ran. Five character-image requests had already completed before cancellation was checked. Their paths and prompts are recorded in [the handoff](plans/harvest-festival-handoff.md). They remain unreviewed outside the repo and are not integrated. Work remains isolated on `feature/desktop-stage-play`.

## 2026-10-03, desktop character-state application

Connected structured character patches to live desktop state in `feature/desktop-stage-play`. Health, status, item transfers, effect changes, and spell use now commit with the new turn. Encounter changes preserve the party's live values instead of replacing them with premade defaults. NPC state is remembered, old roll flags clear, effects expire once per round, and spells recharge on encounter changes. Character cards show the current saved values and GM requests receive them as context.

New CLI advancement responses require explicit operations or an empty character-update list. Invalid references get one correction, then reject the turn without partial writes. Older saves remain readable, with no automatic replay of ambiguous prose notes or changes to historical turn snapshots. Shared schemas accept both historical notes and typed operations. Web application semantics remain unchanged.

Eight desktop tests, shared core/server regression checks, root/package TypeScript, scoped lint, and a native release build passed. A temporary native fixture visibly showed a new item, 65% health, a timed effect, and a used spell. The original empty save was restored. This follow-up does not establish full combat or all-provider coverage. See [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md#character-state-follow-up-2026-10-03).

A separate live Claude check advanced an isolated fixture to the festival, returned an explicit add operation, and persisted the Bronze gate token in Cassia's equipment. No user save, production data, or web gameplay was changed by the check.

## 2026-10-02, desktop release build

Ran `CARGO_BUILD_JOBS=2 pnpm tauri build` in `apps/desktop-spike` at the owner's request. Vite and the optimized Rust release build passed. Rust compilation took 2 minutes 48 seconds. Output: `apps/desktop-spike/src-tauri/target/release/d20-desktop-spike`. Bundling remains disabled, so no `.app` or installer was produced. The executable was not launched in this check. macOS memory pressure rose from normal to warning during compilation and remained at warning immediately afterward.

## 2026-10-02, desktop Stageview and real local turns

Implemented `apps/desktop` in the isolated `feature/desktop-stage-play` worktree, based on main plus the committed GM core branch. Extracted the renderer to `packages/stage` and retained the web demo. The Tauri client bundles March of Davos, stage assets, fonts, and a Node game worker. It uses the player's installed AI CLI, the shared GM core, and SQLite. Actions, dice, NPCs, authored transitions, journal, camera controls, and player movement are connected to real state. The gate has a 3D set. Later encounters use story view.

The packaged native Claude playthrough covered a failed Persuasion check, natural die persistence, no-roll replies, an NPC response, the gate-to-festival transition, and reopening the saved festival turn. The native renderer reported ready with no JavaScript errors. Three integration tests, root/package typechecks, scoped Biome, renderer content checks, frontend build, Next production build, and macOS release build passed. Details are in [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md).

Local saves preserve retry checkpoints and reject stale input. The die is saved before inference. CLI errors cannot commit inherited fallback prose or silently skip a required check. World-state patches receive strict nested validation. Current core behavior still records character patches without applying inventory/effect changes. Only Claude and the social gate encounter were tested natively. One save slot, four premades, Node 24+, CLI sign-in, and unsigned distribution remain explicit limits. No production data changes, push, or merge into main.

## 2026-10-02, shared GM core extraction

Completed phase 1 locally in `feature/gm-core`, based on spike commit `7ff0b2d`. The pnpm workspace now contains `packages/gm-core`. Twenty gameplay service modules, eight character-generation operations, reply/roll/advance orchestration, shared schemas/types, and pure helpers use typed per-instance interfaces. `lib/gm-server` supplies the current model, billing, Clerk, Convex, content, and narration adapters. Existing server action and import paths remain compatible. No UI or Convex schema changes were needed. The strict-state and combined-call spike experiments were not promoted into the web runtime.

Standalone package TypeScript and browser bundling passed without Node or web dependencies. Regression checks matched every prompt, schema, and recorded write in the seven-call pre-extraction GM turn, plus nine character-generation cases. Access, companions, independent runtimes, stale/duplicate/invalid transitions, content re-pinning, completion, retries, sanitation, and billing errors passed. Root TypeScript/lint, wiki batches A through F, four adventure bridges, public flow checks, and the Next production build passed. Root lint reported only two existing informational suggestions in unrelated scripts.

All 16 Playwright tests passed against the isolated worktree after installing the matching Chromium and supplying Portless's local CA. An authenticated browser completed The Midnight Summons in seven turns on `patient-shepherd-476`, using the real `gemini-3.5-flash-lite` server adapter. The run covered failed and successful rolls, combat, NPC initiative, health changes from 100 to 80 to 60, no-roll NPC dialogue, encounter transitions, and final health 100. The ending UI and a fresh Convex read confirmed `status: completed`, an end timestamp, and `currentEncounterId: preparing-for-the-city`.

The server and test browser were stopped. No push, merge, or production deployment was performed. One live adventure does not establish multiplayer, speech generation, or desktop reliability. The desktop shell is the next implementation step. Contracts and detailed evidence are in [GM core](gm-core.md), the [extraction plan](plans/feature-gm-core.md), and [desktop phase 1](plans/desktop-local-play.md#phase-1-extract-gm-core).

## 2026-10-02, desktop state validation and pre-roll batching

Completed the authorized refinement in `spike/desktop-local-play`. Both native trial variants derive a strict nested model contract from the real adventure-patch schema and execute the real wiki commit handler over an in-memory database. Every accepted field survived in all eight runs. Invalid fields now trigger a correction in the spike instead of silently disappearing. Character updates are retained in the saved turn patch, but the existing game code does not apply them to live character fields. That remains explicit follow-up work.

Combining player formatting, roll selection, and situational modifier reduced seven CLI requests to five, with the dice result still supplied separately. Claude's full turn changed from 23.149 to 22.528 s, Codex from 40.516 to 26.114 s, and Grok from 103.632 to 86.015 s. Native dice-readiness render times changed from 8.800 to 4.297 s, 14.532 to 6.756 s, and 52.735 to 24.187 s. Initial action text did not improve for every provider. The API text baseline changed from 13.390 s with five JSON-format retries to 6.523 s with one retry. These are single paired samples, not a stable latency benchmark.

Claude and Grok saved richer state and advanced to the festival. Codex supplied summary-only patches and remained at the gate, omitting the fee waiver from its advancement summary. The API baseline invented some scene details. JSON validity and field retention therefore remain separate from narrative continuity and referential integrity. Gemini compatibility was not retested and does not block the other adapters.

Recommendation: proceed to core extraction, retain both request paths, and use Claude for the first interactive demo while keeping Codex and Grok selectable. Apply character state and add broader gameplay coverage as the desktop is built. Ten focused tests, root TypeScript, scoped Biome, Rust checks, packaged native trials, render instrumentation, and exact-prompt/saved-state replay passed. See [phase 0](plans/desktop-local-play.md#strict-state-and-fewer-requests-2026-10-02). Changes committed locally, with no web app changes, push, merge, CLI credential access, or production mutation.

## 2026-10-01, desktop persistent adapters and complete turns

Completed the follow-up in `spike/desktop-local-play`. Codex app-server and Gemini/Grok ACP adapters now launch with existing CLI homes and sign-in. User-configuration loading no longer rejects a provider. The native comparison passed both existing schemas on first answers for Claude, Codex, and Grok, using two requests in one persistent session each. Progression took 3.725 s, 11.678 s, and 20.464 s, respectively, versus 0.941 s for the API baseline. No observable model tool calls or host-operation requests occurred in the successful trials.

A complete contested-social turn ran through the real player formatting, reply, roll, NPC, and current wiki advancement services, with in-memory storage and authored source. Claude, Codex, and Grok each completed seven calls with no retries and advanced to the festival. Total times were 31.474 s, 59.437 s, and 252.396 s. The `gemini-3.5-flash-lite` text API comparison completed in 8.291 s with ten requests, including three bare-JSON correction retries. This baseline did not use the web app's provider-enforced structured-output mode.

Gemini CLI 0.60.0 initialized ACP but the provider rejected its personal-login path with error `-32000`, saying the client is no longer supported for Gemini Code Assist for individuals and directing migration to Antigravity. No GM inference occurred. No CLI credentials were inspected, copied, or migrated. This is an observed account/client failure, not the withdrawn settings gate or a universal statement about Gemini accounts.

The turn audit found a concrete schema issue: the top-level wiki response leaves `adventurePatch` as `z.unknown()`. All three CLIs supplied invalid nested transition fields and the existing service used its summary fallback, losing proposed structured world-state updates. The baseline patch parsed with some provided fields discarded. Offline replay matched every live prompt exactly and recorded the post-validation patch without new inference. No web app fix was made in this spike.

Recommendation: **go for further local-play development with the three working adapters.** Resolve Gemini compatibility, structured world-state output, and serial-call latency before broader support or release claims. Combat, AI companions, usage limits, production auth, and real persistence remain outside this turn fixture. The earlier art and native sign-in/connectivity evidence remains available. The follow-up launch was signed out, so persistent Clerk sign-in is not established.

Validation passed for five focused tests, scoped Biome, root TypeScript, Rust formatting and Clippy, a packaged Tauri build, native runs, and exact-prompt replay. Results, per-call timing, source hashes, and limits are in [phase 0](plans/desktop-local-play.md#phase-0-spike). Changes are committed locally. No push, merge, production mutation, or web app change.

## 2026-10-01, desktop isolation requirement reconsidered

The owner challenged the blanket ban on user settings, tools, and MCP as a prerequisite for local CLI support. Restrictions need a concrete basis. The earlier no-go and Claude-first recommendation is withdrawn. All four providers remain in scope.

The first spike established missing ignore-settings controls, not a gameplay failure or unavoidable unwanted action. Codex, Gemini CLI, and Grok GM modes were skipped before inference and remain untested. Their saved `blocked` statuses describe the former trial rule, not a failed provider benchmark. Claude's measured success and the image and webview results remain valid.

The [revised phase 0 basis](plans/desktop-local-play.md#revised-basis-for-restrictions-2026-10-01) calls for testing output quality, JSON validity, latency, and relevant execution controls. A documented unwanted action can justify a narrow restriction. Configuration loading alone cannot. The app must still leave CLI credentials entirely inside the installed CLI.

Updated the plan, roadmap, indexes, worktree status, and spike README. This is a documentation and interpretation correction. The existing harness still applies its original gate, and the three missing adapters and live trials remain work to do. No runtime permissions changed and no new model calls ran.

## 2026-10-01, desktop phase 0 findings

The recommendation in this entry was superseded by the reconsideration above. Measurements are unchanged.

The isolated Tauri spike is in `apps/desktop-spike/` on `spike/desktop-local-play`, created with the approved worktree script. Its empty Convex project is `d20adventures-spike-desktop-local-play`, deployment `gallant-squirrel-646`. No web app, root dependency, shared schema, billing, production data, or CLI credential changes.

Claude Code 2.1.287 ran an authored Kordavos progression fixture from the real prompt service and a separate roll-schema probe in one persistent process. Its startup reported no tools, settings-derived capabilities, skills, plugins, or MCP. Progression took 4.180 s, including 0.781 s initialization. The second request took 1.451 s. Both passed the existing zod schemas on the first answer, one inference request each. The `gemini-3.5-flash-lite` API baseline passed in 2.283 s and 0.615 s. Claude was more vivid and slightly better grounded in this one sample. A complete gameplay pipeline was not measured.

Codex app-server, Gemini ACP, and Grok ACP were detected but blocked before GM inference. Their tested versions did not provide a verified way to ignore user settings while preserving existing CLI sign-in without handling credentials. No GM latency or quality result exists for those three. Claude also needed explicit built-in plugin overrides beyond safe mode. The final locator bypasses GUI PATH wrappers by preferring known installed binaries.

Codex generated a portrait in 44.022 s and a front/back sheet in 48.073 s. Grok took 12.799 s and 13.863 s. All now have locally removed backgrounds and split standees. Three used chroma key. Codex ignored the standee's green-background instruction, so local macOS Vision supplied the mask. Visual review found usable silhouettes, some hair-edge fringing, and portrait-to-standee detail drift.

Clerk signed in the existing test account in the packaged `tauri://localhost` webview through a single-use development ticket. The Convex React WebSocket connected and the real query resolved against the empty isolated database. OAuth redirects and authenticated Convex JWT authorization remain untested. No session secrets were saved in evidence.

Recommendation: **no-go for the four-provider GM promise under the current isolation rules, conditional go for a Claude-first follow-up if the owner accepts narrower support.** The four-provider execution requirement remains unmet. This does not change the owner's product scope or authorize a web migration. The [phase 0 results](plans/desktop-local-play.md#phase-0-spike) contain metrics, source and artifact links, limitations, and the next gates.

Validation passed for three focused tests, scoped Biome, root TypeScript, Vite production build, Rust formatting and Clippy, a packaged debug Tauri app, native UI trials, and local segmentation. Changes are committed locally. Nothing was pushed or merged. The worktree and isolated Convex project remain for review.

## 2026-10-01, stage-first turn page demo merged

The scripted gate-scene mock (`feature/stage-turn-mock`, 2026-09-29 to 10-01) is merged and public at `/demo/kordavos` for feedback. It makes no model calls and is noindexed. Owner decisions made along the way are recorded in [Stageview](plans/stageview.md#product-decisions):
- Mapview is for larger maps.
- Turns work like Baldur's Gate 3, with movement as game state, coming from the written action.
- The narration stays as text, stepping through by default.
- Intros are staged and belong to the adventure plan.
- Rolls can interrupt a resolution, as contests.
- The scene is played as written: the party meets in line, then faces the sergeant.

Evidence:
- The narrative-to-movement eval scored 8/8 on the gate scene with `gemini-3.5-flash-lite`.
- Full step-throughs of both pickpocket outcomes ran with no console errors.

Details: [Stage-first turn mock](plans/feature-stage-turn-mock.md).

## 2026-10-01, desktop local play direction

Owner proposed a Tauri desktop app that becomes the only game client. Web play is deprecated once it ships. Solo play is free and runs the GM through the player's own installed AI CLI and subscription, including Claude Code, Codex, Gemini CLI, and Grok. Multiplayer keeps the server GM and is paid by a subscription granting tokens at roughly current pricing. Narration is an optional player-supplied voice provider. Players generate characters or use premades. The audience is AI-savvy tabletop players, and requiring a CLI is acceptable. Distribution is a notarized direct download. Local content is authored adventures with pre-baked art.

Anthropic's Claude Code legal page, read the same day, permits an end user signing in to the unmodified Claude Code binary with their own subscription. The app must not touch credentials, intermediate usage, or use the Agent SDK for subscription play. The owner accepts the terms risk for the other CLIs.

Game logic moves into a shared TypeScript package for the server and desktop. Stageview's stage-first turn page will be built in the desktop app, not the web app. Local players supply art and narration through their own CLIs or keys, with no tokens. Voice provider is TBD. Authoring moves into the desktop app, and admin stays on the web. Phones are TBD, and focus is desktop. No code was written. See [Desktop local play](plans/desktop-local-play.md).

## 2026-10-01, wiki reconciliation

- Audited plans against local main and Git history. Rebuilt the dashboard around active Stageview work, maintenance, and reference guides.
- Removed 26 completed planning documents and seven obsolete comparison images. Preserved engine details in [Stage engine](stage-engine.md), current narration behavior in [Storyview](storyview.md), and content contracts in [Wiki adventures](wiki-adventures.md).
- Rewrote Stageview to separate merged engine work from remaining staging, integration, and coverage. Corrected Mapview storage and integration status.
- Updated the testing runbook, architecture, roadmap, source briefs, and agent-guide filenames. Condensed old log entries whose detailed implementation history is already in Git.
- Carried unresolved checks and cleanup into [maintenance](plans/maintenance.md), including Storyview validation, the test wrapper, editor clearing, and remote resources.
- Corrected older content-pinning claims. Current live adventures compile current source and re-pin provenance on advance. The rollback test covers separate artifact modules.
- Recorded Storyview's implemented automatic split charging and paragraph reuse, which supersede the original on-demand-only plan.
- Verification passed for 144 local links and heading anchors across 21 documents, documented pnpm scripts and explicit source paths, stale-reference searches, and diff whitespace. Routes were checked against the source tree. No app build, browser playthrough, deployment, or remote cleanup was performed.

## 2026-09-29, Stageview direction and engine

Owner chose Stageview as the future primary play screen, with docked text/input, complete readable narrative, phone landscape play, and text fallback. Community sets must be declarative data interpreted by trusted code.

The old r3f encounter stack was removed in merge `b06a42b`. The map-only panel replaced its map surface. Paid standee/mini products were removed while historical ledger data and legacy schema fields were retained. No player purchase migration was required.

The v5 engine port merged in `384a622`: plain three.js, scoped atmosphere, painterly post-processing, instanced front/back crowd cards, standees, bounded set/staging specs, Kordavos gate, and a development preview. Named characters use detailed front/back art. Earlier procedural-only and overlay directions were superseded.

Recorded validation: TypeScript, lint, build, set checks, and GPU verification passed. Every tested shot fit 300 draw calls and 2.5M triangles. Ultra at DPR 2 ran 21 to 28 fps, high at DPR 1.5 ran 52 to 54 fps with motion disabled, and steady-state JS heap was 42 MB. Mobile tier results came from the desktop, not a phone. See [engine details](stage-engine.md).

Removal checks covered the extracted map panel on a fixture, not a real adventure turn. Fifteen production-compatible Playwright cases passed. The admin test passed separately in development, while production redirected to the missing sign-in route.

Convex production deployment to `marvelous-mink-850` shipped the ledger argument change and removed old visit indexes. The separate prototype repo/site was published. This does not establish deployment of later frontend commits.

Old local branches `2d-maps`, `minimap-claude`, and `claude/competent-moore-d09a8e`, plus remote `origin/claude/stoic-gates`, were retired. Remote asset and temporary-project cleanup remained separate work.

## 2026-09-15, static homepage

The homepage became a static public shell with personalized welcome and token data loaded through private APIs. It bypasses Clerk middleware. Clerk's cookie-only cache action was verified separately.

Recorded validation: production build, TypeScript, lint, 15 production-compatible Playwright cases, and authenticated browser checks on an isolated Convex project. Public responses had cache hits and no Clerk auth headers. Temporary test adventures were removed.

The feature merged in `46a0cfc`. No production deployment occurred in that session. The temporary Convex project still had a deletion reminder.

## 2026-08-31, public rendering

Removed request-wide visit tracking, root-layout request reads, and broad Clerk matching. Public content routes became static. The homepage remained dynamic at this point and was subsequently changed on September 15.

Recorded validation: build, TypeScript, lint, eight Playwright cases, and cache/header checks passed. The top-level test wrapper still waited on unused TCP port 4000.

## 2026-08-25, adventure listing

Explicitly included Realm of Myr source files in Next.js output traces. Replaced positional adventure curation with one grid and independent loading, so one invalid adventure does not hide the others.

Recorded production S3 audit: three adventures lacked source, and March of Davos had incomplete source. All four used repo fallback. The focused production build carried 201 source files, and browser verification showed four working adventure cards.

## 2026-07-06, live content changes

Changed live turn advancement to re-pin content provenance when the authored source changes. Current turn/encounter guards still reject concurrent stale advances. This superseded the earlier strict content-hash rejection.

## 2026-07-05, layout and narration

Merged the responsive character/narrative/right-rail layout and Storyview v1. Narration used stable voices, cached audio, and generation claims. The original browser check covered playback, replay, and concurrent requests. Later code added automatic generation, shared charging, and incremental paragraph reuse.

## 2026-07-03, Mapview

Merged Mapview v1, including the SVG catalog, admin generation, stored per-encounter maps, and player fullscreen view. Recorded a fresh-player Midnight Summons playthrough covering its seven encounters.

Visual guarantees such as connected paths and tree density belong in code. The model prompt alone was insufficient. NPC staging must match the intro, with explicit `startNear` and stored token replacement after changes.

## 2026-06-12, wiki cutover and worktrees

Completed the registered-adventure discovery and gameplay cutover. Kept legacy remote plan JSON as a fallback instead of deleting it. Reconciled richer March of Davos production source into the repo, then cleared its adventure source prefix so runtime used the complete repo source. Setting-level residue was recorded for later review.

Cutover deployment was recorded for Convex production and frontend main `3857148`. Immutable artifact rollback was tested in memory. Live content re-pinning later changed the gameplay behavior, as recorded above.

Added the [worktree workflow](plans/parallel-dev-worktrees.md): one isolated Convex project per branch, Portless URLs, shared S3/Clerk, and no-ff merges.

## 2026-06-11, release hardening

Implemented pre-write validation for admin source changes, complete-source fallback, canonical admin routes, and formatting cleanup for that baseline.

Authenticated Midnight Summons playthrough reached completion, including rolls and encounter transitions. Covert Cargo reached a live transition in practice mode, not a full recorded completion. Browser testing exposed and fixed legacy-plan reads and solo redirect handling that bridge tests missed.

Converted the maintained wiki from HTML to Markdown.

## 2026-05, wiki foundations

Established authored markdown encounters, JSON character sheets, compiled runtime artifacts, Convex live adventure state, validated change sets, revision restore, and AI-assisted editing.

Migrated all four Myr adventures and replaced the legacy plan editor with chat and key-field editing. Chat changes apply directly through validated canonical writes. New community-adventure creation remained deferred.
