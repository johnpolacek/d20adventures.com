# feature/storyview

[Plans](index.md) · [Wiki Home](../index.md) · [Roadmap](../roadmap.md)

Status: Active (2026-07-05)

## Goal

Storyview: an optional, token-funded audio narration mode for adventure turns. A TTS narrator voice reads the prose and each character's quoted dialogue is spoken in a distinct, stable per-character voice, presented in a full-screen cinematic mode that shows one paragraph at a time synced to playback.

## Decisions (2026-07-05)

- **Provider: Gemini TTS** (`gemini-2.5-flash-preview-tts`, override via `GEMINI_TTS_MODEL`). `@ai-sdk/google` has no speech support, so `lib/ai/tts.ts` calls the Gemini REST API directly with the existing `GOOGLE_GENERATIVE_AI_API_KEY`. ~$0.02–0.04 per minute of audio.
- **Per-segment single-voice synthesis.** Gemini multi-speaker caps at 2 voices; synthesizing each segment separately is unconstrained, parallelizable (concurrency 4), and maps 1:1 to the cinematic UI.
- **Speaker attribution is an LLM pass** (`lib/ai/narration-attribution.ts` via the existing `generateObject`, which charges `usage_generate_object`). Narrative has no structured dialogue attribution. Validation requires each paragraph's segments to reconstruct it exactly (alphanumeric-normalized); any mangled paragraph falls back to a single narrator segment.
- **On-demand + cached.** First player to open Storyview pays; audio is stored in the shared S3 bucket under `adventures/{adventureId}/turns/{turnId}/audio/{narrativeHash8}/{i}.wav` and the manifest in the new `turnAudio` Convex table. Replays and other players are free. Cache is keyed by a sha1 of the narrative because turns get patched mid-turn; the GET reports `stale` when the narrative moved on.
- **Metered pricing.** New `usage_tts_audio` transaction type; actual TTS provider tokens × the existing 0.01 multiplier (`computeChargedTokens` metered branch). Upfront estimate (~2 provider tokens/char) is checked against the balance before any work → 402. Measured on a 986-char turn: 8.68 D20 tokens attribution + 22.6 D20 tokens TTS (~80s audio).
- **Concurrency by atomic claim.** `turnAudio.claimTurnAudioGeneration` is a single Convex mutation; the losing concurrent request polls GET. A `generating` row older than 5 min is reclaimable (crash recovery). Verified live (React StrictMode double-fires the POST; one generation, one charge).
- **Voices persist per adventure** (`adventures.voiceAssignments`), assigned lazily on first narration: narrator is always Charon; characters get a gender-leaning pool pick by hash of characterId, skipping taken voices. Style hints from the attribution LLM become prompt prefixes ("Say in a gruff, weary voice: …").
- **Audio format: WAV** (PCM 24kHz mono 16-bit + 44-byte RIFF header, `lib/audio/wav.ts`). No native transcode deps on Vercel; ~48KB/s behind CloudFront immutable cache is acceptable for v1. Revisit Opus/MP3 if bandwidth matters.
- **Dice-roll parts** render as silent 4s visual slides (reuses `CharacterDiceRollResultDisplay`); `original-reply` parts are skipped.
- **Schema also admits `usage_encounter_asset`** so Convex snapshots seeded from main (which has in-flight encounterview work writing that type) import cleanly.
- **`USE_PLACEHOLDER_TTS=true`** (server env) short-circuits synthesis to 1.5s silence for cheap dev runs.

## Progress

- [x] Token + schema plumbing: `turnAudio` table, `usage_tts_audio` type, `voiceAssignments` on adventures, `convex/turnAudio.ts` claim/finalize/fail
- [x] TTS core: `lib/audio/wav.ts`, `lib/ai/tts.ts`, `lib/ai/tts-voices.ts` (smoke-tested: valid WAV, sane usageMetadata)
- [x] Attribution: `lib/ai/narration-attribution.ts` with reconstruct-validation + narrator fallback
- [x] Pipeline: `app/api/adventure/turn-audio/[turnId]/route.ts` (GET manifest / POST generate)
- [x] Cinematic UI: `components/adventure/storyview/*` + button in `turn-narrative.tsx`
- [x] E2E verified in-browser (Midnight Summons turn 1): generation, playback with narrator + character voice, auto-advance, replay free, exactly one `usage_generate_object` + one `usage_tts_audio` ledger entry, concurrent POSTs → single generation
- [x] `tsc --noEmit`, `biome lint`, `pnpm build` clean
- [ ] Multi-character dialogue turn verified (needs a turn with roster-character dialogue; first test turn only had a written note, which prompted a rule that written text stays with the narrator/author)
- [ ] Insufficient-tokens (402) path exercised in-browser
- [ ] Mobile layout pass on the overlay

## Test data note

E2E testing wrote 5 WAV files to the **shared** S3 bucket under `adventures/jh7bftjhdjgrjwqakfc4ccdb6x89tzxa/turns/jn77se1k9cx3pfbwe03gtsxjfn89vjj6/audio/` (~4MB, hash-keyed, harmless; same-id regeneration on main would reuse identical keys). Delete that prefix at `wt:finish` if tidiness matters. The `turnAudio` row lives only in the worktree's Convex project.

Finished: 2026-07-05 (merged to main, policy: merge)
