import { ScrollText, Swords, Users } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Pill } from "@/components/stage/hud"
import { textShadowSpreadLight } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { HostedSummary } from "../../../lib/host/server"
import type { AdventureInfo } from "../runtime/game"
import type { Hero } from "../runtime/heroes"
import type { SaveSummary } from "../runtime/store"
import { type FigureArt, STOCK_FIGURES } from "./figures"
import { ModuleCover } from "./module-cover"
import { FreeTag, type Locked, LockIcon, price } from "./new-game"
import type { Realm } from "./realm"

// The pages behind the title screen, after the website's: the d20 painting dimmed behind, centered display titles,
// and cards in a grid.

export type Page = "adventures" | "characters" | "settings"

const played = (ms?: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""

/** The title screen's simple white outline button. Active fills it. */
export function OutlineButton({ active, className, ...rest }: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "rounded-full border border-white/80 px-6 py-2 font-sans text-sm transition-colors disabled:opacity-40",
        active ? "bg-white text-stage-ink" : "text-white hover:bg-white/15",
        className
      )}
      style={active ? undefined : textShadowSpreadLight}
    />
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-8 text-center font-display text-3xl font-bold text-stage-gold" style={textShadowSpreadLight}>
      {children}
    </h2>
  )
}

function PageShell(props: { page: Page; title: string; account: ReactNode; onNavigate: (page: Page | "home") => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto text-stage-cream">
      <div className="fixed inset-0">
        <img src="/images/app/backgrounds/d20-hero.png" alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-stage-ink/80 via-stage-ink/75 to-stage-ink/90" />
      </div>
      {props.account}
      <nav className="relative flex justify-center gap-3 pt-8" aria-label="Pages">
        <OutlineButton onClick={() => props.onNavigate("home")}>Home</OutlineButton>
        {(
          [
            ["adventures", "Adventures"],
            ["characters", "Characters"],
            ["settings", "Settings"],
          ] as const
        ).map(([page, label]) => (
          <OutlineButton key={page} active={props.page === page} aria-current={props.page === page ? "page" : undefined} onClick={() => props.onNavigate(page)}>
            {label}
          </OutlineButton>
        ))}
      </nav>
      <h1 className="relative mt-10 text-center font-display text-[clamp(44px,5vw,72px)]" style={textShadowSpreadLight}>
        {props.title}
      </h1>
      <div className="relative mx-auto max-w-6xl space-y-16 px-10 pt-10 pb-24">{props.children}</div>
    </div>
  )
}

// The featured adventure gets its own panel below the intro adventures.
const FEATURED = "march-of-davos"

const playersLabel = ([min, max]: [number, number]) => `${min === max ? min : `${min}–${max}`} ${max === 1 ? "player" : "players"}`

// What the adventure's heroes are: its premades, the player's own, or either.
const heroesLabel = (a: AdventureInfo) =>
  a.premades.length && a.options ? "Premade or your own heroes" : a.premades.length ? (a.premades.length === 1 ? "Premade hero" : `${a.premades.length} premade heroes`) : "Create your heroes"

// A playable adventure, or one for sale that is not installed yet.
type Listed = { info?: AdventureInfo; locked?: Locked; id: string; title: string; teaser: string; players: [number, number] }

