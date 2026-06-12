# Authoring And Admin Workflow

[Migration index](index.md) · [All plans](../index.md) · [Wiki Home](../../index.md)

**Stage 6.** Plan the AI-assisted wiki editor that replaces the current Adventure Plan editor and supports validation, preview, draft, and publish workflows. After 2 minutes, know what the authoring product needs before implementation design starts.

## Units Overview

- **Unit 01 - AI-assisted editor model**: Define create, expand, rewrite, split encounter, link NPC, repair validation issue, summarize encounter, generate transition tools, and maintain paired character sheet/profile files. Prefer chat-primary edits that auto-apply to canonical source and create restorable revisions. *Verification:* Every AI edit writes a revision, reports affected files and validation, and can be restored from history.
- **Unit 02 - Admin UX replacement**: Inventory current editor features and decide what gets removed, replaced, or folded into a wiki editor and preview surface. *Verification:* The final implementation plan can safely delete the current editor without losing required launch capability.
- **Unit 03 - Draft/publish lifecycle**: Define draft S3 files, validation state, publish compilation, rollback, version history, permissions, and preview playthrough behavior. *Verification:* Authors cannot accidentally publish invalid adventures or lose draft work.
- **Unit 04 - Design requirements**: Define the authoring UI information architecture: file tree, markdown editor, AI command panel, validation drawer, preview, context graph, and publish status. *Verification:* Design brief is updated if durable UI principles change.

## Unit 01 - AI-Assisted Editor Model

**Unit 01 decision.** The new editor should be wiki-first and revision-first. Authors mainly change the adventure plan through chat with the LLM, with direct controls limited to key prose and asset fields. All persisted source mutations go through `AuthoringChangeSet`, write canonical S3 source, run draft-preview validation, and create an `AuthoringRevision` that can restore the full draft or selected file.

Editor model pillars:

- **Source unit**: The editor works on files and typed entities, not old nested `AdventurePlan` forms. The file tree exposes `adventure.md`, `encounters/*.md`, setting-level entities, paired character `.json`/`.md` files, and assets.
- **AI role**: AI acts as the primary authoring assistant that can create, expand, rewrite, split, link, repair, summarize, and scaffold. It explains applied changes in terms of affected files and validation impact.
- **Human control**: Humans steer changes through chat and small key-field edits, then recover from mistakes through visible revision history instead of accept/reject queues.
- **Validation loop**: Every applied draft change should trigger draft-preview validation. Publish validation remains a separate hard gate from Stage 4.

### Primary Surfaces

- File tree grouped by adventure files, encounters, characters, NPCs, locations, factions, items, and assets.
- Markdown editor for `.md` files with frontmatter-aware controls for required fields.
- JSON sheet editor for PC/NPC mechanics that validates against `types/character.ts`-aligned schemas.
- AI command panel scoped to the selected file, selected text, validation finding, or graph node.
- Revision history showing affected files, validation result, and restore controls after chat or key-field saves.
- Validation drawer with errors, warnings, suggestions, and AI-fixable actions.
- Compiled preview panel showing encounter summary, linked entities, transition graph, and prompt-context extract.

### Core Workflows

1. Create a new adventure skeleton from setting, premise, player count, and optional Myr template.
2. Add or expand an encounter with intro, GM notes, checks, transitions, location/NPC links, and image references.
3. Create paired character files: mechanical JSON sheet plus markdown profile.
4. Repair validation findings such as missing transition targets, duplicate IDs, missing summaries, broken typed links, or missing profiles.
5. Preview a planning skeleton with unresolved targets while keeping publish-blocking findings visible.
6. Run a draft preview compile and optionally start a preview playthrough pinned to the preview bundle.
7. Promote a valid draft through publish validation into immutable published artifacts.

### AI Tool Set

