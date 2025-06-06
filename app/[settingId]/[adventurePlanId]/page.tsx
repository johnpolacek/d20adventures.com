import { readJsonFromS3 } from "@/lib/s3-utils"
import AdventureHome from "@/components/views/adventure-home"
import type { AdventurePlan } from "@/types/adventure-plan"
import { TurnCharacter } from "@/types/adventure"

export default async function AdventureHomePage(props: { params: Promise<{ settingId: string; adventurePlanId: string }> }) {
  const { settingId, adventurePlanId } = await props.params
  const key = `settings/${settingId}/${adventurePlanId}.json`
  let adventurePlan: AdventurePlan | null = null
  try {
    adventurePlan = (await readJsonFromS3(key)) as AdventurePlan
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading adventure data.</div>
  }

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
    encounterId: "broken-silence",
    title: adventurePlan.title,
    subtitle: adventurePlan.sections[0].scenes[0].encounters[0].title,
    narrative: adventurePlan.sections[0].scenes[0].encounters[0].intro,
    characters: [
      {
        ...adventurePlan.premadePlayerCharacters[0],
        initiative: 10,
      } as TurnCharacter,
    ],
  }

  return (
    <div className="flex min-h-screen flex-col relative">
      <AdventureHome adventure={demoAdventure} adventurePlanId={adventurePlanId} settingId={settingId} encounterImage={adventurePlan.image} teaser={adventurePlan.teaser} currentTurn={demoTurn} />
    </div>
  )
}
