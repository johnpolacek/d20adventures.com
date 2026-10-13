import { invoke } from "@tauri-apps/api/core"
import type { AccountCommand, AccountResponse } from "../runtime/account"
import type { AdventureInfo, CatalogInfo, GameCommand } from "../runtime/game"
import type { Hero, HeroCommand, HeroDraft } from "../runtime/heroes"
import type { HostEvent } from "../runtime/host"
import type { HostCommand, HostResponse } from "../runtime/host-commands"
import type { Save, SaveSummary } from "../runtime/store"
export type GameResponse = {
  state: Save | null
  providers?: string[]
  adventures?: AdventureInfo[]
  catalog?: CatalogInfo[]
  heroes?: Hero[]
  saves?: SaveSummary[]
  options?: { races: string[]; archetypes: string[] }
  draft?: HeroDraft
  // Painted hero art as data URLs, by hero id.
  art?: Record<string, { front: string; back: string; portrait: string }>
  error?: string
}
export const send = (command: GameCommand | HeroCommand) => invoke<GameResponse>("game_command", { command })
// Replies offered on a hero's turn. Rust runs it outside the game lock, so it never holds up an action.
export const suggest = (turnId: string, characterId: string) =>
  invoke<{ suggestions?: { label: string; text: string }[]; error?: string }>("suggest_command", { command: { kind: "suggest", turnId, characterId } })
// The model a CLI runs as the GM, and its effort. Rust runs it outside the game lock too.
export type GmModel = { name?: string; effort?: string }
export const gmModel = (provider: string) => invoke<{ model?: GmModel }>("model_command", { provider })
// Rust adds the Keychain token, so the webview never sends or sees it.
type AccountRequest = AccountCommand extends infer C ? (C extends { token?: string } ? Omit<C, "token"> : never) : never
export const account = (command: AccountRequest) => invoke<AccountResponse & { error?: string }>("account_command", { command })
export const openSite = (path: string) => invoke<void>("open_site", { path })
// Whether play needs a linked account, and whether a token is stored. Answered by Rust without a network call.
export const accountInfo = () => invoke<{ required: boolean; linked: boolean }>("account_info")
// Hosting a website game. Rust adds the token, and runs the host worker that does the GM's jobs.
type HostRequest = HostCommand extends infer C ? (C extends { token?: string } ? Omit<C, "token"> : never) : never
export const host = (command: HostRequest) => invoke<HostResponse>("host_command", { command })
export const hostStart = (adventureId: string, provider: string) => invoke<void>("host_start", { adventureId, provider })
export const hostStop = () => invoke<void>("host_stop")
export type HostWorkerState = { adventureId: string | null; event: HostEvent | { type: "starting" | "stopped" } | null }
export const hostRunning = () => invoke<HostWorkerState>("host_running")
// The window filling the screen. Rust owns it, since the webview may not resize its own window.
export const toggleFullscreen = () => invoke<boolean>("toggle_fullscreen")
export const isFullscreen = () => invoke<boolean>("is_fullscreen")
