import { auth } from "@clerk/nextjs/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SignInButton } from "@clerk/nextjs"
import Link from "next/link"
import { textShadowSpreadLight } from "@/components/typography/styles"
import FullPageImage from "@/components/layout/fullpage-image"

export default async function CreatePage() {
  const { userId } = await auth()

  if (!userId) {
    return (
      <FullPageImage overlay>
        <div className="container max-w-2xl mx-auto py-16 relative z-10">
          <Card>
            <CardContent className="flex flex-col items-center gap-6 py-16">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold">Sign in to Create</h2>
                <p className="text-muted-foreground">Create an account or sign in to start creating your own settings and adventures</p>
              </div>
              <SignInButton mode="modal">
                <Button size="lg">Sign in to Continue</Button>
              </SignInButton>
            </CardContent>
          </Card>
        </div>
      </FullPageImage>
    )
  }

  return (
    <FullPageImage overlay>
      <div className="container max-w-5xl mx-auto py-16 relative z-10">
        <h1 className="text-amber-300 text-4xl sm:text-5xl font-display text-center my-12" style={textShadowSpreadLight}>
          Create Your World
        </h1>

        <div className="grid md:grid-cols-2 gap-8">
          <Card className="p-6 bg-black/50 backdrop-blur-sm border-white/20">
            <CardContent className="space-y-4 flex flex-col items-center">
              <h2 className="text-2xl font-semibold text-amber-300 font-display">Create a Setting</h2>
              <p className="text-white/80 text-center">Build a rich world with unique locations, technology levels, and magical elements. Your setting will be the foundation for adventures.</p>
              <div className="pt-4">
                <Link href="/settings/new">
                  <Button variant="epic" size="sm" className="text-sm">
                    Create Setting
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="p-6 bg-black/50 backdrop-blur-sm border-white/20">
            <CardContent className="space-y-4 flex flex-col items-center">
              <h2 className="text-2xl font-semibold text-amber-300 font-display">Create an Adventure</h2>
              <p className="text-white/80 text-center">Design an epic adventure with encounters, NPCs, and a compelling narrative. Choose an existing setting or create a new one.</p>
              <div className="pt-4">
                <Link href="/create/adventure">
                  <Button variant="epic" size="sm" className="text-sm">
                    Create Adventure
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </FullPageImage>
  )
}
