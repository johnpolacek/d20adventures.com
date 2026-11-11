import { srdAttribution } from "../../src/attribution"
import { inOfficial, pageOf } from "../lib/official"
import type { Report } from "../lib/report"

export default function verify(report: Report) {
  const failures: string[] = []
  if (!inOfficial(srdAttribution)) failures.push("the attribution statement is not the wording in the official text")
  else if (pageOf(srdAttribution) !== 1) failures.push("the attribution statement is not on page 1")
  report.check("attribution", "statement matches the official wording", 1, failures)
}
