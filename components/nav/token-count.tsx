"use client"

import { Heading } from "@d20/ui/typography/heading"
import { Sparkle } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@d20/ui/hover-card"
import { formatNumberToK } from "@/lib/utils"

interface TokenCountProps {
  tokensRemaining: number
}

export default function TokenCount({ tokensRemaining }: TokenCountProps) {
  return (
    <HoverCard>
      <HoverCardTrigger render={<div id="tokenCount" className="flex items-center gap-0.5 text-3xs font-mono font-bold bg-action-900 text-white py-0.5 px-1.5 rounded cursor-help transition-colors hover:bg-action-800" />}>
          <Sparkle className="w-3 h-3 scale-75" />
          <span>{formatNumberToK(tokensRemaining)}</span>
        </HoverCardTrigger>
      <HoverCardContent align="end" className="bg-gradient-to-tl from-action-950 to-action-900 text-white">
        <div className="space-y-2">
          <Heading variant="h4">Tokens Remaining</Heading>
          <p className="text-sm">
            You have <span className="font-mono font-semibold">{Math.round(tokensRemaining).toLocaleString()}</span> tokens for D20 gameplay. Instead of paying a monthly fee, simply buy more tokens as
            needed.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
