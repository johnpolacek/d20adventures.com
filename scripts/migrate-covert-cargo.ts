import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { compileAdventureSourceTree } from "@/lib/wiki-adventures/compiler"
import { migrateAdventurePlanToWikiSource } from "@/lib/wiki-adventures/myr-migration"
import type { AdventurePlan } from "@/types/adventure-plan"

const sourcePath = "wiki/sources/adventure plans/covert-cargo.json"
const assetHost = "d20-public.s3.us-east-1.amazonaws.com"
const cloudfrontHost = "d1dkwd3w4hheqw.cloudfront.net"
const contentVersion = "2026-05-23T00-00-00Z-covert-cargo-migration"

const legacyPlan = JSON.parse(readFileSync(sourcePath, "utf8")) as AdventurePlan
const plan = repairLegacyPlan(legacyPlan)

const migration = migrateAdventurePlanToWikiSource(plan, {
  generatedAt: new Date("2026-05-23T00:00:00.000Z"),
  assetHost,
})

migration.report.warnings.push({
  code: "legacy-start-repaired",
  message: 'Set missing AdventurePlan.start to "the-shipment", the first authored encounter in Covert Cargo.',
  source: "AdventurePlan.start",
})
migration.report.warnings.push({
  code: "legacy-transition-dropped",
  message: 'Dropped an empty transition target from "the-shipment"; the legacy condition and encounter fields were incomplete.',
  source: "sections[0].scenes[0].encounters[the-shipment].transitions",
})
migration.report.sourceFieldMappings.push({
  source: "AdventurePlan.start",
  destination: "adventure.md frontmatter.startEncounter",
  note: 'Legacy source omitted start; migrated as "the-shipment".',
})

for (const file of migration.files) {
  file.content = quoteNumericPremadeFrontmatterIds(file.content)
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
  throw new Error("Covert Cargo migration did not pass publish validation")
}

console.log(`Migrated ${migration.files.length} source files plus ${reportPath}`)
console.log(`Publish validation: ${compiled.validationReport.status}`)

function repairLegacyPlan(input: AdventurePlan): AdventurePlan {
  const plan = structuredClone(input) as AdventurePlan & { start?: string }
  plan.start = "the-shipment"

  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        encounter.transitions = (encounter.transitions ?? []).filter((transition) => transition.encounter.trim().length > 0)
      }
    }
  }

  return plan
}

function quoteNumericPremadeFrontmatterIds(content: string) {
  return content.replace(/^ {2}- (\d+)$/gm, '  - "$1"')
}
