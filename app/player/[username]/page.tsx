import { currentUser } from "@clerk/nextjs/server"
import Image from "next/image"
import { redirect } from "next/navigation"
import { listAndReadJsonFilesInS3Directory, readJsonFromS3 } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"
import { getImageUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import FullPageImage from "@/components/layout/fullpage-image"
import { textShadowSpreadLight } from "@/components/typography/styles"
import { getAdventuresForUser } from "@/app/_actions/adventure"

export default async function PlayerProfilePage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params
  const user = await currentUser()

  if (!user) {
    redirect("/sign-in")
  }

  const isPlayer = user.username === username

  if (!isPlayer) {
    redirect("/")
  }

  // Fetch the user's characters from S3
  let characters: PCTemplate[] = []
  let characterFiles: string[] = []
  try {
    const results: Array<{ key: string; data: unknown }> = await listAndReadJsonFilesInS3Directory(`characters/${user.id}/`)
    console.log("[PlayerProfilePage] characters", JSON.stringify({ results }, null, 2))
    characters = results.map((r) => r.data as PCTemplate)
    characterFiles = results.map((r) => (r.key.split("/").pop() ?? "").replace(".json", ""))
  } catch {
    // If S3 is not configured or there are no characters, just show none
    characters = []
    characterFiles = []
  }

  // Fetch the user's adventures
  const adventures = await getAdventuresForUser()

  // Fetch adventure plan images for each adventure (cache by planId)
  const planImageCache: Record<string, string> = {}
  for (const adv of adventures) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const planId = (adv as any).planId || (adv as any).adventurePlanId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingId = (adv as any).settingId
    if (planId && settingId && !planImageCache[planId]) {
      try {
        const plan = await readJsonFromS3(`settings/${settingId}/${planId}.json`)
        if (plan && typeof plan === "object" && "image" in plan && typeof plan.image === "string" && plan.image) {
          planImageCache[planId] = getImageUrl(plan.image)
        }
      } catch {}
    }
  }

  return (
    <FullPageImage>
      <div className="relative z-10 p-12 mt-12">
        {isPlayer ? (
          <>
            <p className="text-white/70 w-full text-center italic">Welcome back to D20 Adventures, {user.firstName}!</p>
            {characters.length > 0 ? (
              <div className="mt-8">
                <h2 style={textShadowSpreadLight} className="text-3xl font-bold mb-8 w-full text-amber-400 font-display text-center">
                  Your Characters
                </h2>
                <div className="flex flex-wrap gap-6 justify-center">
                  {characters.map((char, i) => (
                    <div key={char.id} className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
                      <div className="bg-black rounded-lg overflow-hidden flex flex-col items-center ring-8 ring-black/30 border border-white/10 pb-6 font-display">
                        <div className="w-full h-48 relative">
                          {char.image ? (
                            <Image src={getImageUrl(char.image)} alt={char.name} fill={true} className="object-cover w-full h-full" />
                          ) : (
                            <span className="text-xs text-white/40">No Image</span>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                        </div>
                        <div className="font-bold text-3xl text-amber-400 mb-1 truncate w-full text-center">{char.name}</div>
                        <div className="text-base mb-4 text-center">
                          {char.gender} {char.race} {char.archetype}
                        </div>
                        <Link href={`/player/${user.username}/characters/${characterFiles[i]}/edit`}>
                          <Button asChild variant="epic" className="text-sm" size="sm">
                            Edit
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 pt-12">
                <div className="max-w-md space-y-6 text-center rounded-lg bg-black/50 ring-8 ring-black/30 border border-white/10 p-8">
                  <p className="text-lg">
                    You don&apos;t have any characters yet. <br />
                    Create one or join an adventure to get started.
                  </p>
                  <Link href="/settings/realm-of-myr/play">
                    <Button asChild variant="epic" className="text-sm" size="sm">
                      Join an Adventure
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Adventures Section */}
            <div className="mt-16">
              <h2 style={textShadowSpreadLight} className="text-3xl font-bold mb-8 w-full text-amber-400 font-display text-center">
                Your Adventures
              </h2>
              {adventures.length > 0 ? (
                <div className="flex flex-wrap gap-6 justify-center">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {adventures.map((adv: any) => (
                    <div key={adv._id} className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
                      <div className="bg-black rounded-lg overflow-hidden flex flex-col items-center ring-8 ring-black/30 border border-white/10 pb-6 font-display">
                        {/* Adventure Image */}
                        {(() => {
                          const planId = adv.planId || adv.adventurePlanId
                          const img = planImageCache[planId]
                          return img ? (
                            <div className="w-full h-32 relative">
                              <Image src={img} alt={adv.title} fill={true} className="object-cover w-full h-full" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                            </div>
                          ) : (
                            <div className="w-full h-32 flex items-center justify-center bg-black/60 text-white/30 text-xs">No Image</div>
                          )
                        })()}
                        <span className="text-white text-xl text-center px-2 truncate w-full my-2">{adv.title}</span>
                        <Link href={`/settings/${adv.settingId}/${adv.planId || adv.adventurePlanId}/${adv._id || adv.id}`}>
                          <Button asChild variant="epic" className="text-sm" size="sm">
                            {adv.status === "active" ? "Continue" : "View"}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-white/60 italic">You are not part of any adventures yet.</div>
              )}
            </div>
          </>
        ) : (
          <p className="text-lg">Player Profile: {user.username}</p>
        )}
      </div>
    </FullPageImage>
  )
}
