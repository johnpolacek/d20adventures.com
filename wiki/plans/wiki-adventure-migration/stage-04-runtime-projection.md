# Stage 4 - Runtime Projection And Index Strategy
[Migration index](index.md) · [All plans](../index.md) · [Wiki Home](../../index.md)

**Stage 4.** Define the derived index that lets the app run reliably from loose-ish wiki content without making Convex the authored source of truth. Reader goal: after a couple of minutes, understand what must be compiled from S3 wiki files before gameplay can start.

## Stage Units

### Unit 01 - Index shape
Specify encounters, links, content types, titles, summaries, image refs, standard ability scores, NPC refs, location refs, transition candidates, map refs, character options, validation status, and content hashes.

**Verification:** Index fields map to actual gameplay, authoring, UI rendering, asset validation, or prompt retrieval needs.

### Unit 02 - Validation model
Define fatal errors, warnings, suggestions, and AI-fixable issues for broken links, duplicate IDs, missing start encounter, bad frontmatter, unreachable encounters, and missing referenced NPCs.

**Verification:** Validation rules support draft planning preview, publish blocking, and AI-assisted repair.

### Unit 03 - Publish/index strategy
Decide manual publish compilation vs request-time parse vs hybrid cache. Preferred option to test: draft files in S3, publish compiles derived index artifact and validation report.

**Verification:** Strategy has clear cache invalidation, rollback, and preview behavior.

### Unit 04 - S3 contract
Define bucket key layout, versioning, draft/published prefixes, generated index paths, image and asset paths, and access policy expectations.

**Verification:** S3 paths support settings, adventures, Myr templates, reusable entity images, encounter art, maps, and future creator-owned content.

## Unit 01 Decision - Compiled Artifact Set

Publishing an adventure should produce a versioned runtime projection. Runtime code should read these compiled artifacts instead of parsing source markdown or character sheet JSON during every turn.

```
published/settings/{settingId}/adventures/{adventureId}/{timestamp}-{hash}/
  manifest.json
  encounters.json
  entities.json
  character-sheets.json
  graph.json
  retrieval-index.json
  validation-report.json
```

| Artifact | Primary Consumer | Purpose |
| --- | --- | --- |
| `manifest.json` | Adventure selection, start flow, lobby, publish UI | Adventure identity, version, start encounter, player counts, cover image, premade character IDs, next adventure, content hashes, validation status. |
| `encounters.json` | Gameplay runtime, LLM context assembler, author preview | Compiled encounter records with extracted markdown sections, refs, image/assets, checks text, transition candidates, source path, and content hash. |
| `entities.json` | Context assembler, wiki browser, validator | Setting/adventure entities such as locations, NPC profiles, premade character profiles, factions, items, and assets as linked retrieval/context nodes. |
| `character-sheets.json` | Character selection, session start, NPC instantiation | Validated `PCTemplate` and `NPC` baselines from JSON sheets, plus profile links and sheet hashes. |
| `graph.json` | Transition validation, editor graph view, LLM transition guardrails | Directed encounter transition graph plus typed cross-link graph for entities and retrieval. |
| `retrieval-index.json` | LLM context assembler | Small deterministic records for selecting prompt context by current encounter, linked entities, tags, summaries, and recent session state. |
| `validation-report.json` | Editor, publish gate, CI-style checks | Draft-preview and publish validation findings with paths, severity, codes, messages, and AI-fix hints. |

## Manifest Shape

```json
{
  "schemaVersion": 1,
  "settingId": "myr",
  "adventureId": "the-old-road",
  "contentVersion": "2026-05-21T22-30-00Z-ab12cd34",
  "title": "The Old Road",
  "teaser": "A forgotten toll road leads toward the walled city of Myr.",
  "summary": "The party reaches the Old Road Gatehouse and must negotiate entry.",
  "image": "assets/cover.jpg",
  "startEncounterId": "gatehouse-entry",
  "recommendedPlayers": 1,
  "minPlayers": 1,
  "maxPlayers": 4,
  "premadeCharacterIds": ["vala-apprentice"],
  "nextAdventureId": "market-shadows",
  "sourcePath": "content/settings/myr/adventures/the-old-road/adventure.md",
  "publishedAt": "ISO-8601 timestamp",
  "contentHash": "hash of source manifest and referenced compile inputs",
  "validation": {
    "mode": "publish",
    "status": "blocked | passed | passedWithWarnings",
    "errorCount": 0,
    "warningCount": 0
  }
}
```