function Details({ items }: { items: { icon: ReactNode; text: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 font-sans text-[12px] text-stage-cream/75">
      {items.map((d) => (
        <li key={d.text} className="flex items-center gap-1.5">
          <span className="text-stage-gold">{d.icon}</span>
          {d.text}
        </li>
      ))}
    </ul>
  )
}

function details(a: Listed) {
  const icon = "h-3.5 w-3.5"
  return [
    { icon: <Users className={icon} />, text: playersLabel(a.players) },
    ...(a.info ? [{ icon: <ScrollText className={icon} />, text: `${a.info.scenes} scenes` }] : []),
    ...(a.info ? [{ icon: <Swords className={icon} />, text: heroesLabel(a.info) }] : []),
  ]
}

function PriceTag({ a, listPrices }: { a: Listed; listPrices: Record<string, number> }) {
  if (a.locked && !a.locked.owned)
    return (
      <span className="text-stage-gold">
        <LockIcon />
        {price(a.locked.priceCents)}
      </span>
    )
  if (a.locked) return <span className="text-stage-gold">Owned</span>
  return listPrices[a.id] ? <FreeTag cents={listPrices[a.id]} /> : <span className="font-semibold text-stage-gold">FREE</span>
}

export function AdventuresPage(props: {
  saves: SaveSummary[]
  adventures: AdventureInfo[]
  locked: Locked[]
  listPrices: Record<string, number>
  busy: boolean
  account: ReactNode
  onNavigate: (page: Page | "home") => void
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
    <PageShell page="adventures" title="Adventures" account={props.account} onNavigate={props.onNavigate}>
      {props.saves.length + props.hosted.length > 0 && (
        <section>
          <SectionTitle>Your Adventures</SectionTitle>
          <ul className="grid grid-cols-3 gap-8">
            {props.saves.map((s) => {
              const current = s.archiveId === undefined
              const key = String(s.archiveId ?? "current")
              return (
                <li key={key} className="group relative">
                  <button
                    type="button"
                    disabled={props.busy}
                    onClick={() => (current ? props.onContinue() : props.onResume(s.archiveId!))}
                    className="block w-full text-left disabled:cursor-default"
                    aria-label={`${current ? "Continue" : "Resume"} ${s.title}`}
                  >
                    <ModuleCover
                      id={s.planId}
                      title={s.title}
                      players={players(s.planId)}
                      className={cn("transition-[filter,transform] duration-300 group-hover:-translate-y-1", s.status === "completed" && "[filter:saturate(.5)_brightness(.8)]")}
                    />
                    <div className="mt-4 flex items-baseline justify-between gap-3">
                      <span className="truncate font-serif text-[15px]">{s.status === "completed" ? "Complete" : `Round ${s.round} · ${s.turnTitle}`}</span>
                      <span className={cn("shrink-0 font-sans text-[11px] uppercase tracking-[0.2em]", current ? "text-stage-gold" : "text-stage-muted")}>
                        {current ? "Playing" : played(s.playedAt)}
                      </span>
                    </div>
                    {s.party.length > 0 && <div className="mt-1 truncate text-[12px] text-stage-muted">{s.party.join(", ")}</div>}
                  </button>
                  <Pill
                    className={cn(
                      "absolute top-2 right-2 px-2 py-1 text-[10px] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
                      removing === key && "opacity-100"
                    )}
                    disabled={props.busy}
                    aria-label={removing === key ? `Confirm removing ${s.title}` : `Remove ${s.title}`}
                    onBlur={() => setRemoving(null)}
                    onClick={() => {
                      if (removing !== key) return setRemoving(key)
                      setRemoving(null)
                      props.onRemove(s.archiveId)
                    }}
                  >
                    {removing === key ? "Confirm" : "Remove"}
                  </Pill>
                </li>
              )
            })}
            {props.hosted.map((h) => (
              <li key={h.adventureId}>
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => props.onOpenHosted(h.adventureId)}
                  className="group block w-full text-left disabled:cursor-default"
                  aria-label={`Open hosted game ${h.title}`}
                >
                  <ModuleCover
                    id={h.planId}
                    title={h.title}
                    players={players(h.planId)}
                    className={cn("transition-[filter,transform] group-hover:-translate-y-1", h.status === "completed" && "[filter:saturate(.5)_brightness(.8)]")}
                  />
                  <div className="mt-3 truncate text-[13px]">{h.status === "completed" ? "Complete" : h.round ? `Round ${h.round} · ${h.turnTitle}` : "Waiting for players"}</div>
                  <div className="truncate text-[11px] text-stage-muted">
                    {props.hostingNow === h.adventureId ? "Hosting now" : "Hosted"} · {h.players} at the table
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {intro.length > 0 && (
        <section>
          <SectionTitle>Intro Adventures</SectionTitle>
          <ul className="grid grid-cols-3 gap-8">
            {intro.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => props.onAdventure(a.id)}
                  className="group flex h-full w-full flex-col overflow-hidden rounded-[6px] border border-white/10 bg-black/55 text-left shadow-[0_24px_60px_#000c] ring-1 ring-black transition-all duration-300 hover:-translate-y-1 hover:border-stage-gold/50 disabled:cursor-default"
                  aria-label={a.locked ? `${a.title}, ${a.locked.owned ? "owned, not downloaded" : `locked, ${price(a.locked.priceCents)}`}` : `New game of ${a.title}`}
                >
                  <ModuleCover id={a.id} title={a.title} players={a.players} className={cn("rounded-none shadow-none", a.locked && "[filter:grayscale(.55)_brightness(.7)]")} />
                  <div className="flex flex-1 flex-col gap-4 px-5 pt-4 pb-5">
                    <p className="line-clamp-3 font-serif text-[15px] leading-relaxed text-stage-cream/90">{a.teaser}</p>
                    <div className="mt-auto space-y-3 border-t border-stage-line/15 pt-4">
                      <Details items={details(a)} />
                      <div className="flex items-center justify-between font-sans text-[12px]">
                        <PriceTag a={a} listPrices={props.listPrices} />
                        {a.locked ? (
                          <span className="font-sans text-[11px] uppercase tracking-[0.2em] text-stage-cream/60 transition-colors group-hover:text-stage-gold">Details →</span>
                        ) : (
                          <Button asChild variant="epic" className="border-[3px] px-4 py-1 text-[11px]">
                            <span>Play</span>
                          </Button>
                        )}
                      </div>
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
          <SectionTitle>Featured Adventure</SectionTitle>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onAdventure(featured.id)}
            className="group relative grid w-full grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-center overflow-hidden rounded-[8px] border border-stage-gold/40 text-left shadow-[0_30px_80px_#000d] ring-1 ring-black transition-colors duration-300 hover:border-stage-gold/80 disabled:cursor-default"
            aria-label={featured.locked ? `${featured.title}, locked` : `New game of ${featured.title}`}
          >
            {/* The cover again, blurred and dimmed, as the panel's backdrop. */}
            <img src={`/stage/covers/${featured.id}.jpg`} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-stage-ink/80 to-stage-ink/95" />
            <div className="relative p-8">
              <ModuleCover
                id={featured.id}
                title={featured.title}
                players={featured.players}
                className={cn("transition-transform duration-300 group-hover:-translate-y-1", featured.locked && "[filter:grayscale(.55)_brightness(.7)]")}
              />
            </div>
            <div className="relative flex flex-col justify-center gap-6 py-10 pr-12 pl-4">
              <div className="font-sans text-[11px] font-medium uppercase tracking-[0.3em] text-stage-gold">The Realm of Myr</div>
              <h3 className="-mt-3 font-display text-[clamp(36px,4vw,56px)] leading-none" style={textShadowSpreadLight}>
                {featured.title}
              </h3>
              <div className="h-px w-32 bg-gradient-to-r from-stage-gold/80 to-transparent" />
              <p className="max-w-[60ch] font-serif text-[16px] leading-relaxed text-stage-cream/90">{featured.teaser}</p>
              <Details items={details(featured)} />
              <div className="flex items-center gap-6">
                {featured.locked ? (
                  <span className="font-display text-2xl text-stage-gold">{featured.locked.owned ? "Owned" : price(featured.locked.priceCents)}</span>
                ) : (
                  <Button asChild variant="epic" className="text-xl">
                    <span>Play</span>
                  </Button>
                )}
                <span className="font-sans text-sm">
                  <PriceTag a={featured} listPrices={props.listPrices} />
                </span>
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
  account: ReactNode
  onNavigate: (page: Page | "home") => void
  onCreate: () => void
  onEdit: (hero: Hero) => void
  onPaint?: (hero: Hero) => void
  onDelete: (hero: Hero) => void
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  return (
    <PageShell page="characters" title="Characters" account={props.account} onNavigate={props.onNavigate}>
      <div className="-mt-4 flex justify-center">
        <Button variant="epic" disabled={props.busy || !props.canCreate} onClick={props.onCreate}>
          Create New Character
        </Button>
      </div>
      {props.heroes.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-6">
          {props.heroes.map((h) => {
            const portrait = (h.painted && props.art[h.id]?.portrait) || STOCK_FIGURES[h.figure]?.art.portrait
            return (
              <li key={h.id} className="group relative">
                <button type="button" disabled={props.busy} onClick={() => props.onEdit(h)} className="block w-full text-left" aria-label={`Edit ${h.name}`}>
                  {portrait ? (
                    <img
                      src={portrait}
                      alt=""
                      className="aspect-[3/4] w-full rounded-[4px] border border-stage-brass/50 object-cover object-[50%_15%] shadow-[0_18px_40px_#000a] [filter:sepia(.2)_saturate(.88)]"
                    />
                  ) : (
                    <span className="grid aspect-[3/4] w-full place-items-center rounded-[4px] border border-stage-brass/50 font-display text-5xl text-stage-gold">{h.name[0]}</span>
                  )}
                  <div className="mt-3 truncate text-center font-display text-lg">{h.name}</div>
                  <div className="truncate text-center text-[12px] text-stage-muted">
                    {h.race} {h.archetype}
                  </div>
                </button>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  {props.onPaint && (
                    <Pill className="px-2 py-1 text-[10px]" disabled={props.busy} onClick={() => props.onPaint!(h)} aria-label={`Paint ${h.name}`}>
                      {props.painting === h.id ? "Painting…" : "Paint"}
                    </Pill>
                  )}
                  <Pill
                    className="px-2 py-1 text-[10px]"
                    disabled={props.busy}
                    aria-label={deleting === h.id ? `Confirm deleting ${h.name}` : `Delete ${h.name}`}
                    onBlur={() => setDeleting(null)}
                    onClick={() => {
                      if (deleting !== h.id) return setDeleting(h.id)
                      setDeleting(null)
                      props.onDelete(h)
                    }}
                  >
                    {deleting === h.id ? "Confirm" : "Delete"}
                  </Pill>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </PageShell>
  )
}

// Explore opens the setting's page on the website.
export function SettingsPage(props: { realm: Realm | null; account: ReactNode; onNavigate: (page: Page | "home") => void; onRealm: () => void }) {
  return (
    <PageShell page="settings" title="Settings" account={props.account} onNavigate={props.onNavigate}>
      {props.realm && (
        <ul className="flex justify-center">
          <li className="w-[min(560px,100%)]">
            <button
              type="button"
              onClick={props.onRealm}
              className="group block w-full overflow-hidden rounded-[6px] border border-white/20 bg-black/80 text-left ring-[6px] ring-black transition-all duration-500 hover:ring-stage-gold/60"
            >
              <div className="relative aspect-video">
                <img src={props.realm.image} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black to-transparent" />
                <div className="absolute inset-x-0 bottom-3 text-center font-display text-3xl" style={textShadowSpreadLight}>
                  {props.realm.name}
                </div>
              </div>
              <div className="px-6 pt-4 pb-6">
                <p className="line-clamp-4 font-serif text-[15px] text-stage-cream/85">{props.realm.description.split(/\n\s*\n/)[0]}</p>
                <div className="mt-5 flex justify-center">
                  <Button asChild variant="epic" size="sm" className="text-sm">
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
