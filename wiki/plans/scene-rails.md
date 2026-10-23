# Scene rails check

[Plans](index.md) · [March of Davos playtest](march-of-davos-playtest.md) · [Round budget](round-budget.md) · [Testing runbook](testing-runbook.md)

Status: implemented on main 2026-10-22. Both playtest saves are judged in full. Six probes stay on the rails after content fixes and the AI hero rule.

## Owner request, 2026-10-22

Headless playthroughs of March of Davos to keep the GM on the rails. "It still invents exits and chases: the cistern, the tunnel stair. Add an automated check that flags turns leaving the authored scene. Run it on replayed saves after each prompt change." Also: change the adventure itself where it does not answer a reasonable player action. Offered scene probes, a judge only, or full runs, the owner chose scene probes, with the judge built first inside them.

## Why

Both playtests found the GM opening ways out of a scene that the content does not have. A Cowl rogue left a trail to a cistern shaft in The Ambush, rounds 30 to 35 of the second run, and a stair behind Astrid's study led to a tunnel in The Ranger's Quarters, rounds 62 and 63. The prompt rule against invented exits came after. Nothing has checked whether it holds, and only a person reading the story could tell.

## Design

### The judge

- `pnpm --dir apps/desktop scene:judge <save> [--rounds 28-36] [--encounter id]` reads a save and judges each round against its encounter.
- A round is one turn's beats, plus the end-of-round beats that open the next turn.
- The judge sees the encounter's intro, GM notes, transitions and cast from the current content, then the round as a script that says who wrote each part: the GM, an NPC, an AI hero or the player.
- Off the rails is an invented exit, a way out the content does not give, or an act against the notes or a cast behavior.
- Each finding quotes the round, says why, and says who pushed it: the GM, the player or an AI hero.
- A content gap is a reasonable player move the notes do not answer, so the GM had to invent. It points at a content fix, not a prompt fix.
- Claude judges through its CLI, one fresh session a round, as the GM runs.

### Scene probes

- `pnpm --dir apps/desktop scene:probe <probe id> [--runs 3]` starts a fresh game at the probe's encounter, plays it, and judges every round.
- The probe runs the game in process with the current prompts and content. No `prepare:runtime` is needed after a change.
- Branka is played by the probe's scripted replies, chosen to push on the scene's exits. Cassia, Yeva and Milos are AI heroes, as in the playtests.
- A run stops when the scene takes a transition, the adventure ends, or the round limit is reached.
- The story so far is what the GM reads of it: the five turns before the scene. A probe copies them from a playtest save, and can open on the real round end that led into the scene.
- The heroes know each other's names. Their gear is the premades' own.
- The report counts runs off the rails and lists each finding and content gap.

### Why a fresh start and not a cut save

A save's knowledge, threads and summary are not kept by round, so a finished save cut back to round 30 would still tell the GM about the murder and the tunnels. A fresh game at the encounter, with the five turns before it, gives the GM what it read then, less the ledger of who knows what.

The round summary each turn writes reaches no GM prompt. Only the last five turns do.

### Saves kept

The two playtest saves are kept gzipped in `apps/desktop/scripts/playtests/` as the judge's known cases.

## Not done

- Exact snapshots at each round's start during a full run, for probes that need the real state.
- Seeded NPC dice. Results are rates over runs, not pass or fail.
- Full unattended playthroughs with a pushing player.

## Validation

The judge on the second playtest's save, current content, Claude at medium effort. Ten rounds take about 20 seconds at five at a time.

| Rounds | Known | Judged |
|---|---|---|
| 30 to 35, The Ambush | The cistern chase | All 6 off: the Cowl back on the inn's roof, the frost trail, the grate, the rogue in the shaft |
| 36 and 37 | Back on course | Both on |
| 57 to 67, The Ranger's Quarters | The stair to the tunnel at 62 to 65 | All 11 off: the stair, the fleeing candle-bearer, the guards searching the house against the caught note |
| 68, The Speech | Back on course | On |
| 1 to 10, gate to the job | Played as written | 9 on. Round 7 off: Yeva leads the party to a cellar the scene does not have |