## Encounter Index Shape

```json
{
  "gatehouse-entry": {
    "id": "gatehouse-entry",
    "type": "encounter",
    "title": "Gatehouse Entry",
    "settingId": "myr",
    "adventureId": "the-old-road",
    "contentVersion": "2026-05-21T22-30-00Z-ab12cd34",
    "sourcePath": "content/settings/myr/adventures/the-old-road/encounters/gatehouse-entry.md",
    "sourceHash": "hash",
    "image": "assets/encounters/gatehouse-entry.jpg",
    "assetIds": ["gatehouse-map"],
    "locationId": "old-road-gatehouse",
    "npcRefs": [
      { "id": "captain-vala", "behavior": "optional encounter override", "initialInitiative": 0 }
    ],
    "sections": {
      "intro": "Player-safe opening situation text.",
      "gmNotes": "Operational context for the AI Game Master.",
      "secrets": "Hidden facts that may be revealed through play.",
      "checks": "- DC 12 Insight: Notice Vala is more frightened than hostile.",
      "transitions": "- To [[encounter:market-square-arrival]] when ...",
      "rewards": "Consequences, relationship changes, or useful gains.",
      "mapNotes": "Use [[asset:gatehouse-map]] if tactical positioning is needed."
    },
    "summary": "Short compiler or author summary for lists and retrieval.",
    "typedLinks": [
      { "type": "location", "id": "old-road-gatehouse" },
      { "type": "npc", "id": "captain-vala" },
      { "type": "item", "id": "silver-ash" },
      { "type": "asset", "id": "gatehouse-map" }
    ],
    "transitions": [
      {
        "toEncounterId": "market-square-arrival",
        "condition": "the party pays, persuades Vala, or otherwise gains peaceful entry",
        "label": "Peaceful Entry",
        "sourceText": "To [[encounter:market-square-arrival]] when ..."
      }
    ],
    "validationStatus": "valid | draftOnly | blocked"
  }
}
```

The runtime should treat extracted sections and transitions as the primary prompt context for the active encounter. Raw markdown can be retained for editor preview, but turn processing should prefer extracted sections.

## Entities Index Shape

`entities.json` stores linked non-encounter context nodes. Character profiles live here; character mechanics live in `character-sheets.json`.

```json
{
  "locations": {
    "old-road-gatehouse": {
      "id": "old-road-gatehouse",
      "type": "location",
      "title": "Old Road Gatehouse",
      "sourcePath": "content/settings/myr/locations/old-road-gatehouse.md",
      "image": "assets/locations/old-road-gatehouse.jpg",
      "summary": "A repaired timber checkpoint on the old road.",
      "sections": {
        "description": "...",
        "history": "...",
        "presentState": "..."
      },
      "typedLinks": [
        { "type": "npc", "id": "captain-vala" },
        { "type": "encounter", "id": "gatehouse-entry" }
      ],
      "sourceHash": "hash"
    }
  },
  "npcProfiles": {
    "captain-vala": {
      "id": "captain-vala",
      "type": "npcProfile",
      "title": "Captain Vala",
      "sheetId": "captain-vala",
      "sheetPath": "content/settings/myr/npcs/captain-vala.json",
      "sourcePath": "content/settings/myr/npcs/captain-vala.md",
      "summary": "Gatewarden captain at the Old Road Gatehouse.",
      "typedLinks": [
        { "type": "location", "id": "old-road-gatehouse" },
        { "type": "encounter", "id": "gatehouse-entry" }
      ],
      "sourceHash": "hash"
    }
  },
  "premadeCharacterProfiles": {},
  "factions": {},
  "items": {},
  "assets": {
    "gatehouse-map": {
      "id": "gatehouse-map",
      "type": "map",
      "path": "content/settings/myr/adventures/the-old-road/assets/gatehouse-map.json",
      "title": "Old Road Gatehouse Map",
      "sourceHash": "hash"
    }
  }
}
```

