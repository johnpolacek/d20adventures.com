import CharacterCreateForm from "@/components/forms/character-create-form"
import FullPageImage from "@/components/layout/fullpage-image"

export default function NewCharacterPage() {
  // TODO: Replace with real data fetching for these props
  const availableRaces = ["Human", "Elf", "Dwarf", "Halfling"]
  const availableArchetypes = ["Fighter", "Wizard", "Rogue", "Cleric"]
  const settingId = "realm-of-myr"
  const adventurePlanId = "default-plan"

  return (
    <FullPageImage>
      <div className="max-w-3xl mx-auto py-12 relative z-10">
        <CharacterCreateForm
          availableRaces={availableRaces}
          availableArchetypes={availableArchetypes}
          settingId={settingId}
          adventurePlanId={adventurePlanId}
          className="rounded-lg bg-black/50 ring-8 ring-black/30 border border-white/10 p-8 mt-24"
        />
      </div>
    </FullPageImage>
  )
}
