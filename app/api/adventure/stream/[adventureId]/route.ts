import { auth } from "@clerk/nextjs/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { AdventureAccessError, assertAdventureAccess } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"

export async function GET(request: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  try {
    const { adventureId } = await params
    const { userId } = await auth()

    if (!adventureId || typeof adventureId !== "string" || adventureId.length < 10) {
      return new Response("Invalid adventureId", { status: 400 })
    }

    const adventure = await assertAdventureAccess(userId, adventureId as Id<"adventures">)

    let interval: NodeJS.Timeout | undefined
    let closed = false
    const stop = () => {
      closed = true
      if (interval) {
        clearInterval(interval)
        interval = undefined
      }
    }

    const stream = new ReadableStream({
      async start(controller) {
        // enqueue throws once the client disconnects; treat that as the end of the stream
        const send = (chunk: string): boolean => {
          if (closed) return false
          try {
            controller.enqueue(chunk)
            return true
          } catch (_err) {
            stop()
            return false
          }
        }

        // cancel() is not invoked on all abrupt disconnects, so also watch the request signal
        request.signal.addEventListener("abort", stop)

        let lastTurnId: string | null = null
        let lastTurn: unknown = null
        // Send initial data immediately
        try {
          let turn = null
          if (adventure?.currentTurnId) {
            turn = await convex.query(api.adventure.getTurnById, { turnId: adventure.currentTurnId })
          }
          send(`data: ${JSON.stringify(turn)}\n\n`)
          lastTurnId = adventure?.currentTurnId ?? null
          lastTurn = turn
        } catch (_err) {
          send(`event: error\ndata: ${JSON.stringify({ error: "Failed to fetch adventure/turn" })}\n\n`)
        }
        if (closed) return
        interval = setInterval(async () => {
          try {
            const adventureSnapshot = await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> })
            if (closed) return
            let turn = null
            if (adventureSnapshot?.currentTurnId) {
              turn = await convex.query(api.adventure.getTurnById, { turnId: adventureSnapshot.currentTurnId })
            }
            if (adventureSnapshot?.currentTurnId !== lastTurnId || JSON.stringify(turn) !== JSON.stringify(lastTurn)) {
              if (send(`data: ${JSON.stringify(turn)}\n\n`)) {
                lastTurnId = adventureSnapshot?.currentTurnId ?? null
                lastTurn = turn
              }
            }
          } catch (_err) {
            send(`event: error\ndata: ${JSON.stringify({ error: "Failed to fetch adventure/turn" })}\n\n`)
          }
        }, 2000)
      },
      cancel() {
        stop()
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
