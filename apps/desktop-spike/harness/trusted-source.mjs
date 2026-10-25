import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve } from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { root } from "./fixture.mjs"

const nodeRequire = createRequire(import.meta.url)

// Execute trusted repository modules unchanged, substituting only service
// boundaries. This is a test harness, not an untrusted-code sandbox or core port.
export function sourceLoader(stubs, events) {
  const cache = new Map()
  const sources = {}
  function load(name, from = join(root, "index.ts")) {
    if (Object.hasOwn(stubs, name)) return stubs[name]
    if (!name.startsWith(".") && !name.startsWith("@/")) return nodeRequire(name)
    let path = name.startsWith("@/") ? join(root, name.slice(2)) : resolve(dirname(from), name)
    if (!existsSync(path) || !path.endsWith(".ts")) {
      path = [`${path}.ts`, join(path, "index.ts")].find(existsSync)
    }
    if (!path || !path.startsWith(root)) throw new Error(`Unresolved trusted source: ${name}`)
    if (cache.has(path)) return cache.get(path)
    const text = readFileSync(path, "utf8")
    sources[relative(root, path)] = createHash("sha256").update(text).digest("hex")
    const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const exports = {}
    cache.set(path, exports)
    const fixedMath = Object.create(Math)
    fixedMath.random = () => 0.8
    vm.runInNewContext(
      js,
      {
        exports,
        require: (specifier) => load(specifier, path),
        console: { log() {}, warn() {}, error: () => events.push("service_logged_error") },
        process: { cwd: () => root, env: {} },
        Math: fixedMath,
        Date,
        Buffer,
        setTimeout,
        clearTimeout,
        URL,
        structuredClone,
      },
      { filename: path, timeout: 5000 }
    )
    return exports
  }
  return { load, sources }
}
