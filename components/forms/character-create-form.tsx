"use client"

import React, { useState } from "react"
import { textShadow } from "../typography/styles"
import StepChooseRace from "./step-choose-race"
import StepChooseArchetype from "./step-choose-archetype"
import StepEnterNameGender from "./step-enter-name-gender"
import StepCharacterImage from "./step-character-image"
import StepAssignAttributes, { Attributes } from "./step-assign-attributes"
import StepAppearanceBackground from "./step-appearance-background"
import StepPersonalityMotivationBackstory from "./step-personality-motivation-backstory"
import StepSkills from "./step-skills"
import StepEquipment from "./step-equipment"
import StepSpells from "./step-spells"
import StepSpecialAbilities from "./step-special-abilities"
import { CharacterCard } from "@/components/adventure-plans/character-card"
import { Button } from "../ui/button"
import { saveCharacterTemplateAction } from "@/app/_actions/save-character-template"
import { toast } from "sonner"
import type { PCTemplate, Character } from "@/types/character"
import { createAdventure } from "@/app/_actions/create-adventure"

interface CharacterCreateFormProps {
  availableRaces: string[]
  availableArchetypes?: string[]
  settingId: string
  adventurePlanId: string
}

const defaultAttributes: Attributes = {
  strength: "",
  dexterity: "",
  constitution: "",
  intelligence: "",
  wisdom: "",
  charisma: "",
}

