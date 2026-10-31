# Created heroes in March of Davos

[Plans](index.md) · [Wiki Home](../index.md) · [Gameplay flows](../gameplay-flows.md) · [Wiki adventures](../wiki-adventures.md)

Status: steps 1 to 6 done 2026-10-24 for desktop games. Hosted games and owner review remain.

## Owner decisions

Recorded 2026-10-23:

- March of Davos is the use case for created heroes. Premades are for the quick-start intro adventures.
- A created hero arrives with a reason to be in Kordavos, picked by the player from a list the adventure authors. The game then writes the hero's arrival.
- The hero's sheet stays their own. The reason and arrival belong to one adventure, so a hero can go on to other adventures.

## Done

How it works now is in [Hero Hooks](../wiki-adventures.md#hero-hooks).

- 2026-10-23: a hero made on the party screen is the player's to play. The hero they had goes to the AI. See `seatCreated` in `apps/desktop/src/carry.ts`.
- 2026-10-24, steps 1 to 3: March of Davos has 7 hooks. The creator offers them, and the draft call writes the arrival through `extend` on `generateCharacterAction`. The review shows Arrival, Why they came, and What others notice.
- A hero made from the Characters page is no longer drafted for an adventure.
- 2026-10-24, steps 5 and 6: `withArrivals` in `packages/gm-core/src/story/authored.ts` adds arrival paragraphs to the start encounter's intro, for the first turn and the GM. The gate and front-of-the-line notes cover heroes they do not name.
- Checked in the browser preview: a Half-Orc Ranger drafted on Claude in about 25 seconds and was seated as the player's.
- Traces on Claude, 3 heroes, 3 runs. The first run's paragraphs named "the priest" and ran to 60 words. The prompt now caps them at 45 words and mentions no other traveler. Later runs met the rubric below.
- A Gnome Warlock with no reason got the sealed letter in all 3 runs. It is the last hook. Watch for the model favouring the end of the list.
- Not checked: a live GM round at the gate with a created hero, and the stage playing their arrival beat.

- 2026-10-24, step 4: `writeArrivals` in `apps/desktop/runtime/heroes.ts` writes the arrival a roster hero lacks, at the start of a desktop game. One call per hero, one at a time, since a CLI session takes one request at a time. The GM picks the hook. The arrival is saved to the roster hero. A failed call starts the game without it.
- Traces on Claude for step 4, 3 roster heroes, 2 runs. All 6 met the rubric. The hooks varied with the sheet: the letter for a rogue in debt, the offering for a cleric, coming home for a bard.

## Remaining

- A live GM round at the gate with a created hero, and the stage playing their arrival beat.

## Guests create heroes, 2026-10-31

Owner: a guest joining a hosted March of Davos makes their own hero, and may make several, up to the open seats. The heroes must fit the adventure and setting.

Chosen 2026-10-31:

- The host sets how many open seats one guest may fill, in party setup. Kept as `host.bring`.
- The host's GM writes each created hero's arrival as a job, not the website. Hosted games stay free.
- The website's creator page works for any adventure, rather than a new creator in the lobby.

### Built and checked, 2026-10-31

- `heroDraftPrompt` in gm-core: setting, teaser, and rules against modern or invented world facts. The app's creator and the website's use it.
- Website creator: `/player/<name>/characters/new` and `/settings/<setting>/<plan>/character-create` show the app's `HeroCreator` without the figure picker. The old 12-step form and its seven per-field actions are gone.
- From a lobby, the creator offers that adventure's races, classes and hooks. The hook shapes the drafted background. A hosted lobby's hero takes an open seat with its hook, and the guest returns to the lobby link with its `?as=`.
- `host.bring`: party setup shows Each guest brings with two or more Any hero seats. Default is all of them. Old games count as one.
- A guest's requests, the host's answer, and Sheet go by hero. Past the limit, a new request replaces the guest's latest waiting one.
- `arrival` jobs have no turn. Seating a created hero queues one, as does hosting with roster heroes that lack an arrival. The app sends the arrivals its roster already has.
- The website refuses a guest hero whose race or class the adventure does not allow.
- Checked against the local website and dev Convex, with the bundled `host.cjs` worker on Claude: `d20guest` made Mira Tal, a Half-Elf Bard, and Orsik Embermantle, a Dwarf Cleric, from the any hero link. Both were seated, both arrivals were written in the lobby, and Start placed them after Branka's paragraph. Both met the rubric below.
- Checked through Convex and the host route: a third request replaced the latest waiting one, approval by hero seated two, and a third hero was refused.
- Not checked: the app's party setup and lobby in the running app, a website creator draft on a phone, and a removed guest's arrivals.
- Known: the host's Sheet for a guest at the table opens their first hero. Removing a guest removes all their heroes.

## Eval

The arrival prompt is AI output that ordinary tests cannot judge. Rubric, judged by reading traces:

- The paragraph matches the authored ones: one or two sentences, present tense, one visible detail.
- It never names the hero. The heroes start as strangers.
- The tell can be seen from a few places down the line.
- The hook is shown, not stated.
- Nothing contradicts the sheet or the premise.

## Open questions

- The hook list needs owner review before it ships.
- Whether a roster hero's hook can be picked on the party screen, or the GM always picks it there.

## Later, not in this plan

- A stat budget matching the premades: 70 to 72 points, none above 16.
- One-line descriptions for each race and class.
- Painting new heroes automatically when a painting CLI is installed.
