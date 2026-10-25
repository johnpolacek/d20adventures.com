// Dev-only stage art lab (lab/stage-art). Gated to development: notFound() elsewhere.

import { notFound } from "next/navigation"
import { LabViewer } from "@/lab/stage-art/viewer"
import { isDev } from "@/lib/auth-utils"

export default async function StageLabPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isDev()) notFound()
  return <LabViewer params={await searchParams} />
}
