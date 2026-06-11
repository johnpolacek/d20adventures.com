# The Midnight Summons — Playthrough Test

[← All plans](index.md) · **Status:** Iterating

Plan the first real single-player wiki-adventure playthrough test from the existing Realm of Myr adventure selection screen and Thalbern premade flow. The goal is to prove the wiki runtime can support a full playthrough, from the public adventure card to a completed, recorded run.

**Source:** legacy JSON · **Mode:** 1 player · **Encounters:** 7 · **Premade:** Thalbern

## Decision and unknowns
- **Decision:** use this adventure as the first live cutover candidate. The test begins from the existing public adventure card and premade screen, then switches the created Adventure onto the wiki runtime behind the same user-facing flow. Players should not see wiki structure.
- **Source evidence:** `wiki/sources/adventure plans/the-midnight-summons.json` holds the legacy source; screenshots capture the starting UI.
- **Primary unknown:** whether to temporarily dual-read legacy JSON for the card and character-select screens while gameplay uses compiled wiki artifacts, or migrate the listing source first and make the public flow fully wiki-backed.

## Encounter graph to preserve
- **broken-silence** (start) → owlbear-confrontation, meeting-at-the-stones, timely-rescue
- **owlbear-confrontation** → meeting-at-the-stones
- **timely-rescue** → meeting-at-the-stones
- **meeting-at-the-stones** → the-missing-relics, preparing-for-the-city, back-home
- **the-missing-relics** → preparing-for-the-city, back-home
- **preparing-for-the-city** — terminal
- **back-home** — terminal

Legacy source has one invalid edge, `broken-silence → wollandora-intervention`; correct it to `timely-rescue`, add an explicit alias, or block publish.

## Migration scope
The full legacy `AdventurePlan` must become authored wiki source, compiled artifacts, and validation findings before the solo playthrough can prove the system.

| Source object | Count | Target | Required checks |
|---|---|---|---|
| Adventure root (id, title, teaser, overview, party, image) | 1 | `adventure.md` frontmatter + body | Start `broken-silence`; party 1–1; image becomes a full S3 URL before publish. |
| Section / scene wrappers | 1 / 1 | Folded into adventure/encounter metadata | Preserve the journey framing as source context. |
| Encounters | 7 | `encounters/*.md` | Preserve intro, GM instructions, NPC refs, images, transitions, terminal status. |
| Transition edges | 11 | compiled `graph.json` | Validate all targets; fix invalid `broken-silence → wollandora-intervention`. |
| NPCs | 2 | `npcs/wollandora.*`, `npcs/owlbear.*` | Preserve behavior, motivation, health, attributes. Owlbear has empty legacy attributes. |
| Premade PC | 1 | `characters/thalbern.md` + `.json` | See premade migration below. |
| Images / portraits | 11 refs | full S3 URLs | Preview may warn on local paths; publish must validate the S3 prefix. |

## Premade character migration
Premades currently live inline in the legacy adventure JSON. Split each into a profile markdown file plus a paired character-sheet JSON that validates against `pcTemplateSchema` (`types/character.ts`).

| Legacy field | Wiki target | Requirement |
|---|---|---|
| `id` / `name` / `image` | `thalbern.md` frontmatter + `thalbern.json` | ID matches the adventure `premadeCharacters` ref and route payload. |
| appearance, personality, background, motivation, behavior | markdown sections + mirrored JSON | Markdown is authoring context; JSON is the default runtime state. |
| `attributes` | `thalbern.json.attributes` | Standard six attributes, each 1–20. |
| equipment, skills, optional spells/abilities/effects | `thalbern.json` | Must pass `pcTemplateSchema`; selection copies the sheet rather than mutating the template. |
| local image path | full S3 URL in markdown + JSON | Preview may warn; publish blocks until a full S3 URL is present. |

## Execution units
1. **Source import and authored skeleton** *(planning next)* — convert legacy JSON into the wiki source tree, preserving story text, transitions, and NPC refs, and migrating Thalbern into paired md/json files.
2. **Preview compile and validation** *(compiler gate)* — compile to preview artifacts; validate graph, start encounter, refs, image URLs, and character fields.
3. **Public flow bridge** *(UI compatible)* — keep the existing card and character-select screens, but selecting Thalbern creates an Adventure with a pinned wiki `contentRef` at `broken-silence`.
4. **Live turn advancement** *(not started)* — wire the playthrough through the wiki context packet, transition validator, adventurePatch validation, and guarded Convex commit.
5. **Manual playthrough script** *(human QA)* — run the solo route end-to-end across the branch paths below.