| Tool | Input scope | Output | Approval rule |
| --- | --- | --- | --- |
| Create adventure skeleton | Setting, premise, tone, player count, optional template | `adventure.md`, starter encounter stubs, optional premade character placeholders | Preview whole file set before writing. |
| Create encounter | Adventure context, selected location/NPCs, author prompt | New `encounters/{id}.md` plus typed links and transition candidates | Apply directly, validate, and record a revision. |
| Expand encounter | Selected encounter or section | Updated intro, GM notes, checks, rewards, image suggestions, or transition text | Apply directly and create a restorable revision. |
| Split encounter | Existing long encounter | Two or more encounter files plus updated transitions and graph links | Apply directly with graph validation and revision restore. |
| Link NPC/location | Selected encounter and target entity | Typed wiki links, frontmatter refs, and optional reciprocal suggestions | Apply directly when requested; reciprocal links remain suggestions unless selected. |
| Repair validation issue | Single validation finding | Minimal patch such as stub encounter, fixed link, generated summary, or missing profile | Allowed only for AI-fixable findings from Stage 4 policy. |
| Summarize encounter | Encounter body | Frontmatter or compiled summary update | Apply directly and validate because summaries affect retrieval and prompts. |
| Generate transitions | Encounter objective and graph context | Explicit transition bullets with target IDs and conditions | Require graph preview; unresolved targets allowed only in draft preview. |
| Maintain character pair | Character JSON or markdown profile | Profile from sheet, sheet-safe profile update, or consistency findings | AI may not mutate mechanics such as attributes/spells without explicit author intent. |

### AI Change Set Contract

AI authoring actions should return a structured change set. The app applies the change set to canonical S3 source, validates the resulting draft, and records a restorable revision. This keeps AI SDK routes/tool calls compatible with S3-backed source files and avoids requiring direct agent filesystem access in production.

```ts
type AuthoringChangeSet = {
  id: string
  intent: string
  source: "ai" | "human" | "restore"
  target: {
    settingId: string
    adventureId?: string
    draftId: string
  }
  changes: Array<
    | { op: "create"; path: string; content: string }
    | { op: "update"; path: string; beforeHash: string; content: string }
    | { op: "rename"; fromPath: string; toPath: string; beforeHash: string }
    | { op: "delete"; path: string; beforeHash: string }
  >
  affectedEntities: Array<{
    type: "adventure" | "encounter" | "npc" | "character" | "location" | "item" | "faction" | "asset"
    id: string
  }>
  validationBefore?: ValidationSummary
  validationAfter?: ValidationSummary
  risks: string[]
}
```

Every `update`, `rename`, or `delete` should include the current source hash so the server can reject stale writes if another edit landed while the request was running.

### Revision And Safety Gates

| Gate | Rule |
| --- | --- |
| Revision | All AI and human writes create a durable authoring revision with affected paths, validation summary, source hashes, and a full source snapshot. |
| Validation | Run draft-preview validation after applying the change set. Show current findings and keep publish validation explicit. |
| Restore | Authors can restore the full draft or selected file from revision history when an auto-applied change misses the mark. |
| Stale write check | Server rejects changes if `beforeHash` no longer matches the current S3 source object. |
| Mechanics protection | Character attributes, spells, equipment, health defaults, and other mechanical JSON fields require a higher-friction confirmation than prose/profile edits. |
| Publish protection | AI can help fix publish blockers, but only an authorized human/admin can publish immutable artifacts. |
| Asset references | AI can suggest image refs or upload slots, but missing assets remain validation findings until real S3 objects exist or are intentionally stubbed in preview. |

### Editor State

- Open draft source tree and selected file path.
- Auto-saved human key-field edits in the selected editor surface.
- Applied authoring revisions with source, changed paths, validation summary, and restore controls.
- Latest draft-preview validation report.
- Compiled preview bundle pointer when validation has run.
- Graph selection and currently focused validation finding.

### Implementation Boundary

- Next.js server actions/API routes orchestrate S3 reads/writes, AI SDK calls, and compiler/validator calls.
- Convex is not required for draft source editing unless collaborative live editing is added later.
- S3 remains source storage for draft markdown, JSON sheets, and assets.
- Preview bundles may be written under the Stage 4 `preview/` prefix.
- Published gameplay sessions read only published or preview-pinned compiled artifacts, not unsaved editor buffers.

### Defaults And Open Questions

