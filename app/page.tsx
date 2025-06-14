import { textShadowSpread } from "@/components/typography/styles"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import ActiveAdventureCard from "@/components/views/active-adventure-card"
import { getActiveAdventureForUser } from "@/app/_actions/adventure"
import { auth } from "@clerk/nextjs/server"

export default async function HomePage() {
  const activeAdventure = await getActiveAdventureForUser()
  const { userId } = await auth()

  return (
    <div className="flex min-h-[max(100vh,100vw)] lg:min-h-screen flex-col relative">
      {activeAdventure ? (
        <div className="fade-in delay-[2600ms] mt-32 sm:mt-48 w-screen relative z-10">
          <h2 className="text-4xl sm:text-6xl font-display text-center w-full fade-in delay-[2s] mb-12" style={textShadowSpread}>
            Welcome Back
          </h2>
          <ActiveAdventureCard adventure={activeAdventure} userId={userId} />
          <div className="text-center my-8">
            <Link href="/settings/realm-of-myr/play">
              <Button asChild variant="outline" size="lg" className="mt-2 relative z-10">
                Start New Adventure
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-4xl sm:text-6xl font-display text-center w-full mt-20 sm:mt-36 fade-in delay-[2s] relative z-10" style={textShadowSpread}>
            <span className="block sm:inline">EXpeRienCe</span> <span className="inline-block scale-75 sm:scale-90 -mx-2 sm:mx-0">tHe</span> Thrill
          </h2>
          <div className="flex flex-col items-center justify-center absolute bottom-[6vh] sm:bottom-[10vh] w-full flex justify-center z-10">
            <h2 className="text-lg sm:text-2xl font-bold font-display text-center w-full fade-in delay-[2200ms] relative z-10" style={textShadowSpread}>
              Of tHe
            </h2>
            <h2 className="text-6xl sm:text-9xl font-display text-center w-full fade-in delay-[2400ms] relative z-10 -mt-1 sm:-mt-4 mb-2 sm:mb-0" style={textShadowSpread}>
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
  )
}
