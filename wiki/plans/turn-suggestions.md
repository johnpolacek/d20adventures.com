# Suggested replies on a hero's turn

[Wiki Home](../index.md) · [Plans](index.md) · [Desktop local play](desktop-local-play.md) · [Gameplay flows](../gameplay-flows.md)

Owner, 2026-10-11, at Lyra's turn in The Shipment: "could we offer suggestions that the player can accept (will fill in the text area)".

## What the player sees

On a hero's turn the GM card shows three short chips above the reply box, such as "Question Thalbern". Clicking one fills the box with the full reply, one or two sentences. The player can edit it, pick another, or ignore them. Nothing is sent until Send. While the suggestions are being written the row shows three blank chips. If they cannot be written the row is not shown.

## How it works

| Piece | Where | Notes |
|---|---|---|
| Prompt and schema | `packages/gm-core/src/services/ai-pc-turn-service.ts` | `suggestActions`. Three different approaches, each a label and a reply. Same player-not-GM rules as the AI companion's intent. Local play and the host worker share it. |
| Runtime command | `apps/desktop/runtime/game.ts`, `main.ts` | `suggest` takes a turn and a hero. It reads the save and writes nothing, so it takes no lock. |
| Native command | `apps/desktop/src-tauri/src/main.rs` | `suggest_command` skips the game lock, so a suggestion in progress never blocks Send. |
| Play view | `apps/desktop/src/stage-play.tsx` | Asks once per hero's turn, as soon as the turn comes up and the game is on screen. Often ready before the narration has been read. |
| Card | `components/stage/prompt-card.tsx` | The chip row. The demo's single Suggest button is unchanged. |

## Hosted games

Owner chose this next, 2026-10-11. Guests have no AI, so the host's GM writes their suggestions as a job.

| Piece | Where | Notes |
|---|---|---|
| Job | `convex/schema.ts`, `convex/hosting.ts` | `gmJobs` takes kind `suggest` and keeps the finished replies on the job. |
| Asking | `lib/host/server.ts`, `app/_actions/hosted.ts`, the jobs route | A player asks only for a hero they control. The answer is the job's id. |
| Worker | `apps/desktop/runtime/host.ts` | Runs the job through the host's CLI and finishes it with the replies. It changes nothing in the game. |
| Clients | `apps/desktop/src/hosted.ts` | `useHostedSuggest` asks, then reads the replies from a later poll. The app and the website's play page both use it. |

- Asking twice for the same hero and turn answers with the same job, finished or not. A reload costs no second request.
- A suggest job never shows "The GM is writing", and its failure shows no error.
- Players' actions are claimed before suggest jobs. One already running still finishes first, about 5 seconds.
- With the host's app offline the chips stay blank for a minute, then go.
- The saved-state line in the prompt is local only. A hosted turn's characters already carry their state.

## Decisions

- **Written from what the players have read.** The prompt gets the turn's narrative, the hero's sheet and saved state, and who else is in the scene. It never gets the encounter's GM instructions or another character's saved state, so a suggestion cannot give away a secret.
- **Asked for without a click.** Each hero's turn costs one more request to the player's AI. A turn already takes several. Owner kept this, 2026-10-11. In a hosted game the host's AI pays for every player's suggestions.
- **Not saved.** Suggestions live in the play view. Reopening the game asks again.

## Not covered

- A setting to turn suggestions off.
- The website's text turn page.

## Validation

2026-10-11, local only.

- Runtime test in `apps/desktop/runtime/game.test.ts`: three replies for the hero whose turn it is, nothing written to the save, no GM notes or other characters' state in the prompt, and refusals for another hero, a stale turn, and no save.
- A copy of the owner's Covert Cargo save, through the bundled runtime and the Claude CLI: three replies in about 5 seconds.
- Browser preview of the app on that copy: blank chips while loading, then three chips. A click filled the reply box, focused it, and enabled Send.
- Desktop and GM core type checks, `pnpm test:gm-core`, Biome, and `cargo check` passed. The AI companion's prompt is unchanged byte for byte.
- Not yet seen in the packaged app.

2026-10-11, hosted, against the local website and dev Convex.

- A device linked to the test user hosted The Midnight Summons with Thalbern, and started it.
- The website's play page asked on its own. The card showed three blank chips and the reply box, not "The GM is writing".
- The bundled `host.cjs` worker ran the job through Claude. The job finished with three replies and the page showed them: "Freeze and listen", "Stalk the sound", "Nock and challenge".
- A click filled the reply box and enabled Send. After a reload the chips came back from the finished job, with no second job.
- Asking again answered with the same job. Asking for a character that is not the player's, or for a turn that does not exist, was refused.
- Runtime test in `apps/desktop/runtime/host.test.ts`: replies for the guest's own hero, a refusal for another player, a failed model, and no change to the game.
- 49 desktop runtime tests, the desktop, GM core, and website type checks, `pnpm test:gm-core`, and Biome pass.
- Not checked: the app's own play view as host, two accounts, an action queued beside a waiting suggest job, and the host offline.
- The throwaway game, the test device, and the browser were removed afterward.