| Question | Default for the plan |
| --- | --- |
| Should AI edits be applied directly? | Yes. Chat is the primary authoring mode; applied edits must create revisions and run validation. |
| Should the editor hide markdown? | Mostly. Markdown is the source of truth, but the admin surface should expose key fields and previews while deeper restructuring happens through chat. |
| Should unresolved transition targets be allowed? | Yes in planning preview. Publish still requires resolved target encounters or stubs. |
| Should AI write paired character files automatically? | It may update both files together when requested. Mechanical JSON changes need explicit confirmation. |
| Should production AI tools use local agent skills? | No. Agent skills can help developer workflow, but production editor tools should be implemented as app-owned AI SDK/server-action capabilities with explicit input/output schemas. |

*Verification:* Unit 01 is complete when the final implementation plan can define AI authoring tools as structured change-set producers, auto-apply chat edits to S3 source, create restorable revisions, run draft-preview validation after writes, protect mechanical JSON fields, and preserve markdown/S3 as the canonical authoring source.

## Unit 02 - Admin UX Replacement Map

**Unit 02 decision.** The current admin adventure-plan editor can be deleted only after its launch-critical capabilities are represented in the wiki editor. The replacement should preserve adventure metadata, image management, encounter authoring, NPC assignment, premade character handling, transition editing, draft status, and save/download safety, but it should not preserve the old nested `sections[].scenes[].encounters[]` form model as a product concept.

Admin replacement principles:

- **Preserve capability**: Keep the author jobs that matter: create/edit adventure content, manage playable characters and NPCs, attach images, define transitions, preview playability, save drafts, and publish when valid.
- **Replace structure**: Replace sections/scenes form nesting with a file tree, encounter graph, typed wiki links, and compiled preview indexes.
- **Remove legacy assumptions**: Remove JSON download as the primary portability model, hidden health reset behavior, form-only encounter generation, and direct mutation of monolithic `AdventurePlan` JSON.
- **Fold into validation**: Many old manual safeguards become validation findings: missing transition targets, missing NPC profiles, invalid images, duplicate IDs, missing summaries, malformed character sheets, and unreachable encounters.

### Current Editor Inventory

| Current feature | Current surface | Replacement decision |
| --- | --- | --- |
| Adventure title, teaser, overview, party size, cover image | `AdventurePlanBasicInfo` and root `AdventurePlan` JSON fields | Preserve as `adventure.md` frontmatter/body plus asset reference controls. Party size and cover image remain structured frontmatter. |
| Draft toggle | `draft` boolean on JSON plan | Replace with source draft state plus Stage 4 `draftPreview`/`publish` lifecycle. Draft is a content workflow, not a single boolean. |
| Save changes | Writes monolithic JSON to S3 | Replace with file-level S3 writes using stale-write hashes and validation-aware saves. |
| Download adventure JSON | Client-side blob export of current `AdventurePlan` | Remove as primary UX. Optional future export should package source files or published artifacts, not legacy JSON. |
| Sections and scenes | Nested form groups with titles/summaries | Do not preserve as required runtime concepts. If authors want acts/chapters, model them as optional markdown organization, tags, or collection metadata. |
| Encounter title, ID, intro, instructions | `EncounterEditForm` | Preserve as `encounters/{encounterId}.md` frontmatter plus markdown sections: Intro, GM Notes, Checks, Transitions, Rewards, Map Notes. |
| Encounter image upload | `ImageUpload` writing to S3 image folders | Preserve as asset picker/uploader that writes S3 objects and updates image refs in frontmatter or asset sections. |
| Encounter transitions | Condition plus target encounter dropdown | Preserve and improve with graph view, typed transition bullets, unresolved-target preview warnings, and publish-blocking validation. |
| Encounter NPC assignment and behavior | NPC refs embedded in encounter JSON | Preserve as encounter frontmatter refs plus inline markdown links. Behavior can live in encounter notes or NPC encounter-role metadata. |
| Generate encounter | One-off AI action returns JSON encounter object | Replace with AI change-set tool that creates or updates encounter markdown and related refs, then validates before write. |
| Generate or edit NPCs | Character form/generation in adventure plan editor | Replace with setting/adventure character editors that maintain paired JSON sheet and markdown profile files. |
| Premade player characters | `premadePlayerCharacters` array in plan JSON | Preserve as adventure-local `characters/{id}.json` and `characters/{id}.md`, referenced from `adventure.md`. |
| Available character options | Race/archetype lists or premade-only mode | Preserve if needed for character creation flow, but move to structured adventure metadata and validate against character creation behavior. |
| Next adventure | `nextAdventure` plan ID selection | Preserve as `nextAdventure` metadata in `adventure.md` or manifest frontmatter, resolved during publish validation. |
| Encounter reordering sidebar | Section/scene encounter ordering | Replace with graph/navigation ordering: start encounter, recommended order, tags, and visual graph layout. Runtime movement comes from graph edges, not list order. |
| Skip initial NPC turns | Encounter boolean | Preserve only if still required by gameplay, as explicit encounter runtime metadata with validation and prompt/runtime handling. |
| Reset health | Encounter boolean | Do not preserve as hidden behavior. If needed, reintroduce as an explicit authored transition/session effect with high-friction validation. |
| 3D encounter map generation | Deprecated map actions and optional `map3d` fields | Defer. Keep map/image references in content model; do not make 3D map authoring launch-critical unless product scope changes. |

