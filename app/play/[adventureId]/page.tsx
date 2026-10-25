import { auth } from "@clerk/nextjs/server"
import { notFound, redirect } from "next/navigation"
import { HostedPlay } from "@/components/hosted/hosted-play"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccess } from "@/lib/adventure-access"

export const dynamic = "force-dynamic"

// A hosted game for its players: the stage-first play view, with the GM run by the host's desktop app.
export default async function HostedPlayPage(props: { params: Promise<{ adventureId: string }> }) {
  const { adventureId } = await props.params
  const { userId } = await auth()
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/play/${adventureId}`)}`)
  const adventure = await assertAdventureAccess(userId, adventureId as Id<"adventures">).catch(() => null)
  if (!adventure) notFound()
  if (!adventure.host) redirect(`/settings/${adventure.settingId}/${adventure.planId}/${adventure._id}`)
  return <HostedPlay adventureId={adventure._id} />
}
