import { NextResponse } from "next/server"
import { deviceFromRequest, revokeDevice } from "@/lib/desktop/server"

// The desktop app unlinks itself. Its token stops working everywhere.
export async function POST(request: Request) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  await revokeDevice(device.userId, device.deviceId)
  return NextResponse.json({ revoked: true })
}
