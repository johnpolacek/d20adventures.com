# Shorter waits between turns

[Wiki Home](../index.md) · [Plans](index.md) · [NPC turn card](npc-turn-card.md) · [March of Davos playtest](march-of-davos-playtest.md)

Status: pre-writing implemented on main 2026-10-22 in the desktop app, NPC and AI hero turns first, then the end of a round the same day at the owner's pick. Skipping minor NPC turns is not built, see below.

## Owner request, 2026-10-22

Cut waiting time. NPC turns take 7 to 27 seconds each. Pre-write the next NPC turn while the current one is read. Skip or summarize minor NPC turns in non-combat rounds.

## Pre-writing

Until now local play wrote an NPC's or AI hero's turn only after the story before it had been read. Each wait was the whole write.

- Once a turn arrives, the next NPC's or AI hero's turn is written while it is read. A run of NPCs keeps writing ahead of the reader until a hero the player controls, or the end of the round, is up.
- A hero's own action, and a roll's answer waiting on the card, are read while the next turn is written.
- The end of a round is written while the round is read too. The screen keeps the round until it has been read, then shows the next. The next round's NPCs and AI heroes are written while the last round is still read, up to the player's hero.
- The game is never more than a round ahead of the reader: the end of a round is written ahead only for the round on screen.
- The card shows the NPC turn card only once the reader has caught up with the writer.
- Saving where the cast stands after a walk waits for the turn being written, and is never dropped. The walk holds the story, its save does not.
- A walk saved on a round the game has moved past is kept if the game is still in that encounter, and dropped if it has left.
- The cast is placed from the save once a stage and encounter, not on every new round, so a walk whose save is still waiting is not undone.
- Hosted games are unchanged. The host's worker already runs NPC turns by itself.
- Nothing here is per adventure. Each of the four was played live, see below.

| Piece | Where |
|---|---|
| Commands in turn | `apps/desktop/src/play.tsx`: a game command waits for the one running. A continue runs as writing, not as busy. |
| When to write | `apps/desktop/src/stage-play.tsx`: the next NPC's, AI hero's or round end's turn is asked for while the reader is still reading. |
| The round on screen | `apps/desktop/src/stage-play.tsx`: the turn read stays until it has been read, or while a roll's answer waits on the card. |
| Walks on an ended round | `apps/desktop/runtime/game.ts`: positions for an older turn of the same encounter are kept. |

## Checked live

Three runs in the desktop app in a browser, on copies of the second playtest's saves, with Claude at medium effort and the reader on Auto.

| Run | What happened |
|---|---|
| The Dragonbone, round 11 | Yeva, Elara, Milos and Bram were written in 9, 17, 8 and 9 seconds, all while the story before them was read. No wait between them. The round's end waited for the reading, then took 17 seconds. |
| The festival, round 4 | Milos's turn was written while the round so far was read. Walks were saved as they finished. |
| The festival, round 5 | Branka's reply took 13 seconds. Milos's turn started as her action was read. Her walk to the fortune teller's stall was saved once his turn was written, and kept. Seven turns were written in 74 seconds, while the reader was still on the second. Before, each came after its reading, a wait of 8 to 12 seconds, about 70 seconds in the round. |

### The end of a round, in all four adventures

Fresh games of The Midnight Summons, Covert Cargo and The Road to Kordavos, and the second playtest's Dragonbone save, each played on Auto for five or six minutes with a reply sent whenever the player's hero was up.

| Adventure | What happened |
|---|---|
| March of Davos | After Branka's reply, five turns, the round's end and the next round's first two turns were written within 94 seconds, while round 12 was still read. Round 13 came on screen once round 12 had been read. |
| The Road to Kordavos | After Sera's first reply, three NPC turns, the round's end and all four of round 2's turns were written by 114 seconds, while the reader was still in round 1. Round 2 came on screen at 160 seconds. When Sera's reply ended a round, its end was written while her action was read, a wait of 7 seconds where it had been 15. |
| Covert Cargo | Poppen's and Thalbern's turns were written during the intro. After Lyra's reply, three NPC turns and the round's end were written while it was read, and round 1 stayed on screen with round 2 saved. |
| The Midnight Summons | Solo, so a round ends on Thalbern's own turn. Its end was written as soon as his roll was answered, while the answer was on the card, and the move to Owlbear Confrontation came after the old scene's closing lines were read. Four rounds: the waits after the roll fell from 13 seconds to under 1. After a reply the Owlbear's turn left a wait of up to 10 seconds, its round's end none. |

The reader still waits when it catches up with the writer: 2 to 4 seconds for the first NPC after a short reply.

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
- The Tauri app itself. The runs above were in the browser preview.
- Twice in the preview, The Midnight Summons went back to the title screen about 40 seconds in, before any GM call. Not seen in two later runs with page reloads logged, nor in the other adventures. Cause unknown.
