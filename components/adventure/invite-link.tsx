"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Button } from "@d20/ui/button"
import { Input } from "@d20/ui/input"
import { Swap } from "@d20/ui/presence"
import { siteLabel } from "@d20/ui/site"
import { toast } from "@d20/ui/toast"
import { cn } from "@/lib/utils"

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
    <section className="rounded-xl border border-white/10 bg-black/45 p-4 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] sm:p-5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className={siteLabel}>Invite Players</div>
        <span className="font-sans text-2xs text-white/50">Share link to join the table</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/50 py-1 pr-1 pl-3 transition-colors focus-within:border-primary-400/70">
        <Input
          plain
          readOnly
          value={inviteLink}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Adventure invite link"
          className="min-w-0 flex-1 bg-transparent font-sans text-xs text-white/85 outline-none"
        />
        <Button
          size="xs"
          variant="outline"
          onClick={handleCopyInvite}
          className={cn(
            "shrink-0 gap-1.5 px-3",
            isCopied && "border-roll-success/45 bg-roll-success/20 text-roll-success"
          )}
        >
          <Swap id={isCopied ? "copied" : "copy"} motion="pop" as="span" className="inline-flex items-center gap-1.5">
            {isCopied ? (
              <>
                <Check aria-hidden="true" className="size-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy aria-hidden="true" className="size-3" />
                <span>Copy</span>
              </>
            )}
          </Swap>
        </Button>
      </div>
    </section>
  )
}
