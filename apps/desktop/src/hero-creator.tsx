import { useEffect, useState } from "react"
import { eyebrow, Pill, panel } from "@/components/stage/hud"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Hero, HeroDraft } from "../runtime/heroes"
import { defaultFigure, type FigureArt, figuresFor } from "./figures"

type Options = { races: string[]; archetypes: string[] }
export type HeroIdea = { race: string; archetype: string; name: string; gender: string; idea: string }
const ATTRIBUTES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const
const field = "w-full rounded-[3px] border border-stage-line/25 bg-stage-ink/70 px-3 py-2 text-sm text-stage-cream placeholder:text-stage-muted/60 focus:border-stage-gold focus:outline-none"
const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
// "Name: description" per line, as the lists are edited.
const named = (text: string) =>
  lines(text).map((l) => {
    const [name, ...rest] = l.split(":")
    return rest.length ? { name: name.trim(), description: rest.join(":").trim() } : { name: l }
  })
const unnamed = (items: { name: string; description?: string }[] = []) => items.map((i) => (i.description ? `${i.name}: ${i.description}` : i.name)).join("\n")

// Making a hero: race, class, name and an idea, then one GM call writes the rest. The player reviews and edits every
// field and picks a figure before saving. Editing a roster hero opens straight on the review.
export function HeroCreator(props: {
  options: Options
  editing?: Hero
  // Art painted for the hero being edited, offered beside the stock figures.
  painted?: FigureArt
  busy: boolean
  onDraft: (idea: HeroIdea) => Promise<HeroDraft | undefined>
  onSave: (hero: HeroDraft & { id?: string; figure: string; painted?: boolean }) => Promise<boolean>
  onClose: () => void
}) {
  const [idea, setIdea] = useState<HeroIdea>(() => ({
    race: props.editing?.race ?? props.options.races[0],
    archetype: props.editing?.archetype ?? props.options.archetypes[0],
    name: props.editing?.name ?? "",
    gender: props.editing?.gender ?? "",
    idea: "",
  }))
  const [hero, setHero] = useState<(HeroDraft & { id?: string; figure: string; painted?: boolean }) | null>(props.editing ?? null)
  const [lists, setLists] = useState(() => listText(props.editing))
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      props.onClose()
    }
    document.addEventListener("keydown", fn, true)
    return () => document.removeEventListener("keydown", fn, true)
  }, [props.onClose])
  const set = <K extends keyof HeroIdea>(key: K, value: HeroIdea[K]) => setIdea((i) => ({ ...i, [key]: value }))
  const create = async () => {
    const draft = await props.onDraft(idea)
    if (!draft) return
    setHero({ ...draft, figure: defaultFigure(draft.race, draft.gender) })
    setLists(listText(draft))
  }
  const save = () => {
    if (!hero) return
    void props.onSave({
      ...hero,
      skills: lines(lists.skills),
      specialAbilities: lines(lists.specialAbilities),
      equipment: named(lists.equipment),
      spells: named(lists.spells),
    })
  }
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-stage-ink/60">
      <section role="dialog" aria-label={hero ? "Review hero" : "New hero"} className={cn(panel, "relative flex max-h-[90vh] w-[min(980px,95vw)] flex-col gap-5 overflow-y-auto p-7 text-left")}>
        <button type="button" onClick={props.onClose} aria-label="Close" className="absolute top-3 right-4 text-[24px] leading-none text-stage-muted hover:text-stage-cream">
          ×
        </button>
        {!hero ? (
          <>
            <h2 className="font-display text-3xl">New hero</h2>
            <Choice label="Race" values={props.options.races} value={idea.race} onPick={(v) => set("race", v)} />
            <Choice label="Class" values={props.options.archetypes} value={idea.archetype} onPick={(v) => set("archetype", v)} />
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
            <div className="sticky -bottom-7 z-10 -mx-7 -mb-7 flex items-center justify-end gap-3 border-t border-stage-line/15 bg-stage-panel px-7 py-4">
              {props.busy && <span className="text-sm text-stage-muted">The GM is writing your hero…</span>}
              <Button variant="epic" className="text-lg" disabled={props.busy || !idea.name.trim()} onClick={() => void create()}>
                Create hero
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-[220px_1fr]">
              <div>
                <div className={cn(eyebrow, "mb-2")}>Figure</div>
                <div className="grid grid-cols-2 gap-2">
                  {props.painted && (
                    <button
                      type="button"
                      aria-pressed={Boolean(hero.painted)}
                      aria-label="Painted figure"
                      onClick={() => setHero({ ...hero, painted: true })}
                      className={cn("rounded-[3px] border bg-stage-ink/60 p-1", hero.painted ? "border-stage-gold" : "border-stage-line/20 opacity-70 hover:opacity-100")}
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
                      className={cn("rounded-[3px] border bg-stage-ink/60 p-1", !hero.painted && hero.figure === f.id ? "border-stage-gold" : "border-stage-line/20 opacity-70 hover:opacity-100")}
                    >
                      <img src={f.art.front} alt="" className="block h-56 w-full object-contain" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid content-start gap-3">
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <Labeled label="Name">
                    <input className={cn(field, "font-serif text-lg")} value={hero.name} maxLength={80} onChange={(e) => setHero({ ...hero, name: e.target.value })} />
                  </Labeled>
                  <Labeled label="Gender">
                    <input className={field} value={hero.gender ?? ""} maxLength={40} onChange={(e) => setHero({ ...hero, gender: e.target.value })} />
                  </Labeled>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Labeled label="Race">
                    <select
                      className={field}
                      value={hero.race}
                      onChange={(e) =>
                        setHero({ ...hero, race: e.target.value, figure: figuresFor(e.target.value).some((f) => f.id === hero.figure) ? hero.figure : defaultFigure(e.target.value, hero.gender) })
                      }
                    >
                      {props.options.races.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </Labeled>
                  <Labeled label="Class">
                    <select className={field} value={hero.archetype} onChange={(e) => setHero({ ...hero, archetype: e.target.value })}>
                      {props.options.archetypes.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </Labeled>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {ATTRIBUTES.map((a) => (
                    <Labeled key={a} label={a.slice(0, 3)}>
                      <input
                        className={cn(field, "text-center")}
                        type="number"
                        min={1}
                        max={20}
                        value={hero.attributes[a]}
                        onChange={(e) => setHero({ ...hero, attributes: { ...hero.attributes, [a]: Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))) } })}
                      />
                    </Labeled>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(["appearance", "personality", "background", "motivation", "behavior"] as const).map((key) => (
                <Labeled key={key} label={key}>
                  <textarea className={cn(field, "resize-y")} rows={3} value={hero[key] ?? ""} onChange={(e) => setHero({ ...hero, [key]: e.target.value })} />
                </Labeled>
              ))}
              {(["skills", "equipment", "spells", "specialAbilities"] as const).map((key) => (
                <Labeled key={key} label={key === "specialAbilities" ? "special abilities" : key}>
                  <textarea className={cn(field, "resize-y")} rows={4} value={lists[key]} onChange={(e) => setLists((l) => ({ ...l, [key]: e.target.value }))} />
                </Labeled>
              ))}
            </div>
            <div className="sticky -bottom-7 z-10 -mx-7 -mb-7 flex items-center justify-end gap-3 border-t border-stage-line/15 bg-stage-panel px-7 py-4">
              {!props.editing && (
                <Pill disabled={props.busy} onClick={() => setHero(null)}>
                  Back
                </Pill>
              )}
              <Button variant="epic" className="text-lg" disabled={props.busy || !hero.name.trim() || !hero.appearance.trim()} onClick={save}>
                Save hero
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function listText(h?: Pick<HeroDraft, "skills" | "equipment" | "spells" | "specialAbilities">) {
  return { skills: (h?.skills ?? []).join("\n"), specialAbilities: (h?.specialAbilities ?? []).join("\n"), equipment: unnamed(h?.equipment), spells: unnamed(h?.spells) }
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className={eyebrow}>{label}</span>
      {children}
    </label>
  )
}

function Choice({ label, values, value, onPick }: { label: string; values: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div>
      <div className={cn(eyebrow, "mb-2")}>{label}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <Pill key={v} aria-pressed={v === value} active={v === value} onClick={() => onPick(v)}>
            {v}
          </Pill>
        ))}
      </div>
    </div>
  )
}
