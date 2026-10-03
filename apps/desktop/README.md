# D20 Adventures desktop

The real local GM flow in the Stageview interface. Start March of Davos with Branka, Cassia, Yeva, and Milos. The player controls all four characters. NPC turns run through the shared GM core and the selected local CLI.

From the repository root:

```sh
pnpm install --ignore-scripts
pnpm desktop:dev
CARGO_BUILD_JOBS=2 pnpm desktop:build
```

The release app is `apps/desktop/src-tauri/target/release/bundle/macos/D20 Adventures.app`. It contains the frontend, authored content pack, stage assets, and bundled Node game runtime. It does not depend on the checkout at runtime. This version requires an installed Node.js 24 or newer and a signed-in Claude Code, Codex, Grok, or Gemini CLI. Provider compatibility still depends on the installed CLI and account. The live integration was checked with Claude.

The gate encounter has a 3D set. Later encounters use the same real turn flow in story view. Read the narration, then submit an action or roll the die. The journal includes the original inputs and formatted dice results. Camera presets, character focus, step/auto reading, and render quality controls use the shared Stageview components. Action movement is interpreted by the CLI, clamped by the renderer, and saved. Movement waits for the action to finish. A failed check leaves the character in place.

A single local adventure is stored in SQLite under the platform's app data directory. On macOS: `~/Library/Application Support/com.d20adventures.desktop/adventure.sqlite`. Closing and reopening resumes the current turn, including a pending roll. The natural die is persisted before inference, so retrying cannot change it. No CLI credentials are read or copied by the app. The bridge retains the tested subscription CLI invocation controls and uses no web backend or token billing.

The native bridge exposes a bounded set of game commands. Operations are serialized, with a SQLite process lease across app instances. Each accepted milestone commits independently. Failed inference blocks fallback writes and returns the last durable state. Individual CLI requests have a 120-second deadline, with one JSON correction. A native operation has an eight-minute deadline. CLI children are closed after the operation and when their parent exits.

Current limits: one adventure slot, four premade player-controlled characters, one authored 3D set, no multiplayer or narration audio, and no signing/notarization/updater. World-state character patches retain the core's current semantics: they are recorded but not applied as inventory/effect changes. Combat and other providers were not covered by the native playthrough. The spike's five-call optimization remains separate.

Validation:

```sh
pnpm --filter @d20/desktop prepare:runtime
pnpm --filter @d20/desktop test
pnpm --filter @d20/desktop check
pnpm --filter @d20/stage check
pnpm stage:check
```

Set `D20_RENDER_REPORT=1` when launching the native executable to write a one-time render readiness report to `render-report.json` beside the save. This opt-in local diagnostic contains renderer readiness, resource URLs, visibility, and JavaScript errors. It does not send telemetry.
