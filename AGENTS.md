# D20 Adventures Agent Guide

Commit and push to `main` when the work is done and nothing about it is in question.

## Checks

Each finishes in under 30 seconds. There is no root lint or typecheck script.

- `pnpm test:gm-core`: game master core and its server adapter, plus `tsc` on `convex/` and the regex check (`scripts/regex-check.ts`).
- `pnpm --filter @d20/gm-core test` and `check`: the rules tests in `packages/gm-core/test/sheet`, and its typecheck.
- `pnpm --filter @d20/desktop test` and `check`: the desktop runtime tests, and its typecheck.
- `pnpm test:store`: store and desktop unit tests.
- `pnpm test:srd`: SRD rules package.
- `pnpm stage:plans:check`, `pnpm stage:check` and `pnpm stage:director`: stagings, plans, camera sight lines and the director's takes.
- `pnpm packages:check`: each adventure gathers into a package with no set, figure or file missing.
- `pnpm test` builds the site and runs Playwright against dev servers. It is long, so ask first.

## Read before you write

- Encounters, sets, stagings, the camera, the director, `apps/desktop/src/moments.ts`, or a loader for stage files: `packages/stage/AGENTS.md`.
- A post for `/updates` (`content/updates/*.md`, in John's voice): `docs/writing-voice.md`.
- Rules work toward full SRD 5.2.1: `plans/srd-rules.md`. Other open multi-session plans live in `plans/`.
- Stage UI motion and `enter-*` classes: `plans/stage-motion.md`.
- Shared components in `packages/ui`: `packages/ui/AGENTS.md`.

## Where to Look

- SRD rules text: `packages/srd/sources/official/srd-5.2.1.txt`. Parsed data: `packages/srd/data/*.json`.
- Rules as the game plays them (spells, attacks, conditions, classes, feats, rests): `packages/gm-core/src/sheet`.
- What a player's action rolls: `packages/gm-core/src/services/roll-requirement-service.ts`. What the roll does: `adventure-roll-result-service.ts` beside it. NPC turns: the `npc-turn-*-service.ts` files there.
- Character and adventure types: `packages/gm-core/src/types`. `types/*.ts` at the root only re-export them.
- Desktop screens: `apps/desktop/src/pages.tsx` for saved and hosted games, `play.tsx` and `stage-play.tsx` for play. The game itself runs in `apps/desktop/runtime/game.ts`.
- How the GM rules on a check, probed against the model: `apps/desktop/scripts/check-probe.ts` with cases in `check-probes.json`. Scenes: `scene-probe.ts` beside it. A whole adventure on scripted paths, with timings, the hero's health and repeated NPC lines: `pnpm --dir apps/desktop playtest <plan>`, plans in `playtest-plans.json`. Every plan twice, summed into one scorecard to judge a change by: `pnpm --dir apps/desktop playtest:sweep`, and `--compare` on two scorecards. Watched in the app: `record:playthrough` with `VITE_D20_TRACE=1`, which logs each shot, who is in frame and each stage's load wait to `apps/desktop/.logs/window.log`.
- The asset library is `asset-library/` at the repo root, not under `public/`.

## Where New Code Goes

- Game logic goes in `packages/gm-core`. It imports nothing from Next, Clerk or Convex and reaches the outside only through the ports in `src/ports.ts`.
- Game logic never reads what a player or the model meant with a pattern on their words. Add a field to the model's schema, or an authored field to the content, and read that. Patterns are for text we write: SRD rules, adventure markdown, ids and dice. `scripts/regex-check.ts` lists the patterns the GM's services and story may hold, each with its reason.
- `lib/gm-server` binds that core to the website. Most of `lib/services` is one-line wrappers that call it, so logic does not go there.
- `packages/ui` (`@d20/ui`) is shared by the site and the desktop app. It imports nothing from Next, Clerk, Convex or the site. It is built on UI SDK (`@ui-sdk/react`, docs in its `docs` folder).
- `apps/desktop` is the Tauri app, with its Node game runtime in `apps/desktop/runtime`. The `.mjs` files there find and launch the player's AI CLI (`cli.mjs`, `sessions.mjs`).
- Adventures are authored as markdown under `content/settings/<setting>/adventures/<adventure>/`, compiled by `lib/wiki-adventures`. `data/adventure-plans/*.json` is the old format, used only by `scripts/migrate-*`.
- Ledger is the look of pages that are read or used, not played. Reading pages (Updates, Terms, Contact) wear it through `LedgerPage`, and working pages (Admin, the Asset Library) through `LedgerDesk`, both in `components/layout/ledger-page.tsx`, with styles in `app/updates/updates.css` (classes begin `up-`). `/ui` shows the game look, Ledger and what both share in three tabs.
- `app/dev` and `lab/stage-art` are dev pages and experiments, not shipped features.

## Gotchas

- The site's own GM starts new games of the demo adventure only: `demo` in `LOCAL_WIKI_ADVENTURES`, checked by `playsOnSite()`. Every other adventure is hosted from the desktop app. Development runs them all.
- Every AI call the site pays for runs inside a daily budget (`lib/gm-server/budget.ts`, ledger in `convex/aiBudget.ts`): wrap a new one in `paid()`, or ask `budgetOpen()` first and `recordSpend()` after. The owner sets the limit on `/admin`. A new model needs its price added there.
- A push to `main` does not deploy the site. `pnpm deploy:site` sends what `origin/main` holds to production, since the Hobby plan allows 100 deploys a day. Convex functions reach production only by `pnpm convex:deploy`. Never edit `convex/_generated`, which `npx convex codegen` writes.
- Auto mode blocks `pnpm convex:deploy`, `pnpm deploy:site`, `vercel env` and `pnpm assets:sync`. Ask John to run them with `!`. Ask for `! pnpm convex:deploy --yes`: the `!` shell cannot answer Convex's prompt to push to production. It also blocks `pnpm desktop:release`, paid or destructive asset runs (`assets:pilot --pay`, `assets:archive`), `aws s3`, force pushes, and `git checkout` or `git restore` on files you did not change. Ask John instead of trying another way.
- `proxy.ts` is the Clerk middleware.
- Scratchpad scripts cannot resolve `@d20/*` imports, or any other package such as `playwright` or `three`. Import a `@d20` package's source file by absolute path. For others, put the script in the repo root and delete it after. Import Playwright from `@playwright/test`, since plain `playwright` is not installed.
- When root `tsc` reports errors in `.next/types`, they name pages that no longer exist. Delete `.next/types` and run it again.
- Pull with `git pull --rebase --autostash`. Plain `--rebase` fails on unstaged changes.
- Other sessions edit `main` at the same time. Re-read a file after a pull, before editing it.
- A check that fails in a file you did not change may be another session's edit in progress. Look at `git status` and leave it alone.
- Run `pnpm stage:sync` before pushing new or changed files in `public/stage`, `public/stage-lab` or `public/images/app/backgrounds`. Vercel deploys leave them out and the site serves them from the public bucket.
- Site code imports `served` from `lib/served.ts`, which names the asset host on the server and in the browser alike. Background textures in CSS read the `--tex-*` variables that `app/layout.tsx` sets on `<html>`.
- Run `pnpm images:sync` after adding or repainting a picture the content names, then commit `lib/images-manifest.json`. `lib/images.ts` picks a size: `picture()` for an `<img>` with a size list, `pictureAt()` for a single address. The site does not use `next/image`.

## Branches and Dev

- Work on `main` in the main checkout. No feature branches or worktrees until beta.
- `pnpm dev` starts Convex, the website, and the desktop app. `pnpm dev:web` and `pnpm dev:app` start one each. `pnpm dev:fresh` kills the ports first.
- The dev app runs as "D20 Adventures Dev" (`com.d20adventures.desktop.dev`), the name computer-use tools ask for. `VITE_D20_TRACE=1` writes its sound buses and frame rate to `apps/desktop/.logs/window.log`.

## Doc Upkeep

When guidance changes, update the narrowest doc that holds it. Each rule lives in one place.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
