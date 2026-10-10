import festivalSet from "@d20/stage/sets/realm-of-myr/kordavos-harvest-square.json"
import riverfrontSet from "@d20/stage/sets/realm-of-myr/kordavos-riverfront.json"
import gateSet from "@d20/stage/sets/realm-of-myr/kordavos-south-gate.json"
import pierSet from "@d20/stage/sets/realm-of-myr/mordava-river-pier.json"
import pathSet from "@d20/stage/sets/realm-of-myr/old-forest-path.json"
import stonesSet from "@d20/stage/sets/realm-of-myr/old-standing-stones.json"
import homeSet from "@d20/stage/sets/realm-of-myr/thalberns-forest-home.json"
import forestSet from "@d20/stage/sets/realm-of-myr/valkarr-forest-trail.json"
import battleOnTheBoat from "@d20/stage/stagings/covert-cargo/battle-on-the-boat.json"
import returnToTheCity from "@d20/stage/stagings/covert-cargo/return-to-the-city.json"
import theCrate from "@d20/stage/stagings/covert-cargo/the-crate.json"
import theDisturbance from "@d20/stage/stagings/covert-cargo/the-disturbance.json"
import theEnd from "@d20/stage/stagings/covert-cargo/the-end.json"
import theEscape from "@d20/stage/stagings/covert-cargo/the-escape.json"
import theFake from "@d20/stage/stagings/covert-cargo/the-fake.json"
import theRanger from "@d20/stage/stagings/covert-cargo/the-ranger.json"
import theShipment from "@d20/stage/stagings/covert-cargo/the-shipment.json"
import theTransaction from "@d20/stage/stagings/covert-cargo/the-transaction.json"
import gateStaging from "@d20/stage/stagings/march-of-davos/the-gates-of-kordavos.json"
import festivalStaging from "@d20/stage/stagings/march-of-davos/the-harvest-festival.json"
import backHome from "@d20/stage/stagings/the-midnight-summons/back-home.json"
import brokenSilence from "@d20/stage/stagings/the-midnight-summons/broken-silence.json"
import meetingAtTheStones from "@d20/stage/stagings/the-midnight-summons/meeting-at-the-stones.json"
import owlbearConfrontation from "@d20/stage/stagings/the-midnight-summons/owlbear-confrontation.json"
import preparingForTheCity from "@d20/stage/stagings/the-midnight-summons/preparing-for-the-city.json"
import theMissingRelics from "@d20/stage/stagings/the-midnight-summons/the-missing-relics.json"
import timelyRescue from "@d20/stage/stagings/the-midnight-summons/timely-rescue.json"
import { type FigureArt, type FigureOwner, heroFigure, PREMADE_FIGURES } from "./figures"

type Point = { x: number; z: number }
type Who = { id: string; name: string; type?: string; race?: string; archetype?: string; gender?: string }
type CastMember = { id: string; name: string; role?: string; height?: number; at: string | number[]; facing?: string | number | number[]; art: { front?: string; back?: string; portrait?: string } }
type Shot = { subject?: string; subjects?: string[]; label?: string }
export interface Scene {
  set: { title: string; marks: Record<string, { at: number[]; label?: string }> }
  staging: { cast: CastMember[]; shots?: Record<string, Shot>; loops?: Record<string, { party?: { members: string[] } }>; shot?: string }
  // The HUD's place name, and the opening line of the GM's map staging.
  location: string
  where: string
  // Cast ids where the party stands, and spots for heroes beyond them.
  party: string[]
  spare?: [number, number][]
}

// The real intro starts at the checkpoint. The ambient queue must not move the party independently of game state.
const gate = structuredClone(gateStaging)
gate.loops["gate-line"].party.position = 0

