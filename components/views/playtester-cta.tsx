"use client"

import { SignUpButton, useUser } from "@clerk/nextjs"
import Link from "next/link"
import { Button } from "@d20/ui/button"

const className = "fade-in delay-[2600ms] mt-2 relative z-10"

export default function PlaytesterCta() {
  const { isSignedIn, isLoaded } = useUser()

  if (isLoaded && !isSignedIn) {
    return (
      <SignUpButton mode="modal" forceRedirectUrl="/playtest" signInForceRedirectUrl="/playtest">
        <Button variant="epic" size="lg" className={className}>
          Become a Playtester
        </Button>
      </SignUpButton>
    )
  }

  return (
    <Button variant="epic" size="lg" className={className} render={<Link href="/playtest" />}>Become a Playtester</Button>
  )
}