### New Admin Areas

- Adventure source browser: file tree for markdown, JSON sheets, and assets.
- Entity inspector: selected adventure, encounter, NPC, location, character, item, or asset metadata.
- Encounter graph: start node, transition edges, unresolved targets, unreachable encounters, and selected edge details.
- Validation center: current draft-preview findings with repair actions and publish blockers.
- Preview center: compiled encounter preview, prompt-context preview, and preview playthrough launch.
- Publishing center: publish validation, version summary, latest pointer, rollback status, and immutable artifact links.

### Delete Or Retire

- Monolithic AdventurePlan JSON edit form as the primary admin UI.
- Section/scene nesting as a required editor structure.
- JSON download as the main export affordance.
- Direct AI generation into app state without validation or revision history.
- Form-only transition dropdowns that hide graph consequences.
- Hidden encounter flags whose gameplay effects are not visible in compiled preview.

### Route And Flow Replacement

| Current route/surface | Replacement | Notes |
| --- | --- | --- |
| `/settings/{settingId}/new` | New wiki adventure flow | Creates source folder skeleton under Stage 4 source prefix, not a single JSON file. |
| `/settings/{settingId}/{adventurePlanId}/edit` | Wiki adventure editor | Loads source tree, validation report, preview bundle status, and selected file/entity. |
| `AdventurePlanEditSidebar` | File tree plus graph navigation | Navigation is by source path/entity and encounter graph, not section/scene array indices. |
| `AdventurePlanBasicInfo` | `adventure.md` metadata panel | Structured frontmatter controls can sit beside markdown body editing. |
| `AdventurePlanSections` | Encounter file editor and graph view | Each encounter is an independently addressable file with compiled preview. |
| `AdventurePlanCharactersEdit` | Character pair editor | JSON sheet editor plus markdown profile editor with consistency validation. |
| Generate encounter modal | AI command panel | Returns an `AuthoringChangeSet`; never directly inserts into persisted state. |

### Safe Deletion Gates

The old editor should not be removed until the replacement can perform these jobs end to end.

1. Create a new adventure draft with valid `adventure.md`, start encounter, cover image ref, party settings, and at least one encounter file.
2. Edit encounter prose, GM notes, checks, transitions, NPC refs, location refs, and image refs.
3. Create and edit reusable NPCs and adventure premade PCs through paired JSON/profile files.
4. Upload or select S3 assets and validate missing/broken asset refs.
5. Show graph and validation status for missing transition targets, duplicate IDs, unreachable encounters, missing profiles, and malformed character sheets.
6. Run draft-preview compile and start a preview playthrough pinned to the preview bundle.
7. Publish a valid Adventure Plan into immutable Stage 4 artifacts and keep existing Adventures pinned to prior versions.
8. Migrate at least one Myr template from old JSON to the wiki source layout with equivalent gameplay capability.

### Defaults And Open Questions

| Question | Default for the plan |
| --- | --- |
| Should section/scene concepts survive? | Not as required runtime/editor structure. They may survive as optional author-facing organization if a markdown pattern needs them. |
| Should old JSON import remain in the editor? | Yes as a migration/import tool for Stage 7, not as the ongoing authoring surface. |
| Should admins edit published artifacts directly? | No. Edit source drafts, then publish a new immutable version. |
| Should map authoring block launch? | No. Image refs and map notes are launch-critical; 3D map generation is deferred unless explicitly re-scoped. |
| Should save be manual or autosave? | Default to explicit save/apply for source file changes and AI change sets. Lightweight editor-buffer autosave can be added later, but S3 writes should remain intentional. |

