# Reading rules for typed effects

These rules say how a sentence of the SRD becomes a typed value. Two parties follow them without seeing each other's work: the builders, whose code makes the data, and the readers, who read the official text and write what they find. Where the two disagree, the official text and these rules settle it.

The aim is that a rules engine can act on a typed field without reading the prose, and is never told something the text does not say.

## For every field

- `appliesWhen` is the one name, in every category, for the official words of a condition a typed value holds under. A value with `appliesWhen` is never read as always applying. It is one unbroken span of the official text. A rewrite that joins two sentences is not a quote, and the printed name of a property or option is a `label`, not a condition. Where no unbroken span states the condition, the value is left out and its kind goes in `untyped`.
- `unless` is its mirror: the official words of a condition under which the value does not hold. It is used where the text gives the value as the other case ("If the target has 20 Hit Points or fewer, it drops to 0 Hit Points. Otherwise, the target takes 13 (3d8) Psychic damage": the roll carries `unless` "If the target has 20 Hit Points or fewer") or states an exception ("unless moisture is applied to its skin"). The word "Otherwise" alone is never a span.
- A value carries its nearest condition. A condition that the nearest one already presupposes is not repeated: a creature that is regurgitated was swallowed. Nor is the trigger of the feature the value sits in: every value of a feature that begins "If the vampire drops to 0 Hit Points" is read under that trigger.

- `usableWhen` is the official words of a precondition on using the thing at all ("While within Dim Light or Darkness" for a Bonus Action that turns the user Invisible). It gates the use and nothing after it: once used, the effect lasts as the text says, even if the precondition stops holding. `appliesWhen` is for a condition the value itself holds under, for as long as it holds.
- Which field an event belongs in goes by how the text states it. A clause that begins "If" states something that may or may not happen, so it is a condition: `appliesWhen` ("If the creature tries to use teleportation or interplanar travel to leave"). A clause that begins "When", "Whenever", "At", "After" or "As" states a moment: `timing`. The test is by the first word of the clause, so that two readers always agree: "When you use your Unarmed Strike to deal damage with that new growth" is `timing`. It applies wherever a shape has both fields, and there it has no exceptions. A magic item's rolls, saves and bonuses, and a monster's save, have `appliesWhen` and no `timing`, so there `appliesWhen` holds a moment as well ("When you roll a 20 on an attack roll made with this weapon").
- `timing` is the official words of when a roll is dealt or an effect happens, where that is not the moment the thing takes effect ("At the start of each of its turns"). It is one unbroken span, like `appliesWhen`.
- A package check proves that every `appliesWhen`, `unless`, `timing` and `usableWhen` in every data file is one unbroken span of another text of the same entry. Joined fragments, an ellipsis, a table row name or words the entry does not print all fail.
- Type only what the text states. If the shape cannot hold what the text says without changing its meaning, leave the field out and name its kind in the entry's `untyped` list. A wrong typed value is worse than a missing one.
- `untyped` lists each kind of typed effect (`saves`, `damage`, `conditions`, `healing` on a spell, and so on) for which the text states something the typed list does not hold. An engine that finds a kind there reads the prose for it. A kind not listed is complete.
- A typed value means one thing with no hidden condition. If it holds only under a condition, the shape must carry that condition, or the value is left out.
- Order follows the text: saves in the order they are stated, damage rolls in the order stated, conditions in the order stated.
- The same wording gives the same value in every entry.

## Spells

Shapes and field meanings are in `packages/srd/src/schema/spells.ts`: `saveSchema`, `damageSchema`, `healingSchema`, `conditionLinkSchema`, `areaSchema`, and the effect fields of `spellSchema` (`attack`, `saves`, `damage`, `healing`, `conditions`, `projectiles`, `extraTargetsPerSlot`, `ac`, `rollModifier`, `damageReduction`, `hitPointMaximum`). The area of effect is `range.area` in the data and `area` in a reader's file.

**Saves**

