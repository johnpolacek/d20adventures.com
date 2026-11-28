import * as THREE from "three"
import type { PropKind } from "./effects"

/** Removes a temporary prop group from the scene graph and disposes its geometries and materials once each. */
export function disposePropObject(obj: THREE.Object3D): void {
  obj.removeFromParent()
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      if (child.geometry) geometries.add(child.geometry)
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) if (m) materials.add(m)
    }
  })
  for (const g of geometries) g.dispose()
  for (const m of materials) m.dispose()
}

export type ActorHandState =
  | { kind: "empty" }
  | { kind: "holding"; propKind: PropKind; item: THREE.Object3D }
  | { kind: "handing"; token: number; propKind: PropKind; item: THREE.Object3D }

export interface HandPropHost {
  createProp: (kind: PropKind) => THREE.Object3D
  facePair: (holder: string, receiver: string) => void
  hold: (id: string, item: THREE.Object3D, out: boolean, instant?: boolean) => boolean
  letGo: (id: string, slow: boolean, only?: THREE.Object3D, keepAlive?: boolean) => void
  cutTo: (id: string, angle: number) => void
  announce: (kind: PropKind, handed: boolean) => void
  fallbackEffect: (kind: PropKind, holder: string, receiver?: string) => Promise<void>
}

export interface HandPropTimings {
  holdWithReceiverMs: number
  holdSoloMs: number
  fallbackCutMs: number
  receiverHoldOutMs: number
  receiverAtSideMs: number
}

const DEFAULT_TIMINGS: HandPropTimings = {
  holdWithReceiverMs: 1700,
  holdSoloMs: 2600,
  fallbackCutMs: 1600,
  receiverHoldOutMs: 350,
  receiverAtSideMs: 1900,
}

interface PendingWait {
  timer: ReturnType<typeof setTimeout>
  resolve: (ok: boolean) => void
  actors: string[]
  token: number
}

/**
 * Per-actor hand-prop state machine: coordinates held objects (`keepObject`) and staged hand-offs (`prop`)
 * without global interference. Concurrent hand-offs on disjoint actors (e.g. A->B and C->D) run independently;
 * a new hand-off involving an already-busy actor supersedes only the overlapping hand-off.
 */
export class HandPropCoordinator {
  private readonly states = new Map<string, ActorHandState>()
  private readonly keptWant = new Map<string, PropKind>()
  private readonly waits = new Set<PendingWait>()
  private nextToken = 0
  private disposed = false
  private readonly timings: HandPropTimings

  constructor(
    private readonly host: HandPropHost,
    timings: Partial<HandPropTimings> = {}
  ) {
    this.timings = { ...DEFAULT_TIMINGS, ...timings }
  }

  stateOf(id: string): ActorHandState {
    return this.states.get(id) ?? { kind: "empty" }
  }

  keepObject(id: string, kind: PropKind | null): void {
    if (this.disposed) return
    if (kind) this.keptWant.set(id, kind)
    else this.keptWant.delete(id)
    if (this.stateOf(id).kind !== "handing") this.applyKept(id)
  }

  prop(kind: PropKind, holder: string, receiver?: string): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const token = ++this.nextToken
    if (receiver) this.host.facePair(holder, receiver)
    const item = this.host.createProp(kind)
    const ends = receiver ? [holder, receiver] : [holder]

    // Claim only the actors participating in this hand-off, superseding any prior hand-off on them alone.
    for (const id of ends) {
      const prev = this.stateOf(id)
      if (prev.kind === "holding" || prev.kind === "handing") {
        this.host.letGo(id, false, prev.item)
      }
      this.states.set(id, { kind: "handing", token, propKind: kind, item })
    }
    this.cancelWaitsFor(ends, token)

    if (!this.host.hold(holder, item, true)) {
      disposePropObject(item)
      for (const id of ends) this.releaseActor(id, token)
      if (receiver) {
        // Re-check only that no newer hand-off claimed the receiver before cutting on the fallback effect.
        const fallbackToken = ++this.nextToken
        const capturedReceiver = receiver
        void this.wait(this.timings.fallbackCutMs, [], fallbackToken).then((ok) => {
          if (ok && this.stateOf(capturedReceiver).kind !== "handing") {
            this.host.cutTo(capturedReceiver, -35)
          }
        })
      }
      return this.host.fallbackEffect(kind, holder, receiver)
    }

