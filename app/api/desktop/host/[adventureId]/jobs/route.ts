import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { deviceFromRequest } from "@/lib/desktop/server"
import { hostErrorResponse } from "@/lib/host/server"

// The host's app asks for the next GM job, which also tells guests it is online, and reports each one done or failed.
export async function POST(request: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  try {
    const adventureId = (await params).adventureId as Id<"adventures">
    const body = (await request.json()) as { op?: string; jobId?: string; error?: string }
    if (body.op === "claim") return NextResponse.json({ job: await convex.mutation(api.hosting.claimJob, { secret: serverSecret(), adventureId, userId: device.userId }) })
    if (body.op === "finish" && body.jobId) {
      await convex.mutation(api.hosting.finishJob, { secret: serverSecret(), jobId: body.jobId as Id<"gmJobs">, userId: device.userId, error: body.error?.slice(0, 500) })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "Unknown job request." }, { status: 400 })
  } catch (e) {
    return hostErrorResponse(e)
  }
}
