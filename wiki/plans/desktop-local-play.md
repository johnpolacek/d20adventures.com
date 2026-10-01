# Desktop local play

[Plans](index.md) · [Wiki Home](../index.md) · [Stageview](stageview.md) · [Architecture](../Architecture.md) · [Roadmap](../roadmap.md)

Status: Proposed 2026-10-01. No code yet.

A Tauri desktop app where solo play is free. The AI Game Master runs through an AI CLI the player already has installed and signed in to with their own subscription. Online multiplayer keeps the GM on the server and becomes the paid subscription. Stageview is rebuilding the turn page anyway, so the shared game logic and UI split should happen during that rebuild instead of after it.

## Owner decisions

Recorded 2026-10-01:

- Desktop app built with Tauri. Mac first, then other platforms. The game UI stays in TypeScript inside the webview, with a thin Rust layer.
- Ship as a notarized direct download. No Mac App Store, because its sandbox blocks running the player's installed CLIs.
- Solo play runs the GM locally through the player's CLI and is free. AI-controlled party members can fill the party.
- Multiplayer runs the GM on the server and is the paid online subscription.
- Target players who are both AI-savvy and tabletop fans. Requiring an installed, signed-in CLI is acceptable.
- Local play uses authored adventures with pre-baked art. Player-made adventures to share or sell come later.
- Web and desktop share one TypeScript game-logic library.

## Policy basis

Anthropic's [Claude Code legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) (read 2026-10-01) does not prevent "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription." Conditions that apply to this app:

- Launch the player's own unmodified `claude` binary. Do not use the Agent SDK for subscription play, since the Agent SDK docs require API keys for third-party products.
- Sign-in completes in Anthropic's own flow. The app never reads, copies, stores, or forwards CLI credentials or session tokens.
- The app never pays for, resells, or intermediates the player's usage.
- Running Claude Code in a product requires agreeing to the Commercial Terms. Assume this applies.
- Pro and Max limits assume ordinary, individual usage. One person playing solo fits that.
- Anthropic may enforce without notice. Supporting several CLIs is the hedge, and online play remains a fallback.

Unknown: OpenAI Codex and Gemini CLI terms for being launched by a third-party app.

## Current coupling

| Area | Today | Change needed |
|---|---|---|
| LLM calls | `lib/ai/index.ts` wraps AI SDK `generateObject`, `generateText`, and `streamObject` using `currentModel` from `lib/ai/llm.ts` (`gemini-3.5-flash-lite`). Token charging runs inside the wrapper. | Model behind an `Llm` port. Charging moves to a `Billing` port. |
| GM services | 22 files in `lib/services/`. 15 have no direct Convex, S3, or token imports. Six GM services do: `advance-turn-finalization`, `adventure-turn-reply`, `adventure-roll-result`, `npc-turn`, `ai-pc-turn`, `turn-audio`. | Move the 15 as-is. Put the six behind ports. |
| Turn orchestration | `app/_actions/advance-turn.ts` server action. | Orchestration moves into the core. The server action becomes a thin adapter. |
| Content | `lib/wiki-adventures/local-runtime.ts` compiles source using `node:fs` and S3. | `Content` port. Local play reads bundled, versioned packs. |
| Narration | `lib/ai/tts.ts` calls the Gemini TTS API directly. | No CLI equivalent. Open decision. |
| Stage | `lib/stage/`, plain three.js, client only. | Moves as a package unchanged. |
| Auth | Clerk. | Not needed for local solo. Needed for online play and purchases. |

## Target architecture

pnpm workspace layout:

| Package | Contents | Must not import |
|---|---|---|
| `packages/gm-core` | Turn pipeline, prompts, zod schemas, rules, port interfaces | Next, Convex, Clerk, AWS, Node built-ins |
| `packages/stage` | Current `lib/stage/` runtime and set/staging specs | Next, Convex, Clerk |
| `packages/game-ui` | Stage-first turn page, dock, dice, character UI | Next, Convex, Clerk |
| `apps/web` | Current Next app, server GM, accounts, multiplayer | |
| `apps/desktop` | Tauri shell with Vite and React | Convex for local solo state |

Ports:

| Port | Web and online | Desktop solo |
|---|---|---|
| `Llm` | AI SDK with server keys | CLI bridge through Tauri IPC |
| `Store` | Convex | SQLite through Rust |
| `Content` | S3 with repo fallback | Bundled pack files |
| `Billing` | Token ledger, later subscription | No-op |
| `Narration` | Gemini TTS | Open decision |

