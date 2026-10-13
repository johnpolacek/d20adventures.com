# Antigravity replaces the Gemini CLI

[Wiki Home](../index.md) · [Plans](index.md) · [Desktop local play](desktop-local-play.md) · [Game Master picker](gm-model-picker.md)

Owner, 2026-10-13: "Google replaced Gemini CLI with the Antigravity CLI". The Gemini CLI has refused personal sign-in since the spike, with a message that points to Antigravity.

## What the player sees

The fourth Game Master is Google's Antigravity CLI, `agy`, in place of the Gemini CLI. The picker shows it as the Gemini model it runs, as in "Gemini 3.8 Flash medium effort". The Gemini CLI is no longer listed, installed or not.

## How it works

Antigravity has no ACP mode. It is driven in print mode over streamed JSON, one process per session, like Claude.

| Piece | Detail |
|---|---|
| Launch | `agy --agent d20-gm --model <slug> --input-format stream-json --output-format stream-json --disable-slash-commands --print=` |
| Prompt in | `{"event":"user","message":{"content":"..."}}`, one line per turn. |
| Events out | `init`, then `step_update`s, then `result` with `status` and `response`. |
| System prompt | The body of a custom agent, `.agents/agents/d20-gm.md`, written into the session's scratch folder. |
| No tools | The agent declares `tools: []`. Any `step_update` of type `tool` fails the session, and so does an `init` that names another agent. |
| Model | Read from `agy models` at each session start, so no version is written in the code: the Gemini Flash model at the app's effort, else the first Gemini, else the CLI's default. |

| Where | Change |
|---|---|
| `apps/desktop-spike/harness/cli.mjs` | Provider `antigravity`, found as the binary `agy`. `efforts.antigravity`. |
| `apps/desktop-spike/harness/sessions.mjs` | `AntigravitySession`. The Gemini branch of `AcpSession` is removed. |
| `apps/desktop/runtime/game.ts`, `heroes.ts`, `main.ts` | `antigravity` in place of `gemini`. |
| `apps/desktop/src/new-game.tsx`, `play.tsx` | The name, and the install hint. |

## Decisions

- **The app picks the model.** Mine. Antigravity also offers Claude and GPT models, and its default took 44 seconds on a one-word reply. Gemini Flash at medium took 5.
- **Medium effort**, as for Claude. Mine. Change it in `efforts`.
- **A save started on Gemini goes on with Antigravity.** Mine. The Gemini CLI cannot sign in, so such a save could not go on otherwise.

## Known limits

- `tools: []` leaves the agent one tool, `manage_task`, which lists and stops background tasks. A GM session has none, and a call to it fails the session.
- Antigravity's `init` lists all sixty of the CLI's tools whatever the agent may use, so the lockdown cannot be read from it as Claude's can.
- Each GM action is a new Antigravity conversation, kept in the player's Antigravity history. Its docs name no way to turn that off.
- Asking for the model list adds about 1.7 seconds to each GM action on Antigravity.

## Validation

2026-10-13, local, `agy` 1.2.16 on the owner's machine and sign-in.

- The session through the harness: three prompts in one process on `gemini-3.8-flash-medium`, the second using the first's answer. Asked to run a shell command, it declined and no tool step appeared.
- An agent with `tools: []` and a prompt that tells it to use any tool it has could not read a file in its own folder or run a command. It named `manage_task` as its only tool.
- The built runtime, on a scratch save of The Midnight Summons with Antigravity as the GM: a reply rewritten into the story with a Perception check asked for in 38 seconds, the roll resolved in 12, and the round ended into a second turn in 32, each without an error. Whether a response needed its one silent retry was not looked at.
- The runtime lists `antigravity` and not `gemini`, and names its model "Gemini 3.8 Flash" at medium for both.
- The 62 desktop runtime tests, the desktop type check, and Biome pass.
- Not checked: the app itself and its picker with this change, a hero draft, suggested replies, a hosted game, a fight, a save started on Gemini, and a machine without Antigravity.
- The probes left about fifteen conversations in the owner's Antigravity history.
