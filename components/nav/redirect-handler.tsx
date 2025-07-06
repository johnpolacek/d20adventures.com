"use client"

import { useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"

export default function RedirectHandler() {
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()

  console.log("[RedirectHandler] Component state:", JSON.stringify({ isSignedIn, isLoaded }, null, 2))

  useEffect(() => {
    console.log("[RedirectHandler] useEffect triggered:", JSON.stringify({ isSignedIn, isLoaded }, null, 2))

    if (isLoaded && isSignedIn) {
      console.log("[RedirectHandler] User is signed in, checking sessionStorage")

      const redirectUrl = sessionStorage.getItem("redirectAfterSignIn")
      console.log("[RedirectHandler] Found redirect URL in sessionStorage:", JSON.stringify(redirectUrl, null, 2))

      if (redirectUrl) {
        console.log("[RedirectHandler] Redirecting to:", JSON.stringify(redirectUrl, null, 2))
        sessionStorage.removeItem("redirectAfterSignIn")

        // Verify removal
        const afterRemoval = sessionStorage.getItem("redirectAfterSignIn")
        console.log("[RedirectHandler] After removal, sessionStorage contains:", JSON.stringify(afterRemoval, null, 2))

        router.push(redirectUrl)
      } else {
        console.log("[RedirectHandler] No redirect URL found in sessionStorage")
      }
    } else {
      console.log("[RedirectHandler] User not signed in or not loaded yet:", JSON.stringify({ isSignedIn, isLoaded }, null, 2))
    }
  }, [isLoaded, isSignedIn, router])

  return null
}
