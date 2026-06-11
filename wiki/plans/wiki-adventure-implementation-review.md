# Wiki Adventure Implementation Merge Review

[← All plans](index.md) · **Status:** merged, hardening pending · Merge `fbd3e97` (2026-06-10) · Audited 2026-06-11

Deep review of the merged `feature/wiki-adventure-implementation` worktree after it landed on `main`: runtime flow, Convex guards, admin authoring, S3 source behavior, migrated Myr content, validation, and durable wiki updates.

**Bottom line:** Focused wiki-adventure tests, TypeScript, and the production build pass. The repository-wide Biome check fails and several rollout risks remain before this can be treated as production-ready. Scope was code review plus wiki audit, no production push.

## What landed
- Four Realm of Myr adventures now have repo-local wiki source and bridge checks: The Midnight Summons, Covert Cargo, The Road to Kordavos, and March of Davos.
- Runtime create, start, and advance paths can load compiled wiki artifacts for registered local wiki adventures.
- Turn advancement assembles a bounded wiki context packet, validates LLM transition targets, pins content hashes, and commits through a Convex mutation that rejects stale turn, stale encounter, stale content, and duplicate order writes.
- **Not a full cutover:** legacy S3 AdventurePlan JSON still drives the public selection and startup path for listing, titles, party size, and route compatibility.

## Findings

| Severity | Finding | Evidence | Recommended action |
|---|---|---|---|
| **High** | Admin chat and key-field edits write canonical S3 source before a blocking validation gate, so invalid source can become the canonical runtime candidate before it is compiled and reported. | `lib/wiki-adventures/admin-authoring.ts:81`, `:103`, `:216` | Compile the proposed file set before `writeApprovedChangeSet`; require publish-valid or explicit draft-only status. |
| **Medium** | Any S3 source presence disables local fallback, so a partial S3 seed can make the runtime compile incomplete remote source instead of known-good repo source. | `lib/wiki-adventures/local-runtime.ts:125` | Require a complete manifest before preferring S3, or fall back when remote source is incomplete. |
| **Medium** | Admin route naming builds but confuses: list at `/admin/adventures-plans`, singular routes redirect, detail edit under `/admin/wiki-adventures`. | `app/admin/adventure-plans/page.tsx:3`, `app/admin/adventures-plans/page.tsx:14`, `app/admin/wiki-adventures/[settingId]/[planId]/page.tsx:13` | Choose one canonical admin URL, keep the rest as redirects, align nav state. |
| **Medium** | `pnpm check` fails repository-wide with import-sorting and formatting diagnostics across existing and generated files (305 errors, 52 warnings on 2026-06-11). | repo-wide Biome run | Run a focused Biome cleanup pass before release. |
| Low | `NativeImage` swaps Next image optimization for a raw `<img>` to render S3/CloudFront images without remote host config. | `components/ui/native-image.tsx:13`, `next.config.ts:3` | Accept as a tradeoff, or reintroduce optimized handling once host policy is stable. |
| Low | Prototype workbench server actions remain unauthenticated under `app/_actions`. | `app/_actions/wiki-adventures/workbench-actions.ts` | Remove, gate, or mark dev-only before cutover. |
| Low | Key-field editor cannot clear a markdown section; blank values return the original content. | `components/wiki-adventures/admin-wiki-adventure-editor.tsx:1544` | Allow an explicit clear, or preserve the heading with an empty body. |
| Low | Legacy no-next-encounter completion sets `endedAt` but not `status: "completed"`; wiki final encounters use the guarded path correctly. | `lib/services/advance-turn-finalization-service.ts:7`, `convex/adventure.ts:522` | Patch the legacy helper, or verify it is unreachable. |

## Validation evidence

| Command | Result | Notes |
|---|---|---|
| `pnpm test:wiki-adventures:batch-a` … `batch-f` | ✅ Passed | Compiler, migration, validation, source behavior. |
| `pnpm test:wiki-adventures:admin-authoring` | ✅ Passed | Admin authoring behavior covered. |
| All four bridge checks | ✅ Passed | Midnight Summons, Covert Cargo, Road to Kordavos, March of Davos. |
| `pnpm exec tsc --noEmit --pretty false` | ✅ Passed | TypeScript accepted the merged tree. |
| `pnpm build` | ✅ Passed | Existing `SENDGRID_API_KEY` disabled warning only. |
| `pnpm check` | ❌ Failed | Biome import-sort and format diagnostics. |

## Next actions
1. **Resolve `pnpm check`** — fix the diagnostics or scope an accepted generated-content exception, so the repo has one standard validation command.
2. **Pre-write validation for admin S3 authoring** — prevent invalid LLM or field edits from becoming the runtime source of truth.
3. **Complete-manifest S3 fallback** — fall back to repo source when remote source is incomplete.
4. **Normalize admin route naming** — one canonical admin URL, aligned nav state.
5. **Authenticated end-to-end playthrough** — run a browser playthrough across at least one migrated adventure to completion.
