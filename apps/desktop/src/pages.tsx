import { Trash2 } from "lucide-react"
import { type ReactNode, useState } from "react"
import { textShadow, textShadowSpread } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import ImageHeader from "@/components/ui/image-header"
import { Chip, Rule, SectionPlate, siteCard, siteCardHover, siteLabel, siteOutline } from "@/components/ui/site"
import { cn } from "@/lib/utils"
import type { HostedSummary } from "../../../lib/host/server"
import type { AdventureInfo } from "../runtime/game"
import type { Hero } from "../runtime/heroes"
import type { SaveSummary } from "../runtime/store"
import { type FigureArt, STOCK_FIGURES } from "./figures"
import { ModuleCover } from "./module-cover"
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
        <ImageHeader variant="compact" imageUrl="/images/app/backgrounds/d20-hero.png" title={props.title} />
        <div className="relative z-10 mx-auto -mt-32 max-w-6xl space-y-12 px-8 pb-24">{props.children}</div>
      </div>
    </div>
  )
}

// The website's small red delete control. The first press asks, the second confirms.
function RemoveButton(props: { confirming: boolean; label: string; confirmLabel: string; className?: string; disabled?: boolean; onBlur: () => void; onClick: () => void }) {
  return (
    <button
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
    </button>
  )
}

// The featured adventure gets its own panel below the intro adventures.
const FEATURED = "march-of-davos"

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

// A saved or hosted adventure: its cover in the site's card, where it stands, and the button that reopens it.
function SavedCard(props: {
  planId: string
  title: string
  players: [number, number]
  completed: boolean
  chip: ReactNode
  status: string
  note?: string
  action: string
  label: string
  busy: boolean
  onOpen: () => void
  children?: ReactNode
}) {
  return (
    <li className="relative">
      <button
        type="button"
        disabled={props.busy}
        onClick={props.onOpen}
        aria-label={props.label}
        className={cn(siteCard, siteCardHover, "flex h-full w-full flex-col text-center disabled:cursor-default")}
      >
        <div className="relative">
          <ModuleCover id={props.planId} title={props.title} players={props.players} className={cn("rounded-none shadow-none", props.completed && "[filter:saturate(.5)_brightness(.8)]")} />
          <div className="absolute bottom-3 left-3">{props.chip}</div>
        </div>
        <div className="flex flex-1 flex-col items-center px-5 pt-4 pb-6">
          <div className="line-clamp-2 w-full font-display text-lg text-amber-300">{props.status}</div>
          {props.note && <div className="mt-1 line-clamp-2 w-full text-sm text-gray-300">{props.note}</div>}
          <div className="mt-auto pt-4">
            <Button asChild variant="epic" className="text-sm">
              <span>{props.action}</span>
            </Button>
          </div>
        </div>
      </button>
      {props.children}
    </li>
  )
}

