// Dev-only gallery of the turn page's floor plan: three encounters with made-up characters placed by the engine, one
// where a token moves, and one where characters are down. Gated to development: notFound() elsewhere.

import { floorFromMetres, placeCharacters } from "@d20/gm-core/sheet/placement"
import { floorPlanFor } from "@d20/stage/plans/index"
import { notFound } from "next/navigation"
import { loadFloorView } from "@/components/floorplan/load-floor"
import { type FloorToken, type FloorView, titleCase } from "@/components/floorplan/view"
import { isDev } from "@/lib/auth-utils"
import { FloorPlanGallery, type GalleryState } from "./floorplan-gallery"

const PORTRAITS: Record<string, string> = {
  thalbern: "https://d20-public.s3.us-east-1.amazonaws.com/images/characters/demo-ranger.png",
  owlbear: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-midnight-summons/npcs/owlbear-portrait.png",
}

async function staged(encounterId: string): Promise<{ view: FloorView; characters: FloorToken[] }> {
  const plan = await floorPlanFor(encounterId)
  const view = await loadFloorView(encounterId)
  if (!plan || !view) throw new Error(`no floor plan for ${encounterId}`)
  const floor = floorFromMetres(plan)
  const party = new Set(floor.party.map((slot) => slot.id))
  const heroes = party.size ? party : new Set(floor.cast.slice(0, 2).map((member) => member.id))
  const characters: FloorToken[] = floor.cast.map((member) => ({
    id: member.id,
    name: member.name ?? titleCase(member.id.replace(/-/g, " ")),
    type: heroes.has(member.id) ? "pc" : "npc",
    hitPoints: 10,
    ...(PORTRAITS[member.id] ? { image: PORTRAITS[member.id] } : {}),
  }))
  return { view, characters: placeCharacters(characters, floor) }
}

const firstOf = (characters: FloorToken[], type: string) => characters.find((character) => character.type === type)?.id

// Moves one character some feet along the line toward another.
function moveToward(characters: FloorToken[], moverId: string, targetId: string, feet: number): FloorToken[] {
  const mover = characters.find((character) => character.id === moverId)?.position
  const target = characters.find((character) => character.id === targetId)?.position
  if (!mover || !target) return characters
  const length = Math.hypot(target.x - mover.x, target.y - mover.y) || 1
  const step = Math.min(feet, length - 5)
  const position = { x: mover.x + ((target.x - mover.x) / length) * step, y: mover.y + ((target.y - mover.y) / length) * step }
  return characters.map((character) => (character.id === moverId ? { ...character, position } : character))
}

export default async function FloorPlanDevPage() {
  if (!isDev()) notFound()
  const [boat, festival, owlbear] = await Promise.all([staged("battle-on-the-boat"), staged("the-harvest-festival"), staged("owlbear-confrontation")])

  const mover = "thalbern"
  const boatTarget = firstOf(boat.characters, "npc") ?? mover
  const downHero = firstOf(festival.characters, "pc")
  const deadNpc = firstOf(festival.characters, "npc")

  const states: GalleryState[] = [
    { id: "boat", title: "Battle on the Boat", floor: boat.view, characters: boat.characters, activeId: firstOf(boat.characters, "pc") },
    { id: "festival", title: "The Harvest Festival", floor: festival.view, characters: festival.characters, activeId: firstOf(festival.characters, "pc") },
    { id: "owlbear", title: "Owlbear Confrontation", floor: owlbear.view, characters: owlbear.characters, activeId: "owlbear" },
    {
      id: "moved",
      title: "Battle on the Boat, Moved",
      floor: boat.view,
      characters: boat.characters,
      moved: moveToward(boat.characters, mover, boatTarget, 25),
      activeId: mover,
    },
    {
      id: "down",
      title: "The Harvest Festival, Down",
      floor: festival.view,
      characters: festival.characters.map((character) =>
        character.id === downHero ? { ...character, hitPoints: 0, healthPercent: 0 } : character.id === deadNpc ? { ...character, hitPoints: 0, healthPercent: 0, dead: true as const } : character
      ),
      activeId: festival.characters.find((character) => character.type === "pc" && character.id !== downHero)?.id,
    },
  ]
  return <FloorPlanGallery states={states} />
}
