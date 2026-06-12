# Production Cutover — public flow onto wiki source

[← All plans](index.md) · [Roadmap](../roadmap.md) · **Status:** planned, not started · Drafted 2026-06-11

Move the **public** adventure play flow off legacy S3 `AdventurePlan` JSON and onto the wiki-adventure runtime, then make the runtime safe to push to production. This is the roadmap's committed **Next** track. The merged runtime already drives create, start, advance, NPC, and player-reply turns through compiled wiki artifacts; the gap is the front door (listing and character entry) plus the operational safety work around it.

## Bottom line

Turn execution is fully wiki-backed. **Three public pages still read the legacy plan unconditionally**, and one wiki-runtime data gap (`availableCharacterOptions`) blocks the custom-character path. Close those, audit production S3 completeness, gate the prototype workbench actions, and prove rollback — then the legacy dual-read can be retired.

## Progress (2026-06-11, branch `feature/production-cutover`)

- ✅ **Unit 3** — `availableCharacterOptions` (and previously-unset `teaser`/`summary`) now compile into `RuntimeManifest`.
- ✅ **Units 1–2 (gameplay-critical pages)** — listing/lobby, character-select, and character-create branch on the wiki runtime via the new `lib/wiki-adventures/plan-view.ts` adapter. Verified by `pnpm test:wiki-adventures:public-flow` + tsc/build/check.
- ✅ **Unit 6** — workbench actions gated behind `requireAdmin`.
- ⏳ **Browser re-verify** — the three pages changed; the new front-door paths need a quick authenticated visual check (gameplay turns already proven).
- 🔲 **Grid cutover + Unit 4** — `/settings/[settingId]/play` still enumerates legacy S3 JSON. Blocked on a sourcing decision (see Unit 1 note).
- 🔲 **Units 5, 7** — prod S3 audit and rollback verification (need prod access / manual run).

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
