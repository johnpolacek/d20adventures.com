# Storyview

[Home](index.md) · [Plans](plans/index.md) · [Testing](plans/testing-runbook.md) · [Stageview](plans/stageview.md)

Status: Implemented. Reviewed against local main on 2026-10-01.

Storyview presents turn narrative as a fullscreen, paragraph-by-paragraph audio experience. Desktop has a right-rail entry, with a separate entry on smaller screens. Narration can be requested on demand or enabled automatically by the adventure owner.

## Current behavior

| Area | Contract |
|---|---|
| Access | `/api/adventure/turn-audio/{turnId}` requires a signed-in adventure owner or member. GET reads the manifest. POST requests narration. |
| On-demand cost | The requesting player pays for newly generated content. Cached playback is shared. |
| Automatic cost | `setStoryviewAutoEnabled` is owner-only. Automatic generation splits cost across unique owner/player IDs and pauses when a member cannot cover the estimate. |
| Incremental generation | Reuse prior audio when both the narrative part index and paragraph hash match. Only changed/new paragraphs need attribution and synthesis. |
| Concurrency | `convex/turnAudio.ts` claims a turn/narrative hash before generation and records ready/error state. |
| Voice identity | Assignments persist on the adventure. Narrator and character voices are stable across turns. |
| Audio storage | `adventures/{adventureId}/turns/{turnId}/audio/segments/{contentHash}.wav`, where the hash includes voice, style instruction, and segment text. |
| Manifest | Convex `turnAudio` stores the narrative hash and segments. GET flags stale audio when current narrative differs. |
| Billing | Attribution and TTS usage are combined into `usage_tts_audio`. The old separate attribution-charge description is obsolete. |

The upfront balance estimate can return HTTP 402. After successful synthesis, the current service still publishes audio if the final debit fails or is clamped. Do not describe this as a reservation or a fully atomic generation-and-payment transaction.

## Implementation

- `components/adventure/storyview/`: overlay, playback, rail card, and pause notices.
- `app/_actions/storyview.ts`: owner auto-narration setting and current-turn warm-up.
- `lib/services/turn-audio-service.ts`: incremental cache, attribution, synthesis, shared cost, and pause handling.
- `lib/ai/narration-attribution.ts`: speaker segmentation with narrative reconstruction checks.
- `lib/ai/tts.ts` and `tts-voices.ts`: Gemini REST synthesis and voice configuration.
- `lib/audio/wav.ts`: PCM-to-WAV wrapping.
- `convex/turnAudio.ts`, `types/turn-audio.ts`: claims, manifests, and response types.

The configured default model is in `lib/ai/tts.ts`, with a `GEMINI_TTS_MODEL` override. `USE_PLACEHOLDER_TTS=true` substitutes short silent audio for local testing.

## Validation and future integration

The original July 2026 record covers generation, playback, auto-advance, cached replay, and concurrent requests. It does not prove every later automatic/incremental path.

Outstanding checks include multi-character dialogue, insufficient funds, mobile layout, incremental reuse, automatic split billing, and pause/resume. See [maintenance](plans/maintenance.md) and [testing](plans/testing-runbook.md).

Stageview will use narration to drive shots and beats. That synchronization is not implemented.
