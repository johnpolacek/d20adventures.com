"use client"

import * as React from "react"
import { Setting } from "@/types/setting"
import { Button } from "@/components/ui/button"
import { SettingFormHeader } from "./setting-form-header"
import { SettingBasicInfo } from "./setting-basic-info"
import { SettingLocations } from "./setting-locations"
import { useSettingForm } from "@/components/settings/hooks/use-setting-form"
import { toast } from "sonner"

export function SettingEditForm({ setting, settingId }: { setting: Setting; settingId: string }) {
  console.log(
    "[SettingEditForm] Component mounted with:",
    JSON.stringify(
      {
        settingId,
        settingName: setting?.name,
        hasLocations: setting?.locations?.length > 0,
        settingKeys: setting ? Object.keys(setting) : "no setting",
      },
      null,
      2
    )
  )

  const {
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
  } = useSettingForm(setting, settingId)

  console.log(
    "[SettingEditForm] Hook returned state:",
    JSON.stringify(
      {
        name,
        hasDescription: !!description,
        hasImage: !!image,
        locationsCount: locations?.length || 0,
        isSaving,
      },
      null,
      2
    )
  )

  // Image handlers with auto-save
  const handleImageChange = async (newUrl: string) => {
    setImage(newUrl)
    if (newUrl) {
      await saveSetting(newUrl)
    }
  }

  const handleImageRemove = async () => {
    setImage("")
    await saveSetting("")
  }

  // Download handler
  const handleDownload = () => {
    const currentSetting: Setting = {
      name,
      description,
      genre,
      image,
      technology,
      magic,
      locations,
      isPublic,
    }

    const jsonData = JSON.stringify(currentSetting, null, 2)
    const blob = new Blob([jsonData], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_setting.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success("Setting downloaded successfully!")
  }

  console.log("[SettingEditForm] About to render, checking components...")

  // Add a simple fallback UI to ensure we can see something
  if (!setting) {
    console.error("[SettingEditForm] No setting data provided")
    return <div className="p-8 text-white">Error: No setting data provided</div>
  }

  try {
    console.log("[SettingEditForm] Rendering form components...")

    return (
      <div className="pt-12 flex flex-col h-[90vh] text-white">
        <SettingFormHeader settingId={settingId} settingName={setting.name} isSaving={isSaving} onDownload={handleDownload} onSave={() => saveSetting()} />

        <div
          id="setting-main"
          className="pt-2 pr-3 -mr-3 h-full w-full overflow-y-auto [scrollbar-width:thin] [scrollbar-color:dimgray_black] [&::-webkit-scrollbar-track]:bg-black [&::-webkit-scrollbar-thumb]:bg-black [&::-webkit-scrollbar]:w-1"
        >
          <div className="max-w-5xl mx-auto">
            <SettingBasicInfo
              settingId={settingId}
              name={name}
              description={description}
              genre={genre}
              image={image}
              technology={technology}
              magic={magic}
              isPublic={isPublic}
              isSaving={isSaving}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onGenreChange={setGenre}
              onImageChange={handleImageChange}
              onImageRemove={handleImageRemove}
              onTechnologyChange={setTechnology}
              onMagicChange={setMagic}
              onIsPublicChange={setIsPublic}
            />

            <SettingLocations settingId={settingId} locations={locations} isSaving={isSaving} onLocationsChange={setLocations} />

            <div className="flex flex-col items-end gap-4 mt-8 px-4 pb-8">
              <Button variant="epic" size="sm" onClick={() => saveSetting()} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  } catch (error) {
    console.error("[SettingEditForm] Error rendering components:", error)
    return (
      <div className="p-8 text-white bg-red-900">
        <h2>Rendering Error</h2>
        <p>Error: {error instanceof Error ? error.message : "Unknown error"}</p>
        <p>Setting ID: {settingId}</p>
        <p>Setting Name: {setting?.name || "No name"}</p>
      </div>
    )
  }
}
