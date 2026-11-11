# Reading rules for typed effects

These rules say how a sentence of the SRD becomes a typed value. Two parties follow them without seeing each other's work: the builders, whose code makes the data, and the readers, who read the official text and write what they find. Where the two disagree, the official text and these rules settle it.

The aim is that a rules engine can act on a typed field without reading the prose, and is never told something the text does not say.

## For every field

- `appliesWhen` is the one name, in every category, for the official words of a condition a typed value holds under. A value with `appliesWhen` is never read as always applying. It is one unbroken span of the official text. A rewrite that joins two sentences is not a quote, and the printed name of a property or option is a `label`, not a condition. Where no unbroken span states the condition, the field is left out and a note says so.
- `unless` is its mirror: the official words of a condition under which the value does not hold. It is used where the text gives the value as the other case ("If the target has 20 Hit Points or fewer, it drops to 0 Hit Points. Otherwise, the target takes 13 (3d8) Psychic damage": the roll carries `unless` "If the target has 20 Hit Points or fewer") or states an exception ("unless moisture is applied to its skin"). The word "Otherwise" alone is never a span.
- A value carries its nearest condition. A condition that the nearest one already presupposes is not repeated: a creature that is regurgitated was swallowed. Nor is the trigger of the feature the value sits in: every value of a feature that begins "If the vampire drops to 0 Hit Points" is read under that trigger.

- Type only what the text states. If the shape cannot hold what the text says without changing its meaning, leave the field out and say so in a note. A wrong typed value is worse than a missing one.
- A typed value means one thing with no hidden condition. If it holds only under a condition, the shape must carry that condition, or the value is left out.
- Order follows the text: saves in the order they are stated, damage rolls in the order stated, conditions in the order stated.
- The same wording gives the same value in every entry.

## Spells

Shapes and field meanings are in `packages/srd/src/schema/spells.ts`: `saveSchema`, `damageSchema`, `healingSchema`, `conditionLinkSchema`, `areaSchema`, and the effect fields of `spellSchema` (`attack`, `saves`, `damage`, `healing`, `conditions`, `casterConditions`, `projectiles`, `extraTargetsPerSlot`, `ac`, `rollModifier`, `damageReduction`, `hitPointMaximum`). The area of effect is `range.area` in the data and `area` in a reader's file.

**Saves**

- One entry for each distinct saving throw the text has a creature make, in text order. A first save and a repeated save are two entries.
- Two saves that differ in ability, in `when`, in outcome or in what they guard are two entries, even where the wording is alike. Where a spell has several named options or effects with a save each (Symbol's Death, Discord, Fear and so on), each is its own entry with `label` set to the printed name. Saves that are the same in every respect, repeated only because the text restates them, are one entry.
- Where one save has outcomes that depend on a row of the spell's table (the Prismatic spells), give one entry for each distinct outcome, each with `label` set to the printed row or rows it covers.
- `when`: "initial" for the save that decides whether the effect lands, including a save a creature makes when it enters an area or ends its turn there. "end-of-turn" and "start-of-turn" are for a repeated save at the end or start of each of the affected creature's own turns. "on-damage" when it takes damage. "action" when it uses an action to repeat it. "later" for any other stated time, including a single save at the start of the caster's next turn.
- "must repeat the saving throw", "repeats the save", "makes another saving throw", "can make a … saving throw at the end of each of its turns" all state a repeated save.
- `onSuccess`: "none" when a success means the creature is not affected or takes no damage. "half" when it takes half damage. "ends" when it ends the spell or the effect on that creature. "other" for any other stated outcome, including a count of successes that must be reached.
- A save that creatures make at a time set by the caster's turns ("at the end of each of your turns", Earthquake's tremors) is "later".
- For an "initial" save, a success that leaves the creature unaffected is "none", even where the text adds that the spell then ends (Ensnaring Strike). "ends" is for a later save that ends an effect already in place.
- A save a creature makes each time it takes damage from the spell is "on-damage", whether or not it made an earlier save (Heat Metal).
- `dc` is "spell-save-dc" unless the text prints a number. `target` is set only where the caster makes the save.

**Damage**