// Encounters with an authored 3D scene. Any other encounter plays in story view with the same controls.
export const SCENES: Record<string, Scene> = {
  "the-gates-of-kordavos": {
    set: gateSet,
    staging: gate,
    location: "Kordavos checkpoint",
    where: "The party stands in the line at Garlan's checkpoint outside the gate of Kordavos.",
    party: ["branka", "cassia", "yeva", "milos"],
    spare: [[0.82, 14.5]],
  },
  "the-harvest-festival": {
    set: festivalSet,
    staging: festivalStaging,
    location: "Harvest Festival",
    where: "The party has come up the street from the gate into the festival square.",
    party: ["branka-stoneveil", "cassia-verane", "yeva-softstep", "milos-radan"],
    spare: [[-1, 19.3]],
  },
  // The Midnight Summons: one moonlit stretch of deer trail for the walk, the owlbear, and the rescue.
  "broken-silence": {
    set: forestSet,
    staging: brokenSilence,
    location: "Valkarr woods",
    where: "Thalbern walks a deer trail through the Valkarr woods at night toward the Old Standing Stones.",
    party: ["thalbern"],
  },
  "owlbear-confrontation": {
    set: forestSet,
    staging: owlbearConfrontation,
    location: "Valkarr woods",
    where: "An owlbear faces Thalbern across a small moonlit clearing on the deer trail.",
    party: ["thalbern"],
  },
  "timely-rescue": {
    set: forestSet,
    staging: timelyRescue,
    location: "Valkarr woods",
    where: "Thalbern lies wounded by the great oak beside the trail as Wollandora steps out of the trees.",
    party: ["thalbern"],
  },
  "meeting-at-the-stones": {
    set: stonesSet,
    staging: meetingAtTheStones,
    location: "Old Standing Stones",
    where: "Moonlight fills the clearing where a line of ancient standing stones runs beside the river.",
    party: ["thalbern"],
  },
  "the-missing-relics": {
    set: stonesSet,
    staging: theMissingRelics,
    location: "Old Standing Stones",
    where: "Thalbern and Wollandora talk among the standing stones by the moonlit river.",
    party: ["thalbern"],
  },
  "preparing-for-the-city": {
    set: homeSet,
    staging: preparingForTheCity,
    location: "Thalbern's home",
    where: "Morning sun falls on Thalbern's stone and timber cottage at the edge of the woods.",
    party: ["thalbern"],
  },
  "back-home": { set: homeSet, staging: backHome, location: "Thalbern's home", where: "Morning sun falls on Thalbern's stone and timber cottage at the edge of the woods.", party: ["thalbern"] },
  // Covert Cargo: the pier before dawn, inside and outside the boat. The meeting is in the saloon, Poppen in the bushes.
  "the-shipment": cargo(
    pierSet,
    theShipment,
    "Mordava pier",
    "Before dawn, a riverboat lies moored beside a rickety pier on a quiet, misty fork of the Mordava. Lyra stands in its lamplit saloon before the crate, Reinhard beside her and Silas by the only door. Elves guard the deck, and Poppen hides in the bushes at the treeline."
  ),
  "the-transaction": cargo(pierSet, theTransaction, "Riverboat saloon", "The riverboat's lamplit saloon at the rickety pier, the crate in the middle and the only door opening forward onto the deck."),
  "the-disturbance": cargo(pierSet, theDisturbance, "Mordava pier", "Before dawn at the riverboat's pier. Something stirred in the bushes at the treeline, up the bank from the gangway."),
  "the-escape": cargo(pierSet, theEscape, "Mordava woods", "A trail runs from the pier along the misty riverbank and into the woods toward Kordavos."),
  "the-fake": cargo(pierSet, theFake, "Riverboat saloon", "The riverboat's lamplit saloon. The crate sits in the middle, and the only door opens forward onto the deck."),
  "battle-on-the-boat": cargo(pierSet, battleOnTheBoat, "Riverboat saloon", "The riverboat's lamplit saloon. The crate sits in the middle, and the only door opens forward onto the deck."),
  "the-crate": cargo(pierSet, theCrate, "Riverboat saloon", "The riverboat's saloon, quiet now. The heavy iron-banded crate sits in the middle under hanging rope."),
  "the-ranger": cargo(
    pierSet,
    theRanger,
    "Riverboat saloon",
    "The riverboat's lamplit saloon after the fight. A ranger with a longbow stands in the only door, which opens forward onto the deck, and the crate sits in the middle."
  ),
  "return-to-the-city": cargo(riverfrontSet, returnToTheCity, "Kordavos riverfront", "The quay along the river in Kordavos, ships at their moorings and the castle on its hill above the city."),
  "the-end": cargo(pathSet, theEnd, "The old forest", "A mossy path winds between huge old trees in green-gold light."),
}
function cargo(set: unknown, staging: unknown, location: string, where: string): Scene {
  return { set: set as Scene["set"], staging: staging as Scene["staging"], location, where, party: ["lyra", "poppen"] }
}
export const sceneFor = (encounterId: string | undefined) => (encounterId ? SCENES[encounterId] : undefined)

// The cast member standing for a turn character. Later stagings use content character ids (`madam-zephyra`); the gate's
// staging predates that and uses first names (`garlan`), which saved gate positions are keyed by.
export function castIdFor(cast: readonly { id: string }[], c: Who) {
  if (cast.some((s) => s.id === c.id)) return c.id
  const first = c.name.split(" ")[0].toLowerCase()
  return cast.some((s) => s.id === first) ? first : undefined
}

