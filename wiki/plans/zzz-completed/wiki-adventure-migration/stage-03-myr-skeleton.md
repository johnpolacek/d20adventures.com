# Representative Myr Adventure Skeleton

[Migration index](index.md) · [All plans](../index.md) · [Wiki Home](../../index.md)

**Stage 3 artifact.** A concrete example of the locked content model using `encounter` as the gameplay unit. This is planning evidence, not app content to deploy as-is.

**Reader goal:** After 2 minutes, see how one Myr adventure compiles from authored markdown files into stable adventure, encounter, entity, transition, and validation contracts. See the [Stage 3 spec](stage-03-content-model.md).

## Skeleton Folder

```
content/settings/myr/
  npcs/captain-vala.json
  npcs/captain-vala.md
  locations/old-road-gatehouse.md
  assets/portraits/captain-vala.jpg
  assets/locations/old-road-gatehouse.jpg
  adventures/the-old-road/
    adventure.md
    encounters/gatehouse-entry.md
    characters/vala-apprentice.json
    characters/vala-apprentice.md
    assets/gatehouse-map.json
    assets/encounters/gatehouse-entry.jpg
    assets/characters/vala-apprentice.jpg
    assets/cover.jpg
```

## adventure.md (Manifest)

```markdown
---
id: the-old-road
type: adventure
title: The Old Road
settingId: myr
visibility: published
version: 1
startEncounter: gatehouse-entry
recommendedPlayers: 1
minPlayers: 1
maxPlayers: 4
premadeCharacters:
  - vala-apprentice
nextAdventure: market-shadows
image: assets/cover.jpg
---

## Teaser

A forgotten toll road leads toward the walled city of Myr, where old debts still have teeth.

## Summary

The party reaches [[location:old-road-gatehouse|the Old Road Gatehouse]] and must negotiate entry with [[npc:captain-vala|Captain Vala]]. The intended path introduces social checks, a clear fee-based transition, and one optional conflict branch from [[encounter:gatehouse-entry]].

## Cast And Places

- Start at [[encounter:gatehouse-entry]].
- Featured NPC: [[npc:captain-vala]].
- Featured location: [[location:old-road-gatehouse]].
- Premade character option: [[premadeCharacter:vala-apprentice]].

## Author Notes

This adventure is designed as a first-session test for markdown-authored encounters, reusable setting entities, premade character selection, and transition extraction.
```

## encounters/gatehouse-entry.md (Encounter)

```markdown
---
id: gatehouse-entry
type: encounter
title: Gatehouse Entry
settingId: myr
adventureId: the-old-road
visibility: published
version: 1
location: old-road-gatehouse
npcs:
  - captain-vala
image: assets/encounters/gatehouse-entry.jpg
assets:
  - gatehouse-map
---

## Intro

The old road narrows beneath [[location:old-road-gatehouse|a leaning timber gatehouse]]. [[npc:captain-vala|Captain Vala]] watches from the shade with one hand resting on a cracked spear.

## GM Notes

[[npc:captain-vala|Vala]] is under orders to collect a 3 mark entry fee. She avoids violence, delays suspicious travelers, and becomes more cooperative if the party treats her as a person rather than an obstacle.

## Secrets

Vala has been told to watch for smugglers carrying [[item:silver-ash]]. She will not mention this unless the party earns her trust or directly pressures her about unusual contraband.

## Checks

- DC 12 Insight: Notice Vala is more frightened than hostile.
- DC 13 Persuasion: Convince Vala to reduce or waive the fee.
- DC 14 Intimidation: Force Vala to open the gate, but create trouble with the Gatewardens.

## Transitions

- To [[encounter:market-square-arrival]] when the party pays, persuades Vala, or otherwise gains peaceful entry.
- To [[encounter:outer-road-return]] if the party turns back.
- To [[encounter:gatehouse-conflict]] if the party attacks or seriously threatens Vala.

## Rewards

Gain Vala's cautious trust if the party enters without humiliating or harming her.

## Map Notes

Use [[asset:gatehouse-map]] if tactical positioning is needed.
```

