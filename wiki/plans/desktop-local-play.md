# Desktop local play

[Plans](index.md) · [Wiki Home](../index.md) · [Stageview](stageview.md) · [Architecture](../Architecture.md) · [Roadmap](../roadmap.md)

Status: Phase 0 refinement recorded 2026-10-02 in `spike/desktop-local-play`. Strict nested output preserved accepted state in eight native trials. Combining pre-roll decisions reduced seven requests to five for the three working CLIs. Narrative continuity remains open. Character-state application was completed locally on 2026-10-03 in the integration worktree. Gemini compatibility is separate. Phase 1 is extracted. The phase 2 client and initial phase 3 local save/CLI flow are implemented in [Desktop Stageview integration](zzz-completed/feature-desktop-stage-play.md), on an unmerged feature branch. Remaining product phases stay open.

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
| Stage | `packages/stage/`, plain three.js, client only. | Shared by web and desktop. |
| Auth | Clerk in Next. | Not needed for local solo. Needed in the desktop app for online play and purchases. |

## Target architecture

pnpm workspace layout:

| Package | Contents | Must not import |
|---|---|---|
| `packages/gm-core` | Turn pipeline, character generation, prompts, zod schemas, rules, port interfaces | Next, Convex, Clerk, AWS, Node built-ins |
| `packages/stage` | Shared renderer runtime and set/staging specs | Next, Convex, Clerk |
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
| Grok | `grok agent stdio`, Agent Client Protocol. |

Rules:

- Apply restrictions to specific unwanted behavior. Loading user settings or listing tools, skills, plugins, or MCP is not by itself a provider failure. Prefer supported controls that keep the GM focused on the supplied game state. Require a concrete reason for stricter isolation. Keep CLI credentials inside the installed CLI. See the revised basis in phase 0.
- The GM uses different shapes per step. The spike puts each schema in the prompt, validates with the existing zod schema, and retries once on failure. Codex app-server also exposes per-turn `outputSchema`, so a fixed process-level schema is not a universal limitation. Native structured-output modes were not used in this portable comparison.
- One session per scene or encounter. Restart with a summary when the scene changes or context gets large. Keep the static GM prompt first so the prompt cache stays warm.
- Detect installed CLIs and versions. Guide sign-in by telling the player to run the CLI's own login.
- Handle usage-limit errors clearly. Let the player switch CLI and resume from the save.
- Pin tested CLI versions. Output formats can change between releases.

## Phases

### Phase 0, spike

The throwaway app is [apps/desktop-spike](../../apps/desktop-spike/README.md), in the worktree created by `pnpm wt:create spike/desktop-local-play`. Its isolated Convex project is `d20adventures-spike-desktop-local-play`, deployment `gallant-squirrel-646`. No web app, root dependency, shared schema, billing, or production data changes. CLI credentials remained inside the installed CLIs. Long builds and live trials were approved. Nothing was pushed or merged.

**Recommendation: go to phase 1 core extraction.** The spike now demonstrates persistent CLI turns, strict world-state output, retained state, and earlier dice readiness through combined pre-roll decisions. Use Claude for the first interactive demo based on these samples, keeping Codex and Grok selectable. Preserve the separate-call path for comparison. Narrative continuity, applying character patches, broader gameplay, and local saves need implementation and coverage. Gemini remains a separate compatibility item after its provider rejected the tested login. These are feasibility samples, not release readiness or a reliability benchmark.

#### Revised basis for restrictions, 2026-10-01

The owner withdrew blanket configuration isolation as a reason to exclude a provider. The first spike skipped three CLIs because it could not prove that user settings were ignored. That did not establish a gameplay failure. The no-go and Claude-first recommendation were withdrawn. The follow-up keeps the existing CLI homes and sign-in, supplies all fictional context, applies supported controls for unwanted host actions, and measures actual behavior. A restriction needs a specific unwanted effect or documented path to one. Configuration loading alone is not a failure.

