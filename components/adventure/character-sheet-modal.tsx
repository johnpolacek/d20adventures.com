"use client"

import { conditionLabel } from "@d20/gm-core/utils/condition-label"
import { useState } from "react"
import { MagicItems } from "@/components/stage/magic-items"
import { StandingOrders } from "@/components/stage/reaction-card"
import { heroReactions, type StandingOrders as Orders } from "@/components/stage/reaction-view"
import { DeathSaveMarks } from "@/components/stage/roll-parts"
import { standingOf, standingWords } from "@/components/stage/standing"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Image from "@/components/ui/native-image"
import { getImageUrl } from "@/lib/utils"
import type { TurnCharacter } from "@/types/adventure"
import type { PC, PCTemplate } from "@/types/character"
import { useSheetView } from "./use-sheet-view"

type CharacterSheetModalCharacter = TurnCharacter | PC | PCTemplate | null
interface CharacterSheetModalProps {
  character: CharacterSheetModalCharacter
  open: boolean
  onOpenChange: (open: boolean) => void
  // A hero this player plays, in play: saves their standing orders for reactions, the whole set.
  onOrders?: (orders: Orders) => void
}
// Type guard for TurnCharacter
function isTurnCharacter(char: CharacterSheetModalCharacter): char is TurnCharacter {
  return typeof char === "object" && char !== null && "initiative" in char
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

export function CharacterSheetModal({ character, open, onOpenChange, onOrders }: CharacterSheetModalProps) {
  // The rules sheet, where the hero has one. It loads only while the window is open.
  const sheet = useSheetView(
    open ? character?.sheet : undefined,
    character?.hitPoints,
    character?.spellSlots,
    character?.spellEffects,
    character?.featureUses,
    character?.shape,
    character?.heroicInspiration
  )
  if (!character) return null
  // How the hero stands: their hit points from the sheet, or dying, Stable or dead. And their conditions in words.
  const standing = standingOf({ ...character, type: "pc" }, sheet)
  const conditions = conditionLabel(character)

  const getModifier = (score: number) => Math.floor((score - 10) / 2)
  const formatModifier = (modifier: number) => (modifier >= 0 ? `+${modifier}` : `${modifier}`)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fade-inw-full max-w-4xl sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-primary-900/95 via-primary-800/95 to-primary-900/95 border-primary-600">
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
              {sheet && (
                <div className="text-xs font-mono text-primary-200 uppercase tracking-wider">
                  Level {sheet.level} {sheet.speciesName} {sheet.className}
                  {sheet.subclassName ? ` · ${sheet.subclassName}` : ""} · {sheet.backgroundName}
                </div>
              )}

              {standing && (
                <div>
                  <label className="text-xs font-mono text-primary-200 uppercase tracking-wider">Hit Points</label>
                  {standing.kind === "hero" ? (
                    <div className="flex items-center gap-2">
                      <div className="">
                        {standing.hitPoints} / {standing.maximum}
                        {standing.temporary ? <span className="text-primary-200"> +{standing.temporary} Temporary</span> : null}
                        {sheet?.heroicInspiration ? <span className="text-primary-200"> · Heroic Inspiration</span> : null}
                      </div>
                      <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-red-500 transition-all duration-300"
                          style={{ width: `${(standing.hitPoints / Math.max(1, standing.maximum)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-red-300">{standingWords(standing).split(",")[0]}</span>
                      {standing.kind === "dying" && <DeathSaveMarks saves={standing} compact />}
                    </div>
                  )}
                </div>
              )}
              {conditions && (
                <div>
                  <label className="text-xs font-mono text-primary-200 uppercase tracking-wider">Conditions</label>
                  <div className="text-sm">{conditions}</div>
                </div>
              )}

              {character.effects && character.effects.length > 0 ? (
                <div>
                  <label className="text-xs font-mono text-primary-200 uppercase tracking-wider">Effects</label>
                  <ul>
                    {character.effects.map((effect, idx) => (
                      <li key={idx} className="mb-1">
                        <span className="font-bold">{effect.name}</span>: {effect.description} <span className="text-xs text-gray-400">({effect.duration} turns left)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-sm text-gray-400">No active effects.</div>
              )}
            </div>

            {sheet && (
              <div className="grid grid-cols-5 gap-2">
                {[
                  ["Armor Class", String(sheet.armorClass)],
                  ["Initiative", formatModifier(sheet.initiative)],
                  ["Speed", `${sheet.speed} ft.`],
                  ["Proficiency", formatModifier(sheet.proficiencyBonus)],
                  ["Perception", String(sheet.passivePerception)],
                  [`Hit Dice d${sheet.hitDie}`, `${Math.max(0, sheet.level - (character.hitDiceUsed ?? 0))} / ${sheet.level}`],
                ].map(([label, value]) => (
                  <div key={label} className="text-center p-2 bg-black/30 rounded border border-primary-700">
                    <div className="text-[10px] font-mono text-primary-200 uppercase leading-tight">{label}</div>
                    <div className="text-lg font-bold">{value}</div>
                  </div>
                ))}
              </div>
            )}

            {sheet?.spellcasting && (
              <div>
                <h3 className="text-lg font-display mb-3">Spellcasting</h3>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    ["Spell Save DC", String(sheet.spellcasting.saveDc)],
                    ["Spell Attack", formatModifier(sheet.spellcasting.attackBonus)],
                    ...sheet.spellcasting.slots.map((slot) => [`Level ${slot.level} Slots`, `${slot.left} / ${slot.total}`]),
                  ].map(([label, value]) => (
                    <div key={label} className="text-center p-2 bg-black/30 rounded border border-primary-700">
                      <div className="text-[10px] font-mono text-primary-200 uppercase leading-tight">{label}</div>
                      <div className="text-lg font-bold">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  {(
                    [
                      ["Cantrips", sheet.spellcasting.cantrips],
                      ["Prepared", sheet.spellcasting.prepared],
                      ["Rituals", sheet.spellcasting.rituals],
                    ] as const
                  )
                    .filter(([, names]) => names.length > 0)
                    .map(([label, names]) => (
                      <div key={label}>
                        <span className="text-xs font-mono text-primary-200 uppercase tracking-wider mr-2">{label}</span>
                        {names.join(", ")}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {sheet && <MagicItems items={sheet.items} />}

            {sheet && onOrders && (
              <StandingOrders key={character.name} rows={heroReactions(sheet.reactions, character.standingOrders)} onChange={(changed) => onOrders({ ...character.standingOrders, ...changed })} />
            )}

            {sheet && (
              <div>
                <h3 className="text-lg font-display mb-3">Saving Throws</h3>
                <div className="grid grid-cols-6 gap-2">
                  {sheet.abilities.map((ability) => (
                    <div key={ability.id} className={`text-center p-2 rounded border ${ability.saveProficient ? "bg-primary-700/50 border-primary-400" : "bg-black/30 border-primary-700"}`}>
                      <div className="text-xs font-mono text-primary-200 uppercase">{ability.id}</div>
                      <div className="text-sm font-bold">{formatModifier(ability.save)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            {sheet && sheet.features.length > 0 && (
              <div>
                <h3 className="text-lg font-display mb-2">Features</h3>
                <div className="flex flex-wrap gap-1">
                  {sheet.features.map((feature) => (
                    <span key={`${feature.from}-${feature.name}`} className="text-xs sm:text-sm text-primary-100 px-3 py-1 bg-primary-700/50 rounded">
                      {feature.name}
                      {feature.uses && (
                        <span className="text-primary-300">
                          {" "}
                          · {feature.uses.left} / {feature.uses.count} · {feature.uses.recharge}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {sheet && (
              <div>
                <h3 className="text-lg font-display mb-2">Skill Checks</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                  {sheet.skills.map((skill) => (
                    <div key={skill.id} className={`flex justify-between text-sm ${skill.proficient ? "text-white font-bold" : "text-primary-300"}`}>
                      <span>{skill.name}</span>
                      <span className="font-mono">{formatModifier(skill.bonus)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
        {/* Turn-specific info if available */}
        {isTurnCharacter(character) && (
          <div className="flex gap-4 items-center mt-2">
            <div className="text-xs font-mono text-primary-200 uppercase tracking-wider">
              Initiative: <span className="font-bold text-lg">{character.initiative}</span>
            </div>
            {character.isComplete && <div className="text-xs text-green-400 font-bold">Turn Complete</div>}
            {character.hasReplied && <div className="text-xs text-blue-400 font-bold">Replied</div>}
            {character.rollRequired && <div className="text-xs text-yellow-400 font-bold">Roll Required</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
