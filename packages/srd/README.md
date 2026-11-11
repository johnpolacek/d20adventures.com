# @d20/srd

The System Reference Document 5.2.1 as typed data. Pure TypeScript and JSON. Zod is the only dependency.

This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

## Layout

- `data/<category>.json`: the generated data. Never edit by hand.
- `src/schema/<category>.ts`: the Zod schema and types of a category.
- `src/<category>.ts`: the typed data and its lookups. Import by category: `import { spells } from "@d20/srd/spells"`.
- `src/index.ts`: shared ids, types and the attribution line. No data.
- `scripts/builders/<category>.ts`: reads the pinned base source and writes the data.
- `scripts/overrides/<category>.ts`: recorded corrections to the base source, each citing the official page.
- `scripts/verify/<category>.ts`: checks the data against the official text.
- `sources/sources.lock.json`: every source, pinned by commit and hash.
- `sources/official/srd-5.2.1.txt`: the text of the official PDF, which the checks read.

## Sources

| Source | Role |
|---|---|
| Official SRD 5.2.1 PDF | Settles every question. Its text is committed. |
| `5e-bits/5e-database`, `src/2024/en` | Base for the generated data. MIT. |
| Open5e, `srd-2024` | Second opinion in checks. Nothing is copied from it. |

Upstream files are downloaded to `.cache`, which Git ignores. A build refuses a file that does not match its locked hash.

## Commands

Run from the repo root.

- `pnpm --filter @d20/srd sources`: download the pinned upstream files.
- `pnpm --filter @d20/srd build [category…]`: regenerate data.
- `pnpm --filter @d20/srd verify [category…] [--verbose]`: check data against the official text.
- `pnpm test:srd`: type check, then verify. Needs no network.

## Rules for the data

- Our shape, not the upstream one. No `url` fields. Cross references are ids.
- Ids are lowercase words joined by hyphens.
- Every entry has `id`, `name` and `page`, the official PDF page where its text begins.
- Objects are strict. A field the schema does not name is an error.
- Numbers are numbers. Distances are feet. Dice read `2d6 + 3`.
- Prose is the SRD's own wording with its typographic quotes, and one newline between paragraphs.
- A field that does not apply is left out. Do not write `null` or an empty string.
- Where the base source is wrong, add an override with the page that proves it. A check that fails is fixed in the build or by an override, never by loosening the check.
- A waiver in a check names one entry and the reason. It is printed on every run.

## Updating a source

Change the commit in the lock, download the files, record their new hashes, rebuild, and run the checks. An override that no longer changes anything fails the build, so stale corrections are removed.
