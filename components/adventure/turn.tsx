import TurnCharacterList from "./turn-character-list"
import TurnNarrative from "./turn-narrative"
import type { AdventurePlan } from "@/types/adventure-plan"

export default function Turn({ adventurePlan }: { adventurePlan: AdventurePlan }) {
  return (
    <div className="flex gap-8 relative pb-24 px-8">
      <TurnCharacterList />
      <TurnNarrative canReply={true} adventurePlan={adventurePlan} />
    </div>
  )
}
