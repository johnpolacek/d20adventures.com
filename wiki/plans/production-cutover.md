# Production Cutover — public flow onto wiki source

[← All plans](index.md) · [Roadmap](../roadmap.md) · **Status:** planned, not started · Drafted 2026-06-11

Move the **public** adventure play flow off legacy S3 `AdventurePlan` JSON and onto the wiki-adventure runtime, then make the runtime safe to push to production. This is the roadmap's committed **Next** track. The merged runtime already drives create, start, advance, NPC, and player-reply turns through compiled wiki artifacts; the gap is the front door (listing and character entry) plus the operational safety work around it.

## Bottom line

Turn execution is fully wiki-backed. **Three public pages still read the legacy plan unconditionally**, and one wiki-runtime data gap (`availableCharacterOptions`) blocks the custom-character path. Close those, audit production S3 completeness, gate the prototype workbench actions, and prove rollback — then the legacy dual-read can be retired.

## Progress (2026-06-11, branch `feature/production-cutover`)

- ✅ **Unit 3** — `availableCharacterOptions` (and previously-unset `teaser`/`summary`) now compile into `RuntimeManifest`.
- ✅ **Units 1–2 + grid** — listing/lobby, character-select, character-create, **and** the `/settings/[settingId]/play` card grid now read the wiki runtime via `lib/wiki-adventures/plan-view.ts`. The registry-vs-S3 sourcing fork resolved itself: the admin side and runtime both already treat the adventure set as a hardcoded list of four, and authoring new adventures is Deferred — so a registry-driven grid is behavior-identical, not a product regression.
- ✅ **Full runtime path** — `loadAdventurePlanForRuntime` now backs every gameplay/runtime legacy-plan reader (in-progress page, per-turn page, practice, join, check-final, first-turn, roll-result, active-adventure party, reports, profile image). A stubbed/absent legacy plan can no longer 500 any play surface.
- ✅ **Unit 6** — workbench actions gated behind `requireAdmin`.
- ✅ **Browser-verified** — authenticated agent-browser pass confirmed grid, premade select, custom character-create races, solo auto-start, turn-1 wiki content, and a full reply → Perception roll → resolution loop, with no server errors.
- ✅ **Legacy editor removed** — the `/edit` + `/new` routes, plan-actions, plan-chat, `adventure-plan-structure`, and editor-only `components/adventure-plans/*` are deleted; the one gameplay tie (`getAdventurePlan`) moved to a wiki-backed action; dev/admin edit links repointed to `/admin/wiki-adventures`.
- ✅ **Unit 4 resolved (keep the JSON)** — decision 2026-06-12: do **not** delete the legacy S3 `AdventurePlan` JSON. It is now a never-reached fallback, so it is harmless, and keeping it is a free safety net (rollback, and any old in-DB adventures that reference a `planId`). The cutover removes the *dependency*, not the data.
- ✅ **Unit 5** — prod S3 completeness audit (`pnpm audit:wiki-adventures:prod-s3`). Found and **resolved** the March of Davos drift (reconciled to repo, prod S3 cleared — see below). All four adventures now resolve to the repo-bundled source.
- ✅ **Unit 7** — rollback / content-ref pinning verified (`pnpm test:wiki-adventures:rollback`): a pinned adventure is unaffected by a bad publish, rollback re-points `latest`, and fresh starts resolve the restored version.

**The cutover is complete and verified, and all four adventures are deploy-ready.** The only thing left is the actual prod deploy (`convex:deploy` + frontend), at your discretion.

## Decision needed — March of Davos prod S3 source

The Unit 5 audit found the March of Davos wiki source already exists *complete* in prod S3 (`d20-data`) but **diverges from the repo in 40 of 116 files** and predates the `availableCharacterOptions` edit. Because it is complete, the runtime serves the prod S3 copy — so after deploy, March of Davos would run divergent content and its custom character-create would show no races. (The other three adventures have no prod S3 source and safely use the repo-bundled source.) Two ways to resolve, both requiring prod S3 writes:

