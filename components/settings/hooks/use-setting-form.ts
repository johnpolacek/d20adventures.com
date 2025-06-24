import { useState, useCallback } from "react"
import { Setting, Location } from "@/types/setting"
import { updateSettingAction } from "@/app/_actions/setting-actions"
import { toast } from "sonner"

export function useSettingForm(initialSetting: Setting, settingId: string) {

  const [name, setName] = useState(initialSetting.name)
  const [description, setDescription] = useState(initialSetting.description)
  const [genre, setGenre] = useState(initialSetting.genre)
  const [image, setImage] = useState(initialSetting.image)
  const [technology, setTechnology] = useState(initialSetting.technology)
  const [magic, setMagic] = useState(initialSetting.magic)
  const [locations, setLocations] = useState<Location[]>(initialSetting.locations)
  const [isPublic, setIsPublic] = useState(initialSetting.isPublic)
  const [isSaving, setIsSaving] = useState(false)

  const saveSetting = useCallback(async (imageOverride?: string) => {
    setIsSaving(true)
    try {
      const settingData: Setting = {
        name,
        description,
        genre,
        image: imageOverride !== undefined ? imageOverride : image,
        technology,
        magic,
        locations,
        isPublic,
      }
      
      const result = await updateSettingAction({
        setting: settingData,
        settingId
      })

      if (result.success) {
        toast.success(result.message || "Setting saved successfully!")
      } else {
        console.error("Server action failed:", result.error)
        toast.error(result.error || "Failed to save setting. Please try again.")
      }
    } catch (error) {
      console.error("Error calling updateSettingAction:", error)
      toast.error("Failed to save setting. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }, [settingId, name, description, genre, image, technology, magic, locations, isPublic])

  return {
    name,
    setName,
    description,
    setDescription,
    genre,
    setGenre,
    image,
    setImage,
    technology,
    setTechnology,
    magic,
    setMagic,
    locations,
    setLocations,
    isPublic,
    setIsPublic,
    isSaving,
    saveSetting,
  }
} 