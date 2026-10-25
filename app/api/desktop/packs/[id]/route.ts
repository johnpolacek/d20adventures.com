import { sha256Hex } from "@d20/gm-core/packs"
import { NextResponse } from "next/server"
import { packBody } from "@/lib/desktop/packs"
import { deviceFromRequest } from "@/lib/desktop/server"
import { libraryFor } from "@/lib/store/server"

// A linked app downloads the story pack for an adventure its account owns.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  const { id } = await params
  const entry = (await libraryFor(device.userId)).find((a) => a.id === id)
  if (!entry?.owned) return NextResponse.json({ error: "You do not own this adventure." }, { status: 403 })
  const body = await packBody(id)
  if (!body) return NextResponse.json({ error: "This adventure is not available for download yet." }, { status: 404 })
  return new Response(body, { headers: { "Content-Type": "application/json", "X-Pack-Sha256": await sha256Hex(body), "Cache-Control": "private, no-store" } })
}
