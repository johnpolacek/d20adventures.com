import CharacterCreateForm from "@/components/forms/character-create-form"
import Image from "@/components/ui/native-image"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { isLocalWikiAdventure } from "@/lib/wiki-adventures/local-runtime"
import { loadWikiAdventurePlanView } from "@/lib/wiki-adventures/plan-view"
import type { AdventurePlan } from "@/types/adventure-plan"

interface PageProps {
  params: Promise<{
    settingId: string
    adventurePlanId: string
  }>
}

export default async function CharacterCreatePage({ params }: PageProps) {
  const { settingId, adventurePlanId } = await params
  let adventurePlan: AdventurePlan | null = null
  try {
    adventurePlan = isLocalWikiAdventure(settingId, adventurePlanId)
      ? await loadWikiAdventurePlanView(settingId, adventurePlanId)
      : ((await readJsonFromS3(`settings/${settingId}/${adventurePlanId}.json`)) as AdventurePlan)
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading adventure data.</div>
  }

  const availableRaces = adventurePlan?.availableCharacterOptions?.races || []
  const availableArchetypes = adventurePlan?.availableCharacterOptions?.archetypes || []

  return (
    <div className="flex min-h-[max(100vh,100vw)] lg:min-h-screen flex-col relative">
      <div className="flex flex-1 items-center justify-center z-20">
        <CharacterCreateForm availableRaces={availableRaces} availableArchetypes={availableArchetypes} settingId={settingId} adventurePlanId={adventurePlanId} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/70 to-black/10 z-10" />
      <Image className="object-cover fade-in" fill={true} src="/images/app/backgrounds/d20-hero.png" alt="D20" />
    </div>
  )
}
