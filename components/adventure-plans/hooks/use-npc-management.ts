import type { Character } from "@/types/character"
import type * as React from "react"
import slugify from "slugify"
import { toast } from "sonner"

export function useNpcManagement(npcs: Record<string, Character>, setNpcs: React.Dispatch<React.SetStateAction<Record<string, Character>>>) {
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

  const handleNpcCreateDefault = () => {
    // Start with base name
    const baseName = "New NPC"
    let idx = 1
    let newName = baseName
    // Ensure unique name
    while (Object.values(npcs).some((npc) => npc.name === newName)) {
      newName = `${baseName} ${idx++}`
    }
    const newNpcId = slugify(newName, { lower: true, strict: true })
    if (npcs[newNpcId]) {
      toast.error(`NPC with ID "${newNpcId}" already exists.`)
      return null
    }
    const newNpc: Character = {
      id: newNpcId,
      name: newName,
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
    toast.success(`NPC "${newName}" created successfully!`)
    return newNpcId
  }

  return {
    handleNpcCreate,
    handleNpcCreateDefault,
  }
}
