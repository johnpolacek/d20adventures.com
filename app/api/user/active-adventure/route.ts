import { getActiveAdventureForUser } from "@/app/_actions/adventure"

const headers = { "Cache-Control": "private, no-store" }

export async function GET() {
  try {
    const result = await getActiveAdventureForUser()
    if (!result.userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers })
    return Response.json(result, { headers })
  } catch (error) {
    console.error("[ActiveAdventureAPI]", error)
    return Response.json({ error: "Unable to load your active adventure" }, { status: 500, headers })
  }
}
