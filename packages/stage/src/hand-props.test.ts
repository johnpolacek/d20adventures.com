import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"
import type { PropKind } from "./effects"
import { disposePropObject, HandPropCoordinator, type HandPropHost } from "./hand-props"

function createMockHost() {
  const held = new Map<string, { item: THREE.Object3D; out: boolean; instant: boolean }>()
  const cuts: Array<{ id: string; angle: number }> = []
  const disposedItems = new Set<THREE.Object3D>()
  let created = 0

  const trackItem = (kind: PropKind) => {
    const g = new THREE.Group()
    g.name = `${kind}-${++created}`
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
    const mat = new THREE.MeshBasicMaterial()
    const origDispose = geo.dispose.bind(geo)
    geo.dispose = () => {
      disposedItems.add(g)
      origDispose()
    }
    g.add(new THREE.Mesh(geo, mat))
    return g
  }

  const host: HandPropHost = {
    createProp: trackItem,
    facePair: () => {},
    hold: (id, item, out, instant = false) => {
      held.set(id, { item, out, instant })
      return true
    },
    letGo: (id, _slow, only, keepAlive = false) => {
      const cur = held.get(id)
      if (!cur || (only && cur.item !== only)) return
      held.delete(id)
      if (!keepAlive) disposePropObject(cur.item)
    },
    cutTo: (id, angle) => {
      cuts.push({ id, angle })
    },
    announce: () => {},
    fallbackEffect: async () => {},
  }

  return { host, held, cuts, disposedItems }
}

test("HandPropCoordinator runs concurrent disjoint hand-offs (A->B and C->D) independently", async () => {
  const { host, held } = createMockHost()
  const coord = new HandPropCoordinator(host, {
    holdWithReceiverMs: 25,
    receiverHoldOutMs: 15,
    receiverAtSideMs: 15,
  })

  coord.keepObject("B", "scroll")
  coord.keepObject("D", "key")

  // Start A->B and C->D concurrently
  const ab = coord.prop("scroll", "A", "B")
  const cd = coord.prop("key", "C", "D")

  assert.equal(coord.stateOf("A").kind, "handing")
  assert.equal(coord.stateOf("B").kind, "handing")
  assert.equal(coord.stateOf("C").kind, "handing")
  assert.equal(coord.stateOf("D").kind, "handing")

  await Promise.all([ab, cd])

  // Both receivers keep their respective props; neither hand-off cancelled the other
  assert.equal(coord.stateOf("A").kind, "empty")
  assert.equal(coord.stateOf("C").kind, "empty")
  assert.equal(coord.stateOf("B").kind, "holding")
  assert.equal(coord.stateOf("D").kind, "holding")
  assert.equal(held.has("B"), true)
  assert.equal(held.has("D"), true)
})

test("HandPropCoordinator supersedes overlapping hand-off cleanly without corrupting the newer one", async () => {
  const { host, held, disposedItems } = createMockHost()
  const coord = new HandPropCoordinator(host, {
    holdWithReceiverMs: 40,
    receiverHoldOutMs: 15,
    receiverAtSideMs: 15,
  })

  const ab = coord.prop("scroll", "A", "B")
  const firstItem = held.get("A")?.item
  assert.ok(firstItem)

  // Start A->E while A->B is still holding out: A->B is cancelled, A->E stays active
  const ae = coord.prop("letter", "A", "E")
  await ab

  // A->B's cleanup must NOT clear A's active hand-off to E, and first item is disposed
  assert.equal(coord.stateOf("A").kind, "handing")
  assert.equal(coord.stateOf("E").kind, "handing")
  assert.equal(coord.stateOf("B").kind, "empty")
  assert.equal(disposedItems.has(firstItem), true)

  coord.keepObject("E", "letter")
  await ae
  assert.equal(coord.stateOf("A").kind, "empty")
  assert.equal(coord.stateOf("E").kind, "holding")
})

test("HandPropCoordinator.dispose() cancels pending timers and disposes active props", async () => {
  const { host, disposedItems, held } = createMockHost()
  const coord = new HandPropCoordinator(host, {
    holdWithReceiverMs: 5000,
    receiverHoldOutMs: 5000,
    receiverAtSideMs: 5000,
  })

  const p = coord.prop("pouch", "A", "B")
  const item = held.get("A")?.item
  assert.ok(item)

  coord.dispose()
  await p

  assert.equal(disposedItems.has(item), true)
  assert.equal(held.size, 0)
  assert.equal(coord.stateOf("A").kind, "empty")
})

test("disposePropObject disposes shared materials once without error and detaches from parent", () => {
  const parent = new THREE.Group()
  const prop = new THREE.Group()
  const sharedMat = new THREE.MeshBasicMaterial()
  let matDisposes = 0
  let geoDisposes = 0
  const origMatDispose = sharedMat.dispose.bind(sharedMat)
  sharedMat.dispose = () => {
    matDisposes++
    origMatDispose()
  }
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const origGeoDispose = geo.dispose.bind(geo)
    geo.dispose = () => {
      geoDisposes++
      origGeoDispose()
    }
    prop.add(new THREE.Mesh(geo, sharedMat))
  }
  parent.add(prop)

  disposePropObject(prop)
  assert.equal(prop.parent, null)
  assert.equal(geoDisposes, 3)
  assert.equal(matDisposes, 1)
})
