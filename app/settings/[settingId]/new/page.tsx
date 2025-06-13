import { auth } from "@clerk/nextjs/server"
import { SignInButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { NewAdventurePlanForm } from "@/components/adventure-plans/new-adventure-plan-form"

export default async function NewAdventurePlanPage(props: { params: Promise<{ settingId: string }> }) {
  const { userId } = await auth()

  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 md:p-16">
        <Card className="w-full max-w-md bg-primary-800 border-primary-700 border-2 py-8">
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
    )
  }

  const { settingId } = await props.params

  return (
    <div className="flex min-h-screen flex-col relative p-8 md:p-16 max-w-7xl mx-auto">
      <NewAdventurePlanForm settingId={settingId} />
    </div>
  )
}
