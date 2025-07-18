import { currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { listAndReadJsonFilesInS3Directory, readJsonFromS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PCTemplate } from "@/types/character"
import ChooseCharacterView from "@/components/views/choose-character-view"
import CharacterSelection from "@/components/adventure/character-selection"
import FullPageImage from "@/components/layout/fullpage-image"
import AccountRequired from "@/components/nav/account-required"
import { getImageUrl } from "@/lib/utils"

interface PageProps {
  params: {
    settingId: string
    adventurePlanId: string
  }
}

export default async function CharacterSelectPage({ params }: PageProps) {
  const { settingId, adventurePlanId } = params
  const key = `settings/${settingId}/${adventurePlanId}.json`
  let adventurePlan: AdventurePlan | null = null
  try {
    adventurePlan = (await readJsonFromS3(key)) as AdventurePlan
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
        <AccountRequired />
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
      />
    </FullPageImage>
  )
}
