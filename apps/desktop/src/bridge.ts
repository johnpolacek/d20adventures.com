import { invoke } from "@tauri-apps/api/core"
import type { AdventureInfo, GameCommand } from "../runtime/game"
import type { Hero, HeroCommand, HeroDraft } from "../runtime/heroes"
import type { Save } from "../runtime/store"
export type GameResponse = {
  state: Save | null
  providers?: string[]
  adventures?: AdventureInfo[]
  heroes?: Hero[]
  options?: { races: string[]; archetypes: string[] }
  draft?: HeroDraft
  error?: string
}
export const send = (command: GameCommand | HeroCommand) => invoke<GameResponse>("game_command", { command })
