// The floor plan as the site draws it, in the engine's feet, and the pure sums behind the drawing. No React here, so a
// script can check the view box and the rect rotation without a browser.

export type FloorPoint = { x: number; y: number }

/** A solid thing of the floor. `top` is its height in feet: none is a wall to the ceiling. */
export type FloorSolid =
  | { kind: "rect"; x: number; y: number; halfWidth: number; halfDepth: number; turn: number; top?: number }
  | { kind: "circle"; x: number; y: number; radius: number; top?: number }

export type FloorPlace = { id: string; label: string; at: FloorPoint }

/** What the client needs to draw an encounter's floor: plain data, sent from the server. */
export type FloorView = { encounterId: string; title: string; location?: string; solids: FloorSolid[]; places: FloorPlace[] }

/** A character as the plan reads one: a turn character fits it. */
export type FloorToken = {
  id: string
  name: string
  type: string
  image?: string
  position?: FloorPoint
  hitPoints?: number
  healthPercent?: number
  dead?: true
  fled?: true
}

export type ViewBox = { x: number; y: number; w: number; h: number }

/** Feet of floor kept round the tokens and the named places. */
export const VIEW_PAD = 15
/** The narrowest view, so a lone token does not fill the panel. */
export const VIEW_MIN_WIDTH = 50
export const VIEW_ASPECT = 16 / 9
/** Anything this tall or taller reads as a wall. */
export const TALL_FEET = 6

export const isTall = (solid: FloorSolid): boolean => solid.top === undefined || solid.top >= TALL_FEET

/** A named place this near a token is kept in view. Farther ones, such as a trail's far end, would shrink the action. */
export const VIEW_PLACE_REACH = 40

/**
 * The view that fits the tokens and the named places near them, with padding, widened to 16:9 about its centre. With
 * no tokens it fits every named place.
 */
export function viewBoxFor(tokens: readonly FloorPoint[], places: readonly FloorPoint[]): ViewBox {
  const near = tokens.length ? places.filter((place) => tokens.some((token) => between(token, place) <= VIEW_PLACE_REACH)) : places
  const points = [...tokens, ...near]
  if (!points.length) return { x: -VIEW_MIN_WIDTH / 2, y: -VIEW_MIN_WIDTH / VIEW_ASPECT / 2, w: VIEW_MIN_WIDTH, h: VIEW_MIN_WIDTH / VIEW_ASPECT }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs) - VIEW_PAD
  const maxX = Math.max(...xs) + VIEW_PAD
  const minY = Math.min(...ys) - VIEW_PAD
  const maxY = Math.max(...ys) + VIEW_PAD
  let w = Math.max(maxX - minX, VIEW_MIN_WIDTH)
  let h = maxY - minY
  if (w / h < VIEW_ASPECT) w = h * VIEW_ASPECT
  else h = w / VIEW_ASPECT
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** Whether any of a solid could fall inside the view, by its bounding circle. */
export function solidInView(solid: FloorSolid, view: ViewBox): boolean {
  const reach = solid.kind === "circle" ? solid.radius : Math.hypot(solid.halfWidth, solid.halfDepth)
  return solid.x + reach > view.x && solid.x - reach < view.x + view.w && solid.y + reach > view.y && solid.y - reach < view.y + view.h
}

/**
 * The SVG rotation, in degrees, that draws a rect as the engine reads it. The engine's point-in-rect test is
 * |dx·cos − dy·sin| < halfWidth and |dx·sin + dy·cos| < halfDepth, which rotates the offset by +turn into the rect's own
 * frame, so the rect's own frame is drawn rotated by −turn.
 */
export const rectDegrees = (turn: number): number => (-turn * 180) / Math.PI

/** The engine's test, for checking the drawing against it. */
export function insideRect(solid: Extract<FloorSolid, { kind: "rect" }>, point: FloorPoint): boolean {
  const dx = point.x - solid.x
  const dy = point.y - solid.y
  const cos = Math.cos(solid.turn)
  const sin = Math.sin(solid.turn)
  return Math.abs(dx * cos - dy * sin) < solid.halfWidth && Math.abs(dx * sin + dy * cos) < solid.halfDepth
}

/** Where a point of a rect's own frame lands once drawn: what SVG's translate then rotate does. */
export function drawnRectPoint(solid: Extract<FloorSolid, { kind: "rect" }>, local: FloorPoint): FloorPoint {
  const angle = (rectDegrees(solid.turn) * Math.PI) / 180
  return { x: solid.x + local.x * Math.cos(angle) - local.y * Math.sin(angle), y: solid.y + local.x * Math.sin(angle) + local.y * Math.cos(angle) }
}

const SCALE_STEPS = [5, 10, 20, 25, 50, 100, 200, 500]

/** A round length of feet for the scale bar, about a fifth of the view or less. */
export function scaleFeet(viewWidth: number): number {
  return SCALE_STEPS.filter((step) => step <= viewWidth * 0.22).pop() ?? SCALE_STEPS[0]
}

export const between = (a: FloorPoint, b: FloorPoint): number => Math.hypot(b.x - a.x, b.y - a.y)

const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "into", "of", "on", "the", "to", "toward", "towards", "with"])

/** "the bushes at the treeline" reads "The Bushes at the Treeline". */
export function titleCase(text: string): string {
  return text
    .split(" ")
    .map((word, index) => {
      if (index > 0 && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase()
      return word
        .split("-")
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join("-")
    })
    .join(" ")
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("")
}
