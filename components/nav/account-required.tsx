"use client"

import { Heading } from "@d20/ui/typography/heading"
import { SignInButton } from "@clerk/nextjs"
import { Button } from "@d20/ui/button"
import { cn } from "@/lib/utils"

interface AccountRequiredProps {
  redirectUrl?: string
  className?: string
}

export default function AccountRequired({ redirectUrl, className }: AccountRequiredProps) {
  const handleSignInClick = () => {
    if (redirectUrl && typeof window !== "undefined") {
      sessionStorage.setItem("redirectAfterSignIn", redirectUrl)
    }
  }

  return (
    <div className={cn("flex items-center justify-center relative z-10", className)}>
      <div className="bg-black/80 rounded-lg p-8 text-center max-w-md border border-white/20 ring-4 ring-black/50">
        <Heading variant="h2" className="mb-6">Account Required</Heading>
        <SignInButton mode="modal">
          <Button size="lg" variant="epic" onClick={handleSignInClick}>
            Sign in to Continue
          </Button>
        </SignInButton>
      </div>
    </div>
  )
}
