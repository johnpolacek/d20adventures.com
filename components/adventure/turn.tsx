import TurnCharacterList from "./turn-character-list"
import TurnNarrative from "./turn-narrative"

export default function Turn({ onTurnAdvanced }: { onTurnAdvanced?: () => void }) {
  return (
    <div className="flex gap-8 relative pb-24 px-8">
      <TurnCharacterList />
      <TurnNarrative onTurnAdvanced={onTurnAdvanced} />
    </div>
  )
}
