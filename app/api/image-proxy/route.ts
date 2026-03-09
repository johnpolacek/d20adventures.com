import { IMAGE_HOST } from "@/lib/config"
import { type NextRequest, NextResponse } from "next/server"

const IMAGE_HOST_ORIGIN = new URL(IMAGE_HOST).origin

function isAllowedImageUrl(url: URL) {
  return url.origin === IMAGE_HOST_ORIGIN
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("src")

  if (!source) {
    return NextResponse.json({ error: "Missing image source" }, { status: 400 })
  }

  let sourceUrl: URL
  try {
    sourceUrl = new URL(source)
  } catch {
    return NextResponse.json({ error: "Invalid image source" }, { status: 400 })
  }

  if (!isAllowedImageUrl(sourceUrl)) {
    return NextResponse.json({ error: "Image source not allowed" }, { status: 403 })
  }

  const upstreamResponse = await fetch(sourceUrl, {
    cache: "force-cache",
  })

  if (!upstreamResponse.ok) {
    return NextResponse.json({ error: "Unable to fetch image" }, { status: upstreamResponse.status })
  }

  const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream"
  const cacheControl = upstreamResponse.headers.get("cache-control") || "public, max-age=31536000, immutable"
  const contentLength = upstreamResponse.headers.get("content-length")
  const body = await upstreamResponse.arrayBuffer()

  const responseHeaders = new Headers({
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
  })

  if (contentLength) {
    responseHeaders.set("Content-Length", contentLength)
  }

  return new NextResponse(body, {
    status: 200,
    headers: responseHeaders,
  })
}
