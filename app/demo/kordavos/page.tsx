// Public demo of the stage-first turn page: "The Gates of Kordavos" from March of Davos, scripted (no account, no
// Convex, no model calls), for sharing and feedback. The same mock as /dev/turn, which stays dev-only.

import type { Metadata } from "next"
import { TurnMock } from "@/app/dev/turn/turn-mock"

export const metadata: Metadata = {
  title: "The Gates of Kordavos · D20 Adventures demo",
  description: "A scripted preview of D20 Adventures' new stage: the party meets in line at the gates of Kordavos.",
  robots: { index: false, follow: false },
}

export default function KordavosDemoPage() {
  return <TurnMock demo />
}