Claude retained its tested flags. Codex used a read-only sandbox with shell, file-edit, web, and agent features disabled for the fixture. Gemini received a tool-deny policy. The RPC client advertises no host filesystem or terminal services and declines permission requests. The successful runs emitted zero observable model tool calls and required zero host-operation denials. Codex and Grok did emit MCP startup notifications. This does not prove that user-configured startup processes never run.

#### Persistent GM comparison

The same authored Kordavos fee-payment fixture ran again through the real `buildEncounterProgressionPrompt` and `buildTransitionsText`, validated against `encounterProgressionSchema` in `app/_actions/advance-turn.ts`. A second routine-payment request used the real roll-requirement prompt and schema in the same persistent session. [Fixture and source hashes](../../apps/desktop-spike/results/fixture.json). [Native follow-up measurements](../../apps/desktop-spike/results/gm-followup.json).

| Provider | Model | Progression call | Warm schema-switch call | Result |
|---|---|---|---|---|
| Claude Code 2.1.287 | `claude-opus-5-5` | 3.725 s | 1.390 s | Both valid JSON and zod, no retry |
| Codex 0.156.1, app-server | `gpt-6-astra`, low effort | 11.678 s | 8.834 s | Both valid JSON and zod, no retry |
| Gemini CLI 0.60.0, ACP | No model reached | No inference | No inference | Authentication rejected |
| Grok 1.0.41, ACP | `grok-4.7` | 20.464 s | 8.270 s | Both valid JSON and zod, no retry |
| Google API baseline | `gemini-3.5-flash-lite` | 0.941 s | 0.551 s | Both valid JSON and zod, no retry |

Each successful CLI used one launched client process and one session for two application inference requests. Initialization, included in the first call, took 0.661 s for Claude, 1.296 s for Codex, and 0.622 s for Grok. Grok may use a shared background leader. Provider HTTP call counts are not observable. The API baseline uses independent requests. Both fixtures use identical supplied prompts and schemas, while each CLI retains its own provider instructions and supported configuration.

All four responding models chose `the-harvest-festival` and no roll for routine payment. Claude added the most atmosphere. Codex and Grok were more concise. The baseline was brief and much faster. None forced a new player decision in the progression sample. This single fixture supports a qualitative comparison, not a general model ranking.

Gemini initialized ACP but `authenticate` returned error `-32000`. The message says this client is no longer supported for Gemini Code Assist for individuals and directs migration to Antigravity. It reproduced in diagnostic and native trials. No credentials were inspected, copied, or migrated, and no API key was substituted. This is the observed failure for this installation and login, not a universal claim about every Gemini account. It is unrelated to the withdrawn settings gate. There is no Gemini CLI GM quality or inference latency measurement.

#### Complete gameplay turn

The native `turn` action ran existing repository code unchanged through a trusted-source test loader. Mira falsely claims to be an invited festival performer to avoid the entrance fee. The flow formats her action, submits her reply, determines the deception check and modifier, resolves a fixed player die of 20, processes Garlan's response and its roll requirement, then executes the current wiki advancement path. All successful runs completed both actors and created turn 2 at `the-harvest-festival`.

The storage boundary is in memory. The actual `submitReply` mutation handler runs against it. The wiki commit boundary is simulated with current-turn checks. Clerk supplies a fixture identity, with the real access checks still executed. Content compiles from the authored repository source. Map loading, audio, billing, production storage, and UI dice animation are outside this test. There is one PC and Garlan, with no AI companion or combat coverage. Random game choices use a fixed value. [Full prompts, calls, schema results, source hashes, and turn state](../../apps/desktop-spike/results/complete-turn.json).