1. **Repo is canonical** — clear/overwrite the prod S3 `content/.../march-of-davos/**` (and the drifted setting NPC files) so the runtime falls back to the repo-bundled source, which carries the cutover edits. Simplest; discards the prod-only changes.
2. **Prod S3 is canonical** — pull the 40 drifted prod files back into the repo, reconcile, then add `availableCharacterOptions` and re-publish. Preserves any live-authored prod changes; more work and needs a diff review to know what the prod-only edits are.

Until this is resolved, do not `convex:deploy`/deploy the cutover for March of Davos. The other three are deploy-ready.

### Resolved (2026-06-12) — reconciled to repo, prod S3 cleared

Decision taken: **repo-canonical, uniform**. Reconciled the finished prod S3 March of Davos source into the repo (40 files updated; richer `adventure.md`, plot-coherent climax, fuller NPC sheets, 57 transitions vs 44), re-added `availableCharacterOptions`, then deleted the prod S3 `content/.../march-of-davos/` prefix (64 keys incl. `_revisions/`). The audit now reports March of Davos as `local (S3 partial, rejected)` → the runtime serves the repo-bundled source for all four adventures. Git holds the canonical content, so the clear is reversible. (70 setting-level `npcs/` keys remain in prod S3, orphaned and ignored — the runtime uses 100% repo source for March of Davos.) **All four adventures are now deploy-ready.**

### Drift investigation (2026-06-12) — prod S3 is the canonical, more-finished version

A content comparison of the 40 drifted files settled the question: **March of Davos was only rawly/partially migrated into the repo; the finished content lives in prod S3** (refined via the wiki authoring tools after the initial migration). So the runtime *correctly* prefers prod S3 — the real problem is that the repo copy is stale.

Evidence:
- `adventure.md` — prod has `## Aftermath: Potential Outcomes`, `## Conclusion`, and `## Sequel Hooks` sections the repo lacks (the repo has only Teaser/Summary/Authoring Notes). The encounters reference these prod-only sections.
- `final-confrontation` (climax) — prod names the antagonist (Joran Antonov), the McGuffin (Key of Ilmarin), and a three-way branching resolution tied to the Aftermath; the repo is a generic "cloaked Covenant figure" draft.
- NPC sheets (`silverhand*`) — prod is ~2× fuller.
- Not a clean superset: ~17 files are longer in the repo (e.g. `morning-at-the-dragonbone`, `an-unsolicited-opportunity`) — likely verbose raw-migration prose later tightened in prod; spot-check before discarding.

**Recommendation:** reconcile **prod S3 → repo** (pull the finished prod source into git so repo and prod match), spot-check the handful of repo-longer files to confirm nothing unique is lost, then add `availableCharacterOptions` to the reconciled `adventure.md` and it deploys consistently. Tooling: `pnpm audit:wiki-adventures:prod-s3` flags the drift; a small pull script can mirror `content/.../march-of-davos/**` + the drifted `npcs/silverhand*` from S3 into the repo.

## Remaining work — pre-prod-push assurance

Neither item changes app code; both are operational checks before the wiki runtime drives production traffic.

### Unit 5 — Production S3 wiki-source completeness audit
The runtime prefers published S3 wiki source and falls back to repo-local source **only when S3 is a complete manifest** ([local-runtime.ts](../../lib/wiki-adventures/local-runtime.ts) `selectWikiAdventureSourceFiles`). Before the prod push, confirm one of two safe states per migrated adventure:
1. Prod S3 carries a *complete* published source/artifact set (every expected path), so the runtime uses it; **or**
2. Prod S3 is empty/partial for that adventure, so the complete-manifest check falls back to the repo-local source bundled in the deploy.

The unsafe state is a *partial* prod S3 seed that nonetheless looks preferable. The audit: enumerate the prod S3 wiki prefixes for each of the four adventures, diff against the expected manifest, and assert each adventure resolves to state 1 or 2 (never partial-preferred). Read-only; no writes.

### Unit 7 — Rollback verification under a bad publish
Player adventures pin `contentRef` (versionId + contentHash) at create time ([create-adventure.ts](../../app/_actions/create-adventure.ts), [start-adventure.ts](../../app/_actions/start-adventure.ts)), so a bad publish should only affect **new** starts that resolve `latest.json`. Prove the chain in a non-prod/preview target:
1. Publish a deliberately-broken version of an adventure; confirm in-flight pinned adventures are unaffected (still resolve their pinned version).
2. Run `restoreAdminWikiAdventureRevisionAction` / `rollback` and confirm `latest.json` re-points to the prior good version ([published-repository.ts](../../lib/wiki-adventures/published-repository.ts) `rollback`).
3. Confirm a fresh start after rollback picks up the restored version.

