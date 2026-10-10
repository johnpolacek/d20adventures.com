import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Chip, Option, siteCard, siteLabel, siteOutline, sitePanel } from "@/components/ui/site"
import { cn } from "@/lib/utils"
import type { AdventureInfo, CatalogInfo } from "../runtime/game"
import type { Hero, PartyChoice } from "../runtime/heroes"
import { type FigureArt, STOCK_FIGURES } from "./figures"
import { ModuleCover } from "./module-cover"
import { portraitFor } from "./scenes"

type Pick = { id: string; name: string; race: string; archetype: string; portrait?: string; hero?: Hero }
// The small controls over a roster hero's card.
const mini = cn(siteOutline, "px-2 py-0.5 font-mono text-xxs")
// An adventure for sale that this app cannot play yet. Owned ones are downloading, or failed to.
export type Locked = CatalogInfo & { owned: boolean; failed: boolean }

export const price = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

export function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="-mt-0.5 mr-1.5 inline h-3 w-3 fill-current">
      <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm2 0h4V5a2 2 0 1 0-4 0v2Z" />
    </svg>
  )
}

// Party setup for the adventure chosen on the Adventures page: who goes, who plays each hero, and which CLI runs the
// GM. The first hero is the player's, the rest default to AI. Roster heroes appear only where the adventure accepts
// their race and class. Keyed by adventure, so each starts from its own suggested party.
export function NewGame(props: {
  adventures: AdventureInfo[]
  adventure: string
  heroes: Hero[]
  providers: string[]
  provider: string
  onProvider: (p: string) => void
  busy: boolean
  // The opening scene is still loading.
  waiting: boolean
  created: string | null
  onStart: (party: PartyChoice[]) => void
  onCreate: () => void
  onEdit: (hero: Hero) => void
  // Painting a hero's art, when an image-capable CLI is installed.
  art: Record<string, FigureArt>
  painting: string | null
  onPaint?: (hero: Hero) => void
  onDelete: (hero: Hero) => void
  onCancel?: () => void
  // Adventures for sale that are not playable here yet, and whether this computer is linked to an account.
  locked: Locked[]
  // Usual prices of free adventures, by id, shown crossed out.
  listPrices: Record<string, number>
  linked: boolean | "offline"
  onLink?: () => void
  // Hosting the adventure on the website for friends instead, with the player's hero seated. Only when linked.
  onHost?: (party: PartyChoice[]) => void
}) {
  const info = props.adventures.find((a) => a.id === props.adventure)
  const lockedInfo = info ? undefined : props.locked.find((a) => a.id === props.adventure)
  const [party, setParty] = useState<PartyChoice[]>(() => (info?.party ?? []).map((id, i) => ({ id, ai: i > 0 })))
  const [deleting, setDeleting] = useState<string | null>(null)
  const fits = (h: Hero) => Boolean(info?.options?.races.includes(h.race) && info.options.archetypes.includes(h.archetype))
  const picks: Pick[] = [
    ...(info?.premades ?? []).map((p) => ({ ...p, portrait: portraitFor(undefined, { ...p, type: "pc" }) })),
    ...props.heroes
      .filter(fits)
      .map((h) => ({ id: h.id, name: h.name, race: h.race, archetype: h.archetype, portrait: (h.painted && props.art[h.id]?.portrait) || STOCK_FIGURES[h.figure]?.art.portrait, hero: h })),
  ]
  const [min, max] = info?.players ?? [1, 1]
  // A hero just made from this screen joins the party if they fit and there is room.
  const joining = props.created && picks.some((p) => p.id === props.created) ? props.created : null
  useEffect(() => {
    if (joining) setParty((p) => (p.some((c) => c.id === joining) || p.length >= max ? p : [...p, { id: joining, ai: p.some((c) => !c.ai) }]))
  }, [joining, max])
  if (lockedInfo) return <LockedAdventure info={lockedInfo} linked={props.linked} onLink={props.onLink} onCancel={props.onCancel} busy={props.busy} />
  if (!info) return null
  const ready = party.length >= min && party.length <= max && party.some((c) => !c.ai)
  const toggle = (id: string) =>
    setParty((p) => {
      if (p.some((c) => c.id === id)) {
        const rest = p.filter((c) => c.id !== id)
        return rest.length && !rest.some((c) => !c.ai) ? rest.map((c, i) => (i === 0 ? { ...c, ai: false } : c)) : rest
      }
      return p.length < max ? [...p, { id, ai: p.some((c) => !c.ai) }] : p
    })
  const range = min === max ? `${min}` : `${min}–${max}`
  return (
    <section className={cn(siteCard, "flex max-h-[94%] w-[min(72rem,96vw)] flex-col text-left backdrop-blur-xl")}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-7 pb-5">
        <div className="grid gap-7 md:grid-cols-[minmax(240px,330px)_1fr]">
          <div className="relative md:sticky md:top-0 md:self-start">
            <ModuleCover id={info.id} title={info.title} players={info.players} />
            {props.listPrices[info.id] && (
              <Chip tone="amber" className="absolute bottom-3 left-3">
                <s className="mr-1.5 font-normal opacity-70">{price(props.listPrices[info.id])}</s>
                FREE
              </Chip>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            {info.teaser && (
              <div>
                <div className={cn(siteLabel, "mb-2")}>The adventure</div>
                <p className="max-w-[70ch] text-base text-gray-300">{info.teaser}</p>
              </div>
            )}
            <div>
              <div className={cn(siteLabel, "mb-2")}>
                Party · {party.length} of {range}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {party.map((choice) => {
                  const p = picks.find((x) => x.id === choice.id)
                  if (!p) return null
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/50 p-2">
                      <Face pick={p} size="h-12 w-10" />
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate font-display text-base", !choice.ai && "text-amber-400")}>{p.name}</div>
                        <div className="text-xs text-white/70">
                          {p.race} {p.archetype}
                        </div>
                      </div>
                      <fieldset className="flex" aria-label={`Who plays ${p.name}`}>
                        <Option active={!choice.ai} aria-pressed={!choice.ai} className="rounded-r-none" onClick={() => setParty((cur) => cur.map((c) => (c.id === p.id ? { ...c, ai: false } : c)))}>
                          You
                        </Option>
                        <Option
                          active={choice.ai}
                          aria-pressed={choice.ai}
                          className="-ml-0.5 rounded-l-none"
                          disabled={!choice.ai && party.filter((c) => !c.ai).length === 1}
                          onClick={() => setParty((cur) => cur.map((c) => (c.id === p.id ? { ...c, ai: true } : c)))}
                        >
                          AI
                        </Option>
                      </fieldset>
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => toggle(p.id)} className="px-2 text-xl leading-none text-white/50 hover:text-white">
                        ×
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div>
              <div className={cn(siteLabel, "mb-2")}>Heroes</div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                {picks.map((p) => {
                  const chosen = party.some((c) => c.id === p.id)
                  return (
                    <li key={p.id} className="relative">
                      <button
                        type="button"
                        aria-pressed={chosen}
                        disabled={!chosen && party.length >= max}
                        onClick={() => toggle(p.id)}
                        className={cn(
                          "flex w-full flex-col items-stretch gap-2 rounded-lg border bg-black p-2 text-left transition-all duration-300 disabled:cursor-default disabled:opacity-40",
                          chosen ? "border-primary-400 ring-2 ring-primary-500" : "border-white/10 hover:border-white/40"
                        )}
                      >
                        <Face pick={p} size="h-24 w-full" />
                        <span className={cn("truncate font-display text-sm", chosen && "text-amber-400")}>{p.name}</span>
                        <span className="-mt-2 truncate text-xs text-white/70">
                          {p.race} {p.archetype}
                        </span>
                      </button>
                      {p.hero && (
                        <div className="absolute top-3 right-3 flex gap-1">
                          <button type="button" className={mini} disabled={props.busy} onClick={() => props.onEdit(p.hero!)} aria-label={`Edit ${p.name}`}>
                            Edit
                          </button>
                          {props.onPaint && (
                            <button type="button" className={mini} disabled={props.busy} onClick={() => props.onPaint!(p.hero!)} aria-label={`Paint ${p.name}`}>
                              {props.painting === p.id ? "Painting…" : "Paint"}
                            </button>
                          )}
                          <button
                            type="button"
                            className={cn(mini, deleting === p.id && "border-red-400/60 bg-red-600/80 text-white hover:bg-red-600")}
                            disabled={props.busy}
                            aria-label={deleting === p.id ? `Confirm deleting ${p.name}` : `Delete ${p.name}`}
                            onBlur={() => setDeleting(null)}
                            onClick={() => {
                              if (deleting !== p.id) return setDeleting(p.id)
                              setDeleting(null)
                              setParty((cur) => cur.filter((c) => c.id !== p.id))
                              props.onDelete(p.hero!)
                            }}
                          >
                            {deleting === p.id ? "Confirm" : "Delete"}
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
                {info.options && (
                  <li>
                    <button
                      type="button"
                      onClick={props.onCreate}
                      disabled={props.busy || !props.providers.length}
                      className="grid h-full min-h-[10rem] w-full place-items-center rounded-lg border border-dashed border-white/30 bg-black p-2 font-display text-sm text-white/60 transition-colors hover:border-sky-300/60 hover:text-sky-200 disabled:cursor-default disabled:opacity-40"
                    >
                      New hero
                    </button>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-white/10 px-7 py-5">
        <label className={siteLabel}>
          Game Master{" "}
          <select
            aria-label="Game Master"
            value={props.provider}
            onChange={(e) => props.onProvider(e.target.value)}
            className="ml-3 rounded-md border border-white/20 bg-black px-3 py-2 font-serif text-base normal-case tracking-normal text-white"
          >
            {props.providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        {props.onCancel && (
          <button type="button" className={cn(siteOutline, "px-4 py-2 text-sm")} disabled={props.busy} onClick={props.onCancel}>
            Cancel
          </button>
        )}
        {props.onHost && (
          <button type="button" className={cn(siteOutline, "px-4 py-2 text-sm")} disabled={props.busy || !party.some((c) => !c.ai) || !props.providers.length} onClick={() => props.onHost!(party)}>
            Host online
          </button>
        )}
        <Button variant="epic" className="text-xl" disabled={props.busy || props.waiting || !ready || !props.providers.length} onClick={() => props.onStart(party)}>
          {props.busy ? "Starting…" : "Play"}
        </Button>
      </div>
    </section>
  )
}

// A locked adventure: its cover under a lock, its teaser, and how to get it.
function LockedAdventure(props: { info: Locked; linked: boolean | "offline"; onLink?: () => void; onCancel?: () => void; busy: boolean }) {
  const { info } = props
  const status = info.owned
    ? info.failed
      ? "The download failed. It tries again next time the app opens."
      : "Downloading…"
    : props.linked === "offline"
      ? "D20 Adventures cannot be reached. Adventures you own download when it can."
      : props.linked
        ? "The store opens soon."
        : "Already own it? Link your account to download it."
  return (
    <section className={cn(siteCard, "flex max-h-[94%] w-[min(72rem,96vw)] flex-col text-left backdrop-blur-xl")}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-7 pb-5">
        <div className="grid gap-7 md:grid-cols-[minmax(240px,330px)_1fr]">
          <div className="relative md:sticky md:top-0 md:self-start">
            <ModuleCover id={info.id} title={info.title} players={info.players} className="[filter:grayscale(.55)_brightness(.7)]" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-white/30 bg-black/70 text-amber-300">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-7 w-7 fill-current">
                  <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm2 0h4V5a2 2 0 1 0-4 0v2Z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            {info.teaser && (
              <div>
                <div className={cn(siteLabel, "mb-2")}>The adventure</div>
                <p className="max-w-[70ch] text-base text-gray-300">{info.teaser}</p>
              </div>
            )}
            <div className={cn(sitePanel, "max-w-md p-5")}>
              <div className={siteLabel}>{info.owned ? "In your library" : "Not in your library"}</div>
              {!info.owned && <div className="mt-2 font-display text-4xl text-amber-300">{price(info.priceCents)}</div>}
              <p className="mt-3 text-base text-gray-300">{status}</p>
              {!info.owned && !props.linked && props.onLink && (
                <button type="button" className={cn(siteOutline, "mt-4 px-4 py-1.5 text-sm")} onClick={props.onLink}>
                  Link account
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-white/10 px-7 py-5">
        <div className="flex-1" />
        {props.onCancel && (
          <button type="button" className={cn(siteOutline, "px-4 py-2 text-sm")} disabled={props.busy} onClick={props.onCancel}>
            Cancel
          </button>
        )}
        <Button variant="epic" className="text-xl" disabled>
          Locked
        </Button>
      </div>
    </section>
  )
}

function Face({ pick, size }: { pick: Pick; size: string }) {
  return pick.portrait ? (
    <img src={pick.portrait} alt="" className={cn(size, "block shrink-0 rounded-md border border-white/30 object-cover object-[50%_15%]")} />
  ) : (
    <span aria-hidden="true" className={cn(size, "grid shrink-0 place-items-center rounded-md border border-white/30 font-display text-amber-400")}>
      {pick.name[0]}
    </span>
  )
}
