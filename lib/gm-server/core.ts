import { auth } from "@clerk/nextjs/server"
import { createGmCore } from "@d20/gm-core"
import { after } from "next/server"
import type { Id } from "@/convex/_generated/dataModel"
import { maybeTriggerStoryviewAutoGeneration } from "@/lib/services/turn-audio-service"
import { serverContent } from "./content"
import { createServerLlm } from "./llm"
import { serverStore } from "./store"

export function createServerCore() {
  return createGmCore({
    llm: createServerLlm(),
    store: serverStore,
    content: serverContent,
    identity: async () => (await auth()).userId,
    narration: { afterTurn: (turnId) => after(() => maybeTriggerStoryviewAutoGeneration(turnId as Id<"turns">)) },
  })
}
