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

## Stages

Stages 1 to 9 are built. Each keeps its owner decisions, the calls made in the build that the owner may overrule, where its rules live, and what it left at its close. The full build notes, substage by substage, are in git history: `git show 86ef2d7a:plans/srd-rules.md`.

### 1. Data and license

Done 2026-11-11. SRD 5.2.1 as typed data in `packages/srd` (`@d20/srd`), pure and on Zod alone, with the CC-BY-4.0 line on the site and in the app. The package's README says what it holds, how its checks work, and where the official text disagrees with itself.

- Base source `5e-bits/5e-database` (`src/2024/en`, MIT), cross-checked against Open5e `srd-2024`. The official text settles every disagreement and is committed.
- Both upstream sources hold many errors, so origins, equipment and magic items are built from the official text alone.
- The data takes our own shape, and every entry names its page. A correction is a recorded override citing the official text. Generated data is never edited by hand.
- A typed value that holds only under a condition carries it as `appliesWhen`. `READING.md` holds the reading rules.
- The judge review stopped at 9.1 against the 9.5 aimed for. Its last list was fixed, and the rest was left to the engine stages to test through play.
- Left: `untyped` for monsters, origins and equipment, typed condition durations, one shape for ideas classes and origins still type apart. Typed values above level 1 are verified on first use.

### 2. The sheet

Done 2026-11-11. `packages/gm-core/src/sheet`: one pure function derives hit points, Armor Class, saves and skills from the sheet and `@d20/srd`. `sheetView` in `view.ts` lists features and their uses.

- The Midnight Summons is the reference adventure for migration and playtests.
- Old saves are wiped, not migrated. Play is with premade heroes only.
- Each NPC names an SRD stat block (`statBlock`). One that names none is a Commoner.
- NPC cards keep their numbers hidden.

### 3. Checks

Done 2026-11-11. The model picks a skill, ability or save off a fixed menu (`checkMenu` in `sheet/check.ts`), a difficulty from the SRD ladder and a mode. The engine adds the bonus (`checkBonus`, `resolveCheck`). The situational modifier call is gone.

- A natural 20 or 1 has no special effect on a check. The player still sees the target number.
- Advantage and Disadvantage replace any free modifier. Typed sources such as armor that hinders Stealth add them with no model.
- Prompt checks live in `apps/desktop/scripts/check-probes.json`, graded by rule with no second model.
- Left: tool proficiency is not typed, so a lock is a bare Dexterity check.

### 4. Combat

Done 2026-11-12. Attacks, damage, hit points, initiative, death saves, conditions and a turn's actions are the engine's: `attack.ts`, `hit-points.ts`, `death.ts`, `conditions.ts`, `actions.ts`, `stakes.ts`, `harm.ts`, `hiding.ts`. Only the engine changes hit points, on both hosts.

Owner decisions, 2026-11-11:

- The player throws only d20s. The engine rolls damage dice and the card shows them.
- Death saving throws run in every adventure. Where player death is off, a third failure leaves the hero Stable at 0, not dead.
- The Owlbear of The Midnight Summons keeps its stat block. The scene is about getting past it, calming it or being rescued.
- Harm outside an attack comes off a ladder the model picks and the engine rolls: light 1d4, moderate 1d8, heavy 2d6, severe 4d6. Dice printed in an encounter's notes are used as printed.
- Owner's choice, 2026-11-12: on the main path Reinhard and Barok are Toughs. Silverhand, Kaeleth and Mizrith keep their Mage blocks, as people the heroes should not attack.

The session's calls:

- The player sees the Armor Class an attack is rolled against.
- Initiative is rolled once as an encounter starts. An authored `initialInitiative` stays as that NPC's fixed place.
- Hit points are stored. Health percent is a copy only the engine writes, kept while anything reads it.
- A check or save carries its stakes, settled before the die is thrown. A condition comes only from stakes.
- A condition's span is a turn, a minute or lasting. Unconscious follows from 0 hit points and is not stored. `dead` and `fled` are flags.
- A new encounter ends all conditions but Poisoned, Exhaustion and Petrified.
- An NPC shows one wound word (Unhurt, Hurt, Bloodied, Dead), never a number.
- An attack with no target named lands on the only one here.

