import type { CrowdMode } from "./figures/crowd"
import type { AAMode } from "./render/pipeline"

// Quality tiers, measured on an M3 at Retina (party view): balanced 60 fps (vsync), high about 43–46, ultra about 21.
// `ratio` caps the device pixel ratio; `paint` is the paint filter's fixed internal height in pixels, independent of it.
export interface Tier {
  ratio: number
  paint: number
  shadow: number
  bloom: boolean
  aa: AAMode
  ao: boolean
  cardRadius: number
  // Share of the drawing buffer a planar water reflection renders at (sets with mirrored water only); 0 is off.
  mirror: number
}
export const TIERS = {
  mobile: { ratio: 1, paint: 480, shadow: 1024, bloom: false, aa: "off", ao: false, cardRadius: 40, mirror: 0 },
  balanced: { ratio: 1, paint: 540, shadow: 2048, bloom: false, aa: "off", ao: false, cardRadius: 60, mirror: 0.35 },
  high: { ratio: 1.5, paint: 720, shadow: 4096, bloom: false, aa: "fxaa", ao: true, cardRadius: 60, mirror: 0.4 },
  ultra: { ratio: 2, paint: 900, shadow: 4096, bloom: true, aa: "msaa", ao: true, cardRadius: 60, mirror: 0.6 },
} as const satisfies Record<string, Tier>
export type TierName = keyof typeof TIERS
export const TIER_NAMES = Object.keys(TIERS) as TierName[]

// Switches that override a tier (for A/B review and perf runs).
export interface Flags {
  crowd: CrowdMode
  paint: "uniform" | "depth"
  aa?: AAMode
  ao?: boolean
  bloom?: boolean
  dpr?: number
  cardRadius?: number
  mirror?: number
  brush: number
}
export const DEFAULT_FLAGS: Flags = { crowd: "hybrid", paint: "depth", brush: 1 }

// Software renderers and small touch screens start low; everything else starts at high.
export function autoTier(gl: WebGLRenderingContext | WebGL2RenderingContext): TierName {
  const dbg = gl.getExtension("WEBGL_debug_renderer_info")
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ""
  if (/swiftshader|llvmpipe|software/i.test(gpu)) return "balanced"
  if (typeof window !== "undefined") {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches
    if (coarse && Math.min(window.innerWidth, window.innerHeight) < 700) return "mobile"
    if (window.innerWidth < 700) return "balanced"
  }
  return "high"
}