export function AdventuresPage(props: {
  saves: SaveSummary[]
  adventures: AdventureInfo[]
  locked: Locked[]
  listPrices: Record<string, number>
  busy: boolean
  onContinue: () => void
  onResume: (archiveId: number) => void
  // Deletes a saved adventure: an archived one by id, or the current one.
  onRemove: (archiveId?: number) => void
  onAdventure: (id: string) => void
  // Website games this account hosts, and the one whose GM this app is running.
  hosted: HostedSummary[]
  hostingNow: string | null
  onOpenHosted: (adventureId: string) => void
}) {
  const [removing, setRemoving] = useState<string | null>(null)
  const players = (id: string): [number, number] => props.adventures.find((a) => a.id === id)?.players ?? props.locked.find((a) => a.id === id)?.players ?? [1, 4]
  const listed: Listed[] = [...props.adventures.map((info) => ({ ...info, info })), ...props.locked.map((locked) => ({ ...locked, locked }))]
  const featured = listed.find((a) => a.id === FEATURED)
  const intro = listed.filter((a) => a.id !== FEATURED)
  return (
    <PageShell title="Adventures">
      {props.saves.length + props.hosted.length > 0 && (
        <section>
          <SectionPlate>Your Adventures</SectionPlate>
          <ul className="grid grid-cols-3 gap-8 py-8">
            {props.saves.map((s) => {
              const current = s.archiveId === undefined
              const key = String(s.archiveId ?? "current")
              return (
                <SavedCard
                  key={key}
                  planId={s.planId}
                  title={s.title}
                  players={players(s.planId)}
                  completed={s.status === "completed"}
                  chip={<Chip tone={current ? "amber" : "dark"}>{current ? "Playing" : played(s.playedAt)}</Chip>}
                  status={s.status === "completed" ? "Complete" : `Round ${s.round} · ${s.turnTitle}`}
                  note={s.party.join(", ")}
                  action={current ? "Continue" : "Resume"}
                  label={`${current ? "Continue" : "Resume"} ${s.title}`}
                  busy={props.busy}
                  onOpen={() => (current ? props.onContinue() : props.onResume(s.archiveId!))}
                >
                  <RemoveButton
                    className="absolute right-6 bottom-6"
                    confirming={removing === key}
                    label={`Remove ${s.title}`}
                    confirmLabel={`Confirm removing ${s.title}`}
                    disabled={props.busy}
                    onBlur={() => setRemoving(null)}
                    onClick={() => {
                      if (removing !== key) return setRemoving(key)
                      setRemoving(null)
                      props.onRemove(s.archiveId)
                    }}
                  />
                </SavedCard>
              )
            })}
            {props.hosted.map((h) => (
              <SavedCard
                key={h.adventureId}
                planId={h.planId}
                title={h.title}
                players={players(h.planId)}
                completed={h.status === "completed"}
                chip={<Chip tone={props.hostingNow === h.adventureId ? "amber" : "primary"}>{props.hostingNow === h.adventureId ? "Hosting now" : "Hosted"}</Chip>}
                status={h.status === "completed" ? "Complete" : h.round ? `Round ${h.round} · ${h.turnTitle}` : "Waiting for players"}
                note={`${h.players} at the table`}
                action="Open"
                label={`Open hosted game ${h.title}`}
                busy={props.busy}
                onOpen={() => props.onOpenHosted(h.adventureId)}
              />
            ))}
          </ul>
        </section>
      )}
      {intro.length > 0 && (
        <section>
          <SectionPlate>Intro Adventures</SectionPlate>
          <ul className="grid auto-rows-fr grid-cols-3 gap-8 py-8">
            {intro.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => props.onAdventure(a.id)}
                  className={cn(siteCard, siteCardHover, "flex h-full w-full flex-col text-center disabled:cursor-default")}
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
                        <Button asChild variant="epic" className="text-sm">
                          <span>Play</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {featured && (
        <section>
          <SectionPlate>Featured Adventure</SectionPlate>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onAdventure(featured.id)}
            className={cn(
              siteCard,
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
                  <Button asChild variant="epic" className="text-xl">
                    <span>Play</span>
                  </Button>
                )}
                <PriceChip a={featured} listPrices={props.listPrices} />
              </div>
            </div>
          </button>
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
  onCreate: () => void
  onEdit: (hero: Hero) => void
  onPaint?: (hero: Hero) => void
  onDelete: (hero: Hero) => void
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  return (
    <PageShell title="Characters">
      <div className="flex justify-center">
        <Button variant="epic" disabled={props.busy || !props.canCreate} onClick={props.onCreate}>
          Create New Character
        </Button>
      </div>
      {props.heroes.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-8">
          {props.heroes.map((h) => {
            const portrait = (h.painted && props.art[h.id]?.portrait) || STOCK_FIGURES[h.figure]?.art.portrait
            return (
              <li key={h.id} className="group relative">
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => props.onEdit(h)}
                  aria-label={`Edit ${h.name}`}
                  className="flex h-full w-full flex-col items-center overflow-hidden rounded-lg border border-white/10 bg-black font-display ring-8 ring-black/30 transition-all duration-500 ease-in-out hover:scale-105 hover:ring-primary-400/80"
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
                    <Button asChild variant="epic" className="text-sm">
                      <span>Edit</span>
                    </Button>
                  </div>
                </button>
                {props.onPaint && (
                  <button
                    type="button"
                    disabled={props.busy}
                    onClick={() => props.onPaint!(h)}
                    aria-label={`Paint ${h.name}`}
                    className={cn(siteOutline, "absolute top-2 right-2 px-2 py-0.5 font-mono text-xxs opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100")}
                  >
                    {props.painting === h.id ? "Painting…" : "Paint"}
                  </button>
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
            <button type="button" onClick={props.onRealm} className={cn(siteCard, siteCardHover, "group block w-full text-center")}>
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
                  <Button asChild variant="epic" className="text-sm">
                    <span>Explore</span>
                  </Button>
                </div>
              </div>
            </button>
          </li>
        </ul>
      )}
    </PageShell>
  )
}
