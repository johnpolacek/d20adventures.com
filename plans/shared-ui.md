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

1. Package shell. Done 2026-11-19. `@d20/ui` holds `cn`, wired into both apps. Dependencies were also brought up to date on minor versions before stage 2.
2. Untangle. Done 2026-11-19. `character-select-card` and `dice-roll` moved to `components/adventure`, `image-upload` to `components/forms`. `stage/city-map` imports `@d20/gm-core/citymap` directly. `lib/feedback/shared.ts` became `@d20/ui/feedback-rules`, used by the site's feedback routes and both hosts. `ui/sonner` was already gone. The shared folders now import only `cn` from `@/lib/utils` and `graphics/background/Parchment`.
3. Typography. Done 2026-11-19. Now `@d20/ui/typography/heading` and `@d20/ui/typography/styles`. The package exports `.tsx` files by wildcard and each `.ts` file by name. Tailwind in both apps picks up classes from `packages/ui/src`.
4. UI. Done 2026-11-19. `components/ui` and `graphics/background/Parchment` are gone, all in `@d20/ui` (Parchment as `graphics/parchment`, `ui/utils` as `scroll`). Rebuilt on UI SDK from its own docs: `button`, `input`, `textarea`, `label`, `switch`, `dialog`, `alert-dialog`, `hover-card`, `select`, `avatar`, `collapsible`, `pagination`. The rest is plain React and moved as is. `asChild` became `render`, or a plain element with `buttonClassName` and `buttonStyle` where it only looked like a button. Button sizes `lg` and `sm` add no styles, as before. Each component has a tile on `/ui`. Known look issues there: the outline badge, the white card and the dialog title.
5. Stage. Done 2026-11-19. `components/stage` is now `@d20/ui/stage/*`, and `module-cover` and `use-sheet-view` are `@d20/ui/adventure/*`. `useStage` no longer imports `asset-library/play`: callers pass it as `play`. The package depends on `@d20/gm-core`, `@d20/stage` and `three`.
6. Lock down. Done 2026-11-19. The desktop has one `@source`, for the package. The site needs none, since Tailwind scans the repo. The desktop's Vite `@` alias reaches only `asset-library`, `content` and `lib/citymap`, so a value import of site code fails its build. Its tsconfig keeps `@/*` wide, because `HostedSummary` and `GuestHero` are types inferred from the site's Convex server code. Type imports vanish at build. `packages/ui/scripts/check-imports.mjs` fails both builds on Next, Clerk, Convex or `@/` imports in the package. `hero-rules`, `use-hero-rules` and the screenshot shrink moved into the package. The Radix dependencies are gone. `sonner` stays for now.

## Full UI SDK, 2026-11-19

No raw `button`, `input`, `textarea` or `label` remain in shipped or dev code, and no hand-built pop-ups. New wrappers: `toast` (replaces `sonner`), `tooltip` (`Tip` replaces HTML `title`), `menu`, `drawer`, `file-input`. `Button variant="plain"` and `plain` on `Input`, `Textarea` and `Label` drop our default look for controls styled by their callers. `title=` left in the code is a prop of our own components.

## Follow-ups

- Write the hosted wire types (`HostedSummary`, `GuestHero`) out by hand, then narrow the desktop tsconfig to match Vite.
- Fix the look of the outline badge, the white card and the dialog title.

## UI SDK notes

- Installed in `packages/ui`, pinned at `0.1.0-beta.13`. Docs for that version ship in `node_modules/@ui-sdk/react/docs`. Start at `llms.txt`, then `components/<name>.md`.
- Both global stylesheets declare `@layer ui-sdk;` first. We do not import `web.css`. Our own classes style everything.
- `render={<a />}` replaces Radix `asChild` and `Slot`.
- Popups use the browser top layer. No portals. Keep popups outside clickable cards and links, since their clicks bubble.
- Toast with `OverlayHost` replaces `sonner`. Drawer replaces `sheet`. Calendar and Date Picker replace `react-day-picker`.
- UI SDK modules already carry `"use client"`. Our wrappers need it only if they hold state or callbacks.
- The agent bridge (`@ui-sdk/react/agent`) is out of scope here. It may help in-browser playtests later.
