import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { compileAdventureSourceTree } from "@/lib/wiki-adventures/compiler"
import { migrateAdventurePlanToWikiSource } from "@/lib/wiki-adventures/myr-migration"
import type { AdventurePlan } from "@/types/adventure-plan"

const sourcePath = "wiki/sources/adventure plans/the-midnight-summons.json"
const assetHost = "d20-public.s3.us-east-1.amazonaws.com"

const legacyPlan = JSON.parse(readFileSync(sourcePath, "utf8")) as AdventurePlan
const plan = repairLegacyPlan(legacyPlan)

const migration = migrateAdventurePlanToWikiSource(plan, {
  generatedAt: new Date("2026-05-22T00:00:00.000Z"),
  assetHost,
})

migration.report.warnings.push({
  code: "legacy-transition-repaired",
  message: 'Repaired transition target "broken-silence -> wollandora-intervention" to "broken-silence -> timely-rescue"; timely-rescue is the authored Wollandora intervention encounter.',
  source: "sections[0].scenes[0].encounters[broken-silence].transitions",
})
migration.report.sourceFieldMappings.push({
  source: "Encounter.broken-silence.transitions[wollandora-intervention]",
  destination: "encounters/broken-silence.md ## Transitions [[encounter:timely-rescue]]",
  note: "Legacy slug did not exist; repaired to the existing Wollandora rescue encounter.",
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
  contentVersion: "2026-05-22T00-00-00Z-midnight-migration",
  allowedAssetHosts: [assetHost],
})

if (compiled.validationReport.status === "blocked") {
  console.error(JSON.stringify(compiled.validationReport, null, 2))
  throw new Error("The Midnight Summons migration did not pass publish validation")
}

console.log(`Migrated ${migration.files.length} source files plus ${reportPath}`)
console.log(`Publish validation: ${compiled.validationReport.status}`)

function repairLegacyPlan(input: AdventurePlan): AdventurePlan {
  const plan = structuredClone(input) as AdventurePlan & { start?: string }
  plan.start = plan.start ?? "broken-silence"

  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        for (const transition of encounter.transitions ?? []) {
          if (encounter.id === "broken-silence" && transition.encounter === "wollandora-intervention") {
            transition.encounter = "timely-rescue"
            transition.condition = transition.condition.replace("wollandora-intervention", "timely-rescue")
          }
          if (encounter.id === "broken-silence" && transition.encounter === "owlbear-confrontation") {
            transition.condition = `${transition.condition} Also, if Thalbern detects the approaching creature but does not successfully hide, evade, or withdraw, advance to owlbear-confrontation so the Owlbear enters the encounter.`
          }
        }
        if (encounter.id === "broken-silence") {
          encounter.instructions = `${encounter.instructions}\n\nMigration clarification: a successful Perception roll reveals the approaching threat, but it does not complete the encounter by itself. If Thalbern investigates, advances, stands his ground, readies a weapon, or otherwise does not successfully hide or evade after detecting the creature, transition to owlbear-confrontation so the Owlbear enters the active encounter as an NPC.`
        }
      }
    }
  }

  return plan
}
