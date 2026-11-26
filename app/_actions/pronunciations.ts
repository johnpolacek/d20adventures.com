"use server"

import { settingPronunciations } from "@/lib/pronunciations"

// How the narrator says a setting's names, for the web game's narrator.
export async function getPronunciations(settingId: string) {
  if (!/^[a-z0-9-]+$/.test(settingId)) return {}
  return settingPronunciations(settingId)
}
