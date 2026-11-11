import raw from "../data/coins.json"
import { byId } from "./lookup"
import type { Coin } from "./schema/equipment"

export const coins = raw as unknown as readonly Coin[]
export const coinById = byId(coins)
