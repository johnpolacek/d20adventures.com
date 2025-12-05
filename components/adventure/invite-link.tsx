"use client"

import { Button } from "@/components/ui/button"
import { Check, Copy, Share2 } from "lucide-react"
import React, { useState } from "react"
import { toast } from "sonner"

interface InviteLinkProps {
  inviteLink: string
}

export function InviteLink({ inviteLink }: InviteLinkProps) {
  const [isCopied, setIsCopied] = useState(false)

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setIsCopied(true)
      toast.success("Invite link copied to clipboard!")
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      toast.error("Failed to copy link")

      console.error("Copy failed:", error)
    }
  }

  return (
    <div className="mb-6 border border-white/30 bg-primary-800/70 rounded-lg pt-2 pb-6 px-4">
      <p className="text-sm text-amber-400 pt-3 pb-2 font-display font-bold text-xl text-center">Invite Players</p>
      <div className="flex items-center gap-2 bg-black rounded-lg p-3 max-w-md mx-auto">
        <Share2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <code className="flex-1 text-xs text-gray-300 truncate">{inviteLink}</code>
        <Button size="sm" variant="outline" onClick={handleCopyInvite} className="flex-shrink-0 h-7 px-2">
          {isCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  )
}
