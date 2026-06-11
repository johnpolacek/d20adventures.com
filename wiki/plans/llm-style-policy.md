# LLM Style Policy

[← All plans](index.md) · **Status:** Implemented

Decision record for universal user-visible LLM prose style: no em dashes, no semicolons, simple grammar, and concise responses.

## Implementation shape
- Add a shared AI SDK system prompt instructing all language calls to use short, clear sentences and avoid em dashes, dash variants, and semicolons in prose.
- Sanitize generated user-visible prose after generation while preserving machine syntax such as JSON keys, IDs, paths, URLs, and `[DiceRoll:...]` shortcodes.
- Tighten turn-advancement, NPC-turn, and player-reply prompts from multi-paragraph verbose prose to compact one- or two-paragraph output.

## Validation
- Verify shortcode preservation and punctuation cleanup with a lightweight TSX validation script.
- Run TypeScript, whitespace diff checks, and targeted prompt searches.
- Record any existing toolchain blockers separately from implementation failures.
