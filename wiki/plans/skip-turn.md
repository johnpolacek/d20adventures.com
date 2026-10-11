# Skip a hero's turn

[Wiki Home](../index.md) · [Plans](index.md) · [Desktop local play](desktop-local-play.md) · [Suggested replies](turn-suggestions.md)

Owner, 2026-10-11, at Lyra's turn in The Shipment: "Can we get a small Skip button to the left of Send (text only button)".

## What the player sees

On a hero's turn the GM card has a small text button, Skip, left of Send. One click ends that hero's turn. Nothing is written into the story and the GM is not asked. The next character in initiative order is up. Skip is not offered once a reply is sent and a roll is pending.

## How it works

A skip marks the hero `hasReplied` and `isComplete` on the turn, as the website's older `deferOrSkipTurn` does with `skipEntire`. It uses no AI.

| Piece | Where | Notes |
|---|---|---|
| Card | `components/stage/prompt-card.tsx` | `onSkip`. Without it there is no button, so the demo has none. |
| Play view | `apps/desktop/src/stage-play.tsx` | `onSkip(turnId, characterId)`. A skip clears the draft. |
| Local command | `apps/desktop/runtime/game.ts` | `skip` takes a turn and a hero. Same checks as a reply. |
| Hosted job | `convex/schema.ts`, `convex/hosting.ts` | `gmJobs` takes kind `skip`. |
| Asking | `lib/host/server.ts` | A player skips only a hero they control. |
| Worker | `apps/desktop/runtime/host.ts`, `host-commands.ts` | Runs the job without the CLI. |
| Clients | `apps/desktop/src/play.tsx`, `components/hosted/hosted-play.tsx` | The app, as host or alone, and the website's play page. |

## Decisions

- **No confirmation.** One click skips. Mine, not the owner's. The button is small and apart from Send.
- **Nothing in the story.** The turn's narrative does not say the hero waited. Mine, following the website's older skip.
- **A job in hosted games.** The skip waits its turn behind other actions, so the host's app must be online.

## Not covered

- Deferring to later in the round.
- The website's text turn page, which has its own skip.

## Validation

2026-10-11, local.

- Runtime tests: a skip completes the hero with the story unchanged and survives reopening. Another hero, a stale turn, and a pending roll are refused. A hosted skip job works for the guest's own hero only, with a model that always fails.
- Browser preview of the app on a copy of the owner's Covert Cargo save, at Lyra's turn: Skip sits left of Send. One click moved the game on to "Continue NPC turn", and the save showed Lyra complete.
- 51 desktop runtime tests, the desktop and website type checks, and Biome pass.
- Not checked: a hosted game end to end, the website's play page, and the packaged app. Production Convex does not have the `skip` job kind until it is deployed.
