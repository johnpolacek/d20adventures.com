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

## Owner decisions, 2026-11-11

- Finish all eight stages as soon as can be, with the least rework. That outranks keeping old things working.
- Only the premade heroes and the four Myr adventures need to keep working.
- No fallbacks for old data. Old saves are wiped when a stage needs it, not migrated.
- One path through the code: where the rules replace a loose mechanic, the loose one is deleted, not kept beside it.
- Every hero has a sheet. The hero creator is switched off on both hosts until stage 8 rebuilds it on the rules.
- Tests stay lean: the engine's maths, and one play check on each host per stage. No judge rounds unless the owner asks.
- A change under `convex/` goes out with `pnpm push`, which deploys Convex before the push.

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

Round 3 scored 8.9 and found that the readers' files shared the data's wrong readings where the first reader had settled a dispute alone. Round 4 answers that: new readers who took no part reread the files, the lead decides every difference against the official text, blind auditors read every entry of all six categories, and a typed value now carries its cost, its alternative, how often and whom it falls on, or is named in `untyped`. A package check proves every quoted condition is one unbroken span of its entry's text.

Round 4 scored 9.1. The judge found no wrong printed value for the fourth round, one wrong typed value (Action Surge), and about thirty omissions: a limit, a time or a recipient left unsaid. Its reading of the level 1 slice (classes, species, backgrounds, gear, cantrips, level 1 spells, monsters of CR 2 or lower) found nothing wrong, and its advice was to fix the short list and let stages 2 to 4 test the data through the engine. That list is fixed. Left open, for when a stage needs them: `untyped` for monsters, origins and equipment, typed condition durations, and one shape for the ideas classes and origins still type apart. Typed read values above level 1 are to be verified on first use.

Found along the way: both upstream sources hold many errors, so origins, equipment and magic items are built from the official text alone, and the rest take wording and corrections from it.

Not in this stage: the rules text itself (how play works, the rules glossary). The engine stages encode it.

### 2. The sheet

Class, level, species, background, hit points, Armor Class, proficiencies, saves, and the level 1 features of all twelve classes. Every bonus is derived from the sheet. Health percent stays as a derived value so current screens keep working. Existing heroes and NPCs move to the new sheet.

Started 2026-11-11. Decisions: The Midnight Summons is the reference adventure for migration and playtests. There are no playtester saves to preserve, play is with premade heroes only, so old saves are wiped, not migrated. Premade heroes get their class, species and background mapped from their current archetype and story, with the unsure ones listed for the owner. The game master's prompts stay unchanged in this stage.

Substages:

