import TurnCharacterList from "./turn-character-list"
import TurnNarrative from "./turn-narrative"

export default function Turn() {
  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 relative pb-24 px-8">
      <TurnCharacterList />
      <TurnNarrative />
    </div>
  )
}
