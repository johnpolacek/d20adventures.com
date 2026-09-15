"use client"

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { type ReactNode, useEffect, useState } from "react"
import { textShadowSpreadLight } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import type { Adventure } from "@/types/adventure"
import ActiveAdventureCard from "./active-adventure-card"

type HomeAdventureData = { userId: string; activeAdventure: Adventure | null }

export default function HomeAdventure({ children }: { children: ReactNode }) {
  const { user, isLoaded, isSignedIn } = useUser()
  const userId = user?.id
  const [data, setData] = useState<HomeAdventureData | null>(null)

  useEffect(() => {
    setData(null)
    if (!isLoaded || !isSignedIn || !userId) return

    const controller = new AbortController()
    async function loadAdventure() {
      try {
        const response = await fetch("/api/user/active-adventure", { cache: "no-store", signal: controller.signal })
        if (!response.ok) throw new Error("Unable to load your active adventure")
        const result: HomeAdventureData = await response.json()
        if (!controller.signal.aborted && result.userId === userId) setData(result)
      } catch (error) {
        if (!controller.signal.aborted) console.error("[HomeAdventure]", error)
      }
    }
    void loadAdventure()
    return () => controller.abort()
  }, [isLoaded, isSignedIn, userId])

  // The public hero is prerendered; personalized data belongs only to this session.
  if (!isLoaded || !isSignedIn || data?.userId !== userId || !data?.activeAdventure) return children

  return (
    <div className="fade-in mt-32 sm:mt-48 w-screen relative z-10">
      <h2 className="text-4xl sm:text-6xl font-display text-center w-full mb-8" style={textShadowSpreadLight}>
        Welcome Back
      </h2>
      <ActiveAdventureCard adventure={data.activeAdventure} userId={data.userId} />
      <div className="flex justify-center items-center gap-8 py-12">
        <Button asChild variant="epic" size="sm" className="mt-2 text-xs relative z-10 bg-fuchsia-800">
          <Link href={user?.username ? `/player/${user.username}` : "/player"}>Your Player Page</Link>
        </Button>
        <Button asChild variant="epic" size="sm" className="mt-2 text-xs relative z-10">
          <Link href="/settings/realm-of-myr/play">Find New Adventure</Link>
        </Button>
      </div>
    </div>
  )
}
