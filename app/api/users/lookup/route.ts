import { auth } from "@clerk/nextjs/server"
import { clerkClient } from "@/lib/clerk"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  try {
    const body = await req.json()
    const ids: unknown = body?.ids
    if (!Array.isArray(ids)) return new Response("Bad Request", { status: 400 })
    const unique = Array.from(new Set(ids.filter((x) => typeof x === "string"))) as string[]
    const limited = unique.slice(0, 100)

    const results: Record<string, string> = {}
    await Promise.all(
      limited.map(async (id) => {
        try {
          const user = await clerkClient.users.getUser(id)
          const username = user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "Player"
          results[id] = username
        } catch {
          results[id] = "Player"
        }
      })
    )

    return Response.json({ users: results })
  } catch (e: unknown) {
    console.error("Error looking up users", typeof e === "object" && e !== null && "message" in e ? e.message : "Unknown error")
    return new Response("Server Error", { status: 500 })
  }
}
