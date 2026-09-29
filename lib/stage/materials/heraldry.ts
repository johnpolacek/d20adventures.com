import { canvasTexture, TAU } from "../kit/geometry"
import type { Rand } from "../kit/rng"

// Heraldry from the Realm of Myr art direction, painted without lettering.
// Asterian: gold sunburst and eagle on navy. Valkaran: dark oak and stag on harvest
// orange with a green base band. The city: gold tower beneath a sun on a navy shield.
export const HERALDRY = ["asterian", "valkaran", "city"] as const
export type Heraldry = (typeof HERALDRY)[number]

type C2D = CanvasRenderingContext2D

function weathered(rand: Rand, c: C2D, w: number, h: number, field: string) {
  c.fillStyle = field
  c.fillRect(0, 0, w, h)
  const g = c.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, "#0000004a")
  g.addColorStop(0.25, "#ffffff10")
  g.addColorStop(0.7, "#00000012")
  g.addColorStop(1, "#00000055")
  c.fillStyle = g
  c.fillRect(0, 0, w, h)
  for (let i = 0; i < 70; i++) {
    const x = rand(0, w)
    const y = rand(0, h * 0.9)
    const l = rand(40, 260)
    const s = c.createLinearGradient(x, y, x, y + l)
    s.addColorStop(0, "#1a0a0628")
    s.addColorStop(1, "#1a0a0600")
    c.fillStyle = s
    c.fillRect(x, y, rand(3, 14), l)
  }
  for (let i = 0; i < 9000; i++) {
    c.fillStyle = rand.pick(["#f2dcb012", "#00000016"])
    c.fillRect(rand(0, w), rand(0, h), rand(1, 2), rand(1, 5))
  }
}
function sunburst(c: C2D, x: number, y: number, r: number, gold: string) {
  c.fillStyle = gold
  for (let i = 0; i < 24; i++) {
    c.save()
    c.translate(x, y)
    c.rotate((i * TAU) / 24)
    c.beginPath()
    c.moveTo(-r * 0.09, -r * 0.5)
    c.lineTo(0, -r * (i % 2 ? 0.82 : 1))
    c.lineTo(r * 0.09, -r * 0.5)
    c.fill()
    c.restore()
  }
  c.beginPath()
  c.arc(x, y, r * 0.5, 0, TAU)
  c.fill()
}
function eagle(c: C2D, x: number, y: number, s: number, col: string) {
  c.fillStyle = col
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  for (const k of [-1, 1]) {
    c.beginPath()
    c.moveTo(0, -4)
    c.bezierCurveTo(k * 20, -14, k * 44, -30, k * 62, -26)
    for (let f = 0; f < 5; f++) c.lineTo(k * (58 - f * 9), -14 + f * 9 + (f % 2) * 5)
    c.lineTo(k * 10, 16)
    c.closePath()
    c.fill()
  }
  c.beginPath()
  c.ellipse(0, 6, 11, 22, 0, 0, TAU)
  c.fill()
  c.beginPath()
  c.arc(0, -20, 8, 0, TAU)
  c.fill()
  c.beginPath()
  c.moveTo(4, -22)
  c.lineTo(13, -17)
  c.lineTo(4, -15)
  c.fill()
  c.beginPath()
  c.moveTo(-10, 24)
  c.lineTo(0, 44)
  c.lineTo(10, 24)
  c.fill()
  c.restore()
}
function oakAndStag(c: C2D, x: number, y: number, s: number) {
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  c.fillStyle = "#2b2116"
  c.fillRect(-7, -10, 14, 70)
  for (const [dx, dy, r] of [
    [0, -48, 34],
    [-30, -30, 26],
    [30, -30, 26],
    [-18, -70, 24],
    [18, -70, 24],
    [-40, -58, 18],
    [40, -58, 18],
    [0, -84, 20],
  ]) {
    c.beginPath()
    c.arc(dx, dy, r, 0, TAU)
    c.fill()
  }
  for (const k of [-1, 1]) {
    c.beginPath()
    c.moveTo(0, 56)
    c.quadraticCurveTo(k * 22, 58, k * 34, 70)
    c.lineTo(k * 30, 72)
    c.quadraticCurveTo(k * 18, 64, 0, 62)
    c.fill()
  }
  // Frontal stag's head with branching antlers, set before the trunk.
  c.fillStyle = "#231a12"
  c.beginPath()
  c.moveTo(-14, 72)
  c.lineTo(14, 72)
  c.lineTo(8, 108)
  c.lineTo(0, 116)
  c.lineTo(-8, 108)
  c.fill()
  for (const k of [-1, 1]) {
    c.beginPath()
    c.ellipse(k * 20, 74, 10, 5, k * 0.5, 0, TAU)
    c.fill()
    c.lineWidth = 5
    c.strokeStyle = "#231a12"
    c.beginPath()
    c.moveTo(k * 8, 70)
    c.quadraticCurveTo(k * 26, 50, k * 30, 24)
    c.moveTo(k * 20, 50)
    c.lineTo(k * 38, 44)
    c.moveTo(k * 27, 36)
    c.lineTo(k * 42, 26)
    c.moveTo(k * 16, 60)
    c.lineTo(k * 30, 60)
    c.stroke()
  }
  c.restore()
}
export function cityCrest(c: C2D, x: number, y: number, s: number, gold = "#caa04e", navy = "#1d2a4a") {
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  const shield = () => {
    c.beginPath()
    c.moveTo(-60, -70)
    c.lineTo(60, -70)
    c.lineTo(58, 10)
    c.quadraticCurveTo(50, 60, 0, 86)
    c.quadraticCurveTo(-50, 60, -58, 10)
    c.closePath()
  }
  c.fillStyle = gold
  shield()
  c.fill()
  c.save()
  c.scale(0.86, 0.86)
  c.fillStyle = navy
  shield()
  c.fill()
  c.restore()
  c.fillStyle = gold
  c.fillRect(-20, -14, 40, 70)
  for (let i = -2; i <= 2; i++)
    if (i % 2 === 0) c.fillRect(i * 9 - 5, -26, 10, 13)
    else c.fillRect(i * 9 - 4, -20, 8, 7)
  c.fillRect(-26, -16, 52, 6)
  c.fillStyle = navy
  c.beginPath()
  c.moveTo(-8, 56)
  c.lineTo(-8, 34)
  c.arc(0, 34, 8, Math.PI, 0)
  c.lineTo(8, 56)
  c.fill()
  c.fillStyle = gold
  sunburst(c, 0, -48, 18, gold)
  c.restore()
}
export function bannerTexture(rand: Rand, kind: Heraldry) {
  return canvasTexture(256, 1024, (c, w, h) => {
    const gold = "#c79d52"
    if (kind === "valkaran") {
      weathered(rand, c, w, h, "#a8582a")
      c.fillStyle = "#3d5530"
      c.fillRect(0, h * 0.78, w, h * 0.1)
      c.fillStyle = gold
      c.fillRect(0, h * 0.77, w, 5)
      c.fillRect(0, h * 0.885, w, 4)
      c.globalAlpha = 0.9
      oakAndStag(c, w / 2, h * 0.36, 1.25)
      c.globalAlpha = 1
      c.strokeStyle = gold
      c.lineWidth = 3
      c.strokeRect(14, 14, w - 28, h - 28)
    } else if (kind === "city") {
      weathered(rand, c, w, h, "#1d2a4a")
      c.strokeStyle = gold
      c.lineWidth = 7
      c.strokeRect(16, 14, w - 32, h - 28)
      cityCrest(c, w / 2, h * 0.34, 1.3, gold)
      for (let y = h - 200; y < h - 120; y += 24) {
        c.fillStyle = gold
        c.globalAlpha = 0.6
        c.fillRect(30, y, w - 60, 5)
      }
      c.globalAlpha = 1
    } else {
      weathered(rand, c, w, h, "#1f2c4e")
      c.strokeStyle = gold
      c.lineWidth = 7
      c.strokeRect(16, 14, w - 32, h - 28)
      c.lineWidth = 2
      c.strokeRect(28, 26, w - 56, h - 52)
      sunburst(c, w / 2, h * 0.3, 104, gold)
      eagle(c, w / 2, h * 0.3, 1.35, "#1f2c4e")
      for (let y = h - 200; y < h - 120; y += 24) {
        c.fillStyle = gold
        c.globalAlpha = 0.6
        c.fillRect(30, y, w - 60, 5)
      }
      c.globalAlpha = 1
    }
  })
}
