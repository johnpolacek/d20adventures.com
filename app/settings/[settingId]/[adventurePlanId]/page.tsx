import { redirect } from "next/navigation"
import AdventureHome from "@/components/views/adventure-home"
import { loadAdventurePlanFromStorage } from "@/lib/adventure-plan-storage"
import { isLocalWikiAdventure } from "@/lib/wiki-adventures/local-runtime"
import { loadWikiAdventurePlanView } from "@/lib/wiki-adventures/plan-view"
import type { TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"

export default async function AdventureHomePage(props: { params: Promise<{ settingId: string; adventurePlanId: string }>; searchParams?: Promise<{ selectedCharacter?: string }> }) {
  const { settingId, adventurePlanId } = await props.params
  const searchParams = await props.searchParams
  const selectedCharacterId = searchParams?.selectedCharacter
  let adventurePlan: AdventurePlan | null = null
  try {
    adventurePlan = isLocalWikiAdventure(settingId, adventurePlanId) ? await loadWikiAdventurePlanView(settingId, adventurePlanId) : await loadAdventurePlanFromStorage(settingId, adventurePlanId)
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading adventure data.</div>
  }

  // Check if we have multiple premade characters and no selection - redirect to character selection
  if (!selectedCharacterId) {
    redirect(`/settings/${settingId}/${adventurePlanId}/character-select`)
  }

  // Find the selected character or use the first one
  const selectedCharacter = selectedCharacterId ? adventurePlan.premadePlayerCharacters.find((char) => char.id === selectedCharacterId) : adventurePlan.premadePlayerCharacters[0]

  // If we only have one character or none, proceed with demo setup
  const demoAdventure = {
    id: "demo-adventure",
    title: adventurePlan.title,
    adventurePlanId: adventurePlan.id,
    settingId: settingId,
    party: [],
    turns: [],
    startedAt: new Date().toISOString(),
  }

  const demoTurn = {
    id: "demo-turn",
    adventureId: "demo-adventure",
    encounterId: adventurePlan.sections[0].scenes[0].encounters[0].id,
    title: adventurePlan.sections[0].scenes[0].encounters[0].title,
    subtitle: adventurePlan.sections[0].scenes[0].encounters[0].title,
    narrative: adventurePlan.sections[0].scenes[0].encounters[0].intro,
    characters: selectedCharacter
      ? [
          {
            ...selectedCharacter,
            initiative: 10,
          } as TurnCharacter,
        ]
      : [],
  }

  return (
    <div className="flex min-h-screen flex-col relative">
      <AdventureHome adventure={demoAdventure} adventurePlanId={adventurePlanId} settingId={settingId} encounterImage={adventurePlan.image} currentTurn={demoTurn} />
    </div>
  )
}
