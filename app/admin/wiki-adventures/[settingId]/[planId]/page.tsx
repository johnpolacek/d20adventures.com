import { redirect } from "next/navigation"

export default async function AdminWikiAdventureDetailRedirectPage(props: { params: Promise<{ settingId: string; planId: string }> }) {
  const { settingId, planId } = await props.params

  redirect(`/admin/adventures-plans/${settingId}/${planId}`)
}