A `pnpm test:wiki-adventures:*`-style scripted check could cover steps 1–3 against the in-memory/preview repository to make this repeatable without prod writes.

## Current state

What already branches on `isLocalWikiAdventure(settingId, planId)` ([lib/wiki-adventures/local-runtime.ts:103](../../lib/wiki-adventures/local-runtime.ts)) and needs no cutover work:

| Path | File | Status |
|---|---|---|
| Create adventure | [app/_actions/create-adventure.ts:45](../../app/_actions/create-adventure.ts) | ✅ wiki-aware |
| Start adventure | [app/_actions/start-adventure.ts:74](../../app/_actions/start-adventure.ts) | ✅ wiki-aware |
| Player-reply roll | [lib/services/adventure-turn-reply-service.ts:20](../../lib/services/adventure-turn-reply-service.ts) | ✅ wiki-aware (fixed 2026-06-11) |
| NPC-turn DM context | [lib/services/npc-turn-service.ts:32](../../lib/services/npc-turn-service.ts) | ✅ wiki-aware (fixed 2026-06-11) |

What still reads the legacy `AdventurePlan` JSON unconditionally — the cutover surface:

| Page | Legacy read | What it pulls |
|---|---|---|
| Adventure home / listing | [page.tsx:13](../../app/settings/[settingId]/[adventurePlanId]/page.tsx) `loadAdventurePlanFromStorage` | title, image, `premadePlayerCharacters`, and **legacy nested** `sections[0].scenes[0].encounters[0]` for the demo turn |
| Character select | [character-select/page.tsx:24](../../app/settings/[settingId]/[adventurePlanId]/character-select/page.tsx) `readJsonFromS3` | `availableCharacterOptions`, `premadePlayerCharacters`, title, teaser, image |
| Character create | [character-create/page.tsx:24](../../app/settings/[settingId]/[adventurePlanId]/character-create/page.tsx) | `availableCharacterOptions.races` / `.archetypes` |

The listing page reading `sections[0].scenes[0].encounters[0]` is the same legacy-nested-structure dependency that produced three runtime 500s this cycle — it will misbehave for any wiki adventure whose legacy S3 plan is a stub.

## Wiki-runtime equivalents

`loadWikiAdventureRuntime(settingId, planId)` ([local-runtime.ts:117](../../lib/wiki-adventures/local-runtime.ts)) returns `{ definition, artifacts, contentRef }`. The fields the public pages need map cleanly — except one:

| Legacy field | Wiki equivalent ([types.ts](../../lib/wiki-adventures/types.ts)) |
|---|---|
| `plan.title` / `.teaser` / `.image` | `artifacts.manifest.title` / `.teaser` / `.image` |
| party size | `manifest.minPlayers` / `.maxPlayers` / `.recommendedPlayers` |
| `premadePlayerCharacters[]` | `artifacts.characterSheets.premadeCharacters[id].sheet` (`PCTemplate`), ids in `manifest.premadeCharacterIds` |
| first encounter | `artifacts.encounters[manifest.startEncounterId]` |
| `availableCharacterOptions` | **none — gap (see Unit 3)** |

## Work units

### Unit 1 — Cut the listing page onto wiki source
Branch [page.tsx](../../app/settings/[settingId]/[adventurePlanId]/page.tsx) on `isLocalWikiAdventure`. For wiki adventures build the demo turn from `manifest`/`characterSheets`/`encounters[startEncounterId]` instead of `sections[0].scenes[0].encounters[0]`. Keep the legacy branch unchanged for non-registered plans. Verify `AdventureHome` props still satisfied.

### Unit 2 — Cut character-select onto wiki source
Branch [character-select/page.tsx](../../app/settings/[settingId]/[adventurePlanId]/character-select/page.tsx). Premade characters come from `characterSheets.premadeCharacters`. The `premadeOnly` decision (`!availableCharacterOptions`) depends on Unit 3.

