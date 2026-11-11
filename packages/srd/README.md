# @d20/srd

The System Reference Document 5.2.1 as typed data. Pure TypeScript and JSON. Zod is the only dependency.

This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Any work that ships this data must show that statement. It is exported as `srdAttribution`.

## Use

```ts
import { spellById } from "@d20/srd/spells"
import { monsters } from "@d20/srd/monsters"
import { type AbilityId, srdAttribution } from "@d20/srd"
```

Import data by category, so a host bundles only what it uses. `@d20/srd` itself holds shared ids, types and the attribution line, and no data. A host that type-checks this package's source needs `resolveJsonModule`.

## What is in it

| File | Entries | Holds |
|---|---|---|
| `abilities` | 6 | The six abilities and their skills |
| `skills` | 18 | Each skill and its ability |
| `conditions` | 15 | Full rules text, with Exhaustion's numbers typed |
| `damage-types` | 13 | |
| `languages` | 19 | Standard and rare |
| `alignments` | 10 | The nine, and Unaligned |
| `magic-schools` | 8 | |
| `species` | 9 | Traits, lineages and ancestries, with typed mechanics |
| `backgrounds` | 4 | Ability scores, feat, proficiencies, equipment |
| `feats` | 17 | Origin, general, fighting style and epic boon |
| `origin-rules` | 10 | The shared rules of backgrounds, species and feats |
| `classes` | 12 | Core traits, 20 level rows with every column, spell lists |
| `class-features` | 231 | Every class and subclass feature, with options |
| `subclasses` | 12 | The SRD subclass of each class |
| `spells` | 339 | Header fields, typed mechanics, tables and stat blocks |
| `monsters` | 330 | Every stat block, with typed actions |
| `equipment` | 248 | Weapons, armor, tools, gear, mounts, vehicles, services |
| `weapon-properties` | 10 | |
| `weapon-masteries` | 8 | |
| `poisons` | 14 | |
| `coins` | 5 | |
| `equipment-rules` | 24 | Selling, armor training, proficiency, crafting |
| `magic-items` | 258 | One entry per official heading, with variants |
| `magic-item-rules` | 35 | Rarity values, categories, attunement, crafting |

Not in this package: the rules of play themselves (the "Playing the Game" chapter and the Rules Glossary beyond conditions). The engine encodes those.

## Layout

- `data/<file>.json`: the generated data. Never edit by hand.
- `src/schema/<category>.ts`: the Zod schemas and types.
- `src/<file>.ts`: the typed data and a lookup by id.
- `src/schema/common.ts`: ids and shapes every category shares.
- `scripts/builders/<category>.ts`: reads the pinned sources and writes the data.
- `scripts/overrides/<category>.ts`: recorded corrections, each citing the official page.
- `scripts/verify/<category>.ts`: checks the data against the official text.
- `scripts/verify/package.ts` and `references.ts`: checks across the whole package.
- `scripts/lib/registry.ts`: the list of every data file and its schema.
- `sources/sources.lock.json`: every source, pinned by commit and hash.
- `sources/official/srd-5.2.1.txt`: the text of the official PDF, which the checks read.

## Sources

| Source | Role |
|---|---|
| Official SRD 5.2.1 PDF | Settles every question. Its text is committed. |
| `5e-bits/5e-database`, `src/2024/en` | Structured starting point where it is reliable. MIT. |
| Open5e, `srd-2024` | Second opinion in checks. Nothing is copied from it. |

Both upstream sources hold errors: wrong prices, wrong dice, missing items. So builders take wording, tables and anything the upstream gets wrong from the official text. Origins, equipment and magic items are built from the official text alone. The checks record each upstream error they meet.

Upstream files are downloaded to `.cache`, which Git ignores. A build refuses a file that does not match its locked hash.

## Commands

Run from the repo root.

