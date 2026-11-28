// The player's hand on a tripod camera: a drag turns it, the wheel or a pinch zooms it. It reports what the hand did
// and the stage decides how far the camera may go.

// A notch of a mouse wheel, about 100 units, changes the lens by an eighth.
const WHEEL = 0.0012

export interface LookHandlers {
  start: () => void
  // Pixels dragged since the last report.
  turn: (dx: number, dy: number) => void
  // Above 1 widens the lens, below 1 narrows it.
  zoom: (factor: number) => void
}

export type LookGesture =
  | { kind: "idle" }
  | { kind: "drag"; pointerId: number }
  | { kind: "pinch"; ids: [number, number]; spread: number }
  | { kind: "multi" }

type PointerTarget = Pick<HTMLElement, "addEventListener" | "removeEventListener"> & {
  setPointerCapture?: (pointerId: number) => void
  releasePointerCapture?: (pointerId: number) => void
}

export class LookControls {
  private pointers = new Map<number, { x: number; y: number }>()
  private gestureState: LookGesture = { kind: "idle" }

  constructor(
    private dom: PointerTarget,
    private on: LookHandlers
  ) {
    dom.addEventListener("pointerdown", this.down)
    dom.addEventListener("pointermove", this.move)
    dom.addEventListener("pointerup", this.up)
    dom.addEventListener("pointercancel", this.up)
    dom.addEventListener("wheel", this.wheel, { passive: false })
  }

  get gesture(): LookGesture {
    return this.gestureState
  }

  private distance(aId: number, bId: number): number {
    const a = this.pointers.get(aId)
    const b = this.pointers.get(bId)
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  // Recomputes gesture mode from active pointers so transitions like 3->2 fingers re-seed pinch spread cleanly.
  private syncGesture() {
    const ids = [...this.pointers.keys()]
    if (ids.length === 0) {
      this.gestureState = { kind: "idle" }
    } else if (ids.length === 1) {
      this.gestureState = { kind: "drag", pointerId: ids[0] }
    } else if (ids.length === 2) {
      this.gestureState = { kind: "pinch", ids: [ids[0], ids[1]], spread: this.distance(ids[0], ids[1]) }
    } else {
      this.gestureState = { kind: "multi" }
    }
  }

  private down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    const wasIdle = this.gestureState.kind === "idle"
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    this.dom.setPointerCapture?.(e.pointerId)
    this.syncGesture()
    if (wasIdle && this.gestureState.kind === "drag") this.on.start()
  }

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    switch (this.gestureState.kind) {
      case "drag":
        if (this.gestureState.pointerId === e.pointerId) this.on.turn(dx, dy)
        break
      case "pinch": {
        const [a, b] = this.gestureState.ids
        const gap = this.distance(a, b)
        if (this.gestureState.spread > 0 && gap > 0) this.on.zoom(this.gestureState.spread / gap)
        this.gestureState = { kind: "pinch", ids: [a, b], spread: gap }
        break
      }
      case "idle":
      case "multi":
        break
    }
  }

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId)
    this.dom.releasePointerCapture?.(e.pointerId)
    this.syncGesture()
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault()
    this.on.start()
    this.on.zoom(Math.exp(WHEEL * (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY)))
  }

  dispose() {
    this.dom.removeEventListener("pointerdown", this.down)
    this.dom.removeEventListener("pointermove", this.move)
    this.dom.removeEventListener("pointerup", this.up)
    this.dom.removeEventListener("pointercancel", this.up)
    this.dom.removeEventListener("wheel", this.wheel)
    this.pointers.clear()
    this.gestureState = { kind: "idle" }
  }
}
