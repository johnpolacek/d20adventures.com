"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import type { StoryviewAutoStatus } from "@/types/turn-audio"

// One-line auto-narration pause notice. The short player gets a personal nudge
// with a top-up link; everyone else sees who the group is waiting on. Never
// exposes anyone's balance.
export default function StoryviewPausedNotice({ paused, className }: { paused: NonNullable<StoryviewAutoStatus["paused"]>; className?: string }) {
  const you = paused.shortUsers.find((user) => user.isYou)
  const others = paused.shortUsers.filter((user) => !user.isYou)

  if (you) {
    return (
      <p className={cn("text-xs text-amber-300/90", className)}>
        <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />
        Auto-narration is paused — you need more D20 tokens to cover your share (~{Math.ceil(paused.estimatedShare)}).{" "}
        <Link href="/pay" className="underline decoration-amber-400/60 underline-offset-2 hover:text-amber-200">
          Get tokens
        </Link>
      </p>
    )
  }

  const names = others.map((user) => user.name).join(", ")
  return (
    <p className={cn("text-xs text-amber-300/90", className)}>
      <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />
      Auto-narration paused — waiting on {names || "a player"} to add tokens.
    </p>
  )
}
