import { introTurn } from "@d20/gm-core/story/turn"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { loadLibrary } from "@/asset-library/load"
import AdventureHome from "@/components/views/adventure-home"
import AdventurePreview from "@/components/views/adventure-preview"
import { loadAdventurePlanFromStorage } from "@/lib/adventure-plan-storage"
import { getCachedSettingAdventures } from "@/lib/setting-cache"
import { shareImage } from "@/lib/images"
import { getLocalWikiAdventureDefinition, isLocalWikiAdventure } from "@/lib/wiki-adventures/local-runtime"
import { loadWikiAdventurePlanView } from "@/lib/wiki-adventures/plan-view"
import type { TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"

type Params = Promise<{ settingId: string; adventurePlanId: string }>

// A published adventure, from the same cache as the setting's adventure list.
async function published(settingId: string, adventurePlanId: string): Promise<AdventurePlan | null> {
  const adventures = await getCachedSettingAdventures(settingId).catch(() => [])
  return adventures.find((a) => a.id === adventurePlanId && !a.draft) ?? null
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { settingId, adventurePlanId } = await params
  const plan = await published(settingId, adventurePlanId)
  if (!plan) return {}
  const description = plan.teaser || plan.overview
  const images = plan.image ? [shareImage(plan.image)] : undefined
  return {
    title: `${plan.title} | D20 Adventures`,
    description,
    openGraph: { title: plan.title, description, images },
    twitter: { card: "summary_large_image", title: plan.title, description, images },
  }
}

export default async function AdventureHomePage(props: { params: Promise<{ settingId: string; adventurePlanId: string }>; searchParams?: Promise<{ selectedCharacter?: string }> }) {
  const { settingId, adventurePlanId } = await props.params
  const searchParams = await props.searchParams
  const selectedCharacterId = searchParams?.selectedCharacter

  // With no hero chosen this is the adventure's public page.
  if (!selectedCharacterId) {
    const plan = await published(settingId, adventurePlanId)
    if (plan) {
      const library = await loadLibrary().catch(() => null)
      const video = getLocalWikiAdventureDefinition(settingId, adventurePlanId)?.video
      return <AdventurePreview plan={plan} settingId={settingId} library={library?.setting === settingId ? library : null} video={video} />
    }
  }

  let adventurePlan: AdventurePlan | null = null
  try {
    adventurePlan = isLocalWikiAdventure(settingId, adventurePlanId) ? await loadWikiAdventurePlanView(settingId, adventurePlanId) : await loadAdventurePlanFromStorage(settingId, adventurePlanId)
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading adventure data.</div>
  }

  // An adventure that is not published has no public page, so it goes straight to character selection.
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
    ...introTurn(adventurePlan.sections[0].scenes[0].encounters[0].intro ?? "", { cast: selectedCharacter ? [{ id: selectedCharacter.id, name: selectedCharacter.name, type: "pc" }] : [] }),
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
