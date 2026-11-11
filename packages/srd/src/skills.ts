import raw from "../data/skills.json"
import { byId } from "./lookup"
import type { Skill } from "./schema/reference"

export const skills = raw as unknown as readonly Skill[]
export const skillById = byId(skills)
