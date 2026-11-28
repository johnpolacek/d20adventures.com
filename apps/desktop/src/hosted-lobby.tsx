import { Heading } from "@d20/ui/typography/heading"
import { useEffect, useRef, useState } from "react"
import { textShadow } from "@d20/ui/typography/styles"
import { Button, buttonClassName, Option } from "@d20/ui/button"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@d20/ui/collapsible"
import { Input } from "@d20/ui/input"
import { Presence, Swap } from "@d20/ui/presence"
import { siteLabel } from "@d20/ui/site"
import { cn } from "@/lib/utils"
import type { GuestHero, HostedSummary } from "../../../lib/host/server"
import { type RowMotion, useLeaving } from "@d20/ui/leaving"

const wellClass = "rounded-xl border border-white/10 bg-black/45 p-4 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]"
const barClass = "flex items-center gap-2 rounded-lg border border-white/15 bg-black/45 py-1 pr-1 pl-3 transition-colors focus-within:border-primary-400/70"
const rowClass = "rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5"

// A link to send a friend, with Copy tucked inside the bar.
function InviteLink({ label, url, tag }: { label: string; url: string; tag?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  return (
    <div className={barClass}>
      {tag && <span className="shrink-0 font-mono text-4xs uppercase tracking-label text-accent-300">{tag}</span>}
      <Input plain readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={label} className="min-w-0 flex-1 bg-transparent font-sans text-xs text-white/85 outline-none" />
      <Button
        variant="outline"
        size="xs"
        className={cn("shrink-0 px-3", copied && "border-roll-success/45 bg-roll-success/20 text-roll-success")}
        onClick={copy}
      >
        <Swap id={copied ? "copied" : "copy"} motion="pop" as="span" className="inline-block">
          {copied ? "Copied" : "Copy"}
        </Swap>
      </Button>
    </div>
  )
}

// The table chat, shared with the guests' lobby and the game: the lines so far and a box to send one.
function TableChat({ chat, onSend }: { chat: { from: string; text: string }[]; onSend: (text: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  // Lines said since the lobby opened come in. The ones already there are simply there.
  const [before] = useState(chat.length)
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
    <div className={wellClass}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className={siteLabel}>Table chat</div>
        <span className="font-sans text-2xs text-white/50">{chat.length > 0 ? `${chat.length} ${chat.length === 1 ? "line" : "lines"}` : "Live lobby chat"}</span>
      </div>
      {chat.length > 0 && (
        <div ref={list} className="mb-2.5 max-h-36 space-y-1 overflow-y-auto text-sm">
          {chat.map((m, i) => (
            <p key={i} className={i >= before ? "enter-rise" : undefined}>
              <span className="text-accent-300">{m.from}</span> <span className="text-zinc-300">{m.text}</span>
            </p>
          ))}
        </div>
      )}
      <form
        className={barClass}
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <Input
          plain
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Say something"
          aria-label="Table chat message"
          className="min-w-0 flex-1 bg-transparent font-sans text-xs text-white outline-none placeholder:italic placeholder:text-white/45"
        />
        <Button variant="outline" size="xs" type="submit" className="shrink-0 px-3" disabled={sending || !draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}

type SeatRequest = NonNullable<HostedSummary["requests"]>[number]
// characterId names one of a guest's heroes.
type ReadSheet = (userId: string, characterId?: string) => Promise<GuestHero | null>

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
    <div className="mt-3 space-y-2.5 border-t border-white/10 pt-3 text-sm text-zinc-300">
      <dl className="grid grid-cols-6 gap-1 text-center">
        {ATTRIBUTES.map(([key, label]) => (
          <div key={key} className="rounded border border-white/5 bg-white/5 py-1">
            <dt className="font-mono text-3xs uppercase text-primary-200">{label}</dt>
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

// Sheet opens a guest's hero under their row. It is read from the website when first opened, and the panel opens once
// it has the hero. The row spreads `root` on its Collapsible.
function useSheet(userId: string, read: ReadSheet, characterId?: string) {
  const [hero, setHero] = useState<GuestHero | null>(null)
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const onOpenChange = async (next: boolean) => {
    if (!next) return setOpen(false)
    setOpen(true)
    if (hero) return
    setReading(true)
    setHero(await read(userId, characterId).catch(() => null))
    setReading(false)
  }
  const root = { open: open && Boolean(hero), onOpenChange: (next: boolean) => void onOpenChange(next) }
  const button = (
    <CollapsibleTrigger className={buttonClassName("outline", "xs")} disabled={reading}>
      Sheet
    </CollapsibleTrigger>
  )
  const sheet = <CollapsiblePanel>{hero && <HeroSheet hero={hero} />}</CollapsiblePanel>
  return { root, button, sheet }
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
  const form = (
    <Presence show={open} motion="drop" asChild>
      {open && (
        <form
          className="mt-2.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onSend(note.trim() || undefined)
          }}
        >
          <Input
            ref={field}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for the guest"
            aria-label={`Note for ${who}`}
            className="h-8 flex-1 text-xs"
          />
          <Button variant="outline" size="xs" onClick={() => setNote(null)}>
            Cancel
          </Button>
          <Button variant="destructive" size="xs" type="submit" disabled={busy}>
            {action}
          </Button>
        </form>
      )}
    </Presence>
  )
  return { open, start: () => setNote(""), form }
}

// A guest at the table, with their hero's sheet. Remove takes them out before the game starts, with an optional note.
function Guest({
  guest,
  busy,
  motion,
  onSheet,
  onRemove,
}: {
  guest: { userId: string; name: string }
  busy: boolean
  motion?: RowMotion
  onSheet: ReadSheet
  onRemove: (note?: string) => void
}) {
  const { root, button, sheet } = useSheet(guest.userId, onSheet)
  const note = useNote("Remove", guest.name, busy, onRemove)
  return (
    <Collapsible render={<li {...motion} className={cn(rowClass, motion?.className)} />} {...root}>
      <div className="flex items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate font-display text-base">{guest.name}</span>
        <Presence show={!note.open} motion="fade" initial={false} className="flex items-center gap-2">
          {button}
          <Button variant="outline" size="xs" disabled={busy} onClick={note.start}>
            Remove
          </Button>
        </Presence>
      </div>
      {note.form}
      {sheet}
    </Collapsible>
  )
}

// A guest asking for an open seat with their own hero: Approve seats them, Reject takes an optional note for them.
function Request({
  request,
  busy,
  motion,
  onAnswer,
  onSheet,
}: {
  request: SeatRequest
  busy: boolean
  motion?: RowMotion
  onAnswer: (approve: boolean, note?: string) => void
  onSheet: ReadSheet
}) {
  const { root, button, sheet } = useSheet(request.userId, onSheet, request.characterId)
  const note = useNote("Reject", request.player, busy, (text) => onAnswer(false, text))
  return (
    <Collapsible render={<li {...motion} className={cn("rounded-lg border border-accent-300/30 bg-accent-300/[0.06] px-3 py-2.5", motion?.className)} />} {...root}>
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-base text-accent-200">{request.name}</span>
            <span className="shrink-0 font-mono text-4xs uppercase tracking-label text-accent-300">Request</span>
          </div>
          <div className="truncate font-sans text-2xs text-white/60">
            {[request.race, request.archetype].filter(Boolean).join(" ")} · {request.player}
          </div>
        </div>
        <Presence show={!note.open} motion="fade" initial={false} className="flex items-center gap-2">
          {button}
          <Button variant="outline" size="xs" disabled={busy} onClick={note.start}>
            Reject
          </Button>
          <Button variant="primary" size="xs" disabled={busy} onClick={() => onAnswer(true)}>
            Approve
          </Button>
        </Presence>
      </div>
      {note.form}
      {sheet}
    </Collapsible>
  )
}

// Diamond seat-fill pips: gold for seated heroes, amber-tinted for pending requests, hollow for open seats.
function SeatPips({ seated, pending, total }: { seated: number; pending: number; total: number }) {
  if (total <= 0 || total > 12) return null
  return (
    <span className="inline-flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }).map((_, idx) => {
        const filled = idx < seated
        const asking = !filled && idx < seated + pending
        return (
          <span
            key={idx}
            className={cn(
              "size-2 rotate-45 border transition-colors",
              filled
                ? "border-accent-200 bg-accent-300 shadow-[0_0_8px_rgba(252,211,77,0.55)]"
                : asking
                  ? "border-accent-300 bg-accent-300/30"
                  : "border-white/30 bg-transparent"
            )}
          />
        )
      })}
    </span>
  )
}

// A hosted game before it starts: recessed session wells for invites, the table (with seat pips and approval requests),
// and table chat, above a readiness strip and Home / Start.
export function HostedLobby(props: {
  summary: HostedSummary
  // The table chat, where the website carries it.
  chat?: { from: string; text: string }[]
  onChat: (text: string) => Promise<boolean>
  busy: boolean
  onAnswer: (userId: string, approve: boolean, note?: string, characterId?: string) => void
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
  // Why Start waits, shown in the readiness bar above it.
  const waitsFor = nobody ? "Someone must play a hero." : props.summary.watching && guests.length === 0 ? "Waiting for a guest to join." : null
  // Links, requests and people at the table come in one after another, and one taken or gone is seen to go.
  const seatRows = useLeaving(seats, (seat) => seat.id)
  const requestRows = useLeaving(requests, (r) => `${r.userId}:${r.characterId ?? r.name}`)
  const unchosenRows = useLeaving(unchosen ?? [], (h) => h.id)
  const hostRows = useLeaving(hostHeroes, (name) => name, { from: unchosen?.length ?? 0 })
  const guestRows = useLeaving(guests, (guest) => guest.userId, { from: (unchosen?.length ?? 0) + hostHeroes.length })

  const seatedCount = props.summary.party.length + (unchosen?.length ? unchosen.length : left.length ? 1 : 0)
  const openCount = seats.length + props.summary.open + (unchosen?.length ? 0 : Math.max(0, left.length - 1))
  const totalSeats = seatedCount + openCount
  const hasInvite = seatRows.length > 0 || left.length > 1 || props.summary.open > 0 || !props.summary.held
  const inviteHeading = props.summary.open > 0
    ? `Invite · ${props.summary.flex ? "Open invite" : "Any hero"}`
    : left.length > 1
      ? `Invite · Guest's choice · ${left.length - 1} open`
      : seatRows.length > 0
        ? "Invite · Held seats"
        : "Invite link"
  const inviteMeta = props.summary.open > 0 ? (props.summary.approval ? "You approve" : "Auto-approve") : null
  const tableEmpty = seatedCount === 0 && requests.length === 0 && left.length === 0

  return (
    <div className="absolute inset-0 z-panel grid place-items-center bg-black/70 font-serif text-white">
      <section className="relative flex max-h-[94%] w-[min(37.5rem,94vw)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b10] text-left shadow-[0_0_0_5px_rgba(0,0,0,0.78),0_26px_70px_rgba(0,0,0,0.9)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 stage-grain opacity-40" />
        <div className="relative space-y-4 overflow-y-auto p-6 sm:p-7">
          <div>
            <div className={siteLabel}>Hosting</div>
            <Heading variant="h1" className="mt-1 text-3xl sm:text-3xl" style={textShadow}>
              {props.summary.title}
            </Heading>
          </div>

          {hasInvite && (
            <div className={wellClass}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className={siteLabel}>{inviteHeading}</div>
                {inviteMeta && <span className="font-sans text-2xs text-white/55">{inviteMeta}</span>}
              </div>
              <div className="space-y-2">
                <Presence show={props.summary.open > 0}>
                  <InviteLink label="Invite link for any hero" url={props.summary.openInvite} />
                </Presence>
                <Presence show={left.length > 1}>
                  <InviteLink label="Invite link for a guest's choice of hero" url={props.summary.invite} />
                </Presence>
                {seatRows.map(({ key, item: seat, motion }) => (
                  <div key={key} {...motion}>
                    <InviteLink label={`Invite link for ${seat.name}`} url={seat.invite} tag={seat.name} />
                  </div>
                ))}
                {!props.summary.held && <InviteLink label="Invite link" url={props.summary.invite} />}
              </div>
            </div>
          )}

          <div className={wellClass}>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div className={siteLabel}>
                At the table · {totalSeats > 0 ? `${seatedCount}/${totalSeats}` : seatedCount}
              </div>
              <div className="flex items-center gap-2.5">
                {props.summary.watching && <span className="font-sans text-2xs text-white/55">You watch</span>}
                <SeatPips seated={seatedCount} pending={requests.length} total={totalSeats} />
              </div>
            </div>
            <ul className="space-y-2">
              {requestRows.map(({ key, item: r, motion }) => (
                <Request
                  key={key}
                  request={r}
                  busy={props.busy}
                  motion={motion}
                  onAnswer={(approve, note) => props.onAnswer(r.userId, approve, note, r.characterId)}
                  onSheet={props.onSheet}
                />
              ))}
              {unchosen?.length
                ? unchosenRows.map(({ key, item: h, motion }) => (
                    <li key={key} {...motion} className={cn(rowClass, "flex items-center gap-2.5", motion.className)}>
                      <span className={cn("min-w-0 flex-1 truncate font-display text-base", playsOf(h.id) === "ai" && "text-white/60")}>{h.name}</span>
                      <fieldset className="flex" aria-label={`Who plays ${h.name}`}>
                        <Option size="xs" active={playsOf(h.id) === "you"} aria-pressed={playsOf(h.id) === "you"} className="rounded-r-none" onClick={() => setPlays((p) => ({ ...p, [h.id]: "you" }))}>
                          You
                        </Option>
                        <Option size="xs" active={playsOf(h.id) === "ai"} aria-pressed={playsOf(h.id) === "ai"} className="-ml-0.5 rounded-l-none" onClick={() => setPlays((p) => ({ ...p, [h.id]: "ai" }))}>
                          AI
                        </Option>
                      </fieldset>
                    </li>
                  ))
                : left.length > 0 && (
                    <li className={cn(rowClass, "font-display text-base", left.length > 1 && "text-white/60")}>
                      {left.length > 1 ? "You play the hero left" : left[0]}
                    </li>
                  )}
              {hostRows.map(({ key, item: name, motion }) => (
                <li key={key} {...motion} className={cn(rowClass, "flex items-center justify-between gap-2.5", motion.className)}>
                  <span className="min-w-0 truncate font-display text-base">{name}</span>
                  <span className="shrink-0 rounded-full border border-accent-300/25 bg-accent-300/10 px-2.5 py-0.5 font-sans text-3xs font-medium text-accent-200">Host</span>
                </li>
              ))}
              {guestRows.map(({ key, item: guest, motion }) => (
                <Guest key={key} guest={guest} busy={props.busy} motion={motion} onSheet={props.onSheet} onRemove={(note) => props.onRemove(guest.userId, note)} />
              ))}
              {tableEmpty && (
                <li className="flex items-center gap-2.5 rounded-lg border border-dashed border-white/15 bg-white/[0.015] px-3 py-2.5 font-sans text-xs text-white/45">
                  <span aria-hidden="true">◇</span>
                  <span>No heroes seated yet — share your invite link to open the road.</span>
                </li>
              )}
            </ul>
          </div>

          {props.chat && <TableChat chat={props.chat} onSend={props.onChat} />}

          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 font-sans text-xs",
              waitsFor ? "border-white/10 bg-white/[0.04] text-white/75" : "border-roll-success/30 bg-roll-success/10 text-[#d9ebb9]"
            )}
          >
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  waitsFor ? "bg-accent-400 shadow-[0_0_0_3px_rgba(251,191,36,0.2)]" : "bg-roll-success shadow-[0_0_0_3px_rgba(183,211,138,0.18)]"
                )}
              />
              <span>{waitsFor ?? "All clear — ready to begin."}</span>
            </span>
            {totalSeats > 0 && (
              <span className="shrink-0 font-mono text-3xs tracking-label opacity-75">
                {seatedCount}/{totalSeats} SEATED
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-0.5">
            <Button variant="outline" onClick={props.onHome}>
              Home
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="px-7 font-display text-sm font-bold uppercase tracking-label"
              disabled={props.busy || Boolean(waitsFor)}
              onClick={() => props.onStart(ais)}
            >
              Start Adventure
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
