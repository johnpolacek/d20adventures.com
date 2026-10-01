# Desktop local play

[Plans](index.md) · [Wiki Home](../index.md) · [Stageview](stageview.md) · [Architecture](../Architecture.md) · [Roadmap](../roadmap.md)

Status: Phase 0 partially measured in `spike/desktop-local-play`. The blanket isolation requirement and resulting no-go recommendation were withdrawn on 2026-10-01. Codex, Gemini CLI, and Grok GM support remains untested. Product phases remain proposed.

A Tauri desktop app becomes the only game client. Solo play is free. The AI Game Master runs through an AI CLI the player already has installed and signed in to with their own subscription. Online multiplayer keeps the GM on the server and is paid by a subscription that grants tokens. The web app's play experience is deprecated once the desktop app ships. Stageview is rebuilding the turn page now, so the stage-first turn page should be built for the desktop app instead of the web app.

## Owner decisions

Recorded 2026-10-01:

- Desktop app built with Tauri. Mac first, then other platforms. The game UI stays in TypeScript inside the webview, with a thin Rust layer.
- Ship as a notarized direct download. No Mac App Store, because its sandbox blocks running the player's installed CLIs.
- Solo play runs the GM locally through the player's CLI and is free. AI-controlled party members can fill the party.
- Supported CLIs include Claude Code, Codex, Gemini CLI, and Grok. The owner accepts the terms risk for Codex, Gemini, and Grok.
- Multiplayer runs the GM on the server. A subscription grants tokens, roughly matching current token pricing.
- Narration is optional and player-supplied through common voice-generation providers. The provider choice is TBD.
- Players can generate their own characters or use premades.
- Local players supply their own art and narration through their CLIs or API keys. Tokens are not used in local play.
- Adventure authoring moves into the desktop app. Admin stays on the web.
- Phones are TBD. Focus on desktop.
- Target players who are both AI-savvy and tabletop fans. Requiring an installed, signed-in CLI is acceptable.
- Local play uses authored adventures with pre-baked art. Player-made adventures to share or sell come later.
- The web app is deprecated once the desktop app ships. Only test accounts exist, so no player migration is expected.
- Server and desktop share one TypeScript game-logic library.
- Later on 2026-10-01, the owner challenged the blanket ban on user settings, tools, and MCP as a prerequisite for CLI support. Restrictions need a concrete basis. Configuration loading alone does not disqualify a provider. The credential-handling rule remains in force.

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
| `apps/web` | Current Next app. After deprecation: multiplayer GM endpoints, accounts, billing, content distribution, admin, marketing, downloads | |

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
| Grok | `grok agent stdio`, Agent Client Protocol. Detected, GM inference not yet tested. |

Rules:

- Apply restrictions to specific unwanted behavior. Loading user settings or listing tools, skills, plugins, or MCP is not by itself a provider failure. Prefer supported controls that keep the GM focused on the supplied game state. Require a concrete reason for stricter isolation. Keep CLI credentials inside the installed CLI. See the revised basis in phase 0.
- One process cannot switch `--json-schema`, and the GM uses a different shape per step. Put the schema in the prompt, validate with the existing zod schemas in `gm-core`, and retry once with the validation error.
- One session per scene or encounter. Restart with a summary when the scene changes or context gets large. Keep the static GM prompt first so the prompt cache stays warm.
- Detect installed CLIs and versions. Guide sign-in by telling the player to run the CLI's own login.
- Handle usage-limit errors clearly. Let the player switch CLI and resume from the save.
- Pin tested CLI versions. Output formats can change between releases.

## Phases

### Phase 0, spike

Findings recorded 2026-10-01. No web app, root dependency, shared schema, production data, or billing changes. The throwaway app is [apps/desktop-spike](../../apps/desktop-spike/README.md), built in `spike/desktop-local-play` with `pnpm wt:create`. Its isolated Convex project is `d20adventures-spike-desktop-local-play`, deployment `gallant-squirrel-646`. Nothing was seeded. Setup, long builds, and live model trials were approved. Nothing was pushed.

