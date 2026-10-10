# Desktop site style

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop direction](desktop-local-play.md) · [Design brief](../sources/design-brief.md)

Status: Proposed 2026-10-10. Audit done. No code changed. Three owner decisions open.

Owner request, 2026-10-10: "I think the style of UI on the desktop app is too different from the website and I prefer the design of the website. please do a thorough style pass and make a plan to comprehensively update the UI of the app to look more like the website"

## Audit

### Method

- Read every desktop screen in `apps/desktop/src` and every HUD component in `components/stage`.
- Read the website's layout, home, setting, adventure list, character select, turn UI, character sheet, and shared UI components.
- Counted colour, font, border, and radius classes on both sides.
- Took screenshots of the production website at 1440 by 900: home, adventure list, character select, setting.
- Desktop source was read at `feature/covert-cargo-rescue` (580bbdf), which is ahead of main on `pages.tsx`.

Limits:

- No desktop screenshots. The app does not render in a browser without the Tauri bridge, and the checkout was mid-merge on `feature/host-mode` during the audit.
- `hosted-lobby.tsx` and `stage-play.tsx` on `feature/host-mode` were not audited.

### Finding

The app and the website share the display font, the d20 painting, and the epic button. Almost everything else differs.

- The website is black, blue, indigo, and amber, with mono labels and large rounded cards ringed in black.
- The app is brown, gold, and cream, with tracked sans labels and small square-cornered leather controls.
- The 2026-10-08 pass copied the title screen and the page layout. It kept the stage HUD's palette and controls, so the pages still read as the HUD, not the site.

### Two visual languages

| | Website | Desktop app |
|---|---|---|
| Ground | Pure black. Paintings run full bleed and fade to black. | Brown ink `#1c1410`. The d20 painting under a brown wash. |
| Accent | Blue buttons, the indigo `primary` scale for rings and labels, amber for names and section labels. | Gold `#e3b67c`, brass, leather. No blue or indigo except the epic button. |
| Body text | Serif, white, on an 18px root. | Serif, cream, fixed 13 to 15px on a 16px root. |
| Labels | Syne Mono, `text-xxs` or `text-xs`, uppercase, `text-primary-200`. Mono chips on `black/80` or `amber-500`. | Rethink Sans, 9 to 12px, uppercase, tracking 0.2 to 0.3em, gold (`eyebrow`). |
| Display | Cinzel Decorative, white, with a heavy black glow. Character names in amber. | Cinzel Decorative, cream or gold. |
| Buttons | Epic: blue capsule with stone texture and bevel. Emboss: blue with hand-drawn corners. Outline: navy `blue-950/70`, rounded-md. | Epic for the main action only. Otherwise `Pill` (3px corners, leather or brass) and a white capsule (`OutlineButton`) the website does not have. |
| Cards | `bg-black/80`, `border-white/20`, `ring-[6px] ring-black`, `rounded-xl`. Hover ring `primary-500`. 16:9 art, title over a black fade, centred copy, centred Play. | 3:4 module covers, 4 to 8px corners, gold hover border, left-aligned copy, icon detail rows, sans price tags. |
| Panels | Black gradients with `border-white/20`. The character sheet is a `primary-900` gradient with `border-primary-600`. | `panel`: translucent brown grain with blur and a cream hairline. |
| Section heads | Amber Cinzel on a `bg-black/50` plate. Image headers carry an amber plate ringed in black and a rough rule. | Gold Cinzel, centred, no plate. |
| Chrome | Parchment header with the logo and wordmark. Black footer. | No header. A capsule nav row. Account badge top right. |
| Fields | `border-white/30` on black. | `bg-stage-ink/70`, cream hairline, gold focus. |
| Portraits | Unfiltered. | Sepia and desaturated in 6 files. |

### Counts

- Website play, setup, and page components: `font-mono` 36, `text-primary-200` 26, `text-amber-300` or `-400` 37, `ring-8` or `ring-4` 27.
- Desktop screens and HUD: `font-mono` 0, `primary-*` 0, `amber-*` 0.
- About 230 uses of `stage-*` classes across the HUD, desktop screens, the website's link page, and two dev pages. Gold 59, cream 44, ink 27, line 27, muted 26, brass 23.
- About 55 uses of 30 warm hex literals in `components/stage`.

### Already shared

- Cinzel Decorative and Rethink Sans.
- `components/ui/button.tsx`, so the epic button is the website's own.
- `textShadowSpreadLight` and the title screen's copy and painting.
- The textures: `buried.png`, `black-paper.png`, `parchment-texture.png`, `paper-texture.png`, `texture-line.png`.

