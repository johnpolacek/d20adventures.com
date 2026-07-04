import { NextResponse } from "next/server"
import { IMAGE_HOST } from "@/lib/config"

// Same-origin proxy for character portraits used as WebGL textures (encounter view
// portrait pawns). The public image hosts don't send CORS headers, so TextureLoader
// can't read them cross-origin; proxying makes them same-origin. Host-allowlisted.

const ALLOWED_HOSTS = new Set([new URL(IMAGE_HOST).host, "d20-public.s3.us-east-1.amazonaws.com"])

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url")
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 })
  }
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.host)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 })
  }

  const upstream = await fetch(target, { cache: "no-store" })
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Upstream error" }, { status: 502 })
  }
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  })
}
