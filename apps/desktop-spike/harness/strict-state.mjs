import assert from "node:assert/strict"
import { z } from "zod"

// Derive the model contract from the real schema, removing recovery/coercion.
// Invalid fields must trigger a correction, never disappear during parsing.
export function strictModelSchema(schema) {
  if (schema instanceof z.ZodCatch) return strictModelSchema(schema.unwrap())
  if (schema instanceof z.ZodOptional) return strictModelSchema(schema.unwrap()).optional()
  if (schema instanceof z.ZodPipe) return strictModelSchema(schema.in)
  if (schema instanceof z.ZodUnion) {
    // openThreads accepts legacy string inputs. Require its canonical object form.
    const object = schema.options.find((option) => option instanceof z.ZodObject)
    assert.ok(object, "Unexpected union in adventure patch")
    return strictModelSchema(object)
  }
  if (schema instanceof z.ZodArray) return z.array(strictModelSchema(schema.element))
  if (schema instanceof z.ZodObject) return z.strictObject(Object.fromEntries(Object.entries(schema.shape).map(([key, value]) => [key, strictModelSchema(value)])))
  return schema
}

export function assertPatchPreserved(proposed, committed, adventure, turn) {
  committed = structuredClone(committed)
  for (const [key, value] of Object.entries(proposed)) assert.deepEqual(committed[key], value, `Patch field lost or changed: ${key}`)
  assert.deepEqual(turn.adventurePatch, committed, "Turn must retain the complete patch")
  for (const key of ["discoveries", "entityUpdates"]) {
    for (const entry of committed[key] ?? [])
      assert.ok(
        adventure[key]?.some((item) => JSON.stringify(item) === JSON.stringify(entry)),
        `${key} entry missing from saved adventure`
      )
  }
  const resolved = new Set(committed.resolvedThreadIds ?? [])
  for (const thread of committed.openThreads ?? []) {
    if (!resolved.has(thread.id))
      assert.ok(
        adventure.openThreads.some((item) => item.id === thread.id && JSON.stringify(item) === JSON.stringify(thread)),
        "Open thread missing"
      )
  }
  for (const id of resolved) {
    assert.ok(adventure.resolvedThreadIds.includes(id), "Resolution missing")
    assert.ok(!adventure.openThreads.some((thread) => thread.id === id), "Resolved thread still open")
  }
  if (committed.summaryDelta) assert.ok(adventure.adventureSummaryMarkdown.endsWith(committed.summaryDelta), "Summary missing")
  return {
    suppliedFields: Object.keys(proposed),
    allSuppliedFieldsPreserved: true,
    discoveries: committed.discoveries?.length ?? 0,
    entityUpdates: committed.entityUpdates?.length ?? 0,
    openThreads: committed.openThreads?.length ?? 0,
    resolvedThreadIds: committed.resolvedThreadIds?.length ?? 0,
    characterUpdates: committed.characterUpdates?.length ?? 0,
    characterUpdateSemantics: "Retained in turn.adventurePatch. Existing mutation does not apply these to live character fields.",
  }
}
