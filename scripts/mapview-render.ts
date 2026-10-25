/**
 * Render a stored Encounter2DMap JSON to a standalone HTML preview (no AI, no S3).
 * Useful for iterating on piece art / renderer changes against saved maps.
 *
 * Usage: pnpm exec tsx scripts/mapview-render.ts <map.json> [more.json...]
 * Writes <map>.html next to each input.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EncounterMap2D } from "@/components/mapview/encounter-map-2d"
import { encounter2dMapSchema } from "@/types/encounter-map-2d"

for (const input of process.argv.slice(2)) {
  const map = encounter2dMapSchema.parse(JSON.parse(readFileSync(input, "utf-8")))
  const svg = renderToStaticMarkup(createElement(EncounterMap2D, { map }))
  const out = input.replace(/\.json$/, "") + ".html"
  writeFileSync(
    out,
    `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#181510;margin:0;padding:24px}div.wrap{max-width:960px;margin:0 auto}</style></head><body><div class="wrap">${svg}</div></body></html>`
  )
  console.log(`rendered ${out}`)
}
