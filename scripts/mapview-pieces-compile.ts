/**
 * PenNode → SVG compiler for the Mapview piece art (wiki/plans/mapview.md).
 *
 * Reads design/mapview-pieces.op (an OpenPencil document — author/edit it with the
 * OpenPencil app or `op insert --file design/mapview-pieces.op`), compiles each
 * top-level frame (named by catalog pieceId) into SVG markup, and emits the
 * generated module components/mapview/pieces-art.ts plus a review gallery.
 *
 * Usage: tsx scripts/mapview-pieces-compile.ts [--gallery <dir>]
 *
 * Supported PenNode subset: frame (top-level), rectangle, ellipse, line, path;
 * fills solid/linear_gradient/radial_gradient; stroke (thickness, fill, dashPattern);
 * shadow effects; rotation; opacity. Gradient angle convention: 90 = top→bottom,
 * 135 = top-left→bottom-right (light from top-left).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

interface PenFill {
  type: "solid" | "linear_gradient" | "radial_gradient"
  color?: string
  angle?: number
  cx?: number
  cy?: number
  radius?: number
  stops?: Array<{ offset: number; color: string }>
}

interface PenNode {
  type: string
  name?: string
  x?: number
  y?: number
  x2?: number
  y2?: number
  width?: number
  height?: number
  cornerRadius?: number
  d?: string
  rotation?: number
  opacity?: number
  fill?: PenFill[]
  stroke?: { thickness?: number; fill?: PenFill[]; dashPattern?: number[] }
  effects?: Array<{ type: string; offsetX?: number; offsetY?: number; blur?: number; color?: string }>
  children?: PenNode[]
}

const OP_FILE = "design/mapview-pieces.op"
const OUT_FILE = "components/mapview/pieces-art.ts"

let defCounter = 0
const defs: string[] = []

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function fillAttr(pieceId: string, fill: PenFill[] | undefined): string {
  const first = fill?.[0]
  if (!first) return 'fill="none"'
  if (first.type === "solid") {
    const color = first.color || "none"
    if (/^#([0-9a-f]{8})$/i.test(color) && color.toLowerCase().endsWith("00")) return 'fill="none"'
    return `fill="${esc(color)}"`
  }
  const id = `pa-${pieceId}-${defCounter++}`
  const stops = (first.stops || []).map((stop) => `<stop offset="${stop.offset}" stop-color="${esc(stop.color)}"/>`).join("")
  if (first.type === "linear_gradient") {
    // angle: 90 = top→bottom, 135 = TL→BR. Direction vector via theta = 180 - angle.
    const theta = ((180 - (first.angle ?? 90)) * Math.PI) / 180
    const vx = Math.cos(theta) / 2
    const vy = Math.sin(theta) / 2
    defs.push(`<linearGradient id="${id}" x1="${0.5 - vx}" y1="${0.5 - vy}" x2="${0.5 + vx}" y2="${0.5 + vy}">${stops}</linearGradient>`)
  } else {
    defs.push(`<radialGradient id="${id}" cx="${first.cx ?? 0.5}" cy="${first.cy ?? 0.5}" r="${first.radius ?? 0.5}">${stops}</radialGradient>`)
  }
  return `fill="url(#${id})"`
}

function strokeAttrs(node: PenNode): string {
  if (!node.stroke) return ""
  const color = node.stroke.fill?.[0]?.color || "#000000"
  const dash = node.stroke.dashPattern?.length ? ` stroke-dasharray="${node.stroke.dashPattern.join(" ")}"` : ""
  return ` stroke="${esc(color)}" stroke-width="${node.stroke.thickness ?? 1}"${dash}`
}

function effectAttrs(pieceId: string, node: PenNode): string {
  const shadow = node.effects?.find((effect) => effect.type === "shadow")
  if (!shadow) return ""
  const id = `pa-${pieceId}-f${defCounter++}`
  defs.push(
    `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="${shadow.offsetX ?? 0}" dy="${shadow.offsetY ?? 0}" stdDeviation="${(shadow.blur ?? 4) / 2}" flood-color="${esc(shadow.color || "rgba(0,0,0,0.4)")}"/></filter>`
  )
  return ` filter="url(#${id})"`
}

function commonAttrs(pieceId: string, node: PenNode, cx: number, cy: number): string {
  const rotate = node.rotation ? ` transform="rotate(${node.rotation} ${cx} ${cy})"` : ""
  const opacity = node.opacity !== undefined && node.opacity !== 1 ? ` opacity="${node.opacity}"` : ""
  return `${strokeAttrs(node)}${effectAttrs(pieceId, node)}${rotate}${opacity}`
}

function compileNode(pieceId: string, node: PenNode): string {
  const x = node.x ?? 0
  const y = node.y ?? 0
  const w = node.width ?? 0
  const h = node.height ?? 0
  switch (node.type) {
    case "rectangle": {
      const rx = node.cornerRadius ? ` rx="${node.cornerRadius}"` : ""
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx} ${fillAttr(pieceId, node.fill)}${commonAttrs(pieceId, node, x + w / 2, y + h / 2)}/>`
    }
    case "ellipse":
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${fillAttr(pieceId, node.fill)}${commonAttrs(pieceId, node, x + w / 2, y + h / 2)}/>`
    case "line": {
      // x2/y2 are deltas from the node position.
      const ex = x + (node.x2 ?? 0)
      const ey = y + (node.y2 ?? 0)
      return `<line x1="${x}" y1="${y}" x2="${ex}" y2="${ey}"${commonAttrs(pieceId, node, (x + ex) / 2, (y + ey) / 2)} stroke-linecap="round"/>`
    }
    case "path": {
      const translate = x || y ? `translate(${x} ${y})` : ""
      const rotate = node.rotation ? `rotate(${node.rotation} ${w / 2} ${h / 2})` : ""
      const transform = translate || rotate ? ` transform="${[translate, rotate].filter(Boolean).join(" ")}"` : ""
      const opacity = node.opacity !== undefined && node.opacity !== 1 ? ` opacity="${node.opacity}"` : ""
      return `<path d="${esc(node.d || "")}" ${fillAttr(pieceId, node.fill)}${strokeAttrs(node)}${effectAttrs(pieceId, node)} stroke-linecap="round" stroke-linejoin="round"${transform}${opacity}/>`
    }
    default:
      console.warn(`  [${pieceId}] unsupported node type "${node.type}" (${node.name || "unnamed"}) — skipped`)
      return ""
  }
}

function main() {
  const galleryIndex = process.argv.indexOf("--gallery")
  const galleryDir = galleryIndex > -1 ? process.argv[galleryIndex + 1] : null

  if (!existsSync(OP_FILE)) throw new Error(`${OP_FILE} not found — run from the repo root`)
  const doc = JSON.parse(readFileSync(OP_FILE, "utf-8")) as { children: PenNode[] }

  const art: Record<string, { width: number; height: number; markup: string }> = {}
  for (const frame of doc.children) {
    if (frame.type !== "frame" || !frame.name) continue
    defCounter = 0
    defs.length = 0
    const body = (frame.children || []).map((child) => compileNode(frame.name as string, child)).join("")
    const markup = `<defs>${defs.join("")}</defs>${body}`
    art[frame.name] = { width: frame.width ?? 96, height: frame.height ?? 96, markup }
    console.log(`compiled ${frame.name}: ${frame.children?.length ?? 0} nodes, ${markup.length} bytes`)
  }

  const banner = `// GENERATED FILE — do not edit by hand.\n// Source: ${OP_FILE} (OpenPencil document). Regenerate: pnpm exec tsx scripts/mapview-pieces-compile.ts\n// Art units: 96 per grid cell; the renderer scales to cellSize.\n`
  writeFileSync(
    OUT_FILE,
    `${banner}\nexport interface PieceArt {\n  width: number\n  height: number\n  markup: string\n}\n\nexport const PIECE_ART: Record<string, PieceArt> = ${JSON.stringify(art, null, 2)}\n`
  )
  console.log(`wrote ${OUT_FILE} (${Object.keys(art).length} pieces)`)

  if (galleryDir) {
    mkdirSync(galleryDir, { recursive: true })
    const cells = Object.entries(art)
      .map(
        ([id, piece]) =>
          `<div class="cell"><svg viewBox="0 0 ${piece.width} ${piece.height}" width="${piece.width}" height="${piece.height}">${piece.markup}</svg><p>${id} (${piece.width / 96}x${piece.height / 96})</p></div>`
      )
      .join("\n")
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Mapview piece art</title><style>body{background:#5c7042;margin:0;padding:32px;font-family:system-ui}.grid{display:flex;flex-wrap:wrap;gap:28px;align-items:flex-end}.cell{text-align:center}p{color:#e8dcc2;font-size:12px;margin-top:6px}</style></head><body><div class="grid">${cells}</div></body></html>`
    const path = join(galleryDir, "piece-gallery.html")
    writeFileSync(path, html)
    console.log(`wrote ${path}`)
  }
}

main()
