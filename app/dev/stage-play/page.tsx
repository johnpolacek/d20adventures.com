// Dev-only: the play screen (apps/desktop/src/stage-play.tsx, which the desktop app and the website's /play page both
// show) stepped through the opening of The Midnight Summons from a saved game, a save at a time: Thalbern hides in the
// ferns, the Owlbear comes out of the tree line, moves about, and moves on. No Convex and no model.
//
//   /dev/stage-play?step=2
//
// Gated to development: notFound() elsewhere.

import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { StagePlayMock } from "./stage-play-mock"

export default async function StagePlayPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  if (!isDev()) notFound()
  const { step } = await searchParams
  return <StagePlayMock start={Number(step ?? 0) || 0} />
}