### Gaps in the desktop theme

- `apps/desktop/src/style.css` defines no `primary-*` scale, no `text-xxs`, and no Syne Mono. The website's `emboss` button and any `primary-*` class render without colour there.
- About 160 lines of keyframes and `stage-*` utilities are duplicated between `app/globals.css` and the desktop stylesheet.
- The desktop asset copy in `scripts/build-runtime.ts` takes `backgrounds` and `art` only. The logo `public/images/d20.jpg` is not copied.

### Screens

| Screen | File | Gap |
|---|---|---|
| Title | `home.tsx` | Closest to the site. No header. White capsule nav. Gold save line. |
| Page shell | `pages.tsx` `PageShell` | Brown wash over the painting. Capsule nav. No header. |
| Adventures | `pages.tsx` | Gold section titles. 3:4 covers. Icon detail rows. Sans tags. Leather Remove pill. |
| Characters | `pages.tsx` | Brass portrait borders, sepia filter, cream names. The site uses amber names and ringed black cards. |
| Settings | `pages.tsx` | The realm card already uses the site's card. Copy size and colour differ. |
| New game | `new-game.tsx` | Brown `panel` modal. `Pill` tabs. Leather party rows. Native select. Gold eyebrows. |
| Locked adventure | `new-game.tsx` | Brass lock badge. Leather price box. |
| Hero creator | `hero-creator.tsx` | Brown `panel` dialog. Ink fields. Gold eyebrows. `Pill` choices. |
| Account | `account.tsx` | Parchment code tiles. Brown panel. `Pill` actions. |
| Play, inline cards | `play.tsx` | End card, round card, scene settings, and the error alert use `panel` and `Pill`. |
| Stage HUD | `components/stage/*` | All brown and gold. Shared with the website's stage pages. |
| Link page, website | `app/desktop/link/link-desktop.tsx` | A website page built in the app's look. It should follow the site too. |

## Target

One look. The website's design is the source. The app uses the site's tokens and components, not copies of them.

### Mapping

| Now | Becomes |
|---|---|
| `stage-ink` ground | Black. |
| `panel` | `bg-black/80`, `border-white/20`, `ring-4 ring-black/30`, `rounded-xl`. Keep the blur over the stage. |
| `eyebrow` | `font-mono text-xxs uppercase tracking-wider text-primary-200`. |
| `Pill`, idle | The site's outline button: `bg-blue-950/70`, `border-blue-200/20`, `rounded-md`. |
| `Pill`, active | Blue fill with the stone texture, as a small epic. |
| `OutlineButton` | Removed. Nav moves into the header. |
| `IconButton` | Round, `bg-black/70`, `border-white/20`, hover ring `primary-500`. |
| Gold names and values | `text-amber-300`. |
| Gold section titles | Amber Cinzel on a `bg-black/50` plate. |
| Cream, muted, sage text | White, `white/70`, `white/85`. |
| Brass borders | `border-white/20`, or `primary-600` when selected. |
| Gold hairline rules | The site's `texture-line` rule. |
| Parchment fields and tiles | The site's `paper` style with the parchment overlay. |
| Sepia portrait filter | Removed. |
| Success and failure greens and reds | The site's `green-400` and `red-400`. |

## Owner decisions

Work can start on the defaults. Each is cheap to change before its phase.

1. HUD scope. Default: restyle the in-game HUD too, as phase 3. The alternative keeps the warm HUD and restyles only the screens around the game.
2. Header. Default: the site's parchment header on every screen outside play, in its compact form, holding the logo, the page nav, the account, and fullscreen. The title screen gets the large form. The alternative keeps no header and restyles the nav buttons only.
3. Covers. Default: keep the 3:4 module covers and set them in the site's card frame. This holds the 2026-10-04 request for module-style, edge-to-edge art. The alternative is the site's 16:9 cards, which would drop the module covers.

## Work

### Phase 0, shared theme

