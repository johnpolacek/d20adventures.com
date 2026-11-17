// Dev-only: a file from the asset library's workspace (asset-library/), which is not under public/.
//
//   /dev/assets/file/characters/garlan/lod0.glb
//
// The library page and the stage lab load figures through this, so a character's files all live in one folder.

import { readFile } from "node:fs/promises"
import path from "node:path"
import { isDev } from "@/lib/auth-utils"

const TYPES: Record<string, string> = { ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" }

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isDev()) return new Response("Not found", { status: 404 })
  const root = path.join(process.cwd(), "asset-library")
  const file = path.join(root, ...(await params).path)
  const type = TYPES[path.extname(file)]
  // Nothing outside the workspace, and only the kinds of file a page shows.
  if (!file.startsWith(root + path.sep) || !type) return new Response("Not found", { status: 404 })
  const body = await readFile(file).catch(() => null)
  // The game asks for its figures here in development (next.config.ts). One this workspace has not built is the
  // published one.
  const cdn = process.env.CLOUDFRONT_DOMAIN
  if (!body && cdn) {
    const sent = await fetch(`${cdn}/asset-library/${path.relative(root, file).split(path.sep).join("/")}`).catch(() => null)
    if (sent?.ok) return new Response(sent.body, { headers: { "Content-Type": type, "Cache-Control": "no-store" } })
  }
  if (!body) return new Response("Not found", { status: 404 })
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Cache-Control": "no-store" } })
}
