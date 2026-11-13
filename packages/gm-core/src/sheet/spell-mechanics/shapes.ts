import type { SpellRules } from "../spell-rules"

/**
 * Meteor Swarm: "Blazing orbs of fire plummet to the ground at four different points you can see within range. Each
 * creature in a 40-foot-radius Sphere centered on each of those points makes a Dexterity saving throw ... A creature in
 * the area of more than one fiery Sphere is affected only once." Each Sphere is centred on one named.
 */
export const meteorSwarm: SpellRules = { spells: ["meteor-swarm"], areas: 4 }

/**
 * Chain Lightning: "Three bolts then leap from that target to as many as three other targets of your choice, each of
 * which must be within 30 feet of the first target. A target ... can be targeted by only one of the bolts."
 */
export const chainLightning: SpellRules = { spells: ["chain-lightning"], nearFirst: 30 }
