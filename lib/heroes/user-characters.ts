import { listAndReadJsonFilesInS3Directory } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"

// Server only. An account's saved heroes, for a caller that has already checked who may see them. It is not a server
// action, which would let any browser list any account's heroes.
export async function getUserCharacters(userId: string): Promise<PCTemplate[]> {
  try {
    const results = await listAndReadJsonFilesInS3Directory(`characters/${userId}/`)
    return results.map((r) => r.data as PCTemplate)
  } catch {
    return []
  }
}
