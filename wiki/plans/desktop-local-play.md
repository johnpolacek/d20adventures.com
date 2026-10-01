# Desktop local play

[Plans](index.md) · [Wiki Home](../index.md) · [Stageview](stageview.md) · [Architecture](../Architecture.md) · [Roadmap](../roadmap.md)

Status: Proposed 2026-10-01. No code yet.

A Tauri desktop app becomes the only game client. Solo play is free. The AI Game Master runs through an AI CLI the player already has installed and signed in to with their own subscription. Online multiplayer keeps the GM on the server and is paid by a subscription that grants tokens. The web app's play experience is deprecated once the desktop app ships. Stageview is rebuilding the turn page now, so the stage-first turn page should be built for the desktop app instead of the web app.

## Owner decisions

Recorded 2026-10-01:

- Desktop app built with Tauri. Mac first, then other platforms. The game UI stays in TypeScript inside the webview, with a thin Rust layer.
- Ship as a notarized direct download. No Mac App Store, because its sandbox blocks running the player's installed CLIs.
- Solo play runs the GM locally through the player's CLI and is free. AI-controlled party members can fill the party.
- Supported CLIs include Claude Code, Codex, Gemini CLI, and Grok. The owner accepts the terms risk for Codex, Gemini, and Grok.
- Multiplayer runs the GM on the server. A subscription grants tokens, roughly matching current token pricing.
- Narration is optional and player-supplied through common voice-generation providers. Either support several, or pick one and make it an optional add-on the player sets up.
- Players can generate their own characters or use premades.
- Target players who are both AI-savvy and tabletop fans. Requiring an installed, signed-in CLI is acceptable.
- Local play uses authored adventures with pre-baked art. Player-made adventures to share or sell come later.
- The web app is deprecated once the desktop app ships. Only test accounts exist, so no player migration is expected.
- Server and desktop share one TypeScript game-logic library.

## Policy basis

Anthropic's [Claude Code legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) (read 2026-10-01) does not prevent "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription." Conditions that apply to this app:

- Launch the player's own unmodified `claude` binary. Do not use the Agent SDK for subscription play, since the Agent SDK docs require API keys for third-party products.
- Sign-in completes in Anthropic's own flow. The app never reads, copies, stores, or forwards CLI credentials or session tokens.
- The app never pays for, resells, or intermediates the player's usage.
- Running Claude Code in a product requires agreeing to the Commercial Terms. Assume this applies.
- Pro and Max limits assume ordinary, individual usage. One person playing solo fits that.
- Anthropic may enforce without notice. Supporting several CLIs is the hedge, and online play remains a fallback.

Voice provider API keys are the player's own and may be stored locally in the macOS Keychain. This is separate from CLI credentials, which the app never touches.

## Current coupling

| Area | Today | Change needed |
|---|---|---|
| LLM calls | `lib/ai/index.ts` wraps AI SDK `generateObject`, `generateText`, and `streamObject` using `currentModel` from `lib/ai/llm.ts` (`gemini-3.5-flash-lite`). Token charging runs inside the wrapper. | Model behind an `Llm` port. Charging moves to a `Billing` port. |
| GM services | 22 files in `lib/services/`. 15 have no direct Convex, S3, or token imports. Six GM services do: `advance-turn-finalization`, `adventure-turn-reply`, `adventure-roll-result`, `npc-turn`, `ai-pc-turn`, `turn-audio`. | Move the 15 as-is. Put the six behind ports. |
| Turn orchestration | `app/_actions/advance-turn.ts` server action. | Orchestration moves into the core. The server keeps a thin adapter for multiplayer. |
| Character generation | `app/_actions/generate-*-action.ts` server actions for attributes, skills, spells, equipment, backstory, appearance. | Move into the core behind `Llm`. |
| Images | `app/api/ai/generate/image/route.ts`, Replicate `flux-2-klein-4b`. | `Images` port. Local uses an image-capable CLI. |
| Content | `lib/wiki-adventures/local-runtime.ts` compiles source using `node:fs` and S3. | `Content` port. Local play reads bundled, versioned packs. |
| Narration | `lib/ai/tts.ts` calls the Gemini TTS API directly. | `Narration` port. Local uses the player's own voice provider. |
| Stage | `lib/stage/`, plain three.js, client only. | Moves as a package unchanged. |
| Auth | Clerk in Next. | Not needed for local solo. Needed in the desktop app for online play and purchases. |

## Target architecture

pnpm workspace layout:

