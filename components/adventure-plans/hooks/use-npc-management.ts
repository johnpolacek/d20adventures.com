import * as React from "react"
import { toast } from "sonner"
import slugify from "slugify"
import type { Character } from "@/types/character"

export function useNpcManagement(
  npcs: Record<string, Character>,
  setNpcs: React.Dispatch<React.SetStateAction<Record<string, Character>>>
) {
  const handleNpcCreate = (npcName: string) => {
    const newNpcId = slugify(npcName, { lower: true, strict: true })
    if (npcs[newNpcId]) {
      toast.error(`NPC with ID "${newNpcId}" already exists.`)
      return null
    }

    const newNpc: Character = {
      id: newNpcId,
      name: npcName,
      type: "npc",
      archetype: "Unknown",
      race: "Unknown",
      appearance: "Not described",
      healthPercent: 100,
      image: "",
    }

    setNpcs((prevNpcs) => ({
      ...prevNpcs,
      [newNpcId]: newNpc,
    }))

    toast.success(`NPC "${npcName}" created successfully!`)
    return newNpcId
  }

  return {
    handleNpcCreate,
  }
} 