## Character Sheets Index Shape

```json
{
  "premadeCharacters": {
    "vala-apprentice": {
      "sheet": {
        "id": "vala-apprentice",
        "type": "pc",
        "name": "Vala's Former Apprentice",
        "image": "assets/characters/vala-apprentice.jpg",
        "archetype": "Rogue",
        "race": "Human",
        "appearance": "...",
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
        "equipment": [],
        "spells": [],
        "specialAbilities": [],
        "effects": []
      },
      "sheetPath": "content/settings/myr/adventures/the-old-road/characters/vala-apprentice.json",
      "profilePath": "content/settings/myr/adventures/the-old-road/characters/vala-apprentice.md",
      "sheetHash": "hash",
      "profileHash": "hash"
    }
  },
  "npcs": {
    "captain-vala": {
      "sheet": "validated NPC object",
      "sheetPath": "content/settings/myr/npcs/captain-vala.json",
      "profilePath": "content/settings/myr/npcs/captain-vala.md",
      "sheetHash": "hash",
      "profileHash": "hash"
    }
  }
}
```

User-created saved characters remain at `characters/{userId}/{characterId}.json` and are not included in published adventure artifacts. They are validated and copied into Convex only when a player selects them.

## Graph And Retrieval Shapes

```json
{
  "graph": {
    "startEncounterId": "gatehouse-entry",
    "encounterTransitions": [
      {
        "from": "gatehouse-entry",
        "to": "market-square-arrival",
        "condition": "the party gains peaceful entry",
        "publishResolved": false
      }
    ],
    "typedLinks": [
      { "fromType": "encounter", "from": "gatehouse-entry", "toType": "npc", "to": "captain-vala" },
      { "fromType": "encounter", "from": "gatehouse-entry", "toType": "location", "to": "old-road-gatehouse" }
    ]
  },
  "retrievalRecords": [
    {
      "id": "encounter:gatehouse-entry",
      "kind": "encounter",
      "title": "Gatehouse Entry",
      "summary": "The party negotiates entry at the gatehouse.",
      "sourcePath": "content/settings/myr/adventures/the-old-road/encounters/gatehouse-entry.md",
      "tags": [],
      "linkedRecordIds": ["npc:captain-vala", "location:old-road-gatehouse"],
      "promptSections": ["intro", "gmNotes", "secrets", "checks", "transitions"]
    }
  ]
}
```

The retrieval index is not an embedding store in Unit 01. It is a deterministic prompt-selection index. Later implementation may add embeddings, but gameplay should first work from current encounter, graph links, profile links, and recent Convex session state.

## Unit 01 Open Questions

| Question | Default For Plan | Why It Matters |
| --- | --- | --- |
| Should `entities.json` and `character-sheets.json` remain separate? | Yes. | Separating narrative profiles from mechanical sheets keeps character sheet behavior stable and avoids making retrieval code own game mechanics. |
| Should published artifacts include full raw markdown? | Only if needed for editor preview; runtime should prefer extracted sections. | Limits prompt assembly ambiguity and keeps runtime parsing deterministic. |
| Should unresolved transition targets appear in `graph.json` during draft preview? | Yes, with `publishResolved: false`. | Supports planning-preview skeletons while preserving publish gates. |

## Unit 02 Decision - Validation Modes

Validation should run in two explicit modes. `draftPreview` supports sketching incomplete adventure graphs and AI-assisted repair. `publish` is the hard gate for creating immutable published runtime artifacts.

| Mode | Allowed Output | Blocking Behavior |
| --- | --- | --- |
| `draftPreview` | Preview indexes, graph view, validation report, AI repair suggestions | Never creates published artifacts. Missing transition targets, missing optional profiles, and unresolved asset objects can remain as findings. |
| `publish` | Versioned artifacts under `published/settings/{settingId}/adventures/{adventureId}/{timestamp}-{hash}/` | Fails if any `error` finding exists. Warnings and suggestions are allowed but recorded in `validation-report.json`. |

## Validation Finding Shape

