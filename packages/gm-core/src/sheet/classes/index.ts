import type { ClassRules } from "../class-rules"
import { featRules } from "../feats"
import { heroicInspirationRules } from "../heroic-inspiration"
import { barbarian } from "./barbarian"
import { bard } from "./bard"
import { cleric } from "./cleric"
import { druid } from "./druid"
import { fighter } from "./fighter"
import { monk } from "./monk"
import { paladin } from "./paladin"
import { ranger } from "./ranger"
import { rogue } from "./rogue"
import { sorcerer } from "./sorcerer"
import { warlock } from "./warlock"
import { wizard } from "./wizard"

/**
 * Every class file's rules (../class-rules). A new class adds its file here, and edits no other shared place. It is a
 * function, read as play needs it, since the class files read the shared code that reads this list. The feats that act
 * in play come after the classes (../feats), and Heroic Inspiration last of all, so it is spent only where nothing
 * else turned a roll (../heroic-inspiration).
 */
export const classes = (): readonly ClassRules[] => [fighter, rogue, bard, cleric, wizard, ranger, barbarian, monk, paladin, warlock, druid, sorcerer, ...featRules(), heroicInspirationRules]
