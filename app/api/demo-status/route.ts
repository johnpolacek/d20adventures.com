import { budgetOpen } from "@/lib/gm-server/budget"

export const dynamic = "force-dynamic"

// Whether the site's own GM is still taking turns today (lib/gm-server/budget.ts). A game asks when a turn fails, to
// tell a spent day apart from a fault. It says only open or not, never the figures.
export async function GET() {
  return Response.json({ open: await budgetOpen() }, { headers: { "Cache-Control": "no-store" } })
}
