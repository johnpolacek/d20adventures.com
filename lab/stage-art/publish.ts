// Moves lab paintings into the game: each becomes a WebP under public/stage/paintings/<set>/ and a painting on one of
// the set's painted points (wiki/stage-engine.md, "Painted sets").
//
//   node --import tsx lab/stage-art/publish.ts realm-of-myr/kordavos-south-gate gate=gate-plate-gate-photoreal@2048 checkpoint=cp-cli,cp-zoom,cp-close
//
// <point>=<painting>[,<painting>]: lab paintings (public/stage-lab/<name>.png with its camera, <name>.json) made from one
// point, the widest first. A `<name>-clear.png` beside one goes along as its cloth-free twin. `@<width>` sets a
// painting's published width, 1536 otherwise, which is what the ChatGPT image tool paints at.
// A point named here replaces the set's point of that name. Other points are kept.

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"
import { PUB } from "./gen"

const [setKey, ...pairs] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
if (!setKey || !pairs.length) throw new Error("usage: publish.ts <setting>/<set> <point>=<painting>[@width][,<painting>] ...")
async function main() {
  const setFile = `packages/stage/src/sets/${setKey}.json`
  const set = JSON.parse(await readFile(setFile, "utf8")) as {
    id: string
    shots: Record<string, { label?: string }>
    painted?: { points: Record<string, unknown> } & Record<string, unknown>
  } & Record<string, unknown>
  const dir = `public/stage/paintings/${set.id}`
  await mkdir(dir, { recursive: true })

  const webp = async (from: string, to: string, width: number) => {
    const info = await sharp(from).resize({ width, withoutEnlargement: true }).webp({ quality: 90 }).toFile(to)
    console.log(`${to}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`)
  }
  const round = (v: number, places: number) => Number(v.toFixed(places))

  const points: Record<string, unknown> = { ...(set.painted?.points ?? {}) }
  for (const pair of pairs) {
    const [point, list] = pair.split("=")
    const paintings = []
    let position: number[] | undefined
    for (const [i, item] of list.split(",").entries()) {
      const [name, width] = item.split("@")
      const cam = JSON.parse(await readFile(`${PUB}/${name}.json`, "utf8")) as { position: number[]; quaternion: number[]; fov: number; aspect: number }
      const at = cam.position.map((v) => round(v, 3))
      if (position && at.some((v, k) => Math.abs(v - (position as number[])[k]) > 0.01)) throw new Error(`${name} was not painted from ${point}'s point`)
      position = at
      const file = `${point}${i ? `-${i + 1}` : ""}`
      await webp(`${PUB}/${name}.png`, `${dir}/${file}.webp`, Number(width) || 1536)
      const clear = existsSync(`${PUB}/${name}-clear.png`)
      if (clear) await webp(`${PUB}/${name}-clear.png`, `${dir}/${file}-clear.webp`, Number(width) || 1536)
      paintings.push({
        map: `/stage/paintings/${set.id}/${file}.webp`,
        ...(clear ? { clear: `/stage/paintings/${set.id}/${file}-clear.webp` } : {}),
        quaternion: cam.quaternion.map((v) => round(v, 6)),
        fov: cam.fov,
        aspect: round(cam.aspect, 4),
      })
    }
    points[point] = { position, ...(set.shots[point]?.label ? { label: set.shots[point].label } : {}), paintings }
  }
  // `painted` goes just before `life`, where the schema has it.
  const { life, painted, ...rest } = set
  await writeFile(setFile, `${JSON.stringify({ ...rest, painted: { ...(painted ?? {}), points }, ...(life ? { life } : {}) }, null, 2)}\n`)
  console.log(`${setFile}: ${Object.keys(points).join(", ")}`)
}

main()