- One entry for each distinct saving throw the text has a creature make, in text order. A first save and a repeated save are two entries.
- Two saves that differ in ability, in `when`, in outcome or in what they guard are two entries, even where the wording is alike. Where a spell has several named options or effects with a save each (Symbol's Death, Discord, Fear and so on), each is its own entry with `label` set to the printed name. Saves that are the same in every respect, repeated only because the text restates them, are one entry.
- Where one save has outcomes that depend on which row of the spell's table is rolled (Prismatic Spray, where a d8 picks one ray), give one entry for each distinct outcome, each with `label` set to the printed row or rows it covers. A roll with several `types` then means the one type of the row rolled.
- Where every row applies in turn (Prismatic Wall, whose layers a creature passes through one after another, each with its own save), each row is its own save and its own roll, each with the row's `label`. Nothing there is one of several.
- A group the text exempts carries `unless` on each save, roll and condition it is spared ("You and creatures you designate when you cast the spell can pass through and be near the wall without harm").
- `when`: "initial" for the save that decides whether the effect lands, including a save a creature makes when it enters an area or ends its turn there. "end-of-turn" and "start-of-turn" are for a repeated save at the end or start of each of the affected creature's own turns. "on-damage" when it takes damage. "action" when it uses an action to repeat it. "later" for any other stated time, including a single save at the start of the caster's next turn.
- "must repeat the saving throw", "repeats the save", "makes another saving throw", "can make a … saving throw at the end of each of its turns" all state a repeated save.
- `onSuccess`: "none" when a success means the creature is not affected or takes no damage. "half" when it takes half damage. "ends" when it ends the spell or the effect on that creature. "other" for any other stated outcome, including a count of successes that must be reached.
- A save that creatures make at a time set by the caster's turns ("at the end of each of your turns", Earthquake's tremors) is "later".
- For an "initial" save, a success that leaves the creature unaffected is "none", even where the text adds that the spell then ends (Ensnaring Strike). "ends" is for a later save that ends an effect already in place.
- A save a creature makes each time it takes damage from the spell is "on-damage", whether or not it made an earlier save (Heat Metal).
- A save the text limits to once per turn carries `oncePerTurn`, "any-turn" or "own-turn" as `src/schema/common.ts` defines them ("A creature makes this save only once per turn"). Without it, a save made on entering an area and on ending a turn there could come twice in one turn.
- A creature that the text says succeeds automatically is carried on the save as `unless`, in the official words. A change to the roll itself (Advantage, Disadvantage, an automatic failure) is prose.
- `dc` is "spell-save-dc" unless the text prints a number. `target` is set only where the caster makes the save.
- A save the text gives only under a condition carries it as `appliesWhen` or `unless` (Fear's repeated save, made only by a creature that ends its turn out of the caster's line of sight).
- A limit on who makes a save is such a condition, in the official words ("An unwilling creature"). So is the event that makes a creature other than the spell's target save (Sanctuary's attacker).
- Where a spell has two or more saves alike in ability, `when` and outcome, each carries the words or the `label` that tell it apart. A single save made on entering an area or ending a turn there is "initial" and needs no more: the events that bring it about ("Whenever the Emanation enters the space of a creature you can see and whenever a creature you can see enters the Emanation or ends its turn there") are the `timing` of the roll linked to it, not an `appliesWhen` on the save. `appliesWhen` on a save says who saves or whether, never when. Where the save brings about only a condition, the events are the `timing` of that condition (Sleet Storm, Stinking Cloud, Prismatic Wall's Blinded). Where one save brings about a roll and a condition together, the roll carries the `timing` and the condition shares it (Conjure Elemental's Restrained). Where that roll is split into a first and a repeat entry, a condition the same save or hit gives both times is listed once for each, the second with the repeat's `timing` (Black Tentacles, Sunbeam, Conjure Fey). A save itself carries `timing` only where nothing linked to it can: Contagion's third save, which only keeps a condition from ending.

