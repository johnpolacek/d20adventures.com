"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { getImageUrl } from "@/lib/utils"
import Image from "next/image"
import { useState } from "react"
import type { TurnCharacter } from "@/types/adventure"

interface CharacterSheetModalProps {
  character: TurnCharacter | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ExpandableTextProps {
  title: string
  text: string
}

function ExpandableText({ title, text }: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Check if text is long enough to need truncation
  const needsTruncation = text.length > 150 // Rough estimate for when line-clamp-2 would be needed

  return (
    <div>
      <h3 className="text-lg font-display mb-2">{title}</h3>
      <div className={`text-sm text-white/90 ${!isExpanded && needsTruncation ? "line-clamp-2" : ""}`}>{text}</div>
      {needsTruncation && (
        <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="text-sm text-primary-200 hover:text-primary-100 p-0 h-auto mt-1">
          {isExpanded ? "Read less" : "Read more"}
        </Button>
      )}
    </div>
  )
}

export function CharacterSheetModal({ character, open, onOpenChange }: CharacterSheetModalProps) {
  if (!character) return null

  const getModifier = (score: number) => Math.floor((score - 10) / 2)
  const formatModifier = (modifier: number) => (modifier >= 0 ? `+${modifier}` : `${modifier}`)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-4xl sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-primary-900/95 via-primary-800/95 to-primary-900/95 border-primary-600">
        <DialogHeader>
          <DialogTitle className="sr-only">{character.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Basic Info */}
          <div className="space-y-4">
            {character.image && (
              <div className="w-full aspect-[1.33] rounded-xl bg-black border border-white/30 relative overflow-hidden mx-auto lg:mx-0">
                <Image src={getImageUrl(character.image)} alt={character.name} fill className="absolute inset-0 w-full h-full object-cover rounded-xl" />
              </div>
            )}

            <div className="space-y-2">
              <div className="text-2xl lg:text-3xl font-display text-amber-300 font-bold">{character.name}</div>
              <div className="font-display text-sm">
                {character.race} {character.gender} {character.archetype}
              </div>

              <div>
                <label className="text-xs font-mono text-primary-200 uppercase tracking-wider">Health</label>
                <div className="flex items-center gap-2">
                  <div className="">{character.healthPercent}%</div>
                  <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 to-red-500 transition-all duration-300" style={{ width: `${character.healthPercent}%` }} />
                  </div>
                </div>
              </div>

              {character.status && (
                <div>
                  <label className="text-xs font-mono text-primary-200 uppercase tracking-wider">Status</label>
                  <div className="">{character.status}</div>
                </div>
              )}
            </div>

            {character.attributes && (
              <div>
                <h3 className="text-lg font-display  mb-3">Attributes</h3>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(character.attributes).map(([attr, value]) => {
                    const modifier = getModifier(value)
                    return (
                      <div key={attr} className="text-center p-2 bg-black/30 rounded border border-primary-700">
                        <div className="text-xs font-mono text-primary-200 uppercase">{attr.slice(0, 3)}</div>
                        <div className="text-lg font-bold ">{value}</div>
                        <div className="text-sm text-primary-300">{formatModifier(modifier)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Detailed Info */}
          <div className="space-y-4">
            {character.background && <ExpandableText title="Background" text={character.background} />}
            {character.appearance && <ExpandableText title="Appearance" text={character.appearance} />}
            {character.personality && <ExpandableText title="Personality" text={character.personality} />}
            {character.motivation && <ExpandableText title="Motivation" text={character.motivation} />}
            {character.behavior && <ExpandableText title="Behavior" text={character.behavior} />}
          </div>

          <div className="col-span-2 space-y-4">
            {character.skills && character.skills.length > 0 && (
              <div>
                <h3 className="text-lg font-display  mb-2">Skills</h3>
                <div className="flex flex-wrap gap-1">
                  {character.skills.map((skill, index) => (
                    <span key={index} className="text-xs sm:text-sm text-primary-100 px-3 py-1 bg-primary-700/50 rounded ">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {character.spells && character.spells.length > 0 && (
              <div>
                <h3 className="text-lg font-display  mb-2">Spells</h3>
                <div className="grid grid-cols-2 gap-2 auto-rows-fr">
                  {character.spells.map((spell, index) => (
                    <div key={index} className="h-full flex flex-col p-2 bg-black/30 rounded border border-primary-700">
                      <div className="font-medium">{spell.name}</div>
                      {spell.description && <div className="text-sm text-primary-200 mt-1 flex-1">{spell.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {character.specialAbilities && character.specialAbilities.length > 0 && (
              <div>
                <h3 className="text-lg font-display  mb-2">Special Abilities</h3>
                <div className="grid grid-cols-2 gap-2 auto-rows-fr">
                  {character.specialAbilities.map((ability, index) => (
                    <div key={index} className="h-full flex items-start text-sm text-primary-200 p-2 bg-black/30 rounded border border-primary-700">
                      {ability}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {character.equipment && character.equipment.length > 0 && (
              <div>
                <h3 className="text-lg font-display  mb-2">Equipment</h3>
                <div className="grid grid-cols-2 gap-2 auto-rows-fr">
                  {character.equipment.map((item, index) => (
                    <div key={index} className="h-full flex flex-col p-2 bg-black/30 rounded border border-primary-700">
                      <div className="font-medium">{item.name}</div>
                      {item.description && <div className="text-sm text-primary-200 mt-1 flex-1">{item.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