export default function CharacterCreateForm({ availableRaces, availableArchetypes = [], settingId, adventurePlanId }: CharacterCreateFormProps) {
  const [step, setStep] = useState(1)
  const [selectedRace, setSelectedRace] = useState("")
  const [selectedArchetype, setSelectedArchetype] = useState("")
  const [name, setName] = useState("")
  const [gender, setGender] = useState("")
  const [attributes, setAttributes] = useState<Attributes>(defaultAttributes)
  const [appearance, setAppearance] = useState("")
  const [background, setBackground] = useState("")
  const [personality, setPersonality] = useState("")
  const [motivation, setMotivation] = useState("")
  const [backstory, setBackstory] = useState("")
  const [skills, setSkills] = useState<string[]>([""])
  const [equipment, setEquipment] = useState<string[]>([""])
  const [hasSpells, setHasSpells] = useState<boolean | undefined>(undefined)
  const [spells, setSpells] = useState<string[]>([""])
  const [hasSpecialAbilities, setHasSpecialAbilities] = useState<boolean | undefined>(undefined)
  const [specialAbilities, setSpecialAbilities] = useState<string[]>([""])
  const [isSaving, setIsSaving] = useState(false)
  const [image, setImage] = useState("")

  // Placeholder for future steps
  // const [selectedClass, setSelectedClass] = useState("")

  const handleNext = () => {
    console.log("CLICK NEXT: step", step, { hasSpells, hasSpecialAbilities, spells, specialAbilities })
    setStep((prev) => prev + 1)
  }
  const handleBack = () => {
    setStep((prev) => (prev > 1 ? prev - 1 : 1))
  }

  const handleAttributesChange = (attr: Partial<Attributes>) => {
    setAttributes((prev) => ({ ...prev, ...attr }))
  }

  const handleSaveCharacter = async () => {
    setIsSaving(true)
    try {
      const characterTemplate: PCTemplate = {
        id: Date.now().toString(),
        type: "pc",
        name,
        image,
        archetype: selectedArchetype,
        race: selectedRace,
        gender,
        appearance,
        personality,
        background,
        motivation,
        behavior: "",
        healthPercent: 100,
        equipment: equipment.filter((e) => e.trim() !== "").map((name) => ({ name })),
        skills: skills.filter((s) => s.trim() !== ""),
        spells: hasSpells ? spells.filter((s) => s.trim() !== "").map((name) => ({ name })) : [],
        specialAbilities: hasSpecialAbilities ? specialAbilities.filter((a) => a.trim() !== "") : [],
        effects: [],
        attributes: {
          strength: Number(attributes.strength) || 1,
          dexterity: Number(attributes.dexterity) || 1,
          constitution: Number(attributes.constitution) || 1,
          intelligence: Number(attributes.intelligence) || 1,
          wisdom: Number(attributes.wisdom) || 1,
          charisma: Number(attributes.charisma) || 1,
        },
      }
      const result = await saveCharacterTemplateAction({ character: characterTemplate })
      console.log("[CharacterCreateForm] saveCharacterTemplateAction result:", JSON.stringify(result, null, 2))
      if (result.success && result.characterId) {
        toast.success("Character saved!")
        // Now create the adventure with this character as the player
        const adventureResult = await createAdventure({
          settingId,
          adventurePlanId,
          characterChoices: [
            {
              characterId: result.characterId, // S3 path
              mode: "player",
            },
          ],
        })
        console.log("[CharacterCreateForm] createAdventure result:", JSON.stringify(adventureResult, null, 2))
        // createAdventure will redirect
      } else {
        toast.error(result.error || "Failed to save character")
      }
    } catch (err) {
      console.error("[CharacterCreateForm] Unexpected error:", err)
      toast.error("An unexpected error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  function updateReviewCharacter(updates: Partial<Character | PCTemplate>) {
    if ("name" in updates) setName(updates.name ?? "")
    if ("image" in updates) setImage(updates.image ?? "")
    if ("gender" in updates) setGender(updates.gender ?? "")
    if ("race" in updates) setSelectedRace(updates.race ?? "")
    if ("archetype" in updates) setSelectedArchetype(updates.archetype ?? "")
    if ("appearance" in updates) setAppearance(updates.appearance ?? "")
    if ("personality" in updates) setPersonality(updates.personality ?? "")
    if ("background" in updates) setBackground(updates.background ?? "")
    if ("motivation" in updates) setMotivation(updates.motivation ?? "")
    if ("attributes" in updates && updates.attributes)
      setAttributes({
        ...attributes,
        ...updates.attributes,
      })
    if ("skills" in updates && updates.skills) setSkills(updates.skills as string[])
    if ("equipment" in updates && updates.equipment) setEquipment((updates.equipment as { name: string }[]).map((e) => (typeof e === "string" ? e : e.name)))
    if ("spells" in updates && updates.spells) setSpells((updates.spells as { name: string }[]).map((e) => (typeof e === "string" ? e : e.name)))
    if ("specialAbilities" in updates && updates.specialAbilities) setSpecialAbilities(updates.specialAbilities as string[])
  }

  function getReviewCharacter(): Character | PCTemplate {
    return {
      id: "review",
      name,
      image,
      archetype: selectedArchetype,
      race: selectedRace,
      gender,
      appearance,
      personality,
      background,
      motivation,
      behavior: "",
      healthPercent: 100,
      equipment: equipment.filter((e) => e.trim() !== "").map((name) => ({ name })),
      skills: skills.filter((s) => s.trim() !== ""),
      spells: spells.filter((s) => s.trim() !== "").map((name) => ({ name })),
      specialAbilities: specialAbilities.filter((a) => a.trim() !== ""),
      effects: [],
      type: "pc",
      attributes: {
        strength: Number(attributes.strength) || 1,
        dexterity: Number(attributes.dexterity) || 1,
        constitution: Number(attributes.constitution) || 1,
        intelligence: Number(attributes.intelligence) || 1,
        wisdom: Number(attributes.wisdom) || 1,
        charisma: Number(attributes.charisma) || 1,
      },
    }
  }

  // Log step and key state for troubleshooting
  console.log("RENDER: step", step, { hasSpells, hasSpecialAbilities, spells, specialAbilities })

  return (
    <div className="h-full w-full px-8 pb-8 pt-24 flex flex-col items-center justify-center">
      <h1 style={textShadow} className="text-3xl font-display text-amber-300 mb-6 font-bold">
        Create Your Character
      </h1>
      {step === 1 && <StepChooseRace availableRaces={availableRaces} selectedRace={selectedRace} onSelect={setSelectedRace} onNext={handleNext} />}
      {step === 2 && (
        <StepChooseArchetype
          availableArchetypes={availableArchetypes}
          selectedArchetype={selectedArchetype}
          onSelect={setSelectedArchetype}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
        />
      )}
      {step === 3 && <StepEnterNameGender name={name} gender={gender} onNameChange={setName} onGenderChange={setGender} onNext={handleNext} onBack={step > 1 ? handleBack : undefined} />}
      {step === 4 && (
        <StepCharacterImage
          image={image}
          onImageChange={setImage}
          onImageRemove={() => setImage("")}
          settingId={settingId}
          adventurePlanId={adventurePlanId}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
        />
      )}
      {step === 5 && <StepAssignAttributes attributes={attributes} onChange={handleAttributesChange} onNext={handleNext} onBack={step > 1 ? handleBack : undefined} />}
      {step === 6 && (
        <StepAppearanceBackground
          appearance={appearance}
          background={background}
          onAppearanceChange={setAppearance}
          onBackgroundChange={setBackground}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
        />
      )}
      {step === 7 && (
        <StepPersonalityMotivationBackstory
          personality={personality}
          motivation={motivation}
          backstory={backstory}
          onPersonalityChange={setPersonality}
          onMotivationChange={setMotivation}
          onBackstoryChange={setBackstory}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
        />
      )}
      {step === 8 && <StepSkills skills={skills} onSkillsChange={setSkills} onNext={handleNext} onBack={step > 1 ? handleBack : undefined} />}
      {step === 9 && <StepEquipment equipment={equipment} onEquipmentChange={setEquipment} onNext={handleNext} onBack={step > 1 ? handleBack : undefined} />}
      {step === 10 && <StepSpells hasSpells={hasSpells} onHasSpellsChange={setHasSpells} spells={spells} onSpellsChange={setSpells} onNext={handleNext} onBack={step > 1 ? handleBack : undefined} />}
      {step === 11 && (
        <StepSpecialAbilities
          hasSpecialAbilities={hasSpecialAbilities}
          onHasSpecialAbilitiesChange={setHasSpecialAbilities}
          abilities={specialAbilities}
          onAbilitiesChange={setSpecialAbilities}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
        />
      )}
      {step === 12 && (
        <div className="w-full flex flex-col items-center gap-6">
          <h2 className="text-lg italic">Step 12: Review Your Character</h2>
          <CharacterCard
            charId="review"
            char={getReviewCharacter()}
            isNpcs={false}
            isSaving={false}
            settingId="review"
            adventurePlanId="review"
            uniqueKey="review"
            editing={true}
            onToggleEdit={() => {}}
            onRemove={() => {}}
            updateCharacter={(_charId, updates) => updateReviewCharacter(updates)}
            getCharacter={getReviewCharacter}
          />
          <div className="flex gap-4 justify-center mt-4">
            <Button type="button" variant="ghost" onClick={handleBack}>
              Back
            </Button>
            <Button type="button" variant="epic" onClick={handleSaveCharacter} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Character"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
