import festivalSet from "@d20/stage/sets/realm-of-myr/kordavos-harvest-square.json"
import gateSet from "@d20/stage/sets/realm-of-myr/kordavos-south-gate.json"
import forestSet from "@d20/stage/sets/realm-of-myr/valkarr-forest-trail.json"
import gateStaging from "@d20/stage/stagings/march-of-davos/the-gates-of-kordavos.json"
import festivalStaging from "@d20/stage/stagings/march-of-davos/the-harvest-festival.json"
import brokenSilence from "@d20/stage/stagings/the-midnight-summons/broken-silence.json"
import owlbearConfrontation from "@d20/stage/stagings/the-midnight-summons/owlbear-confrontation.json"
import timelyRescue from "@d20/stage/stagings/the-midnight-summons/timely-rescue.json"

type Point = { x: number; z: number }
type Who = { id: string; name: string }
export interface Scene {
  set: { title: string; marks: Record<string, { at: number[]; label?: string }> }
  staging: { cast: { id: string; name: string; at: string | number[]; art: { portrait?: string } }[]; shot?: string }
  // The HUD's place name, and the opening line of the GM's map staging.
  location: string
  where: string
}

// The real intro starts at the checkpoint. The ambient queue must not move the party independently of game state.
const gate = structuredClone(gateStaging)
gate.loops["gate-line"].party.position = 0

// Encounters with an authored 3D scene. Any other encounter plays in story view with the same controls.
export const SCENES: Record<string, Scene> = {
  "the-gates-of-kordavos": { set: gateSet, staging: gate, location: "Kordavos checkpoint", where: "The party stands in the line at Garlan's checkpoint outside the gate of Kordavos." },
  "the-harvest-festival": { set: festivalSet, staging: festivalStaging, location: "Harvest Festival", where: "The party has come up the street from the gate into the festival square." },
  // The Midnight Summons: one moonlit stretch of deer trail for the walk, the owlbear, and the rescue.
  "broken-silence": { set: forestSet, staging: brokenSilence, location: "Valkarr woods", where: "Thalbern walks a deer trail through the Valkarr woods at night toward the Old Standing Stones." },
  "owlbear-confrontation": { set: forestSet, staging: owlbearConfrontation, location: "Valkarr woods", where: "An owlbear faces Thalbern across a small moonlit clearing on the deer trail." },
  "timely-rescue": { set: forestSet, staging: timelyRescue, location: "Valkarr woods", where: "Thalbern lies wounded by the great oak beside the trail as Wollandora steps out of the trees." },
}
export const sceneFor = (encounterId: string | undefined) => (encounterId ? SCENES[encounterId] : undefined)

// The cast member standing for a turn character. Later stagings use content character ids (`madam-zephyra`); the gate's
// staging predates that and uses first names (`garlan`), which saved gate positions are keyed by.
export function castIdFor(cast: readonly { id: string }[], c: Who) {
  if (cast.some((s) => s.id === c.id)) return c.id
  const first = c.name.split(" ")[0].toLowerCase()
  return cast.some((s) => s.id === first) ? first : undefined
}

// Portraits for scenes where a character has no figure, cropped from their standee art. The app shows only bundled images.
const PORTRAITS: Record<string, string> = {
  thalbern: "/stage/fixtures/the-midnight-summons/thalbern-portrait.jpg",
  wollandora: "/stage/fixtures/the-midnight-summons/wollandora-portrait.jpg",
  owlbear: "/stage/fixtures/the-midnight-summons/owlbear-portrait.jpg",
}

// A character's portrait from the current scene, else from any authored scene, so story view keeps the party's faces.
export function portraitFor(scene: Scene | undefined, c: Who) {
  for (const s of [scene, ...Object.values(SCENES)]) {
    const id = s && castIdFor(s.staging.cast, c)
    const portrait = id && s.staging.cast.find((m) => m.id === id)?.art.portrait
    if (portrait) return portrait
  }
  return PORTRAITS[c.id]
}

// Map staging for the GM's narration: the place, its named spots, and where each character in the turn stands now
// (saved positions, else where the staging puts them). Ambient extras such as the gate's merchant are left out.
export function spatialContext(encounterId: string, characters: readonly Who[], positions: Record<string, Point>) {
  const scene = SCENES[encounterId]
  if (!scene) return
  const { set, staging } = scene
  const start = (at: string | number[]): Point => {
    const [x, z] = typeof at === "string" ? set.marks[at].at : at
    return { x, z }
  }
  const fmt = (p: Point) => `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`
  const places = Object.values(set.marks)
    .filter((m) => m.label)
    .map((m) => `${m.label} ${fmt({ x: m.at[0], z: m.at[1] })}`)
  const people = characters.flatMap((c) => {
    const member = staging.cast.find((m) => m.id === castIdFor(staging.cast, c))
    return member ? [`${c.name} ${fmt(positions[member.id] ?? start(member.at))}`] : []
  })
  return `${scene.where}\nNamed places, x and z in metres: ${places.join("; ")}.\nWhere everyone stands now, x and z in metres: ${people.join("; ")}.`
}
