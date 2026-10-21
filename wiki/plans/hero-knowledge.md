# What a hero knows

[Wiki Home](../index.md) · [Plans](index.md) · [Adventure premise](adventure-premise.md) · [Structured narrative](structured-narrative.md)

Status: implemented on main 2026-10-21. Not yet played in the app. Carried on the same day by [what each character knows](character-knowledge.md): a private beat is remembered after its round, and NPCs read the round as they know it.

## Owner report, 2026-10-21

"At the beginning of the adventure, I have Thalbern who is looking for the river goods. No one else in the party knows about that, yet the NPC players all ask about that as well. We need a way to make sure the AI player/character does not know about things they are not supposed to know about."

The save: March of Davos at the gate, Thalbern played by the owner, four AI heroes. Thalbern leaned in and asked Garlan "quietly" about a shipment off the Mordava. Garlan leaned close and answered "low" that river goods came through at first light. Milos, Branka and Lyra then each went for the sergeant's ledger, and Lyra asked whose name was "beside this morning's river goods".

## Why

An AI hero reads the whole round as the GM wrote it: every beat, and the player's own words in brackets. The whisper was marked only by its wording and a `delivery`. Nothing told a hero's prompt which beats that hero could not see or hear. The [premise](adventure-premise.md) rule covers strangers, not a companion's private exchange.

Two smaller leaks of the same kind:

- On the desktop, an AI hero's premise carries every chapter of the story so far, not only the chapters that hero lived. Suggested replies already filter them.
- Covert Cargo's premise gives every hero Thalbern's mission, and its intro tells every hero what Lyra, Poppen and Thalbern each want.

## What changes

- A beat can be private. An `action` or `line` with `private: true` is seen or heard only by its actor or speaker and whoever it is aimed at. A whisper, a note slipped across, a hidden watcher moving unseen.
- Every GM step can mark one. The story rules say when. The player's own reply, rewritten into beats, can be private too.
- An authored intro marks one with `{actor: thalbern, private: true}`.
- A hero's view of the round. An AI hero's reply and the replies offered to a player read the round without the private beats they are not part of, and without the other players' own words in brackets. The GM reads everything, with private beats marked.
- On the desktop, an AI hero's premise carries only the chapters that hero lived.
- Covert Cargo: the hidden heroes' and Lyra's private intro paragraphs are marked, and the premise keeps where each hero is and who knows whom. Each hero's mission stays on their own sheet.
- Hosted games store the new field.

## Decisions made without the owner

- Marked by the GM, not inferred. A model told to mark a whisper is cheap. A second pass that rewrites the round from each hero's side costs a call per hero a turn.
- Only actions and lines can be private. Narration is the scene everyone shares.
- Players still read every beat. The person playing Thalbern sees what the AI heroes cannot, as at a table.

## Not covered

- What a hero hears later. Once Thalbern says it aloud to the party, everyone knows. A private exchange is not remembered as private across rounds, since a hero's side prompt sees only the current round. Covered since by [what each character knows](character-knowledge.md).
- The GM's own summary, discoveries and threads. They go to the GM, not to a hero's side prompt.

## Validation

2026-10-21, local.

- Desktop tests, 68 pass. New in `hero-knowledge.test.ts`: a whisper's beats are private and left out of another hero's script, Covert Cargo's opening shows each hero only their own hide and errand, and Milos's move at the gate reads nothing of Garlan's whisper. `story.test.ts`: an AI hero's premise holds no chapter it did not live. The game tests fail with the old hero prompts.
- `pnpm test:gm-core`, with the turn fixture re-recorded for the new story rule. Covert Cargo, March of Davos, Midnight Summons and public-flow checks pass. Type checks pass.
- Real GM through the Claude CLI at the March of Davos gate, 3 runs, Thalbern played, Milos and Branka and Lyra AI.
  - Garlan's answer was private in 3 of 3, and Milos's prompt left it out.
  - "Leans toward the burly guard as he pays" and a spoken question, 2 runs: the question was not private, so Milos heard it. The words say nothing of a whisper.
  - "Leans in and quietly asks", 1 run: Thalbern's question and Garlan's answer were both private. Garlan added a gruff open line, the one thing Milos heard.
  - Milos never went after the river goods. He paid and named his business each time.
- Not checked: the running app, other GMs, hosted games. Convex is not deployed.
