# Sidebar Section & Scene Navigation

[← All plans](index.md) · **Status:** Implemented

Refactor the Adventure Plan editor from a full long-form structural editor into a focused prose workflow driven by section and scene selection.

## Planned behavior
- Default the editor to the first section and first scene.
- Use the sidebar to select top-level utility panels, sections, scenes within the selected section, and encounters within the selected scene.
- Render editable section title and summary, the selected scene title and summary, and all selected-scene encounters expanded in order.
- Keep structural controls out of the focused prose flow; future structural edits happen through chat or a dedicated admin surface.
- Use scroll-spy to highlight the visible encounter while scrolling the selected scene.
- Auto-save prose changes silently with error-only feedback.

## Validation
- `pnpm exec tsc --noEmit` passed after implementation.
- `pnpm build` passed; static generation reported the existing missing `SENDGRID_API_KEY` warning.
- `pnpm check` is blocked by the existing Biome 1.9 schema configuration under Biome 2.4.6 before source files are checked.
