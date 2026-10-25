import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { compileAdventureSourceTree } from "@/lib/wiki-adventures/compiler"
import { migrateAdventurePlanToWikiSource } from "@/lib/wiki-adventures/myr-migration"
import type { AdventurePlan } from "@/types/adventure-plan"

const sourcePath = "wiki/sources/adventure plans/the_road_to_kordavos_adventure_plan.json"
const assetHost = "d20-public.s3.us-east-1.amazonaws.com"
const cloudfrontHost = "d1dkwd3w4hheqw.cloudfront.net"
const contentVersion = "2026-05-23T00-00-00Z-road-to-kordavos-migration"

const legacyPlan = JSON.parse(readFileSync(sourcePath, "utf8")) as AdventurePlan
const plan = repairLegacyPlan(legacyPlan)

const migration = migrateAdventurePlanToWikiSource(plan, {
  generatedAt: new Date("2026-05-23T00:00:00.000Z"),
  assetHost,
})

migration.report.warnings.push({
  code: "legacy-start-repaired",
  message: 'Set blank AdventurePlan.start to "well-met", the first authored encounter in The Road to Kordavos.',
  source: "AdventurePlan.start",
})
migration.report.sourceFieldMappings.push({
  source: "AdventurePlan.start",
  destination: "adventure.md frontmatter.startEncounter",
  note: 'Legacy source had a blank start field; migrated as "well-met".',
})

for (const file of migration.files) {
  mkdirSync(dirname(file.path), { recursive: true })
  writeFileSync(file.path, file.content)
}

const reportPath = `content/settings/${plan.settingId}/adventures/${plan.id}/migration-report.json`
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(migration.report, null, 2)}\n`)

const compiled = compileAdventureSourceTree(migration.files, {
  mode: "publish",
  contentVersion,
  allowedAssetHosts: [assetHost, cloudfrontHost],
})

if (compiled.validationReport.status === "blocked") {
  console.error(JSON.stringify(compiled.validationReport, null, 2))
  throw new Error("The Road to Kordavos migration did not pass publish validation")
}

console.log(`Migrated ${migration.files.length} source files plus ${reportPath}`)
console.log(`Publish validation: ${compiled.validationReport.status}`)

function repairLegacyPlan(input: AdventurePlan): AdventurePlan {
  const plan = structuredClone(input) as AdventurePlan & { start?: string }
  plan.start = "well-met"
  return plan
}