**Revised recommendation: continue phase 0 with all four providers in scope. The earlier no-go and Claude-first recommendation are withdrawn.** Claude inference, native CLI image generation, local background removal, Clerk ticket sign-in, and Convex React connectivity worked. Codex, Gemini CLI, and Grok GM inference was skipped under an overbroad trial rule. These providers are untested, not demonstrated unsuitable. The original four-provider execution requirement remains incomplete.

#### Revised basis for restrictions, 2026-10-01

The owner challenged the original blanket requirement after reviewing the results. The spike established that the tested persistent modes lacked a verified ignore-settings path. It did not establish that user configuration would break gameplay, cause unwanted actions, or make those providers unsuitable. An inability to prove that no configuration was loaded was incorrectly promoted into a product blocker.

| Concern | Basis and next check |
|---|---|
| User preferences and instructions | They may influence output. Measure schema validity, game consistency, and latency with the actual GM fixture. Configuration loading alone is not a failure. |
| Tools, skills, plugins, and MCP | An inventory entry does not establish an unwanted action. Inspect the relevant execution and approval controls. Restrict a capability when it has a specific unwanted effect or a documented path to one, such as changing unrelated files or sending unrelated local data. Use the narrowest effective restriction. |
| Hooks and startup behavior | These can be separate from model tool calls. Establish the actual behavior and supported controls when relevant. Do not infer unsafe execution merely from the absence of an ignore-settings flag. |
| CLI credentials | The desktop app still must not read, copy, store, or relocate them. Continue using each installed CLI's own sign-in. |

A concrete, documented unwanted action can justify a restriction before an incident occurs. A missing blanket off switch does not supply that basis. The goal is a working, predictable GM with appropriate control over its actions, not a proof that every user preference was absent.

The existing spike harness still implements the original trial gate and only has a Claude persistent adapter. Its saved `blocked` results are historical skips under that rule. New adapters and live measurements are still needed. This correction changes the plan and interpretation, not the recorded measurements or runtime permissions. No new model trials were run for this correction.

#### GM measurement

The fixture uses the actual `buildEncounterProgressionPrompt` and `buildTransitionsText` from `lib/services/advance-turn-prompt-service.ts`, authored Kordavos gate content, and Mira's completed three-mark fee payment. It validates against the exact `encounterProgressionSchema` declaration in `app/_actions/advance-turn.ts`. A second request uses the real roll-requirement service prompt and schema to test a schema change within the same process. Full prompts and source hashes are in [fixture.json](../../apps/desktop-spike/results/fixture.json). This is one legacy encounter-progression step followed by a separate warm schema probe. It does not measure the full reply, dice, NPC, AI-party, or current wiki-runtime pipeline.

| Provider and tested version | Persistent GM outcome | Requests for progression | Progression wall time | Warm roll-schema wall time | Bare JSON and existing zod schemas |
|---|---|---|---|---|---|
| Claude Code 2.1.287, reported model `claude-opus-5-5` | Passed, one process for both requests | 1, no retry | 4.180 s | 1.451 s, 1 request | Both valid on first answer |
| Codex 0.156.1, app-server | Not tested, skipped under former rule | 0 | Not measured | Not measured | Not measured |
| Gemini CLI 0.60.0, ACP | Not tested, skipped under former rule | 0 | Not measured | Not measured | Not measured |
| Grok 1.0.41, ACP | Not tested, skipped under former rule | 0 | Not measured | Not measured | Not measured |
| Google API baseline, `gemini-3.5-flash-lite` | Independent API requests | 1, no retry | 2.283 s | 0.615 s, 1 request | Both valid on first answer |

Claude initialization took 0.781 s, included in its first call. Its startup event reported empty tools, skills, plugins, and MCP server arrays. Both requests reported one provider turn. Application inference requests and provider-reported turns are observable. Provider HTTP request counts are not. The CLI API duration field is cumulative session time, so per-call comparisons use measured wall time. The API baseline receives the same system prompt, fixture, and JSON schema, but no previous-request context. Evidence: [gm.json](../../apps/desktop-spike/results/gm.json) and [detect.json](../../apps/desktop-spike/results/detect.json).

