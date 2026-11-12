import type { ClassRules } from "../class-rules"
import { barbarian } from "./barbarian"
import { bard } from "./bard"
import { cleric } from "./cleric"
import { fighter } from "./fighter"
import { monk } from "./monk"
import { paladin } from "./paladin"
import { ranger } from "./ranger"
import { rogue } from "./rogue"
import { wizard } from "./wizard"

/**
 * Every class file's rules (../class-rules). A new class adds its file here, and edits no other shared place. It is a
 * function, read as play needs it, since the class files read the shared code that reads this list.
 */
export const classes = (): readonly ClassRules[] => [fighter, rogue, bard, cleric, wizard, ranger, barbarian, monk, paladin]
