import { createHash } from "node:crypto"
import { auth } from "@clerk/nextjs/server"
import { type NextRequest, NextResponse } from "next/server"
import { decrementUserTokensAction } from "@/app/_actions/tokens"
import { fetchUserTokenBalance } from "@/app/_actions/user-token-actions"
import { attributeNarrative, type AttributedSegment } from "@/lib/ai/narration-attribution"
import { synthesizeSegment } from "@/lib/ai/tts"
import { assignVoices, voiceForSpeaker, type VoiceAssignment } from "@/lib/ai/tts-voices"
import { pcmDurationSec, pcmToWav } from "@/lib/audio/wav"
import { getAssetUrl, isAwsConfigured } from "@/lib/aws"
import { api, convex } from "@/lib/convex/server"
import { uploadFileToS3 } from "@/lib/s3-utils"
import { parseNarrative } from "@/lib/utils/parse-narrative"
import type { Id } from "@/convex/_generated/dataModel"
import type { TurnAudioManifestResponse, TurnAudioSegment } from "@/types/turn-audio"

export const maxDuration = 300

// Upfront balance check before doing any work. Provider tokens ≈ input text
// tokens (~chars/4) + audio output tokens (~25/sec at ~15 chars/sec ≈ 1.67/char),
// so ~2 provider tokens per narrative character, charged at the 0.01 multiplier.
const ESTIMATED_PROVIDER_TOKENS_PER_CHAR = 2
const TOKEN_MULTIPLIER = 0.01
const SYNTHESIS_CONCURRENCY = 4

const NARRATOR_STYLE = "Narrate in a measured, immersive storyteller voice:"

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex")
}

async function loadTurnForUser(turnId: string) {
  const { userId } = await auth()
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const turn = await convex.query(api.adventure.getTurnById, { turnId: turnId as Id<"turns"> })
  if (!turn) {
    return { error: NextResponse.json({ error: "Turn not found" }, { status: 404 }) }
  }

  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId })
  if (!adventure) {
    return { error: NextResponse.json({ error: "Adventure not found" }, { status: 404 }) }
  }

  const isMember = adventure.ownerId === userId || adventure.playerIds.includes(userId)
  if (!isMember) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { userId, turn, adventure }
}

