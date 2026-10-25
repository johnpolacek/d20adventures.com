import { currentUser } from "@clerk/nextjs/server"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getAdventuresForUser } from "@/app/_actions/adventure"
import { getPracticeReportsForUser } from "@/app/_actions/adventure-reports"
import { getUserCharacters } from "@/app/_actions/character"
import FullPageImage from "@/components/layout/fullpage-image"
import { textShadowSpreadLight } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import Image from "@/components/ui/native-image"
import { getImageUrl } from "@/lib/utils"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { PCTemplate } from "@/types/character"
import { CharacterGrid } from "./components/character-grid"

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
    characters = await getUserCharacters(user.id)
    characterFiles = characters.map((c) => c.id)
  } catch {
    characters = []
    characterFiles = []
  }

  // Fetch the user's adventures
  const adventures = await getAdventuresForUser()
  const practiceReports = await getPracticeReportsForUser(20)

  // Fetch adventure plan images for each adventure (cache by planId)
  const planImageCache: Record<string, string> = {}
  for (const adv of adventures) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const planId = (adv as any).planId || (adv as any).adventurePlanId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingId = (adv as any).settingId
    if (planId && settingId && !planImageCache[planId]) {
      try {
        const plan = await loadAdventurePlanForRuntime(settingId, planId)
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
                <CharacterGrid username={user.username!} characters={characters} characterFiles={characterFiles} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 pt-12">
                <div className="max-w-md space-y-6 text-center rounded-lg bg-black/50 ring-8 ring-black/30 border border-white/10 p-8">
                  <p className="text-lg">
                    You don&apos;t have any characters yet. <br />
                    Create one or join an adventure to get started.
                  </p>
                  {/* Create New Character Button in empty state */}
                  <Link href={`/player/${user.username}/characters/new`}>
                    <Button asChild variant="epic" className="text-sm" size="sm">
                      Create New Character
                    </Button>
                  </Link>
                  <Link href="/settings/realm-of-myr/play">
                    <Button asChild variant="epic" className="text-sm" size="sm">
                      Join an Adventure
                    </Button>
                  </Link>
                </div>
              </div>
            )}
            <div className="flex justify-center mt-8">
              <Link href={`/player/${user.username}/characters/new`}>
                <Button asChild variant="epic" className="text-sm" size="sm">
                  Create New Character
                </Button>
              </Link>
            </div>

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
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`text-xxs px-2 py-1 rounded font-mono ${adv.runType === "practice" ? "bg-amber-700/50 text-amber-100" : "bg-indigo-700/50 text-indigo-100"}`}>
                            {(adv.runType ?? "campaign") === "practice" ? "Practice" : "Campaign"}
                          </span>
                          <span className="text-xxs px-2 py-1 rounded font-mono bg-white/10 text-white/80">{adv.status || "active"}</span>
                        </div>
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

            <div className="mt-16">
              <h2 style={textShadowSpreadLight} className="text-3xl font-bold mb-8 w-full text-amber-400 font-display text-center">
                Practice Reports
              </h2>
              {practiceReports.length > 0 ? (
                <div className="max-w-4xl mx-auto space-y-3">
                  {practiceReports.map((report) => (
                    <div key={report.id} className="rounded-lg border border-white/20 bg-black/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-display text-lg text-amber-200">{report.adventureTitle}</div>
                        <div className="text-xs font-mono text-white/70">{new Date(report.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-sm text-white/70 mt-1">
                        {report.findingsCount} findings • {report.status}
                      </div>
                      {report.summary ? <p className="text-sm text-white/85 mt-2 line-clamp-3">{report.summary}</p> : null}
                      <div className="mt-3">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/settings/${report.settingId}/${report.planId}/${report.adventureId}`}>Open Run</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-white/60 italic">No practice reports yet.</div>
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
