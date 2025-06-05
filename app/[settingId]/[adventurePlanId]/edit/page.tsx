import { auth } from "@clerk/nextjs/server"
import { SignInButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"
import { AdventurePlanEditForm } from "@/components/adventure-plans/adventure-plan-edit-form"
import { getAssetUrl } from "@/lib/aws"

export default async function AdventurePlanEditPage(props: { params: Promise<{ settingId: string; adventurePlanId: string }> }) {
  const { userId } = await auth()

  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 md:p-16">
        <Card className="w-full max-w-md bg-primary-800 border-primary-700 border-2 py-8">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-display text-white">Sign In Required</CardTitle>
            <CardDescription className="text-white/70">You need to be signed in to edit an adventure plan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <SignInButton mode="modal">
              <Button variant="epic" size="sm">
                Sign In
              </Button>
            </SignInButton>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { settingId, adventurePlanId } = await props.params
  const key = `settings/${settingId}/${adventurePlanId}.json`
  let adventurePlan: AdventurePlan | null = null
  try {
    adventurePlan = (await readJsonFromS3(key)) as AdventurePlan
    if (adventurePlan) {
      // Resolve main adventure plan image
      if (adventurePlan.image && !adventurePlan.image.startsWith("http")) {
        adventurePlan.image = getAssetUrl(adventurePlan.image) || adventurePlan.image
        console.log("AdventurePlanEditPage: Resolved main image URL on server:", adventurePlan.image)
      }

      // Resolve encounter images
      if (adventurePlan.sections) {
        for (const section of adventurePlan.sections) {
          if (section.scenes) {
            for (const scene of section.scenes) {
              if (scene.encounters) {
                for (const encounter of scene.encounters) {
                  if (encounter.image && !encounter.image.startsWith("http")) {
                    encounter.image = getAssetUrl(encounter.image) || encounter.image
                    console.log(`AdventurePlanEditPage: Resolved encounter image URL for ${encounter.id || "unknown encounter"}:`, encounter.image)
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error fetching JSON from S3 or resolving image URLs:", err)
    // adventurePlan will remain null or partially processed
  }

  if (!adventurePlan) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-16">
        <div className="text-2xl font-bold py-8 text-red-500">Error Loading Adventure Data</div>
        <p>Could not load the adventure plan. Please check the console for more details or try again later.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col relative p-8 md:p-16 max-w-7xl mx-auto">
      <AdventurePlanEditForm adventurePlan={adventurePlan} />
    </div>
  )
}
