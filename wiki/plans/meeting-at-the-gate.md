# Meeting at the gate

[Wiki Home](../index.md) · [Plans](index.md) · [What each character knows](character-knowledge.md) · [Adventure premise](adventure-premise.md)

Status: implemented on main 2026-10-21. Played live with Claude twice. Website and Convex deployed to production 2026-10-21. Split into the line and the table 2026-10-21, not yet deployed. Not yet played in the app.

## Owner request, 2026-10-21

"the point of the first encounter at the gates in march of davos is for the characters to meet each other. can you please make a comprehensive adjustment to facilitate that and make sure it is a great experience for the player characters"

## Owner request, 2026-10-21, line then table

"I was expecting the first round to have them be waiting in line with some kind of intro around being stuck in line with an opportunity to meet other interesting travelers or something like that, then the next round they would be at the front of the line and time to pay."

Owner chose two scenes over one scene with a paced GM. In both live runs, most hero lines had gone to Garlan, not to each other.

## Before

- March of Davos had no premise. Every prompt treated the heroes as a party that travelled together.
- The gate's intro showed only the gate, the line and Garlan's question. No hero was in it.
- The GM notes said only "an opportunity for each player to introduce their character".
- Nothing gave strangers a reason to talk to each other. Each hero answered Garlan, and the round moved on.
- Every prompt listed each hero by name. Nothing said who had heard whose name.

## The scenes

In plain words: the watch lets no one into the city alone during the Festival. Travellers enter as a company, every name written in the gate book together, each answering for the others. The heroes came alone, so they must pick each other.

**The Gates of Kordavos, in the line.** One round.
- The sergeant bellows the law down the line. Families and merchant trains close ranks around their own.
- The heroes stand near each other, a few places back. The intro shows each one as the others see them, with no name.
- Things to talk about: a family turned back three marks short, Blackthorn wagons waved past the line, a spice trader who has waited since dawn.
- Garlan is not in the scene. He is too far up the line to hear or be heard. Round one is only the heroes.
- The round always ends with the line moving up to the table.

**The Front of the Line, at the table.** One or two rounds.
- Garlan takes each hero's name and business, says the name aloud as he writes it, and asks what to call the company.
- Each hero has a moment with Garlan. A hero's own errand may be whispered.
- It ends when the company is written and waved through.

In the app, both scenes use the gate's 3D set. In the line, the party stands two groups back from the table. At the table, it stands at the front.

## Who has heard whose name

An adventure may say its heroes start as strangers, with `strangers: true` on its page.

- A hero's name is heard when a spoken line says it. A public line is heard by everyone present, a private one by those in it.
- The GM may record a name learned another way, as a fact with the id `name-<hero id>`.
- Heroes who come on together from the adventure just finished know each other's names from the start.
- Names are kept in the ledger of [what each character knows](character-knowledge.md), apart from its facts.
- A prompt that plays one character marks each hero whose name they have not heard. The GM's prompts list who has not heard each name.
- In speech, no one uses a name they have not heard. Narration may name anyone.

## Intro paragraphs for one hero

`{hero: <id>}` labels a paragraph about one hero. It shows only when that hero is in the party.

## Decisions made without the owner

- **The festival law.** A reason strangers must talk, choose each other and leave together. The owner may prefer another device.
- **Garlan stays out of the line.** With him in it, his turn could call the heroes up early, and he would hear names said in the line.
- **People in the line are told in narration.** They have no sheets. A guard with no sheet once spoke, and his words went to Garlan.
- **The intro names no hero.** Each hero is shown as the others see them. The player learns names as the heroes do.
- **Garlan keeps the land gate.** River cargo lands at the docks, which he does not watch. This keeps the later docks scenes true.
- **Only heroes' names are tracked.** NPC names keep the existing knowledge rule.
- **Opt-in per adventure.** Other adventures keep today's prompts.

## Code

| Piece | Where |
|---|---|
| Names heard, from lines and the ledger | `packages/gm-core/src/story/names.ts` |
| `{hero: id}` paragraphs | `authoredStory`, `authoredText` in `story/authored.ts` |
| The two gate scenes | `encounters/the-gates-of-kordavos.md`, `encounters/the-front-of-the-line.md` |
| Party's place in the 3D line | `SCENES` in `apps/desktop/src/scenes.ts` |
| `strangers` flag | `lib/wiki-adventures/compiler.ts`, `RuntimeManifest`, plan view |
| Round end records names | `orchestration/advance-turn.ts` |
| Prompts | AI hero, offered replies, NPC turn, roll outcome, round end |
| Known names at the start | `apps/desktop/runtime/game.ts`, from the story so far |

## Not covered

- NPC names. A hero may still call Garlan by name before hearing it. The knowledge rule asks them not to.
- Covert Cargo's heroes are strangers too, and it does not use `strangers`. Its NPCs know Lyra, which the flag cannot say yet.
- Heroes who meet in an older chapter, not the one just finished, start as strangers by name.

## Validation

2026-10-21, local.

- Desktop tests, 78 pass. New in `meeting.test.ts`:
  - A name said aloud is heard by all present. A whispered one only by those in it. A name inside a word or in narration is not heard.
  - Names stay out of the facts a prompt lists. A name the GM records is made the hero's own id.
  - The gate's intro shows only the party's heroes, with no names.
  - At the gate, each hero starts a stranger. Milos's name said aloud reaches the others and is kept next round. Thalbern's whispered name reaches only Garlan.
  - Heroes who come on from The Road to Kordavos know each other at the gate, and Branka is a stranger to them.
- `pnpm test:gm-core`, fixture re-recorded. Batches e and f, the four bridge checks and public-flow pass. Type checks and biome pass.
- Real GM through the Claude CLI, the player's seat taking the first offered reply. Both runs reached the festival in two rounds.
  - Branka, Cassia, Yeva and Milos. Milos offered to stand with "these three" before he knew their names. Yeva called him "Father Milos" after hearing his. Branka's offered replies asked the halfling's name rather than saying it. Branka named them the Gate-ward Company. Garlan read the names back.
  - Thalbern, Lyra, Poppen and Wrenna. Wrenna chose Thalbern first. Lyra asked Wrenna about Faelendar. Poppen noticed Thalbern's river mud and asked if he came up the Mordava. Thalbern named them the Forest Road Company. No one's errand came out.
  - Every name a character said had been said where they could hear.
  - One flaw, fixed after: a guard with no sheet spoke, and his words went to Garlan. The note now gives the line to Garlan.
- Not checked: the running app, other GMs, hosted games, parties of five.

2026-10-21, line then table, local.

- Desktop tests, 78 pass. Tests that need Garlan now reach his table first. New checks: only the heroes stand in the line, names heard there carry to the table, and the GM is told where the party waits.
- `pnpm test:gm-core`, fixture moved to the table and re-recorded. Batches e and f, the four bridge checks, admin authoring and public-flow pass. Type checks and biome pass.
- Real GM through the Claude CLI, four runs.
  - In every line round, every hero line went to another hero. Names given there were used at the table.
  - Lyra spoke of "our friend in the waistcoat" before hearing Poppen's name.
  - First run: the table took three rounds, as Milos held back his name. A pace note was added.
  - Second run: the table closed in one round as "Garlan's Strays", before anyone was asked. The note now has Garlan ask first.
  - Last two runs: three rounds each, the line, names and marks, then the company's name. They named themselves the Gate-ward's Company and the Mordava Company.
