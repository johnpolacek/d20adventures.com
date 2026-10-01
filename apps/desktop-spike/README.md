# D20 desktop phase 0 spike

Throwaway macOS Tauri app. Results and the decision live in [the phase 0 plan](../../wiki/plans/desktop-local-play.md#phase-0-spike). No web app dependencies or runtime behavior are changed.

From this directory:

```sh
pnpm install
pnpm test
pnpm build
pnpm tauri dev
pnpm tauri build --debug --bundles app
```

Long builds and model trials require the owner's approval. In the native window, `detect` performs bounded help/version probes, `gm` runs the progression fixture and warm schema-switch probe plus the Google API baseline, and `images` runs one portrait and one front/back sheet for each image provider. Individual GM requests have a 120-second deadline with at most one JSON correction. Image jobs have a 240-second deadline each.

The Rust command starts the Node harness in the isolated worktree. The harness uses the repository's existing TypeScript prompt service and zod declarations. The root worktree must have its dependencies installed. This debug app is tied to its build checkout and uses an installed Node executable. It is not a standalone distribution. Launch `src-tauri/target/debug/bundle/macos/D20 Desktop Spike.app` to check `tauri://localhost`. The native result has `nativeTauri: true`. CLI-only execution is useful for diagnosis but does not count as a webview launch:

```sh
# From the worktree root
node --import tsx apps/desktop-spike/harness/run.mjs fixture
node --import tsx apps/desktop-spike/harness/run.mjs detect
```

The progression fixture is an authored Kordavos gate scene with a completed fee payment. It measures one progression step, not an entire player reply, dice, NPC and AI-party pipeline. A separate routine-payment roll request tests a second schema in the same persistent process. `results/fixture.json` holds full prompts and source hashes. Results distinguish requests from provider-reported internal turns. Provider HTTP call counts are not observable.

FilmBrain provenance: `~/Projects/aifilmcamp/apps/macos/Packages/FilmBrain/Sources/FilmBrain/`, especially the four `*Locator.swift` and `*InvocationBuilder.swift` files and `ImageGeneration/`. This spike ports the known-path lookup, credential-free process environment, bounded execution, Claude lockdown, image flags, and generated-image collection. It does not copy credential files or reuse FilmBrain's broader settings inspection. It keeps CLI credentials entirely inside the installed binaries.

The current code retains the original strict trial gate. The owner has since withdrawn blanket configuration isolation as a product requirement. See the revised phase 0 plan. The three saved `blocked` GM results are untested providers, not demonstrated incompatibilities. Implementing their persistent adapters is still pending. No runtime permissions changed as part of that correction.

In the original trial, Claude's stream initialization must explicitly report empty tools, MCP servers, skills, and plugins. Safe mode alone still enabled three built-in plugins in the installed version. The invocation disables those plugins explicitly and rejects missing capability evidence. Known install paths take precedence over GUI PATH wrappers. The current harness still skips Codex app-server, Gemini ACP, and Grok ACP under the former ignore-configuration rule. That rule must be replaced when adding their adapters. A blocked mode has no GM latency or quality score. One-shot image jobs are separate and do not establish persistent GM support.

The webview uses only the existing Clerk publishable key and this worktree's Convex URL. It records booleans, origin and user agent information. Evidence files never record Clerk tokens, cookies, passwords or user IDs. `Test account sign-in` is debug-only. Its native helper uses the existing project's test Clerk key and configured test email to create a 60-second, single-use ticket. The ticket passes only through memory to Clerk's sign-in hook. Do not run that helper from a logging terminal. The test creates no user or password. This proves ticket sign-in in the packaged origin, not interactive OAuth redirects. Clerk sign-in and the existing unauthenticated Convex React subscription are separate checks. This does not add or prove Clerk JWT authorization in Convex.

`results/images/` contains provider originals, transparent PNGs, and front/back halves. The chroma key is a deterministic green-excess calculation with edge despill. If the provider ignores the green background, local macOS Vision segmentation supplies a mask. That fallback needs macOS 14 or newer and the Swift toolchain. Visual inspection is required before judging the sheets usable. The review sheet shows Codex above Grok, portrait left and standee right.

To repeat background removal and make the checkerboard review sheet without any model calls:

```sh
node harness/reprocess-images.mjs
```

Canonical measurements are `results/gm.json`, `results/image-run.json`, and `results/webview-bundled.json`. `elapsedMs` in image rows measures the provider process. Background-removal timing is separate. The final saved images were reprocessed locally from native-generated originals, as recorded by `localPostprocessing`. Preliminary GUI-wrapper runs are excluded from committed evidence.

No production deployment, signing, notarization, packaging for distribution, SQLite, game-logic extraction or live adventure mutation is part of this spike.
