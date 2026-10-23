# Maintenance follow-ups

[Plans](index.md) · [Wiki Home](../index.md) · [Testing](testing-runbook.md)

Status: Open backlog, reviewed 2026-10-01. These items preserve unfinished work from deleted completed plans. They are not claims of fresh runtime failures.

Stageview delivery is tracked [separately](stageview.md). This pass changed documentation only.

## Confirmed code and test gaps

| Item | Evidence | Next action |
|---|---|---|
| Test wrapper waits on unused port 4000 | `package.json` has `test:wait` waiting on 3000 and 4000. Worktrees use cloud Convex and configurable Next ports. | Make the wrapper target the selected server and actual readiness signal. Until then, invoke `test:run` directly. |
| Production signed-out admin test | September checks recorded a redirect to missing `/sign-in`. `tests/auth.spec.ts` expects the development Access Denied view. | Align the production sign-in route and assertion. Keep this distinct from passing development coverage. |
| Cannot clear some editor fields | `updateSection` in `admin-wiki-adventure-editor.tsx` returns original content for a blank markdown section. Existing frontmatter fields can be set to an empty string. | Define supported clearing semantics and verify save/refresh. |
| Legacy no-next-encounter completion | `markAdventureCompleteWithoutNextEncounter` sets timestamps without `status: "completed"`. The wiki terminal path does set status. | Verify remaining legacy reachability, then fix or remove the helper. |
| Guard test differs from live mutation | `lib/wiki-adventures/convex-session.ts` rejects stale content, while live `commitWikiTurnAdvance` re-pins content. The rollback check tests separate artifact modules. | Align coverage with live content-edit behavior and keep module-level guarantees explicit. |
| Desktop gate Party view blocked | The desktop starts the party at the head of the gate line. Its Party group shot then sits under the merchant stall canopy, with the authored party too. Seen in a 2026-10-03 browser check. | Reframe the Party shot for the desktop's queue position. |
| Repository-wide formatting | Last recorded full Biome check on 2026-09-29 reported 24 formatting/import-order errors outside the removal branch. | Re-establish the baseline before a formatting cleanup. Lint passing does not imply check passing. |

## Validation still to establish

- Storyview: multi-character dialogue, on-demand 402, phone layout, incremental paragraph reuse, automatic shared billing, low-balance pause/resume, concurrent requests, and final-debit failure behavior.
- Mapview: verify the extracted panel on a real authenticated turn after the old 3D removal. September's extraction check used a fixture.
- Homepage performance: confirm deployment and measure CPU under comparable traffic. Local static-build verification does not prove deployed savings.
- Access control: review route/action ownership, per-character control, and direct Convex access against the current implementation.
- Realtime: audit duplicated subscriptions, SSE, and polling before attempting consolidation.
- Convex: assess loose validators and collect/filter hotspots after the access model is clear.

Historical audits are leads, not a current comprehensive security or performance assessment.

## Conditional product work

Mapview editor integration, broader map coverage, and new pieces remain deferred until its Stageview role is decided. See [Mapview](mapview.md).

Community setting creation, arbitrary new adventure authoring, and public/private/unlisted sharing remain roadmap ambitions, not completed features.

## Environment cleanup

Remote state was not inspected or changed on 2026-10-01. Confirm current existence and use before deleting anything.

| Resource | Last recorded follow-up |
|---|---|
| Temporary Convex projects | Deletion reminders for `d20adventures-feature-mapview`, `d20adventures-feature-play-layout-refactor`, `d20adventures-feature-static-homepage`, and `d20adventures-feature-remove-3d-stack`. Check other finished branch projects, including Storyview and Stageview engine, rather than assuming they remain. |
| Retired 3D S3 data | Review `settings/<settingId>/scenes3d/`, `images/minis/`, `images/minis3d/`, and `images/scene-previews/`. |
| Old provider configuration | `FAL_KEY` has no current app reader. Check local and Vercel configuration before removal. |
| Historical test audio | Storyview's initial test wrote under `adventures/jh7bftjhdjgrjwqakfc4ccdb6x89tzxa/turns/jn77se1k9cx3pfbwe03gtsxjfn89vjj6/audio/`. Verify whether it still exists or is referenced. |
| Historical migration residue | June's cutover recorded 70 orphaned setting-level NPC objects in production S3. Re-inventory before considering removal. |

The retired branches were already deleted on 2026-09-29. Do not retain them as open tasks.

Compatibility fields `map3d` / `map3dKey`, `Encounter3D*` schemas, the old ledger literal `usage_encounter_asset`, the image-proxy route, and the narrative drawer variant remain intentionally. Decide removal based on stored-data and Stageview needs.
