# Decision history

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md)

Git owns routine implementation history. This log records durable wiki, planning, validation, and project-context changes.

## 2026-06-11

### Ran the pre-prod assurance checks (cutover Units 5 & 7) — found prod S3 march-of-davos drift

- **Unit 7 (rollback / content-ref pinning)** — added `scripts/wiki-adventures-rollback-check.ts` (`pnpm test:wiki-adventures:rollback`). It proves the safety chain with a shared in-memory published-repo + artifact-loader: publish v1 → pin v1 → publish a bad v2 (latest moves to v2) → the pinned adventure still resolves v1 (immutable, unaffected by the bad publish) → a fresh start during the bad publish would get v2 → rollback re-points `latest` to v1 → a fresh start after rollback gets v1, and v2 remains immutably readable. Made `InMemoryWikiAdventurePublishedRepository`'s object store injectable (optional constructor arg, default `new Map()`) so the loader can read what the repo publishes. Passes.
- **Unit 5 (prod S3 wiki-source completeness audit)** — added `scripts/wiki-adventures-prod-s3-audit.ts` (`pnpm audit:wiki-adventures:prod-s3`, read-only, prod creds). Findings against bucket `d20-data`:
  - The Midnight Summons, Covert Cargo, The Road to Kordavos: **no** wiki source in prod S3 → runtime falls back to the repo-bundled source. Safe; repo edits (incl. the new `availableCharacterOptions`) apply.
  - **March of Davos: complete (116/116) prod S3 source, publish-valid — but it DRIFTS from the repo in 40/116 files** (encounters, NPCs) and its `adventure.md` lacks the `availableCharacterOptions` frontmatter added this cycle. Because the source is complete, the runtime serves the **prod S3 copy**, so after deploy March of Davos would run divergent content and its custom character-create would show no races/archetypes. The audit now flags this drift explicitly (`⚠ DRIFT FROM REPO`).
- The cutover is **not yet deployed** (only `git push origin main`; no `convex:deploy`), so prod is unaffected for now — this is a **pre-deploy blocker for March of Davos only**.
- **Drift investigated → prod S3 was canonical.** A content comparison of the 40 drifted files showed March of Davos was only rawly/partially migrated into the repo; the finished content lived in prod S3 (refined via the wiki authoring tools post-migration — its `_revisions/` history confirms it). Prod's `adventure.md` carries `Aftermath`/`Conclusion`/`Sequel Hooks` sections the repo lacked; prod's climax (`final-confrontation`) is plot-coherent (named antagonist Joran, the Key of Ilmarin, branching resolution) vs a generic repo draft; prod NPC sheets ~2× fuller. The ~17 repo-longer files were verbose raw-migration prose; prod's tighter versions were all complete (proper Intro/GM Notes/Transitions), so prod was canonical across the board.
- **Resolved → repo-canonical, uniform.** Reconciled the prod S3 source into the repo (40 files; the richer adventure.md, climax, NPCs, and a 44→57 transition graph), re-added `availableCharacterOptions`, updated the march-of-davos bridge for the richer graph, then deleted the prod S3 `content/.../march-of-davos/` prefix (64 keys incl. `_revisions/`). The audit now shows it as `local (S3 partial, rejected)` → the runtime serves repo-bundled source for **all four** adventures; git holds the canonical content so the clear is reversible. 70 orphaned setting-level `npcs/` keys remain in prod S3, ignored by the runtime. All four adventures are deploy-ready; only the prod deploy itself remains.
- Validation: `tsc`, `pnpm build`, `pnpm check` (431 files), the full wiki suite incl. the new rollback check, and the read-only prod audit all pass/run clean.

### Removed the legacy editor and browser-verified the cutover (cutover Unit 4 partial)

- Removed the legacy adventure-plan editor entirely (it was superseded by the wiki admin authoring at `/admin/wiki-adventures`, and for a wiki adventure its writes went to legacy JSON the runtime no longer reads): deleted the `/settings/[settingId]/[adventurePlanId]/edit` and `/settings/[settingId]/new` routes, `adventure-plan-actions.ts`, `adventure-plan-chat.ts`, `lib/adventure-plan-structure.ts`, and the editor-only components/hooks under `components/adventure-plans/` (kept `character-card.tsx` + `use-character-details.ts`, used by character creation). Replaced the one gameplay tie (`getAdventurePlan`, the final-encounter next-adventure card) with a small wiki-backed server action `app/_actions/get-adventure-plan.ts`. Removed the now-dead "New Adventure" button (setting home), the Draft Adventures section (play grid), and the dead `/create/adventure` on-ramp; repointed the dev/admin "Edit"/"Back to Plan"/"Open plan editor" links and the `/admin/adventure-plans/[settingId]/[planId]` redirect to the wiki admin route. ~25 files removed.
- **Browser-verified the cutover end-to-end** (authenticated Clerk dev user, agent-browser, per the gameplay-playthrough-testing skill): the `/settings/realm-of-myr/play` grid renders all four cards from wiki source with correct titles, party badges, premade badges, teasers, and the intro/full curation order; premade character-select shows Thalbern from the wiki sheet; custom character-create shows the wiki `availableCharacterOptions` races; selecting the solo premade auto-starts and creates the adventure; turn 1 renders the wiki `broken-silence` encounter; the turn-page "Edit" link now targets the wiki admin route; and a player reply drove a Perception roll request → roll resolution → next turn with no server errors. This exercises the create/start, in-progress page, turn page, player-reply, and roll-result paths all reading the wiki runtime.
- Validation: `tsc`, `pnpm build`, `pnpm check` (429 files), all bridge checks, and the public-flow check pass. Branch `feature/production-cutover`.
- **Still open:** the legacy S3 `AdventurePlan` JSON for the four migrated adventures is retained as a now-unreached fallback (deletion deferred per decision until after this verification — it is now safe to delete, but kept pending an explicit go and the prod S3 audit). Units 5 (prod S3 completeness audit) and 7 (rollback verification) still need prod access / a manual run.

### Routed the whole gameplay/runtime path onto the wiki runtime (cutover Units 1-grid)