- Move the shared tokens, keyframes, and texture utilities into one stylesheet that `app/globals.css` and `apps/desktop/src/style.css` both import. Keep `.fade-in` last, as the current build note requires.
- Add the `primary` scale, `text-xxs`, `text-xxxs`, and the mono font to the desktop theme.
- Add `@fontsource/syne-mono` to the desktop app. One new dependency.
- Set the desktop root to the site's base: black ground, white serif text, 18px root.
- Add `components/graphics`, `components/typography`, and the needed `components/ui` files to the desktop `@source` list. Today only `components/stage` and `button.tsx` are scanned.
- Copy `public/images/d20.jpg` in `scripts/build-runtime.ts`.
- Add a small set of site primitives the app can import without Next: card frame, section plate, mono chip, field. Put them beside the existing shared components. The website keeps its current markup. Adopting the primitives on the website is a later cleanup.
- Add a browser preview for the desktop screens with a mocked bridge, dev only, so screens can be captured without the Tauri app. Optional, but validation is slow without it.

### Phase 1, screens around the game

- `AppHeader`: built from `paper`, `Parchment`, the logo, and the wordmark. The website's `Header` cannot be imported. It depends on Next routing and Clerk.
- Title screen: header, the site's copy and button unchanged, save line in the site's active adventure card style.
- Page shell: black ground with the painting fading to black, as the site's image header does. Section plates.
- Adventures: site card frame around each cover, mono chips for player count and price, centred epic Play, amber title on the featured panel.
- Characters: the site's character card, with amber name, Cinzel subtitle, black ring, no sepia.
- Settings: match copy size and colour to the site's card.
- Account badge and link gate: site outline buttons, paper tiles, black panel.

### Phase 2, setup flows

- New game: black panel, site outline buttons for tabs and party toggles, site card for heroes, styled select.
- Locked adventure: mono chips, amber price, site lock badge.
- Hero creator: black dialog with the `primary` border the character sheet uses, mono labels, site fields.
- Hosted lobby, once `feature/host-mode` is on main.

### Phase 3, the stage HUD

Applies if decision 1 holds. This changes the website's stage pages as well, which keeps both in step.

- Step 1, retint by token. Change the nine `stage-*` colour values and the six texture utilities to the mapping above. One commit. The whole HUD turns to the site's palette at once, and it reverts in one step.
- Owner review of step 1 over every authored set before more work.
- Step 2, components. `hud.tsx` first (`panel`, `eyebrow`, `Pill`, `IconButton`, the perspective bar), then narration, prompt card, roll result, journal, character card, turn order, plates and bubbles, and the inline cards in `play.tsx`.
- Step 3, literals. Replace the warm hex values in `components/stage`, including the d20's fill and light in `d20.tsx`.
- Step 4, names. Rename `stage-*` tokens to the site's names once the look is approved.

### Phase 4, cleanup

- Restyle `app/desktop/link/link-desktop.tsx` to the site.
- Delete unused `stage-*` utilities and the duplicated CSS.
- Update the design brief, the Stageview plan, and the stage engine record where they describe the warm HUD.

## Order and branches

- Branch: a new feature branch off main. The plan's own branch merged 2026-10-10.
- `feature/covert-cargo-rescue` changes `pages.tsx`. `feature/host-mode` rewrites `home.tsx` and `play.tsx` and adds `stage-play.tsx` and `hosted-lobby.tsx`. Both merged into main 2026-10-10, so phase 1 can start.
- Phase 0 touches only stylesheets, the build script, and new files. It can start now.

## Validation

- Desktop typecheck and tests, scoped Biome, root typecheck for the shared files.
- Each screen beside its website counterpart at 1440 by 900 and at DPR 2: title, adventures, characters, settings, new game, locked adventure, hero creator, link gate.
- HUD over every authored set at DPR 2, with native-pixel crops of text over the brightest part of each scene. The compact layout too.
- Website pages that use the HUD still render: `/dev/turn`, `/dev/dice`, `/desktop/link`, and the hosted play page once merged.
- Body text holds 4.5 to 1 contrast on every panel.
- A search for `stage-*` classes and warm hex literals returns only what was agreed to keep.
- The packaged app, not only the dev build, since fonts and images are bundled.

## Risks and unknowns

- Legibility. The warm HUD was tuned over warm painted scenes. Black and blue panels over them are untested. Step 1 of phase 3 exists to find out early.
- Two requests pull against each other: module covers at 3:4, and the site's 16:9 cards. Decision 3 settles it.
- A shared stylesheet must build under both Next and Vite. Both use Tailwind 4.2, but the desktop build already has one known quirk with `@starting-style`.
- The 18px root changes every rem size in the app. HUD sizes are fixed px and do not move. Screen layouts need a pass.

## Out of scope

- Changes to the website's own look.
- Layout or behaviour changes to play, saves, or accounts.
- 3D scene art and lighting.
- Phone and tablet layouts.
