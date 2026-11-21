import { IMAGE_HOST } from "./config"
import manifest from "./images-manifest.json"

// The site's pictures at the sizes a screen needs. The originals in the public bucket are paintings of 8 MB and
// more. `pnpm images:sync` makes each a few WebP widths and one JPEG for share cards, stores them under opt/ in the
// same bucket, and records each original's size and version in images-manifest.json. A picture the manifest does not
// know is served as it is, so nothing breaks before a sync. Everything is served by CloudFront, never by the deploy.

export const WIDTHS = [480, 960, 1920]
export const SHARE_WIDTH = 1200

/** An original's width, height and version: the first characters of its ETag, so a repaint gets new addresses. */
type Entry = [width: number, height: number, version: string]
const known = manifest as unknown as Record<string, Entry>

const HOSTS = [/^https:\/\/d1dkwd3w4hheqw\.cloudfront\.net\//, /^https:\/\/d20-public\.s3\.us-east-1\.amazonaws\.com\//, /^https:\/\/s3\.us-east-1\.amazonaws\.com\/d20-public\//]

/** The bucket key of one of our pictures, however its address is spelled. Null for anyone else's. */
export function bucketKey(url: string): string | null {
  const path = url.replace(/[?#].*$/, "")
  if (!/^https?:/.test(path)) return path.replace(/^\/+/, "") || null
  const host = HOSTS.find((h) => h.test(path))
  return host ? decodeURIComponent(path.replace(host, "")) : null
}

/** The widths kept of an original this wide: never wider than it is. */
export const variantWidths = (width: number) => [...new Set(WIDTHS.map((w) => Math.min(w, width)))]
export const variantKey = (key: string, version: string, name: string) => `opt/${key}.${version}.${name}`

const address = (key: string) => `${IMAGE_HOST}/${encodeURI(key)}`
const original = (url: string) => (/^(https?|blob|data):/.test(url) ? url : address(url.replace(/^\/+/, "")))

/** What an <img> needs to show a picture at the size of its slot. `sizes` is the slot's width, as CSS reads it. */
export function picture(url: string, sizes = "100vw"): { src: string; srcSet?: string; sizes?: string } {
  const key = url ? bucketKey(url) : null
  const entry = key ? known[key] : undefined
  if (!key || !entry) return { src: url ? original(url) : url }
  const widths = variantWidths(entry[0])
  const at = (w: number) => address(variantKey(key, entry[2], `${w}.webp`))
  return { src: at(widths[widths.length - 1]), srcSet: widths.map((w) => `${at(w)} ${w}w`).join(", "), sizes }
}

/** One address, for a picture drawn about this many CSS pixels wide where no list of sizes can be given. */
export function pictureAt(url: string, width: number): string {
  const key = url ? bucketKey(url) : null
  const entry = key ? known[key] : undefined
  if (!key || !entry) return url ? original(url) : url
  const widths = variantWidths(entry[0])
  // Twice the slot, for a sharp screen.
  return address(variantKey(key, entry[2], `${widths.find((w) => w >= width * 2) ?? widths[widths.length - 1]}.webp`))
}

/** The same, as the page header takes it. */
export function headerImage(url: string): { imageUrl: string; srcSet?: string } {
  const { src, srcSet } = picture(url)
  return { imageUrl: src, srcSet }
}

/** A picture for a share card: a JPEG, which every network reads, small enough for their limits. */
export function shareImage(url: string): string {
  const key = url ? bucketKey(url) : null
  const entry = key ? known[key] : undefined
  return key && entry ? address(variantKey(key, entry[2], "share.jpg")) : url ? original(url) : url
}