- Added `loadAdventurePlanForRuntime(settingId, planId)` (wiki plan view for registered wiki adventures, legacy S3 JSON otherwise) and routed every remaining unconditional legacy-plan reader through it: the in-progress adventure page, the per-turn page, practice setup, multiplayer join's premade lookup, `check-encounter-final`, `adventure-first-turn-service`, three reads in `adventure.ts` (roll-result instructions, active-adventure party info, `getNextAdventure`), the practice report action, and the player-profile plan image.
- Cut the adventure-listing grid (`/settings/[settingId]/play`) onto `loadWikiAdventurePlanViewsForSetting`, ordered by planId so its positional intro/full card curation is preserved exactly; non-wiki settings still fall back to the legacy S3 directory listing.
- **Result:** the entire gameplay/runtime path now reads compiled wiki artifacts for migrated adventures, so a stubbed or absent legacy plan can no longer 500 any play surface (the failure mode behind the three bugs fixed earlier this cycle). An audit confirmed the only remaining unconditional legacy `AdventurePlan` readers are the legacy adventure-plan editor — `app/settings/[settingId]/[adventurePlanId]/edit/page.tsx`, `app/_actions/adventure-plan-actions.ts`, `app/_actions/adventure-plan-chat.ts` — which is superseded by the wiki admin authoring at `/admin/wiki-adventures`. The branched runtime services (advance-turn, start/create-adventure, turn-reply, npc-turn) read the legacy plan only in their non-wiki else branch.
- Validation: `tsc`, `pnpm build`, `pnpm check` (453 files), all four bridge checks, and `pnpm test:wiki-adventures:public-flow` pass. Branch `feature/production-cutover`.
- **Open decisions before legacy retirement (Unit 4):** (1) what to do with the now-superseded legacy editor — for a wiki adventure its writes go to legacy JSON the runtime no longer reads, so editing there is silently inert and should be removed or redirected to `/admin/wiki-adventures`; (2) whether to delete the legacy S3 `AdventurePlan` JSON for the four migrated adventures (destructive — needs browser re-verify first). Units 5 (prod S3 completeness audit) and 7 (rollback verification) still need prod access / a manual run.
- **Needs browser re-verify:** the runtime/display pages changed; the user's earlier playthroughs predate these edits. Gameplay turn-execution logic is unchanged, but the new front-door and runtime page reads should be exercised once authenticated.

### Cut the gameplay-critical public pages onto the wiki runtime (cutover Units 1–3, 6)

- Added `lib/wiki-adventures/plan-view.ts`, an adapter that builds the legacy `AdventurePlan` shape from compiled wiki `RuntimeArtifacts`, so the public listing/lobby, character-select, and character-create pages cut off the legacy S3 `AdventurePlan` JSON without any downstream UI rewrite. The start encounter is ordered first; premade sheets, party size, teaser/summary, and `availableCharacterOptions` all map through.
- Compiler change (Unit 3): `manifest.teaser`/`manifest.summary` now populate from the `adventure.md` body sections — they were previously always `undefined` despite four readers (start/create/npc/runtime-context) — and a new optional `availableCharacterOptions { races, archetypes }` flows from frontmatter into `RuntimeManifest`. Added that frontmatter to the two custom-character adventures (Road to Kordavos, March of Davos), sourced from their legacy plans.
- Branched the three pages on `isLocalWikiAdventure`; gated the prototype workbench server actions behind `requireAdmin` (Unit 6).
- Added `scripts/wiki-adventures-public-flow-check.ts` / `pnpm test:wiki-adventures:public-flow`.
- Validation: `tsc`, `pnpm build`, `pnpm check` (453 files), all four bridge checks, and the new public-flow check pass. Branch `feature/production-cutover`.
- **Open decision before the grid + legacy retirement (Units 1-grid, 4, 5):** the registry `LOCAL_WIKI_ADVENTURES` is hardcoded to four adventures, while the legacy `/settings/[settingId]/play` grid enumerates every published JSON in S3. A registry-driven grid would not surface future admin-authored adventures, so a true grid cutover needs S3 enumeration of published wiki adventures (tied to the prod publish pipeline). Not yet started.

### Planned the production cutover track

- Assessed current state: the wiki-adventure runtime is merged and the post-merge hardening track is fully closed (all five release-readiness findings done, plus three further live-playthrough bugs fixed). Turn execution — create, start, advance, player-reply, NPC context — all branch on `isLocalWikiAdventure` and read compiled wiki artifacts.
- Confirmed by code inspection that the remaining gap is the public front door: three pages still read the legacy `AdventurePlan` JSON unconditionally — listing (`app/settings/[settingId]/[adventurePlanId]/page.tsx`, which even reads legacy nested `sections[0].scenes[0].encounters[0]`), character-select, and character-create. The listing read is the same stub-legacy-plan failure mode that caused three runtime 500s this cycle.
- Identified one runtime data gap: `availableCharacterOptions` (races/archetypes for the custom-character path, e.g. Road to Kordavos) is not compiled into `RuntimeManifest`, so it must be added before character-select/character-create can leave legacy JSON.
- Added `wiki/plans/production-cutover.md` with seven work units (carry `availableCharacterOptions`; cut listing, character-select; retire/stub legacy dual-read; prod S3 completeness audit; gate prototype workbench actions; verify rollback under a bad publish), sequencing, acceptance gates, and risks — each anchored to file:line evidence.
- Set the plan as current focus in `plans/index.md` and `roadmap.md`; moved the implementation review to Completed. No app code changed.

### Found and fixed three runtime bugs via live authenticated playthroughs

A multi-character roleplay test of Road to Kordavos surfaced a third bug: the player-reply roll path (`buildTurnReplyRollRequirement`) always read the legacy S3 `AdventurePlan` and looked up the encounter under `sections>scenes>encounters`. For wiki-migrated adventures whose legacy S3 plan is a stub (no encounters) — as Road to Kordavos's was — every player action 500'd with "Encounter not found", making the adventure unplayable. Fixed by routing registered wiki adventures through the compiled wiki runtime artifacts (`lib/services/adventure-turn-reply-service.ts`), proven live with the S3 plan re-stubbed. The Midnight Summons and Covert Cargo bridge cases pass because their legacy plans happened to contain the encounters. The NPC-turn DM context had the same legacy-plan dependency and was migrated the same way (`lib/services/npc-turn-service.ts`), also verified live with a re-stubbed plan; section/scene framing is omitted for wiki adventures (encounter-first design). The multi-character roleplay itself (3 PCs: Arcanist, Ranger, Dwarf Cleric) read as good quality: distinct NPC voices, autonomous NPC cross-talk, tracked continuity, and dice-integrated social actions.

Ran authenticated browser playthroughs (agent-browser + a Clerk dev test user) to exercise the real public play flow, which surfaced two bugs that bridge tests could not:

- **Solo auto-start never navigated.** Selecting the premade in a solo adventure created the adventure server-side but stranded the user on character-select: `PartyConfiguration` caught the server action's `NEXT_REDIRECT` and returned instead of re-throwing. Fixed by re-throwing the redirect (`components/adventure/PartyConfiguration.tsx`).
- **adventurePatch dropped GM world-state on malformed AI output.** The model intermittently returns the structured patch fields (`openThreads`, `entityUpdates`, etc.) as arrays of strings; a single malformed field failed Zod for the whole patch, so the turn fell back to a summary-only patch and silently dropped that turn's discoveries, entity/character updates, and threads. Made each field independently resilient (`lib/wiki-adventures/adventure-patch.ts`). Encounter transitions are computed separately and were never affected.

Verified encounter transitions work end-to-end: The Midnight Summons played to full completion (3 transitions, terminal encounter, completion UI), and Covert Cargo transitioned live (`the-shipment` → `the-disturbance`). Covert Cargo is a 2-player adventure, so solo verification used practice mode; driving it to its own completion screen was impractical here (heavy multi-PC + multi-NPC combat turns, compounded by intermittent LLM API connect-timeouts in the local environment) — not a product bug.

### Closed the post-merge hardening track

- Fixed `pnpm check` (Biome) to a green, build-stable state; generated files and wiki source excluded from Biome.
- Gated admin canonical S3 source writes behind pre-write validation (compile-and-block before write).
- Made S3 source preference complete-manifest-aware so a partial remote seed falls back to repo-local source.
- Normalized the admin route family to a single canonical `/admin/wiki-adventures`, others redirect.
- Ran the first authenticated end-to-end browser playthrough of The Midnight Summons to completion (selection, solo auto-start, first turn at `broken-silence`, Perception and Stealth rolls, branching through `owlbear-confrontation` and `meeting-at-the-stones`, terminal `back-home`, completion UI). Used a dedicated Clerk dev test user driven via agent-browser.
- Found and fixed a real bug surfaced only by the live flow: solo auto-start created the adventure but never navigated to it, because the client caught the server action's `NEXT_REDIRECT` and returned instead of re-throwing (`components/adventure/PartyConfiguration.tsx`). Also stopped `start-adventure` from logging every redirect as a failure.

### Converted the wiki to Markdown and re-assessed the roadmap

- Migrated every wiki page from standalone HTML to GitHub-flavored Markdown: front door, log, sources ledger, architecture, the four source briefs, the plan dashboard and plans, and the archived eight-stage migration plan set. Dropped the inline "arcane console" CSS in favor of breadcrumb nav lines and Markdown tables.
- Removed the old `roadmap.html` and three superseded plan pages (Midnight Summons playthrough test, sidebar section/scene navigation, LLM style policy) plus the `plans/features/` subplans.
- Rewrote `roadmap.md` as a re-assessed Now / Next / Later / Deferred plan anchored on the implementation review findings.
- Updated `AGENTS.md` source-of-truth, rules, and authoring guidance to reference Markdown pages. Verified all internal `.md` links resolve.

### Audited merged wiki adventure implementation

- Reviewed merge commit `fbd3e97`, which brought `feature/wiki-adventure-implementation` into `main` on 2026-06-10.
- Confirmed the merged architecture adds registered local wiki adventure runtime support, Realm of Myr migrated source, admin wiki authoring, Convex content refs, guarded wiki turn advancement, and compatibility admin routes.
- Validation evidence: focused wiki-adventure batch tests, admin-authoring test, all four bridge checks, `pnpm exec tsc --noEmit --pretty false`, and `pnpm build` passed. Build retains the existing missing `SENDGRID_API_KEY` warning.
- `pnpm check` now runs far enough to report current Biome diagnostics and fails with 305 errors, 52 warnings, and 44 infos before truncation. This supersedes older log notes that described a Biome config/schema mismatch as the blocker.
- Added `wiki/plans/wiki-adventure-implementation-review.md` and refreshed the roadmap, plan dashboard, source ledger, technical brief, architecture map, and migration plan status.
- Residual risks to harden before production cutover: admin canonical S3 source writes before validation, partial S3 source overriding local fallback, mixed admin route names, repository-wide Biome cleanup, and authenticated manual playthrough coverage.

## 2026-05-27

### Added admin Adventure Plans top navigation

- Added a focused plan at `wiki/plans/admin-adventure-plans-nav.html` and linked it from the planning dashboard.
- Mounted admin-only header links for `/admin` and `/admin/adventure-plans`, labeled Admin and Plans.
- Added a compatibility redirect from `/admin/wiki-adventures` to `/admin/adventure-plans`.
- Validation: `pnpm generate:routes` passed and `pnpm exec tsc --noEmit` passed.

## 2026-05-26

### Converted admin chat proposals to auto-apply

- Changed Adventure Plan Admin Chat so valid assistant text and structural proposals apply immediately after the assistant response and save through the existing plan update action.
- Kept validation before mutation, preserved chat event auditing, and removed the extra Use-button step from newly generated proposals.
- Validation: `pnpm exec tsc --noEmit` passed; `pnpm build` passed with the existing missing `SENDGRID_API_KEY` warning.

### Implemented admin chat structural proposals

- Extended Adventure Plan Admin Chat with a Plan Structure target and typed structural proposals for adding sections, scenes, and encounters.
- Added shared validation and application logic for structural proposal JSON, including required summaries, encounter intros, GM instructions, and de-duplicated encounter IDs.
- Updated the chat drawer to preview structural proposals and apply them through the existing editor state and save action only after the admin clicks Use.
- Validation: `npx convex codegen` passed; `pnpm exec tsc --noEmit` passed; `pnpm build` passed with the existing missing `SENDGRID_API_KEY` warning.

### Implemented admin chat thread context

- Extended Admin Chat so each assistant request includes the stored per-plan thread discussion, with oldest-message trimming only when the prompt approaches the model context budget.
- Added compact context-pressure metadata to assistant chat messages, including model id, estimated and reported token usage, included and omitted message counts, and warning status.
- Updated the Admin Chat drawer to show context pressure only when usage is notable or prior thread messages were omitted.
- Updated the admin chat feature plan and planning dashboard to record Unit 04, thread context and pressure reporting.
- Validation: `npx convex codegen` completed; `pnpm exec tsc --noEmit` passed; `pnpm build` passed. `pnpm check` remains blocked by the known Biome config/schema mismatch.

## 2026-05-25

### Fixed admin chat review context

