import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { AdventureAccessError, assertAdventureAccess } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { auth } from "@clerk/nextjs/server"

export async function GET(_: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  try {
    const { adventureId } = await params
    const { userId } = await auth()

    const adventure = await assertAdventureAccess(userId, adventureId as Id<"adventures">)

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
  } catch (error) {
    if (error instanceof AdventureAccessError) {
      return new Response(error.message, { status: error.status })
    }
    return new Response("Internal Server Error", { status: 500 })
  }
}
