"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getImageUrl } from "@/lib/utils"
import Image from "next/image"
import type { TurnCharacter } from "@/types/adventure"

interface NPCCharacterSheetModalProps {
  character: TurnCharacter | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NPCCharacterSheetModal({ character, open, onOpenChange }: NPCCharacterSheetModalProps) {
  if (!character) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-primary-900/95 via-primary-800/95 to-primary-900/95 border-primary-600">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display text-amber-300">{character.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Character Portrait and Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {character.image && (
              <div className="w-full h-40 rounded-xl bg-black border border-white/30 relative overflow-hidden mx-auto sm:mx-0 flex-shrink-0">
                <Image src={getImageUrl(character.image)} alt={character.name} fill className="absolute inset-0 w-full h-full object-cover rounded-xl" />
              </div>
            )}

            <div className="space-y-3 flex-1">
              <div className="font-display">
                {character.race} {character.gender} {character.archetype}
              </div>

              {/* Health Status - visible condition */}
              <div>
                <label className="text-xs font-mono text-white uppercase tracking-wider">Condition</label>
                <div className="flex items-center gap-2">
                  {character.healthPercent === 0 ? (
                    <span className="text-red-400 font-bold">Dead</span>
                  ) : character.healthPercent <= 25 ? (
                    <span className="text-red-400">Severely Wounded</span>
                  ) : character.healthPercent <= 50 ? (
                    <span className="text-orange-400">Wounded</span>
                  ) : character.healthPercent <= 75 ? (
                    <span className="text-yellow-400">Bloodied</span>
                  ) : (
                    <span className="text-green-400">Healthy</span>
                  )}
                </div>
              </div>

              {character.status && (
                <div>
                  <label className="text-xs font-mono text-white uppercase tracking-wider">Status</label>
                  <div className="text-white">{character.status}</div>
                </div>
              )}
            </div>
          </div>

          {/* Observable Information */}
          {character.appearance && (
            <div>
              <h3 className="text-lg font-display text-white mb-2">Appearance</h3>
              <p className="text-sm text-white">{character.appearance}</p>
            </div>
          )}

          {/* Visible Equipment Only */}
          {character.equipment && character.equipment.length > 0 && (
            <div>
              <h3 className="text-lg font-display text-white mb-2">Visible Equipment</h3>
              <div className="space-y-2">
                {character.equipment
                  .filter(
                    (item) =>
                      // Only show weapons, armor, and obviously visible items
                      item.name.toLowerCase().includes("sword") ||
                      item.name.toLowerCase().includes("bow") ||
                      item.name.toLowerCase().includes("staff") ||
                      item.name.toLowerCase().includes("armor") ||
                      item.name.toLowerCase().includes("shield") ||
                      item.name.toLowerCase().includes("cloak") ||
                      item.name.toLowerCase().includes("robe") ||
                      item.name.toLowerCase().includes("weapon") ||
                      item.name.toLowerCase().includes("axe") ||
                      item.name.toLowerCase().includes("hammer") ||
                      item.name.toLowerCase().includes("mace") ||
                      item.name.toLowerCase().includes("spear")
                  )
                  .map((item, index) => (
                    <div key={index} className="p-2 bg-black/30 rounded border border-primary-700">
                      <div className="font-semibold text-white">{item.name}</div>
                      {/* Only show basic descriptions for visible items */}
                      {item.description && <div className="text-xs text-primary-200 mt-1">{item.description.split(".")[0]}.</div>}
                    </div>
                  ))}
              </div>
              {character.equipment.filter(
                (item) =>
                  item.name.toLowerCase().includes("sword") ||
                  item.name.toLowerCase().includes("bow") ||
                  item.name.toLowerCase().includes("staff") ||
                  item.name.toLowerCase().includes("armor") ||
                  item.name.toLowerCase().includes("shield") ||
                  item.name.toLowerCase().includes("cloak") ||
                  item.name.toLowerCase().includes("robe") ||
                  item.name.toLowerCase().includes("weapon") ||
                  item.name.toLowerCase().includes("axe") ||
                  item.name.toLowerCase().includes("hammer") ||
                  item.name.toLowerCase().includes("mace") ||
                  item.name.toLowerCase().includes("spear")
              ).length === 0 && <p className="text-sm text-primary-200 italic">No obviously visible equipment.</p>}
            </div>
          )}

          {/* Observable Skills/Abilities */}
          {character.skills && character.skills.length > 0 && (
            <div>
              <h3 className="text-lg font-display text-white mb-2">Observable Traits</h3>
              <div className="flex flex-wrap gap-1">
                {character.skills
                  .filter(
                    (skill) =>
                      // Only show skills that would be obvious from observation
                      skill.toLowerCase().includes("intimidation") ||
                      skill.toLowerCase().includes("athletics") ||
                      skill.toLowerCase().includes("acrobatics") ||
                      skill.toLowerCase().includes("stealth") ||
                      skill.toLowerCase().includes("performance") ||
                      skill.toLowerCase().includes("persuasion") ||
                      skill.toLowerCase().includes("deception")
                  )
                  .map((skill, index) => (
                    <span key={index} className="text-xs px-2 py-1 bg-primary-700/50 rounded text-white">
                      {skill}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Mystery Notice */}
          <div className="p-3 bg-black/50 rounded border border-primary-600/50">
            <p className="text-xs text-primary-200 italic">This shows only what your character can observe. Hidden abilities, true motivations, and detailed statistics remain unknown.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
