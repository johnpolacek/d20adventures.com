"use server"

import { floorFromMetres } from "@d20/gm-core/sheet/placement"
import { floorPlanFor } from "@d20/stage/plans/index"
import type { FloorSolid, FloorView } from "./view"

const round = (value: number) => Math.round(value * 100) / 100

/** An encounter's floor in feet, as plain data for the plan, or null when the encounter has no floor plan. */
export async function loadFloorView(encounterId: string): Promise<FloorView | null> {
  const plan = await floorPlanFor(encounterId)
  if (!plan) return null
  const floor = floorFromMetres(plan)
  const top = (solid: { top?: number }) => (solid.top === undefined ? {} : { top: round(solid.top) })
  const solids = floor.solids.map(
    (solid): FloorSolid =>
      solid.kind === "circle"
        ? { kind: "circle", x: round(solid.x), y: round(solid.y), radius: round(solid.radius), ...top(solid) }
        : { kind: "rect", x: round(solid.x), y: round(solid.y), halfWidth: round(solid.halfWidth), halfDepth: round(solid.halfDepth), turn: Math.round(solid.turn * 10000) / 10000, ...top(solid) }
  )
  return {
    encounterId,
    title: plan.title,
    ...(plan.location ? { location: plan.location } : {}),
    solids,
    places: floor.places.map((place) => ({ id: place.id, label: place.label, at: { x: round(place.at.x), y: round(place.at.y) } })),
  }
}
