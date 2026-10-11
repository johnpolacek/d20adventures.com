# Suggested replies on a hero's turn

[Wiki Home](../index.md) · [Plans](index.md) · [Desktop local play](desktop-local-play.md) · [Gameplay flows](../gameplay-flows.md)

Owner, 2026-10-11, at Lyra's turn in The Shipment: "could we offer suggestions that the player can accept (will fill in the text area)".

## What the player sees

On a hero's turn the GM card shows three short chips above the reply box, such as "Question Thalbern". Clicking one fills the box with the full reply, one or two sentences. The player can edit it, pick another, or ignore them. Nothing is sent until Send. While the suggestions are being written the row shows three blank chips. If they cannot be written the row is not shown.

## How it works

| Piece | Where | Notes |
|---|---|---|
| Prompt and schema | `packages/gm-core/src/services/ai-pc-turn-service.ts` | `buildActionSuggestionsPrompt` and `actionSuggestionsSchema`. Three different approaches, each a label and a reply. Same player-not-GM rules as the AI companion's intent. |
| Runtime command | `apps/desktop/runtime/game.ts`, `main.ts` | `suggest` takes a turn and a hero. It reads the save and writes nothing, so it takes no lock. |
| Native command | `apps/desktop/src-tauri/src/main.rs` | `suggest_command` skips the game lock, so a suggestion in progress never blocks Send. |
| Play view | `apps/desktop/src/stage-play.tsx` | Asks once per hero's turn, as soon as the turn comes up and the game is on screen. Often ready before the narration has been read. |
| Card | `components/stage/prompt-card.tsx` | The chip row. The demo's single Suggest button is unchanged. |

## Decisions

- **Written from what the players have read.** The prompt gets the turn's narrative, the hero's sheet and saved state, and who else is in the scene. It never gets the encounter's GM instructions or another character's saved state, so a suggestion cannot give away a secret.
- **Asked for without a click.** Each hero's turn costs one more request to the player's AI. A turn already takes several.
- **Not saved.** Suggestions live in the play view. Reopening the game asks again.

## Not covered

- Hosted games. Guests have no AI of their own, so suggestions there need a GM job on the host's app and a place on the turn for every client to read them.
- A setting to turn suggestions off.
- The website's text turn page.

## Validation

2026-10-11, local only.

- Runtime test in `apps/desktop/runtime/game.test.ts`: three replies for the hero whose turn it is, nothing written to the save, no GM notes or other characters' state in the prompt, and refusals for another hero, a stale turn, and no save.
- A copy of the owner's Covert Cargo save, through the bundled runtime and the Claude CLI: three replies in about 5 seconds.
- Browser preview of the app on that copy: blank chips while loading, then three chips. A click filled the reply box, focused it, and enabled Send.
- Desktop and GM core type checks, `pnpm test:gm-core`, Biome, and `cargo check` passed. The AI companion's prompt is unchanged byte for byte.
- Not yet seen in the packaged app.
