import { currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { listAndReadJsonFilesInS3Directory } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import React from "react"
import ChooseCharacterView from "@/components/views/choose-character-view"

export default async function ChooseCharacterPage({ params }: { params: { settingId: string; adventurePlanId: string } }) {
  const user = await currentUser()
  if (!user) redirect("/sign-in")

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

  // If no characters, prompt to create one
  if (characters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="bg-black/60 rounded-lg p-8 text-center max-w-md">
          <p className="mb-6 text-lg text-white">You don&apos;t have any characters yet.</p>
          <Link href={`/player/${user.username}/characters/new`}>
            <Button variant="epic">Create New Character</Button>
          </Link>
        </div>
      </div>
    )
  }

  return <ChooseCharacterView characters={characters} characterFiles={characterFiles} userId={user.id} settingId={params.settingId} adventurePlanId={params.adventurePlanId} />
}
