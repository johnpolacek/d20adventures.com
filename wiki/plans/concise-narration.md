# Concise narration

[Plans](index.md) · [Wiki adventures](../wiki-adventures.md) · [GM core](../gm-core.md)

Status: prompt change and The Midnight Summons trim implemented on main 2026-10-13. Not yet replayed with a live model.

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

## Not done

- No live replay yet, so the new lengths are unmeasured.
- NPC turns, 15% of the words, keep their 4-sentence rule.
- Player action rewrites still add adjectives to a short reply.
- Covert Cargo, The Road to Kordavos and March of Davos are not audited or trimmed.
- Codex, Antigravity and the other GMs are unmeasured. The saves were all Claude.
- The website's S3 copies of the adventure are not changed.
- No code enforces the length. It is a prompt rule only.

## Validation

- `pnpm test:gm-core`, with the recorded round-end prompt in `scripts/gm-core-fixtures/turn.json` replaced
- `pnpm --filter @d20/gm-core check`
- Bridge checks for all four adventures, `batch-e` and the public flow check
- Desktop tests after `pnpm prepare:runtime`