*Verification:* Unit 02 is complete when Stage 8 can list every current editor capability as preserved, replaced, removed, or deferred, and can set a concrete deletion gate for the old `AdventurePlanEditForm` path without losing launch-critical authoring workflows.

## Unit 03 - Draft And Publish Lifecycle

**Unit 03 decision.** Authoring should have three explicit artifact states: one shared active draft per Adventure Plan, one mutable latest preview bundle per active draft, and immutable published versions. Authors can save incomplete draft source through applied change sets and authoring revisions, compile the latest preview bundle with draft-preview validation, and start preview playthroughs from that bundle. Publishing is a separate human/admin action that runs publish validation, writes a new immutable timestamp/hash version only when the source content hash changes, updates `latest.json` only after the version is complete, locks the current draft, and starts a new active draft copied from the locked source.

Lifecycle states:

- **Source draft**: `content/` source files are mutable and durable for the one shared active draft. They can contain incomplete planning work, unresolved transition targets, draft visibility, and validation findings.
- **Preview bundle**: `preview/` stores the mutable latest generated bundle for the active draft. It supports graph view, validation UI, AI repair, and preview playthroughs without claiming publish readiness.
- **Published version**: `published/.../{timestamp}-{hash}/` bundles are immutable. Live campaign Adventures pin to a concrete published version and content hash.
- **Latest pointer**: `latest.json` is the mutable public pointer. Rollback moves the pointer; it does not rewrite published version folders.

### Lifecycle Flow

| Step | Action | Output | Rules |
| --- | --- | --- | --- |
| Create draft | Create source folder and starter files. | `content/settings/{settingId}/adventures/{adventureId}/...` | Can start from blank, AI skeleton, or migrated Myr template. Must create stable IDs immediately. |
| Edit source | Human key-field edit or AI chat change set. | Applied change set, updated source object, source hash, validation result, and authoring revision. | Use stale-write checks and revision restore instead of approval-gated queues. |
| Validate draft | Run compiler in `draftPreview` mode. | `validation-report.json` and optional preview bundle. | Warnings allowed for incomplete graph work; publish-blocking issues remain visible. |
| Preview playthrough | Start practice/preview session from preview bundle. | Convex session pinned to `previewDraftId`. | Never promoted to public campaign state. Unresolved target movement is blocked at runtime. |
| Publish | Run compiler in `publish` mode. | New immutable timestamp/hash bundle plus validation report. | Fails if any error exists. If content hash is unchanged, publish should be a no-op. Successful publish locks the current draft and starts a new active draft from the locked source. |
| Expose latest | Update `latest.json`. | Public adventure points to new version. | Only after all version artifacts are written and readable. |
| Rollback | Move `latest.json` back to a prior valid version. | Public new-session pointer changes. | Existing sessions remain pinned to their own versions. |

### Permissions

- Source read: setting owner, adventure owner, admin, or authorized collaborator.
- Source write: owner/admin/collaborator with edit permission; always server-enforced.
- Preview compile: same as source write, because it reads draft source and writes preview artifacts.
- Preview playthrough: owner/admin/collaborator, or invited tester if explicitly supported later.
- Publish: owner/admin by default; collaborator publish requires explicit role.
- Rollback: admin/owner with high-friction confirmation and audit log.

### Version History

- Record source content hash for each preview and publish compile.
- Record publish timestamp, publisher user ID, schema version, validation summary, and previous latest pointer.
- List published versions with status: current, previous, unavailable, or superseded.
- Never delete a published version while any Convex session references it.
- Use source object versioning or editor history for draft recovery where possible.

### Publish Record Shape

```ts
type PublishRecord = {
  settingId: string
  adventureId: string
  version: string
  schemaVersion: string
  contentHash: string
  sourceHash: string
  publishedBy: string
  publishedAt: string
  validation: {
    mode: "publish"
    errors: 0
    warnings: number
    suggestions: number
  }
  artifacts: {
    manifest: string
    encounters: string
    entities: string
    characterSheets: string
    graph: string
    retrievalIndex: string
    validationReport: string
  }
  previousLatestVersion?: string
}
```

