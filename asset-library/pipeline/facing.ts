// Which way a model faces, told as rig.py tells it: the boots reach forward of the shins. A rigger that does not turn
// a model (Hyper3D's) wants it facing +z, so this is asked before that rig is paid for.
//
//   node --import tsx asset-library/pipeline/facing.ts <file.glb> ...

import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"

export type Facing = { faces: "+z" | "-z" | "+x" | "-x"; toes: [number, number]; wide: "x" | "z"; height: number }

export async function facing(file: string): Promise<Facing> {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file)
  const pts: [number, number, number][] = []
  for (const node of doc.getRoot().listNodes()) {
    const m = node.getWorldMatrix()
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      const pos = prim.getAttribute("POSITION")
      if (!pos) continue
      const p = [0, 0, 0]
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, p)
        pts.push([m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]])
      }
    }
  }
  if (!pts.length) throw new Error(`No mesh in ${file}`)
  const span = (axis: number) => pts.reduce(([lo, hi], p) => [Math.min(lo, p[axis]), Math.max(hi, p[axis])], [Infinity, -Infinity])
  const [floor, top] = span(1)
  const height = top - floor
  // Where the points between two heights lie on the ground, on average.
  const middle = (from: number, to: number) => {
    const band = pts.filter((p) => p[1] >= floor + from * height && p[1] < floor + to * height)
    return [band.reduce((s, p) => s + p[0], 0) / band.length, band.reduce((s, p) => s + p[2], 0) / band.length]
  }
  const [sole, shin] = [middle(0, 0.03), middle(0.1, 0.22)]
  const toes: [number, number] = [sole[0] - shin[0], sole[1] - shin[1]]
  const [x, z] = [span(0), span(2)]
  const along = Math.abs(toes[1]) >= Math.abs(toes[0]) ? "z" : "x"
  const sign = (along === "z" ? toes[1] : toes[0]) >= 0 ? "+" : "-"
  return {
    faces: `${sign}${along}` as Facing["faces"],
    toes: [Math.round(toes[0] * 1000) / 1000, Math.round(toes[1] * 1000) / 1000],
    wide: x[1] - x[0] >= z[1] - z[0] ? "x" : "z",
    height: Math.round(height * 1000) / 1000,
  }
}

if (process.argv[1]?.endsWith("facing.ts"))
  (async () => {
    for (const file of process.argv.slice(2)) console.log(file, JSON.stringify(await facing(file)))
  })().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
