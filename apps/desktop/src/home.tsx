import { type ReactNode, useState } from "react"
import { eyebrow, Pill } from "@/components/stage/hud"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { HostedSummary } from "../../../lib/host/server"
import type { AdventureInfo } from "../runtime/game"
import type { Hero } from "../runtime/heroes"
import type { Save, SaveSummary } from "../runtime/store"
import { type FigureArt, STOCK_FIGURES } from "./figures"
import { ModuleCover } from "./module-cover"
import { FreeTag, type Locked, LockIcon, price } from "./new-game"
import type { Realm } from "./realm"

const played = (ms?: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""

function Shelf({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className={eyebrow}>{title}</h2>
        {action}
      </div>
      <ul className="flex gap-5 overflow-x-auto pb-3">{children}</ul>
    </section>
  )
}

// Home: the latest adventure over its live scene with Continue, then shelves of saved adventures, heroes, adventures
// to start, and the Realm. The stage behind shows through the banner.
export function Home(props: {
  save: Save | null
  saves: SaveSummary[]
  adventures: AdventureInfo[]
  locked: Locked[]
  listPrices: Record<string, number>
  // The adventure a first game starts, shown in the banner when nothing is saved.
  starter?: AdventureInfo
  heroes: Hero[]
  art: Record<string, FigureArt>
  realm: Realm | null
  busy: boolean
  painting: string | null
  canCreate: boolean
  account: ReactNode
  onContinue: () => void
  onResume: (archiveId: number) => void
  onAdventure: (id: string) => void
  onCreateHero: () => void
  onEditHero: (hero: Hero) => void
  onPaintHero?: (hero: Hero) => void
  onDeleteHero: (hero: Hero) => void
  onRealm: () => void
  // Website games this account hosts, and the one whose GM this app is running.
  hosted: HostedSummary[]
  hostingNow: string | null
  onOpenHosted: (adventureId: string) => void
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const turn = props.save?.turns.find((t) => t._id === props.save?.adventure.currentTurnId)
  const players = (id: string): [number, number] => props.adventures.find((a) => a.id === id)?.players ?? props.locked.find((a) => a.id === id)?.players ?? [1, 4]
  const pcs = (turn?.characters ?? []).filter((c) => c.type === "pc").map((c) => c.name.split(" ")[0])
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto text-stage-cream">
      {props.account}
      <header className="flex min-h-[64vh] flex-col justify-end bg-gradient-to-b from-stage-ink/40 via-transparent to-stage-ink px-12 pt-24 pb-12">
        <div className={eyebrow}>D20 Adventures</div>
        {props.save ? (
          <>
            <h1 className="mt-3 font-display text-[clamp(40px,5.5vw,72px)] leading-none [text-shadow:0_2px_24px_#000c]">{props.save.adventure.title}</h1>
            <p className="mt-4 font-serif text-lg text-stage-cream/90 [text-shadow:0_1px_8px_#000]">
              {props.save.adventure.status === "completed" ? "Adventure complete" : `Round ${turn?.order ?? 1} · ${turn?.title ?? ""}`}
              {pcs.length > 0 && <span className="text-stage-cream/70"> · {pcs.join(", ")}</span>}
            </p>
            <div className="mt-6">
              <Button variant="epic" className="text-xl" disabled={props.busy} onClick={props.onContinue}>
                Continue
              </Button>
            </div>
          </>
        ) : props.starter ? (
          <>
            <h1 className="mt-3 font-display text-[clamp(40px,5.5vw,72px)] leading-none [text-shadow:0_2px_24px_#000c]">{props.starter.title}</h1>
            {props.starter.teaser && <p className="mt-4 max-w-[60ch] font-serif text-lg text-stage-cream/90 [text-shadow:0_1px_8px_#000]">{props.starter.teaser}</p>}
            <div className="mt-6">
              <Button variant="epic" className="text-xl" disabled={props.busy} onClick={() => props.onAdventure(props.starter!.id)}>
                Begin
              </Button>
            </div>
          </>
        ) : null}
      </header>
      <div className="space-y-12 bg-stage-ink px-12 pt-2 pb-20">
        {props.saves.length + props.hosted.length > 0 && (
          <Shelf title="Your adventures">
            {props.saves.map((s) => {
              const current = s.archiveId === undefined
              return (
                <li key={s.archiveId ?? "current"} className="w-60 shrink-0">
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
                    <div className="mt-2 truncate text-[13px]">{s.status === "completed" ? "Complete" : `Round ${s.round} · ${s.turnTitle}`}</div>
                    <div className="truncate text-[11px] text-stage-muted">{current ? "Playing now" : `Played ${played(s.playedAt)}`}</div>
                  </button>
                </li>
              )
            })}
            {props.hosted.map((h) => (
              <li key={h.adventureId} className="w-60 shrink-0">
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
                  <div className="mt-2 truncate text-[13px]">{h.status === "completed" ? "Complete" : h.round ? `Round ${h.round} · ${h.turnTitle}` : "Waiting for players"}</div>
                  <div className="truncate text-[11px] text-stage-muted">
                    {props.hostingNow === h.adventureId ? "Hosting now" : "Hosted"} · {h.players} at the table
                  </div>
                </button>
              </li>
            ))}
          </Shelf>
        )}
        <Shelf
          title="Heroes"
          action={
            props.heroes.length > 0 && (
              <Pill disabled={props.busy || !props.canCreate} onClick={props.onCreateHero}>
                New hero
              </Pill>
            )
          }
        >
          {props.heroes.map((h) => {
            const portrait = (h.painted && props.art[h.id]?.portrait) || STOCK_FIGURES[h.figure]?.art.portrait
            return (
              <li key={h.id} className="group relative w-44 shrink-0">
                <button type="button" disabled={props.busy} onClick={() => props.onEditHero(h)} className="block w-full text-left" aria-label={`Edit ${h.name}`}>
                  {portrait ? (
                    <img src={portrait} alt="" className="aspect-[3/4] w-full rounded-[3px] border border-stage-brass/50 object-cover object-[50%_15%] [filter:sepia(.2)_saturate(.88)]" />
                  ) : (
                    <span className="grid aspect-[3/4] w-full place-items-center rounded-[3px] border border-stage-brass/50 font-display text-4xl text-stage-gold">{h.name[0]}</span>
                  )}
                  <div className="mt-2 truncate font-serif text-sm">{h.name}</div>
                  <div className="truncate text-[11px] text-stage-muted">
                    {h.race} {h.archetype}
                  </div>
                </button>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  {props.onPaintHero && (
                    <Pill className="px-2 py-1 text-[10px]" disabled={props.busy} onClick={() => props.onPaintHero!(h)} aria-label={`Paint ${h.name}`}>
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
                      props.onDeleteHero(h)
                    }}
                  >
                    {deleting === h.id ? "Confirm" : "Delete"}
                  </Pill>
                </div>
              </li>
            )
          })}
          {props.heroes.length === 0 && (
            <li className="w-44 shrink-0">
              <button
                type="button"
                disabled={props.busy || !props.canCreate}
                onClick={props.onCreateHero}
                className="stage-leather grid aspect-[3/4] w-full place-items-center rounded-[3px] border border-dashed border-stage-line/40 font-serif text-sm hover:border-stage-gold/60 disabled:cursor-default disabled:opacity-40"
              >
                New hero
              </button>
            </li>
          )}
        </Shelf>
        <Shelf title="New adventure">
          {props.adventures.map((a) => (
            <li key={a.id} className="w-60 shrink-0">
              <button
                type="button"
                disabled={props.busy}
                onClick={() => props.onAdventure(a.id)}
                className="group block w-full text-left disabled:cursor-default"
                aria-label={`New game of ${a.title}`}
              >
                <ModuleCover id={a.id} title={a.title} players={a.players} className="transition-transform group-hover:-translate-y-1" />
                <div className="mt-2 text-[12px]">{props.listPrices[a.id] && <FreeTag cents={props.listPrices[a.id]} />}</div>
              </button>
            </li>
          ))}
          {props.locked.map((a) => (
            <li key={a.id} className="w-60 shrink-0">
              <button
                type="button"
                disabled={props.busy}
                onClick={() => props.onAdventure(a.id)}
                className="group block w-full text-left disabled:cursor-default"
                aria-label={`${a.title}, ${a.owned ? "owned, not downloaded" : `locked, ${price(a.priceCents)}`}`}
              >
                <ModuleCover id={a.id} title={a.title} players={a.players} className="[filter:grayscale(.55)_brightness(.7)] transition-transform group-hover:-translate-y-1" />
                <div className="mt-2 text-[12px] text-stage-gold">
                  <LockIcon />
                  {a.owned ? "Owned" : price(a.priceCents)}
                </div>
              </button>
            </li>
          ))}
        </Shelf>
        {props.realm && (
          <section>
            <h2 className={cn(eyebrow, "mb-4")}>The setting</h2>
            <button type="button" onClick={props.onRealm} className="group relative block h-72 w-full max-w-5xl overflow-hidden rounded-[4px] text-left shadow-[0_18px_40px_#000a]">
              <img src={props.realm.image} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
              <div className="absolute inset-0 bg-gradient-to-r from-stage-ink/90 via-stage-ink/50 to-transparent" />
              <div className="relative flex h-full max-w-xl flex-col justify-end p-8">
                <div className="font-display text-4xl">{props.realm.name}</div>
                <p className="mt-3 line-clamp-3 font-serif text-[15px] text-stage-cream/90">{props.realm.description.split(/\n\s*\n/)[0]}</p>
                <span className="mt-4 text-sm text-stage-gold">Explore the realm</span>
              </div>
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
