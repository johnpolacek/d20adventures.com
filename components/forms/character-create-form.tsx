"use client"

import { useParams, useSearchParams } from "next/navigation"
import { useState } from "react"
import slugify from "slugify"
import { toast } from "sonner"
import { joinAdventure } from "@/app/_actions/join-adventure"
import { saveCharacterTemplateAction } from "@/app/_actions/save-character-template"
import { CharacterCard } from "@/components/adventure-plans/character-card"
import { cn } from "@/lib/utils"
import type { Character, PCTemplate } from "@/types/character"
import { textShadow } from "../typography/styles"
import { Button } from "../ui/button"
import StepAppearanceBackground from "./step-appearance-background"
import StepAssignAttributes, { type Attributes } from "./step-assign-attributes"
import StepCharacterImage from "./step-character-image"
import StepChooseArchetype from "./step-choose-archetype"
import StepChooseRace from "./step-choose-race"
import StepEnterNameGender from "./step-enter-name-gender"
import StepEquipment from "./step-equipment"
import StepPersonalityMotivationBackstory from "./step-personality-motivation-backstory"
import StepSkills from "./step-skills"
import StepSpecialAbilities from "./step-special-abilities"
import StepSpells, { type SpellFormValue } from "./step-spells"

interface CharacterCreateFormProps {
  availableRaces: string[]
  availableArchetypes?: string[]
  settingId: string
  adventurePlanId: string
  className?: string
}

const defaultAttributes: Attributes = {
  strength: "",
  dexterity: "",
  constitution: "",
  intelligence: "",
  wisdom: "",
  charisma: "",
}