// The scene with the adventure's actual party in it. A premade keeps its own slot, other heroes take the free slots in
// order and then the spare spots, and unused slots leave. Shots and the gate queue follow. A created hero never claims a
// premade's slot by sharing a first name. The authored party gets the authored staging back unchanged.
export function partyScene(scene: Scene, characters: readonly Who[], chosen: Record<string, string> = {}, painted: Record<string, FigureArt> = {}): Scene {
  const staging = structuredClone(scene.staging)
  const pcs = characters.filter((c) => c.type === "pc")
  const slots = new Map(scene.party.map((id) => [id, staging.cast.find((m) => m.id === id)!]))
  const rest = pcs.filter((pc) => {
    const own = chosen[pc.id] || painted[pc.id] ? undefined : castIdFor(staging.cast, pc)
    if (!own || !slots.has(own)) return true
    slots.delete(own)
    return false
  })
  const renamed = new Map<string, { id: string; label: string }>()
  const added: string[] = []
  for (const [slot, member] of slots) {
    const pc = rest.shift()
    if (pc) {
      const old = member.name
      Object.assign(member, heroCast(pc, chosen, painted))
      renamed.set(slot, { id: pc.id, label: old })
    } else staging.cast = staging.cast.filter((m) => m !== member)
  }
  const removed = new Set([...slots.keys()].filter((id) => !renamed.has(id)))
  for (const [i, pc] of rest.entries()) {
    const at = scene.spare?.[i]
    if (!at) throw new Error(`${scene.location} has no place for ${pc.name}.`)
    staging.cast.push({ ...heroCast(pc, chosen, painted), at, facing: staging.cast.find((m) => scene.party.includes(m.id))?.facing ?? 0 })
    added.push(pc.id)
  }
  const to = (id: string) => renamed.get(id)?.id ?? id
  for (const m of staging.cast) if (typeof m.facing === "string") m.facing = removed.has(m.facing) ? 0 : to(m.facing)
  const cut = (key: string) => {
    delete staging.shots![key]
    if (staging.shot === key) staging.shot = undefined
  }
  for (const [key, shot] of Object.entries(staging.shots ?? {})) {
    if (shot.subjects) {
      // Spare heroes join the party's own shot, not a framing of particular characters.
      const party = shot.subjects.every((id) => scene.party.includes(id))
      shot.subjects = [...shot.subjects.filter((id) => !removed.has(id)).map(to), ...(party ? added : [])]
      if (!shot.subjects.length) cut(key)
    } else if (shot.subject && removed.has(shot.subject)) cut(key)
    else if (shot.subject && renamed.has(shot.subject)) {
      const { id, label } = renamed.get(shot.subject)!
      if (shot.label && label.startsWith(shot.label)) shot.label = pcs.find((pc) => pc.id === id)!.name.split(" ")[0]
      shot.subject = id
    }
  }
  for (const loop of Object.values(staging.loops ?? {})) if (loop.party) loop.party.members = [...loop.party.members.filter((id) => !removed.has(id)).map(to), ...added]
  return { ...scene, staging }
}
function heroCast(pc: Who, chosen: Record<string, string>, painted: Record<string, FigureArt>) {
  const figure = heroFigure(pc as FigureOwner, chosen, painted)
  return { id: pc.id, name: pc.name, role: [pc.race, pc.archetype?.toLowerCase()].filter(Boolean).join(" "), height: figure.height, art: figure.art }
}

// Portraits for scenes where a character has no figure, cropped from their standee art. The app shows only bundled images.
const PORTRAITS: Record<string, string> = {
  thalbern: "/stage/fixtures/the-midnight-summons/thalbern-portrait.jpg",
  wollandora: "/stage/fixtures/the-midnight-summons/wollandora-portrait.jpg",
  owlbear: "/stage/fixtures/the-midnight-summons/owlbear-portrait.jpg",
}

// A character's portrait: a created hero's figure, else the current scene, else any authored scene, so story view keeps
// the party's faces. Heroes with no art anywhere show their stock figure.
export function portraitFor(scene: Scene | undefined, c: Who, chosen: Record<string, string> = {}, painted: Record<string, FigureArt> = {}) {
  if (chosen[c.id] || painted[c.id]) return heroFigure(c as FigureOwner, chosen, painted).art.portrait
  for (const s of [scene, ...Object.values(SCENES)]) {
    const id = s && castIdFor(s.staging.cast, c)
    const portrait = id && s.staging.cast.find((m) => m.id === id)?.art.portrait
    if (portrait) return portrait
  }
  return PORTRAITS[c.id] ?? PREMADE_FIGURES[c.id]?.art.portrait ?? (c.type === "pc" ? heroFigure(c as FigureOwner).art.portrait : undefined)
}

// Map staging for the GM's narration: the place, its named spots, and where each character in the turn stands now
// (saved positions, else where the staging puts them). Ambient extras such as the gate's merchant are left out.
export function spatialContext(encounterId: string, characters: readonly Who[], positions: Record<string, Point>, chosen: Record<string, string> = {}) {
  const authored = SCENES[encounterId]
  if (!authored) return
  const { set, staging } = partyScene(authored, characters, chosen)
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
  return `${authored.where}\nNamed places, x and z in metres: ${places.join("; ")}.\nWhere everyone stands now, x and z in metres: ${people.join("; ")}.`
}
