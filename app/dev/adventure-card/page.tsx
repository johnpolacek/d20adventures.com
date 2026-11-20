// Dev-only design exploration for the saved adventure card: wide layouts, one per row. Gated to development.

import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { AdventureCardLab } from "./adventure-card-lab"

export default function AdventureCardPage() {
  if (!isDev()) notFound()
  return <AdventureCardLab />
}
