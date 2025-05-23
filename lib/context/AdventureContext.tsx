import React, { createContext, useContext } from "react"
import type { Adventure } from "@/types/adventure"

type AdventureContextType = {
  adventurePlanId: string
  settingId: string
  adventure: Adventure
}

const AdventureContext = createContext<AdventureContextType | undefined>(undefined)

export const AdventureProvider = ({ adventurePlanId, settingId, adventure, children }: { adventurePlanId: string; settingId: string; adventure: Adventure; children: React.ReactNode }) => (
  <AdventureContext.Provider value={{ adventurePlanId, settingId, adventure }}>{children}</AdventureContext.Provider>
)

export function useAdventure() {
  const ctx = useContext(AdventureContext)
  if (!ctx) throw new Error("useAdventure must be used within an AdventureProvider")
  return ctx
}
