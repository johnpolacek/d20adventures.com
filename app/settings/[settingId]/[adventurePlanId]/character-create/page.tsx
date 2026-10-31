import { NewHero } from "@/components/heroes/new-hero"
import FullPageImage from "@/components/layout/fullpage-image"
import { heroCreation } from "@/lib/heroes/creation"

export default async function CharacterCreatePage({ params }: { params: Promise<{ settingId: string; adventurePlanId: string }> }) {
  const { adventurePlanId } = await params
  return (
    <FullPageImage>
      <NewHero creation={await heroCreation(adventurePlanId)} />
    </FullPageImage>
  )
}
