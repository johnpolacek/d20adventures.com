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
  try {
    const adventureFiles = await listAndReadJsonFilesInS3Directory(`settings/${settingId}/`, ["setting-data.json"])
    adventures = adventureFiles.map((file) => file.data as AdventurePlan)
    console.log("Adventure files found:", JSON.stringify({ adventures: adventureFiles }, null, 2))
  } catch (err) {
    console.error("Error fetching adventure files from S3:", err)
  }

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-[2s] relative z-10">
        <ImageHeader variant="compact" imageUrl={getImageUrl(setting.image)} title={setting.name} subtitle="Adventures" imageAlt={setting.name} />
        <div className="max-w-4xl mx-auto -mt-32 relative z-10 whitespace-pre-line">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 py-8 auto-rows-fr">
            {adventures.map((adventure) => (
              <Link key={adventure.id} href={`/settings/${settingId}/${adventure.id}`} className="block h-full">
                <Card className="w-full h-full bg-black/80 border-white/20 scale-95 hover:scale-100 hover:bg-black/90 ring-[6px] ring-black hover:ring-8 hover:ring-primary-500 transition-colors cursor-pointer transition-all duration-500 ease-in-out p-0 overflow-hidden flex flex-col">
                  <div className="pb-2 relative aspect-video w-full">
                    <div className="absolute top-1 right-3 z-10">
                      <span className="bg-black/80 text-white text-xxs font-mono px-2 py-1 rounded">{adventure.party[0] === 1 && adventure.party[1] === 1 ? "Single Player" : "Multiplayer"}</span>
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
                        <Button variant="epic" size="sm" className="text-sm">
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
          <div className="px-8">
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
