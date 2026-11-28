import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"

// Host online window matching the hosted play screen (~90s since last claim/heartbeat).
const HOST_ONLINE_MS = 90_000

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "")

// Queues a hero concept generation job for the GM Host's desktop app on a hosted adventure waiting for players.
export async function POST(request: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Sign in to generate a hero." }, { status: 401 })

  try {
    const { adventureId } = await params
    const body = (await request.json().catch(() => ({}))) as { race?: unknown; archetype?: unknown; gender?: unknown; hook?: unknown }
    const race = clip(body.race, 60)
    const archetype = clip(body.archetype, 60)
    const gender = clip(body.gender, 40)
    const hook = clip(body.hook, 300)
    if (!race || !archetype) return NextResponse.json({ error: "Choose a species and class first." }, { status: 400 })

    const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> }).catch(() => null)
    if (!adventure?.host) return NextResponse.json({ error: "This adventure is not hosted." }, { status: 400 })
    if (adventure.status !== "waitingForPlayers" || adventure.currentTurnId) {
      return NextResponse.json({ error: "This game has already started." }, { status: 409 })
    }

    const hostOnline = Boolean(adventure.host.seenAt && Date.now() - adventure.host.seenAt < HOST_ONLINE_MS)
    const jobId = await convex.mutation(api.hosting.queueHeroIdea, {
      secret: serverSecret(),
      adventureId: adventure._id,
      userId,
      text: JSON.stringify({ race, archetype, ...(gender ? { gender } : {}), ...(hook ? { hook } : {}) }),
    })

    return NextResponse.json({ jobId, hostOnline })
  } catch (error) {
    console.error("[hero-idea] Failed to queue hero concept job:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reach the GM Host." }, { status: 500 })
  }
}

// Polls a queued hero concept job for the signed-in user who requested it.
export async function GET(request: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Sign in to check your hero." }, { status: 401 })

  const { adventureId } = await params
  const jobId = new URL(request.url).searchParams.get("jobId")
  if (!jobId) return NextResponse.json({ error: "Missing jobId." }, { status: 400 })

  const job = await convex.query(api.hosting.getJob, { secret: serverSecret(), jobId: jobId as Id<"gmJobs"> }).catch(() => null)
  if (!job || job.adventureId !== adventureId || job.kind !== "heroIdea" || job.userId !== userId) {
    return NextResponse.json({ error: "Generation request not found." }, { status: 404 })
  }

  return NextResponse.json({
    status: job.status,
    heroConcept: job.heroConcept,
    error: job.error,
  })
}
