import { currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import CharacterSelection from "@/components/adventure/character-selection"
import FullPageImage from "@/components/layout/fullpage-image"
import AccountRequired from "@/components/nav/account-required"
import ChooseCharacterView from "@/components/views/choose-character-view"
import { listAndReadJsonFilesInS3Directory, readJsonFromS3 } from "@/lib/s3-utils"
import { getImageUrl } from "@/lib/utils"
import { isLocalWikiAdventure } from "@/lib/wiki-adventures/local-runtime"
import { loadWikiAdventurePlanView } from "@/lib/wiki-adventures/plan-view"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PCTemplate } from "@/types/character"

interface PageProps {
  params: Promise<{
    settingId: string
    adventurePlanId: string
  }>
}

export default async function CharacterSelectPage({ params }: PageProps) {
  const { settingId, adventurePlanId } = await params
  let adventurePlan: AdventurePlan | null = null
  try {
    adventurePlan = isLocalWikiAdventure(settingId, adventurePlanId)
      ? await loadWikiAdventurePlanView(settingId, adventurePlanId)
      : ((await readJsonFromS3(`settings/${settingId}/${adventurePlanId}.json`)) as AdventurePlan)
  } catch {
    return <div>Error loading adventure data.</div>
  }
  const adventureImage = getImageUrl(adventurePlan.image)

  // If premadeOnly, show premade character selection
  if (!adventurePlan.availableCharacterOptions) {
    return <CharacterSelection adventurePlan={adventurePlan} settingId={settingId} adventurePlanId={adventurePlanId} />
  }

  // Otherwise, show user character selection
  const user = await currentUser()
  if (!user) {
    return (
      <FullPageImage overlay={true} image={adventureImage}>
        <AccountRequired className="min-h-[80vh]" />
      </FullPageImage>
    )
  }
  if (!user.username) {
    redirect("/player")
  }

  let characters: PCTemplate[] = []
  let characterFiles: string[] = []
  try {
    const results = await listAndReadJsonFilesInS3Directory(`characters/${user.id}/`)
    characters = results.map((r) => r.data as PCTemplate)
    characterFiles = results.map((r) => (r.key.split("/").pop() ?? "").replace(".json", ""))
  } catch {
    characters = []
    characterFiles = []
  }

  return (
    <FullPageImage overlay={true} image={adventureImage}>
      <ChooseCharacterView
        username={user.username}
        characters={characters}
        characterFiles={characterFiles}
        userId={user.id}
        settingId={settingId}
        adventurePlanId={adventurePlanId}
        adventureTitle={adventurePlan.title}
        adventureTeaser={adventurePlan.teaser}
        premadeCompanions={adventurePlan.premadePlayerCharacters ?? []}
        party={adventurePlan.party ?? [1, 1]}
      />
    </FullPageImage>
  )
}