## Flow coverage audit

| Stage | Coverage | Still required |
|---|---|---|
| Adventure listing | ✅ existing Realm of Myr card | Verify metadata, party count, premade badge, image, and Play link stay compatible as the data source changes. |
| Character selection | ✅ Thalbern only, Details/Select preserved | Verify selection maps to `thalbern.json`, not just the profile markdown. |
| Adventure creation | ⚠️ needs detail | Solo (max party 1) should auto-start, copy the premade sheet, set status and `currentEncounterId`, and create the first turn at `broken-silence`. |
| First turn render | ⚠️ needs detail | First turn combines encounter intro with Thalbern in initiative; player input enabled; AI does not play Thalbern. |
| Roll and action loop | ⚠️ partial | Test normal, required, and failed rolls, evasion, combat narration, NPC turns, health changes, ability resets, saved state. |
| Branching transitions | ⚠️ mapped, one issue | Fix the legacy `wollandora-intervention` target before publish. |
| Terminal encounters | ❌ missing | Verify `preparing-for-the-city` and `back-home` complete the Adventure (`isFinalEncounter`, `status: completed`, `endedAt`, completion UI). |
| Completion UI | ❌ missing | Confirm the final message plus Play Again / Go to Setting actions. |
| Post-completion record | ⚠️ partial | Confirm the evolved record: branch taken, outcome, resolved threads, discoveries, entity and character updates. |
| Replay / new run | ❌ missing | Play Again creates a new instance without mutating the completed record. |

## Manual test script
1. Open `/settings/realm-of-myr` and choose **The Midnight Summons**.
2. Confirm character selection shows Thalbern with the existing Details/Select behavior.
3. Select Thalbern; confirm the solo adventure auto-starts rather than stopping in a multiplayer lobby.
4. Confirm the Adventure pins wiki content, copies Thalbern's runtime sheet, and starts the first turn at `broken-silence`.
5. Submit a cautious action; confirm the GM resolves an appropriate perception/stealth path.
6. Force a failed or unsafe path; confirm transition to `owlbear-confrontation`.
7. Exercise a critical-health or rescue path; confirm `timely-rescue` or Wollandora behaves consistently.
8. Reach `meeting-at-the-stones`; choose to help Wollandora, go home, or learn about the missing relics.
9. Complete one accepted path into `preparing-for-the-city` and one refusal into `back-home`; both are terminal.
10. Confirm the final turn sets `isFinalEncounter`, the Adventure becomes `completed`, `endedAt` is set, and the completion UI appears.
11. Confirm the evolved record matches the playthrough: discoveries, threads, outcome, transition metadata.
12. Click Play Again; verify a new instance starts without mutating the completed record.

## Acceptance gates
- Public listing and character selection stay visually and behaviorally compatible with the screenshots.
- The full legacy root, section/scene framing, all 7 encounters, 11 edges, both NPCs, Thalbern, and all image refs are represented or documented as intentionally transformed.
- Adventure creation pins the compiled content version/hash or preview draft ID.
- Turn advancement reads compiled wiki artifacts, not legacy nested sections and scenes.
- Illegal transitions are rejected before Convex writes.
- Thalbern stays player-controlled; the AI does not mutate his sheet without validated patch semantics.
- `wollandora-intervention` is corrected, aliased, or blocked before publish.
- Terminal encounters complete the Adventure and render the completion controls.
- Play Again starts a separate instance pinned to content; the completed record stays immutable except for allowed reporting.

## Open questions

| Question | Recommended default |
|---|---|
| Wiki-back listing and character-select immediately? | Use a short dual-read bridge only if needed; make gameplay wiki-backed first, then replace listing data. |
| Accept legacy local image paths in draft preview? | Warn in preview, block publish until full S3 URLs are present. |
| How detailed should Owlbear runtime stats be? | Lightweight authored NPC/encounter guidance, not full SRD combat automation. |
| Preview-only playtest first? | Start with a preview draft, then publish once validation is clean. |

## Next planning step
Define Unit 01 in detail: target source files, adventure root mapping, section/scene preservation, encounter mapping, transition correction, Thalbern character JSON against `pcTemplateSchema`, NPC JSON for Wollandora and Owlbear, and preview-vs-publish image rules. Source to inspect: `wiki/sources/adventure plans/the-midnight-summons.json`.
