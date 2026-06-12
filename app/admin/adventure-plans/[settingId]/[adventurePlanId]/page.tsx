import { redirect } from "next/navigation"

type AdminAdventurePlanRedirectPageProps = {
  params: Promise<{
    settingId: string
    adventurePlanId: string
  }>
}

export default async function AdminAdventurePlanRedirectPage({ params }: AdminAdventurePlanRedirectPageProps) {
  const { settingId, adventurePlanId } = await params

  redirect(`/admin/wiki-adventures/${settingId}/${adventurePlanId}`)
}