1. Sheet maths. A sheet (class, level, species, background, ability scores, skills, armor) and one pure function in `packages/gm-core` that derives hit points, Armor Class, saves, skill bonuses and the rest from `@d20/srd`. Tested for all twelve classes at level 1. Done: `packages/gm-core/src/sheet`, tests in `packages/gm-core/test/sheet`, run with `pnpm --filter @d20/gm-core test`.
2. Hit points beside health percent. A character carries its sheet, and its hit points are worked out from the sheet and its health percent. Health percent stays the stored value until stage 4, because the game master still wounds and heals in percent. Stage 4 turns it round. Done: `hitPointsOf` in `packages/gm-core/src/sheet/hit-points.ts`.
3. Premade heroes get sheets. Done for the nine premade heroes of the four Myr adventures. The adventure compiler rejects a sheet that is not legal and warns on a hero with none, because the authoring tools and the hero creator do not write sheets yet. Convex accepts the sheet on a character. Still to do in substage 5: rebuild the desktop's bundled packs and republish the adventures, so the sheets reach play.
4. NPCs get hit points and Armor Class. Done, and by the owner's choice each of the 61 NPCs names an SRD stat block now (`statBlock`: Guard, Bandit, Priest, Owlbear), picked to suit a level 1 party. An NPC that names none is a Commoner. Stage 4 uses the rest of the stat block and retunes the picks. The premade heroes also wear their class's usual starting armor where they carried none.
5. Storage on both hosts. Convex and the desktop database carry the sheet. Done in code: the Convex schema accepts `sheet` and `statBlock`, and the desktop's bundled packs (rebuilt by `pnpm --filter desktop prepare:runtime`, not kept in git) carry them. The live site compiles the adventures from the repo, so a deploy publishes the sheets with no separate step. The live Convex schema is deployed apart from the site: use `pnpm push`, which runs `convex deploy` before the push, whenever `convex/` changes. Old saves need no wipe: a hero with no sheet still loads and shows health percent.
6. Level 1 features listed on the sheet, with their uses. They do nothing yet. Done: `sheetView` in `packages/gm-core/src/sheet/view.ts` lists class features, species traits and feats, with uses worked out (Second Wind, 2 per Long Rest).
7. The sheet on screen: class, hit points, Armor Class, saves and skills on the character card. Done on the site's hero sheet window (`components/adventure/character-sheet-modal.tsx`), which loads the rules data only when it opens. The desktop app shows it on the hero's card in the stage HUD (`apps/desktop/src/character-info.ts`). NPC cards keep their numbers hidden.
8. Close: The Midnight Summons plays end to end on the site and the desktop app. Checked 2026-11-11: the desktop runtime plays it to its ending in its tests (95 of 95 pass), and on the local site a signed-in test user started it, replied, rolled, and advanced into the owlbear encounter, with Thalbern's sheet and the Owlbear's stat block in every saved turn. That check found and fixed two gaps: the site's hero mapper dropped the sheet, and a player's saved copy of a premade from before the rules had none. The live Convex schema was deployed the same evening.

Stage 2 is closed, 2026-11-11. Carried forward: a hero made in the hero creator has no sheet yet, the full Midnight Summons was played to its ending only in the desktop tests, and two desktop tests pin content details closely (the Welcome to Kordavos scene walk, the party slots).

### 3. Checks

The engine resolves ability checks and saving throws. The model picks only the skill and a DC from the SRD ladder. Advantage and disadvantage replace the model's free situational modifier.

Substages, settled 2026-11-11. Decisions: a natural 20 or 1 has no special effect on a check, as the SRD has it. The player still sees the target number. A stage may change the game master's prompts, so read the evals rules first and keep the prompt checks of substage 7 small.

How rolls work before this stage: the model names a roll in free text and any target number (`roll-requirement-service.ts`), the engine adds the ability modifier, and a second model call invents a situational modifier (`roll-modifier-service.ts`). `adventure-roll-result-service.ts` resolves it.

1. One path. Every hero must have a sheet: the compiler's warning for a hero with none becomes an error, and the hero creator is switched off on the site and the desktop app. Nothing rolls for a hero without a sheet.
2. Check maths. One pure function in `packages/gm-core/src/sheet` resolves a check: the d20, plus the bonus from the sheet or stat block, against the target. Advantage and disadvantage roll two dice. Tested with no model: Thalbern's Stealth is +5, so a 9 makes 14.
3. A fixed menu for the model. It picks one of the eighteen skills, a bare ability, or a saving throw, a target from the SRD ladder (5, 10, 15, 20, 25, 30), and advantage, disadvantage or neither with its reason. This replaces the free roll type, target and modifier. The situational modifier call and its service are deleted.
4. What the sheet already knows. Armor that hinders Stealth gives disadvantage with no model involved. Other typed sources follow the same way as they are needed.
5. NPC checks. An NPC rolls with its stat block's skill, save and ability bonuses.
6. The roll on screen, on both hosts: the die, the bonus, the total and the target. Advantage shows both dice.
7. Prompt checks. A small fixed set of scenes shows the model picks sensible skills and targets, run before and after the prompt change.
8. Close. The Midnight Summons plays on both hosts with rules checks. Old saves are wiped.

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
- How the model's reading of prose into a rules action is tested for accuracy.
- Whether zones hold up for areas of effect and cover in stage 6.

## Status

Stage 1 in progress since 2026-11-11.
