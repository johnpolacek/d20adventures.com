import { textShadowSpreadLight } from "@/components/typography/styles"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import ActiveAdventureCard from "@/components/views/active-adventure-card"
import { getActiveAdventureForUser } from "@/app/_actions/adventure"
import { auth } from "@clerk/nextjs/server"
import RedirectHandler from "@/components/nav/redirect-handler"
import { currentUser } from "@clerk/nextjs/server"

export default async function HomePage() {
  const activeAdventure = await getActiveAdventureForUser()
  const { userId } = await auth()
  const user = await currentUser()

  return (
    <>
      <RedirectHandler />
      <div className="flex min-h-[max(100vh,100vw)] lg:min-h-screen flex-col relative">
        {activeAdventure && user ? (
          <div className="fade-in delay-[2600ms] mt-32 sm:mt-48 w-screen relative z-10">
            <h2 className="text-4xl sm:text-6xl font-display text-center w-full fade-in delay-[2s] mb-8" style={textShadowSpreadLight}>
              Welcome Back
            </h2>
            <ActiveAdventureCard adventure={activeAdventure} userId={userId} />
            <div className="flex justify-center items-center gap-8 py-12">
              <Link href={`/player/${user.username}`}>
                <Button asChild variant="epic" size="sm" className="mt-2 text-xs relative z-10 bg-fuchsia-800">
                  Your Player Page
                </Button>
              </Link>
              <Link href="/settings/realm-of-myr/play">
                <Button asChild variant="epic" size="sm" className="mt-2 text-xs relative z-10">
                  Find New Adventure
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-4xl sm:text-6xl font-display text-center w-full mt-20 sm:mt-36 fade-in delay-[2s] relative z-10" style={textShadowSpreadLight}>
              <span className="block sm:inline">EXpeRienCe</span> <span className="inline-block scale-75 sm:scale-90 -mx-2 sm:mx-0">tHe</span> Thrill
            </h2>
            <div className="flex flex-col items-center justify-center absolute bottom-[6vh] sm:bottom-[10vh] w-full flex justify-center z-10">
              <h2 className="text-lg sm:text-2xl font-bold font-display text-center w-full fade-in delay-[2200ms] relative z-10" style={textShadowSpreadLight}>
                Of tHe
              </h2>
              <h2 className="text-6xl sm:text-9xl font-display text-center w-full fade-in delay-[2400ms] relative z-10 -mt-1 sm:-mt-4 mb-2 sm:mb-0" style={textShadowSpreadLight}>
                D20
              </h2>

              <Link className="fade-in delay-[2600ms]" href="/settings/realm-of-myr/play">
                <Button asChild variant="epic" size="lg" className="mt-2 relative z-10">
                  Quick Start
                </Button>
              </Link>
            </div>
          </>
        )}
        <Image className="object-cover fade-in" fill={true} src="/images/app/backgrounds/d20-hero.png" alt="D20" />
      </div>
    </>
  )
}
