import { useState } from "react"
import { startAdventure } from "@/app/_actions/start-adventure"
import { Button } from "@d20/ui/button"
import { Swap } from "@d20/ui/presence"
import { cn } from "@/lib/utils"
import type { Adventure } from "@/types/adventure"

interface StartAdventureButtonProps {
  canStartAdventure: boolean
  partyIsFull: boolean
  isSignedIn: boolean
  adventure: Adventure
  minParty: number
  maxParty: number
  currentPartySize: number
  settingId: string
  adventurePlanId: string
}

export function StartAdventureButton({ canStartAdventure, partyIsFull, isSignedIn, adventure, minParty, maxParty, currentPartySize, settingId, adventurePlanId }: StartAdventureButtonProps) {
  const [isStarting, setIsStarting] = useState(false)

  const handleStartAdventure = async () => {
    if (isStarting) return
    setIsStarting(true)
    await startAdventure({
      settingId,
      adventurePlanId,
      adventureId: adventure.id,
    })
    // The redirect happens in the server action
  }

  if (!isSignedIn) return null

  const state = !canStartAdventure ? "waiting" : partyIsFull ? "full" : "ready"
  const statusLine =
    state === "waiting"
      ? `Waiting for more players (${currentPartySize}/${minParty} minimum).`
      : state === "full"
        ? "Party complete — ready to begin the adventure."
        : `Ready to start (${currentPartySize}/${maxParty} seated) — begin now or wait for more players.`

  return (
    <Swap id={state}>
      <div className="flex flex-col gap-3.5">
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 font-sans text-xs",
            state === "waiting" ? "border-white/10 bg-white/[0.04] text-white/75" : "border-roll-success/30 bg-roll-success/10 text-[#d9ebb9]"
          )}
        >
          <span className="inline-flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                state === "waiting" ? "bg-accent-400 shadow-[0_0_0_3px_rgba(251,191,36,0.2)]" : "bg-roll-success shadow-[0_0_0_3px_rgba(183,211,138,0.18)]"
              )}
            />
            <span>{statusLine}</span>
          </span>
          <span className="shrink-0 font-mono text-3xs tracking-label opacity-75">
            {currentPartySize}/{maxParty} SEATED
          </span>
        </div>

        {state !== "waiting" && (
          <div className="flex justify-center sm:justify-end">
            <Button
              variant="epic"
              size="lg"
              className="w-full scale-100 hover:scale-[1.02] sm:w-auto"
              onClick={handleStartAdventure}
              disabled={isStarting}
            >
              {isStarting ? "Starting Adventure..." : "Start Adventure"}
            </Button>
          </div>
        )}
      </div>
    </Swap>
  )
}
