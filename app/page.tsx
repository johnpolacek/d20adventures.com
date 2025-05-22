import { textShadowSpread } from "@/components/typography/styles"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function HomePage() {
  return (
    <div className="flex min-h-screen flex-col relative">
      <h2 className="text-6xl font-display text-center w-full mt-36 fade-in delay-[2s] relative z-10" style={textShadowSpread}>
        EXpeRienCe <span className="inline-block scale-90">tHe</span> Thrill
      </h2>
      <div className="flex flex-col items-center justify-center relative z-10">
        <h2 className="text-2xl font-bold font-display text-center w-full mt-72 fade-in delay-[2200ms] relative z-10" style={textShadowSpread}>
          Of tHe
        </h2>
        <h2 className="text-9xl font-display text-center w-full fade-in delay-[2400ms] relative z-10 -mt-4" style={textShadowSpread}>
          D20
        </h2>
        <Link href="/realm-of-myr/the-midnight-summons">
          <Button asChild variant="epic" size="lg" className="mt-2 fade-in delay-[2600ms] relative z-10">
            Quick Start
          </Button>
        </Link>
      </div>
      <Image className="object-cover fade-in" fill={true} src="/images/app/backgrounds/d20-hero.png" alt="D20" />
    </div>
  )
}
