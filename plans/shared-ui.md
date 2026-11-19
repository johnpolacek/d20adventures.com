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
2. Untangle. Six files import site code: `ui/sonner` (`next-themes`), `ui/character-select-card`, `ui/dice-roll`, `ui/image-upload`, `stage/city-map`, `stage/feedback`. Each stays in `components/` or takes the site code as a prop. Decide here whether `adventure/module-cover` and `adventure/use-sheet-view` move too.
3. Typography. Move `components/typography`. No Radix, no site coupling.
4. UI. Move `components/ui` and convert each Radix component to UI SDK as it moves, in small batches. Restyle with the existing Tailwind classes on UI SDK's `data-slot` and state attributes. Open questions for this stage: the UI SDK answer to Radix `Slot` (`asChild` on `button`, `badge`), and whether `sonner` becomes UI SDK Toast.
5. Stage. Move `components/stage`. It already depends only on `@d20/gm-core` and `@d20/stage`.
6. Lock down. One `@source` line for the package in each app. Narrow the desktop `@` alias so it cannot reach site code. Fail the build on Next, Clerk or Convex imports in `packages/ui`. Remove the Radix dependencies.
