"use client"
import { Check, Copy, Terminal } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface CopyOnelinerProps {
  children: string
  className?: string
  iconClassName?: string
}

export function CopyOneliner({ children, className, iconClassName }: CopyOnelinerProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy text: ", err)
    }
  }

  return (
    <div onClick={copyToClipboard} className={cn("relative text-sm py-3 px-3 flex items-center gap-2 rounded-md border text-left mx-auto -mt-4 font-mono", "cursor-pointer", className)}>
      <Terminal className={cn("w-4 h-4 opacity-50", iconClassName)} />
      <div className="flex-1">{children}</div>
      {copied ? <Check className="w-5 h-5 mr-1 scale-125 text-green-600" /> : <Copy className="w-5 h-5 mr-1 opacity-50" />}
    </div>
  )
}