- `pnpm test:srd`: type check, then every check. Needs no network.
- `pnpm --filter @d20/srd verify [name…] [--verbose]`: run checks. `--verbose` lists every waiver and upstream error.
- `pnpm --filter @d20/srd sources`: download the pinned upstream files.
- `pnpm --filter @d20/srd build [name…]`: regenerate data.
- `pnpm --filter @d20/srd fresh`: rebuild without writing, and fail if the committed data differs.

## How the checks work

A check reads only `data/*.json` and the official text. It parses the official text with its own code, not the builder's, so a builder mistake cannot hide in a check that repeats it.

Each category checks:

- every official name is in the data, and every data name is official
- every mechanical field, entry by entry, against that entry's own block of official text
- every sentence of prose against the official wording
- each entry's page

The package checks:

- every entry parses with its strict schema
- every id that points at another entry resolves, and no reference field goes unlisted
- every word in the data is a word the official text prints, which catches words broken or fused at a PDF line end
- no stray marks from PDF extraction

A check line reads `(passed/total, N waived, M upstream errors)`.

- A **failure** is fixed in a builder or by an override. A check is never loosened to pass.
- A **waiver** is one named difference that is real and explained. Each is printed with `--verbose`.
- An **upstream error** is a value where a third-party source disagrees with the official text. The data follows the official text. It is kept on record, not counted as a waiver.

## Where the official text disagrees with itself

The rule: an entry's own block wins, and the data is made consistent with it.

| Entry | The text says | The data holds |
|---|---|---|
| Flaming Sphere | Its header (p. 132) reads Conjuration. Three class lists read Evocation. | Conjuration |
| Phantasmal Force | Its header (p. 151) names Bard, Sorcerer, Wizard. No class list prints it. | On all three class lists |
| Mind Spike | Its header (p. 149) names Sorcerer. The Sorcerer list omits it. | On the Sorcerer list |
| Archmage | XP 8,000 at CR 12 (p. 305). The table gives 8,400. | 8,000, as printed |
| Gray Ooze | Initiative −2 (13) (p. 293). | As printed |
| Invisible Stalker | Initiative +7 (22) (p. 301). | As printed |

The Wizard's spellbook is described in the Wizard's Spellcasting feature (p. 78), not in Equipment, so it has no equipment entry.

## What is typed and what stays prose

Every entry keeps the official wording in full. On top of that, values an engine computes with are typed where the text states them plainly: numbers, dice, damage types, save abilities and DCs, ranges, areas, uses and what restores them, level scaling.

Effects the text states only in sentences stay as prose for the engine stages to encode. Examples: what each condition does beyond its text, monster Multiattack, most feat and class feature effects that depend on a trigger, spell effects with no fixed number.

A check re-reads each typed value from the entry's own official text. A few fields are readings of a sentence rather than a printed value, and the engine stages should treat them as such:

- Monsters: `conditions`, `area` and the `on` tag of a damage part are read by pattern from the feature text. The check confirms each is named in that text, not which clause it belongs to. Features that cast a named spell outside an "At Will" or "N/Day" list keep it in prose only.
- Spells: `onSuccess` for a few spells with repeated saves, such as Flesh to Stone, is "other".
- Magic items: `consumable` is set from the item's category and from wording that says it is used up.
- Equipment: the food, drink and lodging table has no group heading on its second half, so those rows are matched to their tier by order.

## Rules for the data

- Our shape, not an upstream one. Cross references are ids.
- Ids are lowercase words joined by hyphens, made from the official name.
- Every entry has `id`, `name` and `page`, the official PDF page where its text begins.
- Objects are strict. A field the schema does not name is an error.
- Numbers are numbers. Distances are feet. Dice read `2d6 + 3`.
- Prose is the SRD's own wording with its typographic quotes, and one newline between paragraphs.
- A field that does not apply is left out. There is no `null` and no empty string.

## Updating a source

Change the commit in the lock, download the files, record their new hashes, rebuild, and run the checks. An override that no longer changes anything fails the build, so a stale correction cannot stay. A new data file must be added to `scripts/lib/registry.ts`, and a new reference field to `scripts/verify/references.ts`. The package checks fail until they are.
