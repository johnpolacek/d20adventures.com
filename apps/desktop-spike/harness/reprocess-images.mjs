// Local-only rerun over saved originals. No model calls or CLI credential access.
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { PNG } from "pngjs"
import { runBounded } from "./cli.mjs"
import { removeBackground, splitStandee } from "./images.mjs"

const results = fileURLToPath(new URL("../results/", import.meta.url))
const report = JSON.parse(readFileSync(join(results, "image-run.json")))
const cwd = mkdtempSync(join(tmpdir(), "d20-backgrounds-"))
const sheet = new PNG({ width: 1280, height: 1024 })
for (let y = 0; y < sheet.height; y++) {
  for (let x = 0; x < sheet.width; x++) {
    const shade = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 215 : 245
    sheet.data.set([shade, shade, shade, 255], (y * sheet.width + x) * 4)
  }
}
try {
  for (const [index, row] of report.results.entries()) {
    let input = join(results, row.original)
    row.originalSha256 = createHash("sha256").update(readFileSync(input)).digest("hex")
    if (!input.endsWith(".png")) {
      const converted = join(cwd, `${index}.png`)
      const result = await runBounded("/usr/bin/sips", ["-s", "format", "png", input, "--out", converted])
      if (result.code !== 0) throw new Error("Conversion failed")
      input = converted
    }
    const removed = await removeBackground(input, join(results, row.transparent))
    Object.assign(row, removed.metrics)
    if (row.kind === "standee") splitStandee(removed.png, join(results, "images"), row.provider)
    const png = removed.png
    const scale = Math.min(620 / png.width, 492 / png.height)
    const width = Math.round(png.width * scale)
    const height = Math.round(png.height * scale)
    const left = (index % 2) * 640 + Math.floor((640 - width) / 2)
    const top = Math.floor(index / 2) * 512 + Math.floor((512 - height) / 2)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const source = (Math.min(png.height - 1, Math.floor(y / scale)) * png.width + Math.min(png.width - 1, Math.floor(x / scale))) * 4
        const target = ((top + y) * sheet.width + left + x) * 4
        const alpha = png.data[source + 3] / 255
        for (let color = 0; color < 3; color++) sheet.data[target + color] = Math.round(png.data[source + color] * alpha + sheet.data[target + color] * (1 - alpha))
      }
    }
  }
  report.localPostprocessing = { recordedAt: new Date().toISOString(), nativeTauri: false, note: "Saved native-generated originals, local-only reprocessing, no new model calls" }
  writeFileSync(join(results, "image-run.json"), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(join(results, "images.json"), `${JSON.stringify(report.results, null, 2)}\n`)
  writeFileSync(join(results, "images/review-sheet.png"), PNG.sync.write(sheet))
  console.log(
    JSON.stringify(
      report.results.map(({ provider, kind, elapsedMs, backgroundRemoval, backgroundRemovalMs, transparentFraction }) => ({
        provider,
        kind,
        elapsedMs,
        backgroundRemoval,
        backgroundRemovalMs,
        transparentFraction,
      })),
      null,
      2
    )
  )
} finally {
  rmSync(cwd, { recursive: true, force: true })
}
