'use server'
import { listAndReadJsonFilesInS3Directory } from "@/lib/s3-utils";
import type { PCTemplate } from "@/types/character";

export async function getUserCharacters(userId: string): Promise<PCTemplate[]> {
  try {
    const results = await listAndReadJsonFilesInS3Directory(`characters/${userId}/`);
    return results.map((r) => r.data as PCTemplate);
  } catch {
    return [];
  }
} 