Rust stays thin: CLI process management, SQLite saves, pack files, updater.

## Local AI harness

Port the design of aifilmcamp's `apps/macos/Packages/FilmBrain`, which already locates and drives Claude, Codex, Gemini, and Grok CLIs in Swift.

Long-running modes, checked against installed CLIs on 2026-10-01:

| CLI | Mode |
|---|---|
| Claude Code | `claude -p --input-format stream-json --output-format stream-json` |
| Codex | `codex app-server`, JSON-RPC over stdio, marked experimental |
| Gemini CLI | `gemini --acp`, Agent Client Protocol |

Rules:

- Lock the GM process down: no tools, no user settings, skills, plugins, or MCP servers. For Claude, start from the FilmBrain flags such as `--tools ""`, `--safe-mode`, `--setting-sources ""`, `--strict-mcp-config`, and `--disable-slash-commands`.
- One process cannot switch `--json-schema`, and the GM uses a different shape per step. Put the schema in the prompt, validate with the existing zod schemas in `gm-core`, and retry once with the validation error.
- One session per scene or encounter. Restart with a summary when the scene changes or context gets large. Keep the static GM prompt first so the prompt cache stays warm.
- Detect installed CLIs and versions. Guide sign-in by telling the player to run the CLI's own login.
- Handle usage-limit errors clearly. Let the player switch CLI and resume from the save.
- Pin tested CLI versions. Output formats can change between releases.

## Phases

### Phase 0, spike

No product changes.

- Tauri test app launches each CLI in long-running mode and runs a real turn from `advance-turn-prompt-service`.
- Measure calls per turn, latency per call, and JSON validity against current zod schemas.
- Compare GM quality per CLI against `gemini-3.5-flash-lite`.
- Check Codex and Gemini CLI terms.
- Go or no-go decision recorded in [the log](../log.md).

### Phase 1, extract gm-core

No behavior change. Run on a worktree.

- Create the pnpm workspace and `packages/gm-core` with the ports.
- Move the 15 uncoupled services. Put the six coupled services behind `Store` and `Billing`.
- Move charging out of the `lib/ai/index.ts` wrapper.
- Move turn orchestration out of `app/_actions/advance-turn.ts`.
- Validate with build, TypeScript, lint, Playwright, and a full authenticated playthrough.

### Phase 2, shared stage-first UI

- Build the [Stageview](stageview.md) phase 4 turn page in `packages/game-ui` from the start, with no Next or Clerk imports.
- Move `lib/stage/` to `packages/stage`.
- The web app consumes both packages.

### Phase 3, desktop solo

- `apps/desktop` with Tauri, Vite, and React.
- Rust CLI manager, SQLite saves, and pack loader.
- Content packs compiled from authored adventures with pre-baked art. Packs are declarative data and never executable code, matching the Stageview set rule.
- AI party members through the existing `ai-pc-turn-service`.
- Premade characters first.
- Onboarding for CLI detection, sign-in guidance, and provider choice.
- Notarized DMG and the Tauri updater.

### Phase 4, online tier

- Account sign-in in the desktop app.
- Subscription billing through the existing Stripe setup.
- Multiplayer through the server GM.
- Pack downloads. Creator packs and selling come later.

## Open decisions

- Narration in local play: system TTS, off, or an online feature.
- Character creation and generated art in local play: premades only, or an online purchase.
- Whether the subscription replaces tokens or sits beside them.
- Whether the web app keeps solo play with tokens, or becomes the online and multiplayer surface only.
- Saves moving between local and online play.
- Default CLI and the minimum GM quality bar.
- Pack format, versioning, and signing.
- Timing for Windows and Linux builds.

## Risks

| Risk | Mitigation |
|---|---|
| Provider policy changes | Several CLIs supported. Online GM fallback. |
| CLI output format changes | Pinned versions, adapter tests per CLI. |
| Turn latency through CLIs | Measure in phase 0. Merge GM calls per turn if needed. |
| Uneven GM quality across models | Quality bar per CLI from phase 0. |
| Usage limits hit mid-adventure | Clear errors, provider switching, resumable saves. |
| Two shipping targets | Shared packages. The desktop app adds a shell, not a second game. |
