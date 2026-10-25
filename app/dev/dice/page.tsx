// Dev-only lab for the d20 and its roll: several takes side by side, to pick one for the stage's roll card.
// Gated to development: notFound() elsewhere.

import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { DiceLab } from "./dice-lab"

export default function DicePage() {
  if (!isDev()) notFound()
  return <DiceLab />
}
