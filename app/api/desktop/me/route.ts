import { NextResponse } from "next/server"
import { clerkClient } from "@/lib/clerk"
import { deviceFromRequest } from "@/lib/desktop/server"

// The account picture as a small data URL. The app's content policy allows no remote images.
async function avatarOf(imageUrl: string | undefined) {
  if (!imageUrl) return undefined
  try {
    const url = new URL(imageUrl)
    // Width only: Clerk rounds width up to 160 but keeps a given height, which crops the picture to a strip.
    url.searchParams.set("width", "96")
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    const type = res.headers.get("content-type") ?? ""
    if (!res.ok || !type.startsWith("image/")) return undefined
    const bytes = Buffer.from(await res.arrayBuffer())
    return bytes.length > 100_000 ? undefined : `data:${type};base64,${bytes.toString("base64")}`
  } catch {
    return undefined
  }
}

// Who this desktop app is linked to, for the app's account menu.
export async function GET(request: Request) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  const user = await clerkClient.users.getUser(device.userId).catch(() => null)
  const account = user?.primaryEmailAddress?.emailAddress ?? user?.username ?? "your account"
  return NextResponse.json({ account, device: device.name, avatar: await avatarOf(user?.imageUrl) })
}
