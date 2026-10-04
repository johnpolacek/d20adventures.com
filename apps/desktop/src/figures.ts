// Standee art for heroes. A created hero picks a stock figure for their race, in one of two builds. Premades whose web
// art predates Stageview were painted for the app. Any other hero without art falls back to a stock figure. The app
// shows only bundled images.
export type FigureArt = { front: string; back: string; portrait: string }
export type Figure = { id: string; race: string; height: number; art: FigureArt }
export type FigureOwner = { id: string; race?: string; gender?: string }

const art = (dir: string, name: string): FigureArt => ({ front: `/stage/${dir}/${name}-front.webp`, back: `/stage/${dir}/${name}-back.webp`, portrait: `/stage/${dir}/${name}-portrait.jpg` })
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "-")

// Build a is the masculine figure, b the feminine one. Heights in metres.
const RACES: [string, number, number][] = [
  ["Human", 1.8, 1.7],
  ["Elf", 1.85, 1.76],
  ["Half-Elf", 1.8, 1.72],
  ["Dwarf", 1.4, 1.34],
  ["Halfling", 1.08, 1.04],
  ["Gnome", 1.02, 0.98],
  ["Half-Orc", 1.95, 1.84],
]
export const STOCK_FIGURES: Record<string, Figure> = Object.fromEntries(
  RACES.flatMap(([race, a, b]) =>
    (["a", "b"] as const).map((build) => {
      const id = `${slug(race)}-${build}`
      return [id, { id, race, height: build === "a" ? a : b, art: art("heroes", id) }]
    })
  )
)
// Myr's own peoples that look human on a standee.
const LOOKS_LIKE: Record<string, string> = { Asterian: "Human" }

export const figuresFor = (race: string) => Object.values(STOCK_FIGURES).filter((f) => f.race === (LOOKS_LIKE[race] ?? race))
export function defaultFigure(race: string, gender?: string) {
  const [a, b] = figuresFor(race).length ? figuresFor(race) : figuresFor("Human")
  return (/\b(female|woman|girl|she)\b/i.test(gender ?? "") ? b : a).id
}

export const PREMADE_FIGURES: Record<string, Figure> = {
  "wrenna-faelendar": { id: "wrenna-faelendar", race: "Elf", height: 1.76, art: art("fixtures/march-of-davos", "wrenna") },
  "ilya-veles": { id: "ilya-veles", race: "Half-Elf", height: 1.8, art: art("fixtures/march-of-davos", "ilya") },
  // Covert Cargo's premades: Lyra Silvanus and Poppen Quickfoot.
  "1749159962941": { id: "1749159962941", race: "Asterian", height: 1.7, art: art("fixtures/covert-cargo", "lyra") },
  "1749307435667": { id: "1749307435667", race: "Halfling", height: 1.06, art: art("fixtures/covert-cargo", "poppen") },
}

// A hero's figure: art painted for them, else the stock figure chosen when they were created, else their premade art,
// else stock for their race. Painted art keeps the stock figure's height. Premades with their own staging art (the gate
// party, Thalbern) never get here, since their scenes already carry them.
export function heroFigure(c: FigureOwner, chosen: Record<string, string> = {}, painted: Record<string, FigureArt> = {}): Figure {
  const figure = STOCK_FIGURES[chosen[c.id]] ?? PREMADE_FIGURES[c.id] ?? STOCK_FIGURES[defaultFigure(c.race ?? "Human", c.gender)]
  return painted[c.id] ? { ...figure, id: `painted-${c.id}`, art: painted[c.id] } : figure
}
