# Game Master picker shows the model

[Wiki Home](../index.md) · [Plans](index.md) · [Desktop local play](desktop-local-play.md) · [Desktop site style](desktop-site-style.md)

Owner, 2026-10-13, on the desktop app's party setup: "the game master select should be better designed and should show the full model (e.g. Claude Opus 5.5 medium effort)". Then: "make the Cancel button be a ghost button (text only no outline or background)".

## What the player sees

The Game Master control on party setup names the model each installed CLI runs and its effort, as in "Claude Opus 5.5 medium effort". It is the site's dropdown in the dialog's colours, not the system one. With one CLI installed it is a line of text, since there is nothing to choose. For a CLI that will not say, and the first time the app opens, it shows the CLI's name. Cancel is text only.

## How it works

Each CLI is asked what it would run. No prompt is sent, so nothing is used.

| CLI | Model from | Effort from |
|---|---|---|
| Claude | Control request `initialize`: the `default` entry's `resolvedModel`, named by the entry that resolves to the same model. | The app. It passes `--effort`. |
| Codex | `thread/start`, named by `model/list`. | The app. It sends `effort` with each turn. |
| Grok | `session/new`: the current model's `name`. | The CLI: the model's `_meta.reasoningEffort`, when it reports one. |
| Antigravity | `agy models`: the Gemini Flash model the app picks. See [Antigravity](antigravity-cli.md). | The app, by the model it picks. |

| Piece | Where | Notes |
|---|---|---|
| Efforts | `apps/desktop-spike/harness/cli.mjs` | `efforts`, the one place the app's own efforts are set. The sessions and the labels both read it. |
| Asking | `cli.mjs`, `sessions.mjs` | `describe()` on each session, and `describeModel(provider, cwd)` with a 10 second limit. |
| Runtime | `apps/desktop/runtime/main.ts` | Command `model`, for one CLI. Opens no save and takes no lock. |
| Rust | `apps/desktop/src-tauri/src/main.rs` | `model_command`, outside the game lock. |
| Preview | `apps/desktop/vite.config.mjs` | Answers with no model unless `D20_PREVIEW_GM` is set, since it starts the CLI. |
| App | `apps/desktop/src/play.tsx` | Asks each installed CLI once, after the first load. Keeps the answers in `localStorage` under `gm-models`. |
| Picker | `apps/desktop/src/new-game.tsx` | `GameMaster`, on `components/ui/select.tsx`. Its list sits at `z-[110]`, over the app's shell at 100. |

## Decisions

- **Claude runs at medium effort.** Mine, from the owner's example. The Claude CLI does not report the effort it defaults to, so the app could not label it truthfully without setting it. Before this the app passed none. Change it in `efforts`.
- **Codex stays at low**, as set in the spike.
- **A dropdown, not a row of buttons.** The owner called it a select, and four two-line buttons would crowd Play.
- **One request per CLI.** A CLI that hangs then holds up only its own label. Asked together, Gemini's failed sign-in held all four for ten seconds.
- **Asked on every launch, with the last answers shown meanwhile.** The four answers took four to five seconds in the preview. A changed model shows its old name for that long.

## Not covered

- Choosing a model or an effort in the app.
- Hosted games and the play screen do not show the model.
- Gemini's CLI refused sign-in on the owner's machine. [Antigravity](antigravity-cli.md) replaced it the same day.

## Validation

2026-10-13, local.

- The runtime's `model` command on the owner's machine: Claude Opus 5.5 at medium, GPT-6-Astra at low, Grok 4.7 at high, and nothing for Gemini.
- A Claude session with `--effort medium` answered a prompt.
- Browser preview in WebKit with `D20_PREVIEW_GM` set, on The Midnight Summons: the picker shows the model and effort, opens above the footer, takes a choice by mouse and by keyboard, and shows the last answers at once on a second open. Cancel is text only.
- The desktop type check and Biome pass. The 62 desktop runtime tests passed before the change from one request to one per CLI, which they do not cover.
- The Rust command compiled and the development app relaunched on it. Not clicked through in the app itself.
- Not checked: a single installed CLI, the packaged app, and a turn played at the new effort.
- The spike's own tests fail before and after this work, on a missing `pngjs` and in `state-turn.test.mjs`. Not looked into.
