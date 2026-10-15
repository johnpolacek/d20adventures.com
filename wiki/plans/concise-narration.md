# Concise narration

[Plans](index.md) · [Wiki adventures](../wiki-adventures.md) · [GM core](../gm-core.md)

Status: round ends, NPC turns, action rewrites and The Midnight Summons trim implemented on main 2026-10-13. Replayed twice with Claude the same day: 52% fewer words a turn.

## Owner direction, 2026-10-13

"I think our narrative prose is too verbose. Can we keep all the meaningful information and story details while being more concise? Begin by auditing the Midnight Summons adventure"

Offered the prompt, the authored text, or both, the owner chose both, prompt first, then a replay to measure.

## Audit

Three saved desktop playthroughs of The Midnight Summons from 2026-10-03, all on Claude, 7,434 words of narration.

| Prose | Share | Average | Rule at the time |
|---|---|---|---|
| Round-end narration | 53% | 180 words, 13 sentences | None |
| Authored intros | 15% | 104 words | Hand written |
| NPC turns | 15% | 72 words | 1-2 paragraphs of 1-2 sentences |
| Player action rewrites | 9% | 31 words | 2 sentences |
| Roll outcomes | 7% | 50 words | 2 sentences, 60 words |

- Where a length rule exists the model keeps it. Roll outcomes never passed 54 words.
- The round-end prompt for the four Myr adventures had no length rule.
- Repetition cost more than length. A missed attack was told by the NPC's turn, then retold by the round end.
- The round end ran into the next encounter's intro. The owlbear arrived in the bridge and again in the intro.
- Wollandora gave her briefing twice and asked "Will you go?" twice.
- "moonlight" 27 times, "hooked beak" 17, "amber eyes" 13, "empty air" 11.

## What changed

### Round-end prompt

`buildWikiEncounterProgressionPrompt` in `packages/gm-core/src/wiki-adventures/runtime-context.ts`. It serves all four Myr adventures.

- Nothing from this round or recent turns is told again, and no character repeats a line.
- Continuing: one paragraph, at most 3 short sentences and 50 words.
- Transitioning: at most 2 short sentences and 35 words.
- An event the GM notes call for at that moment may take 5 sentences and 90 words.
- Each transition option now carries its target's intro, with the rule that the bridge stops where the intro starts.
- The legacy plan prompt already had a length rule and is unchanged.

### NPC turns and action rewrites

Second pass, the same day, after the first replay. In `npc-turn-generation-service.ts` and `narrative-generation-service.ts`, shared by every adventure.

- An NPC's turn: at most 2 short sentences of narration, 40 words. Spoken lines are extra.
- Lines the notes script are spoken as written. Otherwise at most 2 short spoken lines.
- One beat of action for the turn, not one between each spoken line.
- The outcome of an NPC's roll: 2 short sentences, 40 words, with no wind-up.
- Neither repeats what the recent narrative has said. An event the notes call for may take 4 sentences.
- A player's action is rewritten plainly. Every action the player gave is kept and nothing is added.
- The rewrite no longer sees the hero's appearance, which is where "sharp green eyes" came from.
- A rewrite is 1 sentence, or 2 for two actions, and at most 10 words longer than the reply.

### Quote spacing

`sanitizeUserVisibleProse` put a space after every comma, so `"Come," she says` became `"Come, " she says` in every spoken line, authored or generated. A comma before a closing quote now keeps none. `scripts/validate-llm-style.ts` checks it.

### The Midnight Summons

| File | Before | After |
|---|---|---|
| `broken-silence` intro | 170 words | 129 |
| `owlbear-confrontation` intro | 56 | 47 |
| `timely-rescue` intro | 70 | 63 |
| `meeting-at-the-stones` intro | 63 | 44 |
| `preparing-for-the-city` intro | 164 | 140 |
| `back-home` intro | 109 | 90 |
| All six | 632 | 513 |

The intros are 19% shorter with every fact kept. The audit guessed a third. What remains is story detail.

