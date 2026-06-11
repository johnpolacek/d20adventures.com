import type { ValidationFinding, ValidationMode, ValidationReport, ValidationSeverity } from "./types"

export function createValidationReport(mode: ValidationMode, findings: ValidationFinding[]): ValidationReport {
  const errorCount = findings.filter((finding) => finding.severity === "error").length
  const warningCount = findings.filter((finding) => finding.severity === "warning").length
  const suggestionCount = findings.filter((finding) => finding.severity === "suggestion").length
  return {
    mode,
    status: errorCount > 0 ? "blocked" : warningCount > 0 ? "passedWithWarnings" : "passed",
    summary: {
      errorCount,
      warningCount,
      suggestionCount,
    },
    findings,
  }
}

export function modeSeverity(mode: ValidationMode, publishSeverity: ValidationSeverity, draftSeverity: ValidationSeverity = "warning"): ValidationSeverity {
  return mode === "publish" ? publishSeverity : draftSeverity
}