- Updated Admin Chat to distinguish advisory review prompts from rewrite prompts so evaluation requests do not produce source-edit refusals or suggestion blocks.
- Expanded Admin Chat context with a compact plan outline and full active-section scene and encounter details from the current editor state.
- Added a section-review target for section-level analysis and used temporary gated server diagnostics during verification.
- Validation: `pnpm exec tsc --noEmit` passed and `pnpm build` passed. `pnpm lint` remains blocked by the known Biome config/schema mismatch.

## 2026-05-24

### Restored March of Davos NPC and monster references

- Audited March of Davos encounter prose against NPC frontmatter references and NPC sheets.
- Added missing NPC/monster source records for the Forest Drake, Ancient Undead, Thaddeus Blackthorn, Joran Antonov, Eldrin Varokich, Clive Stonebrook, Mira Hearthstone, and Harron.
- Attached missing encounter references across the Docks, Library, Wine Cellar, Masquerade Ball, and Covenant finale sequences.
- Validation evidence: March of Davos bridge check, `pnpm exec tsc --noEmit`, and `pnpm build` passed.

### Shifted admin authoring to chat-primary revisions

- Changed the admin wiki authoring direction from approval-gated AI change-set queues to auto-applied chat and key-field edits backed by restorable S3 revisions.
- Removed section/scene text editing, manual NPC add/remove editing, visible NPC IDs, and manual save/export/import as primary authoring controls.
- Updated Stage 6 and final migration plan language so chat, validation, and revision restore are the primary adventure-plan editing model.

### Simplified admin sections sidebar top bar

- Removed outer padding, borders, and button chrome from the sidebar search/collapse row.
- Changed the row to a flush segmented bar with search icon, full-height input, and borderless collapse icon separated only by vertical dividers.
- Validation evidence: `pnpm exec biome check components/wiki-adventures/admin-wiki-adventure-editor.tsx`, `pnpm test:wiki-adventures:admin-authoring`, and `pnpm exec tsc --noEmit --pretty false` passed.

### Aligned collapsed sections restore control

- Moved the collapsed-state restore menu button inline with the page eyebrow row so titles align with the editor content.
- Reduced the expanded sidebar collapse icon stroke to `0.75`.
- Validation evidence: `pnpm exec biome check components/wiki-adventures/admin-wiki-adventure-editor.tsx`, `pnpm test:wiki-adventures:admin-authoring`, and `pnpm exec tsc --noEmit --pretty false` passed.

### Cleaned up admin sections navigator controls

- Enlarged the sidebar collapse icon within its button and removed repeated link-count badges from encounter rows.
- Validation evidence: `pnpm exec biome check components/wiki-adventures/admin-wiki-adventure-editor.tsx`, `pnpm test:wiki-adventures:admin-authoring`, and `pnpm exec tsc --noEmit --pretty false` passed.

### Refined admin wiki sections sidebar design

- Improved the left adventure sections navigator surface, search row, selected page treatment, and collapse button styling.
- Made the collapse control a compact integrated button beside search instead of a visually heavy standalone block.
- Validation evidence: `pnpm exec biome check components/wiki-adventures/admin-wiki-adventure-editor.tsx`, `pnpm test:wiki-adventures:admin-authoring`, and `pnpm exec tsc --noEmit --pretty false` passed.

### Added admin wiki sections sidebar toggle

- Added a sidebar search-row toggle to hide the left adventure sections navigator on desktop admin wiki editor layouts.
- When collapsed, the restore menu button appears as a square control at the upper-left of the selected page header.
- Collapsed state gives the selected page more working width while preserving the chat rail and current selection.
- Validation evidence: `pnpm exec biome check components/wiki-adventures/admin-wiki-adventure-editor.tsx`, `pnpm test:wiki-adventures:admin-authoring`, and `pnpm exec tsc --noEmit --pretty false` passed.

## 2026-05-23

### Expanded admin character detail display

- Removed the character source file-path box from the admin character editor.
- Added read-only sheet detail sections for appearance, personality, background, motivation, behavior, attributes, skills, equipment, spells, and special abilities when present.
- Validation evidence: `pnpm exec biome check components/wiki-adventures/admin-wiki-adventure-editor.tsx`, `pnpm test:wiki-adventures:admin-authoring`, and `pnpm exec tsc --noEmit --pretty false` passed.

### Redesigned admin wiki character editor layout

- Added a dedicated character profile editor layout instead of reusing the module page editor for NPC and premade character markdown.
- Changed character art to a square portrait treatment, removed repeated header/summary content, and kept one editable summary field with paired sheet metadata badges.
- Kept character source writes scoped to markdown profile title, image, and summary fields; JSON sheet handling remains unchanged.
- Validation evidence: `pnpm exec biome check components/wiki-adventures/admin-wiki-adventure-editor.tsx`, `pnpm test:wiki-adventures:admin-authoring`, and `pnpm exec tsc --noEmit --pretty false` passed.

### Unified admin wiki character navigation

- Changed the admin wiki editor navigation to show one `Characters` group instead of separate NPC profile, premade character, and sheet groups.
- Paired character profile markdown and JSON sheets by id, preferring profile paths while preserving JSON-only orphan sheets.
- Kept compiler, runtime artifacts, migrations, S3 source layout, and validation behavior unchanged.
- Validation evidence: `pnpm exec biome check components/wiki-adventures/admin-wiki-adventure-editor.tsx` and `pnpm test:wiki-adventures:admin-authoring` passed.

### Improved admin wiki chat sidebar design

- Reworked the right sidebar in `components/wiki-adventures/admin-wiki-adventure-editor.tsx` into a full-height chat rail with a stronger header, source status chip, labeled prompt dock, custom apply button, and structured change log.
- Preserved existing chat behavior and source-write flow while improving visual hierarchy, spacing, message contrast, and scroll containment.
- Validation evidence: `pnpm exec biome check components/wiki-adventures/admin-wiki-adventure-editor.tsx` passed. Full `pnpm check` remains blocked by pre-existing repository-wide Biome diagnostics outside this change.

### Reworked admin wiki editor toward classic module reading

- Promoted March of Davos encounter hierarchy into durable `sectionTitle`, `sceneTitle`, and `moduleOrder` frontmatter.
- Changed the admin wiki outline to use nested adventure section and scene groups instead of a flat encounter list.
- Added module-style page editing with prominent art preview, replace/remove image controls, read-aloud intro, GM notes, and exits.
- Expanded encounter NPC editing into a compact source-backed NPC panel with portraits, identity details, and sheet/profile summaries while preserving editable reference fields.
- Validation evidence: `pnpm test:wiki-adventures:admin-authoring`, `pnpm test:wiki-adventures:march-of-davos-bridge`, `pnpm tsc --noEmit --pretty false`, `pnpm build`, and `git diff --check` passed.

