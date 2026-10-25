import { NextResponse } from "next/server"
import { deviceFromRequest } from "@/lib/desktop/server"
import { hostErrorResponse, isHostStoreOp, runHostStoreOp } from "@/lib/host/server"

// The GM core in the host's app reads and writes its hosted game here, one store operation per request.
export async function POST(request: Request) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  try {
    const { op, args } = (await request.json()) as { op?: unknown; args?: Record<string, unknown> }
    if (!isHostStoreOp(op) || !args || typeof args !== "object") return NextResponse.json({ error: "Unknown store operation." }, { status: 400 })
    return NextResponse.json({ result: (await runHostStoreOp(op, args, device.userId)) ?? null })
  } catch (e) {
    return hostErrorResponse(e)
  }
}
