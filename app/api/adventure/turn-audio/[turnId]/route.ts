import { createHash } from "node:crypto"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAssetUrl, isAwsConfigured } from "@/lib/aws"
import { api, convex } from "@/lib/convex/server"
import { generateTurnAudioIncremental } from "@/lib/services/turn-audio-service"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import type { StoryviewAutoStatus, TurnAudioManifestResponse, TurnAudioSegment } from "@/types/turn-audio"

export const maxDuration = 300

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

// Best-effort display name for a pause notice: Clerk username, then the
// member's character name in this adventure, then a role-based fallback.
async function resolveMemberName(userId: string, adventure: Doc<"adventures">, turn: Doc<"turns">): Promise<string> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const username = user.username || user.firstName
    if (username) return username
  } catch (error) {
    console.warn("turn-audio: failed to resolve member name from Clerk:", error)
  }

  const characterId = adventure.players?.find((p) => p.userId === userId && p.controlledBy !== "ai")?.characterId
  const characterName = characterId ? turn.characters.find((c) => c.id === characterId)?.name : undefined
  if (characterName) return characterName

  return userId === adventure.ownerId ? "the game owner" : "a player"
}

async function buildStoryviewAuto(adventure: Doc<"adventures">, turn: Doc<"turns">, viewerId: string): Promise<StoryviewAutoStatus | undefined> {
  const storyview = adventure.storyview
  if (!storyview) return undefined
  if (!storyview.paused) return { enabled: storyview.autoEnabled }

  const shortUsers = await Promise.all(
    storyview.paused.shortUserIds.map(async (userId) => ({
      userId,
      name: await resolveMemberName(userId, adventure, turn),
      isYou: userId === viewerId,
    }))
  )

  return {
    enabled: storyview.autoEnabled,
    paused: { shortUsers, estimatedShare: storyview.paused.estimatedShare },
  }
}

function toManifestResponse(row: { status: "generating" | "ready" | "error"; narrativeHash: string; segments?: TurnAudioSegment[]; error?: string } | null, currentNarrativeHash: string, storyviewAuto?: StoryviewAutoStatus): TurnAudioManifestResponse {
  if (!row) return { status: "none", storyviewAuto }
  return {
    status: row.status,
    segments: row.segments?.map((segment) => ({ ...segment, audioUrl: getAssetUrl(segment.audioKey) ?? "" })),
    stale: row.narrativeHash !== currentNarrativeHash,
    error: row.error,
    storyviewAuto,
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params
  const loaded = await loadTurnForUser(turnId)
  if ("error" in loaded) return loaded.error

  const row = await convex.query(api.turnAudio.getTurnAudio, { turnId: loaded.turn._id })
  const storyviewAuto = await buildStoryviewAuto(loaded.adventure, loaded.turn, loaded.userId)
  return NextResponse.json(toManifestResponse(row, sha1(loaded.turn.narrative), storyviewAuto))
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params
  const loaded = await loadTurnForUser(turnId)
  if ("error" in loaded) return loaded.error
  const { userId, turn, adventure } = loaded

  if (!isAwsConfigured()) {
    return NextResponse.json({ error: "Audio storage is not configured" }, { status: 503 })
  }

  const result = await generateTurnAudioIncremental({
    turn,
    adventure,
    requestedBy: userId,
    charge: { type: "single", userId },
  })

  if (!result.ok) {
    if (result.reason === "insufficient") {
      return NextResponse.json({ error: `Insufficient tokens for narration. About ${result.estimatedTokens} tokens required.` }, { status: 402 })
    }
    if (result.reason === "no-content") {
      return NextResponse.json({ error: "Narrative contains no narratable paragraphs" }, { status: 422 })
    }
    if (result.reason === "error") {
      return NextResponse.json({ error: "Failed to generate narration audio" }, { status: 500 })
    }
    // claimed-elsewhere: another request generated (or is generating) this
    // narration; fall through and return the current manifest so the client
    // can play or poll.
  }

  const narrativeHash = sha1(turn.narrative)
  const row = await convex.query(api.turnAudio.getTurnAudio, { turnId: turn._id })
  const storyviewAuto = await buildStoryviewAuto(adventure, turn, userId)
  return NextResponse.json(toManifestResponse(row, narrativeHash, storyviewAuto))
}
