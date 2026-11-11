import raw from "../data/magic-schools.json"
import { byId } from "./lookup"
import type { MagicSchool } from "./schema/reference"

export const magicSchools = raw as unknown as readonly MagicSchool[]
export const magicSchoolById = byId(magicSchools)
