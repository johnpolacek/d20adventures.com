import { sanitizeUserVisibleProse } from "@/lib/utils/narrative-utils"

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

const prose = sanitizeUserVisibleProse("The door opens — slowly; the torch flickers – then fades.")
assert(!/[;\u2012\u2013\u2014\u2015]/.test(prose), "Prose still contains forbidden punctuation")
assert(prose === "The door opens, slowly, the torch flickers, then fades.", `Unexpected prose cleanup: ${prose}`)

const shortcode = "[DiceRoll:rollType=Attack;baseRoll=11;result=14;success=true]"
const mixed = sanitizeUserVisibleProse(`${shortcode}\n\nThe blade strikes — hard; the guard staggers.`)
assert(mixed.includes(shortcode), "Dice roll shortcode syntax was changed")
assert(!mixed.replace(shortcode, "").includes(";"), "Non-shortcode semicolon was not cleaned")
assert(!/[\u2012\u2013\u2014\u2015]/.test(mixed), "Dash variant was not cleaned")

console.log("LLM style validation passed")
