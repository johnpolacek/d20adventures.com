import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth-utils"

// Hands the queue page a picture from the public bucket, which sends no CORS headers, so the page can copy it to the
// clipboard for pasting into a post. Development only, and only the bucket's own pictures.
const BUCKET = "https://d20-public.s3.us-east-1.amazonaws.com/"

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") notFound()
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) return new Response("Access denied", { status: 403 })
  const url = new URL(request.url).searchParams.get("url") ?? ""
  if (!url.startsWith(BUCKET)) return new Response("Not a bucket picture", { status: 400 })
  const res = await fetch(url)
  if (!res.ok) return new Response("Not found", { status: res.status })
  return new Response(res.body, { headers: { "Content-Type": res.headers.get("Content-Type") ?? "image/webp", "Cache-Control": "no-store" } })
}
