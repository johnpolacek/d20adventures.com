import { readJsonFromS3 } from "@/lib/s3-utils"
import { isDev } from "@/lib/auth-utils"
import type { AdventurePlan } from "@/types/adventure-plan"
import CharacterSelection from "@/components/adventure/character-selection"
import Link from "next/link"

interface PageProps {
  params: { settingId: string; adventurePlanId: string }
}

export default async function CharacterSelectionPage({ params }: PageProps) {
  const { settingId, adventurePlanId } = params
  const key = `settings/${settingId}/${adventurePlanId}.json`
  let adventurePlan: AdventurePlan | null = null

  try {
    adventurePlan = (await readJsonFromS3(key)) as AdventurePlan
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading adventure data.</div>
  }

  const canEdit = isDev()

  return (
    <div className="flex min-h-screen flex-col relative">
      <CharacterSelection adventurePlan={adventurePlan} settingId={settingId} adventurePlanId={adventurePlanId} />
      {canEdit && (
        <Link className="fixed top-[90vh] right-8 z-10" href={`/settings/${settingId}/${adventurePlanId}/edit`}>
          <button className="text-sm bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded">Edit</button>
        </Link>
      )}
    </div>
  )
}
