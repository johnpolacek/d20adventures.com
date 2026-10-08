import { hostname } from "node:os"
import { z } from "zod"
import type { LibraryEntry } from "../../../lib/store/catalog"
import type { Packs } from "./game"
import { syncPacks } from "./packs"

// Linking this computer to a website account. Rust adds the Keychain token to each command
// and stores or clears it from storeToken and clearToken, so the token never reaches the webview.
const token = z.string().optional()
export const accountCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("accountStatus"), token }),
  z.object({ kind: z.literal("accountLinkStart"), token }),
  z.object({ kind: z.literal("accountLinkPoll"), pollSecret: z.string().min(20).max(200), token }),
  z.object({ kind: z.literal("accountUnlink"), token }),
])
export type AccountCommand = z.infer<typeof accountCommandSchema>

export type AccountState = { linked: false } | { linked: true; account: string; device: string } | { linked: "offline" }
export type LinkState = { status: "waiting"; userCode: string; pollSecret: string; verifyPath: string; expiresAt: number; interval: number } | { status: "pending" } | { status: "expired" }
export type OwnedAdventure = LibraryEntry & { pack?: { version: string; builtAt: number } }
export type AccountResponse = {
  account: AccountState
  link?: LinkState
  adventures?: OwnedAdventure[]
  // Story packs downloaded or replaced on this call, and ones that failed to download.
  updated?: string[]
  failed?: string[]
  storeToken?: string
  clearToken?: boolean
  error?: string
}

type Fetch = typeof fetch
const deviceName = () => hostname().replace(/\.local$/, "") || "Desktop app"

// With packs, a linked status also downloads the story packs of owned adventures.
type PackPlace = { data: string; bundled: Packs }

export async function accountCommand(command: AccountCommand, site: string, fetchImpl: Fetch = fetch, packs?: PackPlace): Promise<AccountResponse> {
  const call = (path: string, init: RequestInit = {}, bearer?: string) =>
    fetchImpl(`${site}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      signal: AbortSignal.timeout(15_000),
    })

  async function status(bearer: string | undefined): Promise<AccountResponse> {
    if (!bearer) return { account: { linked: false } }
    try {
      const me = await call("/api/desktop/me", {}, bearer)
      if (me.status === 401) return { account: { linked: false }, clearToken: true }
      if (!me.ok) return { account: { linked: "offline" } }
      const { account, device } = (await me.json()) as { account: string; device: string }
      const library = await call("/api/desktop/library", {}, bearer)
      const adventures = library.ok ? ((await library.json()) as { adventures: OwnedAdventure[] }).adventures : undefined
      if (!packs || !adventures) return { account: { linked: true, account, device }, adventures }
      const synced = await syncPacks({ library: adventures, ...packs, fetchPack: (id) => call(`/api/desktop/packs/${id}`, {}, bearer) })
      return { account: { linked: true, account, device }, adventures, ...synced }
    } catch {
      return { account: { linked: "offline" } }
    }
  }

  switch (command.kind) {
    case "accountStatus":
      return status(command.token)
    case "accountLinkStart": {
      const res = await call("/api/desktop/link", { method: "POST", body: JSON.stringify({ deviceName: deviceName() }) }).catch(() => null)
      if (!res?.ok) return { account: { linked: false }, error: "Could not reach D20 Adventures to link this computer." }
      const body = (await res.json()) as { userCode: string; pollSecret: string; verifyUrl: string; expiresAt: number; interval: number }
      const verify = new URL(body.verifyUrl)
      return {
        account: { linked: false },
        link: { status: "waiting", userCode: body.userCode, pollSecret: body.pollSecret, verifyPath: `${verify.pathname}${verify.search}`, expiresAt: body.expiresAt, interval: body.interval },
      }
    }
    case "accountLinkPoll": {
      const res = await call("/api/desktop/link/token", { method: "POST", body: JSON.stringify({ pollSecret: command.pollSecret }) }).catch(() => null)
      if (!res) return { account: { linked: false }, link: { status: "pending" } }
      if (res.status === 410) return { account: { linked: false }, link: { status: "expired" } }
      if (!res.ok) return { account: { linked: false }, link: { status: "pending" } }
      const body = (await res.json()) as { status: "pending" } | { status: "linked"; token: string }
      if (body.status !== "linked") return { account: { linked: false }, link: { status: "pending" } }
      return { ...(await status(body.token)), storeToken: body.token }
    }
    case "accountUnlink":
      // Clear the local token even when the website cannot be reached. The website's device list can still revoke it.
      if (command.token) await call("/api/desktop/unlink", { method: "POST" }, command.token).catch(() => null)
      return { account: { linked: false }, clearToken: true }
  }
}
