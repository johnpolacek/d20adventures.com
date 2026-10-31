import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { deviceFromRequest } from "@/lib/desktop/server"
import { arrivalJob, type HostedAction, hostErrorResponse, hostedAdventure, queueAction, reportedArrival } from "@/lib/host/server"

// The host's app asks for the next GM job, which also tells guests it is online, and reports each one done or failed.
export async function POST(request: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  try {
    const adventureId = (await params).adventureId as Id<"adventures">
    const body = (await request.json()) as { op?: string; jobId?: string; error?: string; suggestions?: unknown; arrival?: unknown } & Partial<HostedAction>
    if (body.op === "claim") {
      const job = await convex.mutation(api.hosting.claimJob, { secret: serverSecret(), adventureId, userId: device.userId })
      return NextResponse.json({ job: job && (await arrivalJob(job)) })
    }
    // The host plays too. Their actions queue like a guest's, so the worker takes every action in order.
    if (body.op === "queue") {
      const adventure = await hostedAdventure(adventureId, device.userId)
      return NextResponse.json({ jobId: await queueAction(adventure, device.userId, body as HostedAction) })
    }
    if (body.op === "finish" && body.jobId) {
      // A suggest job finishes with its replies, kept short enough for a chip and the reply box.
      const suggestions = Array.isArray(body.suggestions)
        ? body.suggestions
            .filter((s): s is { label: string; text: string } => typeof s?.label === "string" && typeof s?.text === "string" && Boolean(s.label.trim() && s.text.trim()))
            .slice(0, 3)
            .map((s) => ({ label: s.label.trim().slice(0, 60), text: s.text.trim().slice(0, 600) }))
        : undefined
      // An arrival job finishes with the hero's arrival.
      const arrival = reportedArrival(body.arrival)
      await convex.mutation(api.hosting.finishJob, {
        secret: serverSecret(),
        jobId: body.jobId as Id<"gmJobs">,
        userId: device.userId,
        error: body.error?.slice(0, 500),
        suggestions,
        ...(arrival ? { arrival } : {}),
      })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "Unknown job request." }, { status: 400 })
  } catch (e) {
    return hostErrorResponse(e)
  }
}
