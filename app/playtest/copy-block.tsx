"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

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
    <div className={cn("overflow-hidden rounded-lg border border-stage-gold/25 bg-black/70 text-left shadow-[inset_0_0_40px_#000c,0_8px_24px_#0008]", className)}>
      <div className="flex items-center justify-between gap-4 border-b border-stage-gold/15 bg-primary-800/60 py-2 pr-2 pl-4">
        <span className="font-sans text-[10px] font-medium tracking-[0.26em] text-stage-gold uppercase">{label}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-[3px] border px-2.5 py-1 font-sans text-[11px] tracking-wide transition-colors",
            copied ? "border-emerald-400/60 text-emerald-300" : "border-stage-line/25 text-stage-cream hover:border-stage-gold/60 hover:text-stage-gold"
          )}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap text-amber-100/95">{text}</pre>
    </div>
  )
}
