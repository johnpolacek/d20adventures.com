import { Heading } from "@d20/ui/typography/heading"
import type { HeroConcept } from "@d20/gm-core/character/hero-draft"
import type { CreationChoices, CreationPick } from "@d20/gm-core/sheet/create"
import { ArrowLeft, Check, Dices, Loader2, Sparkles } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { useSheetView } from "@d20/ui/adventure/use-sheet-view"
import { HeroRules } from "@d20/ui/heroes/hero-rules"
import { useHeroRules } from "@d20/ui/heroes/use-hero-rules"
import { Button, Option } from "@d20/ui/button"
import { Dialog, DialogContent } from "@d20/ui/dialog"
import { Input } from "@d20/ui/input"
import { Label } from "@d20/ui/label"
import { Presence, Swap } from "@d20/ui/presence"
import { siteLabel } from "@d20/ui/site"
import { Textarea } from "@d20/ui/textarea"
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
// A figure to choose: ringed in the primary colour when chosen.
const figure = (chosen: boolean) =>
  cn(
    "rounded-md border bg-black/30 p-1 transition-[opacity,border-color,box-shadow,scale] duration-150 ease-snap active:scale-[.98]",
    chosen ? "border-primary-400 ring-2 ring-primary-500" : "border-white/10 opacity-70 hover:opacity-100"
  )
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const pickOne = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]
// Pick a different item when more than one exists, so clicking Randomize always rolls something fresh.
const pickAnother = <T,>(items: readonly T[], current?: T): T => {
  if (items.length <= 1 || current === undefined) return pickOne(items)
  const others = items.filter((item) => item !== current)
  return pickOne(others.length ? others : items)
}

// SRD 5.2.1 rules still need one of the four mechanical backgrounds behind the scenes; choose one that fits the class.
const CLASS_BACKGROUND: Record<CreationPick["class"], string> = {
  barbarian: "soldier",
  bard: "criminal",
  cleric: "acolyte",
  druid: "acolyte",
  fighter: "soldier",
  monk: "acolyte",
  paladin: "acolyte",
  ranger: "soldier",
  rogue: "criminal",
  sorcerer: "sage",
  warlock: "criminal",
  wizard: "sage",
}

function backgroundForClass(classId: CreationPick["class"], backgrounds: readonly { id: string }[]): string {
  const preferred = CLASS_BACKGROUND[classId]
  return backgrounds.some((b) => b.id === preferred) ? preferred : (backgrounds[0]?.id ?? preferred)
}

