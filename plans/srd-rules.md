# SRD rules

Goal: the game runs on the full SRD 5.2.1 rules, the open version of the 2024 core rules. Opened 2026-11-10.

## Principle

The engine does the math. The GM tells the story.

A player types a move in prose. The model reads it as a rules action. The engine rolls and resolves it from the sheets. The model narrates the result and never invents a number.

The engine is pure, tested code in `packages/gm-core`. It reaches nothing outside the ports.

## Owner decisions, 2026-11-10

- Go all in on the rules. The old "lightweight checks" brief is gone.
- Both hosts at every stage: the website over Convex and the desktop app over SQLite.
- Space is zones and measured distances, read from the current token positions. No five foot grid.
- All twelve classes at level 1 come before any combat work.
- Each stage is broken into substages when it starts, and not before.

## How a stage runs

1. Write its substages in this file, under the stage, on the day it starts.
2. Build them in order. Each one is small and leaves the game playable.
3. Migrate the heroes, NPCs and encounters the stage touches.
4. Cover the engine with deterministic tests. Cover changed prompts with playtest probes.
5. Close the stage when it plays end to end on both hosts. Mark it done here.

Later stages stay as short as they are below until their turn.

## Stages

### 1. Data and license

SRD 5.2.1 as typed data: classes, species, backgrounds, feats, spells, monsters, equipment, conditions. One source checked against the official text, or our own parse. The CC-BY-4.0 attribution line on the site and in the app.

Started 2026-11-11.

How it is built:

- The data lives in a new package, `packages/srd` (`@d20/srd`). It is pure and depends only on Zod.
- Base source: `5e-bits/5e-database`, `src/2024/en`, commit `a6212be`, MIT.
- Second source for cross-checks: Open5e `srd-2024`, commit `bdcddf2`.
- The official SRD 5.2.1 PDF text settles every disagreement. Its text is committed for the checks.
- The data takes our own shape, not the upstream one. Every entry names its page in the official PDF.
- A correction is a recorded override that cites the official text. Generated data is never edited by hand.

Substages:

1. Sources pinned: a lock file with commits and hashes, and the official text committed.
2. Package shell: shared schema, build and verify runners, `pnpm test:srd`.
3. Reference tables: abilities, skills, conditions, damage types, languages, alignments, magic schools.
4. Equipment: weapons, armor, gear, tools, weapon properties and masteries. Then magic items.
5. Origins: species, backgrounds, feats.
6. Classes: all twelve, level tables to 20, features, the SRD subclass of each.
7. Spells.
8. Monsters.
9. Checks against the official text: every name both ways, key fields, description text.
10. The attribution line on the site and in the app.
11. Review by a separate judge until it rates 9.5 or higher.

Status, 2026-11-11: substages 1 to 10 are built, `pnpm test:srd` passes, and the judge review is under way. The package's README lists what it holds, how its checks work, and where the official text disagrees with itself.

Judge rounds so far: 8.4, then 8.8. Round 2 found that a check which copies its builder's reading proves nothing. So round 3 added a second reading that owes nothing to the builders: independent readers wrote the typed effects of every spell and magic item (`scripts/verify/fixtures`), auditors read every class, origin, equipment and monster entry beside the official text, and `READING.md` holds the rules all of them work to. A typed value that holds only under a condition now carries it as `appliesWhen`, in every category.

Found along the way: both upstream sources hold many errors, so origins, equipment and magic items are built from the official text alone, and the rest take wording and corrections from it.

Not in this stage: the rules text itself (how play works, the rules glossary). The engine stages encode it.

### 2. The sheet

Class, level, species, background, hit points, Armor Class, proficiencies, saves, and the level 1 features of all twelve classes. Every bonus is derived from the sheet. Health percent stays as a derived value so current screens keep working. Existing heroes and NPCs move to the new sheet.

### 3. Checks

The engine resolves ability checks and saving throws. The model picks only the skill and a DC from the SRD ladder. Advantage and disadvantage replace the model's free situational modifier.

### 4. Combat

Initiative, attack rolls, damage dice and types, critical hits, death saves, conditions. Action, bonus action, reaction and movement on each turn. NPCs take SRD monster stat blocks.

### 5. Spellcasting

Slots, spellcasting ability, spell attacks, save DCs, concentration, rituals. Damage, healing and condition spells resolve in the engine. Utility spells stay with the GM, bound by the spell text.

### 6. Space

Speed, range, areas of effect, cover, opportunity attacks. Positions come from zones and distances on the map and stage.

### 7. Rest and levelling

Short and long rests, hit dice, experience, levels 2 to 5. Class features, the SRD subclass for each class, and feats.

### 8. Breadth

Levels to 20. The full spell, monster and magic item lists. The hero creator rebuilt on the rules.

## Unknowns

- No machine-readable SRD 5.2 source is verified yet. A third-party JSON API exists, unchecked.
- Which adventure is the reference for migration and playtests.
- How the model's reading of prose into a rules action is tested for accuracy.
- Whether zones hold up for areas of effect and cover in stage 6.

## Status

Stage 1 in progress since 2026-11-11.