## npcs/captain-vala.json (NPC Sheet)

```json
{
  "id": "captain-vala",
  "type": "npc",
  "name": "Captain Vala",
  "image": "assets/portraits/captain-vala.jpg",
  "archetype": "Gatewarden Captain",
  "race": "Human",
  "gender": "Female",
  "appearance": "Weathered gate captain with a cracked spear and a tired, watchful expression.",
  "personality": "Direct, observant, exhausted, and more compassionate than she first appears.",
  "background": "Long-serving Gatewarden assigned to the Old Road Gatehouse.",
  "motivation": "Keep order without turning desperate travelers into enemies.",
  "behavior": "Avoids violence, tests strangers with pointed questions, and watches for contraband.",
  "healthPercent": 100,
  "attributes": {
    "strength": 10,
    "dexterity": 12,
    "constitution": 11,
    "intelligence": 10,
    "wisdom": 13,
    "charisma": 12
  },
  "skills": ["Insight", "Persuasion"],
  "equipment": [{ "name": "Cracked spear" }],
  "spells": [],
  "specialAbilities": ["Gatewarden authority"],
  "effects": []
}
```

## npcs/captain-vala.md (NPC Profile)

```markdown
---
id: captain-vala
type: npcProfile
title: Captain Vala
settingId: myr
visibility: published
version: 1
sheet: captain-vala.json
---

## Description

Captain Vala is a weathered gate captain stationed at [[location:old-road-gatehouse]]. She has a practical sense of mercy and a deep fear of failing her post.

## Personality

Direct, observant, exhausted, and more compassionate than she first appears.

## Baseline Behavior

Vala avoids violence when possible. In [[encounter:gatehouse-entry]], she tries to preserve order, protect civilians, and report suspicious travelers.

## Stat Block

- Armor Class: 11
- Hit Points: 12
- Speed: 30 ft.
- Proficiency Bonus: +2

## Ability Scores

- Strength 10
- Dexterity 12
- Constitution 11
- Intelligence 10
- Wisdom 13
- Charisma 12

## Skills

- Insight +3
- Persuasion +2

## Dialogue Notes

- Calls strangers "roadfolk."
- Rarely raises her voice.
- Deflects questions about [[item:silver-ash|silver ash]] unless trust is earned.
```

## locations/old-road-gatehouse.md (Location)

```markdown
---
id: old-road-gatehouse
type: location
title: Old Road Gatehouse
settingId: myr
visibility: published
version: 1
image: assets/locations/old-road-gatehouse.jpg
---

## Description

A timber gatehouse leans over the old road, repaired so many times that no beam seems original.

## History

The gatehouse once marked a prosperous trade route. Now it survives as a checkpoint for a poorer, more suspicious city.

## Present State

The road is watched by [[npc:captain-vala]], entry is taxed, and the guards are underpaid. This location is introduced in [[encounter:gatehouse-entry]].
```

## characters/vala-apprentice.json (Premade Sheet)

```json
{
  "id": "vala-apprentice",
  "type": "pc",
  "name": "Vala's Former Apprentice",
  "image": "assets/characters/vala-apprentice.jpg",
  "archetype": "Rogue",
  "race": "Human",
  "gender": "Optional",
  "appearance": "Former Gatewarden apprentice with quick hands, practical clothes, and a habit of checking exits.",
  "personality": "Wry, guarded, and loyal once trust is earned.",
  "background": "You once trained under Captain Vala before leaving the Gatewardens.",
  "motivation": "You need entry into Myr, but Vala knows why you left.",
  "behavior": "Watches routines, avoids direct authority, and looks for quiet ways through problems.",
  "healthPercent": 100,
  "attributes": {
    "strength": 8,
    "dexterity": 15,
    "constitution": 12,
    "intelligence": 13,
    "wisdom": 10,
    "charisma": 14
  },
  "skills": ["Stealth", "Persuasion"],
  "equipment": [{ "name": "Lockpicks", "description": "Worn but reliable." }],
  "spells": [],
  "specialAbilities": ["Gatewarden routines"],
  "effects": []
}
```