Left at close: harm with no roll (a potion, a hazard at a round's end) had no path. Initiative did not read conditions. Blinded and Deafened failing checks of sight and hearing is left to the model. Hide reads no light, which is T2 below.

### 5. Spellcasting

Done 2026-11-12. `spells.ts`, `spell-effects.ts`: save DC and spell attack, slots stored as used (`spellSlots`), casting off the menu by id, concentration, lasting effects, Temporary Hit Points, and NPC casting from a stat block's Spellcasting action.

Owner decisions, 2026-11-12:

- Each caster's list is rebuilt by the rules from its class's list.
- Real spell slots. Cantrips are free.
- A hero's save against an NPC's spell is rolled by the game, not thrown by the player, so an NPC's turn never waits.

The session's calls:

- A spell's typed data decides who resolves it. With an attack, save, damage, healing, condition, roll modifier or Armor Class it is the engine's. Any other is told by the GM, bound by the spell's text, after the engine checks it can be cast and spends the slot.
- A ritual is cast with no slot when the scene is not a fight.
- Only one spell a turn takes a slot.
- An NPC may carry a rules sheet in place of a stat block, and then casts as a hero does.

Left at close: a Bardic Inspiration die is not rolled on a missed spell attack. The card does not show a Ranger's free Hunter's Mark casts. The site's model missed "as a ritual" once and spent a slot. A cast the game refuses still stands in the story as the player wrote it.

### 6. Space

Done 2026-11-12. Positions in feet on the character, written only by the engine. `space.ts`, `placement.ts`, `moves.ts`, `spell-space.ts`. Floor plans are generated from the 3D sets by `pnpm stage:plans` into `packages/stage/src/plans` and reach the engine through the content port's `floor`.

Owner decisions, 2026-11-12:

- One map for both hosts: the authored 3D sets and their stagings. The site's generated grid maps left play.
- The site draws a plain top-down plan with moving tokens (`components/floorplan`).
- Cover is worked out from the set's solid things. The GM may add cover the set does not hold, and the greater stands.
- A hero's reaction is asked of the player, never taken for them.

The session's calls:

- Feet on a flat plane, no elevation. A creature stands at the centre of a round space its size's square wide.
- Distance reads as a grid would, and half a foot either way still counts as within reach or range.
- An area catches a creature whose centre is in it. A cone, cube or line starts at the edge of its caster's space.
- A walk takes the shortest clear way by the floor's doorways and named places, in as many legs as it needs.
- Where the next encounter is on the same set and stages a character where the last did, they stay where they stood.
- The GM is told of space in the same words on both hosts (`standingWords`).

Left at close: a hero's own outcome prompt is not told where everyone stands. Water, the riverboat's hull and its rail are not solid. A ruling gives the straight distance to one behind a wall. The spells that change Speed are not typed.

### 7. Rest and levelling

Done 2026-11-12. Reactions (`reactions.ts`), rests (`rest.ts`), levels 2 to 5 (`level-up.ts`), milestones (`milestone.ts`), and the shared level-up screen (`components/stage/level-up.tsx`).

Owner decisions, 2026-11-12:

- Rests: a rest the adventure marks always happens, and one the players ask for happens when the GM judges the scene safe.
- Levelling is by milestone, with no experience points. The Midnight Summons, Covert Cargo and The Road to Kordavos are played at level 1, Welcome to Kordavos at level 2.
- A player makes their own level-up choices on the level-up screen.
- A reaction is offered, the round waits a short time, then the hero's standing order is followed. Nothing ever blocks.

The session's calls:

- The wait is 20 seconds. Default orders: take every Opportunity Attack, cast Shield when it turns a hit to a miss, Uncanny Dodge on a hit of a quarter of the hero's hit points or one that would drop them.
- NPCs take their reactions by the same orders, with no wait.
- A level gives the fixed hit points, not a roll.
- A rest asked for in play is read off the menu, and the engine refuses it in a fight. An encounter's `rest: short` or `rest: long` is taken as it first opens.
- Moving to a new encounter gives nothing back.
- An adventure's end gives the level the next adventure is played at (`levelDue`). An AI companion takes it at once by `autoChoices`.
- Owner decision, 2026-11-25: levels come mid-adventure too, as BG3 gives them mid-act. An encounter's `level: N` raises the party to N the first time they come to it. The compiler refuses one on the start encounter or at or below the adventure's level.

Left at close: a Stable hero does not wake after 1d4 hours. No guard on how often a Long Rest is asked for. Standing orders in hosted play. A hero above an adventure's level plays it as they are.

### 8. The hero creator

Done 2026-11-12. `sheet/create.ts` (`creationMenu`, `createSheet`, `autoCreate`, `heroRecord`), `character/hero-make.ts`, and the shared screen `apps/desktop/src/hero-creator.tsx`.

Owner decisions, 2026-11-12:

- The SRD has no Half-Elf or Half-Orc, so the game has its own, in `sheet/house-species.ts`, kept apart from the SRD data.
- The faith of the March of Davos is Valkara. Other faiths may be invented.

The session's calls:

- Standard Array placed by the player, with the background's increase. No rolling, no point cost.
- The four SRD backgrounds. A hero is made at level 1.
- The model writes only the story. Scores, skills, gear and spells come from the sheet.
- The screen sends choices, never a sheet. Both hosts rebuild the sheet at save, and a hero's rules are not edited afterwards.
- An adventure's lists of races and classes stay as authored. The creator offers those the rules can make.

Left at close: tool proficiencies, starting coin and a Gnome's level 1 spell are not fitted.

### 9. Breadth

Done 2026-11-14. All twelve classes at levels 1 to 20, monsters, magic items, and spell labels for all 339 spells. Class rules live in `sheet/classes/`, one file each, registered through `class-rules.ts`. Spell rules live in `sheet/spell-mechanics/`, and the shared cast path names no spell.

- Owner decision, 2026-11-13: the order was the six other classes to level 5, then monsters, then magic items, then levels 6 to 20 with spells of levels 4 to 9.
- An encounter marks an NPC `side: party` or `side: none`. Unmarked is a foe (`sides.ts`).
- No Opportunity Attack while no fight is on (`moveWithReactions`, `fight: false`), added 2026-11-22.
- Ammunition is spent and a Thrown weapon lands by its target (`ammunition.ts`), added 2026-11-26. Counts start from the equipment's free-text names and live on `sheet.stock` once spent. One lying within 5 feet is picked up as the hero attacks. A won fight gathers the thrown ones and half the ammunition.
- `spellLabel` names each spell run, partly run or told. One named nowhere is told.
- An encounter's `loot` is given by the engine. The GM invents no magic item.
- Plain rules spend a resource the way a careful player would: Legendary Resistance, Heroic Inspiration, Stroke of Luck.
- What it left is stage 10.

### 10. What stage 9 left

Started 2026-11-23. Four substages, each built in its own orb at the same time, so each keeps to its own files and adds only its own lines to shared ones. Each writes its own note here when it is done.

- T1. Told spells of levels 0 to 3 that change a fight. Of the 79 told at these levels, run or partly run the ones whose effect the engine already has a home for: True Strike, Resistance, Divine Favor, Hellish Rebuke, Sanctuary, Goodberry, Expeditious Retreat, Longstrider, Jump, Enlarge/Reduce, Dragon's Breath, Gust of Wind, Spider Climb, Calm Emotions, Fly, Blink if a round allows it, Glyph of Warding, Animate Dead. Information, travel and illusion stay told.
- T2. Sight and light. An encounter says how it is lit, and sight tells Darkness from fog: Devil's Sight, One with Shadows, Witch Sight, Darkvision as a spell, See Invisibility, Daylight, Sunlight Sensitivity, and the Darkness spell.
- T3. Monster blocks the engine does not read yet: the 90 of 146 save, area, Recharge and uses-a-day actions, the 55 of 82 Legendary options that cast or force a save, the Bonus Actions that carry a save, an attack or damage, and the 23 hit riders with words left over. Blocks in the four adventures first.
- T4. The class pieces left: a smite on an Extra Attack, Wild Companion, Gift of the Protectors, and the swap of a known Wild Shape form on a Long Rest, asked on both hosts' rests.

## Unknowns

- How well the model reads prose into a rules action beyond the prompt checks, which run on the local Claude CLI and not the site's model.

## Status

Stages 1 to 9 built and played on both hosts, 2026-11-11 to 2026-11-14, and live with the owner's deploy of 2026-11-14. Stage 10 started 2026-11-23.
