"use server"

// Get-or-generate character miniature assets for a turn, charging D20 tokens
// for every generation that costs real money (cache hits are free):
//   - standee render (gemini image): flat STANDEE_TOKEN_COST, refunded on failure
//   - 3D mini (fal Hunyuan3D): flat MINI3D_TOKEN_COST charged at job submit,
//     refunded if the job fails; jobs are async, the client polls via this action
//
// Returns standee URLs, ready 3D mini URLs, and whether any jobs are still
// pending. Characters whose generation fails or is unaffordable fall back to
// modeled minis / portrait pawns in the renderer.

import { auth } from "@clerk/nextjs/server"
import { decrementUserTokensAction, incrementUserTokensAction } from "@/app/_actions/tokens"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { MINI3D_TOKEN_COST, STANDEE_TOKEN_COST } from "@/lib/encounterview/costs"
import { claimMini3DSubmission, getMini3DUrl, isClaimMarker, isClaimStale, isMini3DEnabled, mini3DExists, pollMini3DJob, readMini3DJob, releaseMini3DClaim, submitMini3DJob } from "@/lib/encounterview/mini3d"
import { getOrCreateStandee, getStandeeHash, getStandeeKey, standeeExists } from "@/lib/encounterview/standee"
import { getAssetUrl } from "@/lib/aws"
import { getImageUrl } from "@/lib/utils"

const CONCURRENCY = 3

export interface CharacterMinisResult {
  /** characterId -> standee cutout PNG URL */
  minis: Record<string, string>
  /** characterId -> generated 3D mini GLB URL */
  minis3d: Record<string, string>
  /** true while any 3D generation job is still running — poll again */
  pending: boolean
  /** true when at least one generation was skipped for lack of tokens */
  insufficientTokens: boolean
}

async function chargeFlat(amount: number): Promise<"charged" | "insufficient" | "failed"> {
  const result = await decrementUserTokensAction({ tokensUsed: amount, transactionType: "usage_encounter_asset" })
  if (result.success) return "charged"
  return result.errorCode === "INSUFFICIENT_TOKENS" ? "insufficient" : "failed"
}

export async function getOrGenerateCharacterMinis(args: { turnId: string }): Promise<CharacterMinisResult> {
  const { userId } = await auth()
  const { turn } = await assertAdventureAccessByTurn(userId, args.turnId as Id<"turns">)

  const candidates = turn.characters.filter((c) => typeof c.image === "string" && c.image.length > 0)
  const minis: Record<string, string> = {}
  const minis3d: Record<string, string> = {}
  let pending = false
  let insufficientTokens = false

  const processCharacter = async (c: (typeof candidates)[number]) => {
    const imageUrl = getImageUrl(c.image as string)
    const hash = getStandeeHash(imageUrl)

    // --- standee (2D cutout) ------------------------------------------------
    let standeeUrl: string | null = null
    if (await standeeExists(getStandeeKey(imageUrl))) {
      standeeUrl = getAssetUrl(getStandeeKey(imageUrl))
    } else if (!insufficientTokens) {
      const charge = await chargeFlat(STANDEE_TOKEN_COST)
      if (charge === "insufficient") {
        insufficientTokens = true
      } else if (charge === "charged") {
        standeeUrl = await getOrCreateStandee({ imageUrl, name: c.name, race: c.race, archetype: c.archetype, appearance: c.appearance })
        if (!standeeUrl) {
          await incrementUserTokensAction({ tokensToCredit: STANDEE_TOKEN_COST, transactionType: "adjustment_refund" })
        }
      }
    }
    if (standeeUrl) minis[c.id] = standeeUrl

    // --- 3D mini (fal Hunyuan3D), input is the standee render ---------------
    if (!isMini3DEnabled() || !standeeUrl) return
    if (await mini3DExists(hash)) {
      const url = getMini3DUrl(hash)
      if (url) minis3d[c.id] = url
      return
    }
    const job = await readMini3DJob(hash)
    if (job && isClaimMarker(job)) {
      // Someone else is mid-submission; treat as pending unless their claim
      // went stale (crashed before submitting).
      if (!isClaimStale(job)) {
        pending = true
        return
      }
    } else if (job) {
      const poll = await pollMini3DJob(hash, job)
      if (poll.status === "ready") {
        minis3d[c.id] = poll.url
      } else if (poll.status === "pending") {
        pending = true
      } else if (poll.status === "failed" && userId === job.chargedUserId) {
        await incrementUserTokensAction({ tokensToCredit: MINI3D_TOKEN_COST, transactionType: "adjustment_refund" })
      }
      return
    }
    if (insufficientTokens || !userId) return

    // Claim BEFORE charging: concurrent callers race to the same marker key
    // and only the claim winner spends tokens and submits.
    if (!(await claimMini3DSubmission(hash, userId))) {
      pending = true
      return
    }
    const charge = await chargeFlat(MINI3D_TOKEN_COST)
    if (charge !== "charged") {
      await releaseMini3DClaim(hash)
      if (charge === "insufficient") insufficientTokens = true
      return
    }
    try {
      await submitMini3DJob(hash, standeeUrl, userId)
      pending = true
    } catch (error) {
      console.warn(`[encounterview] mini3d submit failed for ${c.name}: ${error instanceof Error ? error.message : error}`)
      await incrementUserTokensAction({ tokensToCredit: MINI3D_TOKEN_COST, transactionType: "adjustment_refund" })
      await releaseMini3DClaim(hash)
    }
  }

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    await Promise.all(candidates.slice(i, i + CONCURRENCY).map(processCharacter))
  }

  return { minis, minis3d, pending, insufficientTokens }
}
