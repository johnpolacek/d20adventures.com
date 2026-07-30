import { createHash } from "node:crypto"
import { decrementUserTokensAction } from "@/app/_actions/tokens"
import { attributeNarrative, type AttributedSegment } from "@/lib/ai/narration-attribution"
import { synthesizeSegment } from "@/lib/ai/tts"
import { assignVoices, voiceForSpeaker, type VoiceAssignment } from "@/lib/ai/tts-voices"
import { pcmDurationSec, pcmToWav } from "@/lib/audio/wav"
import { isAwsConfigured } from "@/lib/aws"
import { api, convex } from "@/lib/convex/server"
import { uploadFileToS3 } from "@/lib/s3-utils"
import { parseNarrative } from "@/lib/utils/parse-narrative"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import type { TurnAudioSegment } from "@/types/turn-audio"

// Storyview narration generation, shared by the on-demand route (single payer)
// and auto-narration mode (cost split across all adventure members). Audio is
// cached per paragraph: regeneration after a narrative append only attributes
// and synthesizes the new paragraphs.

// Provider-token estimate per narrative character: input text (~chars/4) +
// audio output (~25/sec at ~15 chars/sec ≈ 1.67/char) ≈ 2/char for TTS, plus
// ~1/char for the attribution LLM pass whose cost folds into the same charge.
const ESTIMATED_TTS_TOKENS_PER_CHAR = 2
const ESTIMATED_ATTRIBUTION_TOKENS_PER_CHAR = 1
const TOKEN_MULTIPLIER = 0.01 // 100 provider tokens = 1 D20 token
const SYNTHESIS_CONCURRENCY = 4

const NARRATOR_STYLE = "Narrate in an engaging storyteller voice at a brisk, energetic pace:"

type TurnDoc = Doc<"turns">
type AdventureDoc = Doc<"adventures">

export type TurnAudioChargeMode = { type: "single"; userId: string } | { type: "split"; userIds: string[] }

export type GenerateTurnAudioResult =
  | { ok: true }
  | { ok: false; reason: "no-content" | "claimed-elsewhere" | "error" }
  | { ok: false; reason: "insufficient"; shortUserIds: string[]; estimatedShare: number; estimatedTokens: number }

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex")
}

