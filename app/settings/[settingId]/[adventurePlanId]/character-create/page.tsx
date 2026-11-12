import { HERO_CREATOR } from "@d20/gm-core/character/hero-draft"
import { notFound } from "next/navigation"
import { NewHero } from "@/components/heroes/new-hero"
import FullPageImage from "@/components/layout/fullpage-image"
import { heroCreation } from "@/lib/heroes/creation"

export default async function CharacterCreatePage({ params }: { params: Promise<{ settingId: string; adventurePlanId: string }> }) {
  if (!HERO_CREATOR) notFound()
  const { adventurePlanId } = await params
  return (
    <FullPageImage>
      <NewHero creation={await heroCreation(adventurePlanId)} />
    </FullPageImage>
  )
}