### Unit 3 — Carry `availableCharacterOptions` through the wiki runtime
The blocker for the custom-character path (Road to Kordavos). Add an optional `availableCharacterOptions { races, archetypes }` to `adventure.md` frontmatter, compile it into `RuntimeManifest`, and surface it to [character-select](../../app/settings/[settingId]/[adventurePlanId]/character-select/page.tsx) and [character-create](../../app/settings/[settingId]/[adventurePlanId]/character-create/page.tsx). Absence ⇒ premade-only (matches today's `undefined` semantics). Re-run the Road to Kordavos bridge check after.

### Unit 4 — Retire or stub the legacy dual-read
Once Units 1–3 land, decide per migrated plan whether the legacy S3 JSON is still needed for back-compat (old in-DB adventures reference `planId`) or can be reduced to a minimal stub. Document the decision; don't delete blindly — confirm no in-flight adventure resolves content through the legacy plan.

### Unit 5 — Production S3 wiki-source completeness audit
Before any prod seed, confirm production S3 either carries a complete manifest per migrated adventure or correctly triggers the complete-manifest fallback to repo-local source ([local-runtime.ts:125](../../lib/wiki-adventures/local-runtime.ts)). A partial remote seed must fall back, not compile incomplete remote source.

### Unit 6 — Gate the prototype workbench server actions
[app/_actions/wiki-adventures/workbench-actions.ts](../../app/_actions/wiki-adventures/workbench-actions.ts) (`validateWikiAdventureWorkbenchFiles`, `proposeWikiAdventureAiChangeSet`) is unauthenticated. They are proposal/preview-only (no S3 writes — real writes go through `requireAdmin`-gated [admin-authoring-actions.ts](../../app/_actions/wiki-adventures/admin-authoring-actions.ts)), so this is Low severity, but gate behind admin or mark dev-only before cutover. Open finding from the [implementation review](wiki-adventure-implementation-review.md).

### Unit 7 — Verify rollback under a bad publish
Player adventures pin `contentRef` (versionId/hash) at create time ([create-adventure.ts:94](../../app/_actions/create-adventure.ts), [start-adventure.ts:100](../../app/_actions/start-adventure.ts)), so a bad publish should only affect **new** starts that fetch `latest.json`. Prove it: publish a deliberately-broken version, confirm in-flight adventures are unaffected, `restoreAdminWikiAdventureRevisionAction` / `rollback` re-points `latest.json` ([published-repository.ts:147](../../lib/wiki-adventures/published-repository.ts)), and a fresh start picks up the restored version.

## Sequencing

1. **Unit 3 first** — it unblocks Unit 2's `premadeOnly` decision and the custom-character path.
2. **Units 1 + 2** — the actual front-door cutover; verify each with a live playthrough per the [gameplay-playthrough-testing skill](../../.agents/skills/gameplay-playthrough-testing/SKILL.md) (solo: Midnight Summons; custom-character: Road to Kordavos).
3. **Unit 6** — small, independent; can land anytime.
4. **Unit 5 + Unit 7** — operational gates, immediately before the production push.
5. **Unit 4** — last, once the new paths are proven in the browser.

## Acceptance gates

- All three public pages resolve content through compiled wiki artifacts for the four registered adventures; non-registered plans still use the legacy branch.
- Solo (Midnight Summons), multiplayer (Covert Cargo), and custom-character (Road to Kordavos) shapes each reach a turn through the new front door in a live authenticated playthrough.
- `availableCharacterOptions` round-trips: premade-only adventures hide character-create; custom-character adventures show races/archetypes.
- No public page reads `sections[].scenes[].encounters[]` for a wiki adventure.
- Rollback verified per Unit 7; workbench actions gated per Unit 6.
- `pnpm check`, `tsc --noEmit`, all bridge checks, and `pnpm build` green.

## Risks

- **Stub legacy plans** — any remaining legacy read against a migrated adventure with a stub S3 plan fails the same way the three fixed bugs did. Unit 1's listing page is the live instance of this risk.
- **`contentRef` drift** — if listing/select start pinning content (they currently build an unpinned `demo-adventure`), keep pinning consistent with create/start so rollback semantics hold.
- **Back-compat** — old in-DB adventures reference `planId`; don't remove legacy JSON until Unit 4 confirms nothing in flight resolves through it.
