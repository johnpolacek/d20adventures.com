import type { CreationChoices, CreationPick } from "@d20/gm-core/sheet/create"
import { useEffect, useMemo, useState } from "react"
import { useSheetView } from "@/components/adventure/use-sheet-view"
import { HeroRules } from "@/components/heroes/hero-rules"
import { useHeroRules } from "@/components/heroes/use-hero-rules"
import { Button } from "@/components/ui/button"
import { Option, siteField, siteLabel, siteOutline } from "@/components/ui/site"
import { cn } from "@/lib/utils"
import type { Arrival, Hero, HeroDraft } from "../runtime/heroes"
import { defaultFigure, type FigureArt, figuresFor } from "./figures"

// The races and classes an adventure allows, by name.
type Options = { races: string[]; archetypes: string[] }
/** What the player says of a new hero beside their rules. */
export type HeroIdea = { name: string; gender: string; idea: string; hook: string }
/** A new hero's rules as the player chose them. The host builds the sheet from these and checks it. */
export type HeroMaking = { pick: CreationPick; choices: CreationChoices }
type Edited = HeroDraft & { id?: string; figure: string; painted?: boolean }
const field = cn(siteField, "bg-black/30")
// A figure to choose: ringed in the primary colour when chosen.
const figure = (chosen: boolean) => cn("rounded-md border bg-black/30 p-1 transition-all", chosen ? "border-primary-400 ring-2 ring-primary-500" : "border-white/10 opacity-70 hover:opacity-100")
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const footer = "sticky -bottom-7 z-10 -mx-7 -mb-7 flex flex-wrap items-center justify-end gap-3 border-t border-primary-700 bg-primary-900 px-7 py-4"

