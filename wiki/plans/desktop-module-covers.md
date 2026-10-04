# Desktop module covers

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop direction](desktop-local-play.md)

Status: Implemented on main, 2026-10-04, pending owner review.

Owner request, 2026-10-04: "I want each adventure page to have some art that feels like a D&D module. can you update the layout." The adventure page is the desktop app's New game screen, which showed only a title and a teaser.

## Scope

- Art: `scripts/adventure-covers.ts` paints one portrait cover per bundled adventure with the image model, a dramatic scene in the manner of a classic tabletop module cover, conditioned on the adventure's own art. Covers live in `public/stage/covers/`, so the desktop build copies them.
- Layout: the New game screen leads with a module cover beside the party setup. Our own trade dress, no publisher marks: a coloured border per adventure, a top band with the D20 Adventures wordmark and a module code, the title over the painting, and a caption with the player count and the setting.
- Codes and colours are a small map in the desktop app, so the owner can change them.

## Validation

- Desktop typecheck, scoped Biome, desktop tests.
- The screen rendered for each adventure, checked for legibility of the title and the caption over the art.

## Results

- Covers painted with `gemini-3.1-flash-image` at 3:4 and published at 960 by 1280, 220 to 300 KB each. The Midnight Summons and Covert Cargo were repainted with the characters' standees as references: the first pass made Thalbern a woman and Lyra a man.
- Trade dress: M1 The Road to Kordavos in green, M2 The Midnight Summons in purple, M3 Covert Cargo in teal, M4 March of Davos in red. The top band reads D20 Adventures and the setting, the title sits over the painting, and the caption gives the player count.
- The New game panel widened to 1160 px: the cover on the left, the adventure, the party and the heroes on the right.
- Desktop typecheck, scoped Biome and 25 desktop tests pass. All four adventures rendered in the dev app with the titles and captions legible.