- Both endings are in the present tense throughout. They still turn Thalbern down the Mordava and name Covert Cargo.
- GM notes tell Wollandora to give her briefing and her lore once.
- Her briefing reads "friends in Faelendar, Eldoria, Sylvandor, and Oakhaven", not "a friend from" four places.
- `owlbear-confrontation` notes named `wollandora-intervention`, which does not exist. They name `timely-rescue`.
- The rescue threshold was 25%, 50% and "critical" in three places. It is "badly wounded, below 25% health" in all three.
- The adventure summary called Wollandora "him".
- Thalbern packs his sword and dagger, as his sheet has it. The intro said a hand axe and knife, which he does not carry.

Decisions made without the owner: the 25% threshold, and the sword and dagger.

## Replay, 2026-10-13

One playthrough on the built desktop runtime, a scratch save, Claude as GM, scripted replies and rolls. Sneak, shoot, slip past the Owlbear, ask about the relics, accept. Eight turns to the ending in under three minutes.

| Prose | Before | After |
|---|---|---|
| Words a turn, all narration | 297 | 157 |
| Round-end narration, average | 180 words, 13 sentences | 36 words, 3 sentences |
| Round-end share of the words | 53% | 20% |

- Every round end kept its limit: 2 sentences on a change of encounter, 3 when it continued.
- Each bridge stopped where the intro began. The Owlbear arrived once and the Stones were described once.
- Wollandora gave her briefing once and her lore once.
- "moonlight" twice, "hooked beak" 3 times, "empty air" once, "amber eyes" never.
- No fact the players needed was dropped, read against the notes.

It showed NPC turns at 29% of the words and 73 words a turn, a 10-word reply rewritten as 31, and a space before each closing quote. The second pass above answers those.

### Second replay

The same replies and rolls after the second pass. The same eight turns.

| Prose | Audit | First replay | Second replay |
|---|---|---|---|
| Words a turn, all narration | 297 | 157 | 143 |
| Round-end narration | 180 words | 36 | 36 |
| NPC turn | 72 words | 73 | 53 |
| Player action rewrite | 31 words | 21 | 18 |
| Roll outcome | 50 words | 44 | 45 |

- The Owlbear's attacks went from 4 sentences to 2.
- Wollandora's briefing and lore were spoken whole, once.
- All seven replies went into the story as the player wrote them.
- No spoken line had a space before its closing quote.
- The NPC's dice fell differently in the two replays, so the comparison is rough.

Left as it showed:

- Asking about the relics moves to `the-missing-relics`, which has no intro. The player must ask again before Wollandora answers. Fixed 2026-10-14: Wollandora acts first there, `initialInitiative: 20`, and answers the question just asked.
- The round end and Wollandora's own turn both press for an answer, one after the other. The NPC with the highest initiative acts straight after the round end. Fixed 2026-10-14: her behavior scripted "Will you take on this task?" every turn. She now asks once and waits, and both the NPC and round-end prompts say a question waiting for the player's answer is not asked again. Confirmed in the owner's live game 2026-10-15: asked once.
- Roll outcomes keep their 60-word rule and are now 12% of the words. Tightened 2026-10-15, below.
- Authored intros are now the largest share, 32%.

### Roll outcomes, 2026-10-15

Owner chose to tighten them next. The owner's own live game of The Midnight Summons, read before the change: three hero rolls, 37, 46 and 43 words, 2 sentences each. The Animal Handling outcome retold Thalbern's retreat, and the Insight one ended on a simile about the river.

`buildRollOutcomePrompt` in `packages/gm-core/src/services/adventure-roll-result-service.ts`, shared by every adventure, now matches the NPC roll rule:

- At most 2 short sentences of narration and action, 40 words in all.
- Say what the action did and where it leaves the characters.
- The hero's action and its wind-up are not told again, and nothing the context already describes is.
- An NPC's spoken line is still extra and short.

After the change, the owner's next game, Claude as GM, two rolls: a Stealth success in 36 words and an Insight failure in 28, 2 sentences each. Neither retold the action. Insight at the Stones went from 43 words to 28. Two rolls is a small sample.

### The other three adventures, 2026-10-15

Owner chose to trim Covert Cargo, The Road to Kordavos and March of Davos next, as The Midnight Summons was.

| Adventure | Encounters | Intro words |
|---|---|---|
| The Road to Kordavos | 3 | 245 |
| Covert Cargo | 10 | 1,486, of which `the-shipment` is 792 |
| March of Davos | 45 | 7,653 |

The same rules as The Midnight Summons:

