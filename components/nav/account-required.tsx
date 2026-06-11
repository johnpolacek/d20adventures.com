"use client"

import { SignInButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
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
        <h2 className="text-2xl font-semibold mb-4 text-amber-400 font-display">Account Required</h2>
        <p className="mb-6 text-white/80">Create an account or sign in to play this adventure.</p>
        <SignInButton mode="modal">
          <Button size="lg" variant="epic" onClick={handleSignInClick}>
            Sign in to Continue
          </Button>
        </SignInButton>
      </div>
    </div>
  )
}
