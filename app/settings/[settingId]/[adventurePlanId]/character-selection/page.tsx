import { readJsonFromS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"
import CharacterSelection from "@/components/adventure/character-selection"
import { isDev } from "@/lib/auth-utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function CharacterSelectionPage(props: { params: Promise<{ settingId: string; adventurePlanId: string }> }) {
  const { settingId, adventurePlanId } = await props.params
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
          <Button className="text-sm bg-primary-600 hover:bg-primary-700">Edit</Button>
        </Link>
      )}
    </div>
  )
}
