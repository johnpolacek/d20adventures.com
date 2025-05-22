"use client"

import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"

export default function AuthButtons() {
  return (
    <div className={`flex items-center overflow-hidden transition-[width] duration-300 ease-in-out`}>
      <SignedOut>
        <div className="flex gap-2 sm:gap-4 whitespace-nowrap sm:px-2">
          <SignInButton mode="modal">
            <Button id="signinButton" className="text-[11px] sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case" variant="emboss">
              SigN In
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button id="signinButton" className="text-[11px] sm:text-sm py-1 px-2 sm:px-4 my-2 tracking-tight sm:tracking-normal font-display normal-case" variant="emboss">
              SigN Up
            </Button>
          </SignUpButton>
        </div>
      </SignedOut>
      <SignedIn>
        <div className="flex items-center saturate-50">
          <UserButton userProfileUrl="/account" />
        </div>
      </SignedIn>
    </div>
  )
}