Qualitative review of this one sample:

| Criterion | Claude | Gemini API baseline |
|---|---|---|
| Correct transition | `the-harvest-festival` | Same |
| Player agency | No forced player decision or speech | Same |
| Immediate consequence | Garlan accepts the fee and opens passage | Same |
| Authored facts | Preserves Garlan, the fee, and festival. Adds festival atmosphere. | Preserves the core facts, but invents a stamped entry pass. |
| Requested prose | Two short paragraphs, vivid scene detail | Two short paragraphs, brief and direct |
| Routine payment roll | `none`, difficulty 0 | Same |

Claude was more vivid and slightly better grounded in this sample. The baseline was faster. This is subjective feasibility evidence, not a model ranking or a reliability benchmark. No quality conclusion is available for the three untested CLIs.

#### Findings under the original isolation rule

The following findings explain the original skips. They do not establish a current product blocker. The spike ports FilmBrain's known-path locator, minimal process environment, bounded execution, invocation flags, and image collection. FilmBrain's existing text adapters are one-shot. Persistent protocol support required a separate check. The harness never reads, copies, or stores CLI credentials. The installed binaries handle their own sign-in. A fresh prompt-only working directory and a small environment allowlist exclude the parent agent's API keys and configuration variables.

- Claude safe mode alone still reported three built-in plugins. The first attempt was rejected. Explicit `enabledPlugins` false overrides, alongside empty setting sources, tools, and strict MCP configuration, produced empty capability arrays. Missing or nonempty capability evidence and tool-use events fail closed.
- Codex `exec` supports `--ignore-user-config` and `--ignore-rules`. The installed `app-server` does not expose them and rejects `--ignore-user-config`. Ordinary configuration overrides do not establish that user settings, hooks, or MCP were never loaded. See [app-server documentation](https://learn.chatgpt.com/docs/app-server).
- Gemini's installed settings loader loads user settings. `GEMINI_CLI_HOME` relocates both settings and OAuth storage. No supported mode was found that preserves sign-in while ignoring user settings. Its help parser exits successfully with an unknown option when `--help` is also present, which is not evidence of option support. See [configuration](https://geminicli.com/docs/reference/configuration/) and [ACP](https://geminicli.com/docs/cli/acp-mode/).
- Grok exposes ACP through `agent stdio`, but rejects the ignore-config option. `GROK_HOME` covers configuration and authentication together. See [headless scripting](https://docs.x.ai/build/cli/headless-scripting) and [settings](https://docs.x.ai/build/settings/reference).

Version/help probes and argument-parser probes are detection only, not long-running GM trials. [isolation-probes.json](../../apps/desktop-spike/results/isolation-probes.json) records their scope. Three providers therefore have no inference, latency, schema, or quality result. Do not work around this by copying authentication into a clean CLI home.

The GUI PATH also contained terminal-injected wrappers. The locator now prefers known installed binaries. Final measurements use those direct paths. Earlier wrapper measurements are excluded from the canonical results.

#### Images and local removal

The native app launched separate Codex `exec` and Grok image jobs. These permit image generation only and are not GM sessions. Each requested one portrait or one paired front/back sheet. Codex used its default image-capable model, which was not reported in the saved result. Grok requested `grok-4.7`. Each process completed once without a retry. The native originals were then reprocessed locally without new model calls.

| Provider | Artifact | Provider process time | Local background removal | Removal time | Fully transparent pixels |
|---|---|---|---|---|---|
| Codex 0.156.1 | Portrait, 1254 × 1254 | 44.022 s | Green key and despill | 0.211 s | 51.5% |
| Codex 0.156.1 | Front/back sheet, 1536 × 1024 | 48.073 s | macOS Vision | 1.946 s | 69.5% |
| Grok 1.0.41 | Portrait, 1024 × 1024 | 12.799 s | Green key and despill | 0.129 s | 66.0% |
| Grok 1.0.41 | Front/back sheet, 1280 × 720 | 13.863 s | Green key and despill | 0.102 s | 73.6% |

The Codex standee ignored the green-background prompt. Chroma key removed zero pixels, so the spike now detects that failure and falls back to [Apple Vision foreground masking](https://developer.apple.com/documentation/vision/vninstancemaskobservation). Both figures survived local segmentation. The fallback requires macOS 14 or newer and a Swift toolchain in this spike. It is not a Windows or Linux solution.

Visual review found usable silhouettes and readable front/back views. There is some green fringing around hair. Portrait and standee details drift because they were separate text-only requests. Grok's poses are slightly angled. Art matching, print alignment, and production quality are not proven. [Review sheet](../../apps/desktop-spike/results/images/review-sheet.png), Codex above Grok, portraits left and sheets right. [Image evidence and hashes](../../apps/desktop-spike/results/image-run.json) link the originals, transparent PNGs, and split front/back files.

#### Native webview

The debug `.app` ran at `tauri://localhost`. Clerk React loaded and signed in the existing configured development test account through a 60-second single-use ticket and the real `useSignIn` hook. A debug-only native helper used the project's existing Clerk test configuration. It created no user or password. Ticket values passed only through memory. Evidence contains no tokens, cookies, passwords, or user IDs.

The Convex React client connected by WebSocket and resolved `adventure:getAllAdventures` with zero adventures from the isolated empty project. [Bundled webview evidence](../../apps/desktop-spike/results/webview-bundled.json) records signed-in and connected booleans. [Development-origin evidence](../../apps/desktop-spike/results/webview-dev.json) records Clerk loading and Convex connectivity, with sign-in still false at that earlier stage.

This proves ticket sign-in and client connectivity in a native webview. Interactive OAuth, external-browser redirects, deep links, release signing, and production Clerk domains remain untested. The existing app has plain `ConvexProvider` and no Clerk JWT backend configuration. This check does not prove authenticated Convex authorization. The spike is tied to its build checkout and installed Node runtime, not a distributable desktop product.

#### Validation and next work

Passed: three focused environment, stream-lockdown, and chroma-key tests, scoped Biome checks, root TypeScript checking, Vite production build, Rust formatting and Clippy with warnings denied, debug Tauri app build, native UI trials, and local foreground segmentation. The source and dependencies are confined to `apps/desktop-spike/`. Root app source and dependencies are unchanged.

Continue the missing Codex, Gemini, and Grok persistent adapters and run the same GM fixture. Record configuration influences and the controls used. Any proposed restriction or provider exclusion must identify a specific failure or documented unwanted capability, its effect on local play, and why a narrower control is insufficient. Do not reject a provider solely because it loads user configuration.

Then measure complete turn orchestration across combat, dice, NPC and AI-party fixtures, exercise restart/cancellation and usage limits, and test production authentication flows. Four-provider support remains unproven until those providers run. The measured results do not justify deprecating web play yet.

See [decision log](../log.md) and [worktree lifecycle](spike-desktop-local-play.md). The original measurements remain intact. The owner has not narrowed the intended provider set.

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
- Move adventure authoring from the web admin editor into the desktop app.

### Phase 5, deprecate web play

- Remove web play routes and UI.
- Keep the server for multiplayer GM, accounts, billing, content distribution, admin, marketing, and downloads.
- Update architecture and testing docs to the desktop client.

## Open decisions

- Voice provider: several providers, or one recommended add-on. Whether free system voices are a fallback.
- Phones, deferred. The [Stageview](stageview.md) landscape phone decision assumed the web app, and desktop CLIs cannot run on phones.
- Distribution channel beyond direct download, such as Steam. Steam constraints read 2026-10-01: in-game purchases in a Steam build must go through the Steam Wallet microtransaction API, which supports recurring billing. Live-generated AI content needs a store-page disclosure and a description of guardrails. Steam Workshop could host player-made adventures.
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
