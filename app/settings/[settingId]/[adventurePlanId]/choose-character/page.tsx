import { currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { listAndReadJsonFilesInS3Directory, readJsonFromS3 } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import React from "react"
import ChooseCharacterView from "@/components/views/choose-character-view"
import FullPageImage from "@/components/layout/fullpage-image"
import { AdventurePlan } from "@/types/adventure-plan"
import { textShadowSpread } from "@/components/typography/styles"
import { getImageUrl } from "@/lib/utils"

interface PageProps {
  params: Promise<{
    settingId: string
    adventurePlanId: string
  }>
}

export default async function ChooseCharacterPage({ params }: PageProps) {
  const user = await currentUser()
  if (!user) redirect("/sign-in")

  if (!user.username) {
    redirect("/player")
  }

  const { settingId, adventurePlanId } = await params
  const key = `settings/${settingId}/${adventurePlanId}.json`
  let adventurePlan: AdventurePlan | null = null
  try {
    adventurePlan = (await readJsonFromS3(key)) as AdventurePlan
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading adventure data.</div>
  }

  // Fetch user's characters
  let characters: PCTemplate[] = []
  let characterFiles: string[] = []
  try {
    const results: Array<{ key: string; data: unknown }> = await listAndReadJsonFilesInS3Directory(`characters/${user.id}/`)
    characters = results.map((r) => r.data as PCTemplate)
    characterFiles = results.map((r) => (r.key.split("/").pop() ?? "").replace(".json", ""))
  } catch {
    characters = []
    characterFiles = []
  }

  return (
    <FullPageImage overlay={true} image={getImageUrl(adventurePlan.image)}>
      <div className="relative z-10">
        <h2 className="text-2xl sm:text-4xl md:text-5xl font-display text-center mt-24" style={textShadowSpread}>
          {adventurePlan.title}
        </h2>
        {characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center">
            <div className="bg-black/60 rounded-lg p-8 text-center max-w-md">
              <p className="mb-6 text-lg text-white">You don&apos;t have any characters yet.</p>
              <Link href={`/player/${user.username}/characters/new`}>
                <Button variant="epic">Create New Character</Button>
              </Link>
            </div>
          </div>
        ) : (
          <ChooseCharacterView username={user.username} characters={characters} characterFiles={characterFiles} userId={user.id} settingId={settingId} adventurePlanId={adventurePlanId} />
        )}
      </div>
    </FullPageImage>
  )
}
