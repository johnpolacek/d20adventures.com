// A contact strip of a movement: the frames capture.ts --poses wrote, cropped and laid side by side.
//
//   node lab/stage-art/strip.mjs lab/stage-art/raw/captures rig-Walk 8 ~/Desktop/walk.jpg [cropWidth cropHeight left top]
import sharp from "sharp"

const [dir, prefix, count, out, cw = 620, ch = 1100, left = 1040, top = 350] = process.argv.slice(2)
const n = Number(count)
const tiles = await Promise.all(Array.from({ length: n }, (_, i) => sharp(`${dir}/${prefix}-${i}.png`).extract({ left: +left, top: +top, width: +cw, height: +ch }).toBuffer()))
await sharp({ create: { width: +cw * n, height: +ch, channels: 3, background: "#000" } })
  .composite(tiles.map((input, i) => ({ input, left: i * +cw, top: 0 })))
  .jpeg({ quality: 88 })
  .toFile(out)
