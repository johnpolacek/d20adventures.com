import { Heading } from "@d20/ui/typography/heading"
import { currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import PlayerSetUsernameForm from "@/components/forms/player-set-username-form"
import FullPageImage from "@/components/layout/fullpage-image"
import { textShadow } from "@d20/ui/typography/styles"

export default async function PlayerPage() {
  const user = await currentUser()

  if (!user) {
    redirect("/sign-in")
  }

  if (user.username) {
    redirect(`/player/${user.username}`)
  }

  return (
    <FullPageImage>
      <div className="relative z-10 p-12 mt-12 max-w-lg mx-auto w-full">
        <Heading variant="h2" className="text-center mb-8" style={textShadow}>
          Choose a Username
        </Heading>
        <PlayerSetUsernameForm />
      </div>
    </FullPageImage>
  )
}
