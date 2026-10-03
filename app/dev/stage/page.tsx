// Dev-only Stageview preview.
//
//   /dev/stage                                              -> the first set, with its first staging
//   /dev/stage?set=realm-of-myr/kordavos-south-gate         -> a named set
//   /dev/stage?staging=march-of-davos/the-gates-of-kordavos -> a staging (and its set)
//   &staging=none  &shot=party  &tier=mobile|balanced|high|ultra
//   &crowd=procedural|cards|hybrid  &aa=off|fxaa|msaa  &ao=on|off  &paint=uniform|depth  &bloom=on|off  &dpr=2  &motion=0
//
// Gated to development: notFound() elsewhere.

import { SETS, STAGINGS } from "@d20/stage/sets"
import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { StageViewer } from "./stage-viewer"

type Params = Record<string, string | undefined>

export default async function StagePage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!isDev()) notFound()
  const p = await searchParams
  const stagingKey = p.staging === "none" ? null : p.staging && STAGINGS[p.staging] ? p.staging : (Object.keys(STAGINGS)[0] ?? null)
  const setKey = p.set && SETS[p.set] ? p.set : (Object.keys(SETS)[0] ?? null)
  if (!setKey) notFound()
  return <StageViewer setKey={setKey} stagingKey={stagingKey} params={p} sets={Object.keys(SETS)} stagings={Object.keys(STAGINGS)} />
}
