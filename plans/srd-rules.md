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

1. One path. Every hero must have a sheet: the compiler's warning for a hero with none becomes an error, and the hero creator is switched off on the site and the desktop app. Nothing rolls for a hero without a sheet. Done: one switch, `HERO_CREATOR` in `packages/gm-core/src/character/hero-draft.ts`, closes every way into the creator on both hosts, and a saved hero with no sheet cannot join or start a game. The Road to Kordavos has no premade heroes, so it cannot be played. Owner decision, 2026-11-11: it stays listed and unplayable until stage 8 brings the hero creator back.
2. Check maths. One pure function in `packages/gm-core/src/sheet` resolves a check: the d20, plus the bonus from the sheet or stat block, against the target. Advantage and disadvantage roll two dice. Tested with no model: Thalbern's Stealth is +5, so a 9 makes 14. Done: `resolveCheck` and `checkBonus` in `packages/gm-core/src/sheet/check.ts`.
3. A fixed menu for the model. It picks one of the eighteen skills, a bare ability, or a saving throw, a target from the SRD ladder (5, 10, 15, 20, 25, 30), and advantage, disadvantage or neither with its reason. This replaces the free roll type, target and modifier. The situational modifier call and its service are deleted. Done: `roll-requirement-service.ts` is the one call that asks for a roll, on both hosts, and the first turn uses it too. The model answers with a menu id (`checkMenu` in `sheet/check.ts`), a difficulty by name and a mode. The engine adds the bonus and the target number. Two things wait for their own stages and ride on the menu until then: an attack is a bare Strength or Dexterity check (stage 4), and casting a spell is a bare check of the caster's spellcasting ability that names the spell, so a cast spell is still marked used (stage 5). The authored difficulties in the four adventures moved to the ladder: 12 to 10, 13, 14 and 16 to 15, 18 to 20, with the harder side of a contrast (Larya against Barok in Clan Conflict) set to 20.
4. What the sheet already knows. Armor that hinders Stealth gives disadvantage with no model involved. Other typed sources follow the same way as they are needed. Done: `sheetModes` in `sheet/check.ts`. No premade hero wears such armor yet, so the test uses a Fighter in Chain Mail.
5. NPC checks. An NPC rolls with its stat block's skill, save and ability bonuses. Done with substage 3, since the modifier call NPCs rolled on was deleted there: `checkBonus` reads the stat block, and the Commoner's when an NPC names none.
6. The roll on screen, on both hosts: the die, the bonus, the total and the target. Advantage shows both dice. Done: the site's roll cards (`components/adventure/character-dice-roll*.tsx`) and the stage's card, result and journal (`components/stage`) name Advantage or Disadvantage with its reasons, throw two d20s and strike through the one that does not count. Both dice reach the engine, in a hosted game too. A 20 or a 1 gets no special look.
7. Prompt checks. A small fixed set of scenes shows the model picks sensible skills and targets, run before and after the prompt change. Done: 13 scenes in `apps/desktop/scripts/check-probes.json`, each with the right picks written beside it, run by `pnpm --dir apps/desktop check:probe` and graded by those rules with no second model. Before the change the old prompt picked a fitting skill in 13 of 13 and no target on the ladder. After it, 13 of 13 pass. Both runs were one pass on the local Claude CLI, not on the site's Gemini model.
8. Close. The Midnight Summons plays on both hosts with rules checks. Old saves are wiped.

Checked 2026-11-11, with the engine at 44 of 44 tests and the desktop runtime at 94 of 94:

- Desktop runtime, on the local Claude CLI: The Midnight Summons played from Broken Silence to its ending in seven rounds. Six hero rolls and four Owlbear rolls, every target on the ladder, Thalbern's bonuses from his sheet (Perception +3, Stealth +5), the Owlbear's Strength +5 from its stat block, and seven rolls with Advantage or Disadvantage that kept both dice and counted the right one.
- Local site, on Gemini, as a signed-in test user: the hero picker offered the premade and no creator. Thalbern rolled Perception against 10 with +3, then Stealth against 15 with +5 and Advantage, which the card named with its reason and threw as two d20s. The Owlbear rolled Dexterity with +1 from its stat block. The adventure moved into the Owlbear encounter.