- Every fact a player or the GM needs is kept: names, places, objects, clues, threats, what is asked of the heroes.
- Repetition, stacked adjectives, and atmosphere said twice go.
- Spoken lines stay in the speaker's voice and are only shortened.
- Labels in braces are kept on their paragraphs, and a paragraph keeps its label when it is shortened.
- Present tense in intros and endings.
- GM notes and NPC behaviors are left alone unless they contradict the intro or script a line the intro already gives.
- Contradictions found along the way are fixed and listed. Decisions made without the owner are named.

March of Davos is split between three helpers working in parallel, by file. Checked afterwards: labels still parse, every encounter's intro still names its cast, and the bridge checks pass.

#### Result

| Adventure | Intro words before | After | Shorter |
|---|---|---|---|
| The Road to Kordavos | 245 | 193 | 21% |
| Covert Cargo | 1,486 | 1,113 | 25% |
| March of Davos | 7,653 | 6,070 | 21% |

Every labelled paragraph keeps its labels in the same order. Covert Cargo's intros, which slid between past and present, are all present tense. Three other narration sections the GM receives were trimmed too: March of Davos's "The Meeting", "The Missing Brother" and "The Final Night Approaches".

Fixed:

- Covert Cargo called Reinhard "Varius" in the shipment intro, its notes and two behaviors.
- The transaction had Silas glide from the shadows and unwrap the scrollcase a second time. Aelar's line there is now its own labelled line.
- The stage's cues for Aelar's entrance and the elves' exit quote the intro, so they follow the new wording. Every staging cue in the three staged adventures was checked against its intro.
- the-aftermath: Petra pointed at "the lock", but the drake melted the cage. She says "Look at the cage!"
- the-speech: the real, caged drake was "translucent", a word for Eamon's illusion. Dropped.
- into-the-catacombs: the fuse was "sparking" while the line orders it lit. It is about to be lit.
- the-hunt-for-the-assassin notes put the ward on a "sealed door". The intro puts it on the drainage grate. Now "grate".
- the-blackthorns notes scripted Astrid's intro line word for word, and the-lady-and-the-bishop notes had masks lowered that the intro already lowered. Both say it once.
- the-winning-bid: Silverhand rising sat in his representative's labelled paragraph. Moved to his own.

Decisions made without the owner: point of view left as each intro had it, since many March of Davos intros say "you" and the rest "the adventurers", and "Past the detonation point" became "Past the barrels", since stopping them is the goal.

Left for the owner:

- death-to-the-murderer: the assassin calls Thaddeus the murderer of Milos Antonov. The notes of the-rangers-quarters say Astrid arranged it. It may be the Covenant's mistake on purpose.
- If the barrels go off, the catacombs notes separate Astrid's soldiers from the party, but the labyrinth intro still has her order them to split up.
- the-chase puts the magic seal on a wooden door down the tunnel. the-hunt-for-the-assassin puts the ward on the grate.
- Eamon is a half-elf in two encounters' notes and an elf on his sheet.
- Two NPC files, `barok-ironfist` and `barok-redbeard`, are both titled "Barok Redbeard".
- "Lower District" and "Lower Districts" are both used.
- the-beast-escapes fights the Forest Drake, which is not in its cast.
- Typos left in GM notes: "Valkaran even" in clan-conflict, "There be eyes and everywhere." in the-silver-serpent-tavern, "in the air h," in the-chase.

Not replayed. Only The Midnight Summons has been played since its trim.

## Not done

- One path, one model. The rescue and the refusal are unplayed, and so are the other GMs.
- Roll outcomes are measured on two rolls only.
- Covert Cargo, The Road to Kordavos and March of Davos are trimmed but not replayed.
- Codex, Antigravity and the other GMs are unmeasured. The saves were all Claude.
- The website's S3 copies of the adventure are not changed.
- No code enforces the length. It is a prompt rule only, and it held on every round end of the replay.

## Validation

- `pnpm test:gm-core`, with the recorded round-end prompt in `scripts/gm-core-fixtures/turn.json` replaced
- `pnpm --filter @d20/gm-core check`
- Bridge checks for all four adventures, `batch-e` and the public flow check
- Desktop tests after `pnpm prepare:runtime`
- Both live replays above
- `scripts/validate-llm-style.ts`
