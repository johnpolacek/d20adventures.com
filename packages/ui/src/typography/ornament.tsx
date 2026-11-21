import { cn } from "../utils"

/** A scene break: hairlines either side of a small star. */
export function Ornament({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex items-center justify-center gap-3 text-accent-400/70", className)}>
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-accent-400/60" />
      <span className="text-sm leading-none">✦</span>
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-accent-400/60" />
    </div>
  )
}
