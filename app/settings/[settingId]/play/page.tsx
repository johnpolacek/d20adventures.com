import { Heading } from "@d20/ui/typography/heading"
import Link from "next/link"
import type { CSSProperties } from "react"
import { textShadow } from "@d20/ui/typography/styles"
import { Button, buttonClassName, buttonStyle } from "@d20/ui/button"
import { Card, CardContent } from "@d20/ui/card"
import ImageHeader from "@d20/ui/image-header"
import Image from "@d20/ui/native-image"
import { partyLabel } from "@/components/views/adventure-preview"
import { getCachedSetting, getCachedSettingAdventures } from "@/lib/setting-cache"
import { headerImage, picture } from "@/lib/images"
import { getLocalWikiAdventureDefinition, playsOnSite } from "@/lib/wiki-adventures/local-runtime"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { Setting } from "@/types/setting"

export default async function SettingAdventures(props: { params: Promise<{ settingId: string }> }) {
  const { settingId } = await props.params

  let setting: Setting | null = null
  try {
    setting = await getCachedSetting(settingId)
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading setting data.</div>
  }

  // Wiki-backed settings list their compiled adventures, others the legacy S3 AdventurePlan JSON.
  let adventures: AdventurePlan[] = []
  let publishedAdventures: AdventurePlan[] = []
  try {
    adventures = await getCachedSettingAdventures(settingId)
    publishedAdventures = adventures.filter((a) => !a.draft)
  } catch (err) {
    console.error("Error fetching adventure files:", err)
  }

  const featuredAdventure = publishedAdventures.find((a) => getLocalWikiAdventureDefinition(settingId, a.id)?.featured)
  const otherAdventures = publishedAdventures.filter((a) => a !== featuredAdventure)

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-150 relative z-10">
        <ImageHeader variant="semicompact" {...headerImage(setting.image)} title={setting.name} subtitle="Adventures" imageAlt={setting.name} />
        <div className="max-w-4xl xl:max-w-6xl mx-auto -mt-12 relative z-10 whitespace-pre-line">
          <div className="mb-8 text-center">
            {featuredAdventure && (
              <Link href={`/settings/${settingId}/${featuredAdventure.id}`} className="enter-rise block relative z-10 pt-8 [--i:5]">
                <Card variant="pick" className="w-full border-accent-400/50 scale-[0.98] md:flex-row transition-[scale,box-shadow,background-color] duration-200">
                  <div className="relative aspect-video md:aspect-auto md:w-3/5 md:min-h-[380px]">
                    <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-black to-transparent z-[9] hidden md:block" />
                    <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9] md:hidden" />
                    <Image {...picture(featuredAdventure.image, "(min-width: 768px) 60vw, 100vw")} alt={featuredAdventure.title} fill className="object-cover" />
                  </div>
                  <div className="md:w-2/5 flex flex-col items-center justify-center gap-4 px-8 py-8">
                    <span className="text-accent-400/90 font-display text-sm font-bold tracking-label">Featured Adventure</span>
                    <Heading variant="h2" style={textShadow}>
                      {featuredAdventure.title}
                    </Heading>
                    <div className="flex flex-wrap justify-center gap-2">
                      <span className="bg-white/10 text-white text-3xs font-mono px-2 py-1 rounded">{partyLabel(featuredAdventure.party)}</span>
                      {playsOnSite(settingId, featuredAdventure.id) && <span className="bg-white/10 text-white text-3xs font-mono px-2 py-1 rounded">Play in Browser</span>}
                      {featuredAdventure.premadePlayerCharacters && featuredAdventure.premadePlayerCharacters.length > 0 && (
                        <span className="bg-accent-500/90 text-black text-3xs font-mono px-2 py-1 rounded font-semibold">Premade Characters</span>
                      )}
                    </div>
                    <div className="text-zinc-300 text-base line-clamp-5">{featuredAdventure.teaser || featuredAdventure.overview}</div>
                    <Button variant="epic" className="pointer-events-none mt-2">
                      View Adventure
                    </Button>
                  </div>
                </Card>
              </Link>
            )}
            {publishedAdventures.length > 0 ? (
              <div className="md:grid md:grid-cols-2 xl:grid-cols-3 gap-8 relative z-10 py-8 auto-rows-fr">
                {otherAdventures.map((adventure, index) => (
                  <Link
                    key={adventure.id}
                    href={`/settings/${settingId}/${adventure.id}`}
                    className="enter-rise block h-full"
                    // The page fades in after a short wait, so the cards start their rise then.
                    style={{ "--i": 6 + Math.min(index, 6) } as CSSProperties}
                  >
                    <Card variant="pick" className="w-full h-full transition-[scale,box-shadow,background-color] duration-200">
                      <div className="pb-2 relative aspect-video w-full">
                        <div className="absolute top-1 right-3 z-10 flex gap-2 flex-col items-end">
                          <span className="bg-black/80 text-white text-3xs font-mono px-2 py-1 rounded">{partyLabel(adventure.party)}</span>
                          {playsOnSite(settingId, adventure.id) && <span className="bg-black/80 text-white text-3xs font-mono px-2 py-1 rounded">Play in Browser</span>}
                          {adventure.premadePlayerCharacters && adventure.premadePlayerCharacters.length > 0 && (
                            <span className="bg-accent-500/90 text-black text-3xs font-mono px-2 py-1 rounded font-semibold">Premade Characters</span>
                          )}
                        </div>
                        <div style={textShadow} className="absolute bottom-2 left-0 right-0 text-white w-full text-center font-display text-xl z-10">
                          {adventure.title}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9]" />
                        <Image {...picture(adventure.image, "(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw")} alt={adventure.title} fill className="object-cover" />
                      </div>
                      <CardContent className="flex-1 flex flex-col">
                        <div className="relative z-10 flex-1 flex flex-col">
                          <div className="text-zinc-300 text-base -mt-2 flex-1 line-clamp-4">{adventure.teaser || adventure.overview}</div>
                          <div className="mt-4 mb-6 w-full flex justify-center">
                            <Button variant="epic" size="sm" className="text-sm pointer-events-none">
                              View Adventure
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
              <p className="py-8 text-zinc-300">Adventures are temporarily unavailable.</p>
            )}
          </div>

          <div className="text-center">
            <Heading variant="h3" as="h4" className="inline-block bg-black/50 px-8 py-2 rounded my-4 text-center">Setting Overview</Heading>
          </div>
          <div className="px-8 max-w-4xl mx-auto">
            <p>{setting.description}</p>
          </div>
          <div className="flex justify-center pt-8 pb-24">
            <Link href={`/settings/${settingId}`} className={buttonClassName("epic", undefined)} style={buttonStyle("epic", undefined)}>
              Go To Setting
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
