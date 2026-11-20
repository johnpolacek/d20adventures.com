import { srdAttribution } from "@d20/srd/attribution"
import { Trash2, X } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { ModuleCover } from "@d20/ui/adventure/module-cover"
import { textShadow, textShadowSpread } from "@d20/ui/typography/styles"
import { Button, buttonClassName, buttonStyle } from "@d20/ui/button"
import ImageHeader from "@d20/ui/image-header"
import { Chip, Rule, SectionPlate, siteLabel, siteOutline } from "@d20/ui/site"
import { cardVariants } from "@d20/ui/card"
import { cn } from "@/lib/utils"
import type { HostedSummary } from "../../../lib/host/server"
import type { AdventureInfo } from "../runtime/game"
import type { Hero } from "../runtime/heroes"
import type { SaveSummary } from "../runtime/store"
import { type FigureArt, STOCK_FIGURES } from "./figures"
import { portraitFor, sceneFor } from "./scenes"
import { type Locked, LockIcon, price } from "./new-game"
import type { Realm } from "./realm"

// The pages behind the title screen, in the website's look: its image header with the d20 painting, amber section
// plates, and black ringed cards in a grid.

export type Page = "adventures" | "characters" | "settings"

const played = (ms?: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""

function PageShell(props: { title: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-black text-white">
      <div className="relative">
        <ImageHeader variant="compact" imageUrl="/images/app/backgrounds/d20-hero.webp" title={props.title} />
        <div className="relative z-10 mx-auto -mt-32 max-w-6xl space-y-12 px-8 pb-24">{props.children}</div>
      </div>
    </div>
  )
}

// The website's small red delete control. The first press asks, the second confirms.
function RemoveButton(props: { confirming: boolean; label: string; confirmLabel: string; className?: string; disabled?: boolean; onBlur: () => void; onClick: () => void }) {
  return (
    <Button
      variant="plain"
      type="button"
      disabled={props.disabled}
      aria-label={props.confirming ? props.confirmLabel : props.label}
      onBlur={props.onBlur}
      onClick={props.onClick}
      className={cn(
        "grid h-6 place-items-center rounded-md transition-colors disabled:opacity-40",
        props.confirming ? "bg-red-600/80 px-2 font-mono text-xxs text-white" : "w-6 bg-red-900/30 text-red-500/70 hover:bg-red-600/70 hover:text-white",
        props.className
      )}
    >
      {props.confirming ? "Confirm" : <Trash2 aria-hidden="true" className="h-4 w-4" />}
    </Button>
  )
}

// The featured adventure gets its own panel below the intro adventures.
const FEATURED = "welcome-to-kordavos"

// What the adventure's heroes are: its premades, the player's own, or either.
const heroesLabel = (a: AdventureInfo) =>
  a.premades.length && a.options ? "Premade or your own heroes" : a.premades.length ? (a.premades.length === 1 ? "Premade hero" : `${a.premades.length} premade heroes`) : "Create your heroes"

// A playable adventure, or one for sale that is not installed yet.
type Listed = { info?: AdventureInfo; locked?: Locked; id: string; title: string; teaser: string; players: [number, number] }

// Scenes and heroes, as one mono line. The cover already gives the player count.
function Details({ a, className }: { a: Listed; className?: string }) {
  if (!a.info) return null
  return (
    <div className={cn(siteLabel, className)}>
      {a.info.scenes} scenes · {heroesLabel(a.info)}
    </div>
  )
}

function PriceChip({ a, listPrices }: { a: Listed; listPrices: Record<string, number> }) {
  if (a.locked && !a.locked.owned)
    return (
      <Chip>
        <LockIcon />
        {price(a.locked.priceCents)}
      </Chip>
    )
  if (a.locked) return <Chip tone="primary">Owned</Chip>
  return (
    <Chip tone="amber">
      {listPrices[a.id] ? <s className="mr-1.5 font-normal opacity-70">{price(listPrices[a.id])}</s> : null}
      FREE
    </Chip>
  )
}

// A saved card's X. It asks over the whole card: the art dims and blurs behind Cancel and Archive, with Delete
// Permanently set small beneath. Cancel takes focus, and Escape or a click off the buttons cancels.
function CardRemove(props: {
  title: string
  confirming: boolean
  disabled?: boolean
  onAsk: () => void
  onCancel: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const { confirming, onCancel } = props
  useEffect(() => {
    if (!confirming) return
    const key = (e: KeyboardEvent) => e.key === "Escape" && onCancel()
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [confirming, onCancel])
  if (!confirming)
    return (
      <Button
        variant="plain"
        type="button"
        disabled={props.disabled}
        aria-label={`Archive or delete ${props.title}`}
        onClick={props.onAsk}
        className="absolute top-6 right-6 grid size-8 place-items-center rounded-md bg-black/60 text-white/70 transition-colors hover:bg-black/80 hover:text-white disabled:opacity-40"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </Button>
    )
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="remove-title"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      className="fade-in absolute inset-0 grid scale-[.985] place-items-center rounded-xl bg-black/75 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center text-center">
        <h3 id="remove-title" className="font-display text-3xl text-white">
          Archive {props.title}?
        </h3>
        <div className="mt-6 flex items-center gap-4">
          <Button variant="plain" type="button" autoFocus onClick={onCancel} className={cn(siteOutline, "px-6 py-2 font-display text-sm")}>
            Cancel
          </Button>
          <Button variant="plain" type="button" disabled={props.disabled} onClick={props.onArchive} className={buttonClassName("epic", undefined, "text-sm")} style={buttonStyle("epic")}>
            Archive
          </Button>
        </div>
        <Button
          variant="plain"
          type="button"
          disabled={props.disabled}
          onClick={props.onDelete}
          className="mt-5 rounded-md px-3 py-1 font-display text-xs text-red-300/70 transition-colors hover:bg-red-900/40 hover:text-red-200 disabled:opacity-40"
        >
          Delete Permanently
        </Button>
      </div>
    </div>
  )
}

// An archived save or hosted game, as a slim row: Restore lists it with the others again, and the small red control
// deletes it for good.
function ArchivedRow(props: { planId: string; title: string; kicker: string; busy: boolean; onRestore: () => void; children: ReactNode }) {
  return (
    <li className="flex items-center gap-5 px-5 py-3">
      <img src={`/stage/covers/${props.planId}.jpg`} alt="" className="aspect-[3/4] w-10 rounded-sm object-cover saturate-50" />
      <div className="flex-1">
        <div className="font-display text-lg text-white/80">{props.title}</div>
        {props.kicker && <div className={siteLabel}>{props.kicker}</div>}
      </div>
      <Button variant="plain" type="button" disabled={props.busy} onClick={props.onRestore} className={cn(siteOutline, "px-4 py-1.5 font-display text-sm")}>
        Restore
      </Button>
      {props.children}
    </li>
  )
}

// A hero on a saved card: their portrait when there is one, and their health when the save knows it.
type CardHero = { name: string; portrait?: string; healthPercent?: number }

// A saved or hosted adventure as a wide still of the scene the party stands in. The cover, title, where the run stands
// and the button sit top left, the button's foot level with the cover's, and the party stands bottom left. Archives
// saved before scenes were recorded show the cover as the still.
function SavedCard(props: {
  planId: string
  title: string
  encounterId?: string
  completed: boolean
  kicker?: string
  status: string
  heroes: CardHero[]
  action: string
  label: string
  busy: boolean
  onOpen: () => void
  children?: ReactNode
}) {
  const cover = `/stage/covers/${props.planId}.jpg`
  const [missing, setMissing] = useState(false)
  const art = props.encounterId && !missing ? `/stage/art/${props.planId}/${props.encounterId}.webp` : cover
  return (
    <li className="relative">
      <Button
        variant="plain"
        type="button"
        disabled={props.busy}
        onClick={props.onOpen}
        aria-label={props.label}
        className={cn(cardVariants({ variant: "pick" }), "relative block aspect-[21/8] w-full scale-[.985] text-left disabled:cursor-default")}
      >
        <img
          src={art}
          alt=""
          onError={() => setMissing(true)}
          className={cn("absolute inset-0 h-full w-full object-cover", props.completed && "[filter:saturate(.5)_brightness(.75)]")}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
        <div className="absolute top-8 left-8 flex items-stretch gap-6">
          <img src={cover} alt="" className="aspect-[3/4] w-28 shrink-0 rounded-md object-cover shadow-[0_8px_24px_#000c] ring-1 ring-white/20" />
          <div className="flex flex-col items-start">
            <h3 className="font-display text-4xl leading-tight text-white [text-shadow:0_2px_12px_#000]">{props.title}</h3>
            {props.kicker && <div className={cn(siteLabel, "mt-1")}>{props.kicker}</div>}
            <div className="font-display text-xl text-amber-300 [text-shadow:0_2px_8px_#000]">{props.status}</div>
            <span className={buttonClassName("epic", undefined, "mt-auto text-sm")} style={buttonStyle("epic")}>
              {props.action}
            </span>
          </div>
        </div>
        <div className="absolute bottom-6 left-8 flex items-end gap-6">
          {props.heroes.map((h) => (
            <div key={h.name} className="flex items-center gap-3">
              {h.portrait && <img src={h.portrait} alt="" className="size-14 rounded-full object-cover object-top ring-2 ring-amber-400/70" />}
              <div>
                <div className="font-display text-lg text-white [text-shadow:0_2px_8px_#000]">{h.name}</div>
                {h.healthPercent !== undefined && (
                  <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, h.healthPercent))}%` }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Button>
      {props.children}
    </li>
  )
}

const ARCHIVED_HOSTED = "d20.archivedHosted"

export function AdventuresPage(props: {
  saves: SaveSummary[]
  // Painted art fetched for heroes, by character id.
  art: Record<string, FigureArt>
  adventures: AdventureInfo[]
  locked: Locked[]
  listPrices: Record<string, number>
  busy: boolean
  onContinue: () => void
  onResume: (archiveId: number) => void
  // Deletes a saved adventure: an archived one by id, or the current one.
  onRemove: (archiveId?: number) => void
  // Archives a saved adventure, the current one without an id, or with restore lists an archived one again.
  onArchive: (archiveId?: number, restore?: boolean) => void
  onAdventure: (id: string) => void
  // Website games this account hosts, and the one whose GM this app is running.
  hosted: HostedSummary[]
  hostingNow: string | null
  onOpenHosted: (adventureId: string) => void
  onRemoveHosted: (adventureId: string) => void
}) {
  const [removing, setRemoving] = useState<string | null>(null)
  // Hosted games live on the website, so which ones the player archived is kept on this machine.
  const [archivedHosted, setArchivedHosted] = useState<string[]>(() => JSON.parse(localStorage.getItem(ARCHIVED_HOSTED) ?? "[]"))
  const archiveHosted = (id: string, archived: boolean) => {
    const next = archived ? [...new Set([...archivedHosted, id])] : archivedHosted.filter((h) => h !== id)
    localStorage.setItem(ARCHIVED_HOSTED, JSON.stringify(next))
    setArchivedHosted(next)
  }
  // Archive, Restore and Delete move or drop a card at once, before the app answers. The next list from the app, or the
  // app going idle after a failed command, is the truth again.
  const [pending, setPending] = useState<Record<string, "archived" | "restored" | "deleted">>({})
  const mark = (key: string, to: "archived" | "restored" | "deleted") => setPending((p) => ({ ...p, [key]: to }))
  useEffect(() => setPending({}), [props.saves, props.hosted])
  useEffect(() => {
    if (!props.busy) setPending({})
  }, [props.busy])
  const saveKey = (s: SaveSummary) => `save-${s.archiveId ?? "current"}`
  const hostKey = (h: HostedSummary) => `hosted-${h.adventureId}`
  const hidden = (s: SaveSummary) => (pending[saveKey(s)] === "archived" ? true : pending[saveKey(s)] === "restored" ? false : Boolean(s.hidden))
  const kept = props.saves.filter((s) => pending[saveKey(s)] !== "deleted")
  const keptHosted = props.hosted.filter((h) => pending[hostKey(h)] !== "deleted")
  const saves = kept.filter((s) => !hidden(s))
  const hosted = keptHosted.filter((h) => !archivedHosted.includes(h.adventureId))
  const shelvedSaves = kept.filter(hidden)
  const shelvedHosted = keptHosted.filter((h) => archivedHosted.includes(h.adventureId))
  const heroesOf = (s: SaveSummary): CardHero[] => {
    if (!s.heroes) return s.party.map((name) => ({ name }))
    const painted = Object.fromEntries((s.painted ?? []).flatMap((id) => (props.art[id] ? [[id, props.art[id]]] : [])))
    return s.heroes.map((h) => ({ name: h.name, healthPercent: h.healthPercent, portrait: portraitFor(sceneFor(s.encounterId), { ...h, type: "pc" }, s.figures, painted) }))
  }
  const listed: Listed[] = [...props.adventures.map((info) => ({ ...info, info })), ...props.locked.map((locked) => ({ ...locked, locked }))]
  const featured = listed.find((a) => a.id === FEATURED)
  const intro = listed.filter((a) => a.id !== FEATURED)
  return (
    <PageShell title="Adventures">
      {saves.length + hosted.length > 0 && (
        <section>
          <SectionPlate>Your Adventures</SectionPlate>
          <ul className="flex flex-col gap-8 py-8">
            {saves.map((s) => {
              const current = s.archiveId === undefined
              const key = String(s.archiveId ?? "current")
              return (
                <SavedCard
                  key={key}
                  planId={s.planId}
                  title={s.title}
                  encounterId={s.encounterId}
                  completed={s.status === "completed"}
                  kicker={[current ? "" : played(s.playedAt), s.status === "completed" ? "" : `Round ${s.round}`].filter(Boolean).join(" · ")}
                  status={s.status === "completed" ? "Complete" : s.turnTitle}
                  heroes={heroesOf(s)}
                  action={s.status === "completed" ? "Read the Ending" : current ? "Continue" : "Resume"}
                  label={`${s.status === "completed" ? "Read the ending of" : current ? "Continue" : "Resume"} ${s.title}`}
                  busy={props.busy}
                  onOpen={() => (current ? props.onContinue() : props.onResume(s.archiveId!))}
                >
                  <CardRemove
                    title={s.title}
                    confirming={removing === key}
                    disabled={props.busy}
                    onAsk={() => setRemoving(key)}
                    onCancel={() => setRemoving(null)}
                    onArchive={() => {
                      setRemoving(null)
                      mark(saveKey(s), "archived")
                      props.onArchive(s.archiveId)
                    }}
                    onDelete={() => {
                      setRemoving(null)
                      mark(saveKey(s), "deleted")
                      props.onRemove(s.archiveId)
                    }}
                  />
                </SavedCard>
              )
            })}
            {hosted.map((h) => (
              <SavedCard
                key={h.adventureId}
                planId={h.planId}
                title={h.title}
                encounterId={h.encounterId}
                completed={h.status === "completed"}
                kicker={[props.hostingNow === h.adventureId ? "Hosting Now" : "Hosted", h.status !== "completed" && h.round ? `Round ${h.round}` : ""].filter(Boolean).join(" · ")}
                status={h.status === "completed" ? "Complete" : h.round ? h.turnTitle : "Waiting for Players"}
                heroes={h.party.map((name) => ({ name }))}
                action="Open"
                label={`Open hosted game ${h.title}`}
                busy={props.busy}
                onOpen={() => props.onOpenHosted(h.adventureId)}
              >
                <CardRemove
                  title={h.title}
                  confirming={removing === h.adventureId}
                  disabled={props.busy}
                  onAsk={() => setRemoving(h.adventureId)}
                  onCancel={() => setRemoving(null)}
                  onArchive={() => {
                    setRemoving(null)
                    archiveHosted(h.adventureId, true)
                  }}
                  onDelete={() => {
                    setRemoving(null)
                    mark(hostKey(h), "deleted")
                    props.onRemoveHosted(h.adventureId)
                  }}
                />
              </SavedCard>
            ))}
          </ul>
        </section>
      )}
      {intro.length > 0 && (
        <section>
          <SectionPlate>Intro Adventures</SectionPlate>
          {/* A card is its 3:4 cover over about 240px of text, so the row narrows until a whole card fits the window's height. */}
          <ul className="mx-auto grid max-w-[max(600px,calc((100vh_-_10.5rem_-_240px)*2.25_+_4rem))] auto-rows-fr grid-cols-3 gap-8 pt-2 pb-8">
            {intro.map((a) => (
              <li key={a.id}>
                <Button
                  variant="plain"
                  type="button"
                  disabled={props.busy}
                  onClick={() => props.onAdventure(a.id)}
                  className={cn(cardVariants({ variant: "pick" }), "flex h-full w-full flex-col text-center disabled:cursor-default")}
                  aria-label={a.locked ? `${a.title}, ${a.locked.owned ? "owned, not downloaded" : `locked, ${price(a.locked.priceCents)}`}` : `New game of ${a.title}`}
                >
                  <div className="relative">
                    <ModuleCover id={a.id} title={a.title} players={a.players} className={cn("rounded-none shadow-none", a.locked && "[filter:grayscale(.55)_brightness(.7)]")} />
                    <div className="absolute bottom-3 left-3">
                      <PriceChip a={a} listPrices={props.listPrices} />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col px-6 pt-4 pb-6">
                    <p className="line-clamp-4 flex-1 text-base text-gray-300">{a.teaser}</p>
                    <Details a={a} className="mt-4" />
                    <div className="mt-4 flex justify-center">
                      {a.locked ? (
                        <span className={cn(siteOutline, "px-4 py-1.5 text-sm")}>Details</span>
                      ) : (
                        <span className={buttonClassName("epic", undefined, "text-sm")} style={buttonStyle("epic")}>Play</span>
                      )}
                    </div>
                  </div>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {featured && (
        <section>
          <SectionPlate>Featured Adventure</SectionPlate>
          <Button
            variant="plain"
            type="button"
            disabled={props.busy}
            onClick={() => props.onAdventure(featured.id)}
            className={cn(
              cardVariants({ variant: "frame" }),
              "group relative mt-8 grid w-full grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-center text-left transition-all duration-500 ease-in-out hover:ring-8 hover:ring-primary-500 disabled:cursor-default"
            )}
            aria-label={featured.locked ? `${featured.title}, locked` : `New game of ${featured.title}`}
          >
            {/* The cover again, blurred and dimmed, as the panel's backdrop. */}
            <img src={`/stage/covers/${featured.id}.jpg`} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-black/80 to-black/95" />
            <div className="relative p-8">
              <ModuleCover
                id={featured.id}
                title={featured.title}
                players={featured.players}
                className={cn("transition-transform duration-500 group-hover:-translate-y-1", featured.locked && "[filter:grayscale(.55)_brightness(.7)]")}
              />
            </div>
            <div className="relative flex flex-col justify-center gap-5 py-10 pr-12 pl-4">
              <div>
                <Chip tone="primary" className="rounded-lg px-3 font-display font-bold">
                  The Realm of Myr
                </Chip>
              </div>
              <h3 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-none text-amber-300" style={textShadowSpread}>
                {featured.title}
              </h3>
              <Rule className="w-48" />
              <p className="max-w-[60ch] text-base text-gray-300">{featured.teaser}</p>
              <Details a={featured} />
              <div className="flex items-center gap-5">
                {featured.locked ? (
                  <span className={cn(siteOutline, "px-4 py-1.5")}>Details</span>
                ) : (
                  <span className={buttonClassName("epic", undefined, "text-xl")} style={buttonStyle("epic")}>Play</span>
                )}
                <PriceChip a={featured} listPrices={props.listPrices} />
              </div>
            </div>
          </Button>
        </section>
      )}
      {shelvedSaves.length + shelvedHosted.length > 0 && (
        <section>
          <SectionPlate>Archived</SectionPlate>
          <ul className="mx-auto mt-4 max-w-4xl divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-black/60">
            {shelvedSaves.map((s) => {
              const key = `archived-${s.archiveId}`
              return (
                <ArchivedRow
                  key={key}
                  planId={s.planId}
                  title={s.title}
                  kicker={[played(s.playedAt), s.status === "completed" ? "Complete" : `Round ${s.round}`].filter(Boolean).join(" · ")}
                  busy={props.busy}
                  onRestore={() => {
                    mark(saveKey(s), "restored")
                    props.onArchive(s.archiveId, true)
                  }}
                >
                  <RemoveButton
                    confirming={removing === key}
                    label={`Delete ${s.title} permanently`}
                    confirmLabel={`Confirm deleting ${s.title}`}
                    disabled={props.busy}
                    onBlur={() => setRemoving(null)}
                    onClick={() => {
                      if (removing !== key) return setRemoving(key)
                      setRemoving(null)
                      mark(saveKey(s), "deleted")
                      props.onRemove(s.archiveId)
                    }}
                  />
                </ArchivedRow>
              )
            })}
            {shelvedHosted.map((h) => (
              <ArchivedRow
                key={h.adventureId}
                planId={h.planId}
                title={h.title}
                kicker={["Hosted", h.status === "completed" ? "Complete" : h.round ? `Round ${h.round}` : ""].filter(Boolean).join(" · ")}
                busy={props.busy}
                onRestore={() => archiveHosted(h.adventureId, false)}
              >
                <RemoveButton
                  confirming={removing === h.adventureId}
                  label={`Delete ${h.title} permanently`}
                  confirmLabel={`Confirm deleting ${h.title}`}
                  disabled={props.busy}
                  onBlur={() => setRemoving(null)}
                  onClick={() => {
                    if (removing !== h.adventureId) return setRemoving(h.adventureId)
                    setRemoving(null)
                    archiveHosted(h.adventureId, false)
                    mark(hostKey(h), "deleted")
                    props.onRemoveHosted(h.adventureId)
                  }}
                />
              </ArchivedRow>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  )
}

export function CharactersPage(props: {
  heroes: Hero[]
  art: Record<string, FigureArt>
  busy: boolean
  painting: string | null
  canCreate: boolean
  onCreate?: () => void
  onEdit?: (hero: Hero) => void
  onPaint?: (hero: Hero) => void
  onDelete: (hero: Hero) => void
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  return (
    <PageShell title="Characters">
      {props.onCreate && (
        <div className="flex justify-center">
          <Button variant="epic" disabled={props.busy || !props.canCreate} onClick={props.onCreate}>
            Create New Character
          </Button>
        </div>
      )}
      {props.heroes.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-8">
          {props.heroes.map((h) => {
            const portrait = (h.painted && props.art[h.id]?.portrait) || STOCK_FIGURES[h.figure]?.art.portrait
            return (
              <li key={h.id} className="group relative">
                <Button
                  variant="plain"
                  type="button"
                  disabled={props.busy || !props.onEdit}
                  onClick={() => props.onEdit?.(h)}
                  aria-label={`Edit ${h.name}`}
                  className={cn(cardVariants({ variant: "portrait", interactive: true }), "h-full w-full")}
                >
                  <div className="relative aspect-[4/5] w-full">
                    {portrait ? (
                      <img src={portrait} alt="" className="h-full w-full object-cover object-[50%_15%]" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-5xl text-amber-400">{h.name[0]}</span>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                  </div>
                  <div className="relative z-10 -mt-10 flex w-full flex-col items-center pb-6">
                    <div className="mb-1 w-full truncate px-3 text-center text-2xl font-bold text-amber-400" style={textShadow}>
                      {h.name}
                    </div>
                    <div className="mb-4 text-center text-sm">
                      {h.race} {h.archetype}
                    </div>
                    {props.onEdit && (
                      <span className={buttonClassName("epic", undefined, "text-sm")} style={buttonStyle("epic")}>Edit</span>
                    )}
                  </div>
                </Button>
                {props.onPaint && (
                  <Button
                    variant="plain"
                    type="button"
                    disabled={props.busy}
                    onClick={() => props.onPaint!(h)}
                    aria-label={`Paint ${h.name}`}
                    className={cn(siteOutline, "absolute top-2 right-2 px-2 py-0.5 font-mono text-xxs opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100")}
                  >
                    {props.painting === h.id ? "Painting…" : "Paint"}
                  </Button>
                )}
                <RemoveButton
                  className="absolute right-2 bottom-2"
                  confirming={deleting === h.id}
                  label={`Delete ${h.name}`}
                  confirmLabel={`Confirm deleting ${h.name}`}
                  disabled={props.busy}
                  onBlur={() => setDeleting(null)}
                  onClick={() => {
                    if (deleting !== h.id) return setDeleting(h.id)
                    setDeleting(null)
                    props.onDelete(h)
                  }}
                />
              </li>
            )
          })}
        </ul>
      )}
    </PageShell>
  )
}

// Explore opens the setting's page on the website.
export function SettingsPage(props: { realm: Realm | null; onRealm: () => void }) {
  return (
    <PageShell title="Settings">
      {props.realm && (
        <ul className="flex justify-center">
          <li className="w-[min(34rem,100%)]">
            <Button variant="plain" type="button" onClick={props.onRealm} className={cn(cardVariants({ variant: "pick" }), "group block w-full text-center")}>
              <div className="relative aspect-video">
                <img src={props.realm.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black to-transparent" />
                <div className="absolute inset-x-0 bottom-2 text-center font-display text-2xl" style={textShadow}>
                  {props.realm.name}
                </div>
              </div>
              <div className="px-6 pt-3 pb-6">
                <p className="line-clamp-4 text-base text-gray-300">{props.realm.description.split(/\n\s*\n/)[0]}</p>
                <div className="mt-5 flex justify-center">
                  <span className={buttonClassName("epic", undefined, "text-sm")} style={buttonStyle("epic")}>Explore</span>
                </div>
              </div>
            </Button>
          </li>
        </ul>
      )}
      <section>
        <SectionPlate>Licenses</SectionPlate>
        <p className="mx-auto mt-6 max-w-3xl text-sm text-gray-300">{srdAttribution}</p>
      </section>
    </PageShell>
  )
}
