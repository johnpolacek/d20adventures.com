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

No stage started.
