# Wiki Content Model Specification

[Migration index](index.md) · [All plans](../index.md) · [Wiki Home](../../index.md)

**Stage 3.** Locked planning direction for the S3-backed markdown adventure model. The gameplay content unit is `encounter`, not `page`, so the relaunch preserves the current turn-loop concept while moving authored source into human-writable wiki files.

**Reader goal:** After 2 minutes, know the canonical folder model, file types, frontmatter contract, link conventions, validation posture, and next planning artifact. See also the [Representative Myr Adventure Skeleton](stage-03-myr-skeleton.md).

## Locked Decisions

- **Gameplay unit:** `encounter` remains the active gameplay content unit and replaces old JSON encounters with markdown-authored encounter files.
- **Source of truth:** S3 wiki markdown files are canonical authored content; runtime reads compiled published indexes.
- **Entity reuse:** NPCs, locations, factions, and items are setting-level by default; premade characters and assets are adventure-level by default.

## Canonical S3 Layout

```
content/
  settings/
    myr/
      setting.md
      npcs/
        captain-vala.md
      locations/
        old-road-gatehouse.md
      factions/
        gatewardens.md
      items/
        silver-ash.md
      adventures/
        the-old-road/
          adventure.md
          encounters/
            gatehouse-entry.md
            market-square-arrival.md
            shrine-steps.md
          characters/
            vala-apprentice.md
          assets/
            gatehouse-map.json
            cover.jpg
```

Setting-level files are reusable across adventures. Adventure-level files are specific to one adventure and may reference reusable setting entities through typed wiki links or frontmatter references.

## Authored File Types (V1)

Support `setting`, `adventure`, `encounter`, `npc`, `location`, `premadeCharacter`, `faction`, and `item`. Defer `quest`, `lore`, `rule`, and first-class `map` files unless later stages prove they are needed.

## Encounter As Active Runtime Unit

The current adventure instance should pin to `currentEncounterId` plus a published content version. This preserves existing prompt, turn, NPC, and transition concepts while avoiding old JSON authoring constraints.

## Human-Writable Markdown

Required frontmatter provides stable identity and validation. Markdown sections carry gameplay meaning through conventions instead of rebuilding a rigid form-first JSON editor.

## Required Frontmatter

```yaml
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
---
```

All files require `id`, `type`, `title`, `settingId`, `visibility`, and `version`. Adventure-owned files also require `adventureId`. Optional common keys include `summary`, `tags`, `image`, and `updatedAt`.

## Typed Wiki Links

```
[[encounter:market-square-arrival]]
[[npc:captain-vala]]
[[location:old-road-gatehouse]]
[[item:silver-ash]]
[[asset:gatehouse-map]]
[[npc:captain-vala|Captain Vala]]
```

Typed links are the canonical authoring and validation syntax. Markdown links may still appear in prose, but only typed wiki links participate in validation and runtime graph extraction.

## Ruleset Attributes

Character sheet JSON should use the standard six abilities from the current open D&D SRD 5.2 rules reference: Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma. Paired markdown profiles may summarize these scores for readability, but the compiled runtime model should normalize from the JSON sheet's `attributes` keys.

```yaml
attributes:
  strength: 10
  dexterity: 12
  constitution: 11
  intelligence: 10
  wisdom: 13
  charisma: 12
```

Additional RPG fields such as hit points, armor class, speed, proficiency bonus, skills, saving throws, senses, languages, actions, and traits may be added where useful, but they should not replace the six canonical abilities.

## Character Field Contract

Character sheets should remain JSON source-of-truth files for default mechanical state. Markdown character files are wiki profiles that link to a sheet and provide narrative role, cross-links, usage notes, and retrieval context. This preserves the existing character creator, character editor, and character sheet modal behavior while letting the wiki model describe how characters fit into adventures.

```
content/settings/myr/npcs/captain-vala.json
content/settings/myr/npcs/captain-vala.md

content/settings/myr/adventures/the-old-road/characters/vala-apprentice.json
content/settings/myr/adventures/the-old-road/characters/vala-apprentice.md
```

`premadeCharacter` JSON sheets compile to the existing `PCTemplate` shape. `npc` JSON sheets compile to the existing `NPC` shape. The paired markdown profile uses frontmatter such as `sheet: vala-apprentice.json` or `sheet: captain-vala.json` and should not duplicate the full mechanical sheet unless doing so is useful for readable summary.

```json
{
  "id": "vala-apprentice",
  "type": "pc",
  "name": "Vala's Former Apprentice",
  "image": "assets/characters/vala-apprentice.jpg",
  "archetype": "Rogue",
  "race": "Human",
  "appearance": "Former Gatewarden apprentice with quick hands and tired eyes.",
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

Required existing schema fields for PC templates are `id`, `name`, `image`, `archetype`, `race`, `appearance`, `healthPercent`, `type`, and complete `attributes`. Optional existing fields include `gender`, `personality`, `background`, `motivation`, `behavior`, `equipment`, `skills`, `spells`, `specialAbilities`, and `effects`. NPCs use the same base fields, but their `attributes` may be partial or omitted to match the current schema.

## Image And Asset References

NPCs, premade PCs, locations, encounters, settings, adventures, items, factions, and other authored entities should support S3 image references. The canonical field is `image` in frontmatter for the primary image. Additional images, maps, portraits, and handouts may be represented with `assets` frontmatter or typed `[[asset:id]]` links in markdown.

```yaml
image: https://s3.amazonaws.com/d20adventures-content/content/settings/myr/assets/portraits/captain-vala.jpg
assets:
  - gatehouse-map
  - vala-token
