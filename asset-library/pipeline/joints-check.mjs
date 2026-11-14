// A character's joints drawn over its A-pose front, to check them by eye before paying for a model.
//
//   node asset-library/pipeline/joints-check.mjs asset-library/characters/branka [out.jpg]
import { readFile } from "node:fs/promises"
import sharp from "sharp"

const [dir, out = `${dir}/joints.jpg`] = process.argv.slice(2)
const spec = JSON.parse(await readFile(`${dir}/joints.json`, "utf8"))
const J = spec.joints
const BONES = [
  ["hips", "spine"],
  ["spine", "chest"],
  ["chest", "neck"],
  ["neck", "head"],
  ["head", "headTop"],
  ...["L", "R"].flatMap((s) => [
    ["chest", `upperarm${s}`],
    [`upperarm${s}`, `forearm${s}`],
    [`forearm${s}`, `hand${s}`],
    [`hand${s}`, `handTip${s}`],
    ["hips", `thigh${s}`],
    [`thigh${s}`, `shin${s}`],
    [`shin${s}`, `foot${s}`],
    [`foot${s}`, `toe${s}`],
  ]),
] // prettier-ignore
const file = `${dir}/apose-front.png`
const { width, height } = await sharp(file).metadata()
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
${BONES.map(([a, b]) => `<line x1="${J[a][0]}" y1="${J[a][1]}" x2="${J[b][0]}" y2="${J[b][1]}" stroke="#00e5ff" stroke-width="3"/>`).join("")}
${Object.entries(J)
  .map(([n, [x, y]]) => `<circle cx="${x}" cy="${y}" r="6" fill="${n.endsWith("L") ? "#ff3df2" : "#ffe14d"}" stroke="#000" stroke-width="1.5"/>`)
  .join("")}
</svg>`
await sharp(file)
  .composite([{ input: Buffer.from(svg) }])
  .jpeg({ quality: 88 })
  .toFile(out)
console.log(out)