```json
{
  "mode": "publish",
  "status": "blocked",
  "summary": {
    "errorCount": 2,
    "warningCount": 3,
    "suggestionCount": 4
  },
  "findings": [
    {
      "code": "transition.target.missing",
      "severity": "error",
      "sourcePath": "content/settings/myr/adventures/the-old-road/encounters/gatehouse-entry.md",
      "sourceId": "gatehouse-entry",
      "sourceType": "encounter",
      "message": "Transition target market-square-arrival does not resolve to an encounter.",
      "target": { "type": "encounter", "id": "market-square-arrival" },
      "aiFixable": true,
      "suggestedFix": {
        "type": "createStubEncounter",
        "path": "content/settings/myr/adventures/the-old-road/encounters/market-square-arrival.md"
      }
    }
  ]
}
```

Every finding should include a stable `code`, severity, source path, source ID/type when known, human-readable message, AI-fixability, and optional suggested fix metadata.

## Publish-Blocking Errors

| Code | Meaning | Typical Fix |
| --- | --- | --- |
| `frontmatter.required.missing` | A markdown source is missing required identity/frontmatter fields. | Add required `id`, `type`, `title`, `settingId`, `visibility`, or `version`. |
| `frontmatter.type.invalid` | A markdown type is not in the supported content model. | Correct type or add an explicit model decision before implementation. |
| `id.duplicate` | Two sources define the same ID in a scope where IDs must be unique. | Rename one source and update typed links. |
| `adventure.manifest.missing` | Adventure folder has no `adventure.md`. | Create manifest. |
| `adventure.startEncounter.missing` | Manifest has no `startEncounter`. | Add start encounter ID. |
| `adventure.startEncounter.invalid` | Start encounter does not resolve. | Create or rename encounter; update manifest. |
| `encounter.section.required.missing` | Encounter is missing `Intro`, `GM Notes`, or `Transitions`. | Add required section. |
| `transition.target.missing` | Encounter transition target does not resolve in publish mode. | Create target encounter or change transition. |
| `wikilink.target.missing` | Typed wiki link points to a missing required entity. | Create target or fix link. |
| `character.sheet.invalid` | Premade PC or NPC JSON sheet does not validate against the existing character schema. | Fix JSON sheet fields. |
| `character.sheet.missing` | Manifest/profile/encounter references a required character sheet that is absent. | Create sheet JSON or fix reference. |
| `character.premade.missing` | Adventure manifest references a premade character ID that does not resolve to a premade sheet. | Add `characters/{id}.json` or update manifest. |
| `json.parse.failed` | JSON source cannot be parsed. | Fix JSON syntax. |

## Warnings And Suggestions

| Severity | Code | Meaning |
| --- | --- | --- |
| Warning | `asset.reference.missing` | Referenced image/map/asset is not found or cannot be resolved. Publish may continue unless a required UI/runtime surface depends on it. |
| Warning | `profile.sheet.unpaired` | A character profile has no paired sheet or a sheet has no paired profile. Sheet-only can be valid; profile-only should usually be repaired. |
| Warning | `encounter.unreachable` | Encounter is not reachable from `startEncounter`. May be intentional branch work but should be reviewed. |
| Warning | `encounter.npcs.empty` | Encounter has no NPC references. Valid for exploration/social/solo beats, but notable. |
| Warning | `check.format.unparsed` | A check line could not be normalized. LLM can still read prose. |
| Warning | `summary.missing` | Source has no author summary and compiler had to derive one or leave it blank. |
| Suggestion | `reciprocal.link.missing` | A file links to another, but the target does not link back. Useful for wiki quality, not runtime correctness. |
| Suggestion | `section.unknown` | Markdown contains an unknown section heading. Preserve it, but ignore for runtime extraction until modeled. |
| Suggestion | `ai.retrieval.summary.improve` | Summary is weak, too long, or missing useful retrieval terms. |

## Draft Preview Exceptions

Draft preview should allow incomplete graph work while making unresolved areas visible and AI-fixable. Publish should keep those same findings but upgrade selected ones to errors.

| Condition | Draft Preview | Publish |
| --- | --- | --- |
| Missing transition target | Warning with stub-encounter suggestion | Error |
| Unreachable encounter | Warning | Warning unless product later requires all encounters reachable |
| Missing optional reciprocal link | Suggestion | Suggestion |
| Missing image asset | Warning | Warning by default; error only for required launch surfaces if designated later |
| Missing paired markdown profile for valid character sheet | Warning | Warning |
| Invalid character sheet JSON | Error | Error |

