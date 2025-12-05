import PlayerSetUsernameForm from "@/components/forms/player-set-username-form"
import FullPageImage from "@/components/layout/fullpage-image"
import { textShadow } from "@/components/typography/styles"
import { currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

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
        <h2 style={textShadow} className="text-2xl sm:text-4xl text-center font-bold text-amber-400 font-display mb-8">
          Choose a Username
        </h2>
        <PlayerSetUsernameForm userId={user.id} />
      </div>
    </FullPageImage>
  )
}
