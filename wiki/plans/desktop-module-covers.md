# Desktop module covers

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop direction](desktop-local-play.md)

Status: In progress, 2026-10-04, on main.

Owner request, 2026-10-04: "I want each adventure page to have some art that feels like a D&D module. can you update the layout." The adventure page is the desktop app's New game screen, which showed only a title and a teaser.

## Scope

- Art: `scripts/adventure-covers.ts` paints one portrait cover per bundled adventure with the image model, a dramatic scene in the manner of a classic tabletop module cover, conditioned on the adventure's own art. Covers live in `public/stage/covers/`, so the desktop build copies them.
- Layout: the New game screen leads with a module cover beside the party setup. Our own trade dress, no publisher marks: a coloured border per adventure, a top band with the D20 Adventures wordmark and a module code, the title over the painting, and a caption with the player count and the setting.
- Codes and colours are a small map in the desktop app, so the owner can change them.

## Validation

- Desktop typecheck, scoped Biome, desktop tests.
- The screen rendered for each adventure, checked for legibility of the title and the caption over the art.
