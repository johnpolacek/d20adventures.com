import { Heading } from "@d20/ui/typography/heading"
import RedirectHandler from "@/components/nav/redirect-handler"
import { textShadowSpreadLight } from "@d20/ui/typography/styles"
import Image from "@d20/ui/native-image"
import HomeAdventure from "@/components/views/home-adventure"
import PlaytesterCta from "@/components/views/playtester-cta"

export default function HomePage() {
  return (
    <>
      <RedirectHandler />
      <div className="flex min-h-[max(100vh,100vw)] lg:min-h-screen flex-col relative">
        <HomeAdventure>
          <Heading variant="h1" as="h2" className="text-4xl sm:text-6xl text-center w-full mt-20 sm:mt-36 fade-in delay-100 relative z-10" style={textShadowSpreadLight}>
            <span className="block sm:inline">EXpeRienCe</span> <span className="inline-block scale-75 sm:scale-90 -mx-2 sm:mx-0">tHe</span> Thrill
          </Heading>
          <div className="flex flex-col items-center justify-center absolute bottom-[calc(7.5rem+2vh)] md:bottom-[max(10vh,6rem)] w-full flex justify-center z-10">
            <Heading variant="h4" as="h2" className="text-lg sm:text-2xl text-center w-full fade-in delay-[180ms] relative z-10" style={textShadowSpreadLight}>
              Of tHe
            </Heading>
            <Heading variant="h1" as="h2" className="text-6xl sm:text-9xl text-center w-full fade-in delay-[260ms] relative z-10 -mt-1 sm:-mt-4 mb-2 sm:mb-0" style={textShadowSpreadLight}>
              D20
            </Heading>

            <PlaytesterCta />
          </div>
        </HomeAdventure>
        <Image className="object-cover fade-in" fill={true} src="/images/app/backgrounds/d20-hero.webp" alt="D20" />
      </div>
    </>
  )
}
