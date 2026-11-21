import { ChevronsRight } from "lucide-react"
import Link from "next/link"
import { Button } from "@d20/ui/button"
import { Card, CardContent } from "@d20/ui/card"
import Image from "@d20/ui/native-image"
import { getImageUrl } from "@/lib/utils"
import type { Adventure } from "@/types/adventure"
import { textShadow, textShadowSpread } from "@d20/ui/typography/styles"

interface ActiveAdventureCardProps {
  adventure: Adventure
  userId: string | null
}

export default function ActiveAdventureCard({ adventure, userId }: ActiveAdventureCardProps) {
  // Find the current user's character in the adventure (AI companions carry the owner's userId)
  const userCharacter = adventure.party.find((pc) => pc.userId === userId && pc.controlledBy !== "ai")

  return (
    <Card
      id="active-adventure-card"
      variant="feature"
      className="w-[90%] max-w-xl mx-auto p-0 sm:p-0 py-6 border border-white/20 ring-4 bg-gradient-to-tl from-transparent via-black/50 to-transparent relative z-10"
    >
      <CardContent className="flex flex-col items-center gap-4 sm:py-4">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="text-xxs text-primary-100 bg-primary-800/80 rounded-lg px-3 py-1 font-display font-bold -mt-2">
              Current {(adventure.runType ?? "campaign") === "practice" ? "Practice Run" : "Campaign"}
            </div>
          </div>
          <h3 style={textShadowSpread} className="text-2xl sm:text-3xl font-bold text-accent-300 font-display">
            {adventure.title}
          </h3>
          {userCharacter && (
            <div className="flex items-center gap-4 justify-center">
              <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-primary-300">
                <Image className="object-cover" fill src={getImageUrl(userCharacter.image)} alt={userCharacter.name} />
              </div>
              <div className="text-left">
                <p className="font-display sm:text-lg">{userCharacter.name}</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="epic" size="lg" className="flex items-center text-center gap-2" render={<Link href={`/settings/${adventure.settingId}/${adventure.adventurePlanId}/${adventure.id}`} />}>
              Continue <ChevronsRight style={textShadow} className="w-5 h-5 scale-y-125 text-primary-100 -ml-1 -mr-2 relative -top-px" />
            </Button>
        </div>
      </CardContent>
    </Card>
  )
}
