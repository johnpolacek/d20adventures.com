# Testing runbook

[Plans](index.md) · [Wiki Home](../index.md) · [Maintenance](maintenance.md)

Maintained reference. Commands and routes reviewed against local main on 2026-10-01. Historical results in [the log](../log.md) are not fresh test runs.

## Environment

Use the checkout's isolated Convex project and [worktree workflow](parallel-dev-worktrees.md). S3 buckets and Clerk remain shared. Authoring, map generation, token replacement, and real narration can write shared storage or spend tokens.

Playwright's `tests/global-setup.ts` requires:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
- `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, and `TEST_USER_ID`
- `ADMIN_USER_IDS`, including `TEST_USER_ID`

Inspect the selected target before tests that mutate data. Use `PLAYWRIGHT_BASE_URL` for a worktree server. The config reads `.env`, `.env.local`, and `.env.test`. Existing process values take precedence because the dotenv calls do not enable override.

Install the matching browser when needed:

```bash
pnpm exec playwright install chromium
```

Start the checkout through `pnpm wt:dev`. For a deliberate direct port, `pnpm dev` honors `PORT`. Avoid `dev:fresh` in parallel sessions because it kills shared ports.

## Select checks by change

| Change | Checks |
|---|---|
| Documentation | Relative file and heading links, documented routes/scripts, stale references, `git diff --check`. |
| TypeScript/app behavior | `pnpm exec tsc --noEmit`, `pnpm lint`, focused checks below, then `pnpm build` when rendering/build behavior matters. |
| Shared GM runtime | `pnpm --filter @d20/gm-core check`, `pnpm test:gm-core`, then app checks and an authenticated full playthrough. See [GM core](../gm-core.md). |
| Compiler/source contracts | Relevant `pnpm test:wiki-adventures:batch-a` through `batch-f`. |
| Adventure content/runtime | Relevant bridge check: `midnight-bridge`, `covert-cargo-bridge`, `road-to-kordavos-bridge`, or `march-of-davos-bridge`, with the `test:wiki-adventures:` prefix. |
| Admin authoring | `pnpm test:wiki-adventures:admin-authoring`, affected bridge checks, editor browser checks. |
| Discovery and runtime loader | `pnpm test:wiki-adventures:public-flow`, affected bridge checks, authenticated selection/start. |
| Published artifact repository | `pnpm test:wiki-adventures:rollback`. This tests in-memory published versions, not frozen content in live registered adventures. |
| Auth/homepage | `pnpm test:auth` or `pnpm test:run` against the intended server. Specs live in `tests/auth.spec.ts`, `api-auth.spec.ts`, and `homepage.spec.ts`. |
| Stage set/engine | `pnpm stage:check`, then GPU verification described below. |

The production source audit is `pnpm audit:wiki-adventures:prod-s3`. It reads production storage. Run it when deployment/source coverage is in scope, not as a routine unit check.

### Known harness limits

- `pnpm test` runs `dev:fresh` and waits for TCP 3000 and 4000. Cloud Convex does not supply the old port-4000 service. Use `test:run` directly against a running selected server until this is fixed.
- The signed-out admin test expects development's Access Denied page. September production runs redirected to a missing `/sign-in`. Report this as a known failure rather than claiming an entirely green production suite.
- `pnpm lint` and `pnpm check` differ. The latter includes formatting and import order. Record pre-existing failures separately.

## Wiki authoring checks

Use `/admin/adventure-plans/{settingId}/{planId}` with an admin account and a deliberate test-content target.

1. Edit adventure and encounter key fields. Wait for autosave, refresh, and confirm persistence.
2. Apply an AI chat edit. Confirm the affected source and validation update.
3. Submit an invalid reference or transition. Confirm the canonical write is blocked.
4. Restore a revision or one file. Confirm content and revision history update.
5. Confirm NPC sheets, premades, locations, and transitions compile and resolve.
6. Verify signed-out/non-admin access is denied.

The old `/settings/{settingId}/{planId}/edit` route, nested section/scene editor, and draft-toggle checklist are obsolete. Clearing fields has a known limitation tracked in [maintenance](maintenance.md).

## Gameplay checks

For automated authenticated playthroughs, use the repository's [gameplay playthrough skill](../../.agents/skills/gameplay-playthrough-testing/SKILL.md).

| Scenario | Route and checks |
|---|---|
| Discovery | `/settings/realm-of-myr/play`. Four registered adventures, valid links, independent failure handling. |
| Solo | Midnight Summons character selection, Thalbern, solo start, reply, roll, NPC turn, encounter transition, terminal completion, and Play Again. Exercise both terminal branches across separate runs when changing transition logic. |
| Custom characters | Road to Kordavos character selection/create. Valid races/archetypes, saved sheet loaded, first encounter and turn progression. |
| Multiplayer | Covert Cargo character selection, lobby, join/start, separate player control, chat, and turn progression. |
| Practice | `/settings/{settingId}/{planId}/practice`. Management access, party bounds, owner control of selected PCs, denied joins and non-owner access. |
| Reports | Generate a practice report. Verify persistence in turn/player views, typed findings, editor links, errors, and token behavior. |
| Live source edits | Registered adventures load current source and re-pin provenance on advance. Verify turn/encounter concurrency guards still hold. Do not expect immutable snapshot playback. |
| Unauthorized access | Signed-out and non-member adventure reads, actions, chat, and streams remain denied. |
| Billing | Successful charges, insufficient funds, and refund/failure behavior for the flow changed. Storyview has its own post-generation debit policy. |

## Visual features

**Mapview:** Use stored maps for player checks. Confirm rail and floating entry, fullscreen/close/Escape, map location title, token staging, narrow layouts, and no-map behavior. Generating or re-placing maps writes shared S3.

**Storyview:** Verify attributed dialogue with several characters, playback/navigation, free cached replay, narrative appends reusing prior audio, concurrent requests, on-demand 402, owner auto toggle, split charges, pause/resume, and phone layout. Placeholder TTS checks flow only, not real voices.

**Stageview:** The preview is development-only and does not need gameplay records. The current check script validates repo-local sets and staging. Browser verification needs real-GPU Chrome with remote debugging. Setup and flags are documented in `scripts/stage-verify.ts`.

```bash
pnpm stage:check
STAGE_BASE=http://localhost:3057 STAGE_CDP_PORT=9478 pnpm stage:verify --tiers=ultra,high
```

**Desktop screens in a browser:** In development the desktop app opens in a browser tab without Tauri. Bridge calls go to the dev server, which runs the real runtime script against a scratch data folder. It never starts the GM's CLI unless `D20_PREVIEW_GM` is set. `D20_PREVIEW_DATA_DIR` points it at a copy of a data folder with saves and heroes, and `D20_REQUIRE_ACCOUNT` shows the link step. Run `pnpm prepare:runtime` once first if `src-tauri/resources/runtime.cjs` is missing. Headless Chromium needs `--use-angle=metal --ignore-gpu-blocklist --enable-gpu` for the stage to render. The app itself runs in WebKit, so check layout there too: `pnpm exec playwright install webkit` adds it to Playwright.

```bash
cd apps/desktop
D20_PREVIEW_DATA_DIR=/path/to/copy pnpm exec vite --host 127.0.0.1 --port 1433 --strictPort
```

Inspect shader errors, draw/triangle counts, native-pixel character crops, every relevant shot, motion, pause/resume, and disposal. A mobile quality tier running on a desktop does not establish phone performance. Future stage-first gameplay needs a full authenticated playthrough as well as renderer verification.

## Recording results

For each meaningful change, record the commit/target, commands, environment, outcomes, and limits in its plan. Update the wiki log for durable findings. Do not convert an unchecked historical item into a pass without evidence.
