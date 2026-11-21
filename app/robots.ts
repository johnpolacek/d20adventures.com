import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/config"

// What a crawler has no reason to fetch: the API, the admin and dev pages, a player's own pages, and the steps into a
// game. A page that is fetched but kept out of search says so in its own metadata instead: a game in play, the asset
// library, the UI showcase. Those stay fetchable so a shared link still shows its card.
const PRIVATE = [
  "/api/",
  "/admin",
  "/dev/",
  "/account",
  "/player",
  "/play/",
  "/desktop/",
  "/mailing-list",
  "/unsubscribe",
  "/settings/*/edit",
  "/settings/*/*/character-select",
  "/settings/*/*/character-create",
  "/settings/*/*/practice",
  // An update as a markdown file repeats its page.
  "/updates/*/markdown",
]

export default function robots(): MetadataRoute.Robots {
  // Only the live site is for search. A preview deploy asks to be left alone.
  const env = process.env.VERCEL_ENV
  if (env && env !== "production") return { rules: { userAgent: "*", disallow: "/" } }
  return { rules: { userAgent: "*", allow: "/", disallow: PRIVATE }, sitemap: `${SITE_URL}/sitemap.xml` }
}
