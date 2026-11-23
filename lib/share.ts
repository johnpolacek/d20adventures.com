import type { Metadata } from "next"
import { siteConfig } from "@/lib/config"

// cardTitle names the card when the tab title reads poorly there, path gives the card its address.
type Share = { title: string; cardTitle?: string; path?: string; description?: string; image?: { url: string; width?: number; height?: number; alt?: string } }

// A page's title, description and share card together. A page that sets openGraph replaces the layout's whole card,
// so the card carries its own title and description and falls back to the site picture.
export function share({ title, cardTitle = title, path, description, image }: Share): Metadata {
  description = brief(description || siteConfig.description)
  const picture = image ?? { url: siteConfig.shareImage, width: 1200, height: 630, alt: `${siteConfig.title} screenshot` }
  return {
    title: `${title} | ${siteConfig.title}`,
    description,
    openGraph: { title: cardTitle, description, url: path, type: "website", images: [picture] },
    twitter: { card: "summary_large_image", title: cardTitle, description, images: [picture.url] },
  }
}

// Cards show about 200 characters. A long description keeps its whole sentences up to that, or its first one.
function brief(text: string, limit = 200): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= limit) return flat
  const sentences = flat.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [flat]
  let out = ""
  for (const sentence of sentences) {
    if (out && (out + sentence).length > limit) break
    out += sentence
  }
  return out.trim()
}
