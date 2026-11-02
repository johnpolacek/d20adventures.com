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

export class LookControls {
  private pointers = new Map<number, { x: number; y: number }>()
  private spread = 0

  constructor(
    private dom: HTMLElement,
    private on: LookHandlers
  ) {
    dom.addEventListener("pointerdown", this.down)
    dom.addEventListener("pointermove", this.move)
    dom.addEventListener("pointerup", this.up)
    dom.addEventListener("pointercancel", this.up)
    dom.addEventListener("wheel", this.wheel, { passive: false })
  }

  private gap() {
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  private down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    this.dom.setPointerCapture?.(e.pointerId)
    if (this.pointers.size === 1) this.on.start()
    if (this.pointers.size === 2) this.spread = this.gap()
  }
  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    if (this.pointers.size === 1) this.on.turn(dx, dy)
    else if (this.pointers.size === 2) {
      const gap = this.gap()
      if (this.spread > 0 && gap > 0) this.on.zoom(this.spread / gap)
      this.spread = gap
    }
  }
  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId)
    this.dom.releasePointerCapture?.(e.pointerId)
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
  }
}