function toManifestResponse(row: { status: "generating" | "ready" | "error"; narrativeHash: string; segments?: TurnAudioSegment[]; error?: string } | null, currentNarrativeHash: string): TurnAudioManifestResponse {
  if (!row) return { status: "none" }
  return {
    status: row.status,
    segments: row.segments?.map((segment) => ({ ...segment, audioUrl: getAssetUrl(segment.audioKey) ?? "" })),
    stale: row.narrativeHash !== currentNarrativeHash,
    error: row.error,
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params
  const loaded = await loadTurnForUser(turnId)
  if ("error" in loaded) return loaded.error

  const row = await convex.query(api.turnAudio.getTurnAudio, { turnId: loaded.turn._id })
  return NextResponse.json(toManifestResponse(row, sha1(loaded.turn.narrative)))
}

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function isInsufficientTokensError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "INSUFFICIENT_TOKENS"
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params
  const loaded = await loadTurnForUser(turnId)
  if ("error" in loaded) return loaded.error
  const { userId, turn, adventure } = loaded

  if (!isAwsConfigured()) {
    return NextResponse.json({ error: "Audio storage is not configured" }, { status: 503 })
  }

  const narrativeHash = sha1(turn.narrative)

  // Upfront balance check so we never do expensive work the user can't pay for.
  const estimatedCharge = Math.ceil(turn.narrative.length * ESTIMATED_PROVIDER_TOKENS_PER_CHAR * TOKEN_MULTIPLIER)
  const balance = await fetchUserTokenBalance()
  if (balance.error) {
    return NextResponse.json({ error: "Unable to verify token balance" }, { status: 500 })
  }
  if ((balance.tokensRemaining ?? 0) < estimatedCharge) {
    return NextResponse.json({ error: `Insufficient tokens for narration. About ${estimatedCharge} tokens required.` }, { status: 402 })
  }

  const claim = await convex.mutation(api.turnAudio.claimTurnAudioGeneration, {
    turnId: turn._id,
    adventureId: turn.adventureId,
    narrativeHash,
    requestedBy: userId,
  })
  if (!claim.claimed) {
    // Another request generated (or is generating) this narration; client polls GET.
    const row = await convex.query(api.turnAudio.getTurnAudio, { turnId: turn._id })
    return NextResponse.json(toManifestResponse(row, narrativeHash))
  }

  try {
    const parts = parseNarrative(turn.narrative)
    const roster = turn.characters.map((c: { id: string; name: string; gender?: string; personality?: string }) => ({
      id: c.id,
      name: c.name,
      gender: c.gender,
      personality: c.personality,
    }))

    // Attribution charges its own LLM usage via the generateObject path.
    const segments = await attributeNarrative(parts, roster)
    if (segments.length === 0) {
      throw new Error("Narrative contains no narratable paragraphs")
    }

    // Assign stable per-adventure voices to any speakers that don't have one yet.
    const existingAssignments: VoiceAssignment[] = adventure.voiceAssignments ?? []
    const speakerIds = [...new Set(segments.map((s) => s.speaker).filter((s) => s !== "narrator"))]
    const speakingCharacters = speakerIds.map((id) => {
      const character = roster.find((c: { id: string }) => c.id === id)
      return { id, gender: character?.gender }
    })
    const assignments = assignVoices(speakingCharacters, existingAssignments)
    if (assignments.length > existingAssignments.length) {
      await convex.mutation(api.adventure.patchAdventure, {
        adventureId: turn.adventureId,
        patch: { voiceAssignments: assignments, updatedAt: Date.now() },
      })
    }

    const keyPrefix = `adventures/${turn.adventureId}/turns/${turn._id}/audio/${narrativeHash.slice(0, 8)}`
    let ttsInputTokens = 0
    let ttsOutputTokens = 0

    const manifestSegments = await runWithConcurrency(segments, SYNTHESIS_CONCURRENCY, async (segment: AttributedSegment, index: number): Promise<TurnAudioSegment> => {
      const voice = voiceForSpeaker(segment.speaker, assignments)
      const styleInstruction = segment.speaker === "narrator" ? NARRATOR_STYLE : `Say in a ${segment.styleHint || "natural, in-character"} voice:`
      const { pcm, usage } = await synthesizeSegment({ text: segment.text, voice, styleInstruction })
      ttsInputTokens += usage.inputTokens
      ttsOutputTokens += usage.outputTokens

      const audioKey = `${keyPrefix}/${index}.wav`
      const wav = pcmToWav(pcm)
      await uploadFileToS3(new Blob([new Uint8Array(wav)], { type: "audio/wav" }), audioKey, "audio/wav")

      return {
        partIndex: segment.partIndex,
        speaker: segment.speaker,
        characterName: segment.characterName,
        text: segment.text,
        voice,
        audioKey,
        durationSec: Number(pcmDurationSec(pcm).toFixed(3)),
      }
    })

    // Metered charge on actual TTS usage. If the balance changed mid-flight and
    // the charge fails, still publish the manifest: the upfront check covers the
    // common case, and breaking cached playback for everyone is worse.
    let chargedTokens = 0
    const totalTtsTokens = ttsInputTokens + ttsOutputTokens
    if (totalTtsTokens > 0) {
      const chargeResult = await decrementUserTokensAction({ tokensUsed: totalTtsTokens, transactionType: "usage_tts_audio" })
      if (chargeResult.success) {
        chargedTokens = chargeResult.data.chargedTokens
      } else {
        console.error("turn-audio: TTS charge failed after successful generation:", chargeResult.error)
      }
    }

    await convex.mutation(api.turnAudio.finalizeTurnAudio, {
      turnId: turn._id,
      narrativeHash,
      segments: manifestSegments,
      usage: { ttsInputTokens, ttsOutputTokens, chargedTokens },
    })

    const row = await convex.query(api.turnAudio.getTurnAudio, { turnId: turn._id })
    return NextResponse.json(toManifestResponse(row, narrativeHash))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("turn-audio: generation failed:", error)
    await convex
      .mutation(api.turnAudio.failTurnAudio, { turnId: turn._id, narrativeHash, error: message })
      .catch((failError) => console.error("turn-audio: failed to record error state:", failError))

    if (isInsufficientTokensError(error)) {
      return NextResponse.json({ error: "Insufficient tokens for narration." }, { status: 402 })
    }
    return NextResponse.json({ error: "Failed to generate narration audio" }, { status: 500 })
  }
}
