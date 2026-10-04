import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { root } from "./fixture.mjs"

// Extract the trusted mutation and its one helper without starting Convex.
export function memoryCommit(records, sources) {
  const source = readFileSync(join(root, "convex/adventure.ts"), "utf8")
  sources["convex/adventure.ts"] = createHash("sha256").update(source).digest("hex")
  const ast = ts.createSourceFile("adventure.ts", source, ts.ScriptTarget.Latest, true)
  const names = ["commitWikiTurnAdvance", "generatedByValidator"]
  const declarations = ast.statements.filter(
    (statement) =>
      (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((d) => names.includes(d.name.getText(ast)))) ||
      (ts.isFunctionDeclaration(statement) && statement.name?.text === "mergeThreads")
  )
  assert.equal(declarations.length, 3)
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(declarations.map((node) => node.getText(ast)).join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    {
      exports,
      mutation: (args) => args,
      v: new Proxy({}, { get: () => () => ({}) }),
      console: { log() {} },
    },
    { timeout: 1000 }
  )
  return async (args) => {
    const db = {
      get: async (id) => structuredClone(records.get(id)),
      patch: async (id, value) => Object.assign(records.get(id), structuredClone(value)),
      insert: async (table, value) => {
        assert.equal(table, "turns")
        const id = `turn-${value.order}`
        assert.ok(!records.has(id), "Duplicate turn")
        records.set(id, { _id: id, ...structuredClone(value) })
        return id
      },
      query: (table) => {
        assert.equal(table, "turns")
        let adventureId, order
        const query = {
          withIndex(name, predicate) {
            assert.equal(name, "by_adventure")
            predicate({
              eq: (key, value) => {
                assert.equal(key, "adventureId")
                adventureId = value
              },
            })
            return query
          },
          filter(predicate) {
            predicate({
              field: (key) => key,
              eq: (key, value) => {
                assert.equal(key, "order")
                order = value
              },
            })
            return query
          },
          first: async () => structuredClone([...records.values()].find((row) => row.adventureId === adventureId && row.order === order) ?? null),
        }
        return query
      },
    }
    return exports.commitWikiTurnAdvance.handler({ db }, args)
  }
}