- One entry for each distinct roll the text states, in text order. The same roll restated ("takes the damage again") is not a new entry. Say it in a note.
- Link by meaning, not by sentence. A roll is dealt on a failed save: `trigger: "failed-save"` and `save` the index of that save, even when the save was stated a sentence earlier, and also when a success halves it (the save's `onSuccess` is then "half"). A roll is dealt when an attack hits: `trigger: "hit"`, whether the attack is the spell's own or one the text names ("when you hit", "whenever you hit it with an attack roll", "on a hit"). A roll dealt with no save and no hit (Magic Missile, damage for ending a turn in an area with no save) has no trigger.
- "hit" is for a hit by the creature the spell arms: the caster, or the creature the spell is cast on. Damage dealt to a creature because it hits the caster or a warded creature (Fire Shield) is not a hit of the spell's: it is unlinked, with a note.
- A roll dealt only under a stated condition that is neither a hit nor a failed save carries `appliesWhen`: the official words of that condition ("if the target has more than 100 Hit Points", "each time it acts in a manner directly counter to your instructions"). So does a roll that needs a condition on top of its hit or save. A roll with no `appliesWhen`, no `trigger` and no `save` is dealt every time the spell takes effect.
- Where one save halves some linked rolls and not others, type the links and say which roll the half applies to in a note.
- `types` with several entries means one of them, chosen as the text says or by the table `table` names.
- `perSlot` is the dice added per slot level above the spell's level, on the roll its sentence names. `cantrip` holds the three upgrade values. `modifier` is true where the text adds the spellcasting ability modifier. `target` is set where the damage falls on the caster.
- A roll the shape cannot hold (dice per level of another spell, damage to structures only) is left out, with a note.

**Conditions**

- List each condition the spell applies to its targets, once for each distinct way it is applied. Conditions the text only ends, prevents, requires or mentions are not listed.
- Link by meaning, as for damage: `trigger: "failed-save"` with `save` when one failed save applies it, `trigger: "hit"` when a hit applies it.
- A condition applied only after several failures, or only by a choice the caster makes, or under any other stated condition, is listed with no link and carries `appliesWhen`: the official words that say when it applies. Flesh to Stone gives Restrained on the failed first save, linked. It gives Petrified only after three failed saves, so Petrified is listed unlinked with `appliesWhen` "If it fails its saves three times".
- `casterConditions` are conditions the spell gives the caster.

**Options**

- Where a spell has several named options or effects (Alter Self's Natural Weapons, Control Water's Whirlpool, Symbol's glyphs), a save, a damage roll or a condition that belongs to one of them carries `label`: the printed name of that option. `label` is on all three shapes. An entry with no `label` belongs to the spell as a whole.
- `label` names an option. `appliesWhen` quotes a stated condition. An entry may have both.

**Other fields**

- `healing`, `projectiles`, `extraTargetsPerSlot`, `ac`, `rollModifier`, `damageReduction`, `hitPointMaximum`: as the schema comments define them, only where the text states them in that form.
- These fields have no link of their own, so they describe a creature the spell affects. Where the spell's only save is "initial" with `onSuccess: "none"`, failing it is what makes a creature affected, and the field stands (Bane's 1d4 off attack rolls and saves). Where a success has any other outcome, the field would hide a condition, so it is left out with a note (Ray of Enfeeblement's 1d8 off damage rolls).
- `healing` is what each target regains. A pool shared out among targets (Mass Heal's 700) is not typed.
- `area`: the region the spell affects, where the text states one shape and one size for it. A size that is a limit on something else ("must fit in a 5-foot Cube") is not an area. Where the caster chooses which creatures in the region are affected or spared ("up to six creatures of your choice in a 40-foot Cube", "each creature of your choice in", "you can designate creatures to be unaffected"), the area is typed with `selective: true`, so an engine does not affect everything in it. Where a spell makes several areas of one size (Meteor Swarm's four), the area is typed and a note gives the number.
- `attack`: "melee" or "ranged" where the spell has the caster make a melee or ranged spell attack.

## Magic items

Shapes are in `packages/srd/src/schema/magic-items.ts`.

**Spells**

- `spells` lists a spell only where the text lets the item's user cast it: "you can cast", "cast one of the following spells", "to cast the X spell from it". Each entry carries what the text states for that casting: `charges` where casting it expends charges (including a sentence that covers several spells at once: "expend 1 of the cube's charges to cast one of the following spells" gives every listed spell `charges: 1`), `level` where the text names the level it is cast at, `saveDc` where the text gives one.
- `spellEffects` lists spells whose effect the item applies without the user casting: "you gain the effect of the X spell", "as if you had cast", "is under the effect of", "detonates as a level 3 Fireball", and a spell the item casts on its own user. Each entry is `{ id, level?, saveDc? }`, with the level and DC where the text states them. No charges go here.
- A spell cast by a creature the item calls or holds (an efreeti, a figurine's creature), or a spell the text only mentions (what can repair or dispel the item), is in neither list.
- A spell name inside a longer spell name is not that spell.

**Bonuses**

- `to` is one of: `armor-class`, `attack-rolls`, `damage-rolls`, `spell-attack-rolls`, `spell-save-dc`, `saving-throws`, `ability-checks`, `initiative`, `proficiency-bonus`, or a skill's checks written `<skill id>-checks` (`athletics-checks`, `sleight-of-hand-checks`). Only a "+N bonus to" one of these is a bonus. A score that is set or raised (an Amulet of Health's Constitution of 19) is not: it stays in a note.
- `bonuses` holds a bonus only where it applies whenever the item is worn, wielded or held as the text requires. A bonus that applies only against some creatures, only on one attack, only as a reaction, or only in one form of the item is in `conditionalBonuses` with `appliesWhen`: the condition in the official words.
- A bonus that changes ("increases to +3 when you use the weapon to attack a Construct") is one plain bonus and one conditional bonus.

**Damage**

- One entry per distinct roll, with `role` as the schema defines it. Rolls the text gives as alternatives (one or the other, by target or by condition) must not read as both applying: the conditional one carries `appliesWhen`.
- A fixed amount with no dice uses `amount`.
- `role` "extra" is damage added to a hit the item helps make. Damage dealt through a save the item forces is "effect".
- The hit is part of what "extra" means, so "on a hit" and "when you hit with a melee attack using the staff" are not conditions and give no `appliesWhen`. A limit on which hits count is a condition ("against your sworn enemy", "if the target is a Giant").
- A roll whose dice are printed only in the rows of a table (the Ring of Shooting Stars' spheres) belongs to those rows and is not typed on the item.
- Damage tied to a failed save carries no `appliesWhen` for that, and what causes the save is not a condition on the roll. A roll dealt on a successful save does carry `appliesWhen`.

**Tables**

- An effect stated only in a row of an item's table (Bag of Beans, the Apparatus of the Crab's levers, a wand's random results) belongs to that row. It is not typed on the item.

**Charges and saves**

- `charges`: the maximum, what is regained and when, and the last-charge roll, as stated.
- `saves`: each distinct save the item forces, once, with ability and DC. An item save has no timing field, so a repeated save is said in a note. Where an item has several saves with different DCs, each carries a `label`: the short printed name, or the few official words, that tell the saves apart.

## Monsters

Shapes are in `packages/srd/src/schema/monsters.ts`.

- A save that only some targets make carries `appliesWhen`: the official words of the limit ("If the target is a Humanoid"). So does a condition or a roll that rides that save.
- A staged outcome is not a condition. The first stage is linked to the failed save or the hit with no `appliesWhen`. A later stage, which needs something more, carries the words that say what. The stage itself is typed in `on` (first failure, second failure, failure by a margin, with the margin on the save), so a staged outcome carries no `label`.
- Swallowing and engulfing. What holds only while a target is swallowed or engulfed depends on the swallow or engulf having happened. Where that happens on every hit or failed save, the conditions and recurring rolls are linked to the hit or failure and carry nothing more. Where it happens only under a stated gate ("If the target is a Large or smaller creature"), each of them carries that gate as `appliesWhen`, the same span on each.
- Who makes a save is in the save's `targets`, in the official words. A limit printed inside that phrase stays there ("each creature in a 15-foot Emanation originating from the kraken while it is underwater"). A limit printed anywhere else is an `appliesWhen` on the save.
- What lasts only while a chosen grapple lasts carries the words that say so ("Until the grapple ends"), not only the gate on the choice.
- A condition that depends on another creature's save carries the whole span that states that save ("…the behir must succeed on a DC 14 Constitution saving throw at the end of that turn or regurgitate the creature").
- A roll with `timing` is dealt at that time, not when the action lands. Where one sentence gives two rolls one time, both carry it.
- Alternatives must not read as both applying. Where an action lets the monster do one thing instead of another, the alternative carries the words that say when it is available.
- Recurring damage dealt after a failed save is linked to that save.
- A roll or a condition that falls on the monster itself (a vampire in sunlight, a troll's lost limb) carries `self: true`. Without it, a roll or a condition falls on the action's target.
- Where one action has several named options with a save each, each save carries `label`, and so does what rides it.

## Classes

Shapes are in `packages/srd/src/schema/classes.ts`.

- `activation` lists the kinds of action it takes to use the feature. An action, or "no action required", that only ends or moves an effect already in place, or restores a use of this same feature, is not activation.
- Standing values and triggered values. `attacks`, `criticalHit`, `freeCast`, and a change to Speed or Armor Class are standing: they hold whenever the character has the feature, so any limit the text puts on them (one weapon, on yourself, only in dim light) must be typed. `dice`, `damageTypes` and `save` are triggered: they describe what happens when the feature takes effect, and the feature's own text says when that is (which hit, which weapon, which action). The trigger is not repeated on them. A further condition on the target, or a choice within the feature, is still a condition and must be carried.
- An area whose creatures the user chooses is typed with `selective: true`, as for spells.
- A save, a roll or a count that holds only for some targets, only for one choice within the feature, or only with one weapon, carries that limit in a typed field or as `appliesWhen`. If the shape cannot hold it, the value is not typed.
- A cost that a parent feature states for all of its options (Channel Divinity) is typed on each option.
- A value belongs to the feature's user. What a familiar or a summoned creature does is not typed on the feature.
- A feature's `dice` is its main roll. A roll inside one sub-benefit is not typed there.

## Notes

A reader's `notes`, and a builder's comments or overrides, say what the text states that the fields do not hold. Notes are how the package knows what is prose only.
