// Dev-only mock of the stage-first turn page (Stageview phase 4): March of Davos, "The Gates of Kordavos", with scripted
// GM turns and beats, no Convex and no model. Gated to development: notFound() elsewhere.

import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { TurnMock } from "./turn-mock"

export default function TurnMockPage() {
  if (!isDev()) notFound()
  return <TurnMock />
}