### Refined admin wiki editor into a navigable wiki map

- Replaced the flat source-file list feel with grouped wiki navigation for adventure pages, encounters, NPC profiles, premade characters, and sheets.
- Added parsed typed-link navigation, encounter transition visibility, backlinks, selected-page context, and a more structured editor layout.
- Validation evidence: `pnpm test:wiki-adventures:admin-authoring`, `pnpm tsc --noEmit --pretty false`, and `pnpm build` passed. Local route smoke for `/admin/wiki-adventures/realm-of-myr/march-of-davos` returned `200 OK`.

### Implemented admin wiki authoring rebuild

- Added a per-adventure admin wiki editor at `/admin/wiki-adventures/{settingId}/{planId}` with chat-first improvement, key-field editing, validation status, and manual export/restore bundles.
- Changed wiki adventure runtime loading to prefer canonical S3 `content/` source and fall back to migrated repo-local source when S3 source is not present.
- Added admin source actions for listing migrated wiki adventures, loading source trees, applying AI chat writes, saving key fields, and exporting/importing source bundles.
- Hid the visible legacy Adventure Plans admin entry in favor of Wiki Adventures.
- Validation evidence: `pnpm test:wiki-adventures:admin-authoring`, all migrated adventure bridge checks, `pnpm test:wiki-adventures:batch-a`, `pnpm test:wiki-adventures:batch-b`, `pnpm tsc --noEmit --pretty false`, `pnpm build`, and `git diff --check` passed. Local route smoke checks for `/admin/wiki-adventures` and `/admin/wiki-adventures/realm-of-myr/covert-cargo` returned `200 OK`.

### Implemented March of Davos wiki migration

- Added `wiki/plans/march-of-davos-wiki-migration.html` and indexed `wiki/sources/adventure plans/the-march-of-davos-plan.json`.
- Added `scripts/migrate-march-of-davos.ts` and `pnpm migrate:march-of-davos` to normalize the older nested source into wiki source files.
- Generated 45 encounter files, 35 promoted NPC sheet/profile pairs, and a migration report; folded legacy stage text into GM notes.
- Set the blank start field to `the-gates-of-kordavos` and inferred linear transitions across the legacy encounter order.
- Added `scripts/wiki-adventures-march-of-davos-bridge-check.ts` and `pnpm test:wiki-adventures:march-of-davos-bridge`.
- Validation evidence: `pnpm migrate:march-of-davos`, `pnpm test:wiki-adventures:march-of-davos-bridge`, `pnpm test:wiki-adventures:road-to-kordavos-bridge`, `pnpm test:wiki-adventures:covert-cargo-bridge`, `pnpm test:wiki-adventures:midnight-bridge`, `pnpm tsc --noEmit --pretty false`, `pnpm build`, and `git diff --check` passed. Signed-out local route checks for `/settings/realm-of-myr/play`, `/settings/realm-of-myr/march-of-davos/practice`, and `/settings/realm-of-myr/march-of-davos/character-select` returned `200 OK`.

### Implemented Road to Kordavos wiki migration

- Added `wiki/plans/road-to-kordavos-wiki-migration.html` and indexed `wiki/sources/adventure plans/the_road_to_kordavos_adventure_plan.json`.
- Added `scripts/migrate-road-to-kordavos.ts` and `pnpm migrate:road-to-kordavos` to generate wiki source files and migration report.
- Repaired the blank legacy start field to `well-met` and recorded the repair in the migration report.
- Extended local wiki runtime support for saved player characters so custom-character adventures can start and transition without premade sheets.
- Added `scripts/wiki-adventures-road-to-kordavos-bridge-check.ts` and `pnpm test:wiki-adventures:road-to-kordavos-bridge`.
- Validation evidence: `pnpm migrate:road-to-kordavos`, `pnpm test:wiki-adventures:road-to-kordavos-bridge`, `pnpm test:wiki-adventures:covert-cargo-bridge`, `pnpm test:wiki-adventures:midnight-bridge`, `pnpm tsc --noEmit --pretty false`, `pnpm build`, and `git diff --check` passed. Signed-out local route checks for `/settings/realm-of-myr/play`, `/settings/realm-of-myr/the-road-to-kordavos/practice`, and `/settings/realm-of-myr/the-road-to-kordavos/character-select` returned `200 OK`.

### Implemented Covert Cargo wiki trial

- Added `wiki/plans/covert-cargo-wiki-trial.html` and indexed `wiki/sources/adventure plans/covert-cargo.json` as a legacy Realm of Myr source.
- Added `scripts/migrate-covert-cargo.ts` and `pnpm migrate:covert-cargo` to generate Covert Cargo wiki source files and a migration report.
- Repaired legacy source issues during migration: missing start encounter set to `the-shipment`, blank transition target dropped, and numeric premade IDs quoted in frontmatter.
- Generalized the local wiki runtime bridge so Covert Cargo and The Midnight Summons share compiled-artifact create/start/advance behavior.
- Added `scripts/wiki-adventures-covert-cargo-bridge-check.ts` and `pnpm test:wiki-adventures:covert-cargo-bridge` for the start-flow bridge proof.
- Validation evidence: `pnpm migrate:covert-cargo`, `pnpm test:wiki-adventures:covert-cargo-bridge`, `pnpm test:wiki-adventures:midnight-bridge`, `pnpm tsc --noEmit --pretty false`, `pnpm build`, and `git diff --check` passed. Signed-out local route checks for `/settings/realm-of-myr/play`, `/settings/realm-of-myr/covert-cargo/practice`, and `/settings/realm-of-myr/covert-cargo/character-select` returned `200 OK`.

## 2026-05-22

### Implemented The Midnight Summons playthrough bridge

