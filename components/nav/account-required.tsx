"use client"

import { SignInButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"

export default function AccountRequired() {
  return (
    <div className="flex items-center justify-center bg-black/60 relative z-10">
      <div className="bg-black/80 rounded-lg p-8 text-center max-w-md border border-white/20 ring-4 ring-black/50">
        <h2 className="text-2xl font-semibold mb-4 text-amber-400 font-display">Account Required</h2>
        <p className="mb-6 text-white/80">Create an account or sign in to play this adventure.</p>
        <SignInButton mode="modal">
          <Button size="lg" variant="epic">
            Sign in to Continue
          </Button>
        </SignInButton>
      </div>
    </div>
  )
}
