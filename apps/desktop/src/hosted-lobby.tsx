import { useState } from "react"
import { eyebrow, Pill, panel } from "@/components/stage/hud"
import { Button } from "@/components/ui/button"
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
    <div className="absolute inset-0 z-40 grid place-items-center bg-stage-ink/60">
      <section className={cn(panel, "w-[min(560px,92vw)] p-8 text-left")}>
        <div className={eyebrow}>Hosting</div>
        <h1 className="mt-2 font-display text-4xl">{props.summary.title}</h1>
        <div className={cn(eyebrow, "mt-7 mb-2")}>Invite link</div>
        <div className="flex gap-2">
          <input
            readOnly
            value={props.summary.invite}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Invite link"
            className="min-w-0 flex-1 rounded border border-stage-brass/60 bg-stage-ink/60 px-3 py-2 text-sm"
          />
          <Pill onClick={copy}>{copied ? "Copied" : "Copy"}</Pill>
        </div>
        <div className={cn(eyebrow, "mt-7 mb-2")}>At the table · {props.summary.party.length}</div>
        <ul className="space-y-1 font-serif text-lg">
          {props.summary.party.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <div className="mt-8 flex items-center gap-3">
          <span className="text-xs text-stage-muted">{props.gm}</span>
          <div className="flex-1" />
          <Pill onClick={props.onHome}>Home</Pill>
          <Button variant="epic" className="text-xl" disabled={props.busy} onClick={props.onStart}>
            Start
          </Button>
        </div>
      </section>
    </div>
  )
}