- Added `lib/wiki-adventures/midnight-summons-runtime.ts` to load the migrated wiki source tree, compile publish-valid runtime artifacts, expose a pinned content ref, build first-turn characters from paired wiki sheets, and detect final encounters.
- Updated `createAdventure` so The Midnight Summons pins wiki content, initializes `currentEncounterId`, and copies Thalbern from the migrated wiki character sheet.
- Updated `startAdventure` so The Midnight Summons creates its first turn from compiled wiki artifacts instead of legacy nested AdventurePlan encounters.
- Updated `advanceTurn` so The Midnight Summons uses the wiki gameplay context packet, wiki prompt, transition validator, adventure patch validator, and guarded `commitWikiTurnAdvance`.
- Added `scripts/wiki-adventures-midnight-bridge-check.ts` and `pnpm test:wiki-adventures:midnight-bridge` to verify the bridge wiring, repaired transition, final encounter detection, and first-turn character assembly.
- Validation evidence: `pnpm test:wiki-adventures:midnight-bridge`, `pnpm migrate:midnight-summons`, `pnpm tsc --noEmit --pretty false`, `pnpm build`, and `git diff --check` passed. A signed-out CLI HTTP check for `/settings/realm-of-myr/play` returned `200 OK`.
- Authenticated browser smoke reached the first generated turn after selecting Thalbern, proving public selection, solo auto-start, and first-turn creation. The smoke exposed a Next Image/S3 asset issue, fixed by switching migrated URLs to the existing `d20-public.s3.us-east-1.amazonaws.com` asset host and allowing that host in Next config.
- Remaining manual playthrough: submit player actions, advance branches, and verify completion UI.

### Migrated The Midnight Summons into wiki source files

- Added `scripts/migrate-midnight-summons.ts` and `pnpm migrate:midnight-summons` to migrate the legacy JSON source into authored wiki files.
- Generated `content/settings/realm-of-myr/adventures/the-midnight-summons/adventure.md`, 7 encounter markdown files, paired Thalbern premade files, paired Wollandora/Owlbear NPC files, and `migration-report.json`.
- Repaired the stale transition target `broken-silence -> wollandora-intervention` to `broken-silence -> timely-rescue` and recorded it in the migration report.
- Converted legacy local image paths into full S3 URLs under `https://d20-public.s3.us-east-1.amazonaws.com/`, which matches the existing public S3 asset host.
- Validation evidence: `pnpm migrate:midnight-summons` generated 14 source files plus the migration report and compiled the result in publish mode with status `passed`.

### Expanded The Midnight Summons plan to cover full adventure migration

- Added a full adventure migration scope section to `wiki/plans/midnight-summons-playthrough-test.html` covering the adventure root, section/scene wrappers, 7 encounters, 11 transition edges, 2 NPC records, Thalbern, and 11 image references.
- Clarified that section/scene framing should not be lost even if runtime artifacts are encounter-first.
- Added acceptance coverage requiring every legacy adventure object to be represented in wiki source or documented as intentionally transformed.

### Clarified premade character migration for The Midnight Summons

- Updated `wiki/plans/midnight-summons-playthrough-test.html` to state that existing premade characters are still inline legacy `AdventurePlan.premadePlayerCharacters[]` JSON, not authored wiki source files.
- Added a premade migration section requiring paired `characters/thalbern.md` and `characters/thalbern.json` files, with the JSON sheet validating against `types/character.ts` `pcTemplateSchema`.
- Called out the required standard attributes, runtime copy behavior, and S3 image URL publish requirement for Thalbern.

### Audited The Midnight Summons plan for full solo playthrough coverage

- Expanded `wiki/plans/midnight-summons-playthrough-test.html` with a full flow audit covering adventure listing, character selection, solo auto-start, first turn render, roll/action loop, branching transitions, terminal encounters, completion UI, post-completion record, and replay/new-run behavior.
- Identified a legacy content issue: `broken-silence` references `wollandora-intervention`, but the JSON source contains `timely-rescue`. Publish validation should block this unless the migration corrects or aliases the transition.
- Added explicit completion acceptance gates for terminal encounters, `isFinalEncounter`, Adventure `completed` status, `endedAt`, final controls, and Play Again isolation.

### Added The Midnight Summons focused playthrough plan

- Added `wiki/plans/midnight-summons-playthrough-test.html` as a focused plan for migrating and testing the single-player Realm of Myr adventure from the current public selection and Thalbern premade selection screens.
- Indexed the new legacy JSON source at `wiki/sources/adventure plans/the-midnight-summons.json` in `wiki/Sources.html`.
- Linked the playthrough plan from `wiki/plans/index.md`.
- Current recommendation: use The Midnight Summons as the first live playthrough cutover candidate, starting with a preview-backed migration and blocking publish until full S3 asset URLs are present.

## 2026-05-21

### Implemented Wiki Adventure Batch F Convex session pinning

- Added optional Convex `adventures` fields for `currentEncounterId`, pinned `contentRef`, accumulated `adventureSummaryMarkdown`, discoveries, entity updates, open threads, and resolved thread IDs.
- Added optional Convex `turns` fields for embedded `adventurePatch`, transition decision data, and generated-by metadata.
- Updated adventure creation and first-turn creation mutations to accept pinned content refs and initial current encounter state without breaking existing callers.
- Added `commitWikiTurnAdvance` to reject stale current-turn, stale current-encounter, and stale content-hash writes before inserting the next turn and applying the adventure wiki patch.
- Updated legacy finalization to maintain `currentEncounterId` as turns advance, preserving compatibility while Batch G/old-system removal decides when to switch live advancement fully to the wiki runtime path.
- Added `lib/wiki-adventures/convex-session.ts` and `scripts/wiki-adventures-batch-f-check.ts` to verify content-pin guard behavior and adventure wiki patch accumulation without requiring production Convex state.
- Validation evidence: `pnpm test:wiki-adventures:batch-f`, `pnpm test:wiki-adventures:batch-e`, `pnpm test:wiki-adventures:batch-d`, `pnpm test:wiki-adventures:batch-c`, `pnpm test:wiki-adventures:batch-b`, `pnpm test:wiki-adventures:batch-a`, `pnpm tsc --noEmit --pretty false`, and `pnpm build` passed in the implementation worktree.
- Known repo-level validation caveat remains: `pnpm check` is blocked by the existing Biome configuration schema mismatch before checking project files.

### Implemented Wiki Adventure Batch E gameplay runtime projection

