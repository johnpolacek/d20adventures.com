// Whether a figure's arms hold together through its clips, measured and not looked at: how far each elbow bends, how
// high each arm is raised, and how far the skin over each arm is stretched and crushed, on the skinned mesh itself,
// at every frame.
//
//   pnpm assets:arms thalbern-rodin-meshy             every clip
//   pnpm assets:arms thalbern-rodin-meshy "Q Shoot"   the clips named, by comma
//   pnpm assets:arms thalbern-rodin Swing --trace       where each upper arm points, every tenth of a second
//   pnpm assets:arms thalbern-rodin Swing --where       where the worst-stretched skin of each shoulder lies
//   pnpm assets:arms thalbern-rodin --parts=before.glb   each point's part read from another rigging of the same mesh,
//                                                       so the same edges are measured before and after a change
//
// The limits are those of MengTo's game-dev-combat-animation skill (github.com/MengTo/Skills, MIT), found on rigs
// with no bones to twist an arm, as these are:
//   the elbow bends between 10 and 152 degrees, a straight arm being 0
//   no arm is raised past 105 degrees from hanging
//   of the edges of the skin over each part of an arm, the worst hundredth is stretched at most twice its length at
//   rest, and crushed to no less than a third of it
// A clip made for one skeleton can break these on another and still look right on its own.
//
// The shoulder is measured as a part of its own: the edges that join the upper arm to the trunk, where a pauldron
// is pulled out after the arm.
//
// Under each clip, how much of each elbow's and wrist's cross-section is left at its thinnest and its thickest
// (pinch.ts): a wrist that twists thin like a sweet wrapper.

