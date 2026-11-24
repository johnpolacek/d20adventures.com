import { z } from "zod"
import type { GmPorts } from "../ports"
import type { StoryBeat } from "../story/beats"
import { turnScript } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"

const exitSchema = z.object({
  met: z.boolean().describe("True only when what has already happened this round fully meets one of the listed conditions."),
  condition: z.number().int().optional().describe("The number of the condition met, when one is."),
})

/**
 * Whether the round has already met a way out of its encounter, asked after each one acts. A scene whose way out is
 * met mid-round, as when Lyra gives her verdict on the crate, ends there: those still to act would otherwise play out
 * what the next scene's intro tells again. The round's end still decides the transition and tells it
 * (../orchestration/advance-turn): this only stops the round from running on past it. Asked only in an encounter
 * with ways out, and only once someone has acted this round.
 */
export function createExitCheck(ports: GmPorts) {
  return async function exitMet(args: {
    settingId: string
    planId: string
    turn: { encounterId: string; story: StoryBeat[]; characters: TurnCharacter[] }
  }): Promise<boolean> {
    const { settingId, planId, turn } = args
    if (!ports.content.isWikiAdventure(settingId, planId)) return false
    const acted = turn.story.some((beat) => beat.by.step !== "intro" && beat.by.step !== "round")
    if (!acted) return false
    const { artifacts } = await ports.content.loadWikiRuntime(settingId, planId)
    // The rescue is the core's to take, on health, and never the model's (../wiki-adventures/runtime-context).
    const rescue = artifacts.manifest.rescue?.encounterId
    const ways = artifacts.graph.encounterTransitions.filter(
      (way) => way.fromEncounterId === turn.encounterId && way.publishResolved && way.toEncounterId !== rescue && way.toEncounterId !== turn.encounterId
    )
    if (!ways.length) return false
    const encounter = artifacts.encounters[turn.encounterId]
    const prompt = `You keep the pace of a tabletop scene for its game master. The scene is "${encounter?.title ?? turn.encounterId}".

Its ways out, each with the condition that takes it:
${ways.map((way, index) => `${index + 1}. ${way.condition}`).join("\n")}

${encounter?.sections.gmNotes ? `The scene's notes:\n${encounter.sections.gmNotes}\n\n` : ""}This round so far:
${turnScript(turn)}

Has what already happened this round fully met one of the conditions? Judge only from what is told above, not from what may come next. A condition is met only when every part of it is. A plan, a threat or a question is not the deed itself, and a condition that waits on a player's choice is not met until that choice is made. When unsure, it is not met.`
    try {
      const { object } = await ports.llm.generateObject({ prompt, schema: exitSchema })
      return object.met
    } catch (error) {
      console.warn("[exit check] Could not ask, so the round plays on:", error)
      return false
    }
  }
}
