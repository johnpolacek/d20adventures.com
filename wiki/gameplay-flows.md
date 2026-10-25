# Gameplay flows

[Home](index.md) · [Architecture](Architecture.md) · [Wiki adventures](wiki-adventures.md) · [Testing](plans/testing-runbook.md)

GM core references updated in `feature/gm-core` on 2026-10-02. Other sections last reviewed against local main on 2026-10-01.

## Create, join, and start

1. Character selection calls `createAdventure`. Convex stores the adventure, participants, and content provenance.
2. Eligible solo adventures auto-start. Multiplayer runs use the lobby and join/start controls.
3. Join resolves the user's character and updates player assignments.
4. Start loads content through `loadAdventurePlanForRuntime`, assembles PCs and encounter NPCs, and writes the first turn.
5. Practice mode restricts access to the managing user and allows that user to control the chosen party.

Primary actions are under `app/_actions/create-adventure.ts`, `join-adventure.ts`, and `start-adventure.ts`.

The [shared GM core](gm-core.md) now owns reply, roll, NPC, companion, and advance orchestration. Server adapters preserve the current storage, model, auth, and narration behavior.

## Turn progression

1. A player submits narrative input through the adventure action.
2. Roll evaluation determines whether a check is required.
3. Required rolls are stored and resolved before completing the action.
4. Narrative and character-state updates are applied.
5. NPC turns resolve as needed. An NPC who flees takes the status "fled" and is left out of the next round. One who dies on its own turn goes to 0% health with the status "dead", and every prompt names the dead as unable to act. A line any later step gives a character at 0% health or "dead" joins the narration instead. An NPC whose behavior says it acts only when spoken to skips its turn, with no model call, until a hero speaks to it, goes to it or names it. Each NPC turn reads that NPC's own turns from the scene's last three rounds, so it does not repeat a line or a failed action.
6. Turn advance loads current content, validates encounter progression, and commits the next turn and story patch. A closing question put to the players, such as "What do Lyra and Poppen do?", is dropped from the round's narration. An adventure's [safety rules](wiki-adventures.md#safety-rules) can keep player characters alive and send a badly hurt party to a rescue encounter.
7. Terminal wiki encounters set completed status and an end timestamp.

Health: a roll's outcome is read for health after an attack, a save, a feat of body, or an outcome that tells of harm or healing. Healing raises health, and mends only a hurt the saved state shows. A failed roll, a hero's or an NPC's, has no partial effect unless the GM notes give it one.

AI heroes follow the person's hero: each AI hero's move reads what the heroes played by a person said and did in the last four rounds, and backs a side they took there until they change it.

GM notes bind: every prompt that reads an encounter's notes is told that what they forbid holds and that no one gives a clue or reveal they do not provide. A notes sentence that opens with an NPC's name and says what they never do, or that they say nothing, is repeated beside that rule in the NPC's turn. The round end and roll outcomes list each present NPC whose behavior sets such a rule, so a GM step that writes their words keeps it. Round ends settle nothing a roll did not, keep stated prices, bids and sold items, accept no wealth a hero lacks, take a transition only when every part of its condition is met, and resolve nothing begun in an earlier encounter.

Spells: every cast is a check named for the spell, and the check marks the spell used for the encounter. A check for a spell on the character's own list adds their Intelligence modifier. Owner decision, 2026-10-11: a spell no creature resists (Fog Cloud, Light, Detect Magic) is an easy check, DC 5 to 8. A spell against a creature's mind or body (Charm Person, Ray of Frost) follows the normal difficulty guidelines. Encounter instructions that set a difficulty come first.

Who knows what: every prompt that writes for a character says a character knows only what the story shows them seeing, hearing or being told, and that a stranger has no name until it is spoken to them. Narration may still name anyone. An adventure can state its starting point in a `## Premise` section. See [Wiki adventures](wiki-adventures.md).

Since 2026-10-21 an adventure keeps a ledger of facts, each with every character who knows it. At the end of a round, each set of characters who shared private beats gets one fact, and the GM records what was learned in a `knowledge` field beside its beats. A prompt that plays one character, an AI hero's move, the replies offered to a player, or an NPC's turn, reads the round as that character knows it and only that character's facts. The GM's roll outcomes and round ends read every fact with who knows it. A prompt shows the newest facts, the GM's recorded ones ahead of private beats, which fill at most four places while recorded facts wait. See what each character knows.

In an adventure whose heroes start as strangers, the ledger also keeps who has heard each hero's name, from the lines that say it. A prompt that plays one character lists the names it has not heard, and the GM's list who has not heard each. See meeting at the gate.

The live commit rejects changed current turns/encounters and duplicate turn order. Authored content can change during a run. The commit updates its content provenance rather than loading the original immutable version.

## State and presentation

Convex stores gameplay state. Client contexts and existing SSE/stream paths deliver updates. Realtime consolidation is still an audit topic.

Narrative strings retain dice and original-reply markers for parsing and display. Maps supply visual staging only. Storyview caches generated narration separately from the turn narrative.

The current turn page renders text, optional [Mapview](plans/mapview.md), [Storyview](storyview.md), and chat where applicable. [Stageview](plans/stageview.md) gameplay is planned, not part of the current turn loop.

## Costs and reports

AI helpers and flow-specific services meter generation through the token ledger. Charging and failure behavior vary by flow. Storyview's on-demand and automatic cost rules are documented in its reference page.

Practice reports use wiki-backed plan context, store typed findings, and appear in turn and player views. Report checks, membership checks, and billing cases are in the [testing runbook](plans/testing-runbook.md).