## AI-Fixable Issue Policy

AI-assisted editor tools may propose repairs for validation findings, but file changes should remain previewed and approval-gated. High-confidence AI-fixable findings include stub encounter creation, missing summary generation, reciprocal link suggestions, typo-level typed-link repair when a single close match exists, and profile creation from a valid sheet. Low-confidence or risky fixes include changing start encounter, deleting unreachable content, rewriting transition conditions, and mutating character sheet mechanics.

## Unit 03 Decision - Publish Strategy

Use explicit compile steps, not request-time markdown parsing, for gameplay. Draft authoring reads and writes source files. Preview compiles temporary artifacts for editor/playtest use. Publish validates in `publish` mode and writes immutable versioned artifacts.

| Operation | Input | Output | Rule |
| --- | --- | --- | --- |
| Draft edit | Source markdown, JSON sheets, assets | Updated source objects under the draft/source prefix | May leave validation findings unresolved. Never changes published artifacts. |
| Draft preview compile | Current source tree | Preview artifact bundle and `validation-report.json` | Runs `draftPreview` validation. Allows missing transition targets and other preview exceptions. |
| Publish compile | Current source tree | New immutable `{timestamp}-{hash}` published artifact bundle | Runs `publish` validation. Fails if any error exists. |
| Runtime read | Pinned published version | Compiled artifacts only | No raw markdown parsing during normal gameplay turns. |

## Compile Pipeline

```
1. Load source tree
   - adventure.md
   - encounters/*.md
   - setting/adventure entity markdown
   - NPC and premade character JSON sheets
   - paired character markdown profiles
   - asset metadata and referenced S3 image/map keys

2. Parse source files
   - frontmatter
   - markdown sections
   - typed wiki links
   - transition bullets
   - JSON character sheets

3. Validate
   - draftPreview or publish mode
   - produce validation-report.json
   - stop publish if errors exist

4. Project indexes
   - manifest.json
   - encounters.json
   - entities.json
   - character-sheets.json
   - graph.json
   - retrieval-index.json

5. Write artifacts
   - preview bundle for draft preview, or
   - immutable published {timestamp}-{hash} bundle
```

## Preview Artifact Strategy

Preview artifacts should be disposable and scoped to a user/editor session or a draft revision. They support graph view, validation UI, AI repair, and practice playthrough without claiming publish readiness.

```
preview/settings/{settingId}/adventures/{adventureId}/drafts/{draftId}/
  manifest.json
  encounters.json
  entities.json
  character-sheets.json
  graph.json
  retrieval-index.json
  validation-report.json
```

A preview bundle may contain unresolved graph nodes with fields such as `publishResolved: false`. Preview playthroughs should pin to a preview draft ID, not to a publish version.

## Publish Versioning

Published versions should be immutable. Each successful publish creates a timestamp/hash version directory and does not overwrite previous version artifacts.

```
published/settings/myr/adventures/the-old-road/2026-05-21T22-30-00Z-ab12cd34/
published/settings/myr/adventures/the-old-road/latest.json
```

| File/Path | Behavior |
| --- | --- |
| `{timestamp}-{hash}/` | Immutable artifact bundle used by live Adventures that pin to that version. |
| `latest.json` | Small pointer to the latest published version and manifest metadata. Adventure selection can read this, but sessions should pin to a concrete version at start. |
| `contentHash` | Hash of all source inputs that affect runtime artifacts. If unchanged, publish can be a no-op or create no new version. |
| `schemaVersion` | Runtime projection schema version. Needed for future migration of published artifact format. |

## Adventure Pinning And Cache Invalidation

Live Adventures should store the exact published content version they started with. Updating an Adventure Plan after play starts should not silently change that Adventure's authored context.

```
Convex adventure/session fields:
  settingId: "myr"
  adventureId: "the-old-road"
  contentVersion: "2026-05-21T22-30-00Z-ab12cd34"
  contentHash: "published bundle hash"
  currentEncounterId: "gatehouse-entry"
```

