import { useEffect, useState } from "react"
import { eyebrow, Pill, panel } from "@/components/stage/hud"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AdventureInfo } from "../runtime/game"
import type { Hero, PartyChoice } from "../runtime/heroes"
import { type FigureArt, STOCK_FIGURES } from "./figures"
import { ModuleCover } from "./module-cover"
import { portraitFor } from "./scenes"

type Pick = { id: string; name: string; race: string; archetype: string; portrait?: string; hero?: Hero }

// New game: the adventure, who goes, who plays each hero, and which CLI runs the GM. The first hero is the player's,
// the rest default to AI. Roster heroes appear only where the adventure accepts their race and class. Keyed by
// adventure, so switching adventures starts from that adventure's suggested party.
export function NewGame(props: {
  adventures: AdventureInfo[]
  adventure: string
  onAdventure: (id: string) => void
  heroes: Hero[]
  providers: string[]
  provider: string
  onProvider: (p: string) => void
  busy: boolean
  // The opening scene is still loading.
  waiting: boolean
  replacing: boolean
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
}) {
  const info = props.adventures.find((a) => a.id === props.adventure)
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
    <section className={cn(panel, "flex max-h-[90vh] w-[min(1160px,96vw)] flex-col text-left")}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-7 pb-5">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Adventure">
          {props.adventures.map((a) => (
            <Pill key={a.id} role="tab" aria-selected={a.id === props.adventure} active={a.id === props.adventure} onClick={() => props.onAdventure(a.id)} disabled={props.busy}>
              {a.title}
            </Pill>
          ))}
        </div>
        <div className="grid gap-7 md:grid-cols-[minmax(240px,330px)_1fr]">
          <div className="md:sticky md:top-0 md:self-start">
            <ModuleCover id={info.id} title={info.title} players={info.players} setting={info.setting} />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            {info.teaser && (
              <div>
                <div className={cn(eyebrow, "mb-2")}>The adventure</div>
                <p className="max-w-[70ch] font-serif text-[15px] leading-relaxed text-stage-cream/90">{info.teaser}</p>
              </div>
            )}
            <div>
              <div className={cn(eyebrow, "mb-2")}>
                Party · {party.length} of {range}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {party.map((choice) => {
                  const p = picks.find((x) => x.id === choice.id)
                  if (!p) return null
                  return (
                    <li key={p.id} className="stage-leather flex items-center gap-3 rounded-[3px] border border-stage-line/25 p-2">
                      <Face pick={p} size="h-12 w-10" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-serif text-base">{p.name}</div>
                        <div className="text-[11px] text-stage-muted">
                          {p.race} {p.archetype}
                        </div>
                      </div>
                      <fieldset className="flex" aria-label={`Who plays ${p.name}`}>
                        <Pill active={!choice.ai} aria-pressed={!choice.ai} className="rounded-r-none" onClick={() => setParty((cur) => cur.map((c) => (c.id === p.id ? { ...c, ai: false } : c)))}>
                          You
                        </Pill>
                        <Pill
                          active={choice.ai}
                          aria-pressed={choice.ai}
                          className="-ml-px rounded-l-none"
                          disabled={!choice.ai && party.filter((c) => !c.ai).length === 1}
                          onClick={() => setParty((cur) => cur.map((c) => (c.id === p.id ? { ...c, ai: true } : c)))}
                        >
                          AI
                        </Pill>
                      </fieldset>
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => toggle(p.id)} className="px-2 text-xl leading-none text-stage-muted hover:text-stage-cream">
                        ×
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div>
              <div className={cn(eyebrow, "mb-2")}>Heroes</div>
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
                          "flex w-full flex-col items-stretch gap-2 rounded-[3px] border p-2 text-left transition-[filter,border-color] disabled:cursor-default disabled:opacity-40",
                          chosen ? "border-stage-gold bg-stage-ink/60" : "stage-leather border-stage-line/25 hover:border-stage-gold/60"
                        )}
                      >
                        <Face pick={p} size="h-24 w-full" />
                        <span className="truncate font-serif text-sm">{p.name}</span>
                        <span className="-mt-2 truncate text-[11px] text-stage-muted">
                          {p.race} {p.archetype}
                        </span>
                      </button>
                      {p.hero && (
                        <div className="absolute top-3 right-3 flex gap-1">
                          <Pill className="px-2 py-1 text-[10px]" disabled={props.busy} onClick={() => props.onEdit(p.hero!)} aria-label={`Edit ${p.name}`}>
                            Edit
                          </Pill>
                          {props.onPaint && (
                            <Pill className="px-2 py-1 text-[10px]" disabled={props.busy} onClick={() => props.onPaint!(p.hero!)} aria-label={`Paint ${p.name}`}>
                              {props.painting === p.id ? "Painting…" : "Paint"}
                            </Pill>
                          )}
                          <Pill
                            className="px-2 py-1 text-[10px]"
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
                          </Pill>
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
                      className="stage-leather grid h-full min-h-[170px] w-full place-items-center rounded-[3px] border border-dashed border-stage-line/40 p-2 font-serif text-sm hover:border-stage-gold/60 disabled:cursor-default disabled:opacity-40"
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
      <div className="flex flex-wrap items-center gap-4 border-t border-stage-line/15 px-7 py-5">
        <label className="text-sm">
          Game Master{" "}
          <select aria-label="Game Master" value={props.provider} onChange={(e) => props.onProvider(e.target.value)} className="ml-3 rounded border border-stage-brass bg-stage-panel px-3 py-2">
            {props.providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        {props.onCancel && (
          <Pill disabled={props.busy} onClick={props.onCancel}>
            Cancel
          </Pill>
        )}
        <Button variant="epic" className="text-xl" disabled={props.busy || props.waiting || !ready || !props.providers.length} onClick={() => props.onStart(party)}>
          {props.busy ? "Starting…" : props.replacing ? "Start new game" : "Play"}
        </Button>
      </div>
    </section>
  )
}

function Face({ pick, size }: { pick: Pick; size: string }) {
  return pick.portrait ? (
    <img src={pick.portrait} alt="" className={cn(size, "block shrink-0 border border-stage-brass/50 object-cover object-[50%_15%] [filter:sepia(.2)_saturate(.88)]")} />
  ) : (
    <span aria-hidden="true" className={cn(size, "grid shrink-0 place-items-center border border-stage-brass/50 font-display text-stage-gold")}>
      {pick.name[0]}
    </span>
  )
}
