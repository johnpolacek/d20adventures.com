import { SettingEditForm } from "@/components/settings/setting-edit-form"
import { canManageResource } from "@/lib/content-permissions"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { Setting } from "@/types/setting"
import { auth } from "@clerk/nextjs/server"

export default async function SettingEditPage(props: { params: Promise<{ settingId: string }> }) {
  const { userId } = await auth()
  if (!userId) {
    return <div>Unauthorized</div>
  }

  const { settingId } = await props.params

  const key = `settings/${settingId}/setting-data.json`

  let setting: Setting | null = null
  try {
    setting = (await readJsonFromS3(key)) as Setting
  } catch (err) {
    console.error("[SettingEditPage] Error fetching JSON from S3:", err)
    return <div>Error loading setting data.</div>
  }

  if (!setting) {
    console.error("[SettingEditPage] Setting is null after loading")
    return <div>Setting data is empty.</div>
  }

  if (!canManageResource(userId, setting)) {
    return <div>Access Denied</div>
  }

  return (
    <div className="flex flex-col relative bg-gray-900 text-white mt-4">
      <SettingEditForm setting={setting} settingId={settingId} />
    </div>
  )
}