| Provider | Service calls | Inference requests | Complete turn time | JSON service requests | Strict world-state patch |
|---|---|---|---|---|---|
| Claude | 7 | 7 | 31.474 s | 5/5 valid first answer | Invalid, existing summary fallback used |
| Codex | 7 | 7 | 59.437 s | 5/5 valid first answer | Invalid, existing summary fallback used |
| Gemini CLI | Authentication failed | 0 | No gameplay measurement | Not measured | Not measured |
| Grok | 7 | 7 | 252.396 s | 5/5 valid first answer | Invalid, existing summary fallback used |
| API baseline | 7 | 10 | 8.291 s | 5/8 valid attempts, all repaired within one retry per call | Accepted with some provided fields discarded |

Per-call wall time in seconds. The first call includes session initialization. Total turn time also includes fixture setup and local processing.

| Call | Claude | Codex | Grok | API baseline |
|---|---|---|---|---|
| Player action formatting | 2.930 | 9.825 | 26.391 | 0.893 |
| Player roll requirement | 4.126 | 8.937 | 37.901 | 0.511 + 0.495 retry |
| Situational modifier | 2.334 | 7.813 | 30.415 | 0.575 + 0.510 retry |
| Dice outcome prose | 4.508 | 13.967 | 55.043 | 0.640 |
| NPC action | 4.471 | 4.892 | 29.919 | 0.811 |
| NPC roll requirement | 1.681 | 3.210 | 30.545 | 0.386 |
| Wiki advancement | 10.890 | 10.450 | 41.874 | 1.434 + 1.752 retry |

This comparison uses text requests with prompt-embedded JSON schemas for all backends. The baseline uses `generateText`, not the web app's provider-enforced `generateObject` path. Its three format retries therefore do not establish a production web regression. Later prompts differ when an earlier model decision or narrative differs. All three CLIs chose Deception DC 14, while the baseline chose DC 12. Claude applied a situational modifier of -1, the others 0.

Narrative review: Codex stayed concise and preserved player agency in the roll outcome. Claude was vivid but longer. Grok's roll prose ambiguously waved the waiting line toward the gates. The baseline used second person in roll/NPC prose despite the requested third person, then produced a longer advancement paragraph. These are sample-specific quality findings.

The full-turn test exposed a separate schema weakness. `wikiEncounterProgressionSchema` declares `adventurePatch` as `z.unknown()`. All three CLIs produced incorrect nested transition fields, so the real `validateAdventurePatch` path replaced their proposed world-state changes with a summary-only patch. The baseline's patch parsed, but fields such as `summary` and `resolvedThreads` were stripped and malformed discoveries were dropped. Valid top-level JSON is not sufficient to preserve structured game state.

An offline replay fed every saved model response through the same services and required exact equality for every generated prompt, including retries. It confirmed the committed patch and recorded rejected/discarded fields in `replayAudit`. No new inference was used for that audit. This makes the world-state limitation reviewable without rerunning models.

#### Strict state and fewer requests, 2026-10-02

Authorized follow-up stayed inside the spike and wiki. Both variants derive a strict model-facing schema from the real `adventurePatchSchema`, with exact nested names, unknown-key rejection, and no field-dropping recovery or string coercion. Invalid output gets one correction request, then the trial fails. Both use the real `commitWikiTurnAdvance` mutation handler against the in-memory database and assert that every accepted field survives validation and commit. This is stronger persistence coverage than the earlier simulated commit, but is still not a live Convex or SQLite save.

The `strict` variant retains the seven-request sequence. The `combined` variant reuses the existing formatting, roll-selection, and situational-modifier instructions in one request. The current services consume those three results, calculate the attribute modifier locally, then submit the fixed die separately. NPC actions and advancement remain subsequent requests. All eight trials used fresh sessions, the same starting state, the same models as the prior run, and no web source changes. [Full results and replay](../../apps/desktop-spike/results/refined-turn.json), [installed versions](../../apps/desktop-spike/results/detect-refined.json).

Times in seconds. Action and dice columns use a native React render proxy, recorded two animation frames after rendering and sampled through 250ms polling. Total is service wall time, including startup and local processing. This is not first-token streaming, physical screen timing, or time spent by a person deciding to roll.

