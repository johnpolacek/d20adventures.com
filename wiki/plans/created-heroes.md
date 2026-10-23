# Created heroes in March of Davos

[Plans](index.md) · [Wiki Home](../index.md) · [Gameplay flows](../gameplay-flows.md) · [Wiki adventures](../wiki-adventures.md)

Status: planned 2026-10-23. Not started.

## Owner decisions

Recorded 2026-10-23:

- March of Davos is the use case for created heroes. Premades are for the quick-start intro adventures.
- A created hero arrives with a reason to be in Kordavos, picked by the player from a list the adventure authors. The game then writes the hero's arrival.
- The hero's sheet stays their own. The reason and arrival belong to one adventure, so a hero can go on to other adventures.

Done 2026-10-23: a hero made on the party screen is the player's to play. The hero they had goes to the AI. See `seatCreated` in `apps/desktop/src/carry.ts`.

## The gap

A premade arrives at the gate as a full character. A created hero arrives as a name.

- Each premade has a `{hero: id}` paragraph in the gate intro. A created hero has none.
  - The GM notes show them "the first time the story turns to them, with one detail of how they look."
- The gate's GM notes list each premade's tell, such as Branka's sigil or Cassia's charts. Garlan answers them at the front of the line.
- Premades are rooted in the city. Branka's family kept the gate, and Milos serves the Church of Valkara.
- Heroes carried in from earlier adventures get a sheet written for March of Davos that says why they came.
- The creator prompt knows only "a hero of the Realm of Myr" and the teaser. It never asks why the hero came.

## Plan

1. **Hero hooks section.** An adventure page may have `## Hero Hooks`: a short list of reasons to come, each one line.
   - Compiles to `manifest.heroHooks` in `lib/wiki-adventures/compiler.ts`, beside `premise`.
   - It holds no secrets. Players see it in the creator.
   - March of Davos gets 6 to 8 hooks, each tied to a faction or place a hero meets early. Examples to review:
     - Hired to guard a merchant train bound for the Festival market.
     - Bringing an offering to the Church of Valkara for the Harvest rites.
     - Owed coin by someone in the Lower Districts, and here to collect.
     - A post in the Asterian governor's service, starting after the Festival.
     - Coming home to the March for the first Festival in years.
     - Chasing word of old Valkaran relics sold quietly in the city.
2. **Arrival on the hero.** The roster hero gains `arrivals`, keyed by adventure id.
   - Each holds the hook, a `{hero}` gate paragraph, and a tell: one visible detail others can ask about.
   - `partyFor` copies the arrival into the running adventure, and leaves the roster hero alone.
   - The hook's sentence is added to the in-adventure background, as the carried premades' sheets do.
3. **Creator step.** Opened from the party screen of an adventure with hooks, the creator asks why the hero came.
   - One chip per hook, plus the player's own line.
   - The draft call writes the sheet, the gate paragraph, and the tell together.
   - The review shows the gate paragraph under "At the gate", editable.
4. **Heroes without an arrival.** A roster hero made elsewhere, or a guest's hero, has no arrival for this adventure.
   - Start writes the missing ones, one call per hero, with a hook the GM picks.
   - Then it saves them to the roster hero, so the next start is instant.
5. **Into the story.** One gm-core helper inserts arrival paragraphs after the intro's last `{hero}` paragraph.
   - `game.ts` start uses it for the first turn's beats.
   - `runtime-context.ts` uses it for the GM's view of the start encounter's intro.
   - The tell goes on the in-adventure sheet, where every prompt that plays the hero reads it.
6. **Authored notes.** The gate's "Between the heroes" note covers heroes it does not name: use the tell on their sheet.
   - The same goes for Garlan at the front of the line.

## Tests

- Compiler: `## Hero Hooks` compiles, and an adventure without one compiles as before.
- Helper: an arrival paragraph lands after the authored ones, and an absent hero's paragraph still drops.
- Start: a created hero with an arrival has it in the first turn, the GM context, and the in-adventure sheet.
- Start: a hero without one gets one written and saved, using a stub model.
- The roster hero's own sheet is unchanged.

## Eval

The arrival prompt is new AI output, so ordinary tests cannot judge it. Rubric, judged by reading traces:

- The paragraph matches the authored ones: one or two sentences, present tense, one visible detail.
- It never names the hero. The heroes start as strangers.
- The tell can be seen from a few places down the line.
- The hook is shown, not stated.
- Nothing contradicts the sheet or the premise.

Run 10 heroes across races, classes and hooks on the local Claude CLI.

## Open questions

- The hook list needs owner review before it ships.
- Whether a roster hero's hook can be picked on the party screen, or the GM always picks it there.
- Guests in hosted games use the website roster. Their arrival is written by the host at start, as in step 4.

## Later, not in this plan

- A stat budget matching the premades: 70 to 72 points, none above 16.
- One-line descriptions for each race and class.
- Painting new heroes automatically when a painting CLI is installed.
