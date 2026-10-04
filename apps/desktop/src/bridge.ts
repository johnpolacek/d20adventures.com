import { invoke } from "@tauri-apps/api/core"
import type { GameCommand } from "../runtime/game"
import type { Save } from "../runtime/store"
export type GameResponse = { state: Save | null; providers?: string[]; adventures?: { id: string; title: string; start: string }[]; error?: string }
export const send = (command: GameCommand) => invoke<GameResponse>("game_command", { command })