| Provider | Variant | Requests | Action rendered | Dice rendered | Full turn |
|---|---|---|---|---|---|
| Claude | strict | 7 | 3.784 | 8.800 | 23.149 |
| Claude | combined | 5 | 4.297 | 4.297 | 22.528 |
| Codex | strict | 7 | 6.731 | 14.532 | 40.516 |
| Codex | combined | 5 | 6.523 | 6.756 | 26.114 |
| Grok | strict | 7 | 20.552 | 52.735 | 103.632 |
| Grok | combined | 5 | 24.188 | 24.187 | 86.015 |
| API baseline | strict | 12 | 1.295 | 4.329 | 13.390 |
| API baseline | combined | 6 | 1.000 | 1.001 | 6.523 |

The first three CLI decisions became one request, reducing seven requests to five with no retries. Dice readiness improved substantially, while first action text was slightly slower for Claude and Grok because the response contained more work. Full-turn changes were 23.149 to 22.528 s for Claude, 40.516 to 26.114 s for Codex, and 103.632 to 86.015 s for Grok. The API baseline had five bare-JSON correction retries in the strict run and one in the combined run. As before, it uses portable text requests rather than the web app's provider-enforced structured output. All observable tool-event and host-denial counts were zero.

Per-call times, prompts, schemas, raw responses, cached decisions, milestone timings, and saved state are in the evidence. Once the fixed die was submitted, outcome prose was ready in 2.391 / 2.858 s for Claude, 5.371 / 4.323 s for Codex, 9.124 / 14.992 s for Grok, and 1.021 / 0.882 s for the API baseline, strict / combined. The last API completion milestone was not captured by the polling render proxy, but its full service time and completed native result were recorded. Every other milestone has a render receipt.

State and quality findings:

- All eight runs retained every supplied patch field, with no summary fallback or dropped nested data. Claude and Grok supplied discoveries, NPC updates, or open threads. Codex supplied only `summaryDelta` in both runs, so its pass proves retention of that summary, not richer world-state generation.
- Both Codex runs kept the scene at the gate, with the advancement summary omitting the earlier fee waiver and focusing on Garlan's next traveler. Claude and Grok retained the waiver and advanced to the festival. Strict JSON cannot establish narrative completeness.
- The API baseline's strict narration changed the performer claim into a trade-envoy story and invented extra guards. Its combined narration introduced trade delegates and a resolved thread ID absent from the starting state. Shape validation does not enforce lore, referential integrity, or player agency.
- No live run proposed a character update in this social scene. Canned tests prove that character updates survive in `turn.adventurePatch`. They also expose that the current mutation does not apply those updates to live character fields. No inventory/effect application semantics were invented in this spike.
- Offline replay matched every live request and the full saved state, excluding database timestamps, for all eight runs. Canned tests additionally cover malformed fields, exhausted corrections, thread resolution, unchanged prior state, stale/duplicate advances, and the separate dice step.

Ten tests, scoped Biome, root TypeScript, Rust formatting/Clippy, a packaged Tauri build, native execution/render checks, and exact-prompt/state replay passed. Original image and sign-in evidence is unchanged. This is one ordered pair per provider, with model variation and possible provider caching. It does not prove a repeatable speedup or broad gameplay reliability. The paired samples justify carrying strict output and optional pre-roll batching into the next stage, with Claude as the first demo provider. Gemini was not retried or excluded from future support. No push or merge.

#### Images and native webview

The earlier image and webview checks remain valid and were not rerun as model trials. Codex produced a portrait in 44.022 s and a front/back sheet in 48.073 s. Grok took 12.799 s and 13.863 s. Three backgrounds used local chroma key. Codex ignored the standee green-background prompt, so local macOS Vision supplied its mask. Both providers have transparent portraits and split front/back standees. [Image evidence](../../apps/desktop-spike/results/image-run.json), [review sheet](../../apps/desktop-spike/results/images/review-sheet.png), Codex above Grok. Visual limits are hair-edge fringing, portrait-to-standee detail drift, and slightly angled Grok poses.

