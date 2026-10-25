import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { makePack, sha256Hex } from "@d20/gm-core/packs"
import type { Pack, Packs } from "./game"
import { loadPacks, packDir, syncPacks } from "./packs"

const dirs: string[] = []
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})
const dataDir = () => {
  const d = mkdtempSync(join(tmpdir(), "d20-packs-"))
  dirs.push(d)
  return d
}
// Stand-in runtimes: the pack format checks only that definition and artifacts exist.
const runtime = (tag: string) => ({ definition: { promptSlug: tag }, artifacts: { graph: { encounterTransitions: [] } }, contentRef: {} }) as unknown as Pack
const serve = async (body: string, sha?: string, status = 200) => new Response(body, { status, headers: { "X-Pack-Sha256": sha ?? (await sha256Hex(body)) } })
const write = (data: string, id: string, body: string) => {
  mkdirSync(packDir(data), { recursive: true })
  writeFileSync(join(packDir(data), `${id}.json`), body)
}

test("without downloads the bundled packs play", async () => {
  const bundled: Packs = { a: runtime("a") }
  assert.deepEqual(await loadPacks(bundled, dataDir()), bundled)
})

test("a valid download joins or replaces bundled packs, and damaged files are skipped", async () => {
  const data = dataDir()
  write(data, "b", JSON.stringify(await makePack("b", runtime("b2"))))
  write(data, "c", "{not json")
  const tampered = { ...(await makePack("d", runtime("d"))), runtime: runtime("other") }
  write(data, "d", JSON.stringify(tampered))
  write(data, "e", JSON.stringify(await makePack("not-e", runtime("e"))))
  const packs = await loadPacks({ a: runtime("a"), b: runtime("b1") }, data)
  assert.deepEqual(Object.keys(packs).sort(), ["a", "b"])
  assert.equal(packs.b.definition.promptSlug, "b2")
})

test("sync downloads owned adventures the app lacks and skips the rest", async () => {
  const data = dataDir()
  const pack = await makePack("cargo", runtime("cargo"))
  const asked: string[] = []
  const result = await syncPacks({
    library: [
      { id: "cargo", owned: true, pack: { version: pack.version } },
      { id: "locked", owned: false, pack: { version: "x" } },
      { id: "nopack", owned: true },
    ],
    bundled: {},
    data,
    fetchPack: async (id) => {
      asked.push(id)
      return await serve(JSON.stringify(pack))
    },
  })
  assert.deepEqual(result, { updated: ["cargo"], failed: [] })
  assert.deepEqual(asked, ["cargo"])
  assert.equal((await loadPacks({}, data)).cargo.definition.promptSlug, "cargo")
  const again = await syncPacks({ library: [{ id: "cargo", owned: true, pack: { version: pack.version } }], bundled: {}, data, fetchPack: async () => assert.fail("no second download") })
  assert.deepEqual(again, { updated: [], failed: [] })
})

test("sync refuses truncated, mismatched, or failed downloads and keeps the old file", async () => {
  const data = dataDir()
  const old = await makePack("cargo", runtime("v1"))
  write(data, "cargo", JSON.stringify(old))
  const next = await makePack("cargo", runtime("v2"))
  const body = JSON.stringify(next)
  const cases = [await serve(body, "0".repeat(64)), await serve(JSON.stringify(await makePack("cargo", runtime("v3")))), await serve("{}", undefined, 500)]
  for (const res of cases) {
    const result = await syncPacks({ library: [{ id: "cargo", owned: true, pack: { version: next.version } }], bundled: {}, data, fetchPack: async () => res })
    assert.deepEqual(result, { updated: [], failed: ["cargo"] })
    assert.equal(JSON.parse(readFileSync(join(packDir(data), "cargo.json"), "utf8")).version, old.version)
  }
})

test("when the bundled pack is current, an older download is removed", async () => {
  const data = dataDir()
  const bundled: Packs = { cargo: runtime("v2") }
  write(data, "cargo", JSON.stringify(await makePack("cargo", runtime("v1"))))
  const current = (await makePack("cargo", bundled.cargo)).version
  const result = await syncPacks({ library: [{ id: "cargo", owned: true, pack: { version: current } }], bundled, data, fetchPack: async () => assert.fail("bundled is current") })
  assert.deepEqual(result, { updated: ["cargo"], failed: [] })
  assert.equal(existsSync(join(packDir(data), "cargo.json")), false)
})
