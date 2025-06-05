"use client"

import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { useTokens } from "@/lib/context/TokenContext"
import TokenCount from "./token-count"
import { useState, useEffect } from "react"

export default function AuthButtons() {
  const { tokensRemaining, isLoading: isLoadingTokens } = useTokens()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent hydration mismatch by showing a neutral state until mounted
  if (!mounted) {
    return (
      <div className={`flex items-center overflow-hidden transition-[width] duration-300 ease-in-out`}>
        <div className="flex gap-2 sm:gap-4 whitespace-nowrap sm:px-2">
          {/* Placeholder buttons that match the signed-out state */}
          <Button className="text-[11px] sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case opacity-0" variant="emboss">
            Sign In
          </Button>
          <Button className="text-[11px] sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case opacity-0" variant="emboss">
            Sign Up
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center overflow-hidden transition-[width] duration-300 ease-in-out`}>
      <SignedOut>
        <div className="flex gap-2 sm:gap-4 whitespace-nowrap sm:px-2">
          <SignInButton mode="modal">
            <Button id="signinButton" className="text-[11px] sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case" variant="emboss">
              Sign In
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button id="signupButton" className="text-[11px] sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case" variant="emboss">
              Sign Up
            </Button>
          </SignUpButton>
        </div>
      </SignedOut>
      <SignedIn>
        <div className="flex items-center gap-1.5 saturate-50">
          <div className="flex items-center gap-0.5 text-xs sm:text-sm text-muted-foreground">
            {!isLoadingTokens && typeof tokensRemaining === "number" && <TokenCount tokensRemaining={tokensRemaining} />}
          </div>
          <UserButton userProfileUrl="/account" />
        </div>
      </SignedIn>
    </div>
  )
}
