# @d20/ui

Plain React shared by the website and the desktop app. It imports nothing from Next, Clerk, Convex or `@/`. If a component needs site code, the site passes it in, or the component stays in `components/`. `scripts/check-imports.mjs` fails both builds on a banned import.

## UI SDK

- Pinned at an exact beta version. Expect API changes on upgrade.
- Docs for the installed version ship in `node_modules/@ui-sdk/react/docs`. Start at `llms.txt`, then `components/<name>.md`.
- Both global stylesheets declare `@layer ui-sdk;` first. We do not import `web.css`. Our own classes style everything.
- `render={<a />}` takes the place of `asChild` and `Slot`.
- Popups use the browser top layer, with no portals. Keep popups outside clickable cards and links, since their clicks bubble.
- Use our wrappers, not raw `button`, `input`, `textarea` or `label`, and no hand-built pop-ups: `toast`, `tooltip` (`Tip`, not HTML `title`), `menu`, `drawer`, `file-input`.
- `Button variant="plain"` and `plain` on `Input`, `Textarea` and `Label` drop our default look for controls styled by their callers.
- UI SDK modules already carry `"use client"`. Our wrappers need it only if they hold state or callbacks.
- Each component has a tile on `/ui`.

## Exports

The package exports `.tsx` files by wildcard and each `.ts` file by name. Tailwind in both apps picks up classes from `packages/ui/src`.

## Known gaps

- The desktop tsconfig keeps `@/*` wide, because `HostedSummary` and `GuestHero` are types inferred from the site's Convex server code. Writing them out by hand would let it narrow to match Vite.
- The outline badge, the white card and the dialog title look wrong on `/ui`.
