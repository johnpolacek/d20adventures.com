import { NewAdventurePlanForm } from "@/components/adventure-plans/new-adventure-plan-form"
import FullPageImage from "@/components/layout/fullpage-image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { canManageResource } from "@/lib/content-permissions"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { Setting } from "@/types/setting"
import { SignInButton } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"

export default async function NewAdventurePlanPage(props: { params: Promise<{ settingId: string }> }) {
  const { userId } = await auth()

  if (!userId) {
    return (
      <FullPageImage overlay>
        <div className="flex min-h-screen flex-col items-center justify-center p-8 md:p-16 relative z-10">
          <Card className="w-full max-w-md bg-black/50 backdrop-blur-sm border-white/20">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-display text-white">Sign In Required</CardTitle>
              <CardDescription className="text-white/70">You need to be signed in to create an adventure plan.</CardDescription>
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
      </FullPageImage>
    )
  }

  const { settingId } = await props.params
  let setting: Setting | null = null
  try {
    setting = (await readJsonFromS3(`settings/${settingId}/setting-data.json`)) as Setting
  } catch (error) {
    console.error("NewAdventurePlanPage: Failed to load setting for permission check:", error)
  }

  if (!setting) {
    return <div>Error loading setting.</div>
  }

  if (!canManageResource(userId, setting)) {
    return (
      <FullPageImage overlay>
        <div className="flex min-h-screen flex-col items-center justify-center p-8 md:p-16 relative z-10">
          <Card className="w-full max-w-md bg-black/50 backdrop-blur-sm border-white/20">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-display text-white">Access Denied</CardTitle>
              <CardDescription className="text-white/70">You do not have permission to create adventure plans in this setting.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </FullPageImage>
    )
  }

  return (
    <FullPageImage overlay>
      <div className="flex min-h-screen flex-col relative p-8 md:p-16 max-w-7xl mx-auto z-10">
        <NewAdventurePlanForm settingId={settingId} />
      </div>
    </FullPageImage>
  )
}
