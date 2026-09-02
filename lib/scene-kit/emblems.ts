// scene-kit emblems: canvas painters for heraldry. No lettering anywhere — the
// quality bar forbids text on surfaces, so factions are told apart by device.
//
// Each painter draws centred on a square canvas of side `size`. They are consumed
// by clothTexture's `emblem` option and by the carved-medallion texture.

export type EmblemPainter = (ctx: CanvasRenderingContext2D, size: number) => void

/** Asterian imperial: gold sunburst with an eagle at its centre, on navy. */
export const drawSunEagle: EmblemPainter = (ctx, S) => {
  const cx = S / 2
  const cy = S * 0.42
  const gold = "#d9a83a"
  const gold2 = "#f2cf6b"
  ctx.translate(cx, cy)
  ctx.fillStyle = gold
  for (let i = 0; i < 16; i++) {
    ctx.save()
    ctx.rotate((i / 16) * Math.PI * 2)
    ctx.beginPath()
    ctx.moveTo(-S * 0.035, 0)
    ctx.lineTo(0, -S * (i % 2 ? 0.3 : 0.36))
    ctx.lineTo(S * 0.035, 0)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, S * 0.2, 0, Math.PI * 2)
  ctx.fillStyle = gold2
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, S * 0.17, 0, Math.PI * 2)
  ctx.fillStyle = "#1d3f86"
  ctx.fill()
  // eagle
  ctx.fillStyle = gold2
  const w = S * 0.16
  ctx.beginPath()
  ctx.ellipse(0, S * 0.02, S * 0.035, S * 0.08, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, -S * 0.07, S * 0.028, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(S * 0.02, -S * 0.075)
  ctx.lineTo(S * 0.05, -S * 0.06)
  ctx.lineTo(S * 0.02, -S * 0.05)
  ctx.fill()
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * S * 0.02, -S * 0.03)
    ctx.quadraticCurveTo(s * S * 0.09, -S * 0.12, s * w, -S * 0.09)
    ctx.quadraticCurveTo(s * S * 0.13, -S * 0.02, s * S * 0.14, S * 0.02)
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(s * (S * 0.13 - i * S * 0.03), S * (0.055 - i * 0.008))
      ctx.lineTo(s * (S * 0.115 - i * S * 0.03), S * (0.03 - i * 0.005))
    }
    ctx.lineTo(s * S * 0.02, S * 0.06)
    ctx.closePath()
    ctx.fill()
  }
  // tail
  ctx.beginPath()
  ctx.moveTo(-S * 0.03, S * 0.08)
  ctx.lineTo(-S * 0.05, S * 0.14)
  ctx.lineTo(0, S * 0.12)
  ctx.lineTo(S * 0.05, S * 0.14)
  ctx.lineTo(S * 0.03, S * 0.08)
  ctx.closePath()
  ctx.fill()
  // lower gold bands
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = gold
  ctx.fillRect(0, S * 0.74, S, S * 0.03)
  ctx.fillRect(0, S * 0.8, S, S * 0.012)
}

function stagHead(ctx: CanvasRenderingContext2D, S: number, x: number, y: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = "round"
  ctx.lineWidth = S * 0.018
  ctx.beginPath()
  ctx.ellipse(0, S * 0.04, S * 0.045, S * 0.075, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(-S * 0.055, -S * 0.01, S * 0.03, S * 0.015, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(S * 0.055, -S * 0.01, S * 0.03, S * 0.015, 0.5, 0, Math.PI * 2)
  ctx.fill()
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * S * 0.03, -S * 0.03)
    ctx.quadraticCurveTo(s * S * 0.09, -S * 0.09, s * S * 0.1, -S * 0.19)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(s * S * 0.06, -S * 0.08)
    ctx.lineTo(s * S * 0.03, -S * 0.15)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(s * S * 0.085, -S * 0.13)
    ctx.lineTo(s * S * 0.135, -S * 0.16)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(s * S * 0.095, -S * 0.17)
    ctx.lineTo(s * S * 0.075, -S * 0.23)
    ctx.stroke()
  }
  ctx.restore()
}

