"use client"

import { Sparkle } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { formatNumberToK } from "@/lib/utils"

interface TokenCountProps {
  tokensRemaining: number
}

export default function TokenCount({ tokensRemaining }: TokenCountProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div id="tokenCount" className="flex items-center gap-0.5 text-xxs font-mono font-bold bg-blue-900 text-white py-0.5 px-1.5 rounded cursor-help transition-colors hover:bg-blue-800">
          <Sparkle className="w-3 h-3 scale-75" />
          <span>{formatNumberToK(tokensRemaining)}</span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="bg-gradient-to-tl from-blue-950 to-blue-900 text-white">
        <div className="space-y-2">
          <h4 className="font-display font-bold">Tokens Remaining</h4>
          <p className="text-sm">
            You have <span className="font-mono font-semibold">{tokensRemaining.toLocaleString()}</span> tokens for D20 gameplay. Instead of paying a monthly fee, simply buy more tokens as needed.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
