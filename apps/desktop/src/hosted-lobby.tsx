import { useState } from "react"
import { textShadow } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { siteCard, siteField, siteLabel, siteOutline } from "@/components/ui/site"
import { cn } from "@/lib/utils"
import type { HostedSummary } from "../../../lib/host/server"

// A hosted game before it starts: the invite link for friends, who has joined, and Start.
export function HostedLobby(props: { summary: HostedSummary; gm: string; busy: boolean; onStart: () => void; onHome: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    void navigator.clipboard.writeText(props.summary.invite).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 font-serif text-white">
      <section className={cn(siteCard, "w-[min(34rem,92vw)] p-8 text-left backdrop-blur-xl")}>
        <div className={siteLabel}>Hosting</div>
        <h1 className="mt-2 font-display text-4xl font-bold text-amber-300" style={textShadow}>
          {props.summary.title}
        </h1>
        <div className={cn(siteLabel, "mt-7 mb-2")}>Invite link</div>
        <div className="flex gap-2">
          <input readOnly value={props.summary.invite} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" className={cn(siteField, "flex-1 text-sm")} />
          <button type="button" className={cn(siteOutline, "px-4 text-sm")} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className={cn(siteLabel, "mt-7 mb-2")}>At the table · {props.summary.party.length}</div>
        <ul className="space-y-1 font-display text-lg">
          {props.summary.party.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <div className="mt-8 flex items-center gap-3">
          <span className="font-mono text-xs text-white/60">{props.gm}</span>
          <div className="flex-1" />
          <button type="button" className={cn(siteOutline, "px-4 py-2 text-sm")} onClick={props.onHome}>
            Home
          </button>
          <Button variant="epic" className="text-xl" disabled={props.busy} onClick={props.onStart}>
            Start
          </Button>
        </div>
      </section>
    </div>
  )
}