/** Valkaran festival: oak tree flanked by stag heads, green base band on harvest orange. */
export const drawTreeStag: EmblemPainter = (ctx, S) => {
  const green = "#2f4a24"
  const dark = "#243a1c"
  ctx.fillStyle = green
  ctx.fillRect(0, S * 0.78, S, S * 0.22)
  ctx.fillStyle = "#c9a24a"
  ctx.fillRect(0, S * 0.765, S, S * 0.018)
  ctx.translate(S / 2, S * 0.4)
  // tree
  ctx.fillStyle = "#4a2f19"
  ctx.beginPath()
  ctx.moveTo(-S * 0.03, S * 0.18)
  ctx.lineTo(-S * 0.015, -S * 0.02)
  ctx.lineTo(S * 0.015, -S * 0.02)
  ctx.lineTo(S * 0.03, S * 0.18)
  ctx.lineTo(S * 0.07, S * 0.2)
  ctx.lineTo(-S * 0.07, S * 0.2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = dark
  for (const [ox, oy, rad] of [
    [0, -0.12, 0.11],
    [-0.08, -0.05, 0.08],
    [0.08, -0.05, 0.08],
    [-0.04, -0.16, 0.07],
    [0.04, -0.16, 0.07],
  ]) {
    ctx.beginPath()
    ctx.arc(ox * S, oy * S, rad * S, 0, Math.PI * 2)
    ctx.fill()
  }
  stagHead(ctx, S, -S * 0.27, -S * 0.02, dark)
  stagHead(ctx, S, S * 0.27, -S * 0.02, dark)
}

/** Kordavos city crest: gold tower under a small sun on a navy shield with gold border. */
export const drawCityCrest: EmblemPainter = (ctx, S) => {
  ctx.translate(S / 2, S * 0.36)
  const gold = "#e0b04a"
  const shield = (half: number, top: number, bottom: number, tip: number) => {
    ctx.beginPath()
    ctx.moveTo(-half, -top)
    ctx.lineTo(half, -top)
    ctx.lineTo(half, bottom)
    ctx.quadraticCurveTo(half, tip, 0, tip + (tip - bottom) * 0.4)
    ctx.quadraticCurveTo(-half, tip, -half, bottom)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = gold
  shield(S * 0.16, S * 0.16, S * 0.04, S * 0.2)
  ctx.fillStyle = "#1d3f86"
  shield(S * 0.13, S * 0.13, S * 0.04, S * 0.17)
  ctx.fillStyle = gold
  ctx.fillRect(-S * 0.05, -S * 0.04, S * 0.1, S * 0.18)
  for (let i = 0; i < 3; i++) ctx.fillRect(-S * 0.05 + i * S * 0.04, -S * 0.07, S * 0.02, S * 0.03)
  ctx.fillStyle = "#1d3f86"
  ctx.beginPath()
  ctx.arc(0, S * 0.1, S * 0.02, Math.PI, 0)
  ctx.lineTo(S * 0.02, S * 0.14)
  ctx.lineTo(-S * 0.02, S * 0.14)
  ctx.fill()
  ctx.fillStyle = gold
  for (let i = 0; i < 8; i++) {
    ctx.save()
    ctx.rotate((i / 8) * Math.PI * 2)
    ctx.beginPath()
    ctx.moveTo(-S * 0.008, -S * 0.08)
    ctx.lineTo(0, -S * 0.115)
    ctx.lineTo(S * 0.008, -S * 0.08)
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, -S * 0.08, S * 0.02, 0, Math.PI * 2)
  ctx.fill()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = gold
  ctx.fillRect(0, 0, S, S * 0.03)
  ctx.fillRect(0, S * 0.06, S, S * 0.012)
  ctx.fillRect(0, S * 0.96, S, S * 0.04)
}