// Toggles an adventure hook cleanly inside the freeform Background textarea.
function toggleHookInText(current: string, hook: string): { nextText: string; active: boolean } {
  const trimmed = current.trim()
  if (trimmed.includes(hook)) {
    const cleaned = trimmed
      .replace(hook, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    return { nextText: cleaned, active: false }
  }
  return { nextText: trimmed ? `${trimmed}\n\n${hook}` : hook, active: true }
}

const STEPS = ["pick", "rules", "review"] as const
const STEP_LABELS: Record<(typeof STEPS)[number], string> = { pick: "Identity", rules: "Rules", review: "Review" }
const dialogFooter = "sticky -bottom-7 z-10 -mx-7 -mb-7 flex flex-wrap items-center justify-end gap-3 border-t border-primary-700 bg-primary-900 px-7 py-4"
const inlineWell = "rounded-xl border border-white/10 bg-black/40 p-4 shadow-[inset_0_2px_8px_rgba(0,0,0,0.45)] sm:p-5"

// Making a hero in three steps. The player picks a species and a class and describes who the hero is (with optional
// adventure hooks folded into their background, or Auto Generate via the GM Host's AI). The rules then ask their
// choices, filled in to begin with. Last, one GM call writes the hero's story to fit those rules, and the player
// reviews it and picks a figure before saving. Editing a roster hero opens on the review.
export function HeroCreator(props: {
  options: Options
  // The adventure the hero is made for, from its party screen.
  adventure?: { id: string; hooks: string[] }
  editing?: Hero
  // Art painted for the hero being edited, offered beside the stock figures.
  painted?: FigureArt
  // False where the stage does not read a chosen figure yet, as on the website.
  figures?: boolean
  // True renders inline inside a lobby page instead of opening a floating modal dialog.
  inline?: boolean
  // Optional label for the final save CTA (e.g. "Save & Join Table").
  saveLabel?: string
  // False closes the dialog while it stays mounted, so it is seen to go. `onClosed` runs once it has.
  open?: boolean
  onClosed?: () => void
  busy: boolean
  // Auto-generates a starting name, gender, and background using the GM Host's AI (or local/server LLM).
  onGenerate?: (input: { race: string; archetype: string; hook?: string }) => Promise<HeroConcept | undefined>
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
  const [generating, setGenerating] = useState(false)
  const [step, setStep] = useState<(typeof STEPS)[number]>(props.editing ? "review" : "pick")
  const inlineRef = useRef<HTMLElement>(null)
  // A later step comes in from the right and an earlier one from the left.
  const [back, setBack] = useState(false)
  const go = (to: (typeof STEPS)[number]) => {
    setBack(STEPS.indexOf(to) < STEPS.indexOf(step))
    setStep(to)
    if (props.inline) {
      requestAnimationFrame(() => inlineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
    }
  }
  const [hero, setHero] = useState<Edited | null>(props.editing ?? null)

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
    if (!menu || pick || !menu.species.length || !menu.classes.length || !menu.backgrounds.length) return
    const classId = pickOne(menu.classes).id as CreationPick["class"]
    setPick({
      species: pickOne(menu.species).id,
      class: classId,
      background: backgroundForClass(classId, menu.backgrounds),
    })
  }, [menu, pick])
  const built = useMemo(() => (kit && pick && choices ? kit.build(pick, choices) : undefined), [kit, pick, choices])
  const problems = built && "problems" in built ? built.problems : []
  const view = built && "view" in built ? built.view : undefined
  const sheet = useSheetView(step === "review" ? hero?.sheet : undefined, undefined, undefined)

  const set = <K extends keyof HeroIdea>(key: K, value: HeroIdea[K]) => setIdea((i) => ({ ...i, [key]: value }))
  const repick = (changed: Partial<CreationPick>) => {
    if (!pick || !menu) return
    const nextClass = (changed.class ?? pick.class) as CreationPick["class"]
    setPick({
      ...pick,
      ...changed,
      background: changed.class ? backgroundForClass(nextClass, menu.backgrounds) : pick.background,
    })
    setChoices(null)
  }
  const randomize = () => {
    if (!menu || !menu.species.length || !menu.classes.length || !menu.backgrounds.length) return
    const nextClass = pickAnother(menu.classes, menu.classes.find((c) => c.id === pick?.class)).id as CreationPick["class"]
    setPick({
      species: pickAnother(menu.species, menu.species.find((s) => s.id === pick?.species)).id,
      class: nextClass,
      background: backgroundForClass(nextClass, menu.backgrounds),
    })
    setChoices(null)
  }
  const toggleHook = (h: string) => {
    setIdea((current) => {
      const { nextText, active } = toggleHookInText(current.idea, h)
      return {
        ...current,
        idea: nextText.slice(0, 1200),
        hook: active ? h : current.hook === h ? "" : current.hook,
      }
    })
  }
  const autoGenerate = async () => {
    if (!props.onGenerate || !menu || !pick || generating || props.busy) return
    const speciesName = menu.species.find((s) => s.id === pick.species)?.name
    const className = menu.classes.find((c) => c.id === pick.class)?.name
    if (!speciesName || !className) return
    setGenerating(true)
    try {
      const concept = await props.onGenerate({
        race: speciesName,
        archetype: className,
        hook: idea.hook.trim() || undefined,
      })
      if (!concept) return
      setIdea((current) => ({
        ...current,
        name: concept.name,
        gender: concept.gender,
        idea: concept.background.slice(0, 1200),
      }))
    } finally {
      setGenerating(false)
    }
  }
  const toRules = () => {
    if (!kit || !pick) return
    // The rules start filled in. Coming back to the same picks keeps what the player changed.
    if (!choices) setChoices(kit.auto(pick))
    go("rules")
  }
  const write = async () => {
    if (!pick || !choices) return
    const draft = await props.onDraft(idea, { pick, choices })
    if (!draft) return
    setHero({ ...draft, figure: defaultFigure(draft.race, draft.gender) })
    go("review")
  }
  const arrival = props.adventure && hero?.arrivals?.[props.adventure.id]
  const setArrival = (key: keyof Arrival, value: string) => {
    if (props.adventure && arrival && hero) setHero({ ...hero, arrivals: { ...hero.arrivals, [props.adventure.id]: { ...arrival, [key]: value } } })
  }
  // What Save Hero still waits on, said beside it.
  const arrivalLabels: Record<string, string> = { intro: "Arrival", reason: "Why They Came", tell: "What Others Notice" }
  const missing = hero
    ? [
        !hero.name.trim() && "Name",
        !hero.appearance.trim() && "Appearance",
        ...(arrival ? Object.entries(arrival).map(([key, value]) => !String(value).trim() && (arrivalLabels[key] ?? key)) : []),
      ].filter((label): label is string => Boolean(label))
    : []
  const title = step === "pick" ? "New Hero" : step === "rules" ? "Rules" : "Review Hero"
  const stepIndex = STEPS.indexOf(step)
  const saveLabel = props.saveLabel ?? "Save Hero"
  const hooks = props.adventure?.hooks ?? []

  const autoGenerateButton = props.onGenerate && (
    <Button
      variant="primary"
      size="xs"
      type="button"
      disabled={!menu || !pick || generating || props.busy}
      onClick={() => void autoGenerate()}
      className="shrink-0 gap-1.5 px-3 font-sans font-semibold"
    >
      {generating ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Sparkles aria-hidden="true" className="size-3.5" />}
      <span>{generating ? "Generating…" : "Auto Generate"}</span>
    </Button>
  )

  if (props.inline) {
    return (
      <section
        ref={inlineRef}
        aria-label={title}
        className="relative w-full scroll-mt-24 overflow-hidden rounded-2xl border border-white/15 bg-[#0d0d13]/95 text-left font-serif text-white shadow-[0_18px_48px_rgba(0,0,0,0.65)]"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 stage-grain opacity-30" />

        {/* Header: Back to Heroes, step heading, and upper-right Auto Generate / steps */}
        <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-black/35 px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Button variant="outline" size="xs" disabled={props.busy || generating} onClick={props.onClose} className="gap-1.5">
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              <span>Back to Heroes</span>
            </Button>
            <div>
              <div className={siteLabel}>Create New Character</div>
              <Heading variant="h3" as="h2" className="mt-0.5 text-xl sm:text-2xl">
                {step === "rules" && idea.name.trim() ? idea.name.trim() : title}
              </Heading>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ol aria-label="Creation steps" className="flex items-center gap-2 font-sans text-xs">
              {STEPS.map((s, idx) => {
                const active = idx === stepIndex
                const done = idx < stepIndex
                return (
                  <li
                    key={s}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
                      active
                        ? "border-accent-300/45 bg-accent-300/12 font-medium text-accent-200"
                        : done
                          ? "border-roll-success/35 bg-roll-success/10 text-roll-success"
                          : "border-white/10 bg-white/[0.02] text-white/40"
                    )}
                  >
                    {done ? <Check aria-hidden="true" className="size-3" /> : <span className="font-mono text-4xs">{idx + 1}</span>}
                    <span>{STEP_LABELS[s]}</span>
                  </li>
                )
              })}
            </ol>
            {step === "pick" && autoGenerateButton}
          </div>
        </div>

        <Swap id={step} motion={back ? "left" : "right"} exit={back ? "right" : "left"} className="relative flex flex-col">
          {step === "pick" && (
            <>
              <div className="flex flex-col gap-4 p-5 sm:gap-5 sm:p-7">
                <div className={inlineWell}>
                  <Swap id={!menu || !pick ? "loading" : "menu"} className="flex flex-col gap-4">
                    {!menu || !pick ? (
                      <p className="font-sans text-sm text-white/60 italic">Loading species and classes…</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <Choice label="Species" values={menu.species} value={pick.species} onPick={(id) => repick({ species: id })} />
                          <Button variant="outline" size="xs" type="button" disabled={generating} onClick={randomize} className="shrink-0 gap-1.5">
                            <Dices aria-hidden="true" className="size-3.5 text-accent-300" />
                            <span>Randomize</span>
                          </Button>
                        </div>
                        <Choice label="Class" values={menu.classes} value={pick.class} onPick={(id) => repick({ class: id as CreationPick["class"] })} />
                      </>
                    )}
                  </Swap>
                </div>

                <div className={cn(inlineWell, "flex flex-col gap-4")}>
                  <div className="grid gap-3.5 sm:grid-cols-[2fr_1fr]">
                    <Labeled label="Name">
                      <Input placeholder="e.g. Rowan Brightwood" value={idea.name} maxLength={80} disabled={generating} onChange={(e) => set("name", e.target.value)} />
                    </Labeled>
                    <Labeled label="Gender">
                      <Input placeholder="Optional" value={idea.gender} maxLength={40} disabled={generating} onChange={(e) => set("gender", e.target.value)} />
                    </Labeled>
                  </div>
                  <Labeled label="Background">
                    <Textarea
                      className="min-h-32 resize-y leading-relaxed"
                      rows={5}
                      maxLength={1200}
                      disabled={generating}
                      placeholder="Who they are, their past, and why they came to this adventure…"
                      value={idea.idea}
                      onChange={(e) => set("idea", e.target.value)}
                    />
                  </Labeled>

                  {hooks.length > 0 && (
                    <div className="border-t border-white/10 pt-3.5">
                      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-mono text-3xs uppercase tracking-label text-primary-200/80">Why They Came</span>
                        <span className="font-sans text-2xs text-white/45">Click a hook to fold into background</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {hooks.map((h) => {
                          const active = idea.idea.includes(h)
                          return (
                            <Option key={h} size="xs" disabled={generating} aria-pressed={active} active={active} className="text-left" onClick={() => toggleHook(h)}>
                              {h}
                            </Option>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/45 px-5 py-4 sm:px-7">
                <span className="font-sans text-xs text-white/50">
                  {generating
                    ? "Asking the GM Host to dream up your hero…"
                    : !idea.name.trim()
                      ? "Enter a hero name — or use Auto Generate above — to continue."
                      : "Next: customize ability scores, skills, and gear."}
                </span>
                <div className="flex items-center gap-3">
                  <Button variant="outline" disabled={generating} onClick={props.onClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="lg" className="px-6 font-sans font-semibold" disabled={!kit || !pick || generating || !idea.name.trim()} onClick={toRules}>
                    Choose Rules
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === "rules" && kit && pick && choices && (
            <>
              <div className="flex flex-col gap-5 p-5 sm:p-7">
                <div className="rounded-xl border border-white/10 bg-black/45 px-4 py-3 font-sans text-sm text-white/85">
                  {view
                    ? `Level 1 ${view.speciesName} ${view.className} · Hit Points ${view.hitPoints.maximum} · Armor Class ${view.armorClass} · Speed ${view.speed} ft.`
                    : "These choices do not make a legal hero yet."}
                </div>
                <HeroRules kit={kit} pick={pick} choices={choices} onChange={setChoices} />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-black/45 px-5 py-4 sm:px-7">
                <Presence show={problems.length > 0} motion="fade" asChild>
                  <p role="alert" className="mr-auto max-w-[32rem] font-sans text-xs text-red-300">
                    {problems.map((problem) => problem.charAt(0).toUpperCase() + problem.slice(1)).join(". ")}.
                  </p>
                </Presence>
                <Presence show={props.busy} motion="fade" asChild>
                  <span className="mr-auto font-sans text-xs text-accent-200 italic">The GM is writing your hero…</span>
                </Presence>
                <Button variant="outline" disabled={props.busy} onClick={() => go("pick")}>
                  Back
                </Button>
                <Button variant="outline" disabled={props.busy} onClick={() => setChoices(kit.auto(pick))}>
                  Choose For Me
                </Button>
                <Button variant="primary" size="lg" className="px-6 font-sans font-semibold" disabled={props.busy || problems.length > 0} onClick={() => void write()}>
                  {props.busy ? "Writing Hero…" : "Write My Hero"}
                </Button>
              </div>
            </>
          )}

          {step === "review" && hero && (
            <>
              <div className="flex flex-col gap-5 p-5 sm:p-7">
                <div className={cn(inlineWell, "grid gap-5", props.figures !== false && "md:grid-cols-[220px_1fr]")}>
                  <div hidden={props.figures === false}>
                    <div className={cn(siteLabel, "mb-2")}>Figure</div>
                    <div className="grid grid-cols-2 gap-2">
                      {props.painted && (
                        <Button
                          variant="plain"
                          type="button"
                          aria-pressed={Boolean(hero.painted)}
                          aria-label="Painted Figure"
                          onClick={() => setHero({ ...hero, painted: true })}
                          className={figure(Boolean(hero.painted))}
                        >
                          <img src={props.painted.front} alt="" className="block h-56 w-full object-contain" />
                        </Button>
                      )}
                      {figuresFor(hero.race).map((f) => (
                        <Button
                          variant="plain"
                          key={f.id}
                          type="button"
                          aria-pressed={!hero.painted && hero.figure === f.id}
                          aria-label={`Figure ${f.id.endsWith("-a") ? 1 : 2}`}
                          onClick={() => setHero({ ...hero, figure: f.id, painted: false })}
                          className={figure(!hero.painted && hero.figure === f.id)}
                        >
                          <img src={f.art.front} alt="" className="block h-56 w-full object-contain" />
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid content-start gap-3.5">
                    <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                      <Labeled label="Name">
                        <Input className="font-display text-lg text-accent-300" value={hero.name} maxLength={80} onChange={(e) => setHero({ ...hero, name: e.target.value })} />
                      </Labeled>
                      <Labeled label="Gender">
                        <Input value={hero.gender ?? ""} maxLength={40} onChange={(e) => setHero({ ...hero, gender: e.target.value })} />
                      </Labeled>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 p-3.5 font-sans text-sm text-white/85">
                      <div className="font-display text-base text-accent-300">
                        {sheet ? `Level ${sheet.level} ${hero.race} ${sheet.className}${sheet.subclassName ? ` · ${sheet.subclassName}` : ""}` : `${hero.race} ${hero.archetype}`}
                      </div>
                      {sheet && (
                        <>
                          <div className="mt-1 text-xs text-white/80">
                            Hit Points {sheet.hitPoints.maximum} · Armor Class {sheet.armorClass} · Speed {sheet.speed} ft. · Initiative {signed(sheet.initiative)}
                          </div>
                          <div className="mt-1.5 font-mono text-xs tabular-nums text-primary-200">{sheet.abilities.map((a) => `${a.name.slice(0, 3)} ${a.score}`).join(" · ")}</div>
                          <div className="mt-1.5 text-xs text-white/75">
                            {sheet.skills
                              .filter((s) => s.proficient)
                              .map((s) => `${s.name} ${signed(s.bonus)}`)
                              .join(", ")}
                          </div>
                          {sheet.spellcasting && <div className="mt-1 text-xs text-accent-200/85">{[...sheet.spellcasting.cantrips, ...sheet.spellcasting.prepared].join(", ")}</div>}
                        </>
                      )}
                      {(hero.equipment?.length ?? 0) > 0 && <div className="mt-1.5 text-xs text-white/60">{hero.equipment?.map((item) => item.name).join(", ")}</div>}
                    </div>
                  </div>
                </div>

                {arrival && (
                  <div className={cn(inlineWell, "grid gap-3.5 md:grid-cols-2")}>
                    <div className="md:col-span-2">
                      <Labeled label="Arrival">
                        <Textarea className="resize-y" rows={2} maxLength={600} value={arrival.intro} onChange={(e) => setArrival("intro", e.target.value)} />
                      </Labeled>
                    </div>
                    <Labeled label="Why They Came">
                      <Textarea className="resize-y" rows={2} maxLength={400} value={arrival.reason} onChange={(e) => setArrival("reason", e.target.value)} />
                    </Labeled>
                    <Labeled label="What Others Notice">
                      <Textarea className="resize-y" rows={2} maxLength={200} value={arrival.tell} onChange={(e) => setArrival("tell", e.target.value)} />
                    </Labeled>
                  </div>
                )}

                <div className={cn(inlineWell, "grid gap-3.5 md:grid-cols-2")}>
                  {(["appearance", "personality", "background", "motivation", "behavior"] as const).map((key) => (
                    <Labeled key={key} label={key === "background" ? "Past" : key}>
                      <Textarea className="resize-y" rows={3} value={hero[key] ?? ""} onChange={(e) => setHero({ ...hero, [key]: e.target.value })} />
                    </Labeled>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-black/45 px-5 py-4 sm:px-7">
                <Presence show={props.busy} motion="fade" asChild>
                  <span className="mr-auto font-sans text-xs text-accent-200 italic">Saving…</span>
                </Presence>
                <Presence show={!props.busy && missing.length > 0} motion="fade" initial={false} asChild>
                  <p className="mr-auto font-sans text-xs text-white/65">Still to fill in: {missing.join(", ")}.</p>
                </Presence>
                {!props.editing && (
                  <Button variant="outline" disabled={props.busy} onClick={() => go("rules")}>
                    Back
                  </Button>
                )}
                <Button
                  variant="epic"
                  size="default"
                  className="scale-100 hover:scale-[1.02]"
                  disabled={props.busy || missing.length > 0}
                  onClick={() => void props.onSave(hero, !props.editing && pick && choices ? { pick, choices } : undefined)}
                >
                  {props.busy ? "Saving…" : saveLabel}
                </Button>
              </div>
            </>
          )}
        </Swap>
      </section>
    )
  }

  return (
    // Escape and the close button close it. A press outside does not, so a hero in progress is not lost.
    <Dialog
      open={props.open ?? true}
      closeOnOutsidePress={false}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      onOpenChangeComplete={(open) => {
        if (!open) props.onClosed?.()
      }}
    >
      {/* The website's character sheet: a deep primary gradient with a primary border. */}
      <DialogContent
        aria-label={title}
        initialFocus="content"
        closeClassName="top-3 text-white/60 opacity-100 hover:text-white [&_svg:not([class*='size-'])]:size-6"
        className="flex max-h-[90vh] w-[min(56rem,95vw)] max-w-none flex-col gap-5 overflow-x-hidden overflow-y-auto rounded-lg border border-primary-600 bg-transparent bg-gradient-to-br from-primary-900/95 via-primary-800/95 to-primary-900/95 p-7 text-left font-serif text-white shadow-lg sm:max-w-none"
      >
        <Swap id={step} motion={back ? "left" : "right"} exit={back ? "right" : "left"} className="flex flex-col gap-5">
          {step === "pick" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
                <Heading variant="h2">New Hero</Heading>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="xs" type="button" disabled={!menu || !pick || generating} onClick={randomize} className="gap-1.5">
                    <Dices aria-hidden="true" className="size-3.5 text-accent-300" />
                    <span>Randomize</span>
                  </Button>
                  {autoGenerateButton}
                </div>
              </div>
              <Swap id={!menu || !pick ? "loading" : "menu"} className="flex flex-col gap-5">
                {!menu || !pick ? (
                  <p className="text-white/70 italic">Loading…</p>
                ) : (
                  <>
                    <Choice label="Species" values={menu.species} value={pick.species} onPick={(id) => repick({ species: id })} />
                    <Choice label="Class" values={menu.classes} value={pick.class} onPick={(id) => repick({ class: id as CreationPick["class"] })} />
                  </>
                )}
              </Swap>
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <Labeled label="Name">
                  <Input value={idea.name} maxLength={80} disabled={generating} onChange={(e) => set("name", e.target.value)} />
                </Labeled>
                <Labeled label="Gender">
                  <Input value={idea.gender} maxLength={40} disabled={generating} onChange={(e) => set("gender", e.target.value)} />
                </Labeled>
              </div>
              <Labeled label="Background">
                <Textarea
                  className="min-h-32 resize-y leading-relaxed"
                  rows={5}
                  maxLength={1200}
                  disabled={generating}
                  placeholder="Who they are, their past, and why they came to this adventure…"
                  value={idea.idea}
                  onChange={(e) => set("idea", e.target.value)}
                />
              </Labeled>
              {hooks.length > 0 && (
                <div>
                  <div className={cn(siteLabel, "mb-2")}>Why They Came</div>
                  <div className="flex flex-wrap gap-2">
                    {hooks.map((h) => {
                      const active = idea.idea.includes(h)
                      return (
                        <Option key={h} size="xs" disabled={generating} aria-pressed={active} active={active} className="text-left" onClick={() => toggleHook(h)}>
                          {h}
                        </Option>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className={dialogFooter}>
                <Presence show={generating} motion="fade" asChild>
                  <span className="mr-auto text-sm text-white/70 italic">Generating hero concept…</span>
                </Presence>
                <Button variant="epic" className="text-lg" disabled={!kit || !pick || generating || !idea.name.trim()} onClick={toRules}>
                  Choose Rules
                </Button>
              </div>
            </>
          )}
          {step === "rules" && kit && pick && choices && (
            <>
              <div>
                <Heading variant="h2">{idea.name.trim()}</Heading>
                <p className="mt-1 text-white/80">
                  {view
                    ? `Level 1 ${view.speciesName} ${view.className} · Hit Points ${view.hitPoints.maximum} · Armor Class ${view.armorClass} · Speed ${view.speed} ft.`
                    : "These choices do not make a legal hero yet."}
                </p>
              </div>
              <HeroRules kit={kit} pick={pick} choices={choices} onChange={setChoices} />
              <div className={dialogFooter}>
                <Presence show={problems.length > 0} motion="fade" asChild>
                  <p role="alert" className="mr-auto max-w-[32rem] text-sm text-red-300">
                    {problems.map((problem) => problem.charAt(0).toUpperCase() + problem.slice(1)).join(". ")}.
                  </p>
                </Presence>
                <Presence show={props.busy} motion="fade" asChild>
                  <span className="text-sm text-white/70 italic">The GM is writing your hero…</span>
                </Presence>
                <Button variant="outline" disabled={props.busy} onClick={() => go("pick")}>
                  Back
                </Button>
                <Button variant="outline" disabled={props.busy} onClick={() => setChoices(kit.auto(pick))}>
                  Choose For Me
                </Button>
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
                      <Button
                        variant="plain"
                        type="button"
                        aria-pressed={Boolean(hero.painted)}
                        aria-label="Painted Figure"
                        onClick={() => setHero({ ...hero, painted: true })}
                        className={figure(Boolean(hero.painted))}
                      >
                        <img src={props.painted.front} alt="" className="block h-56 w-full object-contain" />
                      </Button>
                    )}
                    {figuresFor(hero.race).map((f) => (
                      <Button
                        variant="plain"
                        key={f.id}
                        type="button"
                        aria-pressed={!hero.painted && hero.figure === f.id}
                        aria-label={`Figure ${f.id.endsWith("-a") ? 1 : 2}`}
                        onClick={() => setHero({ ...hero, figure: f.id, painted: false })}
                        className={figure(!hero.painted && hero.figure === f.id)}
                      >
                        <img src={f.art.front} alt="" className="block h-56 w-full object-contain" />
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid content-start gap-3">
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                    <Labeled label="Name">
                      <Input className="font-display text-lg text-accent-300" value={hero.name} maxLength={80} onChange={(e) => setHero({ ...hero, name: e.target.value })} />
                    </Labeled>
                    <Labeled label="Gender">
                      <Input value={hero.gender ?? ""} maxLength={40} onChange={(e) => setHero({ ...hero, gender: e.target.value })} />
                    </Labeled>
                  </div>
                  {/* The rules of the hero, read off their sheet. Levels change them, not this screen. */}
                  <div className="rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white/85">
                    <div className="font-display text-base text-accent-300">
                      {sheet ? `Level ${sheet.level} ${hero.race} ${sheet.className}${sheet.subclassName ? ` · ${sheet.subclassName}` : ""}` : `${hero.race} ${hero.archetype}`}
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
                      <Textarea className="resize-y" rows={2} maxLength={600} value={arrival.intro} onChange={(e) => setArrival("intro", e.target.value)} />
                    </Labeled>
                  </div>
                  <Labeled label="Why They Came">
                    <Textarea className="resize-y" rows={2} maxLength={400} value={arrival.reason} onChange={(e) => setArrival("reason", e.target.value)} />
                  </Labeled>
                  <Labeled label="What Others Notice">
                    <Textarea className="resize-y" rows={2} maxLength={200} value={arrival.tell} onChange={(e) => setArrival("tell", e.target.value)} />
                  </Labeled>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {(["appearance", "personality", "background", "motivation", "behavior"] as const).map((key) => (
                  <Labeled key={key} label={key === "background" ? "Past" : key}>
                    <Textarea className="resize-y" rows={3} value={hero[key] ?? ""} onChange={(e) => setHero({ ...hero, [key]: e.target.value })} />
                  </Labeled>
                ))}
              </div>
              <div className={dialogFooter}>
                <Presence show={props.busy} motion="fade" asChild>
                  <span className="text-sm text-white/70 italic">Saving…</span>
                </Presence>
                <Presence show={!props.busy && missing.length > 0} motion="fade" initial={false} asChild>
                  <p className="mr-auto text-sm text-white/70">Still to fill in: {missing.join(", ")}.</p>
                </Presence>
                {!props.editing && (
                  <Button variant="outline" disabled={props.busy} onClick={() => go("rules")}>
                    Back
                  </Button>
                )}
                <Button
                  variant="epic"
                  className="text-lg"
                  disabled={props.busy || missing.length > 0}
                  onClick={() => void props.onSave(hero, !props.editing && pick && choices ? { pick, choices } : undefined)}
                >
                  {saveLabel}
                </Button>
              </div>
            </>
          )}
        </Swap>
      </DialogContent>
    </Dialog>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label plain className="grid gap-1">
      <span className={siteLabel}>{label}</span>
      {children}
    </Label>
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
