import { readJsonFromS3 } from "@/lib/s3-utils"
import { Setting } from "@/types/setting"
import { SettingEditForm } from "@/components/settings/setting-edit-form"

export default async function SettingEditPage(props: { params: Promise<{ settingId: string }> }) {
  const { settingId } = await props.params
  console.log("[SettingEditPage] Loading setting edit page for ID:", settingId)

  const key = `settings/${settingId}/setting-data.json`
  console.log("[SettingEditPage] Loading setting from S3 key:", key)

  let setting: Setting | null = null
  try {
    setting = (await readJsonFromS3(key)) as Setting
    console.log("[SettingEditPage] Successfully loaded setting:", {
      name: setting.name,
      hasLocations: setting.locations?.length > 0,
      settingKeys: Object.keys(setting),
    })
  } catch (err) {
    console.error("[SettingEditPage] Error fetching JSON from S3:", err)
    return <div>Error loading setting data.</div>
  }

  if (!setting) {
    console.error("[SettingEditPage] Setting is null after loading")
    return <div>Setting data is empty.</div>
  }

  console.log("[SettingEditPage] Rendering SettingEditForm component")
  return (
    <div className="flex flex-col relative bg-gray-900 text-white mt-4">
      <SettingEditForm setting={setting} settingId={settingId} />
    </div>
  )
}
