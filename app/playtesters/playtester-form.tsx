"use client"

import { SignInButton, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { subscribe } from "@/app/_actions/mailing-list"
import { Button } from "@/components/ui/button"

export function PlaytesterForm() {
  const router = useRouter()
  const { user, isSignedIn, isLoaded } = useUser()
  const [busy, setBusy] = useState(false)

  if (!isLoaded) return null

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal" forceRedirectUrl="/playtesters">
        <Button variant="epic" size="lg">
          Sign In to Join
        </Button>
      </SignInButton>
    )
  }

  const join = async () => {
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress
    if (!email) return toast.error("Your account has no email address.")
    setBusy(true)
    const result = await subscribe({ userId: user.id, email, name: user.fullName || user.firstName || null })
    setBusy(false)
    if (!result.success) return toast.error("Could not sign you up. Try again.")
    router.refresh()
  }

  return (
    <Button variant="epic" size="lg" onClick={join} disabled={busy}>
      Join the Playtest
    </Button>
  )
}
