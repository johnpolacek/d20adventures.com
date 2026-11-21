"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@d20/ui/button"
import { Swap } from "@d20/ui/presence"

// A command or prompt in a dark inset well, with its own Copy button.
export function CopyBlock({ label, text, className }: { label: string; text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("[CopyBlock]", error)
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-accent/25 bg-black/70 text-left shadow-[inset_0_0_40px_#000c,0_8px_24px_#0008]", className)}>
      <div className="flex items-center justify-between gap-4 border-b border-accent/15 bg-primary-800/60 py-2 pr-2 pl-4">
        <span className="font-sans text-4xs font-medium tracking-label text-accent uppercase">{label}</span>
        <Button
          variant="plain"
          type="button"
          onClick={copy}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-hud border px-2.5 py-1 font-sans text-3xs tracking-wide transition-[color,border-color,scale] duration-150 ease-snap active:scale-95",
            copied ? "border-emerald-400/60 text-emerald-300" : "border-foreground/25 text-foreground hover:border-accent/60 hover:text-accent"
          )}
        >
          <Swap id={copied ? "copied" : "copy"} asChild motion="pop">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Swap>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap text-accent-100/95">{text}</pre>
    </div>
  )
}
