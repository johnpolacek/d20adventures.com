import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/config"
import { getCachedSettingAdventures } from "@/lib/setting-cache"
import { getPosts } from "@/lib/updates"
import { getImageUrl } from "@/lib/utils"
import { getLocalWikiAdventureDefinition, LOCAL_WIKI_ADVENTURES } from "@/lib/wiki-adventures/local-runtime"

// Every page meant for search: the fixed pages, each setting with its adventure list and its adventures' public pages,
// and the updates. A page left out of search is named in robots.ts or says so in its own metadata.
// Rebuilt at most hourly, as the updates are, so a post dated today is listed within the hour.
export const revalidate = 3600

const PAGES = ["", "/about", "/playtest", "/updates", "/contact", "/licenses", "/privacy", "/terms"]

const at = (path: string) => `${SITE_URL}${path}`
const noon = (date: string) => new Date(`${date}T12:00:00Z`)

async function settingPages(settingId: string): Promise<MetadataRoute.Sitemap> {
  // A setting whose adventures cannot be read still lists its own pages.
  const adventures = (await getCachedSettingAdventures(settingId).catch(() => [])).filter((a) => !a.draft)
  return [
    { url: at(`/settings/${settingId}`) },
    { url: at(`/settings/${settingId}/play`) },
    ...adventures.map((adventure) => {
      const video = getLocalWikiAdventureDefinition(settingId, adventure.id)?.video
      const description = adventure.teaser || adventure.overview
      return {
        url: at(`/settings/${settingId}/${adventure.id}`),
        images: adventure.image ? [getImageUrl(adventure.image)] : undefined,
        videos: video
          ? [{ title: `${adventure.title} Gameplay`, description, thumbnail_loc: `https://i.ytimg.com/vi/${video}/hqdefault.jpg`, player_loc: `https://www.youtube.com/embed/${video}` }]
          : undefined,
      }
    }),
  ]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts().catch(() => [])
  const settings = [...new Set(LOCAL_WIKI_ADVENTURES.map((adventure) => adventure.settingId))]
  return [
    // The updates page changes when its newest post does.
    ...PAGES.map((path) => ({ url: at(path), lastModified: path === "/updates" && posts[0] ? noon(posts[0].date) : undefined })),
    ...(await Promise.all(settings.map(settingPages))).flat(),
    ...posts.map((post) => ({ url: at(`/updates/${post.slug}`), lastModified: noon(post.date), images: post.image ? [post.image.startsWith("http") ? post.image : at(post.image)] : undefined })),
  ]
}
