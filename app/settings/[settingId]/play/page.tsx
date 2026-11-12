import Link from "next/link"
import { textShadow } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import ImageHeader from "@/components/ui/image-header"
import Image from "@/components/ui/native-image"
import { listAndReadJsonFilesInS3Directory, readJsonFromS3 } from "@/lib/s3-utils"
import { getImageUrl } from "@/lib/utils"
import { getLocalWikiAdventureDefinition, settingHasLocalWikiAdventures } from "@/lib/wiki-adventures/local-runtime"
import { loadWikiAdventurePlanViewsForSetting } from "@/lib/wiki-adventures/plan-view"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { Setting } from "@/types/setting"

function partyLabel(party: AdventurePlan["party"]) {
  if (party[0] === 1 && party[1] === 1) return "Single Player"
  if (party[0] === party[1]) return `${party[0]} Players`
  return `${party[0]}-${party[1]} Players`
}

export default async function SettingAdventures(props: { params: Promise<{ settingId: string }> }) {
  const { settingId } = await props.params

  const key = `settings/${settingId}/setting-data.json`

  let setting: Setting | null = null
  try {
    setting = (await readJsonFromS3(key)) as Setting
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading setting data.</div>
  }

  // Resolve the adventure list from the wiki runtime for settings whose adventures are
  // wiki-backed; otherwise fall back to enumerating the legacy S3 AdventurePlan JSON.
  let adventures: AdventurePlan[] = []
  let publishedAdventures: AdventurePlan[] = []
  try {
    if (settingHasLocalWikiAdventures(settingId)) {
      adventures = await loadWikiAdventurePlanViewsForSetting(settingId)
    } else {
      const adventureFiles = await listAndReadJsonFilesInS3Directory(`settings/${settingId}/`, ["setting-data.json"])
      adventures = adventureFiles.map((file) => file.data as AdventurePlan)
    }
    publishedAdventures = adventures.filter((a) => !a.draft)
  } catch (err) {
    console.error("Error fetching adventure files:", err)
  }

  const featuredAdventure = publishedAdventures.find((a) => getLocalWikiAdventureDefinition(settingId, a.id)?.featured)
  const otherAdventures = publishedAdventures.filter((a) => a !== featuredAdventure)

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-[2s] relative z-10">
        <ImageHeader variant="semicompact" imageUrl={getImageUrl(setting.image)} title={setting.name} subtitle="Adventures" imageAlt={setting.name} />
        <div className="max-w-4xl xl:max-w-6xl mx-auto -mt-12 relative z-10 whitespace-pre-line">
          <div className="mb-8 text-center">
            {featuredAdventure && (
              <Link href={`/settings/${settingId}/${featuredAdventure.id}/character-select`} className="block relative z-10 pt-8">
                <Card className="w-full bg-black/80 border-amber-400/50 scale-[0.98] hover:scale-100 hover:bg-black/90 ring-[6px] ring-black hover:ring-8 hover:ring-primary-500 cursor-pointer transition-all duration-500 ease-in-out p-0 gap-0 overflow-hidden flex flex-col md:flex-row">
                  <div className="relative aspect-video md:aspect-auto md:w-3/5 md:min-h-[380px]">
                    <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-black to-transparent z-[9] hidden md:block" />
                    <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9] md:hidden" />
                    <Image src={getImageUrl(featuredAdventure.image)} alt={featuredAdventure.title} fill className="object-cover" />
                  </div>
                  <div className="md:w-2/5 flex flex-col items-center justify-center gap-4 px-8 py-8">
                    <span className="text-amber-400/90 font-display text-sm font-bold tracking-widest">Featured Adventure</span>
                    <h2 style={textShadow} className="text-white font-display text-3xl xl:text-4xl leading-tight">
                      {featuredAdventure.title}
                    </h2>
                    <div className="flex flex-wrap justify-center gap-2">
                      <span className="bg-white/10 text-white text-xxs font-mono px-2 py-1 rounded">{partyLabel(featuredAdventure.party)}</span>
                      {featuredAdventure.premadePlayerCharacters && featuredAdventure.premadePlayerCharacters.length > 0 && (
                        <span className="bg-amber-500/90 text-black text-xxs font-mono px-2 py-1 rounded font-semibold">Premade Characters</span>
                      )}
                    </div>
                    <div className="text-gray-300 text-base line-clamp-5">{featuredAdventure.teaser || featuredAdventure.overview}</div>
                    <Button variant="epic" className="pointer-events-none mt-2">
                      Play
                    </Button>
                  </div>
                </Card>
              </Link>
            )}
            {publishedAdventures.length > 0 ? (
              <div className="md:grid md:grid-cols-2 xl:grid-cols-3 gap-8 relative z-10 py-8 auto-rows-fr">
                {otherAdventures.map((adventure) => (
                  <Link key={adventure.id} href={`/settings/${settingId}/${adventure.id}/character-select`} className="block h-full">
                    <Card className="w-full h-full bg-black/80 border-white/20 scale-95 hover:scale-100 hover:bg-black/90 ring-[6px] ring-black hover:ring-8 hover:ring-primary-500 transition-colors cursor-pointer transition-all duration-500 ease-in-out p-0 overflow-hidden flex flex-col">
                      <div className="pb-2 relative aspect-video w-full">
                        <div className="absolute top-1 right-3 z-10 flex gap-2 flex-col items-end">
                          <span className="bg-black/80 text-white text-xxs font-mono px-2 py-1 rounded">{partyLabel(adventure.party)}</span>
                          {adventure.premadePlayerCharacters && adventure.premadePlayerCharacters.length > 0 && (
                            <span className="bg-amber-500/90 text-black text-xxs font-mono px-2 py-1 rounded font-semibold">Premade Characters</span>
                          )}
                        </div>
                        <div style={textShadow} className="absolute bottom-2 left-0 right-0 text-white w-full text-center font-display text-xl z-10">
                          {adventure.title}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9]" />
                        <Image src={getImageUrl(adventure.image)} alt={adventure.title} fill className="object-cover" />
                      </div>
                      <CardContent className="flex-1 flex flex-col">
                        <div className="relative z-10 flex-1 flex flex-col">
                          <div className="text-gray-300 text-base -mt-2 flex-1 line-clamp-4">{adventure.teaser || adventure.overview}</div>
                          <div className="mt-4 mb-6 w-full flex justify-center">
                            <Button variant="epic" size="sm" className="text-sm pointer-events-none">
                              Play
                            </Button>
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-tl from-black/50 to-transparent" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-8 text-gray-300">Adventures are temporarily unavailable.</p>
            )}
          </div>

          <div className="text-center">
            <h4 className="inline-block text-xl font-bold bg-black/50 px-8 py-2 rounded text-base text-amber-400/90 font-display my-4 text-center tracking-wider">Setting Overview</h4>
          </div>
          <div className="px-8 max-w-4xl mx-auto">
            <p>{setting.description}</p>
          </div>
          <div className="flex justify-center pt-8 pb-24">
            <Link href={`/settings/${settingId}`}>
              <Button variant="epic" asChild>
                Go To Setting
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
