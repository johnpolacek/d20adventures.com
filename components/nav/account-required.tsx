"use client"

import { SignInButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"

interface AccountRequiredProps {
  redirectUrl?: string
}

export default function AccountRequired({ redirectUrl }: AccountRequiredProps) {
  const handleSignInClick = () => {
    console.log("[AccountRequired] Button clicked, redirectUrl:", JSON.stringify(redirectUrl, null, 2))

    if (redirectUrl && typeof window !== "undefined") {
      console.log("[AccountRequired] Storing redirect URL in sessionStorage:", JSON.stringify(redirectUrl, null, 2))
      sessionStorage.setItem("redirectAfterSignIn", redirectUrl)

      // Verify it was stored
      const stored = sessionStorage.getItem("redirectAfterSignIn")
      console.log("[AccountRequired] Verified stored URL:", JSON.stringify(stored, null, 2))
    } else {
      console.log("[AccountRequired] No redirectUrl provided or window not available:", JSON.stringify({ redirectUrl, hasWindow: typeof window !== "undefined" }, null, 2))
    }
  }

  return (
    <div className="flex items-center justify-center bg-black/60 relative z-10">
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
