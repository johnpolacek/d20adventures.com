import type { Stage } from "@d20/stage"
import { bearing, type MovementContext, type MovementIntent } from "@d20/stage/movement"
import { castIdFor } from "./scenes"

type Mover = { id: string; name: string; race?: string }
// Metres walked in one turn: 25 ft for dwarves, halflings and gnomes, 30 ft for everyone else.
const speed = (c: Mover) => (/dwarf|halfling|gnome/i.test(c.race ?? "") ? 7.5 : 9)
export const positions = (stage: Stage) => Object.fromEntries(stage.cast.map((c) => [c.id, stage.castAt(c.id)]))
export function context(stage: Stage, c: Mover, action: string): MovementContext | undefined {
  const id = castIdFor(stage.cast, c)
  if (!id) return
  const me = stage.castAt(id)
  return {
    actor: { id, name: c.name, speed: speed(c) },
    action,
    places: Object.entries(stage.set.marks)
      .filter(([, m]) => m.label)
      .map(([id, m]) => ({ id, label: m.label!, distance: Math.hypot(m.at[0] - me.x, m.at[1] - me.z), direction: bearing(me, { x: m.at[0], z: m.at[1] }) })),
    characters: stage.cast.filter((c) => c.id !== id).map((c) => ({ id: c.id, name: c.name, distance: Math.hypot(c.x - me.x, c.z - me.z), direction: bearing(me, c) })),
  }
}
export async function applyMovement(stage: Stage, c: Mover, intent: MovementIntent) {
  const id = castIdFor(stage.cast, c)
  if (!id) return positions(stage)
  const me = stage.castAt(id)
  let target: { x: number; z: number } | undefined
  const known = (id: string) => Boolean(stage.set.marks[id] || stage.cast.some((c) => c.id === id))
  if (intent.move === "place" && intent.place && stage.set.marks[intent.place]) target = stage.point(intent.place)
  if (intent.move === "character" && intent.character && stage.cast.some((c) => c.id === intent.character)) {
    const t = stage.point(intent.character),
      d = Math.hypot(t.x - me.x, t.z - me.z),
      k = Math.max(0, d - 1.1) / Math.max(d, 0.001)
    target = { x: me.x + (t.x - me.x) * k, z: me.z + (t.z - me.z) * k }
  }
  if (intent.move === "relative") {
    const angle = me.ry + { forward: 0, back: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[intent.direction ?? "forward"]
    target = { x: me.x + Math.sin(angle) * (intent.meters ?? 0.7), z: me.z + Math.cos(angle) * (intent.meters ?? 0.7) }
  }
  if (target) {
    const hit = stage.reach(id, target, speed(c))
    await stage.moveCast(id, [hit.x, hit.z], { speed: intent.pace === "hurry" ? 2.4 : intent.pace === "sneak" ? 0.8 : 1.2 })
  }
  if (intent.face && known(intent.face)) stage.faceCast(id, intent.face)
  return positions(stage)
}
