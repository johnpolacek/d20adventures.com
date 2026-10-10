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
  onAdventure: (id: string) => void
  // Website games this account hosts, and the one whose GM this app is running.
  hosted: HostedSummary[]
  hostingNow: string | null
  onOpenHosted: (adventureId: string) => void
}) {
  const players = (id: string): [number, number] => props.adventures.find((a) => a.id === id)?.players ?? props.locked.find((a) => a.id === id)?.players ?? [1, 4]
  return (
    <PageShell page="adventures" title="Adventures" account={props.account} onNavigate={props.onNavigate}>
      {props.saves.length + props.hosted.length > 0 && (
        <section>
          <SectionTitle>Your Adventures</SectionTitle>
          <ul className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {props.saves.map((s) => {
              const current = s.archiveId === undefined
              return (
                <li key={s.archiveId ?? "current"}>
                  <button
                    type="button"
                    disabled={props.busy}
                    onClick={() => (current ? props.onContinue() : props.onResume(s.archiveId!))}
                    className="group block w-full text-left disabled:cursor-default"
                    aria-label={`${current ? "Continue" : "Resume"} ${s.title}`}
                  >
                    <ModuleCover
                      id={s.planId}
                      title={s.title}
                      players={players(s.planId)}
                      className={cn("transition-[filter,transform] group-hover:-translate-y-1", s.status === "completed" && "[filter:saturate(.5)_brightness(.8)]")}
                    />
                    <div className="mt-3 truncate text-[13px]">{s.status === "completed" ? "Complete" : `Round ${s.round} · ${s.turnTitle}`}</div>
                    <div className="truncate text-[11px] text-stage-muted">{current ? "Playing now" : `Played ${played(s.playedAt)}`}</div>
                  </button>
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
      <section>
        <SectionTitle>New Adventure</SectionTitle>
        <ul className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {props.adventures.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={props.busy}
                onClick={() => props.onAdventure(a.id)}
                className="group block w-full text-left disabled:cursor-default"
                aria-label={`New game of ${a.title}`}
              >
                <ModuleCover id={a.id} title={a.title} players={a.players} className="transition-transform group-hover:-translate-y-1" />
                <div className="mt-3 text-[12px]">{props.listPrices[a.id] && <FreeTag cents={props.listPrices[a.id]} />}</div>
              </button>
            </li>
          ))}
          {props.locked.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={props.busy}
                onClick={() => props.onAdventure(a.id)}
                className="group block w-full text-left disabled:cursor-default"
                aria-label={`${a.title}, ${a.owned ? "owned, not downloaded" : `locked, ${price(a.priceCents)}`}`}
              >
                <ModuleCover id={a.id} title={a.title} players={a.players} className="[filter:grayscale(.55)_brightness(.7)] transition-transform group-hover:-translate-y-1" />
                <div className="mt-3 text-[12px] text-stage-gold">
                  <LockIcon />
                  {a.owned ? "Owned" : price(a.priceCents)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
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
