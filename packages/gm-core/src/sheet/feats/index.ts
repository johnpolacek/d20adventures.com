import type { ClassRules } from "../class-rules"
import { combatProwess } from "./combat-prowess"
import { fate } from "./fate"
import { irresistibleOffense } from "./irresistible-offense"
import { spellRecall } from "./spell-recall"

/**
 * The feats that act in play beyond the sheet, each in a file of its own that fills the same seam a class file does
 * (../class-rules), gated on the hero having the feat (../feature-rules `hasFeat`). What a feat gives the sheet alone
 * (an ability score, a sense, a Fighting Style's bonus, Alert's Initiative, Savage Attacker's dice) is read where the
 * sheet and the attack are made (../derive, ../attack). Read after the classes (../classes).
 */
export const featRules = (): readonly ClassRules[] => [combatProwess, fate, irresistibleOffense, spellRecall]
