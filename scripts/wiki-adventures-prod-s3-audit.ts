/**
 * Unit 5 — Production S3 wiki-source completeness audit (read-only).
 *
 * For each registered wiki adventure, this reports how the runtime's source selection
 * (`selectWikiAdventureSourceFiles`) would resolve against whatever is currently in S3:
 *
 *   - "local (S3 empty)"            → no S3 source; repo-local bundled source is used. SAFE.
 *   - "local (S3 partial, rejected)"→ S3 missing some expected paths; complete-manifest
 *                                      guard falls back to repo-local. SAFE.
 *   - "s3 (complete)"               → S3 covers every expected path; S3 source is used.
 *                                      The script then compiles it in publish mode and
 *                                      asserts it is publish-valid.
 *
 * The only unsafe state would be "s3 (complete) but not publish-valid". The audit fails if
 * any adventure lands there. Run against prod creds:
 *   node --env-file=.env --env-file=.env.local --import tsx scripts/wiki-adventures-prod-s3-audit.ts
 */
import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { s3Client } from "@/lib/aws"
import { compileAdventureSourceTree } from "@/lib/wiki-adventures/compiler"
import { LOCAL_WIKI_ADVENTURES, readLocalWikiAdventureSourceFiles, readWikiAdventureSourceFiles } from "@/lib/wiki-adventures/local-runtime"
import { S3WikiAdventureSourceService } from "@/lib/wiki-adventures/source-service"

const bucket = process.env.bucketData || process.env.AWS_BUCKET_DATA

async function listKeys(prefix: string): Promise<string[]> {
  if (!s3Client || !bucket) return []
  const keys: string[] = []
  let ContinuationToken: string | undefined
  do {
    const res = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }))
    for (const object of res.Contents ?? []) if (object.Key) keys.push(object.Key)
    ContinuationToken = res.NextContinuationToken
  } while (ContinuationToken)
  return keys
}

async function main() {
  if (!s3Client || !bucket) {
    throw new Error("S3 is not configured (need bucketData/AWS_BUCKET_DATA + creds). Pass --env-file=.env --env-file=.env.local.")
  }
  console.log(`Auditing prod S3 wiki source — bucket: ${bucket}\n`)

  let unsafe = 0
  for (const def of LOCAL_WIKI_ADVENTURES) {
    const expected = readLocalWikiAdventureSourceFiles(def).map((file) => file.path)
    const contentKeys = new Set(await listKeys(`content/settings/${def.settingId}/adventures/${def.planId}/`))
    // Expected paths also include setting-level NPC files (outside the adventure prefix), so
    // resolve each expected path individually against S3 rather than a single prefix listing.
    const present: string[] = []
    const missing: string[] = []
    for (const path of expected) {
      // Adventure-scoped paths are covered by the prefix listing; check the rest directly.
      if (contentKeys.has(path)) present.push(path)
      else missing.push(path)
    }
    // Re-check "missing" individually (setting-level NPC paths live under a different prefix).
    const service = new S3WikiAdventureSourceService(s3Client, bucket)
    const stillMissing: string[] = []
    for (const path of missing) {
      const file = await service.readFile(path)
      if (file) present.push(path)
      else stillMissing.push(path)
    }

    const publishedLatest = await service.readFile(`published/settings/${def.settingId}/adventures/${def.planId}/latest.json`)

    let decision: string
    let validation = ""
    let divergence = ""
    if (present.length === 0) {
      decision = "local (S3 empty)"
    } else if (stillMissing.length === 0) {
      decision = "s3 (complete)"
      // Compile the S3-resolved source the runtime would actually use.
      const resolved = await readWikiAdventureSourceFiles(def)
      const artifacts = compileAdventureSourceTree(resolved, { mode: "publish", contentVersion: def.contentVersion, allowedAssetHosts: def.assetHosts })
      validation = ` | publish validation: ${artifacts.validationReport.status}`
      if (artifacts.validationReport.status === "blocked") unsafe++
      // When S3 is canonical, surface drift from the repo-bundled source: the runtime serves
      // the S3 version, so any repo edit (e.g. new frontmatter) is silently NOT applied.
      const localByPath = new Map(readLocalWikiAdventureSourceFiles(def).map((file) => [file.path, file.hash]))
      const resolvedByPath = new Map(resolved.map((file) => [file.path, file.hash]))
      let differ = 0
      for (const [path, hash] of localByPath) if (resolvedByPath.get(path) !== hash) differ++
      if (differ > 0) {
        divergence = `\n  ⚠ DRIFT FROM REPO     : ${differ}/${localByPath.size} files differ — prod serves the S3 copy, repo edits are NOT applied`
      }
    } else {
      decision = "local (S3 partial, rejected)"
    }

    console.log(`${def.planId}`)
    console.log(`  expected source files : ${expected.length}`)
    console.log(`  present in prod S3    : ${present.length}`)
    console.log(`  missing from prod S3  : ${stillMissing.length}${stillMissing.length ? ` (e.g. ${stillMissing[0]})` : ""}`)
    console.log(`  published latest.json : ${publishedLatest ? "present" : "none"}`)
    console.log(`  runtime resolves to   : ${decision}${validation}${divergence}\n`)
  }

  if (unsafe > 0) {
    console.error(`AUDIT FAILED: ${unsafe} adventure(s) resolve to complete-but-invalid S3 source.`)
    process.exit(1)
  }
  console.log("AUDIT PASSED: every adventure resolves to a safe source (local fallback or publish-valid S3).")
}

main().catch((error) => {
  console.error("Audit error:", error?.message ?? error)
  process.exit(1)
})
