import { useEffect, useRef, useState } from "react"
import { textShadow } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { Option, siteCard, siteField, siteLabel, siteOutline } from "@/components/ui/site"
import { cn } from "@/lib/utils"
import type { GuestHero, HostedSummary } from "../../../lib/host/server"

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

// The table chat, shared with the guests' lobby and the game: the lines so far and a box to send one.
function TableChat({ chat, onSend }: { chat: { from: string; text: string }[]; onSend: (text: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight
  }, [chat.length])
  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    if (await onSend(text)) setDraft("")
    setSending(false)
  }
  return (
    <>
      <div className={cn(siteLabel, "mt-7 mb-2")}>Table chat</div>
      {chat.length > 0 && (
        <div ref={list} className="mb-2 max-h-40 space-y-1 overflow-y-auto text-sm">
          {chat.map((m, i) => (
            <p key={i}>
              <span className="text-amber-300">{m.from}</span> <span className="text-gray-300">{m.text}</span>
            </p>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} placeholder="Say something" aria-label="Table chat message" className={cn(siteField, "flex-1 text-sm")} />
        <button type="submit" className={cn(siteOutline, "px-4 text-sm")} disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </>
  )
}

type SeatRequest = NonNullable<HostedSummary["requests"]>[number]
type ReadSheet = (userId: string) => Promise<GuestHero | null>

const ATTRIBUTES = [
  ["strength", "Str"],
  ["dexterity", "Dex"],
  ["constitution", "Con"],
  ["intelligence", "Int"],
  ["wisdom", "Wis"],
  ["charisma", "Cha"],
] as const

// A guest's hero sheet, as the host reads it before or after seating them.
function HeroSheet({ hero }: { hero: GuestHero }) {
  const lists = [
    ["Skills", hero.skills],
    ["Abilities", hero.specialAbilities],
    ["Spells", hero.spells?.map((s) => s.name)],
    ["Equipment", hero.equipment?.map((e) => e.name)],
  ] as const
  const prose = [
    ["Appearance", hero.appearance],
    ["Background", hero.background],
    ["Personality", hero.personality],
    ["Motivation", hero.motivation],
  ] as const
  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3 text-sm text-gray-300">
      <dl className="grid grid-cols-6 gap-1 text-center">
        {ATTRIBUTES.map(([key, label]) => (
          <div key={key} className="rounded bg-white/5 py-1">
            <dt className="font-mono text-xxs uppercase text-primary-200">{label}</dt>
            <dd className="font-display text-base text-white">{hero.attributes[key]}</dd>
          </div>
        ))}
      </dl>
      {prose.map(
        ([label, text]) =>
          text && (
            <p key={label}>
              <span className={cn(siteLabel, "mr-2")}>{label}</span>
              {text}
            </p>
          )
      )}
      {lists.map(([label, items]) =>
        items?.length ? (
          <p key={label}>
            <span className={cn(siteLabel, "mr-2")}>{label}</span>
            {items.join(", ")}
          </p>
        ) : null
      )}
    </div>
  )
}

// Sheet opens a guest's hero under their row. It is read from the website when first opened.
function useSheet(userId: string, read: ReadSheet) {
  const [hero, setHero] = useState<GuestHero | null>(null)
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const toggle = async () => {
    if (open) return setOpen(false)
    setOpen(true)
    if (hero) return
    setReading(true)
    setHero(await read(userId).catch(() => null))
    setReading(false)
  }
  const button = (
    <button type="button" className={cn(siteOutline, "px-3 py-1 text-sm")} aria-expanded={open} disabled={reading} onClick={() => void toggle()}>
      Sheet
    </button>
  )
  return { button, sheet: open && hero ? <HeroSheet hero={hero} /> : null }
}

// Reject and Remove each take an optional note for the guest, in a field that opens under the row with the cursor
// in it.
function useNote(action: string, who: string, busy: boolean, onSend: (note?: string) => void) {
  const [note, setNote] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const open = note !== null
  useEffect(() => {
    if (open) field.current?.focus()
  }, [open])
  const form = open && (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSend(note.trim() || undefined)
      }}
    >
      <input
        ref={field}
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note for the guest"
        aria-label={`Note for ${who}`}
        className={cn(siteField, "flex-1 text-sm")}
      />
      <button type="button" className={cn(siteOutline, "px-3 text-sm")} onClick={() => setNote(null)}>
        Cancel
      </button>
      <button type="submit" className={cn(siteOutline, "border-red-400/60 bg-red-600/80 px-3 text-sm text-white hover:bg-red-600")} disabled={busy}>
        {action}
      </button>
    </form>
  )
  return { open, start: () => setNote(""), form }
}

