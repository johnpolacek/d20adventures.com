import { invoke } from "@tauri-apps/api/core"
import type { AccountCommand, AccountResponse } from "../runtime/account"
import type { AdventureInfo, CatalogInfo, GameCommand } from "../runtime/game"
import type { Hero, HeroCommand, HeroDraft } from "../runtime/heroes"
import type { Save } from "../runtime/store"
export type GameResponse = {
  state: Save | null
  providers?: string[]
  adventures?: AdventureInfo[]
  catalog?: CatalogInfo[]
  heroes?: Hero[]
  options?: { races: string[]; archetypes: string[] }
  draft?: HeroDraft
  // Painted hero art as data URLs, by hero id.
  art?: Record<string, { front: string; back: string; portrait: string }>
  error?: string
}
export const send = (command: GameCommand | HeroCommand) => invoke<GameResponse>("game_command", { command })
// Rust adds the Keychain token, so the webview never sends or sees it.
type AccountRequest = AccountCommand extends infer C ? (C extends { token?: string } ? Omit<C, "token"> : never) : never
export const account = (command: AccountRequest) => invoke<AccountResponse & { error?: string }>("account_command", { command })
export const openSite = (path: string) => invoke<void>("open_site", { path })
// Whether play needs a linked account, and whether a token is stored. Answered by Rust without a network call.
export const accountInfo = () => invoke<{ required: boolean; linked: boolean }>("account_info")
