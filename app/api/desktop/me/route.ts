import { NextResponse } from "next/server"
import { clerkClient } from "@/lib/clerk"
import { deviceFromRequest } from "@/lib/desktop/server"

// Who this desktop app is linked to, for the app's account label.
export async function GET(request: Request) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  const user = await clerkClient.users.getUser(device.userId).catch(() => null)
  const account = user?.primaryEmailAddress?.emailAddress ?? user?.username ?? "your account"
  return NextResponse.json({ account, device: device.name })
}
