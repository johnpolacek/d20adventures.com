# Meeting at the gate

[Wiki Home](../index.md) · [Plans](index.md) · [What each character knows](character-knowledge.md) · [Adventure premise](adventure-premise.md)

Status: implemented on main 2026-10-21. Played live with Claude twice. Not yet played in the app. Convex not deployed.

## Owner request, 2026-10-21

"the point of the first encounter at the gates in march of davos is for the characters to meet each other. can you please make a comprehensive adjustment to facilitate that and make sure it is a great experience for the player characters"

## Before

- March of Davos had no premise. Every prompt treated the heroes as a party that travelled together.
- The gate's intro showed only the gate, the line and Garlan's question. No hero was in it.
- The GM notes said only "an opportunity for each player to introduce their character".
- Nothing gave strangers a reason to talk to each other. Each hero answered Garlan, and the round moved on.
- Every prompt listed each hero by name. Nothing said who had heard whose name.

## The scene

In plain words: the watch lets no one into the city alone during the Festival. Travellers enter as a company, every name written in the gate book together, each answering for the others. The heroes came alone, so they must pick each other.

- Garlan calls the law to the line. Families and merchant trains close ranks and pass.
- The heroes are left near the front, strangers. The intro shows each one as the others see them, with no name.
- Garlan takes each hero's name and business, says the name aloud as he writes it, and asks what to call the company.
- Each hero has a moment with Garlan, from what the intro shows of them. A hero's own errand may be whispered.
- It ends when the company is written and waved through, in two or three rounds.

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
- **The intro names no hero.** Each hero is shown as the others see them. The player learns names as the heroes do.
- **Garlan keeps the land gate.** River cargo lands at the docks, which he does not watch. This keeps the later docks scenes true.
- **Only heroes' names are tracked.** NPC names keep the existing knowledge rule.
- **Opt-in per adventure.** Other adventures keep today's prompts.

## Code

| Piece | Where |
|---|---|
| Names heard, from lines and the ledger | `packages/gm-core/src/story/names.ts` |
| `{hero: id}` paragraphs | `authoredStory`, `authoredText` in `story/authored.ts` |
| `strangers` flag | `lib/wiki-adventures/compiler.ts`, `RuntimeManifest`, plan view |
| Round end records names | `orchestration/advance-turn.ts` |
| Prompts | AI hero, offered replies, NPC turn, roll outcome, round end |
| Known names at the start | `apps/desktop/runtime/game.ts`, from the story so far |

## Not covered

- NPC names. A hero may still call Garlan by name before hearing it. The knowledge rule asks them not to.
- Covert Cargo's heroes are strangers too, and it does not use `strangers`. Its NPCs know Lyra, which the flag cannot say yet.
- Heroes who meet in an older chapter, not the one just finished, start as strangers by name.
- Hosted games need a Convex deploy to keep names, as they do the ledger.

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