Clerk previously signed in the configured test account using a 60-second single-use ticket in the packaged `tauri://localhost` webview. The real Convex React WebSocket and adventure query worked against the isolated empty project. [Original sign-in evidence](../../apps/desktop-spike/results/webview-bundled.json). On the follow-up launch, the app was signed out and Convex connected, recorded [separately](../../apps/desktop-spike/results/webview-bundled-followup.json). Session persistence and OAuth/deep-link flows are not established. Neither test proves Clerk JWT authorization in Convex.

#### Validation and next work

Passed: five focused environment, stream, chroma-key, RPC denial, and timeout tests, scoped Biome, root TypeScript, Rust formatting and Clippy, a packaged debug Tauri build, native comparison/full-turn runs, and exact-prompt offline replay. All changes remain in the spike and wiki. The first trial is retained in [gm.json](../../apps/desktop-spike/results/gm.json), with its skips interpreted under the now-withdrawn rule.

Next: extract the shared core with the existing behavior and regression fixtures, then integrate the tested strict contract and optional combined pre-roll request into the desktop adapter. Define and implement character-patch application before claiming durable gameplay state. Add narrative continuity, combat, AI companions, failure/recovery, usage-limit, and production-auth coverage as those paths are built. Keep Gemini unavailable for the tested login until provider compatibility is resolved through its own supported flow. These are scoped follow-ups, not reasons to stop the other adapters.

Protocol basis: installed Codex-generated JSON schemas, [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Gemini ACP](https://geminicli.com/docs/cli/acp-mode/), [Grok ACP](https://docs.x.ai/build/cli/headless-scripting), and [ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup). FilmBrain provenance is in the [spike README](../../apps/desktop-spike/README.md). See the [log](../log.md) and [worktree lifecycle](spike-desktop-local-play.md).

### Phase 1, extract gm-core

Completed locally on 2026-10-02 in `feature/gm-core`. Existing web behavior is preserved. Main integration and deployment are separate. See the [extraction plan](feature-gm-core.md) for evidence and [GM core](../gm-core.md) for contracts.

- Added the pnpm workspace and `@d20/gm-core`, with per-instance model, store, content, identity, and narration interfaces. The model adapter consumes the billing interface.
- Moved 20 gameplay service modules, eight character-generation operations, reply/roll/advance orchestration, shared schemas/types, and pure helpers. Storyview transport and caching stay in the host behind `Narration`.
- Added `lib/gm-server` adapters. Text-model charging moved out of `lib/ai/index.ts`. Existing action and import paths remain compatible.
- Package/browser boundary checks, exact seven-call GM replay, nine character prompt/schema cases, auth/companion/transition/billing checks, root TypeScript/lint, wiki checks, and production build passed.
- All 16 Playwright tests passed. The Midnight Summons completed in seven real turns on isolated Convex, covering rolls, combat, NPC dialogue, damage, transitions, and persisted completion.

The spike's strict patch contract and optional combined pre-roll request remain experimental. The desktop shell now uses these interfaces in the integration worktree. No push or merge was performed.

### Phase 2, desktop shell and stage-first play

Implemented locally for March of Davos in `feature/desktop-stage-play`. The shared renderer is `packages/stage`. The native client uses the real GM core and SQLite saves. Only the gate has a 3D set. See the integration plan for validation and limits.

- `apps/desktop` uses Tauri, Vite, and React. The renderer is shared through `packages/stage`.
- Build the [Stageview](stageview.md) phase 4 turn page in the desktop app. Do not build it in the web app.
- Freeze new play features on the web. Its text turn page keeps running until the desktop app ships.

### Phase 3, desktop solo

Initial CLI generation, SQLite persistence, bundled content, and four premade player-controlled characters are implemented locally. The remaining items below are the wider solo product scope.

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