function styleInstructionFor(segment: Pick<AttributedSegment, "speaker" | "styleHint">): string {
  return segment.speaker === "narrator" ? NARRATOR_STYLE : `Say in a ${segment.styleHint || "natural, in-character"} voice:`
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

export function estimateNarrationCharge(newChars: number): number {
  return Math.ceil(newChars * (ESTIMATED_TTS_TOKENS_PER_CHAR + ESTIMATED_ATTRIBUTION_TOKENS_PER_CHAR) * TOKEN_MULTIPLIER)
}

export async function generateTurnAudioIncremental(opts: { turn: TurnDoc; adventure: AdventureDoc; requestedBy: string; charge: TurnAudioChargeMode }): Promise<GenerateTurnAudioResult> {
  const { turn, adventure, requestedBy, charge } = opts
  const narrativeHash = sha1(turn.narrative)
  const parts = parseNarrative(turn.narrative)
  const paragraphs = parts.flatMap((part, index) => (part.type === "paragraph" ? [{ partIndex: index, text: part.value, hash: sha1(part.value) }] : []))
  if (paragraphs.length === 0) {
    return { ok: false, reason: "no-content" }
  }

  // Read prior segments BEFORE claiming: the claim mutation wipes them.
  const priorRow = await convex.query(api.turnAudio.getTurnAudio, { turnId: turn._id })
  const priorByPartIndex = new Map<number, TurnAudioSegment[]>()
  for (const segment of priorRow?.segments ?? []) {
    const group = priorByPartIndex.get(segment.partIndex) ?? []
    group.push(segment)
    priorByPartIndex.set(segment.partIndex, group)
  }

  // A paragraph's audio is reusable iff every prior segment at its partIndex
  // was synthesized from identical text (rows predating paragraphHash never
  // match). Appends keep earlier partIndexes stable; edits and insertions
  // invalidate from the changed paragraph on.
  const reusable = new Map<number, TurnAudioSegment[]>()
  const newParagraphs: Array<{ partIndex: number; text: string; hash: string }> = []
  for (const paragraph of paragraphs) {
    const group = priorByPartIndex.get(paragraph.partIndex)
    if (group && group.length > 0 && group.every((s) => s.paragraphHash === paragraph.hash)) {
      reusable.set(paragraph.partIndex, group)
    } else {
      newParagraphs.push(paragraph)
    }
  }

  const newChars = newParagraphs.reduce((sum, p) => sum + p.text.length, 0)
  const estimatedTokens = estimateNarrationCharge(newChars)

  // Balance gate before claiming or doing any AI work.
  if (estimatedTokens > 0) {
    if (charge.type === "single") {
      await convex.mutation(api.userTokenManagement.ensureUserTokenRecord, { userId: charge.userId })
      const balance = await convex.query(api.userTokenManagement.getTokenBalance, { userId: charge.userId })
      if (balance.tokensRemaining < estimatedTokens) {
        return { ok: false, reason: "insufficient", shortUserIds: [charge.userId], estimatedShare: estimatedTokens, estimatedTokens }
      }
    } else {
      const check = await convex.query(api.userTokenManagement.checkSplitBalances, {
        userIds: charge.userIds,
        totalTokens: estimatedTokens,
      })
      if (!check.ok) {
        return {
          ok: false,
          reason: "insufficient",
          shortUserIds: check.members.filter((m) => m.short).map((m) => m.userId),
          estimatedShare: check.share,
          estimatedTokens,
        }
      }
    }
  }

  const claim = await convex.mutation(api.turnAudio.claimTurnAudioGeneration, {
    turnId: turn._id,
    adventureId: turn.adventureId,
    narrativeHash,
    requestedBy,
  })
  if (!claim.claimed) {
    return { ok: false, reason: "claimed-elsewhere" }
  }

  try {
    const roster = turn.characters.map((c) => ({
      id: c.id,
      name: c.name,
      gender: c.gender,
      personality: c.personality,
    }))

    const { segments: newSegments, usage: attributionUsage } = await attributeNarrative(
      newParagraphs.map(({ partIndex, text }) => ({ partIndex, text })),
      roster
    )

    // Assign stable per-adventure voices to any new speakers. Reused segments
    // carry their original voice, so persisted assignments keep them in sync.
    const existingAssignments: VoiceAssignment[] = adventure.voiceAssignments ?? []
    const speakerIds = [...new Set(newSegments.map((s) => s.speaker).filter((s) => s !== "narrator"))]
    const speakingCharacters = speakerIds.map((id) => {
      const character = roster.find((c) => c.id === id)
      return { id, gender: character?.gender }
    })
    const assignments = assignVoices(speakingCharacters, existingAssignments)
    if (assignments.length > existingAssignments.length) {
      await convex.mutation(api.adventure.patchAdventure, {
        adventureId: turn.adventureId,
        patch: { voiceAssignments: assignments, updatedAt: Date.now() },
      })
    }

    const hashByPartIndex = new Map(newParagraphs.map((p) => [p.partIndex, p.hash]))
    let ttsInputTokens = 0
    let ttsOutputTokens = 0

    const synthesized = await runWithConcurrency(newSegments, SYNTHESIS_CONCURRENCY, async (segment): Promise<TurnAudioSegment> => {
      const voice = voiceForSpeaker(segment.speaker, assignments)
      const styleInstruction = styleInstructionFor(segment)
      const { pcm, usage } = await synthesizeSegment({ text: segment.text, voice, styleInstruction })
      ttsInputTokens += usage.inputTokens
      ttsOutputTokens += usage.outputTokens

      // Content-addressed key: idempotent across regenerations and retries,
      // and never collides with the legacy {narrativeHash8}/{i}.wav keys.
      const contentHash = sha1(`${voice}|${styleInstruction}|${segment.text}`).slice(0, 16)
      const audioKey = `adventures/${turn.adventureId}/turns/${turn._id}/audio/segments/${contentHash}.wav`
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
        paragraphHash: hashByPartIndex.get(segment.partIndex),
      }
    })

    // Assemble the full manifest in partIndex order: reused paragraphs keep
    // their prior segments (and audio), new paragraphs get theirs.
    const newByPartIndex = new Map<number, TurnAudioSegment[]>()
    for (const segment of synthesized) {
      const group = newByPartIndex.get(segment.partIndex) ?? []
      group.push(segment)
      newByPartIndex.set(segment.partIndex, group)
    }
    const manifestSegments = paragraphs.flatMap((paragraph) => reusable.get(paragraph.partIndex) ?? newByPartIndex.get(paragraph.partIndex) ?? [])

    // Metered charge on actual usage (attribution + TTS). If a balance changed
    // mid-flight and the charge fails or clamps, still publish the manifest:
    // the upfront check covers the common case, and breaking cached playback
    // for everyone is worse.
    const totalProviderTokens = attributionUsage.totalTokens + ttsInputTokens + ttsOutputTokens
    let chargedTokens = 0
    if (totalProviderTokens > 0) {
      if (charge.type === "single") {
        const chargeResult = await decrementUserTokensAction({ tokensUsed: totalProviderTokens, transactionType: "usage_tts_audio" })
        if (chargeResult.success) {
          chargedTokens = chargeResult.data.chargedTokens
        } else {
          console.error("turn-audio: charge failed after successful generation:", chargeResult.error)
        }
      } else {
        const totalD20Tokens = Number((totalProviderTokens * TOKEN_MULTIPLIER).toFixed(6))
        try {
          const splitResult = await convex.mutation(api.userTokenManagement.splitDecrementTokens, {
            userIds: charge.userIds,
            totalTokens: totalD20Tokens,
            transactionType: "usage_tts_audio",
            description: `Storyview narration — turn ${turn.order}, split ${new Set(charge.userIds).size} ways`,
            clampToBalance: true,
          })
          if (splitResult.success) {
            chargedTokens = splitResult.results.reduce((sum, r) => sum + r.charged, 0)
          }
        } catch (error) {
          console.error("turn-audio: split charge failed after successful generation:", error)
        }
      }
    }

    await convex.mutation(api.turnAudio.finalizeTurnAudio, {
      turnId: turn._id,
      narrativeHash,
      segments: manifestSegments,
      usage: { ttsInputTokens, ttsOutputTokens, chargedTokens },
    })

    console.log(`turn-audio: generated turn ${turn._id} (${reusable.size} paragraphs reused, ${newParagraphs.length} synthesized, charge=${charge.type})`)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("turn-audio: generation failed:", error)
    await convex.mutation(api.turnAudio.failTurnAudio, { turnId: turn._id, narrativeHash, error: message }).catch((failError) => console.error("turn-audio: failed to record error state:", failError))
    return { ok: false, reason: "error" }
  }
}

