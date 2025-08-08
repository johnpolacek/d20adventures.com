import TurnCharacterList from "./turn-character-list"
import TurnNarrative from "./turn-narrative"
import GameChat from "./game-chat"

export default function Turn({ nextAdventure }: { nextAdventure?: string }) {
  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 relative pb-24 px-8">
      <TurnCharacterList />
      <TurnNarrative nextAdventure={nextAdventure} />
      <div className="fixed bottom-8 right-8 z-50">
        <GameChat />
      </div>
    </div>
  )
}
