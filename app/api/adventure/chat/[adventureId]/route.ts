import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { auth } from "@clerk/nextjs/server"
import { ConvexClient } from "convex/browser"

export async function GET(_: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  const convex = new ConvexClient(process.env.CONVEX_URL!)
  const { adventureId } = await params
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> })
  if (!adventure) return new Response("Not found", { status: 404 })
  const canAccess = adventure.ownerId === userId || (Array.isArray(adventure.playerIds) && adventure.playerIds.includes(userId))
  if (!canAccess) return new Response("Forbidden", { status: 403 })

  let lastTs = 0
  let interval: NodeJS.Timeout

  const stream = new ReadableStream({
    async start(controller) {
      const initial = await convex.query(api.chat.getRecent, { adventureId: adventure._id as Id<"adventures">, limit: 50 })
      if (initial.length) lastTs = initial[initial.length - 1].createdAt
      controller.enqueue(`data: ${JSON.stringify(initial)}\n\n`)

      interval = setInterval(async () => {
        const newer = await convex.query(api.chat.getSince, { adventureId: adventure._id as Id<"adventures">, since: lastTs })
        if (newer.length) {
          lastTs = newer[newer.length - 1].createdAt
          controller.enqueue(`data: ${JSON.stringify(newer)}\n\n`)
        }
      }, 1500)
    },
    cancel() {
      clearInterval(interval)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
