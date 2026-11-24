"use client"

import { SignUpButton, useUser } from "@clerk/nextjs"
import Link from "next/link"
import { Button } from "@d20/ui/button"
import { markArrival } from "@/app/playtest/arrival"
import { Leaving } from "@/app/playtest/leaving"

export default function PlaytesterCta() {
  const { isSignedIn, isLoaded } = useUser()

  // The fade is on a wrapper, so it plays once and the button keeps its own hover and press.
  // A press marks the visit, so the playtest page greets it by turning Become into You’re.
  return (
    <div className="fade-in delay-[340ms] mt-2 relative z-10 flex" onClickCapture={markArrival}>
      {isLoaded && !isSignedIn ? (
        <SignUpButton mode="modal" forceRedirectUrl="/playtest" signInForceRedirectUrl="/playtest">
          <Button variant="epic" size="lg">
            Become a Playtester
          </Button>
        </SignUpButton>
      ) : (
        <Button variant="epic" size="lg" render={<Link href="/playtest" />}>
          Become a Playtester
          <Leaving />
        </Button>
      )}
    </div>
  )
}