| Package | Contents | Must not import |
|---|---|---|
| `packages/gm-core` | Turn pipeline, character generation, prompts, zod schemas, rules, port interfaces | Next, Convex, Clerk, AWS, Node built-ins |
| `packages/stage` | Current `lib/stage/` runtime and set/staging specs | Next, Convex, Clerk |
| `apps/desktop` | Tauri shell, Vite, React, stage-first play UI, solo and multiplayer clients | Next |
| `apps/web` | Current Next app. After deprecation: multiplayer GM endpoints, accounts, billing, content distribution, marketing, downloads | |

Ports:

| Port | Server, multiplayer | Desktop solo |
|---|---|---|
| `Llm` | AI SDK with server keys | CLI bridge through Tauri IPC |
| `Images` | Replicate, charged in tokens | Image-capable CLI (Codex, Grok) or premades only |
| `Narration` | Gemini TTS, charged in tokens | Player's own voice provider key, optional |
| `Store` | Convex | SQLite through Rust |
| `Content` | S3 with repo fallback | Bundled pack files |
| `Billing` | Token ledger, funded by subscription | No-op |

Rust stays thin: CLI process management, SQLite saves, pack files, Keychain access for voice keys, updater.

## Local AI harness

Port the design of aifilmcamp's `apps/macos/Packages/FilmBrain`, which already locates and drives Claude, Codex, Gemini, and Grok CLIs in Swift. Its `ImageGeneration/` code renders images through Codex's built-in image tool and Grok's `image_gen` tool under the user's own sign-in.

Long-running text modes, checked against installed CLIs on 2026-10-01:

| CLI | Mode |
|---|---|
| Claude Code | `claude -p --input-format stream-json --output-format stream-json` |
| Codex | `codex app-server`, JSON-RPC over stdio, marked experimental |
| Gemini CLI | `gemini --acp`, Agent Client Protocol |
| Grok | Not checked. FilmBrain notes it emits Claude Code's `stream-json` shape. |

Rules:

- Lock the GM process down: no tools, no user settings, skills, plugins, or MCP servers. For Claude, start from the FilmBrain flags such as `--tools ""`, `--safe-mode`, `--setting-sources ""`, `--strict-mcp-config`, and `--disable-slash-commands`. Image runs allow only the image tool.
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
- Generate one character portrait and one front/back standee through Codex and Grok. Check chroma keying locally.
- Confirm Clerk sign-in and the Convex React client work inside a Tauri webview.
- Go or no-go decision recorded in [the log](../log.md).

### Phase 1, extract gm-core

No behavior change. Run on a worktree.

- Create the pnpm workspace and `packages/gm-core` with the ports.
- Move the 15 uncoupled services and the character generation actions. Put the six coupled services behind `Store` and `Billing`.
- Move charging out of the `lib/ai/index.ts` wrapper.
- Move turn orchestration out of `app/_actions/advance-turn.ts`.
- Validate with build, TypeScript, lint, Playwright, and a full authenticated playthrough.

### Phase 2, desktop shell and stage-first play

- Create `apps/desktop` with Tauri, Vite, and React. Move `lib/stage/` to `packages/stage`.
- Build the [Stageview](stageview.md) phase 4 turn page in the desktop app. Do not build it in the web app.
- Freeze new play features on the web. Its text turn page keeps running until the desktop app ships.

### Phase 3, desktop solo

- Rust CLI manager, SQLite saves, and pack loader.
- Content packs compiled from authored adventures with pre-baked art. Packs are declarative data and never executable code, matching the Stageview set rule.
- AI party members through the existing `ai-pc-turn-service`.
- Premade characters, plus generated characters through the player's CLI.
- Optional narration add-on with the player's own voice provider key.
- Onboarding for CLI detection, sign-in guidance, and provider choice.
- Notarized DMG and the Tauri updater.

### Phase 4, online multiplayer

- Account sign-in in the desktop app.
- Subscription through the existing Stripe setup, granting tokens at roughly current pricing.
- Multiplayer through the server GM, with Convex realtime state.
- Pack downloads. Creator packs and selling come later.

### Phase 5, deprecate web play

- Remove web play routes and UI.
- Keep the server for multiplayer GM, accounts, billing, content distribution, marketing, and downloads.
- Update architecture and testing docs to the desktop client.

## Open decisions

- Narration: several voice providers, or one recommended add-on. Whether free system voices are a fallback.
- Whether local players can spend tokens on narration or art instead of bringing their own keys or CLIs.
- Phones. The [Stageview](stageview.md) decision for landscape phone play assumed the web app. Desktop CLIs cannot run on phones. Options are online-only play through a Tauri mobile build, or no phone play at launch.
- Where admin and adventure authoring tools live after web deprecation. This affects creator packs later.
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
| Clerk or Convex friction inside Tauri | Verify in phase 0 before building online play. |
| No browser entry point after deprecation | Marketing site and direct download carry discovery. |