export default function CharacterCreateForm({ availableRaces, availableArchetypes = [], settingId, adventurePlanId, className }: CharacterCreateFormProps) {
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
  const [spells, setSpells] = useState<SpellFormValue[]>([{ name: "", description: "" }])
  const [hasSpecialAbilities, setHasSpecialAbilities] = useState<boolean | undefined>(undefined)
  const [specialAbilities, setSpecialAbilities] = useState<string[]>([""])
  const [isSaving, setIsSaving] = useState(false)
  const [image, setImage] = useState("")
  const searchParams = useSearchParams()
  const params = useParams()

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
    console.log("[CharacterCreateForm] Starting save character process")
    setIsSaving(true)
    try {
      const slug = slugify(name, { lower: true, strict: true })
      console.log("[CharacterCreateForm] Generated slug:", slug)

      const characterTemplate: PCTemplate = getReviewCharacter()
      console.log("[CharacterCreateForm] Character template to save:", JSON.stringify(characterTemplate, null, 2))

      console.log("[CharacterCreateForm] Calling saveCharacterTemplateAction...")
      const result = await saveCharacterTemplateAction({ character: characterTemplate })
      console.log("[CharacterCreateForm] Save result:", JSON.stringify(result, null, 2))

      if (result.success && result.characterId) {
        console.log("[CharacterCreateForm] Character saved successfully")
        toast.success("Character saved!")

        // Check if we should automatically join an adventure
        const redirectTo = searchParams.get("redirectToAdventure")
        console.log("[CharacterCreateForm] Redirect target:", redirectTo)
        console.log("[CharacterCreateForm] All search params:", JSON.stringify(Object.fromEntries(searchParams.entries()), null, 2))
        console.log("[CharacterCreateForm] All URL params:", JSON.stringify(params, null, 2))

        if (redirectTo) {
          console.log("[CharacterCreateForm] Processing redirectToAdventure:", redirectTo)

          // Extract adventure info from the redirect URL
          const urlParts = redirectTo.split("/")
          console.log("[CharacterCreateForm] URL parts:", JSON.stringify(urlParts, null, 2))

          // biome-ignore lint/complexity/useIndexOf: params.adventureId is ParamValue (string | string[] | undefined); indexOf requires a string argument
          const adventureIdIndex = urlParts.findIndex((part) => part === params.adventureId)
          console.log("[CharacterCreateForm] Adventure ID from params:", params.adventureId)
          console.log("[CharacterCreateForm] Adventure ID index in URL:", adventureIdIndex)

          // Also try to extract adventure ID from the URL parts directly
          const adventureIdFromUrl = urlParts[urlParts.length - 1] // Last part should be adventure ID
          console.log("[CharacterCreateForm] Adventure ID from URL (last part):", adventureIdFromUrl)

          // Extract adventure plan ID from URL (should be the 3rd part: /settings/settingId/adventurePlanId/adventureId)
          const adventurePlanIdFromUrl = urlParts[3] // 4th part (0-indexed) should be adventure plan ID
          console.log("[CharacterCreateForm] Adventure Plan ID from URL:", adventurePlanIdFromUrl)

          // Try to get adventure ID from params first, then from URL
          const adventureId = (params.adventureId as string) || adventureIdFromUrl
          console.log("[CharacterCreateForm] Final adventure ID to use:", adventureId)

          // Use the adventure plan ID from URL instead of the prop
          const correctAdventurePlanId = adventurePlanIdFromUrl || adventurePlanId
          console.log("[CharacterCreateForm] Correct adventure plan ID:", correctAdventurePlanId)

          if (adventureId) {
            console.log("[CharacterCreateForm] Auto-joining adventure with new character...")
            console.log(
              "[CharacterCreateForm] Join adventure parameters:",
              JSON.stringify(
                {
                  settingId,
                  adventurePlanId: correctAdventurePlanId,
                  adventureId: adventureId,
                  characterId: result.characterId,
                },
                null,
                2
              )
            )

            try {
              // Auto-join the adventure with the newly created character
              await joinAdventure({
                settingId: settingId,
                adventurePlanId: correctAdventurePlanId,
                adventureId: adventureId,
                characterId: result.characterId,
              })
              console.log("[CharacterCreateForm] Auto-join successful, redirecting...")
              // joinAdventure will handle the redirect
            } catch (error) {
              console.error("[CharacterCreateForm] Failed to auto-join adventure:", JSON.stringify(error, null, 2))
              console.error("[CharacterCreateForm] Error stack:", error instanceof Error ? error.stack : "No stack trace")
              toast.error("Character saved but failed to join adventure. Please join manually.")
              window.location.href = redirectTo
            }
          } else {
            console.log("[CharacterCreateForm] Could not parse adventure info, falling back to redirect")
            console.log("[CharacterCreateForm] Adventure ID not found in URL or params")
            // Fallback to redirect if we can't parse the adventure info
            window.location.href = redirectTo
          }
        } else {
          window.location.href = "/player"
        }
      } else {
        console.error("[CharacterCreateForm] Save failed:", result.error)
        toast.error(result.error || "Failed to save character")
      }
    } catch (err) {
      console.error("[CharacterCreateForm] Unexpected error:", JSON.stringify(err, null, 2))
      console.error("[CharacterCreateForm] Error stack:", err instanceof Error ? err.stack : "No stack trace")
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
    if ("spells" in updates && updates.spells) setSpells((updates.spells as SpellFormValue[]).map((s) => ({ name: s.name, description: s.description })))
    if ("specialAbilities" in updates && updates.specialAbilities) setSpecialAbilities(updates.specialAbilities as string[])
  }

  function getReviewCharacter(): PCTemplate {
    const slug = slugify(name, { lower: true, strict: true })
    return {
      id: slug,
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
      spells: spells.filter((s) => s.name.trim() !== "").map((s) => ({ name: s.name, description: s.description })),
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
    <div className={cn("h-full w-full px-8 pb-8 pt-24 flex flex-col items-center justify-center", className)}>
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
      {step === 5 && (
        <StepAssignAttributes
          attributes={attributes}
          onChange={handleAttributesChange}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
          archetype={selectedArchetype}
          race={selectedRace}
        />
      )}
      {step === 6 && (
        <StepAppearanceBackground
          appearance={appearance}
          background={background}
          onAppearanceChange={setAppearance}
          onBackgroundChange={setBackground}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
          race={selectedRace}
          archetype={selectedArchetype}
          name={name}
          attributes={attributes}
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
          race={selectedRace}
          archetype={selectedArchetype}
          attributes={attributes}
          appearance={appearance}
          background={background}
        />
      )}
      {step === 8 && (
        <StepSkills
          skills={skills}
          onSkillsChange={setSkills}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
          race={selectedRace}
          archetype={selectedArchetype}
          attributes={attributes}
          appearance={appearance}
          background={background}
          personality={personality}
          motivation={motivation}
          backstory={backstory}
        />
      )}
      {step === 9 && (
        <StepEquipment
          equipment={equipment}
          onEquipmentChange={setEquipment}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
          race={selectedRace}
          archetype={selectedArchetype}
          attributes={attributes}
          appearance={appearance}
          background={background}
          personality={personality}
          motivation={motivation}
          backstory={backstory}
          skills={skills}
        />
      )}
      {step === 10 && (
        <StepSpells
          hasSpells={hasSpells}
          onHasSpellsChange={setHasSpells}
          spells={spells}
          onSpellsChange={setSpells}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
          race={selectedRace}
          archetype={selectedArchetype}
          attributes={attributes}
          appearance={appearance}
          background={background}
          personality={personality}
          motivation={motivation}
          backstory={backstory}
          skills={skills}
          equipment={equipment}
        />
      )}
      {step === 11 && (
        <StepSpecialAbilities
          hasSpecialAbilities={hasSpecialAbilities}
          onHasSpecialAbilitiesChange={setHasSpecialAbilities}
          abilities={specialAbilities}
          onAbilitiesChange={setSpecialAbilities}
          onNext={handleNext}
          onBack={step > 1 ? handleBack : undefined}
          race={selectedRace}
          archetype={selectedArchetype}
          attributes={attributes}
          appearance={appearance}
          background={background}
          personality={personality}
          motivation={motivation}
          backstory={backstory}
          skills={skills}
          equipment={equipment}
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