| Scenario | Rule |
| --- | --- |
| New Adventure starts from public plan page | Read `latest.json`, then pin to that concrete version. |
| Existing session continues after v2 is published | Continue reading v1 artifacts until explicitly migrated or restarted. |
| Published v1 artifact is missing/corrupt | Session should fail closed with a clear content-load error; do not auto-fallback to latest. |
| Draft preview playthrough | Pin to preview `draftId` and mark run type as preview/practice, never as published campaign state. |

## Rollback Model

Rollback should primarily move the public pointer, not mutate published version folders.

| Rollback Need | Action |
| --- | --- |
| Bad latest publish but previous version is valid | Update `latest.json` back to the prior version. Existing sessions remain pinned to their versions. |
| Bad source draft | Restore source files from S3 versioning/backups or editor history. Published artifacts remain unchanged. |
| Bad compiler release | Recompile from source into a new version after the compiler is fixed. Do not rewrite old immutable version folders unless a security incident requires quarantine. |
| Security/content takedown | Mark version unavailable in metadata and prevent new sessions; decide separately whether existing sessions can continue. |

## Unit 03 Open Questions

| Question | Default For Plan | Why It Matters |
| --- | --- | --- |
| Should publish create a new version if the source hash is unchanged? | No. | Avoids meaningless version churn and makes rollback clearer. |
| Should preview artifacts be stored in S3 or generated in memory? | Store short-lived preview bundles in S3 or equivalent cache. | Supports editor reloads, graph UI, practice playthroughs, and AI repair loops. |
| Should old published versions ever be deleted? | Not while sessions reference them. | Preserves session continuity and rollback safety. |
| Should sessions be migratable to newer content versions? | Defer. Treat as a future explicit migration/admin action. | Automatic migration risks breaking current encounter IDs, NPC state, and narrative continuity. |

## Unit 04 Decision - S3 Key Contract

Use explicit source, preview, and published prefixes. Source content is editable. Preview artifacts are disposable. Published artifacts are immutable and version-pinned by sessions.

```
content/
  settings/{settingId}/...

preview/
  settings/{settingId}/adventures/{adventureId}/drafts/{draftId}/...

published/
  settings/{settingId}/adventures/{adventureId}/{timestamp}-{hash}/...
  settings/{settingId}/adventures/{adventureId}/latest.json
```

These prefixes can live in one bucket with key-prefix policy controls, or in separate buckets later. The planning contract is the key layout, mutability, and access semantics.

## Source Content Layout

```
content/settings/{settingId}/
  setting.md
  assets/
    portraits/{npcId}.jpg
    locations/{locationId}.jpg
    factions/{factionId}.jpg
    items/{itemId}.jpg
  npcs/
    {npcId}.json
    {npcId}.md
  locations/
    {locationId}.md
  factions/
    {factionId}.md
  items/
    {itemId}.md
  adventures/{adventureId}/
    adventure.md
    encounters/
      {encounterId}.md
    characters/
      {characterId}.json
      {characterId}.md
    assets/
      cover.jpg
      encounters/{encounterId}.jpg
      characters/{characterId}.jpg
      maps/{mapId}.json
      handouts/{handoutId}.jpg
```

| Area | Rule |
| --- | --- |
| Setting-level entities | Reusable across adventures in the same setting unless an adventure-specific override is explicitly modeled later. |
| Adventure-level files | Specific to one adventure. Encounters, premade sheets, premade profiles, cover art, encounter art, handouts, and maps live here. |
| User-created saved characters | Remain outside adventure source at `characters/{userId}/{characterId}.json` under the existing product path until a later user-content migration is planned. |
| Images | Authored fields use full S3 URLs from approved buckets/prefixes. Supported examples are `.jpg` and `.png`; do not assume WebP. |
| IDs | Prefer stable slug IDs matching filenames. Compiler should validate mismatches between filename and frontmatter ID as warnings or errors depending on risk. |

## Preview And Published Layouts

```
preview/settings/{settingId}/adventures/{adventureId}/drafts/{draftId}/
  manifest.json
  encounters.json
  entities.json
  character-sheets.json
  graph.json
  retrieval-index.json
  validation-report.json

published/settings/{settingId}/adventures/{adventureId}/{timestamp}-{hash}/
  manifest.json
  encounters.json
  entities.json
  character-sheets.json
  graph.json
  retrieval-index.json
  validation-report.json

published/settings/{settingId}/adventures/{adventureId}/latest.json
```

