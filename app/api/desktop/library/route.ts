import { NextResponse } from "next/server"
import { packIndex } from "@/lib/desktop/packs"
import { deviceFromRequest } from "@/lib/desktop/server"
import { libraryFor } from "@/lib/store/server"

// Owned adventures carry their current story pack version, so the app knows what to download.
export async function GET(request: Request) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  const [adventures, index] = await Promise.all([libraryFor(device.userId), packIndex()])
  return NextResponse.json({ adventures: adventures.map((a) => (a.owned && index[a.id] ? { ...a, pack: index[a.id] } : a)) })
}