- Added `lib/wiki-adventures/artifact-loader.ts` with in-memory and S3 loaders for pinned published/preview runtime artifacts and `latest.json` resolution.
- Added `lib/wiki-adventures/runtime-context.ts` to assemble the AI GM context packet from compiled artifacts plus live turn/session snapshots, preserving recent-turn and roll-context compatibility without reading legacy `AdventurePlan.sections[].scenes[]`.
- Added `lib/wiki-adventures/transition-validator.ts` to validate current-encounter continuation, legal graph transitions, illegal targets, unresolved targets, stale content, and stale encounter results before session movement.
- Added `lib/wiki-adventures/adventure-patch.ts` to validate the AI GM `adventurePatch` contract and align patch transition data with the accepted transition validator result.
- Added `buildWikiEncounterProgressionPrompt` for compiled-artifact gameplay prompts that include content hash/version guards, current encounter sections, legal transition IDs, recent turns, roll context, player-character guardrails, and `adventurePatch` output requirements.
- Added `scripts/wiki-adventures-batch-e-check.ts` and `pnpm test:wiki-adventures:batch-e` to verify publish/load, context packet assembly, prompt shape, legal/illegal/stale transition validation, and adventure patch validation.
- Validation evidence: `pnpm test:wiki-adventures:batch-e`, `pnpm test:wiki-adventures:batch-d`, `pnpm test:wiki-adventures:batch-c`, `pnpm test:wiki-adventures:batch-b`, `pnpm test:wiki-adventures:batch-a`, `pnpm tsc --noEmit --pretty false`, and `pnpm build` passed in the implementation worktree.
- Known repo-level validation caveat remains: `pnpm check` is blocked by the existing Biome configuration schema mismatch before checking project files.

### Implemented Wiki Adventure Batch D AI authoring change-set tools

- Added `lib/wiki-adventures/ai-authoring-tools.ts` with deterministic app-owned authoring tools that return `AuthoringChangeSet` proposals, file diffs, draft-preview validation before/after, risk notes, and mechanical-confirmation flags.
- Covered the Stage 8 Batch D tool categories: create encounter, expand encounter, split encounter, link transition, repair missing transition target, summarize entity, add transition, and create paired character markdown/JSON files.
- Added `proposeWikiAdventureAiChangeSet` to the wiki adventure server actions so the workbench can request validated change-set proposals without direct client-side source mutation or production S3 writes.
- Updated the workbench AI panel to call the proposal action, display file-level diffs and validation status, and apply accepted proposals only to the local draft buffer for review.
- Added `scripts/wiki-adventures-batch-d-check.ts` and `pnpm test:wiki-adventures:batch-d` to verify every tool returns change sets, previews diffs, runs validation, repairs an unresolved transition, and flags character-pair JSON as mechanical.
- Validation evidence: `pnpm test:wiki-adventures:batch-d`, `pnpm test:wiki-adventures:batch-c`, `pnpm test:wiki-adventures:batch-b`, `pnpm test:wiki-adventures:batch-a`, `pnpm tsc --noEmit --pretty false`, and `pnpm build` passed in the implementation worktree.

### Implemented Wiki Adventure Batch C authoring workbench

- Added the first admin wiki authoring workbench route at `/admin/wiki-adventures`, linked from the admin dashboard.
- Added `components/wiki-adventures/wiki-adventure-workbench.tsx` with source tree, markdown/JSON editor, save/dirty state, validation drawer, AI change-set queue, entity inspector, graph preview, compiled encounter preview, and publish center panels.
- Added `app/_actions/wiki-adventures/workbench-actions.ts` so the workbench can run draft-preview or publish validation through the server-side compiler instead of client-only heuristics.
- Added `lib/wiki-adventures/myr-fixture.ts` and `lib/wiki-adventures/workbench-demo.ts` to feed the workbench from the migrated representative Myr AdventurePlan and compiled runtime artifacts.
- Added `scripts/wiki-adventures-batch-c-check.ts` and `pnpm test:wiki-adventures:batch-c` to verify the workbench model includes markdown/JSON source files, graph nodes, publish artifact preview, and draft-vs-publish transition validation behavior.
- Validation evidence: `pnpm test:wiki-adventures:batch-c`, `pnpm test:wiki-adventures:batch-b`, `pnpm test:wiki-adventures:batch-a`, `pnpm tsc --noEmit --pretty false`, and `pnpm build` passed in the implementation worktree. A local signed-out HTTP check returned `200 OK` with the expected admin access-denied state for `/admin/wiki-adventures`.

### Implemented Wiki Adventure Batch B preview/publish and Myr migration

- Added `lib/wiki-adventures/published-repository.ts` with mutable draft preview artifact writes, immutable timestamp/hash published versions, `latest.json` pointer writes, unchanged-content publish no-op behavior, rollback pointer movement, and in-memory/S3-backed repository implementations.
- Added `lib/wiki-adventures/myr-migration.ts` to convert legacy `AdventurePlan` JSON into wiki source files for `adventure.md`, encounter markdown, setting NPC markdown/JSON sheets, adventure premade character markdown/JSON sheets, full S3 URL asset fields, and migration reports.
- Added `scripts/wiki-adventures-batch-b-check.ts` and `pnpm test:wiki-adventures:batch-b` to verify one representative Myr adventure migrates, compiles in publish mode with zero errors, writes preview artifacts, publishes immutable artifacts, no-ops unchanged publish, and rolls back the latest pointer.
- Validation evidence: `pnpm test:wiki-adventures:batch-b`, `pnpm test:wiki-adventures:batch-a`, and `pnpm tsc --noEmit --pretty false` passed in the implementation worktree.
- Known repo-level validation caveat remains: `pnpm check` is blocked by the existing Biome configuration schema mismatch before checking project files.

### Started Wiki Adventure implementation Batch A

- Implemented foundation modules under `lib/wiki-adventures/` for source models, content hashing, S3 key/version helpers, markdown/frontmatter parsing, typed wiki link extraction, change-set application with stale-hash checks, source services, validation reports, and runtime artifact compilation.
- Added `scripts/wiki-adventures-batch-a-check.ts` and `pnpm test:wiki-adventures:batch-a` to verify the representative skeleton compile path, draft-vs-publish transition validation, character sheet validation, and approved change-set behavior.
- Validation evidence: `pnpm test:wiki-adventures:batch-a` passed and `pnpm tsc --noEmit --pretty false` passed in the implementation worktree.
- Known repo-level validation caveat: `pnpm check` is currently blocked by the existing Biome configuration schema mismatch before checking project files.

### Audited and repaired wiki link navigation

- Audited all 20 wiki HTML files for broken local references, invalid anchors, reachability from `wiki/index.html`, and return paths to core wiki pages.
- Added consistent utility navigation to every wiki HTML page with links to the wiki home, source index, plans, roadmap, and architecture pages.
- Added direct source brief links to `wiki/Sources.html` so the evidence ledger links to the product, technical, design, and marketing briefs.
- Validation after repair found 0 broken local references, 0 invalid anchors, and 0 unreachable HTML pages.

### Locked Stage 3 wiki content model direction