**Damage**

- One entry for each distinct roll the text states, in text order. A roll the text deals again on a different save, or at a different time, is its own entry, linked to that save or carrying that `timing` (Phantasmal Killer's damage on the failed repeated save). Only a restatement with the same save and the same time is not repeated.
- Link by meaning, not by sentence. A roll is dealt on a failed save: `trigger: "failed-save"` and `save` the index of that save, even when the save was stated a sentence earlier, and also when a success halves it (the save's `onSuccess` is then "half"). A roll is dealt when an attack hits: `trigger: "hit"`, whether the attack is the spell's own or one the text names ("when you hit", "whenever you hit it with an attack roll", "on a hit"). A roll dealt with no save and no hit (Magic Missile, damage for ending a turn in an area with no save) has no trigger.
- "hit" is for a hit by the creature the spell arms: the caster, or the creature the spell is cast on. Damage dealt to a creature because it hits the caster or a warded creature (Fire Shield) is not a hit of the spell's: it is unlinked and carries its own `timing`.
- A roll dealt only under a stated condition that is neither a hit nor a failed save carries `appliesWhen`: the official words of that condition ("if it acts in a manner directly counter to your command"). So does a roll that needs a condition on top of its hit or save. A roll the text gives as the other case carries `unless` with the first case's words: Power Word Kill's 12d12 is dealt `unless` "If the target has 100 Hit Points or fewer". A roll dealt later or more than once carries `timing`. A span that says when a recurring roll is dealt is `timing` even where it also says to whom ("each creature that ends its turn within 10 feet of that side"): `appliesWhen` is for a condition that is not a time. A roll with no `appliesWhen`, `unless`, `timing`, `trigger` or `save` is dealt once, when the spell takes effect.
- A linked roll takes its save's `onSuccess`. Where one save halves some linked rolls and not others, the roll that differs carries its own `onSuccess` (Vitriolic Sphere's second roll is "none").
- `types` with several entries means one of them, chosen as the text says or by the table `table` names.
- `perSlot` is the dice added per slot level above the spell's level, on the roll its sentence names. `cantrip` holds the three upgrade values. `modifier` is true where the text adds the spellcasting ability modifier. `target` is set where the damage falls on the caster.
- A roll the shape cannot hold (dice per level of another spell, damage to structures only) is left out, and `damage` goes in `untyped`.
- Where part of a kind can be typed and part cannot, the typed part stays and the kind is listed in `untyped`: Delayed Blast Fireball's 12d6 with its growth unheld, Conjure Celestial's first Healing Light with its repeats unheld.
- A limit on how much in total that no field holds ("The guardian vanishes when it has dealt a total of 60 damage"), or on being affected again ("can’t be affected by this spell again until that creature finishes a Long Rest"), puts the kind in `untyped`.
- A spell that brings in another spell by name (Guards and Wards' Web and Stinking Cloud) does not type that spell's saves, rolls or conditions and does not list them in `untyped`: they belong to the spell named.
- A limit on how often that no field holds ("no more than once each day", "once per round") puts the kind in `untyped`. Once per turn on a save has its own field.
- A roll multiplied by a distance or a count carries the multiplier's words as `appliesWhen` ("for every 5 feet it travels"), beside its `timing`.
- A reduction or a bonus the text limits to once per turn carries `oncePerTurn`, as a save does (Resistance: "A creature can benefit from this spell only once per turn").
- A bonus that belongs to one weapon or object the spell is cast on carries the words that say so (Magic Weapon: "that weapon becomes a magic weapon").

**Conditions**

- List each condition the spell applies to its targets, once for each distinct way it is applied. Conditions the text only ends, prevents, requires or mentions are not listed.
- Link by meaning, as for damage: `trigger: "failed-save"` with `save` when one failed save applies it, `trigger: "hit"` when a hit applies it.
- A condition applied only after several failures, or under any other stated condition, is listed with no link and carries `appliesWhen`: the official words that say when it applies.
- Where one failed save gives a condition and the caster picks which, each is linked to that save and carries the `label` of its option (Command, Eyebite). Where the options have no printed names but the text marks the choice (Blindness/Deafness: "your choice"), each carries those words as `appliesWhen`, so neither reads as always applying. Where neither a name nor such words exist (Bestow Curse's four effects), the values are left out and their kinds go in `untyped`. Flesh to Stone gives Restrained on the failed first save, linked. It gives Petrified only after three failed saves, so Petrified is listed unlinked with `appliesWhen` "If it fails its saves three times".
- A condition the spell gives the caster is a `conditions` entry with `target: "caster"`, so it can carry a link and a condition like any other.
- An effect that falls on a creature other than the spell's targets and the caster (Holy Aura's save and Blinded fall on a Fiend or Undead that hits a warded creature) carries the words that say who and when, in `timing` or `appliesWhen` by how the text states them ("when a Fiend or an Undead hits an affected creature with a melee attack roll" begins "when", so it is `timing`), or is left out. It never reads as falling on the spell's targets.

**Options**

- Where a spell has several named options or effects (Alter Self's Natural Weapons, Control Water's Whirlpool, Symbol's glyphs), a save, a damage roll or a condition that belongs to one of them carries `label`: the printed name of that option. `label` is on all three shapes. An entry with no `label` belongs to the spell as a whole.
- `label` names an option. `appliesWhen` quotes a stated condition. An entry may have both.

**Other fields**

- `healing`, `projectiles`, `extraTargetsPerSlot`, `ac`, `rollModifier`, `damageReduction`, `hitPointMaximum`: as the schema comments define them, only where the text states them in that form.
- `healing` and `rollModifier` carry `appliesWhen`, `unless` and, for healing, `timing` where the text limits them. `rollModifier.to` names the rolls with the same words magic item bonuses use, down to one skill's checks: Pass without Trace is `stealth-checks`, not all ability checks.
- The other fields have no link of their own, so they describe a creature the spell affects. Where the spell's only save is "initial" with `onSuccess: "none"`, failing it is what makes a creature affected, and the field stands (Bane's 1d4 off attack rolls and saves). Where a success has any other outcome, the field would hide a condition, so it is left out and stays prose (Ray of Enfeeblement's 1d8 off damage rolls).
- `healing` is what each target regains. A pool shared out among targets (Mass Heal's 700) is not typed.
- A creature returned to life with a stated number of Hit Points has `healing` with that amount (Revivify's 1). "All its Hit Points" has no number, so `healing` goes in `untyped`.
- Where the caster is one of the spell's targets, an effect on the targets is listed once, with no `target`. `target: "caster"` is for an effect on the caster alone.
- `area`: the region the spell affects, where the text states one shape and one size for it. A size that is a limit on something else ("must fit in a 5-foot Cube") is not an area. Where the caster chooses which creatures in the region are affected or spared ("up to six creatures of your choice in a 40-foot Cube", "each creature of your choice in", "you can designate creatures to be unaffected"), the area is typed with `selective: true`, so an engine does not affect everything in it. Where a spell makes several areas of one size (Meteor Swarm's four), the area is typed once and the number stays prose.
- `attack`: "melee" or "ranged" where the spell has the caster make a melee or ranged spell attack.

## Magic items

Shapes are in `packages/srd/src/schema/magic-items.ts`.

**Spells**

- `spells` lists a spell only where the text lets the item's user cast it: "you can cast", "cast one of the following spells", "to cast the X spell from it". Each entry carries what the text states for that casting: `charges` where casting it expends charges (including a sentence that covers several spells at once: "expend 1 of the cube's charges to cast one of the following spells" gives every listed spell `charges: 1`), `level` where the text names the level it is cast at, `saveDc` where the text gives one.
- `spellEffects` lists spells whose effect the item applies without the user casting: "you gain the effect of the X spell", "as if you had cast", "is under the effect of", "detonates as a level 3 Fireball", and a spell the item casts on its own user. Each entry is `{ id, level?, saveDc? }`, with the level and DC where the text states them. No charges go here.
- A spell cast by a creature the item calls or holds (an efreeti, a figurine's creature), or a spell the text only mentions (what can repair or dispel the item), is in neither list.
- A spell name inside a longer spell name is not that spell.
- A limit the item puts on a spell travels with it: `selfOnly: true` where the user can target only themselves, `appliesWhen` for a limit on what it can do or whom it can affect ("affects Beasts only"), and `label` for the one named option of a spell the item gives (Enlarge or Reduce).

**Bonuses**

- `to` is one of: `armor-class`, `attack-rolls`, `damage-rolls`, `spell-attack-rolls`, `spell-save-dc`, `saving-throws`, `ability-checks`, `initiative`, `proficiency-bonus`, or a skill's checks written `<skill id>-checks` (`athletics-checks`, `sleight-of-hand-checks`). Only a "+N bonus to" one of these is a bonus. A score that is set or raised (an Amulet of Health's Constitution of 19) is not: it stays prose.
- `bonuses` holds a bonus only where it applies whenever the item is worn, wielded or held as the text requires. A bonus that applies only against some creatures, only on one attack, only as a reaction, or only in one form of the item is in `conditionalBonuses` with `appliesWhen`: the condition in the official words.
- A bonus that holds only in one form of the item is conditional, with the form's printed words. A heading that names the form ("Quarterstaff Form Only") is a span of the entry's text and may be the condition.
- A conditional bonus that takes the place of a plain one carries `alternativeTo`, the index of the bonus it replaces, so the two are never added together (the Mace of Smiting's +3 against a Construct replaces its +1).
- A bonus that changes ("increases to +3 when you use the weapon to attack a Construct") is one plain bonus and one conditional bonus.

**Damage**

- One entry per distinct roll, with `role` as the schema defines it. Rolls the text gives as alternatives must not read as both applying: the roll that replaces another carries `alternativeTo`, the index of the roll it replaces, with its condition (Dwarven Thrower's 2d8 against a Giant replaces the 1d8). A roll with `alternativeTo` is dealt in place of the roll it names, and only when that roll's own condition holds too: the Mace of Smiting's 14 replaces the 7, so it needs the 20 as well as the Construct. A condition carries every clause the text gives: a roll that needs a 20 and a target that is not a Construct or an Undead says both, in one span or as `appliesWhen` and `unless`.
- A roll or a save the user must expend charges to bring about carries `charges`, the number expended. One without it costs nothing. Where one expenditure brings about more than one typed effect (the Staff of Withering's extra 2d10 and its save, a Talisman's save and roll), each carries the same `charges` and the same `label`, and the cost is paid once for that label: an engine never adds up the charges of effects that share a label. Where a property that is neither a roll, a save nor a spell costs charges, `charges` goes in `untyped`.
- A roll that grows with the charges spent, or that adds an ability modifier, says so in a typed field, or is left out with `damage` in `untyped`. It is never typed as a flat roll.
- An item has no typed list for conditions or healing. An item whose text gives a condition or restores Hit Points lists `conditions` or `healing` in `untyped`, unless a spell it casts or a row of its table holds the effect.
- A limit on being affected again (the Pipes of the Sewers' swarm that "can’t be swayed by the pipes’ music for the next 24 hours", the Goat of Terror's 24 hours of immunity) is held by no field, so the kind it limits goes in `untyped`, as it does for a spell.
- A fixed amount with no dice uses `amount`.
- `role` "extra" is damage added to a hit the item helps make. Damage dealt through a save the item forces is "effect".
- The hit is part of what "extra" means, so "on a hit" and "when you hit with a melee attack using the staff" are not conditions and give no `appliesWhen`. A limit on which hits count is a condition ("against your sworn enemy", "if the target is a Giant").
- A roll whose dice are printed only in the rows of a table (the Ring of Shooting Stars' spheres) belongs to those rows and is not typed on the item.
- Damage tied to a failed save carries no `appliesWhen` for that, and what causes the save is not a condition on the roll. A roll dealt on a successful save does carry `appliesWhen`.

**Tables**

- Where a die picks one of several spells or effects in a row or a list (the Wand of Wonder's 01–20 row, the Hat of Many Spells, the Oil of Slipperiness's two effects), they are alternatives and must not read as all applying: each after the first carries `alternativeTo`, or the shape says a die picks one, or they are left untyped with the kind in `untyped`.
- A table that lists the spells the user may choose to cast, with what each costs (a staff's spells and charges), is the item's spell list: those spells are `spells` on the item. A table the user rolls on, or that says which of several things the item has (the Necklace of Prayer Beads' beads, the Wand of Wonder), gives effects that belong to its rows.
- An effect stated only in a row of an item's table (Bag of Beans, the Apparatus of the Crab's levers, a wand's random results) belongs to that row. It is not typed on the item, and it puts no kind in the item's `untyped`: the Wand of Wonder's Stunned and Petrified rows do not make the wand list `conditions`.
- A row's typed fields are never the whole of the row. They hold the spells a row casts and the dice a row prints, and nothing else, so an engine resolves a rolled row from the row's text.

**Charges and saves**

- `charges`: the maximum, what is regained and when, and the last-charge roll, as stated.
- `charges` on the item holds the stock and its regain, so a stock alone never puts `charges` in `untyped`. Only a cost or a loss that no field holds does.
- A use is linked to the spell it limits by `spell`, the spell's id, not by a label. A counted number of castings is a use with `count` and `spell` (the Mysterious Deck's Wish, "1d3" times). A budget of time is a use with `minutes` (Boots of Speed). A use spent only under a condition carries it as `appliesWhen` (the Hat of Many Spells: "On a successful check").
- Where each of several things has its own use and no one count holds them (each prayer bead once per dawn), or the use returns at a time no field holds ("in a century"), `uses` goes in `untyped`.
- An `appliesWhen` on a spell says when or whether the user can cast it ("While wearing the cloak in an area of Dim Light or Darkness"), or states a limit the item puts on the spell's targets or options ("affects Beasts only"). Words that describe how the spell works when cast from the item are not a condition and are never an `appliesWhen`. But where they change or fix how the spell works (no Concentration needed, twice the area, a destination fixed by the item, a spell that ends if the item is removed), an engine that cast the spell in the ordinary way would go wrong, so `spells` goes in `untyped`. `spells` is untyped for a spell the user can cast that no list holds, or for a cost, a limit or a change on a listed spell that no field holds.
- A `label` is the property's printed name. Where a limited property has no printed name, the label is the few official words that name what it does ("coat the blade with poison").
- `uses`: one entry for each separately limited property. An entry with no `label` and no `spell` limits the whole item. So a use that limits one property of an item that has others always carries the `label` of that property or the `spell` it limits, even when it is the item's only use (the Thunderous Greatclub's Earthquake does not stop its Clap of Thunder). A limit that is a budget of time and not a count is typed as that, or left out with `uses` in `untyped`. A listed spell carries its own limit where the text gives one.
- `saves`: each distinct save the item forces, once, with ability and DC, and `onSuccess`: what a success does (none, half, other), from the shared outcome list. A creature that succeeds automatically is `unless` on the save. A save made only under a stated condition carries `appliesWhen` or `unless`. An item save has no timing field, so where the text repeats a save, `saves` goes in `untyped`. Where an item has several saves with different DCs, each carries a `label`: the short printed name, or the few official words, that tell the saves apart.

## Monsters

Shapes are in `packages/srd/src/schema/monsters.ts`.

- A save that only some targets make carries `appliesWhen`: the official words of the limit ("If the target is a Humanoid"). So does a condition or a roll that rides that save.
- A staged outcome is not a condition. The first stage is linked to the failed save or the hit with no `appliesWhen`. A later stage, which needs something more, carries the words that say what. The stage itself is typed in `on` (first failure, second failure, failure by a margin, with the margin on the save), so a staged outcome carries no `label`.
- Swallowing and engulfing. What holds only while a target is swallowed or engulfed depends on the swallow or engulf having happened. Where that happens on every hit or failed save, the conditions and recurring rolls are linked to the hit or failure and carry nothing more. Where it happens only under a stated gate ("If the target is a Large or smaller creature"), each of them carries that gate as `appliesWhen`, the same span on each.
- Who makes a save is in the save's `targets`, in the official words. A limit printed inside that phrase stays there ("each creature in a 15-foot Emanation originating from the kraken while it is underwater"). A limit printed anywhere else is an `appliesWhen` on the save.
- What lasts only as long as something else does carries the printed words that say so as `appliesWhen`, on every roll and condition they govern, in every monster that prints them: "Until the grapple ends", "While attached", "While in the whirlwind". This holds whether or not the grapple was a choice. A gate on whether the grapple happens at all stays on the Grappled condition. Without the words, an engine keeps dealing the damage after the target breaks free.
- A spell the monster can cast only on itself carries `selfOnly: true`, whether the text prints "(self only)" or says it "casts Invisibility on itself". A casting the text limits by place or state carries the words as `appliesWhen` ("While on the Ethereal Plane").
- A condition that depends on another creature's save carries the whole span that states that save ("…the behir must succeed on a DC 14 Constitution saving throw at the end of that turn or regurgitate the creature").
- A roll with `timing` is dealt at that time, not when the action lands. Where one sentence gives two rolls one time, both carry it.
- Alternatives must not read as both applying. Where an action lets the monster do one thing instead of another, the alternative carries the words that say when it is available.
- Recurring damage dealt after a failed save is linked to that save.
- A roll or a condition that falls on the monster itself (a vampire in sunlight, a troll's lost limb) carries `self: true`. Without it, a roll or a condition falls on the action's target.
- Where one action has several named options with a save each, each save carries `label`, and so does what rides it.

## Classes

Shapes are in `packages/srd/src/schema/classes.ts`.

- `activation` lists the kinds of action it takes to use the feature. An action, or "no action required", that only ends or moves an effect already in place, or restores a use of this same feature, is not activation.
- Standing values and triggered values. `attacks`, `criticalHit`, `freeCast`, and a change to Speed or Armor Class are standing: they hold whenever the character has the feature, so any limit the text puts on them (one weapon, on yourself, only in dim light) must be typed. `dice`, `damageTypes` and `save` are triggered: they describe what happens when the feature takes effect, and the feature's own text says when that is (which hit, which weapon, which action). The hit or the action that sets the feature off is not repeated on them. But a limit on which weapon, which kind of attack or which target the feature works with is a limit, and is typed: Eldritch Smite works only with the pact weapon, Empowered Strikes only with Unarmed Strikes. So is how often it can happen (once per turn), a further condition on the target, and a choice within the feature.
- An area whose creatures the user chooses is typed with `selective: true`, as for spells.
- A save, a roll or a count that holds only for some targets, only for one choice within the feature, or only with one weapon, carries that limit in a typed field or as `appliesWhen`. If the shape cannot hold it, the value is not typed.
- A cost that a parent feature states for all of its options (Channel Divinity) is typed on each option.
- A value belongs to the feature's user. What a familiar or a summoned creature does is not typed on the feature.
- A feature's `dice` is its main roll. A roll inside one sub-benefit is not typed there.

## What is left out

A reader's file keeps `notes` in plain words, for people. They are not shipped. What ships is `untyped`: the entry's own list of the kinds of effect its typed fields do not fully hold. Both the builder and the reader set it, and the check compares them.
