import { type ReactNode, useState } from "react"
import { eyebrow, Pill } from "@/components/stage/hud"
import { textShadowSpreadLight } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AdventureInfo } from "../runtime/game"
import type { Hero } from "../runtime/heroes"
import type { Save, SaveSummary } from "../runtime/store"
import { type FigureArt, STOCK_FIGURES } from "./figures"
import { ModuleCover } from "./module-cover"
import { FreeTag, type Locked, LockIcon, price } from "./new-game"
import type { Realm } from "./realm"

const played = (ms?: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""

// Adventure covers take a quarter of the width, so a row of four fills the screen. Longer rows scroll.
const quarter = "w-[calc((100%-4.5rem)/4)] shrink-0"

function Shelf({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className={eyebrow}>{title}</h2>
        {action}
      </div>
      <ul className="flex gap-6 overflow-x-auto pb-3">{children}</ul>
    </section>
  )
}

// Home: the website's title screen with Continue and quick links, then shelves of saved adventures, heroes, adventures
// to start, and the Realm.
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
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const turn = props.save?.turns.find((t) => t._id === props.save?.adventure.currentTurnId)
  const players = (id: string): [number, number] => props.adventures.find((a) => a.id === id)?.players ?? props.locked.find((a) => a.id === id)?.players ?? [1, 4]
  const pcs = (turn?.characters ?? []).filter((c) => c.type === "pc").map((c) => c.name.split(" ")[0])
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto text-stage-cream">
      {props.account}
      {/* The title screen, as on the website, with quick ways into the game below the die. */}
      <header className="relative h-screen min-h-[640px] overflow-hidden">
        <img src="/images/app/backgrounds/d20-hero.png" alt="" className="fade-in absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-stage-ink" />
        <h1 className="fade-in relative mt-[12vh] text-center font-display text-[clamp(40px,5vw,72px)] delay-[400ms]" style={textShadowSpreadLight}>
          EXpeRienCe <span className="inline-block scale-90">tHe</span> Thrill
        </h1>
        <div className="absolute inset-x-0 bottom-[5vh] flex flex-col items-center text-center">
          <div className="fade-in font-display text-2xl font-bold delay-[600ms]" style={textShadowSpreadLight}>
            Of tHe
          </div>
          <div className="fade-in -mt-3 font-display text-[clamp(80px,9vw,128px)] leading-none delay-[800ms]" style={textShadowSpreadLight}>
            D20
          </div>
          <div className="fade-in mt-6 flex flex-col items-center gap-4 delay-[1000ms]">
            {props.save ? (
              <>
                <p className={cn(eyebrow, "text-[12px]")} style={textShadowSpreadLight}>
                  {props.save.adventure.title} · {props.save.adventure.status === "completed" ? "Adventure complete" : `Round ${turn?.order ?? 1} · ${turn?.title ?? ""}`}
                  {pcs.length > 0 && <span className="text-stage-cream/70"> · {pcs.join(", ")}</span>}
                </p>
                <Button variant="epic" size="lg" disabled={props.busy} onClick={props.onContinue}>
                  Continue
                </Button>
              </>
            ) : (
              props.starter && (
                <Button variant="epic" size="lg" disabled={props.busy} onClick={() => props.onAdventure(props.starter!.id)}>
                  Begin
                </Button>
              )
            )}
            <nav className="flex flex-wrap justify-center gap-2" aria-label="Home">
              {props.saves.length > 0 && <Pill onClick={() => jump("your-adventures")}>Your adventures</Pill>}
              <Pill onClick={() => jump("new-adventure")}>New adventure</Pill>
              <Pill onClick={() => jump("heroes")}>Heroes</Pill>
              {props.realm && <Pill onClick={props.onRealm}>{props.realm.name}</Pill>}
            </nav>
          </div>
        </div>
      </header>
      <div className="space-y-12 bg-stage-ink px-12 pt-8 pb-20">
        {props.saves.length > 0 && (
          <Shelf id="your-adventures" title="Your adventures">
            {props.saves.map((s) => {
              const current = s.archiveId === undefined
              return (
                <li key={s.archiveId ?? "current"} className={quarter}>
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
          </Shelf>
        )}
        <Shelf
          id="heroes"
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
        <Shelf id="new-adventure" title="New adventure">
          {props.adventures.map((a) => (
            <li key={a.id} className={quarter}>
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
            <li key={a.id} className={quarter}>
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
            <button type="button" onClick={props.onRealm} className="group relative block h-80 w-full overflow-hidden rounded-[4px] text-left shadow-[0_18px_40px_#000a]">
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