Not done, and why the stage is not marked closed:

- The live Convex deploy and the push. `convex/story.ts`, `convex/hosting.ts` and `convex/schema.ts` changed, and the session was not allowed to deploy to production. The last two stage 3 commits wait on `pnpm push`.
- The wipe of old saves, on the live site and in the desktop app (`pnpm desktop:wipe`). The session was not allowed to delete them. A save made before this stage with a roll still pending cannot resolve it.

Carried forward: The Road to Kordavos stays unplayable until stage 8, by the owner's choice. An attack and a spell ride on bare ability checks until stages 4 and 5. Tool proficiency is not typed, so a lock is a bare Dexterity check. On the site, one advance into the Owlbear encounter showed "Action Failed" while the turn advanced and the server logged no error, on a network that was dropping requests: not traced.

### 4. Combat

Initiative, attack rolls, damage dice and types, critical hits, death saves, conditions. Action, bonus action, reaction and movement on each turn. NPCs take SRD monster stat blocks.

Started 2026-11-11. Substages drafted the same day.

How harm works before this stage: a hero's attack is a bare ability check against a ladder target. After a roll a second model call (`analyzeAndApplyDiceRoll` in `turn-update-service.ts`) reads the outcome and sets one character's health percent from a table. An NPC's outcome carries a model-written `healthPercentDelta`, and the same second call then judges it again, so an NPC's hit can count twice. At the end of a round the model may set health, status and effects through `characterUpdates`: the desktop applies them and the site drops them. Initiative is a bare d20, rolled again every round. Status is free text.

Owner decisions, 2026-11-11:

- The player throws only d20s. The engine rolls damage dice and the card shows them.
- Death saving throws run in every adventure. Where an adventure has player death off, a third failure leaves the hero stable and out of the fight, not dead.
- The Owlbear of The Midnight Summons keeps the Owlbear's stat block. The scene is about getting past it, calming it or being rescued, not about beating it.
- Six classes carry the rules through stages 4 to 7: Fighter, Cleric, Wizard and Rogue, and with them Ranger and Bard, because the premade heroes are of those six. The other six keep the level 1 sheet they have, with their features listed and not live, until stage 8.
- Harm outside an attack comes off a short ladder the model picks from and the engine rolls: light 1d4, moderate 1d8, heavy 2d6, severe 4d6. Dice printed in an encounter's notes are used as printed.
- Until stage 5 gives spells their own dice, a spell that hurts or heals uses that same ladder.

The session's calls, which the owner may overrule:

- The player sees the Armor Class an attack is rolled against, as a check shows its target.
- Initiative is rolled once when an encounter starts and kept until it ends. An encounter's authored `initialInitiative` stays, as that NPC's fixed place.
- Hit points become the stored value. Health percent stays on the character as a copy the engine alone writes, so the screens and prompts that read it keep working. It goes when the last reader does.

Substages:

1. Attack and damage maths. Pure functions in `packages/gm-core/src/sheet`: a hero's attacks from the weapons on the sheet, an NPC's from its stat block's actions, an attack roll against Armor Class (a 20 on the die hits and is a Critical Hit, a 1 misses), damage dice with a Critical Hit's doubled dice, and Resistance, Vulnerability and Immunity. Tested with no model: Thalbern's Longbow is +5 to hit for 1d8 + 3 Piercing. Done: `packages/gm-core/src/sheet/attack.ts` (`weaponAttack`, `attacksOf`, `multiattackOf`, `resolveAttack`, `rollDamage`, `damageTaken`).
2. Weapons on the sheet. The sheet names its weapons by SRD id. The nine premade heroes get theirs from the gear they carry, and the compiler checks them. Done: `weapons` on the sheet. Lyra, Cassia and Milos carry a Quarterstaff for their staffs, Poppen a Dagger and Shortbow, Branka a Warhammer, Yeva a Dagger. Unsure, for the owner: Thalbern's "Sword" is a Shortsword (it suits his Dexterity), Wrenna's "Scout's Long Knife" is a Dagger, and Ilya keeps her Rapier though a Bard is trained in Simple weapons only, so she adds no Proficiency Bonus with it.
3. Hit points are stored. A character carries its current hit points, an NPC starts at its stat block's, and the engine alone changes them. `healthPercent` leaves the content files. Done: `hitPoints` is on every turn character, on both hosts, and `withHitPoints` in `sheet/hit-points.ts` is the one writer of it and of the health percent copy. The model's percent writes pass through `withHealthPercent` until substages 5 and 6 delete them. Sister Mira, authored at 95 percent, enters at full like everyone else. `convex/schema.ts` changed, so this needs `pnpm push`.
4. Initiative from the sheet and the stat block, rolled once per encounter. Done: `rollInitiative` in `sheet/stat-block.ts`. A hero or NPC rolls as it enters an encounter, and a round that stays in the encounter keeps the order. Thalbern adds +5, with his Alert feat.
5. Attacks on the menu. The model reads a move as an attack, names who is attacked and picks one of the attacker's own weapons or stat block actions. The engine rolls to hit and for damage. This goes for heroes and NPCs, with a monster's Multiattack. The calls that guess harm are deleted. Done for attacks: the roll service offers `attack` with the roller's own attacks and who is here, `strike` in `sheet/attack.ts` resolves it, and the roll beat carries the target, the damage dice and what was lost. The narrator is told the blow in words and may not change it. An attack no longer reaches the calls that guess harm. Those calls still serve checks and saves until substage 6 replaces them, and are deleted there. Prompt checks: of five attack scenes the old prompt read one rightly, and the new one reads all five, 17 of 17 with the rest. Played on the desktop runtime: Thalbern's Longbow scored a Critical Hit for 13 and the Owlbear's two Rends took him from 11 to 0. That play showed the next gap: a hero at 0 hit points cannot act, so the rescue scene never moves on. Substage 7 is built next, before 6, to close it.
6. Harm and healing outside attacks. A trap, a fall, a potion: the model picks who, a severity and a damage type from a fixed menu, and the engine rolls. The round's end can no longer set health. Both hosts apply the same changes, through the core. Done: a check or a save carries its stakes, settled before the die is thrown: who is hurt or healed, on which outcome, by a size from the ladder or dice the notes print (`sheet/stakes.ts`). `applyStakes` in `sheet/harm.ts` rolls them once the outcome is known, through the target's defenses and the rules of 0 hit points, and the narrator is told the result in words. The second model call that read an outcome for harm is deleted, with its word lists, the NPC outcome's `healthPercentDelta` and the round-end patch's `healthPercent`. Nothing but the engine changes hit points now, on both hosts. Prompt checks, 20 scenes: Ray of Frost stakes 1d4 damage on a success, Healing Word 1d8 healing, a flame jet 1d8 fire on a failed save, and plain checks stake nothing. Left for later: harm with no roll at all (a potion drunk, a hazard at a round's end) has no path yet, and the round-end patch's status, gear and effects are still applied by the desktop alone.
7. Zero hit points. A hero falls Unconscious and makes death saving throws. A monster dies. Healing brings a hero back. Encounter rules that speak in percent (the Owlbear's rescue) move to hit points. Done, ahead of substage 6: `sheet/death.ts` holds the rules, and a dying hero's turn is a Death Saving Throw the player throws, with no model call. Dead, down and dying are three tests in `utils/turn-actors.ts`, used everywhere the old one was written out. Where player death is off, what would kill leaves a hero Stable at 0: the old floor at 1 hit point is gone. An adventure's `rescue` now fires when a hero is at 0 hit points and wakes them at 1, and The Midnight Summons uses it. When the model calls a hero dead, the hero drops to 0 and the saves decide. Played on the desktop runtime: two Rends took Thalbern from 11 to 0, he fell Unconscious and dying, the rescue fired, and he acted again in the rescue scene at 1 hit point. The local Claude CLI then refused further requests, so that play stopped there. `convex/schema.ts` changed.
8. Conditions. The SRD's fifteen replace free-text status, each with its effect on rolls typed in the engine. Dead and fled stop being conditions. Done: a character bears `conditions`, each one of the fifteen by id, with who it comes from and how many of the bearer's own turns it has left. `sheet/conditions.ts` types what each does: Advantage and Disadvantage on the bearer's attacks and checks and on attacks against them, saves failed outright or rolled with Disadvantage, the Critical Hit on one Paralyzed or Unconscious, Petrified's Resistance, Exhaustion's 2 off every d20 for each level and death at the sixth, and a stat block's immunities. The roll service adds those to the model's read of the moment, and the roll card names each source. Unconscious is not stored: it follows from 0 hit points. `dead` and `fled` are two flags of their own. A condition comes only from a roll's stakes, which gained a third and fourth kind beside damage and healing: give a condition, end one. Nothing else gives one, so the NPC outcome's `status` and the round-end patch's `status` are deleted. The patch may only name conditions the round ended (`conditionsEnded`). An Incapacitated character takes no turn. Prone ends when its bearer's own turn begins, unless they cannot stand. A new encounter ends all but Poisoned, Exhaustion and Petrified. The session's calls, which the owner may overrule: the model names a span from three (a turn, a minute, lasting) and each condition has a usual one. Until stage 6 gives positions, a melee attack counts as within 5 feet and a ranged one as farther. Left for later: Initiative does not yet read conditions (a Poisoned hero should roll it with Disadvantage). A stat block action that gives a condition on a hit is not applied, and no stat block in use has one. Blinded and Deafened failing checks of sight and hearing is left to the model, which is shown the roller's conditions. The free-text `effects` list stays until stage 5. `convex/schema.ts` and `convex/story.ts` changed.
9. A turn's budget: one action and one bonus action, with Dodge, Help, Hide, Disengage and Dash as the rules have them. Reactions and movement are counted here and used in stage 6. Done for the action: a turn is one reply, and the model reads it as one action off a fixed menu: an attack, a check, Hide, Dodge, Help, Dash or Disengage (`readAction` in the roll service). `sheet/actions.ts` applies them. Dodge puts Disadvantage on attacks against the dodger and Advantage on their Dexterity saves, until their next turn begins, and gives nothing to one who cannot move. Help gives an ally Advantage on their next check with a skill the helper is proficient in, or on the next attack by an ally against one enemy, and is spent by that roll. Hide is Stealth against 15, set by the engine, for the Invisible condition, which ends when its bearer makes an attack roll. So a Rogue who hides shoots with Advantage and a Sneak Attack. Dash and Disengage are read and recorded and change nothing until stage 6 gives movement. What an action leaves is stored as `turnEffects` on the character. The session's calls, which the owner may overrule: the bonus action is built in substage 10 with the first features that spend one (Second Wind, Bardic Inspiration), since no premade hero carries two Light weapons. Reactions and movement are not counted until stage 6, where something first spends them. Prompt checks, 31 scenes: the model reads a duck and weave as Dodge, backing off with a guard up as Disengage, a sprint as Dash, a shout in a thug's face as Help against him, a held lantern as Help with Investigation, and dropping behind crates as Hide, and still reads creeping past the Owlbear as plain Stealth. `convex/schema.ts` changed.
10. The level 1 fight features of the six classes, as typed sources: a Fighter's Fighting Style, Second Wind and Weapon Mastery, a Rogue's Sneak Attack and Weapon Mastery, a Ranger's Weapon Mastery, and a Bard's Bardic Inspiration. A Cleric's and a Wizard's are spells, which is stage 5. Done so far: a Rogue's Sneak Attack adds its dice to a hit made with Advantage and a Finesse or Ranged weapon (`featureDamage` in `sheet/attack.ts`). Its other way in, an ally beside the target, waits for stage 6. Branka's Defense style was already in her Armor Class.
11. Retune and migrate. Each NPC's stat block is checked against a level 1 party, and encounter notes that give a hit as a DC or a state as a percent are rewritten.
12. Combat on screen, on both hosts: hit points and Armor Class on a hero's card, a wound word on an NPC's, the attack card with its damage dice, the Critical Hit look, and the death save card.
13. Prompt checks. A small fixed set of scenes shows the model reads attacks, targets and weapons sensibly.
14. Close. The Midnight Summons plays on both hosts with rules combat. Old saves are wiped.

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

Stage 1 in progress since 2026-11-11. Stage 2 closed 2026-11-11. Stage 3 built and played on both hosts 2026-11-11: its live deploy and the save wipe wait on the owner.
