import { readJsonFromS3, listAndReadJsonFilesInS3Directory } from "@/lib/s3-utils"
import { Setting } from "@/types/setting"
import ImageHeader from "@/components/ui/image-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { AdventurePlan } from "@/types/adventure-plan"
import Image from "next/image"
import { textShadow } from "@/components/typography/styles"
import { getImageUrl } from "@/lib/utils"

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

  // Read all adventure plan JSON files (excluding setting-data.json)
  let adventures: AdventurePlan[] = []
  let publishedAdventures: AdventurePlan[] = []
  let draftAdventures: AdventurePlan[] = []
  try {
    const adventureFiles = await listAndReadJsonFilesInS3Directory(`settings/${settingId}/`, ["setting-data.json"])
    adventures = adventureFiles.map((file) => file.data as AdventurePlan)
    publishedAdventures = adventures.filter((a) => !a.draft)
    draftAdventures = adventures.filter((a) => !!a.draft)
    adventures.forEach((adventure) => {
      console.log(`[SettingAdventures] id: ${adventure.id}, draft: ${adventure.draft}`)
    })
  } catch (err) {
    console.error("Error fetching adventure files from S3:", err)
  }

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-[2s] relative z-10">
        <ImageHeader variant="compact" imageUrl={getImageUrl(setting.image)} title={setting.name} subtitle="Adventures" imageAlt={setting.name} />
        <div className="max-w-4xl xl:max-w-6xl mx-auto -mt-32 relative z-10 whitespace-pre-line">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 relative z-10 py-8 auto-rows-fr">
            {publishedAdventures.map((adventure) => (
              <div key={adventure.id} className="block h-full">
                <Card className="w-full h-full bg-black/80 border-white/20 scale-95 hover:scale-100 hover:bg-black/90 ring-[6px] ring-black hover:ring-8 hover:ring-primary-500 transition-colors cursor-pointer transition-all duration-500 ease-in-out p-0 overflow-hidden flex flex-col">
                  <div className="pb-2 relative aspect-video w-full">
                    <div className="absolute top-1 right-3 z-10 flex gap-2">
                      <span className="bg-black/80 text-white text-xxs font-mono px-2 py-1 rounded">
                        {adventure.party[0] === 1 && adventure.party[1] === 1
                          ? "Single Player"
                          : adventure.party[0] === 2 && adventure.party[1] === 2
                            ? `${adventure.party[0]} Players`
                            : `${adventure.party[0]}-${adventure.party[1]} Players`}
                      </span>
                    </div>
                    <div style={textShadow} className="absolute bottom-2 left-0 right-0 text-white w-full text-center font-display text-xl z-10">
                      {adventure.title}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9]" />
                    <Image src={getImageUrl(adventure.image)} alt={adventure.title} fill className="object-cover" />
                  </div>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="relative z-10 flex-1 flex flex-col">
                      <div className="text-gray-300 text-base -mt-2 flex-1">{adventure.teaser || adventure.overview}</div>
                      <div className="mt-4 mb-6 w-full flex justify-center">
                        <Link href={`/settings/${settingId}/${adventure.id}`}>
                          <Button variant="epic" size="sm" className="text-sm">
                            Play
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-tl from-black/50 to-transparent" />
                  </CardContent>
                </Card>
              </div>
            ))}
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

          {/* Draft Adventures Section */}
          {draftAdventures.length > 0 && (
            <div className="pb-12 mb-12">
              <h3 className="text-lg font-display text-amber-400/80 mb-8 -mt-8 text-center">Draft Adventures</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {draftAdventures.map((adventure) => (
                  <div key={adventure.id} className="block h-full">
                    <Card className="w-full h-full bg-black/80 border-yellow-400/60 ring-2 opacity-80 p-0 overflow-hidden flex flex-col">
                      <div className="pb-2 relative aspect-video w-full">
                        <div className="absolute top-1 right-3 z-10 flex gap-2">
                          <span className="bg-yellow-400/80 text-black text-xxs font-mono px-2 py-1 rounded">Draft</span>
                        </div>
                        <div style={textShadow} className="absolute bottom-2 left-0 right-0 text-white w-full text-center font-display text-xl z-10">
                          {adventure.title}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9]" />
                        <Image src={getImageUrl(adventure.image)} alt={adventure.title} fill className="object-cover" />
                      </div>
                      <CardContent className="flex-1 flex flex-col">
                        <div className="relative z-10 flex-1 flex flex-col">
                          <div className="text-gray-300 text-base -mt-2 flex-1">{adventure.teaser || adventure.overview}</div>
                          <div className="mt-4 mb-6 w-full flex justify-center">
                            <Link href={`/settings/${settingId}/${adventure.id}/edit`}>
                              <Button variant="outline" size="sm" className="text-sm">
                                Edit
                              </Button>
                            </Link>
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-tl from-black/50 to-transparent" />
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
