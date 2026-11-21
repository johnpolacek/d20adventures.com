import { unstable_cache } from "next/cache"
import { listAndReadJsonFilesInS3Directory, readJsonFromS3 } from "@/lib/s3-utils"
import { settingHasLocalWikiAdventures } from "@/lib/wiki-adventures/local-runtime"
import { loadWikiAdventurePlanViewsForSetting } from "@/lib/wiki-adventures/plan-view"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { Setting } from "@/types/setting"

// The setting pages read S3 and compile every adventure from markdown on each request, about a second.
// Saving a setting or an adventure's source drops these, and they expire on their own after five minutes.
const REVALIDATE_SECONDS = 300

export const settingCacheTag = (settingId: string) => `setting:${settingId}`

export function getCachedSetting(settingId: string): Promise<Setting> {
  return unstable_cache(async () => (await readJsonFromS3(`settings/${settingId}/setting-data.json`)) as Setting, ["setting-data", settingId], {
    tags: [settingCacheTag(settingId)],
    revalidate: REVALIDATE_SECONDS,
  })()
}

export function getCachedSettingAdventures(settingId: string): Promise<AdventurePlan[]> {
  return unstable_cache(
    async () => {
      if (settingHasLocalWikiAdventures(settingId)) return loadWikiAdventurePlanViewsForSetting(settingId)
      const files = await listAndReadJsonFilesInS3Directory(`settings/${settingId}/`, ["setting-data.json"])
      return files.map((file) => file.data as AdventurePlan)
    },
    ["setting-adventures", settingId],
    { tags: [settingCacheTag(settingId)], revalidate: REVALIDATE_SECONDS }
  )()
}
