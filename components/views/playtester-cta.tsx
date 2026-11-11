"use client"

import { SignUpButton, useUser } from "@clerk/nextjs"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const className = "fade-in delay-[2600ms] mt-2 relative z-10"

export default function PlaytesterCta() {
  const { isSignedIn, isLoaded } = useUser()

  if (isLoaded && !isSignedIn) {
    return (
      <SignUpButton mode="modal" forceRedirectUrl="/playtesters" signInForceRedirectUrl="/playtesters">
        <Button variant="epic" size="lg" className={className}>
          Become a Playtester
        </Button>
      </SignUpButton>
    )
  }

  return (
    <Button asChild variant="epic" size="lg" className={className}>
      <Link href="/playtesters">Become a Playtester</Link>
    </Button>
  )
}
