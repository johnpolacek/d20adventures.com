import { redirect } from "next/navigation"

export default async function AdminAdventurePlansDetailRedirectPage(props: { params: Promise<{ settingId: string; planId: string }> }) {
  const { settingId, planId } = await props.params

  redirect(`/admin/wiki-adventures/${settingId}/${planId}`)
}
