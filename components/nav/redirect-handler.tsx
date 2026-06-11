"use client"

import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function RedirectHandler() {
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const redirectUrl = sessionStorage.getItem("redirectAfterSignIn")

      if (redirectUrl) {
        sessionStorage.removeItem("redirectAfterSignIn")
        router.push(redirectUrl)
      }
    }
  }, [isLoaded, isSignedIn, router])

  return null
}