| Prefix | Mutability | Expected Lifetime | Primary Readers |
| --- | --- | --- | --- |
| `content/` | Mutable | Durable source of authored content | Admin editor, compiler, migration tools |
| `preview/` | Replaceable/disposable | Short-lived draft/editor artifacts | Admin editor, graph UI, preview playthroughs, AI repair tools |
| `published/.../{timestamp}-{hash}/` | Immutable | Durable while any Adventure may reference it | Gameplay runtime, public adventure selection, LLM context assembler |
| `published/.../latest.json` | Mutable pointer | Durable pointer to current public version | Adventure listing and new session start flow |

## Metadata And Cache Headers

The compiler should write object metadata or equivalent manifest fields that make cache invalidation and debugging clear.

| Object Kind | Metadata / Headers | Cache Rule |
| --- | --- | --- |
| Source files under `content/` | `contentType`, last modified, editor/user metadata where available | No aggressive public caching. Admin/editor reads should prefer fresh content. |
| Preview artifacts | `draftId`, validation mode, source hash | Short TTL or explicit invalidation on new preview compile. |
| Published version artifacts | `schemaVersion`, `contentVersion`, `contentHash`, publish timestamp | Long cache allowed because version paths are immutable. |
| `latest.json` | Current version, manifest summary, content hash | Short TTL or no-store depending on launch needs because rollback changes this pointer. |
| Images/assets | Content type, content hash when available | Long cache if content-addressed or version-scoped; shorter cache if mutable source asset path. |

## Access Policy Expectations

| Capability | Who/What | Allowed Prefixes | Notes |
| --- | --- | --- | --- |
| Author source read/write | Admin/editor server actions and API routes | `content/`, selected `preview/` | Must enforce Clerk/admin/ownership checks in app code before S3 writes. |
| Compile preview | Server-side compiler | Read `content/`; write `preview/` | Runs `draftPreview` validation. |
| Publish | Server-side compiler/admin action | Read `content/`; write `published/` | Runs `publish` validation and requires human/admin intent. |
| Runtime read | Next.js server actions/API routes/gameplay services | `published/` pinned version paths | Should not write content. Should not parse source markdown during normal turns. |
| Public asset read | Browser via image proxy/CDN/CloudFront | Approved image/asset keys only | Prefer app-controlled URL generation. Avoid exposing draft-only/private GM content accidentally. |
| User character read/write | Authenticated character creator/editor | Existing `characters/{userId}/` | Keep existing behavior until a dedicated user-content migration is designed. |

## Deletion And Retention Rules

| Path Type | Deletion Rule |
| --- | --- |
| `content/` source | Use soft delete/editor history or S3 versioning where possible. Avoid destructive deletion without admin confirmation. |
| `preview/` bundles | Can be garbage-collected by age, draft closure, or editor session cleanup. |
| `published/.../{timestamp}-{hash}/` | Do not delete while any session references the version. Prefer marking unavailable for takedown cases. |
| `latest.json` | May be updated for publish or rollback. Changes should be logged. |
| User character JSON | Use existing soft-delete pattern unless replaced by a later character migration plan. |

## Unit 04 Open Questions

| Question | Default For Plan | Why It Matters |
| --- | --- | --- |
| One bucket or multiple buckets? | One bucket is acceptable for v1 if prefix-level app controls are clear. | Separate buckets can improve isolation later but add operational overhead. |
| Should source images be duplicated into published version folders? | Defer; reference source asset keys for v1 unless immutability requires copying. | Copying gives strict version immutability for assets, but increases storage and publish complexity. |
| Should draft source paths include owner IDs? | Defer until creator/community authoring is designed. | Admin-only Myr relaunch can use setting/adventure paths; creator-owned content needs ownership namespacing. |
| Should public clients read JSON artifacts directly? | No by default. Read through app/server APIs unless a specific public CDN contract is designed. | Prevents accidental exposure of GM notes/secrets and keeps auth/visibility centralized. |

## Runtime Ownership Table

