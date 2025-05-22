import { readJsonFromS3 } from "@/lib/s3-utils"
import AdventureHome from "@/components/views/adventure-home"
import type { AdventurePlan } from "@/types/adventure-plan"

export default async function AdventureHomePage(props: { params: Promise<{ settingId: string; adventurePlanId: string }> }) {
  const { settingId, adventurePlanId } = await props.params

  // Check user authentication
  const isDemo = adventurePlanId === "the-midnight-summons"

  const key = `settings/${settingId}/${adventurePlanId}.json`
  let adventurePlan: AdventurePlan | null = null
  try {
    adventurePlan = (await readJsonFromS3(key)) as AdventurePlan
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading adventure data.</div>
  }

  return (
    <div className="flex min-h-screen flex-col relative">
      <AdventureHome adventurePlan={adventurePlan} isDemo={isDemo} />
    </div>
  )
}
