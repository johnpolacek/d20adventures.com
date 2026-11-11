import raw from "../data/languages.json"
import { byId } from "./lookup"
import type { Language } from "./schema/reference"

export const languages = raw as unknown as readonly Language[]
export const languageById = byId(languages)