```

Image values should be full S3 URLs from approved buckets/prefixes. The compiler validates bucket/prefix allowlists, object existence, content type, and accessibility. The model should stay format-neutral and allow ordinary web image formats such as `.jpg` and `.png`. Publish validation should warn for missing referenced image assets and block only when a required runtime surface depends on that image.

## Cross-Linking Rule

Markdown files should link to related authored files wherever the relationship matters to readers, editors, validation, or retrieval. Frontmatter references remain the machine-friendly source for core ownership and runtime relationships, while typed wiki links make the wiki navigable and give the compiler additional retrieval signals.

```
adventure.md summary links to [[encounter:gatehouse-entry]], [[npc:captain-vala]], and [[location:old-road-gatehouse]]
encounters/gatehouse-entry.md links to its NPC, location, transition targets, item clues, and assets
npcs/captain-vala.md links back to the encounter and location where she appears
locations/old-road-gatehouse.md links to notable NPCs and encounters
characters/vala-apprentice.md links to relevant NPCs, locations, and starting encounter context
```

Cross-links are encouraged and validated when typed. Missing reciprocal links should be warnings or suggestions, not publish blockers, unless later runtime retrieval proves they are required.

## Adventure Manifest

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

The party reaches the gatehouse, negotiates entry, discovers unrest near the market, and chooses whether to help the Gatewardens or slip into the city unseen.

## Author Notes

This introductory adventure tests social checks, simple transitions, and one optional conflict.
```

`adventure.md` owns adventure metadata, start encounter, player count, premade character list, next adventure, cover image, teaser, and summary. It does not own every NPC, transition, or encounter detail.

## Encounter Markdown Convention

```markdown
## Intro

Player-safe opening situation text.

## GM Notes

Operational context for the AI Game Master.

## Secrets

Hidden facts that may be revealed through play.

## Checks

- DC 12 Insight: Notice Vala is more frightened than hostile.
- DC 13 Persuasion: Convince Vala to reduce or waive the fee.

## Transitions

- To [[encounter:market-square-arrival]] when the party enters Myr.
- To [[encounter:outer-road-return]] if the party turns back.
- To [[encounter:gatehouse-conflict]] if the party attacks or seriously threatens Vala.

## Rewards

Consequences, relationship changes, or useful gains.

## Map Notes

Use [[asset:gatehouse-map]] if tactical positioning is needed.
```

Required encounter sections are `Intro`, `GM Notes`, and `Transitions`. Recommended sections are `Secrets`, `Checks`, `Rewards`, `Map Notes`, and `Author Notes`.

## Draft, Publish, And Versioning

Authored files use `visibility` for editor status. Runtime reads published compiled snapshots, not raw draft markdown.

```
published/settings/myr/adventures/the-old-road/v1/
  manifest.json
  encounters.json
  entities.json
  graph.json
  retrieval-index.json
```

Live Adventures pin to `settingId`, `planId`, timestamp/hash `contentVersion`, and `currentEncounterId`. Existing Adventures should not silently switch to newer Adventure Plan content.

## Derived Runtime Index

```typescript
type PublishedAdventureIndex = {
  settingId: string
  adventureId: string
  version: number
  title: string
  startEncounterId: string
  encounters: Record<string, RuntimeEncounter>
  npcs: Record<string, RuntimeNpc>
  locations: Record<string, RuntimeLocation>
  premadeCharacters: Record<string, RuntimePremadeCharacter>
  graph: RuntimeTransition[]
}
```

The turn loop should consume compiled structured indexes and selected markdown section text. It should not parse raw markdown on every turn.

## Validation Rules

| Severity | Rules |
| --- | --- |
| Publish-blocking | Missing required frontmatter; invalid type; duplicate IDs in scope; missing `adventure.md`; missing `startEncounter`; start encounter missing; broken typed wiki link to a required entity; transition target missing in publish mode; encounter missing `Intro`, `GM Notes`, or `Transitions`; adventure references missing premade character sheet; invalid required character sheet JSON. |
| Warning | Encounter has no NPC refs; missing optional paired profile; check format could not be parsed; asset reference missing; unused or unreachable encounter; unknown section heading; missing summary. |
| Ignored | Freeform prose style; heading order; extra sections; unparsed stat lines; non-runtime Markdown links in body prose. |

## Draft Preview Exception

The editor may allow planning-preview skeletons with unresolved transition targets. Missing target encounters remain publish-blocking, but they should be surfaced as draft validation findings rather than preventing authors or AI editors from sketching incomplete adventure graphs.

## AdventurePlan Migration Mapping

| Current JSON | Wiki Model |
| --- | --- |
| `AdventurePlan.title`, `teaser`, `image`, `nextAdventure` | `adventure.md` frontmatter and body sections. |
| `sections/scenes` | Grouping metadata only unless later stages need first-class files. |
| `encounters[]` | `encounters/*.md` files. |
| `encounter.intro`, `instructions`, `transitions` | `Intro`, `GM Notes`, and `Transitions` sections. |
| `AdventurePlan.npcs` | Setting-level `npcs/*.json` sheets plus paired `npcs/*.md` profiles unless clearly adventure-specific. |
| `premadePlayerCharacters` | Adventure-level `characters/*.json` sheets plus paired `characters/*.md` profiles. |
| Maps and media | Adventure-level `assets/*` referenced by typed wiki links and optional frontmatter. |

## Next Stage 3 Artifact

The [Representative Myr Adventure Skeleton](stage-03-myr-skeleton.md) proves the model end to end: `adventure.md`, one `encounters/*.md` gameplay unit, one reusable NPC, one reusable location, one premade character, transition examples, and validation notes. This remains a planning/wiki artifact unless explicitly promoted into app implementation.