    this.host.announce(kind, !!receiver)

    const drop = (activeActors: string[], heldBy: string | null) => {
      if (heldBy) this.host.letGo(heldBy, false, item)
      else disposePropObject(item)
      for (const id of activeActors) this.releaseActor(id, token)
    }

    const finalizeWithItem = (id: string, slow: boolean) => {
      if (!this.owns(id, token)) {
        this.host.letGo(id, false, item)
        return
      }
      if (this.keptWant.get(id) === kind) {
        this.host.hold(id, item, false)
        this.states.set(id, { kind: "holding", propKind: kind, item })
      } else {
        this.host.letGo(id, slow, item)
        this.states.set(id, { kind: "empty" })
        this.applyKept(id)
      }
    }

    return (async () => {
      if (receiver) this.host.cutTo(holder, 35)
      if (!(await this.wait(receiver ? this.timings.holdWithReceiverMs : this.timings.holdSoloMs, ends, token))) {
        return drop(ends, holder)
      }
      if (!receiver) {
        finalizeWithItem(holder, true)
        return
      }
      // Transfer `item` from holder to receiver across the cut without disposing it mid-transfer.
      this.host.letGo(holder, false, item, true)
      this.releaseActor(holder, token)
      if (!this.owns(receiver, token) || !this.host.hold(receiver, item, true, true)) {
        disposePropObject(item)
        this.releaseActor(receiver, token)
        return
      }
      this.host.cutTo(receiver, -35)
      if (!(await this.wait(this.timings.receiverHoldOutMs, [receiver], token))) {
        return drop([receiver], receiver)
      }
      this.host.hold(receiver, item, false)
      if (this.keptWant.get(receiver) !== kind && !(await this.wait(this.timings.receiverAtSideMs, [receiver], token))) {
        return drop([receiver], receiver)
      }
      finalizeWithItem(receiver, true)
    })()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const w of this.waits) {
      clearTimeout(w.timer)
      w.resolve(false)
    }
    this.waits.clear()
    for (const [id, st] of this.states) {
      if (st.kind !== "empty") this.host.letGo(id, false, st.item)
    }
    this.states.clear()
    this.keptWant.clear()
  }

  private owns(id: string, token: number): boolean {
    if (this.disposed) return false
    const st = this.states.get(id)
    return st?.kind === "handing" && st.token === token
  }

  private releaseActor(id: string, token: number): void {
    if (!this.owns(id, token)) return
    this.states.set(id, { kind: "empty" })
    this.applyKept(id)
  }

  private applyKept(id: string): void {
    if (this.disposed) return
    const want = this.keptWant.get(id)
    const cur = this.stateOf(id)
    if (cur.kind === "handing") return
    if (cur.kind === "holding" && cur.propKind === want) return
    if (cur.kind === "holding") {
      this.host.letGo(id, true, cur.item)
      this.states.set(id, { kind: "empty" })
    }
    if (!want) return
    const item = this.host.createProp(want)
    if (this.host.hold(id, item, false, true)) {
      this.states.set(id, { kind: "holding", propKind: want, item })
    } else {
      disposePropObject(item)
    }
  }

  private cancelWaitsFor(actors: string[], replacingToken: number): void {
    for (const w of [...this.waits]) {
      if (w.token === replacingToken) continue
      if (w.actors.some((id) => actors.includes(id))) {
        clearTimeout(w.timer)
        this.waits.delete(w)
        w.resolve(false)
      }
    }
  }

  private wait(ms: number, actors: string[], token: number): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      const entry: PendingWait = {
        actors,
        token,
        resolve,
        timer: setTimeout(() => {
          this.waits.delete(entry)
          const ok = !this.disposed && actors.every((id) => this.owns(id, token))
          resolve(ok)
        }, ms),
      }
      this.waits.add(entry)
    })
  }
}
