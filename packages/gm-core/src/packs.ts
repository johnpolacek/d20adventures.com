// A story pack: one adventure's compiled runtime as the desktop app's local GM plays it. Declarative data only.
// The website serves packs and the desktop app checks them, so both sides share this format.
export type StoryPack<Runtime = unknown> = { format: 1; id: string; version: string; builtAt: number; runtime: Runtime }
export type PackIndex = Record<string, { version: string; builtAt: number }>

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Content identity: the same runtime always has the same version, bundled or downloaded. */
export const packVersion = async (runtime: unknown) => (await sha256Hex(JSON.stringify(runtime))).slice(0, 16)

export const makePack = async <Runtime>(id: string, runtime: Runtime, builtAt = Date.now()): Promise<StoryPack<Runtime>> => ({
  format: 1,
  id,
  version: await packVersion(runtime),
  builtAt,
  runtime,
})

/** A pack is accepted only when its shape holds and its version matches its content. */
export async function readPack(value: unknown, id: string): Promise<StoryPack | null> {
  const pack = value as Partial<StoryPack> | null
  if (!pack || pack.format !== 1 || pack.id !== id || typeof pack.version !== "string" || typeof pack.builtAt !== "number") return null
  const runtime = pack.runtime as { definition?: unknown; artifacts?: unknown } | undefined
  if (!runtime?.definition || !runtime.artifacts) return null
  return (await packVersion(runtime)) === pack.version ? (pack as StoryPack) : null
}