- Updated `wiki/plans/wiki-adventure-migration/stage-03-content-model.html` to lock the content model around markdown-authored `encounter` files as the active gameplay unit.
- Recorded the canonical S3 folder model: setting-level reusable NPCs, locations, factions, and items; adventure-level manifests, encounters, premade characters, and assets.
- Added `wiki/plans/wiki-adventure-migration/stage-03-myr-skeleton.html` as a representative Myr skeleton with `adventure.md`, one encounter, one NPC, one location, premade character handling, transitions, and validation notes.
- Planning nuance: a one-encounter skeleton can demonstrate the model, and the editor should allow planning-preview skeletons with unresolved transition targets. Publish readiness still requires every transition target to resolve or exist as a stub encounter.
- Added image reference guidance: NPCs, premade PCs, setting locations, encounters, adventures, and other authored entities should support S3 image references through frontmatter and compiled asset validation.
- Recorded that NPC and PC-like content should use the standard six ability scores from the current open D&D SRD 5.2 rules reference, stored under the existing schema field name `attributes`: Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma.
- Revised character planning to a hybrid model: JSON character sheets are the source of truth for default mechanical state, while paired markdown profiles provide wiki links, role notes, and retrieval context.
- Locked authored NPC and premade PC JSON sheet field names to match `types/character.ts`; premade character sheets compile to `PCTemplate`, NPC sheets compile to `NPC`, and Convex `TurnCharacter` records are mutable session snapshots.
- Updated future-stage planning references from stale `page`-based gameplay terminology to the locked `encounter`-based model.
- Drafted Stage 4, Unit 01 index shape: published runtime artifacts include `manifest.json`, `encounters.json`, `entities.json`, `character-sheets.json`, `graph.json`, `retrieval-index.json`, and `validation-report.json`.
- Drafted Stage 4, Unit 02 validation model with separate `draftPreview` and `publish` modes, stable validation finding codes, severity rules, and AI-fixable repair policy.
- Drafted Stage 4, Unit 03 publish/index strategy: explicit compile pipeline, disposable preview bundles, immutable published versions, `latest.json` pointer, content hashes, session version pinning, and rollback rules.
- Drafted Stage 4, Unit 04 S3 contract: source/preview/published prefixes, source layout, preview/published artifact layout, metadata/cache expectations, access policy expectations, and deletion/retention rules.
- Drafted Stage 5, Unit 01 context assembly: the LLM gameplay prompt should be built from a typed context packet combining pinned published artifacts, deterministic linked context, live Convex session state, legal transition IDs, and the current JSON response contract.
- Drafted Stage 5, Unit 02 transition model: the LLM proposes `nextEncounterId`, application code validates it against pinned `graph.json` and live Convex Adventure state, then records accepted or rejected transition patches without allowing stale or illegal target mutation.
- Drafted Stage 5, Unit 03 dice and narrative compatibility: preserve lightweight D20 roll requirements, `[DiceRoll]` and `[OriginalReply]` narrative markers, mutable character session fields, encounter-scoped spell-use defaults, readable turn history, and practice-report compatibility without committing to a full D&D combat engine.
- Drafted Stage 5, Unit 04 realtime session model: Convex remains the realtime authority for adventure sessions, participants, current turns, chat, transition/roll events, mutable character state, and generated history while S3 published artifacts remain the source of authored adventure content.
- Advanced the planning dashboard to Stage 6 authoring and admin.
- Drafted Stage 6, Unit 01 AI-assisted editor model: the new authoring UI should be wiki-first and diff-first, with AI producing structured change sets for markdown/JSON source files, draft-preview validation before writes, stale-write checks, and explicit human approval gates.
- Drafted Stage 6, Unit 02 admin UX replacement: mapped current AdventurePlan editor capabilities to the wiki editor, preserving launch-critical authoring jobs while retiring the monolithic JSON form, section/scene nesting, direct AI mutation, and hidden runtime flags behind explicit source files, graph views, validation, and preview workflows.
- Drafted Stage 6, Unit 03 draft/publish lifecycle: editable source files, disposable preview bundles, immutable published versions, explicit publish validation, version history, rollback through `latest.json`, permissions, and preview playthrough pinning.
- Drafted Stage 6, Unit 04 design requirements: the wiki editor should be a dense operational workbench with file tree, markdown/JSON editor, AI change-set panel, validation drawer, graph/compiled preview, publish center, visible states, and accessibility requirements.
- Drafted Stage 7 relaunch migration: implementation should happen in an isolated relaunch worktree, migrate Myr JSON templates to wiki source with validation proof, maintain delete/adapt/defer removal gates, and roll out through preview validation with deployment/content-pointer rollback.
- Advanced the planning dashboard to Stage 8 final plan assembly.
- Drafted Stage 8 final implementation assembly: implementation milestones, worktree start guidance, test and acceptance plan, launch gates, risk controls, and handoff prompt for future implementation agents.
- Marked the Wiki Adventure Migration planning program implementation-ready; next work should start only in an isolated relaunch worktree after explicit approval.
- Refined the runtime plan: Adventure Plans are stable authored S3 wiki templates, while live Adventures are AI-GM-controlled playthrough instances that evolve a backend Adventure wiki record in Convex through validated `adventurePatch` updates.
- Locked implementation-contract addendum decisions: one shared active draft per Adventure Plan, change-set-only source writes, mutable latest preview per draft, timestamp/hash publish versions, full S3 URL asset fields, retained `planId` semantics, and embedded transition patches instead of a v1 `transition_events` table.
- No app code changes were made.

## 2026-05-20

### Created Wiki Adventure Migration planning program

- Added an active multi-stage planning track at `wiki/plans/wiki-adventure-migration/`.
- Recorded user decisions: S3 is canonical wiki storage; required frontmatter plus pattern-guided markdown; AI-assisted generation/editing; complete relaunch in a worktree; old JSON/editor architecture can be removed; Myr templates must be migrated.
- Updated the planning dashboard so Stage 1, Unit 01 - current-state dependency inventory is the current planning unit.
- No app code changes were made; this is a planning-only artifact set.

### Initialized HTML project wiki

- Imported existing repo context into a new HTML-first project wiki at `wiki/`.
- Classified lifecycle as existing product prototype / post-MVP import, so no `wiki/plans/mvp/` tree was created.
- Created source briefs for product, technical, design, marketing, and architecture context because repository evidence supported each one.
- Recorded ask-first automation policy for commits, code changes, pushes, dependency installs, and long commands.
- Key unresolved context: confirm whether 2026-02-28 authorization/realtime findings are still open before starting corrective implementation.
