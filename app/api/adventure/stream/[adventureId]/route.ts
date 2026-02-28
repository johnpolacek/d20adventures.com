import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { AdventureAccessError, assertAdventureAccess } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { auth } from "@clerk/nextjs/server"

export async function GET(_: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  try {
    const { adventureId } = await params
    const { userId } = await auth()

    if (!adventureId || typeof adventureId !== "string" || adventureId.length < 10) {
      return new Response("Invalid adventureId", { status: 400 })
    }

    const adventure = await assertAdventureAccess(userId, adventureId as Id<"adventures">)

    let interval: NodeJS.Timeout
    const stream = new ReadableStream({
      async start(controller) {
        let lastTurnId: string | null = null
        let lastTurn: unknown = null
        // Send initial data immediately
        try {
          let turn = null
          if (adventure?.currentTurnId) {
            turn = await convex.query(api.adventure.getTurnById, { turnId: adventure.currentTurnId })
          }
          controller.enqueue(`data: ${JSON.stringify(turn)}\n\n`)
          lastTurnId = adventure?.currentTurnId ?? null
          lastTurn = turn
        } catch (err) {
          controller.enqueue(`event: error\ndata: ${JSON.stringify({ error: "Failed to fetch adventure/turn" })}\n\n`)
        }
        interval = setInterval(async () => {
          try {
            const adventureSnapshot = await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> })
            let turn = null
            if (adventureSnapshot?.currentTurnId) {
              turn = await convex.query(api.adventure.getTurnById, { turnId: adventureSnapshot.currentTurnId })
            }
            if (adventureSnapshot?.currentTurnId !== lastTurnId || JSON.stringify(turn) !== JSON.stringify(lastTurn)) {
              controller.enqueue(`data: ${JSON.stringify(turn)}\n\n`)
              lastTurnId = adventureSnapshot?.currentTurnId ?? null
              lastTurn = turn
            }
          } catch (err) {
            controller.enqueue(`event: error\ndata: ${JSON.stringify({ error: "Failed to fetch adventure/turn" })}\n\n`)
          }
        }, 2000)
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