## characters/vala-apprentice.md (Premade Profile)

```markdown
---
id: vala-apprentice
type: premadeCharacterProfile
title: Vala's Former Apprentice
settingId: myr
adventureId: the-old-road
visibility: published
version: 1
sheet: vala-apprentice.json
---

## Description

You once trained under [[npc:captain-vala|Captain Vala]] before leaving the Gatewardens.

## Starting Motivation

You need entry into Myr through [[location:old-road-gatehouse]], but [[npc:captain-vala|Vala]] knows why you left.

## Traits

- Quick hands
- Guilty conscience
- Knows Gatewarden routines

## Ability Scores

- Strength 8
- Dexterity 15
- Constitution 12
- Intelligence 13
- Wisdom 10
- Charisma 14

## Skills And Capabilities

- Sneak
- Persuade
- Notice danger
```

## assets/gatehouse-map.json (Asset)

```json
{
  "id": "gatehouse-map",
  "type": "map",
  "title": "Old Road Gatehouse Map",
  "summary": "Simple tactical reference for the gatehouse approach.",
  "zones": [
    { "id": "road", "label": "Old Road" },
    { "id": "gate", "label": "Gate" },
    { "id": "shade", "label": "Guard Shade" }
  ]
}
```

## Expected Extracted Runtime Facts

| Fact | Derived Value |
| --- | --- |
| Adventure key | `settingId=myr`, `adventureId=the-old-road`, `version=1` |
| Start encounter | `gatehouse-entry` |
| Encounter entity refs | `location=old-road-gatehouse`, `npcs=[captain-vala]`, `assets=[gatehouse-map]`, `items=[silver-ash]` |
| Image refs | Adventure cover, encounter image, NPC portrait, location image, and premade character portrait are all represented as full S3 URL asset references from approved buckets/prefixes. |
| Cross-file links | `adventure.md`, `gatehouse-entry.md`, `captain-vala.md`, `old-road-gatehouse.md`, and `vala-apprentice.md` all demonstrate typed links to related files. |
| Premade characters | `vala-apprentice` from adventure manifest and character file. |
| Transition graph | `gatehouse-entry -> market-square-arrival`, `gatehouse-entry -> outer-road-return`, `gatehouse-entry -> gatehouse-conflict` |
| LLM sections | `Intro`, `GM Notes`, `Secrets`, `Checks`, `Transitions`, `Rewards`, and linked NPC/location context. |

## Validation Result For This Skeleton

| Severity | Finding | Reason |
| --- | --- | --- |
| Blocking | Missing transition targets | `market-square-arrival`, `outer-road-return`, and `gatehouse-conflict` are referenced but not included in this minimal one-encounter skeleton. |
| Warning | Missing item file | `[[item:silver-ash]]` demonstrates cross-entity validation, but `items/silver-ash.md` is not included here. |
| Warning | Image assets not expanded | The skeleton references image keys but does not define image metadata files. The compiler should verify that S3 objects exist or that asset IDs resolve. |
| Warning | Map schema provisional | The asset file reserves map shape but does not lock final tactical map schema. |
| Pass | Identity, start encounter, premade character, NPC ref, and location ref are coherent. | The skeleton proves the core authoring model even with intentionally absent branch targets. |

## Decision From Skeleton

The model is coherent, but a publishable adventure cannot contain only one encounter if it references branch targets. The editor should allow this shape in planning-preview mode and report missing targets as draft validation findings. Publish should still require every transition target to resolve to a real or stub encounter.