// Making a hero in three steps. The player picks a species, a class and a background and says who the hero is. The
// rules then ask their choices, filled in to begin with. Last, one GM call writes the hero's story to fit those rules,
// and the player reviews it and picks a figure before saving. Editing a roster hero opens on the review: their story
// can change there, and their rules change only by levels. Made for an adventure with hooks, the player also says why
// the hero came, and the same call writes how they arrive in its opening scene.
export function HeroCreator(props: {
  options: Options
  // The adventure the hero is made for, from its party screen.
  adventure?: { id: string; hooks: string[] }
  editing?: Hero
  // Art painted for the hero being edited, offered beside the stock figures.
  painted?: FigureArt
  // False where the stage does not read a chosen figure yet, as on the website.
  figures?: boolean
  busy: boolean
  // Builds the hero from the rules choices and writes their story. Nothing is saved yet.
  onDraft: (idea: HeroIdea, making: HeroMaking) => Promise<HeroDraft | undefined>
  // `making` is given for a new hero, whose rules the host builds again and checks.
  onSave: (hero: Edited, making?: HeroMaking) => Promise<boolean>
  onClose: () => void
}) {
  const kit = useHeroRules()
  const [idea, setIdea] = useState<HeroIdea>({ name: "", gender: "", idea: "", hook: "" })
  const [pick, setPick] = useState<CreationPick | null>(null)
  const [choices, setChoices] = useState<CreationChoices | null>(null)
  const [step, setStep] = useState<"pick" | "rules" | "review">(props.editing ? "review" : "pick")
  const [hero, setHero] = useState<Edited | null>(props.editing ?? null)
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      props.onClose()
    }
    document.addEventListener("keydown", fn, true)
    return () => document.removeEventListener("keydown", fn, true)
  }, [props.onClose])

  // What the adventure allows of what the rules can make.
  const menu = useMemo(
    () =>
      kit && {
        species: kit.menu.species.filter((entry) => props.options.races.includes(entry.name)),
        classes: kit.menu.classes.filter((entry) => props.options.archetypes.includes(entry.name)),
        backgrounds: kit.menu.backgrounds,
      },
    [kit, props.options]
  )
  useEffect(() => {
    if (menu && !pick && menu.species.length && menu.classes.length) setPick({ species: menu.species[0].id, class: menu.classes[0].id as CreationPick["class"], background: menu.backgrounds[0].id })
  }, [menu, pick])
  const built = useMemo(() => (kit && pick && choices ? kit.build(pick, choices) : undefined), [kit, pick, choices])
  const problems = built && "problems" in built ? built.problems : []
  const view = built && "view" in built ? built.view : undefined
  const sheet = useSheetView(step === "review" ? hero?.sheet : undefined, undefined, undefined)

  const set = <K extends keyof HeroIdea>(key: K, value: HeroIdea[K]) => setIdea((i) => ({ ...i, [key]: value }))
  const toRules = () => {
    if (!kit || !pick) return
    // The rules start filled in. Coming back to the same picks keeps what the player changed.
    if (!choices) setChoices(kit.auto(pick))
    setStep("rules")
  }
  const repick = (changed: Partial<CreationPick>) => {
    if (!pick) return
    setPick({ ...pick, ...changed })
    setChoices(null)
  }
  const write = async () => {
    if (!pick || !choices) return
    const draft = await props.onDraft(idea, { pick, choices })
    if (!draft) return
    setHero({ ...draft, figure: defaultFigure(draft.race, draft.gender) })
    setStep("review")
  }
  const arrival = props.adventure && hero?.arrivals?.[props.adventure.id]
  const setArrival = (key: keyof Arrival, value: string) => {
    if (props.adventure && arrival && hero) setHero({ ...hero, arrivals: { ...hero.arrivals, [props.adventure.id]: { ...arrival, [key]: value } } })
  }
  const title = step === "pick" ? "New Hero" : step === "rules" ? "Rules" : "Review Hero"

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/80 font-serif text-white">
      {/* The website's character sheet: a deep primary gradient with a primary border. */}
      <section
        role="dialog"
        aria-label={title}
        className="relative flex max-h-[90vh] w-[min(56rem,95vw)] flex-col gap-5 overflow-y-auto rounded-lg border border-primary-600 bg-gradient-to-br from-primary-900/95 via-primary-800/95 to-primary-900/95 p-7 text-left shadow-lg"
      >
        <button type="button" onClick={props.onClose} aria-label="Close" className="absolute top-3 right-4 text-2xl leading-none text-white/60 hover:text-white">
          ×
        </button>
        {step === "pick" && (
          <>
            <h2 className="font-display text-3xl font-bold text-amber-300">New Hero</h2>
            {!menu || !pick ? (
              <p className="text-white/70 italic">Loading…</p>
            ) : (
              <>
                <Choice label="Species" values={menu.species} value={pick.species} onPick={(id) => repick({ species: id })} />
                <Choice label="Class" values={menu.classes} value={pick.class} onPick={(id) => repick({ class: id as CreationPick["class"] })} />
                <Choice label="Background" values={menu.backgrounds} value={pick.background} onPick={(id) => repick({ background: id })} />
              </>
            )}
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <Labeled label="Name">
                <input className={field} value={idea.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
              </Labeled>
              <Labeled label="Gender">
                <input className={field} value={idea.gender} maxLength={40} onChange={(e) => set("gender", e.target.value)} />
              </Labeled>
            </div>
            <Labeled label="Idea">
              <textarea className={cn(field, "resize-none")} rows={2} maxLength={600} value={idea.idea} onChange={(e) => set("idea", e.target.value)} />
            </Labeled>
            {props.adventure && props.adventure.hooks.length > 0 && (
              <div>
                <div className={cn(siteLabel, "mb-2")}>Why They Came</div>
                <div className="mb-2 flex flex-wrap gap-2">
                  {props.adventure.hooks.map((h) => (
                    <Option key={h} aria-pressed={h === idea.hook} active={h === idea.hook} className="text-left" onClick={() => set("hook", h === idea.hook ? "" : h)}>
                      {h}
                    </Option>
                  ))}
                </div>
                <input className={field} aria-label="Why They Came" placeholder="Let the GM choose" value={idea.hook} maxLength={300} onChange={(e) => set("hook", e.target.value)} />
              </div>
            )}
            <div className={footer}>
              <Button variant="epic" className="text-lg" disabled={!kit || !pick || !idea.name.trim()} onClick={toRules}>
                Choose Rules
              </Button>
            </div>
          </>
        )}
        {step === "rules" && kit && pick && choices && (
          <>
            <div>
              <h2 className="font-display text-3xl font-bold text-amber-300">{idea.name.trim()}</h2>
              <p className="mt-1 text-white/80">
                {view
                  ? `Level 1 ${view.speciesName} ${view.className} · ${view.backgroundName} · Hit Points ${view.hitPoints.maximum} · Armor Class ${view.armorClass} · Speed ${view.speed} ft.`
                  : "These choices do not make a legal hero yet."}
              </p>
            </div>
            <HeroRules kit={kit} pick={pick} choices={choices} onChange={setChoices} />
            <div className={footer}>
              {problems.length > 0 && (
                <p role="alert" className="mr-auto max-w-[32rem] text-sm text-red-300">
                  {problems.map((problem) => problem.charAt(0).toUpperCase() + problem.slice(1)).join(". ")}.
                </p>
              )}
              {props.busy && <span className="text-sm text-white/70 italic">The GM is writing your hero…</span>}
              <button type="button" className={cn(siteOutline, "px-4 py-2 text-sm")} disabled={props.busy} onClick={() => setStep("pick")}>
                Back
              </button>
              <button type="button" className={cn(siteOutline, "px-4 py-2 text-sm")} disabled={props.busy} onClick={() => setChoices(kit.auto(pick))}>
                Choose For Me
              </button>
              <Button variant="epic" className="text-lg" disabled={props.busy || problems.length > 0} onClick={() => void write()}>
                Write My Hero
              </Button>
            </div>
          </>
        )}
        {step === "review" && hero && (
          <>
            <div className={cn("grid gap-6", props.figures !== false && "md:grid-cols-[220px_1fr]")}>
              <div hidden={props.figures === false}>
                <div className={cn(siteLabel, "mb-2")}>Figure</div>
                <div className="grid grid-cols-2 gap-2">
                  {props.painted && (
                    <button
                      type="button"
                      aria-pressed={Boolean(hero.painted)}
                      aria-label="Painted Figure"
                      onClick={() => setHero({ ...hero, painted: true })}
                      className={figure(Boolean(hero.painted))}
                    >
                      <img src={props.painted.front} alt="" className="block h-56 w-full object-contain" />
                    </button>
                  )}
                  {figuresFor(hero.race).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={!hero.painted && hero.figure === f.id}
                      aria-label={`Figure ${f.id.endsWith("-a") ? 1 : 2}`}
                      onClick={() => setHero({ ...hero, figure: f.id, painted: false })}
                      className={figure(!hero.painted && hero.figure === f.id)}
                    >
                      <img src={f.art.front} alt="" className="block h-56 w-full object-contain" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid content-start gap-3">
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <Labeled label="Name">
                    <input className={cn(field, "font-display text-lg text-amber-300")} value={hero.name} maxLength={80} onChange={(e) => setHero({ ...hero, name: e.target.value })} />
                  </Labeled>
                  <Labeled label="Gender">
                    <input className={field} value={hero.gender ?? ""} maxLength={40} onChange={(e) => setHero({ ...hero, gender: e.target.value })} />
                  </Labeled>
                </div>
                {/* The rules of the hero, read off their sheet. Levels change them, not this screen. */}
                <div className="rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white/85">
                  <div className="font-display text-base text-amber-300">
                    {sheet ? `Level ${sheet.level} ${hero.race} ${sheet.className}${sheet.subclassName ? ` · ${sheet.subclassName}` : ""} · ${sheet.backgroundName}` : `${hero.race} ${hero.archetype}`}
                  </div>
                  {sheet && (
                    <>
                      <div className="mt-1">
                        Hit Points {sheet.hitPoints.maximum} · Armor Class {sheet.armorClass} · Speed {sheet.speed} ft. · Initiative {signed(sheet.initiative)}
                      </div>
                      <div className="mt-1 tabular-nums">{sheet.abilities.map((a) => `${a.name.slice(0, 3)} ${a.score}`).join(" · ")}</div>
                      <div className="mt-1">
                        {sheet.skills
                          .filter((s) => s.proficient)
                          .map((s) => `${s.name} ${signed(s.bonus)}`)
                          .join(", ")}
                      </div>
                      {sheet.spellcasting && <div className="mt-1">{[...sheet.spellcasting.cantrips, ...sheet.spellcasting.prepared].join(", ")}</div>}
                    </>
                  )}
                  {(hero.equipment?.length ?? 0) > 0 && <div className="mt-1 text-white/70">{hero.equipment?.map((item) => item.name).join(", ")}</div>}
                </div>
              </div>
            </div>
            {arrival && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Labeled label="Arrival">
                    <textarea className={cn(field, "resize-y")} rows={2} maxLength={600} value={arrival.intro} onChange={(e) => setArrival("intro", e.target.value)} />
                  </Labeled>
                </div>
                <Labeled label="Why They Came">
                  <textarea className={cn(field, "resize-y")} rows={2} maxLength={400} value={arrival.reason} onChange={(e) => setArrival("reason", e.target.value)} />
                </Labeled>
                <Labeled label="What Others Notice">
                  <textarea className={cn(field, "resize-y")} rows={2} maxLength={200} value={arrival.tell} onChange={(e) => setArrival("tell", e.target.value)} />
                </Labeled>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {(["appearance", "personality", "background", "motivation", "behavior"] as const).map((key) => (
                <Labeled key={key} label={key === "background" ? "Past" : key}>
                  <textarea className={cn(field, "resize-y")} rows={3} value={hero[key] ?? ""} onChange={(e) => setHero({ ...hero, [key]: e.target.value })} />
                </Labeled>
              ))}
            </div>
            <div className={footer}>
              {props.busy && <span className="text-sm text-white/70 italic">Saving…</span>}
              {!props.editing && (
                <button type="button" className={cn(siteOutline, "px-4 py-2 text-sm")} disabled={props.busy} onClick={() => setStep("rules")}>
                  Back
                </button>
              )}
              <Button
                variant="epic"
                className="text-lg"
                disabled={props.busy || !hero.name.trim() || !hero.appearance.trim() || (arrival && Object.values(arrival).some((v) => !v.trim()))}
                onClick={() => void props.onSave(hero, !props.editing && pick && choices ? { pick, choices } : undefined)}
              >
                Save Hero
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className={siteLabel}>{label}</span>
      {children}
    </label>
  )
}

function Choice({ label, values, value, onPick }: { label: string; values: { id: string; name: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <div>
      <div className={cn(siteLabel, "mb-2")}>{label}</div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {values.map((v) => (
          <Option key={v.id} role="radio" aria-checked={v.id === value} active={v.id === value} onClick={() => onPick(v.id)}>
            {v.name}
          </Option>
        ))}
      </div>
    </div>
  )
}
