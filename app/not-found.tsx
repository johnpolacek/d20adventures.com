import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { textShadowSpreadLight } from "@d20/ui/typography/styles"

export const metadata: Metadata = {
  title: "Page Not Found",
}

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-16 text-center">
      <Image className="object-cover opacity-30 blur-[2px] scale-105" fill={true} src="/images/app/backgrounds/d20-hero.webp" alt="" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.85)_70%,#000_100%)]" />

      <div className="relative z-10 flex flex-col items-center fade-in">
        <div className="flex items-center gap-2 sm:gap-4 font-display text-8xl sm:text-[10rem] leading-none text-blue-100" style={textShadowSpreadLight}>
          <span>4</span>
          <Image className="w-20 h-20 sm:w-36 sm:h-36 -rotate-12 drop-shadow-[0_0_24px_rgba(96,165,250,0.6)]" width={144} height={144} src="/images/d20-white.svg" alt="" />
          <span>4</span>
        </div>

        <p className="mt-8 font-display text-sm sm:text-base tracking-[0.3em] text-accent-300/90 uppercase">Natural 1</p>
        <h1 className="mt-2 font-display text-3xl sm:text-5xl" style={textShadowSpreadLight}>
          Lost in the Wilds
        </h1>
        <p className="mt-4 max-w-md text-lg text-white/70 text-balance">This path leads nowhere. The page you seek is on no map we know.</p>

        <Button variant="epic" size="lg" className="mt-10" render={<Link href="/" />}>
          Return Home
        </Button>
      </div>
    </div>
  )
}