- A first pass flagged Bram naming the masquerade, a later scene. The judge now sees the adventure's scenes in play order, and naming what a later scene holds is foreshadowing.
- Rounds 28 and 29, Silverhand's hideout, came back off. His notes name neither the traitor nor where he went, so the GM made up Dmitri Volk and a cellar grate on Tallow Row. That seeded the cistern chase two scenes later. A content gap, not a prompt fault.
- The Ranger's Quarters' hidden compartment has "a faint draft", and the notes never say nothing lies beyond it. The GM opened the stair there.

One probe run of `ambush-follow`, two rounds, about 2.5 minutes. Both on. Yeva's roof search found nothing, and the round end walked the party to the inn as the notes say. Branka's second scripted reply came after the party was inside, so it no longer fit and the GM let it pass. Scripted replies do not see the scene.

Desktop type check and Biome pass.

## Probes before and after the content fixes, 2026-10-22

Owner: "(a) first, then (b), then rerun (a)". Three runs a probe, Claude at medium effort, rounds in the probe's scene only.

| Probe | Before | After |
|---|---|---|
| `ambush-follow`, The Ambush, content unchanged | 1 of 3 runs off, 2 of 12 rounds, both Bram: speaking before the party was inside, and asking for an invitation | 0 of 3 runs, 0 of 12 rounds. Two runs reached Entry to the Ball |
| `study-draft`, The Ranger's Quarters | 0 of 3 runs off, but no run got through Astrid's locked door in 4 rounds. The notes gave no way to open it, so the GM invented failed picks, a guard and fights | Every run got in and found the journal. No tunnel stair. 2 rounds flagged, both AI heroes: one called the room a cellar, one led the party down a stair back toward the halls |
| `silverhand-traitor`, Face-to-Face with Silverhand | 3 of 3 runs off, 5 of 7 rounds: catacomb passages marked on Cassia's chart, boot prints under the harbor, a traitor named "Dmitri Vasko" | First rerun 1 of 3: Silverhand pointed at Warehouse 14, from a line in the new notes, since removed. Second rerun 1 of 3: Milos, an AI hero, proposed going below to the catacombs, and Silverhand let him |

- Silverhand never said Lev was Joran. Asked about Joran: "I meet many men in this city. None of them goes by Joran Antonov."
- The catacombs Milos reached for are in the lead-in: the copied turns hold the second playtest's invented cistern lanes and Cassia's tunnel chart.
- The judge called setting off for the inn an invented exit, though it is the road into The Ambush. Each way out now carries the first paragraph of the scene it leads to. The two runs it misjudged now pass, and the known derails are still flagged.
- The judge does not see how the party arrived, so a stair they climbed to reach a scene can read as new.

## Content changed, 2026-10-22

- Face-to-Face with Silverhand: the man who crossed Silverhand was Joran, working his crew as Lev, a secret the scene never tells. Owner chose this with nothing given away. Silverhand tells what he knows of Lev, names no place, and has never heard of Joran.
- Final Confrontation: asked how he came by the Key, Joran tells it.
- The Ranger's Quarters: the door opens to thieves' tools at DC 13 or force at DC 15, a failure costs only time, the floor and the quarters are empty, and nothing lies beyond the compartment.

## AI heroes open no way out, 2026-10-22

Owner picked the AI hero rule next. Both remaining derails came from AI heroes: Milos proposing the catacombs to Silverhand, Cassia leading the party down a stair. The round and NPC prompts already said to open no way out of a scene. The AI hero prompt did not, and its "move the scene forward" line named "someone to follow" as a way on.

- The AI hero prompt sees the story, not the encounter's notes, so its rule is about the story: open no way out yourself, no hidden passage, stair, tunnel, trail, fleeing figure or place the story has not set before the party now. A lead from earlier rounds stays behind unless the story brings it back. A search or chase that found nothing is dropped.
- "Someone to follow" is now "someone leading the way".
- In `packages/gm-core`, so hosted games get it with a Convex deploy.