| Thing | Owner | Planning Rule |
| --- | --- | --- |
| Adventure prose, NPC lore, transitions, locations | S3 markdown wiki | Canonical source of truth. |
| Default NPC and premade PC sheets | S3 JSON character sheets | Canonical source of default mechanical character state. Validate against `types/character.ts`. |
| Character narrative profiles, links, role notes | S3 markdown wiki | Canonical source for wiki context and retrieval, paired to JSON sheets through `sheet` frontmatter. |
| Encounter graph, summaries, refs, validation | Derived index/cache | Generated from S3, never hand-authored as truth. |
| Current encounter, turn order, rolls, live character state, chat | Convex | Realtime session sync and history. Character state here is a mutable session snapshot, not authored content. |
| LLM prompt context | Context assembler | Reads current wiki/index plus Convex session state. |

## Character Sheet Projection

The relaunch should preserve the existing character sheet behavior. Character creator/editor and character sheet modal surfaces continue to operate on JSON sheets shaped like `PCTemplate`, `NPC`, and live `TurnCharacter` records.

| Source | Projection | Notes |
| --- | --- | --- |
| `characters/{userId}/{characterId}.json` | `PCTemplate` | User-created saved character sheet. Remains outside adventure wiki content and is selected into an adventure. |
| `content/settings/{settingId}/adventures/{adventureId}/characters/{id}.json` | `PCTemplate` | Adventure premade character baseline. |
| `content/settings/{settingId}/npcs/{id}.json` | `NPC` | Reusable setting NPC baseline. |
| `*.md` profile paired by `sheet` | Retrieval profile and link graph node | Provides story role, links, author notes, and usage context. Does not own default mechanics. |
| `PCTemplate` or `NPC` + encounter participation | `TurnCharacter` | Created when an adventure starts or when an NPC enters an encounter. |

## Session Mutation Model

At session start, the app copies selected PC and initial NPC sheets from the pinned published content version into Convex turn/session state. From that point, damage, spell use, active effects, temporary status, initiative, and turn completion mutate only the Convex snapshot.

```
JSON sheet baseline
  -> selected into adventure
  -> copied to Convex TurnCharacter
  -> mutated during play
  -> carried to later turns/encounters according to session rules
```

| Field/Concern | Owner During Play | Rule |
| --- | --- | --- |
| Identity, default image, race, archetype, appearance, default attributes, default skills, default equipment, known spells, special abilities | JSON sheet baseline | Copied into session state when selected or instantiated. |
| `healthPercent`, `status`, active `effects` | Convex `TurnCharacter` | Mutated by damage, healing, conditions, and narrative/gameplay outcomes. |
| `spells[].isUsed` | Convex `TurnCharacter` | Marks use during a session or encounter. Reset behavior is a gameplay rule, not a sheet rewrite. |
| `initiative`, `hasReplied`, `isComplete`, `rollRequired`, `rollResult` | Convex `TurnCharacter` | Always session-only. |
| Temporary equipment changes or temporary abilities | Convex `TurnCharacter` | Persist through the active session as needed. Only written back to a saved sheet through an explicit post-session progression flow. |
| Permanent character advancement | Explicit save/progression flow | Do not automatically rewrite source sheets during turn processing. Offer a controlled user/admin action later if campaign progression requires it. |

## Encounter Transition Rules

When advancing encounters, PCs should carry forward their Convex live state by default. NPCs should be instantiated from their JSON baseline when they newly enter an encounter, then mutate as live session state while present.

| Transition Case | Rule |
| --- | --- |
| PC moves to next encounter | Carry forward live `TurnCharacter` state unless an explicit rest, healing, reset, or campaign rule changes it. |
| NPC appears for first time | Copy from pinned JSON sheet, apply encounter-specific participation fields such as behavior and initial initiative, then store as live `TurnCharacter`. |
| NPC persists across encounters | Carry forward live state if continuity matters; otherwise instantiate fresh from baseline when the encounter declares a new instance. |
| Encounter says `resetHealth` or equivalent | Apply to live Convex snapshot as a session rule; do not edit source JSON. |
| Spell usage reset | If the game remains encounter-scoped for spell use, clear `isUsed` on transition. If future campaign rules change this, update the session projection rules, not the source sheet model. |
