"use server"

import { createServerCore } from "@/lib/gm-server/core"

// A reply in the player's own words, written into the story as their hero's beats.
export async function writeReply(...args: Parameters<ReturnType<typeof createServerCore>["writeReply"]>) {
  return createServerCore().writeReply(...args)
}
