"use client"

import { SignInButton, SignUpButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"

// Signing up is joining: the page shows the playtester view to anyone signed in.
export function JoinButtons() {
  return (
    <div className="flex flex-col items-center gap-5">
      <SignUpButton mode="modal" forceRedirectUrl="/playtesters" signInForceRedirectUrl="/playtesters">
        <Button variant="epic" size="lg">
          Join the Playtest
        </Button>
      </SignUpButton>
      <SignInButton mode="modal" forceRedirectUrl="/playtesters" signUpForceRedirectUrl="/playtesters">
        <button
          type="button"
          className="cursor-pointer font-sans text-sm tracking-wide text-stage-cream/70 underline decoration-stage-gold/50 underline-offset-4 transition-colors hover:text-stage-gold"
        >
          Already a Playtester? Sign In
        </button>
      </SignInButton>
    </div>
  )
}
