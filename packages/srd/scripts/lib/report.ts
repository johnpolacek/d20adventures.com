/** One named check and what it found. */
type Result = { category: string; check: string; total: number; failures: string[]; waived: string[] }

/**
 * Collects check results. A check passes only with no failures. A waiver is a known, explained difference: it
 * is printed every run and never counts as a pass in silence.
 */
export class Report {
  private results: Result[] = []

  /**
   * Record a check. `total` is how many things were compared. `failures` are plain sentences naming the entry and
   * the difference. `waived` are differences accepted for a stated reason, each written as "entry: reason".
   */
  check(category: string, check: string, total: number, failures: string[], waived: string[] = []) {
    if (total === 0) failures = [...failures, "nothing was compared"]
    this.results.push({ category, check, total, failures, waived })
  }

  get failed() {
    return this.results.some((result) => result.failures.length > 0)
  }

  print(verbose = false) {
    let category = ""
    for (const result of this.results) {
      if (result.category !== category) {
        category = result.category
        console.log(`\n${category}`)
      }
      const mark = result.failures.length ? "✗" : "✓"
      const waived = result.waived.length ? `, ${result.waived.length} waived` : ""
      console.log(`  ${mark} ${result.check} (${result.total - result.failures.length}/${result.total}${waived})`)
      const shown = verbose ? result.failures : result.failures.slice(0, 15)
      for (const failure of shown) console.log(`      ${failure}`)
      if (shown.length < result.failures.length) console.log(`      … ${result.failures.length - shown.length} more (run with --verbose)`)
      if (verbose) for (const waiver of result.waived) console.log(`      waived: ${waiver}`)
    }
    const checks = this.results.length
    const bad = this.results.filter((result) => result.failures.length).length
    const waivers = this.results.reduce((sum, result) => sum + result.waived.length, 0)
    console.log(`\n${checks - bad}/${checks} checks pass, ${waivers} waived difference(s).`)
  }
}
