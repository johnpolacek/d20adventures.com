# D20 Adventures desktop

The real local GM flow in the Stageview interface. Start March of Davos with Branka, Cassia, Yeva, and Milos. The player controls all four characters. NPC turns run through the shared GM core and the selected local CLI.

From the repository root:

```sh
pnpm install --ignore-scripts
pnpm desktop:dev
CARGO_BUILD_JOBS=2 pnpm desktop:build
```

The release app is `apps/desktop/src-tauri/target/release/bundle/macos/D20 Adventures.app`. It contains the frontend, authored content pack, stage assets, and bundled Node game runtime. It does not depend on the checkout at runtime. This version requires an installed Node.js 24 or newer and a signed-in Claude Code, Codex, Grok, or Gemini CLI. Provider compatibility still depends on the installed CLI and account. The live integration was checked with Claude.

The gate and the Harvest Festival have 3D sets, chosen by the current encounter in `src/scenes.ts`. Clan Conflict and later encounters use the same real turn flow in story view. The festival square has Karim, Liora, Madam Zephyra, Finnian, and Merrick, named places the GM and movement can use, and views of each. Positions reset when the encounter changes and persist through rounds of the same encounter. The GM receives the square's named places and where everyone stands. Read the narration, then submit an action or roll the die. The journal includes the original inputs and formatted dice results. Camera presets, character focus, step/auto reading, and render quality controls use the shared Stageview components. Action movement is interpreted by the CLI, clamped by the renderer, and saved. Movement waits for the action to finish. A failed check leaves the character in place. A walk ends on time even while the window is covered, so the turn never waits for the window to be shown.

A single local adventure is stored in SQLite under the platform's app data directory. On macOS: `~/Library/Application Support/com.d20adventures.desktop/adventure.sqlite`. Closing and reopening resumes the current turn, including a pending roll. The natural die is persisted before inference, so retrying cannot change it. No CLI credentials are read or copied by the app. The bridge retains the tested subscription CLI invocation controls and uses no web backend or token billing.

The native bridge exposes a bounded set of game commands. Operations are serialized, with a SQLite process lease across app instances. Each accepted milestone commits independently. Failed inference blocks fallback writes and returns the last durable state. Individual CLI requests have a 120-second deadline, with one JSON correction. A native operation has an eight-minute deadline. CLI children are closed after the operation and when their parent exits.

Character patches apply atomically on turn advancement. Equipment supports adding or removing one named item per operation, including transfers. Effects support add/refresh/removal and expire once per completed round. Health and status are absolute updates, with an empty status clearing it. Known spells track usage and recharge on encounter changes. Live values survive new encounters and restarts, including remembered NPCs, and feed the next GM request. Click a character twice to focus them and open their current sheet.

The model must return explicit character operations or an empty update list. Invalid references receive one correction attempt, then fail without advancing. Item/effect/spell matching is exact after trimming and ignoring case. Existing version 1 saves bootstrap remembered state from stored character snapshots. Historical prose-only change notes remain readable and are not guessed at or replayed.

Current limits: one adventure slot, four premade player-controlled characters, two authored 3D sets, no multiplayer or narration audio, and no signing/notarization/updater. Equipment is a list of items, without a separate quantity or currency ledger. Combat and other providers were not covered by the native playthrough. The spike's five-call optimization remains separate.

Validation:

```sh
pnpm --filter @d20/desktop prepare:runtime
pnpm --filter @d20/desktop test
pnpm --filter @d20/desktop check
pnpm --filter @d20/stage check
pnpm stage:check
```

The eleven desktop tests cover real core advancement, scene selection and story-view fallback, festival figure ids and portraits, position reset and retention, stale and unknown position writes, inventory transfers, conditions, effect expiry, spell usage, encounter transitions, NPC return, save/reopen, duplicate protection, model correction, and atomic rejection. Native character-card validation uses a temporary fixture save, separately from the earlier live Claude playthrough.

Set `D20_RENDER_REPORT=1` when launching the native executable to write a one-time render readiness report to `render-report.json` beside the save. This opt-in local diagnostic contains renderer readiness, resource URLs, visibility, and JavaScript errors. It does not send telemetry.
