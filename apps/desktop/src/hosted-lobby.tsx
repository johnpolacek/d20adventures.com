import { useEffect, useRef, useState } from "react"
import { textShadow } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { siteCard, siteField, siteLabel, siteOutline } from "@/components/ui/site"
import { cn } from "@/lib/utils"
import type { HostedSummary } from "../../../lib/host/server"

// A link to send a friend, with Copy.
function InviteLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  return (
    <div className="flex gap-2">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={label} className={cn(siteField, "flex-1 text-sm")} />
      <button type="button" className={cn(siteOutline, "px-4 text-sm")} onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

type SeatRequest = NonNullable<HostedSummary["requests"]>[number]

// A guest asking for an open seat with their own hero: Approve seats them, Reject takes an optional note for them.
function Request({ request, busy, onAnswer }: { request: SeatRequest; busy: boolean; onAnswer: (approve: boolean, note?: string) => void }) {
  const [note, setNote] = useState<string | null>(null)
  // Reject opens the note field with the cursor in it.
  const field = useRef<HTMLInputElement>(null)
  const noting = note !== null
  useEffect(() => {
    if (noting) field.current?.focus()
  }, [noting])
  return (
    <li className="rounded-lg border border-white/10 bg-black/50 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg text-amber-300">{request.name}</div>
          <div className="truncate text-xs text-white/70">
            {[request.race, request.archetype].filter(Boolean).join(" ")} · {request.player}
          </div>
        </div>
        {note === null && (
          <>
            <button type="button" className={cn(siteOutline, "px-3 py-1 text-sm")} disabled={busy} onClick={() => setNote("")}>
              Reject
            </button>
            <button type="button" className={cn(siteOutline, "border-primary-400 bg-primary-600 px-3 py-1 text-sm hover:bg-primary-600")} disabled={busy} onClick={() => onAnswer(true)}>
              Approve
            </button>
          </>
        )}
      </div>
      {note !== null && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onAnswer(false, note.trim() || undefined)
          }}
        >
          <input
            ref={field}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for the guest"
            aria-label={`Note for ${request.player}`}
            className={cn(siteField, "flex-1 text-sm")}
          />
          <button type="button" className={cn(siteOutline, "px-3 text-sm")} onClick={() => setNote(null)}>
            Cancel
          </button>
          <button type="submit" className={cn(siteOutline, "border-red-400/60 bg-red-600/80 px-3 text-sm text-white hover:bg-red-600")} disabled={busy}>
            Reject
          </button>
        </form>
      )}
    </li>
  )
}

// A hosted game before it starts: a link for each hero held for a friend and one for the seats open to a guest's
// own hero, the guests asking for those, who has joined, and Start. A game hosted without seats for guests has one
// link, and guests bring their own heroes.
export function HostedLobby(props: {
  summary: HostedSummary
  gm: string
  busy: boolean
  onAnswer: (userId: string, approve: boolean, note?: string) => void
  onStart: () => void
  onHome: () => void
}) {
  const seats = props.summary.seats ?? []
  const requests = props.summary.requests ?? []
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 font-serif text-white">
      <section className={cn(siteCard, "w-[min(34rem,92vw)] p-8 text-left backdrop-blur-xl")}>
        <div className={siteLabel}>Hosting</div>
        <h1 className="mt-2 font-display text-4xl font-bold text-amber-300" style={textShadow}>
          {props.summary.title}
        </h1>
        {seats.map((seat) => (
          <div key={seat.id}>
            <div className={cn(siteLabel, "mt-7 mb-2")}>Invite · {seat.name}</div>
            <InviteLink label={`Invite link for ${seat.name}`} url={seat.invite} />
          </div>
        ))}
        {props.summary.open > 0 && (
          <>
            <div className={cn(siteLabel, "mt-7 mb-2")}>Invite · Any hero · {props.summary.open} open</div>
            <InviteLink label="Invite link for any hero" url={props.summary.openInvite} />
          </>
        )}
        {requests.length > 0 && (
          <>
            <div className={cn(siteLabel, "mt-7 mb-2")}>Asking to join · {requests.length}</div>
            <ul className="space-y-2">
              {requests.map((r) => (
                <Request key={`${r.userId}:${r.name}`} request={r} busy={props.busy} onAnswer={(approve, note) => props.onAnswer(r.userId, approve, note)} />
              ))}
            </ul>
          </>
        )}
        {!props.summary.held && (
          <>
            <div className={cn(siteLabel, "mt-7 mb-2")}>Invite link</div>
            <InviteLink label="Invite link" url={props.summary.invite} />
          </>
        )}
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