import { readFile } from "node:fs/promises"
import { type Accessor, type Node, NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { pinch, pinchLines } from "./pinch"
import { angle, local, type Mat, mul } from "./pose"
import { reader } from "./retarget"

const LIMITS = { elbow: [10, 152], raise: 105, stretch: 2, crush: 3 }
const FRAMES = 30


async function main() {
  const [id, only] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  const parts = process.argv.find((a) => a.startsWith("--parts="))?.slice(8)
  const where = process.argv.includes("--where")
  const trace = process.argv.includes("--trace")
  if (!id) throw new Error("Name a character: pnpm assets:arms <id> [clip,clip]")
  const dir = `asset-library/characters/${id}`
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(`${dir}/${(JSON.parse(await readFile(`${dir}/figure.json`, "utf8")) as { lods: { file: string }[] }).lods[0].file}`)
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin.listJoints()
  const bind = skin.getInverseBindMatrices()
  const bone = (name: string) => joints.findIndex((j) => new RegExp(`(^|:)${name}$`).test(j.getName()))
  const prim = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .find((p) => p.getAttribute("JOINTS_0"))
  const [pos, J, W, index] = [prim?.getAttribute("POSITION"), prim?.getAttribute("JOINTS_0"), prim?.getAttribute("WEIGHTS_0"), prim?.getIndices()]
  if (!pos || !J || !W || !bind) throw new Error(`No skinned mesh in ${dir}`)

  // Which part of which arm a point belongs to: the bone that pulls on it most, in this rigging or the one named.
  const count = pos.getCount()
  const partsOf = (named: Node[], Jn: Accessor, Wn: Accessor) => {
    const part = new Map<number, string>()
    for (const side of ["Left", "Right"]) {
      for (const [i, joint] of named.entries()) {
        if (new RegExp(`(^|:)${side}Arm$`).test(joint.getName())) part.set(i, `${side} upper arm`)
        else if (new RegExp(`(^|:)${side}ForeArm$`).test(joint.getName())) part.set(i, `${side} forearm`)
        else if (new RegExp(`(^|:)${side}Hand`).test(joint.getName())) part.set(i, `${side} hand`)
      }
    }
    return Array.from({ length: count }, (_, i) => {
      const [j, w] = [Jn.getElement(i, [0, 0, 0, 0]), Wn.getElement(i, [0, 0, 0, 0])]
      return part.get(j[w.indexOf(Math.max(...w))]) ?? null
    })
  }
  let of: (string | null)[] = partsOf(joints, J, W)
  if (parts) {
    const other = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(parts)
    const mesh = other
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives())
      .find((p) => p.getAttribute("JOINTS_0"))
    const [Jo, Wo] = [mesh?.getAttribute("JOINTS_0"), mesh?.getAttribute("WEIGHTS_0")]
    if (!Jo || !Wo || Jo.getCount() !== count) throw new Error(`${parts} is not this mesh: ${Jo?.getCount()} points against ${count}`)
    of = partsOf(other.getRoot().listSkins()[0]?.listJoints() ?? [], Jo, Wo)
  }
  const pulls: [number[], number[]][] = []
  for (let i = 0; i < count; i++) pulls.push([J.getElement(i, [0, 0, 0, 0]), W.getElement(i, [0, 0, 0, 0])])
  // The edges of each part, each once, and of each shoulder: an upper arm's point joined to one of the trunk's.
  const edges = new Map<string, [number, number, number][]>()
  const seen = new Set<number>()
  const rest = (i: number) => pos.getElement(i, [0, 0, 0])
  const corners = index ? index.getCount() : count
  for (let t = 0; t < corners; t += 3) {
    const tri = [0, 1, 2].map((k) => (index ? index.getScalar(t + k) : t + k))
    for (const [a, b] of [
      [tri[0], tri[1]],
      [tri[1], tri[2]],
      [tri[2], tri[0]],
    ]) {
      const key = Math.min(a, b) * count + Math.max(a, b)
      if (seen.has(key)) continue
      seen.add(key)
      const [pa, pb] = [of[a], of[b]]
      const name = pa && pa === pb ? pa : pa?.endsWith("upper arm") && !pb ? pa.replace("upper arm", "shoulder") : pb?.endsWith("upper arm") && !pa ? pb.replace("upper arm", "shoulder") : null
      if (!name) continue
      const [x, y] = [rest(a), rest(b)]
      const long = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
      if (long > 1e-5) (edges.get(name) ?? edges.set(name, []).get(name))?.push([a, b, long])
    }
  }
  const used = [...new Set([...edges.values()].flatMap((list) => list.flatMap((edge) => edge.slice(0, 2))))]
  const binds = joints.map((_, i) => bind.getElement(i, new Array(16).fill(0)))

  const clips = doc
    .getRoot()
    .listAnimations()
    .filter((a) => !only || only.split(",").includes(a.getName()))
  const bad: string[] = []
  console.log(`${id}: ${count} points, ${used.length} on the arms, ${[...edges.entries()].map(([name, list]) => `${name} ${list.length}`).join(", ")}`)
  console.log("clip".padEnd(14), "side ", "elbow°    ", "raise°", " upper arm     ", "forearm        ", "hand           ", "shoulder        stretch x, crush x, and when")
  for (const clip of clips) {
    const read = reader(clip)
    const long = Math.max(...clip.listSamplers().map((s) => s.getInput()?.getMax([0])[0] ?? 0))
    const worst: Record<string, { value: number; at: number }> = {}
    const lies: Record<string, string> = {}
    const note = (key: string, value: number, at: number, least = false) => {
      if (!worst[key] || (least ? value < worst[key].value : value > worst[key].value)) worst[key] = { value, at }
    }
    for (let f = 0; f <= Math.ceil(long * FRAMES); f++) {
      const time = Math.min(long, f / FRAMES)
      const memo = new Map<Node, Mat>()
      const world = (node: Node): Mat => {
        const had = memo.get(node)
        if (had) return had
        const up = node.getParentNode()
        const own = local(read(node, "translation", time), read(node, "rotation", time), node.getScale())
        const now = up ? mul(world(up), own) : own
        memo.set(node, now)
        return now
      }
      const skinned = joints.map((joint, i) => mul(world(joint), binds[i]))
      const at = (name: string) => world(joints[bone(name)]).slice(12, 15)
      const posed = new Map<number, number[]>()
      for (const i of used) {
        const [j, w] = pulls[i]
        const p = rest(i)
        const out = [0, 0, 0]
        for (let k = 0; k < 4; k++) {
          if (!w[k]) continue
          const m = skinned[j[k]]
          for (let r = 0; r < 3; r++) out[r] += w[k] * (m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r])
        }
        posed.set(i, out)
      }
      for (const [name, list] of edges) {
        const ratios = list
          .map(([a, b, bound]) => {
            const [x, y] = [posed.get(a) as number[], posed.get(b) as number[]]
            return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / bound
          })
          .sort((a, b) => a - b)
        // Where the worst of a shoulder lies at its worst moment, from the joint as the figure rests.
        if (where && name.endsWith("shoulder") && ratios[Math.floor(ratios.length * 0.99)] > (worst[`${name} stretch`]?.value ?? 0)) {
          const joint = joints[bone(`${name.split(" ")[0]}Arm`)].getWorldMatrix().slice(12, 15)
          const least = ratios[Math.floor(ratios.length * 0.99)]
          const bad = list.filter(([a, b, bound]) => {
            const [x, y] = [posed.get(a) as number[], posed.get(b) as number[]]
            return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / bound >= least
          })
          const mids = bad.map(([a, b]) => [0, 1, 2].map((k) => ((rest(a)[k] + rest(b)[k]) / 2 - joint[k]) * 100))
          const mean = (k: number) => (mids.reduce((sum, m) => sum + m[k], 0) / mids.length).toFixed(1)
          lies[name] =
            `${name}: ${bad.length} edges of ${list.length}, ${Math.round((mids.filter((m) => m[1] < 0).length / mids.length) * 100)}% below the joint, on average ${mean(0)} cm across, ${mean(1)} up, ${mean(2)} forward, at rest ${((bad.reduce((sum, e) => sum + e[2], 0) / bad.length) * 1000).toFixed(1)} mm long`
        }
        note(`${name} stretch`, ratios[Math.floor(ratios.length * 0.99)], time)
        note(`${name} crush`, 1 / Math.max(1e-6, ratios[Math.floor(ratios.length * 0.01)]), time)
      }
      // Straight down as the chest has it: the chest's own turn since rest, on the world's down.
      const chest = world(joints[bone("Spine2")])
      const chestRest = joints[bone("Spine2")].getWorldMatrix()
      const down = [0, 1, 2].map((r) => -(chest[r] * chestRest[1] + chest[4 + r] * chestRest[5] + chest[8 + r] * chestRest[9]))
      for (const side of ["Left", "Right"]) {
        const [shoulder, elbow, wrist] = [at(`${side}Arm`), at(`${side}ForeArm`), at(`${side}Hand`)]
        const upper = [0, 1, 2].map((k) => elbow[k] - shoulder[k])
        const fore = [0, 1, 2].map((k) => wrist[k] - elbow[k])
        note(`${side} elbow most`, angle(upper, fore), time)
        note(`${side} elbow least`, angle(upper, fore), time, true)
        note(`${side} raise`, angle(upper, down), time)
        // Where the upper arm points as the chest has it: how far out to its own side, down and forward.
        if (trace && f % 3 === 0) {
          const axis = (k: number) => [0, 1, 2].map((r) => chest[r] * chestRest[k] + chest[4 + r] * chestRest[4 + k] + chest[8 + r] * chestRest[8 + k])
          const long = Math.hypot(...upper) || 1
          const along = (v: number[]) => ((upper[0] * v[0] + upper[1] * v[1] + upper[2] * v[2]) / long).toFixed(2).padStart(6)
          const out = axis(0).map((v) => v * (at(`${side}Arm`)[0] - at("Spine2")[0] > 0 === (side === "Left") ? (side === "Left" ? 1 : -1) : side === "Left" ? 1 : -1))
          console.log(
            `    ${time.toFixed(2)} ${side.padEnd(5)} raised ${angle(upper, down).toFixed(0).padStart(3)}°, elbow ${angle(upper, fore).toFixed(0).padStart(3)}°, points out ${along(out)} down ${along(down)} forward ${along(axis(2))}`
          )
        }
      }
    }
    for (const side of ["Left", "Right"]) {
      const v = (key: string) => worst[`${side} ${key}`] ?? { value: 0, at: 0 }
      const skinOf = (name: string) => {
        const [s, c] = [v(`${name} stretch`), v(`${name} crush`)]
        const over = s.value > LIMITS.stretch || c.value > LIMITS.crush
        if (over) bad.push(`${clip.getName()} ${side} ${name}: stretched ${s.value.toFixed(1)}x at ${s.at.toFixed(2)} s, crushed ${c.value.toFixed(1)}x at ${c.at.toFixed(2)} s`)
        return `${s.value.toFixed(1)} ${c.value.toFixed(1)}${over ? ` !${(s.value > LIMITS.stretch ? s : c).at.toFixed(2)}` : ""}`.padEnd(15)
      }
      const [least, most, raise] = [v("elbow least"), v("elbow most"), v("raise")]
      if (most.value > LIMITS.elbow[1]) bad.push(`${clip.getName()} ${side} elbow bent ${most.value.toFixed(0)}° at ${most.at.toFixed(2)} s`)
      if (raise.value > LIMITS.raise) bad.push(`${clip.getName()} ${side} arm raised ${raise.value.toFixed(0)}° at ${raise.at.toFixed(2)} s`)
      console.log(
        (side === "Left" ? clip.getName() : "").padEnd(14),
        side.padEnd(5),
        `${least.value.toFixed(0)}-${most.value.toFixed(0)}${most.value > LIMITS.elbow[1] ? "!" : ""}`.padEnd(10),
        `${raise.value.toFixed(0)}${raise.value > LIMITS.raise ? "!" : ""}`.padEnd(6),
        skinOf("upper arm"),
        skinOf("forearm"),
        skinOf("hand"),
        skinOf("shoulder")
      )
    }
    for (const line of Object.values(lies)) console.log(`    ${line}`)
    const thin = pinchLines(clip.getName(), pinch(doc, [clip], ["elbow", "wrist"]))
    console.log(thin.lines.join("\n"))
    bad.push(...thin.bad)
  }
  console.log(bad.length ? `\n${bad.length} over a limit:\n${bad.map((b) => `  ${b}`).join("\n")}` : "\nNothing over a limit.")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