// A guest at the table, with their hero's sheet. Remove takes them out before the game starts, with an optional note.
function Guest({ guest, busy, onSheet, onRemove }: { guest: { userId: string; name: string }; busy: boolean; onSheet: ReadSheet; onRemove: (note?: string) => void }) {
  const { button, sheet } = useSheet(guest.userId, onSheet)
  const note = useNote("Remove", guest.name, busy, onRemove)
  return (
    <li>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-display text-lg">{guest.name}</span>
        {!note.open && (
          <>
            {button}
            <button type="button" className={cn(siteOutline, "px-3 py-1 text-sm")} disabled={busy} onClick={note.start}>
              Remove
            </button>
          </>
        )}
      </div>
      {note.form}
      {sheet}
    </li>
  )
}

// A guest asking for an open seat with their own hero: Approve seats them, Reject takes an optional note for them.
function Request({ request, busy, onAnswer, onSheet }: { request: SeatRequest; busy: boolean; onAnswer: (approve: boolean, note?: string) => void; onSheet: ReadSheet }) {
  const { button, sheet } = useSheet(request.userId, onSheet)
  const note = useNote("Reject", request.player, busy, (text) => onAnswer(false, text))
  return (
    <li className="rounded-lg border border-white/10 bg-black/50 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg text-amber-300">{request.name}</div>
          <div className="truncate text-xs text-white/70">
            {[request.race, request.archetype].filter(Boolean).join(" ")} · {request.player}
          </div>
        </div>
        {!note.open && (
          <>
            {button}
            <button type="button" className={cn(siteOutline, "px-3 py-1 text-sm")} disabled={busy} onClick={note.start}>
              Reject
            </button>
            <button type="button" className={cn(siteOutline, "border-primary-400 bg-primary-600 px-3 py-1 text-sm hover:bg-primary-600")} disabled={busy} onClick={() => onAnswer(true)}>
              Approve
            </button>
          </>
        )}
      </div>
      {note.form}
      {sheet}
    </li>
  )
}

