import { NextResponse } from "next/server"
import { deviceFromRequest } from "@/lib/desktop/server"
import { libraryFor } from "@/lib/store/server"

export async function GET(request: Request) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  return NextResponse.json({ adventures: await libraryFor(device.userId) })
}
