import { SignInButton } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import { PracticeAdventureSetup } from "@/components/adventure/practice-adventure-setup"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { canManageResource } from "@/lib/content-permissions"
import { listAndReadJsonFilesInS3Directory, readJsonFromS3 } from "@/lib/s3-utils"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { Setting } from "@/types/setting"

export default async function PracticeAdventurePage(props: {
  params: Promise<{
    settingId: string
    adventurePlanId: string
  }>
}) {
  const { userId } = await auth()
  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 md:p-16">
        <Card className="w-full max-w-md bg-primary-800 border-primary-700 border-2 py-8">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-display text-white">Sign In Required</CardTitle>
            <CardDescription className="text-white/70">You need to be signed in to start a practice run.</CardDescription>
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
  const plan = (await readJsonFromS3(`settings/${settingId}/${adventurePlanId}.json`)) as AdventurePlan
  if (!plan) {
    return <div className="p-8 text-red-400">Adventure plan not found.</div>
  }

  let setting: Setting | null = null
  try {
    setting = (await readJsonFromS3(`settings/${settingId}/setting-data.json`)) as Setting
  } catch {
    setting = null
  }

  const canManagePlan = canManageResource(userId, plan) || (setting !== null && canManageResource(userId, setting))
  if (!canManagePlan) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 md:p-16">
        <Card className="w-full max-w-md bg-primary-800 border-primary-700 border-2 py-8">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-display text-white">Access Denied</CardTitle>
            <CardDescription className="text-white/70">You do not have permission to start practice mode for this plan.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  let savedCharacters: Array<{ key: string; character: NonNullable<ReturnType<typeof toPCTemplate>> }> = []
  try {
    const files = await listAndReadJsonFilesInS3Directory(`characters/${userId}/`)
    savedCharacters = files
      .map((file) => ({
        key: file.key,
        character: toPCTemplate(file.data),
      }))
      .filter((item): item is { key: string; character: NonNullable<ReturnType<typeof toPCTemplate>> } => item.character !== null)
  } catch {
    savedCharacters = []
  }

  const minParty = plan.party?.[0] || 1
  const maxParty = plan.party?.[1] || 4

  return (
    <div className="flex min-h-screen flex-col relative p-8 md:p-16">
      <PracticeAdventureSetup
        settingId={settingId}
        adventurePlanId={adventurePlanId}
        adventureTitle={plan.title}
        minParty={minParty}
        maxParty={maxParty}
        premadeCharacters={plan.premadePlayerCharacters ?? []}
        savedCharacters={savedCharacters}
      />
    </div>
  )
}