// A hosted game before it starts: a link for each hero held for a friend and one for the seats open to a guest's
// own hero, the guests asking for those, who has joined, and Start. Where guests choose first, one link serves every
// hero, and at Start the host plays the heroes they leave or gives them to AI. A host who watches has no hero, and starts once a guest has joined. A game
// hosted without seats for guests has one link, and guests bring their own heroes. The table chat reaches guests
// seated in their lobby.
export function HostedLobby(props: {
  summary: HostedSummary
  // The table chat, where the website carries it.
  chat?: { from: string; text: string }[]
  onChat: (text: string) => Promise<boolean>
  gm: string
  busy: boolean
  onAnswer: (userId: string, approve: boolean, note?: string) => void
  onSheet: ReadSheet
  onRemove: (userId: string, note?: string) => void
  // Where guests choose first, the heroes nobody chose that go to AI. The rest are the host's.
  onStart: (ais?: string[]) => void
  onHome: () => void
}) {
  const seats = props.summary.seats ?? []
  const requests = props.summary.requests ?? []
  const guests = props.summary.guests ?? []
  // The heroes nobody has chosen, where guests choose first. Guests take all but the last, which is the host's.
  const left = props.summary.left ?? []
  const hostHeroes = props.summary.party.slice(0, props.summary.party.length - guests.reduce((n, g) => n + (g.heroes ?? 1), 0))
  // Who plays each hero nobody chose, by id, as the host sets it. Unset, the first is the host's and the rest AI.
  const [plays, setPlays] = useState<Record<string, "you" | "ai">>({})
  const unchosen = props.summary.unchosen
  const playsOf = (id: string) => plays[id] ?? (unchosen?.[0]?.id === id ? "you" : "ai")
  const ais = unchosen?.filter((h) => playsOf(h.id) === "ai").map((h) => h.id)
  const nobody = Boolean(unchosen?.length && ais?.length === unchosen.length && guests.length === 0)
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 font-serif text-white">
      <section className={cn(siteCard, "max-h-[94%] w-[min(34rem,92vw)] overflow-y-auto p-8 text-left backdrop-blur-xl")}>
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
        {left.length > 1 && (
          <>
            <div className={cn(siteLabel, "mt-7 mb-2")}>Invite · Guest's choice · {left.length - 1} open</div>
            <InviteLink label="Invite link for a guest's choice of hero" url={props.summary.invite} />
          </>
        )}
        {props.summary.open > 0 && (
          <>
            <div className={cn(siteLabel, "mt-7 mb-2")}>
              Invite · Any hero · {props.summary.open} open · {props.summary.approval ? "you approve" : "auto-approve"}
            </div>
            <InviteLink label="Invite link for any hero" url={props.summary.openInvite} />
          </>
        )}
        {requests.length > 0 && (
          <>
            <div className={cn(siteLabel, "mt-7 mb-2")}>Asking to join · {requests.length}</div>
            <ul className="space-y-2">
              {requests.map((r) => (
                <Request key={`${r.userId}:${r.name}`} request={r} busy={props.busy} onAnswer={(approve, note) => props.onAnswer(r.userId, approve, note)} onSheet={props.onSheet} />
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
        <div className={cn(siteLabel, "mt-7 mb-2")}>At the table · {props.summary.party.length + (unchosen ? unchosen.length : left.length ? 1 : 0)}</div>
        <ul className="space-y-1">
          {unchosen
            ? unchosen.map((h) => (
                <li key={h.id} className="flex items-center gap-3">
                  <span className={cn("flex-1 truncate font-display text-lg", playsOf(h.id) === "ai" && "text-white/60")}>{h.name}</span>
                  <fieldset className="flex" aria-label={`Who plays ${h.name}`}>
                    <Option active={playsOf(h.id) === "you"} aria-pressed={playsOf(h.id) === "you"} className="rounded-r-none" onClick={() => setPlays((p) => ({ ...p, [h.id]: "you" }))}>
                      You
                    </Option>
                    <Option active={playsOf(h.id) === "ai"} aria-pressed={playsOf(h.id) === "ai"} className="-ml-0.5 rounded-l-none" onClick={() => setPlays((p) => ({ ...p, [h.id]: "ai" }))}>
                      AI
                    </Option>
                  </fieldset>
                </li>
              ))
            : left.length > 0 && <li className={cn("font-display text-lg", left.length > 1 && "text-white/60")}>{left.length > 1 ? "You play the hero left" : left[0]}</li>}
          {props.summary.watching && <li className="font-display text-lg text-white/60">You watch</li>}
          {hostHeroes.map((name) => (
            <li key={name} className="font-display text-lg">
              {name}
            </li>
          ))}
          {guests.map((guest) => (
            <Guest key={guest.userId} guest={guest} busy={props.busy} onSheet={props.onSheet} onRemove={(note) => props.onRemove(guest.userId, note)} />
          ))}
        </ul>
        {props.chat && <TableChat chat={props.chat} onSend={props.onChat} />}
        <div className="mt-8 flex items-center gap-3">
          <span className="font-mono text-xs text-white/60">{props.gm}</span>
          <div className="flex-1" />
          <button type="button" className={cn(siteOutline, "px-4 py-2 text-sm")} onClick={props.onHome}>
            Home
          </button>
          <Button variant="epic" className="text-xl" disabled={props.busy || nobody || (props.summary.watching && guests.length === 0)} onClick={() => props.onStart(ais)}>
            Start
          </Button>
        </div>
      </section>
    </div>
  )
}
