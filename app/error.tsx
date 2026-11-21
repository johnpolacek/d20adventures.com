"use client"

import { Heading } from "@d20/ui/typography/heading"
import Link from "next/link"
import { useEffect } from "react"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { textShadowSpreadLight } from "@d20/ui/typography/styles"
import { served } from "@/lib/served"

// A page that threw. It wears the 404's look and offers another try.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-16 text-center">
      <Image className="object-cover opacity-30 blur-[2px] scale-105" fill={true} src={served("/images/app/backgrounds/d20-hero.webp")} alt="" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.85)_70%,#000_100%)]" />

      <div className="relative z-10 flex flex-col items-center fade-in">
        <p className="font-display text-sm sm:text-base tracking-label text-accent-300/90 uppercase">Critical Miss</p>
        <Heading variant="h2" as="h1" className="mt-2" style={textShadowSpreadLight}>
          Something Went Wrong
        </Heading>
        <p className="mt-4 max-w-md text-lg text-white/70 text-balance">This page failed to load. Try again, or head home.</p>

        <div className="mt-10 flex gap-4">
          <Button variant="outline" size="lg" render={<Link href="/" />}>
            Return Home
          </Button>
          <Button variant="epic" size="lg" onClick={reset}>
            Try Again
          </Button>
        </div>
      </div>
    </div>
  )
}
