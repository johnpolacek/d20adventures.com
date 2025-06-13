import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import Image from "next/image"
import type { Adventure } from "@/types/adventure"
import { getImageUrl } from "@/lib/utils"

interface ActiveAdventureCardProps {
  adventure: Adventure
  userId: string | null
}

export default function ActiveAdventureCard({ adventure, userId }: ActiveAdventureCardProps) {
  // Find the current user's character in the adventure
  const userCharacter = adventure.party.find((pc) => pc.userId === userId)

  return (
    <Card id="active-adventure-card" className="w-[90%] max-w-xl mx-auto border border-primary-600 ring-8 ring-black/50 bg-gradient-to-tl from-black to-primary-900 text-white relative z-10">
      <CardContent className="flex flex-col items-center gap-6 sm:py-4">
        <div className="text-center space-y-3">
          <h3 className="text-2xl sm:text-3xl text-amber-400 font-display">{adventure.title}</h3>
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
        <div className="flex gap-3 mt-4">
          <Button asChild variant="epic" size="lg" className="flex items-center gap-2">
            <Link href={`/settings/${adventure.settingId}/${adventure.adventurePlanId}/${adventure.id}`}>Continue Adventure</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
