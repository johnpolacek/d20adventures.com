import { served } from "@d20/stage/served"
import { type FigureArt, type FigureOwner, heroFigure, PREMADE_FIGURES } from "./figures"
import photoreal from "./photoreal.json"

type Who = { id: string; name: string; type?: string; race?: string; archetype?: string; gender?: string }
type CastMember = { id: string; name: string; role?: string; height?: number; at: string | number[]; facing?: string | number | number[]; art: { front?: string; back?: string; portrait?: string } }
type Shot = { subject?: string; subjects?: string[]; label?: string }
export interface Scene {
  // `painted`: the set is shown as photographs, unless its staging says `painted: false`.
  set: { title: string; marks: Record<string, { at: number[]; label?: string }>; painted?: object }
  staging: { cast: CastMember[]; shots?: Record<string, Shot>; loops?: Record<string, { party?: { members: string[] } }>; shot?: string; painted?: boolean }
  // The HUD's place name, and the opening line of the GM's map staging.
  location: string
  where: string
  // Cast ids where the party stands, and spots for heroes beyond them.
  party: string[]
  spare?: [number, number][]
}

// The scenes are data: each adventure's stage/scenes.json in its package (packages/stage/src/stagings/<adventure>/
// scenes.json), the encounter's set and staging, its place name, the GM's opening line of where everyone is, and the
// party's spots. `patch` changes the staging for that scene alone (a JSON merge patch: null leaves a part out), and
// `at` moves cast members. The app loads them before it shows anything: the window by fetching its packages
// (stage-data.ts), the runtime from the files beside it (runtime/scenes-node.ts).
export interface SceneEntry {
  set: string
  staging: string
  location: string
  where: string
  party: string[]
  spare?: [number, number][]
  patch?: Record<string, unknown>
  at?: Record<string, number[]>
}
export interface AdventureStage {
  id: string
  scenes: Record<string, SceneEntry>
  sets: Record<string, unknown>
  stagings: Record<string, unknown>
  portraits?: { cards?: Record<string, string>; npcs?: Record<string, string> }
}

function merge(target: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch
  const out: Record<string, unknown> = target && typeof target === "object" && !Array.isArray(target) ? { ...(target as Record<string, unknown>) } : {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k]
    else out[k] = merge(out[k], v)
  }
  return out
}

export const SCENES: Record<string, Scene> = {}
// The adventure each scene belongs to, whose files it needs (files.ts).
const ADVENTURE_OF: Record<string, string> = {}
export const adventureOf = (encounterId: string | undefined) => (encounterId ? ADVENTURE_OF[encounterId] : undefined)

/** Adds an adventure's scenes. A scene whose set or staging the package lacks is left out. */
export function addScenes(stage: AdventureStage) {
  Object.assign(PORTRAITS, stage.portraits?.cards)
  Object.assign(NPC_PORTRAITS, stage.portraits?.npcs)
  for (const [id, e] of Object.entries(stage.scenes)) {
    const set = stage.sets[e.set]
    let staging = stage.stagings[e.staging] as Scene["staging"] | undefined
    if (!set || !staging) continue
    if (e.patch) staging = merge(structuredClone(staging), e.patch) as Scene["staging"]
    if (e.at) staging = { ...staging, cast: staging.cast.map((m) => ({ ...m, at: e.at?.[m.id] ?? m.at })) }
    ADVENTURE_OF[id] = stage.id
    SCENES[id] = { set: set as Scene["set"], staging, location: e.location, where: e.where, party: e.party, ...(e.spare ? { spare: e.spare } : {}) }
  }
}

export const sceneFor = (encounterId: string | undefined) => (encounterId ? SCENES[encounterId] : undefined)

// The cast member standing for a turn character. Later stagings use content character ids (`madam-zephyra`); the gate's
// staging predates that and uses first names (`garlan`).
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

// Portraits from the packages (stage/portraits.json). `cards`: for a cast member whose card has none, cropped from their
// standee art. `npcs`: each character's painted portrait (scripts/stage-encounter-art.ts).
const PORTRAITS: Record<string, string> = {}
const NPC_PORTRAITS: Record<string, string> = {}

// On a painted set the cast's cards are photographs (the stage's `photographs`), and their portraits go with them:
// the same head and shoulders cut from the photograph, in the `photoreal` folder beside the painted portrait
// (lab/stage-art/cards.ts). A hand-painted set keeps the painted portrait, so a face in the turn order is the one
// standing in the scene. Art from elsewhere, such as a hero painted on the player's machine, stays as it is.
// `photoreal.json` here is the card tool's copy of /stage/photoreal.json.
const PHOTOGRAPHED = new Set<string>(photoreal)
function photograph(portrait: string | undefined, scene: Scene | undefined) {
  if (!portrait || !scene?.set.painted || scene.staging.painted === false) return portrait
  const m = /^\/stage\/(.+)\/([^/]+)-portrait\.jpg$/.exec(portrait)
  return m && PHOTOGRAPHED.has(`${m[1]}/${m[2]}`) ? `/stage/${m[1]}/photoreal/${m[2]}-portrait.jpg` : portrait
}

// A character's portrait: a created hero's figure, else the current scene, else any authored scene, so story view keeps
// the party's faces. Heroes with no art anywhere show their stock figure, and NPCs the portrait painted on their sheet.
// With no scene to go by, such as a premade hero on the New Game page, the scene the portrait was found in decides
// whether it is the photograph.
function portraitPath(scene: Scene | undefined, c: Who, chosen: Record<string, string> = {}, painted: Record<string, FigureArt> = {}) {
  if (chosen[c.id] || painted[c.id]) return photograph(heroFigure(c as FigureOwner, chosen, painted).art.portrait, scene)
  for (const s of [scene, ...Object.values(SCENES)]) {
    const id = s && castIdFor(s.staging.cast, c)
    const portrait = id && s.staging.cast.find((m) => m.id === id)?.art.portrait
    if (portrait) return photograph(portrait, scene ?? s)
  }
  return photograph(
    PORTRAITS[c.id] ?? PREMADE_FIGURES[c.id]?.art.portrait ?? (c.type === "pc" ? heroFigure(c as FigureOwner).art.portrait : NPC_PORTRAITS[c.id]),
    scene
  )
}

/** That portrait's address, from where the stage's files are served. */
export const portraitFor = (...args: Parameters<typeof portraitPath>) => {
  const path = portraitPath(...args)
  return path && served(path)
}

// The set's named places, which the GM may point the camera at in its beats.
export function scenePlaces(encounterId: string): { id: string; label: string }[] | undefined {
  const marks = SCENES[encounterId]?.set.marks
  return marks && Object.entries(marks).flatMap(([id, m]) => (m.label ? [{ id, label: m.label }] : []))
}

/** The files an adventure's scenes need, under its package's stage/ folder. */
export function sceneFiles(scenes: Record<string, SceneEntry>) {
  const list = Object.values(scenes)
  return { sets: [...new Set(list.map((e) => e.set))], stagings: [...new Set(list.map((e) => e.staging))] }
}
