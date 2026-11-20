// Dev-only lab for the game's sounds: every cue at its level, and the ambience beds. Gated to development.

import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { SoundLab } from "./sound-lab"

export default function SoundPage() {
  if (!isDev()) notFound()
  return <SoundLab />
}
