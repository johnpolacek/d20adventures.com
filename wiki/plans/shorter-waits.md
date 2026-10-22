# Shorter waits between turns

[Wiki Home](../index.md) · [Plans](index.md) · [NPC turn card](npc-turn-card.md) · [March of Davos playtest](march-of-davos-playtest.md)

Status: pre-writing implemented on main 2026-10-22 in the desktop app. Skipping minor NPC turns is not built, see below.

## Owner request, 2026-10-22

Cut waiting time. NPC turns take 7 to 27 seconds each. Pre-write the next NPC turn while the current one is read. Skip or summarize minor NPC turns in non-combat rounds.

## Pre-writing

Until now local play wrote an NPC's or AI hero's turn only after the story before it had been read. Each wait was the whole write.

- Once a turn arrives, the next NPC's or AI hero's turn is written while it is read. A run of NPCs keeps writing ahead of the reader until a hero the player controls, or the end of the round, is up.
- A hero's own action, and a roll's answer waiting on the card, are read while the next turn is written.
- The end of a round still waits until the round has been read, since the next round replaces the turn on screen.
- The card shows the NPC turn card only once the reader has caught up with the writer.
- Saving where the cast stands after a walk waits for the turn being written, and is never dropped.
- Hosted games are unchanged. The host's worker already runs NPC turns by itself.

| Piece | Where |
|---|---|
| Commands in turn | `apps/desktop/src/play.tsx`: a game command waits for the one running. A continue runs as writing, not as busy. |
| When to write | `apps/desktop/src/stage-play.tsx`: an NPC's or AI hero's turn is asked for while the reader is still reading. The round's end waits as before. |

## Checked live

Three runs in the desktop app in a browser, on copies of the second playtest's saves, with Claude at medium effort and the reader on Auto.

| Run | What happened |
|---|---|
| The Dragonbone, round 11 | Yeva, Elara, Milos and Bram were written in 9, 17, 8 and 9 seconds, all while the story before them was read. No wait between them. The round's end waited for the reading, then took 17 seconds. |
| The festival, round 4 | Milos's turn was written while the round so far was read. Walks were saved as they finished. |
| The festival, round 5 | Branka's reply took 13 seconds. Milos's turn started as her action was read. Her walk to the fortune teller's stall was saved once his turn was written, and kept. Seven turns were written in 74 seconds, while the reader was still on the second. Before, each came after its reading, a wait of 8 to 12 seconds, about 70 seconds in the round. |

## Skipping minor NPC turns: measured, not built

The second playtest's save, 86 rounds and 149 NPC turns, tested two rules for skipping an NPC with no model call.

| Rule | NPC turns skipped | Lost |
|---|---|---|
| A calm round, no hero has spoken to, aimed at or named the NPC | 36 of 104 calm turns | 28 carried the scene: Bram's attic costumes, Garrick's passphrase, the opening bid, Clive coming down the cellar stair. |
| As above, and the NPC did nothing the last round | 7 | 3: Clive and Mira on the cellar stair, and Bram waiting up at the inn. |

A calm round is one with no attack roll or save. Playing consecutive NPCs in one call would save 23 of 129 calm calls.

## Other ways to cut the wait

- Each NPC turn that is not a skip asks a second model call whether it needs a roll, before any outcome. Deciding the roll in the action call would save one call on about 120 of the 149 turns.
- AI heroes took 258 turns in the same run against 149 for NPCs. Pre-writing covers both.

## Open

- Whether to skip or summarize minor NPC turns at all, given what the data shows.
- Whether the roll decision moves into the NPC action call.
- Pre-writing the end of a round, which needs the stage to keep the old turn on screen until it is read.
- The Tauri app itself. The runs above were in the browser preview.
