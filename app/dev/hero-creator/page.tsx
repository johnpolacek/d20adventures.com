// Dev-only: the hero creator with no host behind it, to look at its three steps. The story is canned.
// Gated to development: notFound() elsewhere.

import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { HeroCreatorLab } from "./hero-creator-lab"

export default function HeroCreatorPage() {
  if (!isDev()) notFound()
  return <HeroCreatorLab />
}