// Fire-and-forget hook for narrative-settling server actions (via next/server
// after()). Generates audio for the turn with the cost split across all
// members, pausing auto mode instead when someone can't cover their share.
// Never throws into the host action.
export async function maybeTriggerStoryviewAutoGeneration(turnId: Id<"turns">): Promise<void> {
  try {
    const turn = await convex.query(api.adventure.getTurnById, { turnId })
    if (!turn) return
    const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId })
    if (!adventure?.storyview?.autoEnabled) return
    if (!isAwsConfigured()) return

    const narrativeHash = sha1(turn.narrative)
    const existing = await convex.query(api.turnAudio.getTurnAudio, { turnId: turn._id })
    if (existing?.narrativeHash === narrativeHash) {
      if (existing.status === "ready") {
        // Fresh audio already exists (e.g. someone generated on demand); a
        // lingering pause notice would only confuse.
        if (adventure.storyview.paused) {
          await setStoryviewPaused(adventure, undefined)
        }
        return
      }
      if (existing.status === "generating") return
    }

    const members = [...new Set([adventure.ownerId, ...adventure.playerIds])]
    const result = await generateTurnAudioIncremental({
      turn,
      adventure,
      requestedBy: "storyview-auto",
      charge: { type: "split", userIds: members },
    })

    if (result.ok) {
      if (adventure.storyview.paused) {
        await setStoryviewPaused(adventure, undefined)
      }
      return
    }
    if (result.reason === "insufficient") {
      await setStoryviewPaused(adventure, {
        reason: "insufficient_tokens",
        shortUserIds: result.shortUserIds,
        estimatedShare: result.estimatedShare,
        at: Date.now(),
      })
    }
  } catch (error) {
    console.error("storyview-auto: trigger failed:", error)
  }
}

async function setStoryviewPaused(adventure: AdventureDoc, paused: { reason: "insufficient_tokens"; shortUserIds: string[]; estimatedShare: number; at: number } | undefined): Promise<void> {
  if (!adventure.storyview) return
  await convex.mutation(api.adventure.setStoryviewSettings, {
    adventureId: adventure._id,
    storyview: {
      autoEnabled: adventure.storyview.autoEnabled,
      updatedBy: adventure.storyview.updatedBy,
      updatedAt: adventure.storyview.updatedAt,
      paused,
    },
  })
}