### Safety Gates

| Risk | Gate |
| --- | --- |
| Invalid adventure becomes public | Publish mode fails on errors and does not write or expose a new latest pointer. |
| Partial publish | Write version artifacts first, verify reads/hash, then update `latest.json`. |
| Accidental overwrite | Published version paths are immutable and content-hash-addressed by behavior, even if not literally hash-named. |
| Draft loss | Use stale-write checks, source versioning/backups, and visible unsaved buffer state. |
| Bad latest publish | Rollback changes `latest.json` only. Existing sessions remain pinned. |
| Unauthorized edits | All source writes, preview compiles, publishes, and rollbacks enforce Clerk/ownership/admin checks server-side. |

*Verification:* Unit 03 is complete when Stage 8 can specify create, edit, validate, preview, publish, rollback, and recovery paths without letting invalid source become public or letting published-session context change underneath active sessions.

## Unit 04 - Authoring UI Design Requirements

**Unit 04 decision.** The authoring UI should feel like a dense workbench for adventure operations, not a marketing page and not a wizard that hides source truth. The first screen of the editor should expose the source tree, selected file/entity, validation state, AI tools, preview, and publish status. The interface should optimize for repeated authoring, scanning, comparison, and repair.

UI layout requirements:

- **Left rail**: Source file tree, entity filters, unsaved indicators, validation badges, and quick create actions.
- **Main editor**: Markdown editor or JSON sheet editor with frontmatter controls, syntax-aware warnings, and source hash/save state.
- **Right rail**: AI chat panel, revision history, validation drawer, and selected entity inspector.
- **Preview band**: Compiled encounter preview, graph preview, prompt-context preview, asset preview, and publish status. This can be a tabbed lower panel on desktop or a separate view on mobile.

### Information Architecture

| Area | Required behavior |
| --- | --- |
| File tree | Shows adventure files, encounters, characters, NPCs, locations, factions, items, and assets. Badges indicate errors, warnings, active validation findings, and publish-blocking status. |
| Markdown editor | Supports source editing, frontmatter controls, section outline, typed-link insertion, image/asset insertion, and validation annotations. |
| JSON sheet editor | Provides structured controls for character mechanics, validates against the locked character schema, and displays paired markdown profile consistency. |
| AI panel | Chat is scoped to the selected file, validation finding, or graph context. AI output appears as applied revisions with affected paths, risks, validation status, and restore affordances. |
| Validation drawer | Groups findings by severity, code, file, entity, and AI-fixable status. Clicking a finding focuses the affected source span or entity. |
| Graph view | Shows start encounter, transitions, unresolved targets, unreachable encounters, selected edge details, and publish blockers. |
| Preview panel | Shows compiled encounter view, linked context, prompt packet excerpt, image/asset preview, and preview playthrough launch status. |
| Publish center | Shows draft hash, preview hash, latest published version, validation summary, publish button, rollback list, and immutable artifact links. |

### Interaction Requirements

- Never hide publish blockers behind collapsed panels without a persistent status badge.
- Keep save, validate, preview, publish, and rollback as distinct commands.
- Use familiar icon buttons with tooltips for create, validate, preview, publish, rollback, restore, and upload.
- Show exact S3 keys for source files and full S3 URLs for image/assets when it helps debugging.
- Use stable layout dimensions for file rows, validation rows, graph nodes, and command bars to avoid jitter during validation updates.
- Do not make AI chat the only way to author; direct source editing remains first-class.

### Accessibility And States

- Keyboard navigation through file tree, editor tabs, validation findings, and revision restore actions.
- Visible focus states and semantic headings for long-form editor panels.
- Clear loading, success, failure, stale-write, permission-denied, and validation-running states.
- Diffs must be readable without color alone.
- Mobile/tablet layout may switch from multi-pane to task tabs, but must preserve access to validation and publish status.

### Design Brief Update

The design brief should treat the wiki editor as an operational tool: restrained, dense, source-visible, validation-forward, and built for repeated repair/review cycles. It should explicitly avoid a landing-page or wizard-first design for the editor.

*Verification:* Unit 04 is complete when Stage 8 can name the editor panes, commands, states, responsive behavior, validation visibility rules, and accessibility expectations required before implementation.