| Probe | Before the rule | After |
|---|---|---|
| `ambush-follow` | 0 of 3 runs off | 0 of 3 runs, 0 of 12 rounds. Two reached Entry to the Ball |
| `study-draft` | 2 of 3 runs off | 0 of 3 runs, 0 of 12 rounds. Every run got in and reached the journal. One left by the listed way back to the halls |
| `silverhand-traitor` | 1 of 3 runs off | 0 of 3 runs, 0 of 7 rounds. Every run moved on to The Ambush. Asked about Joran: "I meet many men, dwarf. None by that name." |

From the first baseline to now: 4 of 9 runs off the rails to 0 of 9.

`pnpm test:gm-core` and 78 desktop tests pass. Not deployed.

## Both playtests judged in full, 2026-10-22

Owner picked judging all 161 rounds, then probing the worst scenes. About two minutes for both saves at five at a time. The judge reads current content, so a round played before a later fix is judged against the fixed notes.

47 of 161 rounds off: 15 of 75 in the first playtest, 32 of 86 in the second. Of 115 findings, the GM pushed 73, AI heroes 32 and the player 10. 74 were acts against the notes and 41 invented exits.

| Scene | Rounds off | Played before | New probe |
|---|---|---|---|
| The Ranger's Quarters | 11 of 11 | Today's content fix | `study-draft`, 0 of 3 |
| The Ambush | 7 of 9 | Today's AI hero rule | `ambush-follow`, 0 of 3 |
| Shadowing Silverhand | 4 of 4, both playtests | "Silverhand keeps walking", committed six minutes after the second playtest's round 25 | `shadowing-tail`, 0 of 3 |
| Face-to-Face with Silverhand | 3 of 3 | Today's content fix | `silverhand-traitor`, 0 of 3 |
| The Wine Cellar and Through the Halls | 5 of 19 | "A caught party goes to the ballroom", committed after the second playtest's capture | `cellar-caught`, 0 of 3 |
| Clan Conflict | 2 of 3, both playtests | Today's AI hero rule, for Yeva's cellar | `clan-clue`, 0 of 3 |

- Shadowing Silverhand: in the second playtest Silverhand talked and led the party to his door. In the first, his scout Kaeleth guided a hero round his own bodyguard, played a minute after the commit that put his guards on his side, likely before `prepare:runtime`. In the probe he never answered: "No answer comes back through the harbor mist."
- The Wine Cellar: in the second playtest guards marched the caught party upstairs to a steward. In the probe every run reached The Speech, one with the guards bluffed into taking the party as witnesses.
- Clan Conflict: in the first playtest the GM invented a lost relic shipment and a toll bridge clue. In the probe no run did, though Larya once hinted at Blackthorn coin buying old things, after Branka's scripted ask about missing goods.
- Scenes off once, in one playtest: The Old Grand Library, with the Archivist showing himself early, and An Unsolicited Opportunity, with Beric naming the Raskov coin.
- 104 of 161 rounds name a content gap. Most are small calls a GM makes anyway. The ones repeated across runs: what Clive does when bluffed, bribed or persuaded, whether the vault lock breaks to force, what terms the clans would accept, and what the library's glass cabinet holds.

All six probes, 18 runs, stay on the rails.

The AI hero rule reached hosted games on 2026-10-23, deployed to Convex production `marvelous-mink-850` from `b4179f5`. The desktop app gets it with `pnpm prepare:runtime`.

## Next

- Probe lead-ins copy a playtest's own derails. A clean lead-in would come from a run that stayed on the rails.
- Gaps the judge keeps naming: what Silverhand counts as a fair trade, what the Key looks like, the study's chest and desk, Clive when bluffed or bribed, the vault lock to force, the clans' terms, the library's glass cabinet.
