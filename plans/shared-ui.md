# Shared UI

Goal: one UI package, `packages/ui` (`@d20/ui`), used by the website and the desktop app. Opened 2026-11-19.

## Principle

The package is plain React. It imports nothing from Next, Clerk or Convex, the same rule as `packages/gm-core`. If a component needs site code, the site passes it in, or the component stays in `components/`.

## Owner decisions, 2026-11-19

- Build `packages/ui` as a real workspace package, not the desktop's `@` alias into the repo root.
- Move off Radix to UI SDK (`@ui-sdk/react`, `@ui-sdk/core`, Apache-2.0) during the move, not after.
- UI SDK is in beta (0.1.0-beta.13 today). Pin exact versions and expect API changes.
- One stage, one commit. Each stage ends with both typechecks and both builds passing.

## Today

- The desktop's Vite and tsconfig map `@` to the repo root, so it imports site files directly.
- 10 of 25 desktop files import from `components/ui`, `typography`, `stage` and `adventure`.
- `components/ui` uses about 20 Radix packages, plus `class-variance-authority`, `sonner`, `react-day-picker`.
- Importers: `ui` 112 files, `typography` 29, `stage` 19.

## Stages

1. Package shell. Create `@d20/ui` with `cn`. Wire it into both apps. Nothing else moves.
1. Done 2026-11-19. Dependencies were also brought up to date on minor versions before stage 2.
2. Untangle. Done 2026-11-19. `character-select-card` and `dice-roll` moved to `components/adventure`, `image-upload` to `components/forms`. `stage/city-map` imports `@d20/gm-core/citymap` directly. `lib/feedback/shared.ts` became `@d20/ui/feedback-rules`, used by the site's feedback routes and both hosts. `ui/sonner` was already gone. The shared folders now import only `cn` from `@/lib/utils` and `graphics/background/Parchment`.
3. Typography. Move `components/typography`. No Radix, no site coupling.
4. UI. Move `components/ui`, with `graphics/background/Parchment`, which `ui/image-header` uses, and convert each Radix component to UI SDK as it moves, in small batches. Restyle with the existing Tailwind classes on UI SDK's `data-slot` and state attributes. Open questions for this stage: the UI SDK answer to Radix `Slot` (`asChild` on `button`, `badge`), and whether `sonner` becomes UI SDK Toast.
5. Stage. Move `components/stage`, with `adventure/module-cover` and `adventure/use-sheet-view`, which the desktop uses. All three depend only on React, `@d20/gm-core` and `@d20/stage`.
6. Lock down. One `@source` line for the package in each app. Narrow the desktop `@` alias so it cannot reach site code. Fail the build on Next, Clerk or Convex imports in `packages/ui`. Remove the Radix dependencies.
