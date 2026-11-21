"use client"

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs"
import { User as UserIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@d20/ui/button"
import { Presence, Swap } from "@d20/ui/presence"
import { useTokens } from "@/lib/context/TokenContext"
import TokenCount from "./token-count"

/** The header's account corner: Sign In and Sign Up, or the player's tokens and menu. `signedOut` false leaves out the two buttons. */
export default function AuthButtons({ signedOut = true }: { signedOut?: boolean }) {
  const { tokensRemaining } = useTokens()
  const { user, isSignedIn } = useUser()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!signedOut && (!mounted || !isSignedIn)) return null

  // Prevent hydration mismatch by showing a neutral state until mounted
  if (!mounted) {
    return (
      <div className="flex items-center overflow-hidden">
        <div className="flex gap-2 sm:gap-4 whitespace-nowrap sm:px-2">
          {/* Placeholder buttons that match the signed-out state */}
          <Button className="text-3xs sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case opacity-0" variant="emboss">
            Sign In
          </Button>
          <Button className="text-3xs sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case opacity-0" variant="emboss">
            Sign Up
          </Button>
        </div>
      </div>
    )
  }

  // The count stays up while it refreshes, so it does not blink on every poll.
  const hasTokens = typeof tokensRemaining === "number"

  return (
    <div className="flex items-center overflow-hidden">
      <Swap id={isSignedIn ? "in" : "out"} asChild>
        {isSignedIn ? (
          <div className="flex items-center gap-1.5 saturate-50">
            <div className="flex items-center gap-0.5 text-xs sm:text-sm text-white/60">
              <Presence show={hasTokens} motion="pop">
                {hasTokens && <TokenCount tokensRemaining={tokensRemaining} />}
              </Presence>
            </div>
            <UserButton userProfileUrl="/account">
              <UserButton.MenuItems>
                <UserButton.Link label="Player Page" href={user?.username ? `/player/${user.username}` : "/player"} labelIcon={<UserIcon className="size-4" />} />
              </UserButton.MenuItems>
            </UserButton>
          </div>
        ) : (
          <div className="flex gap-2 sm:gap-4 whitespace-nowrap sm:px-2">
            <SignInButton mode="modal">
              <Button id="signinButton" className="text-3xs sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case" variant="emboss">
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button id="signupButton" className="text-3xs sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case" variant="emboss">
                Sign Up
              </Button>
            </SignUpButton>
          </div>
        )}
      </Swap>
    </div>
  )
}
