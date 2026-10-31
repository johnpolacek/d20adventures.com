import { NewHero } from "@/components/heroes/new-hero"
import FullPageImage from "@/components/layout/fullpage-image"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { heroCreation } from "@/lib/heroes/creation"

// Made from a lobby, redirectToAdventure is that lobby's link: the hero is made for its adventure and joins its game.
export default async function NewCharacterPage({ searchParams }: { searchParams: Promise<{ redirectToAdventure?: string }> }) {
  const href = (await searchParams).redirectToAdventure
  const [, settingId, planId, adventureId] = /^\/settings\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/.exec(href ?? "") ?? []
  const adventure = adventureId ? await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> }).catch(() => null) : null
  const lobby = href && adventure ? { href, settingId, planId, adventureId, hosted: Boolean(adventure.host) } : undefined
  return (
    <FullPageImage>
      <NewHero creation={await heroCreation(lobby?.planId)} lobby={lobby} />
    </FullPageImage>
  )
}
