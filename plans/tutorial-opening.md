# Tutorial Opening

The Midnight Summons opens on the trail at midnight, in `broken-silence`, and the owlbear is the first creature the player meets. The milestones are “Learn by Playing” in `lib/vision.ts`.

## What is built

- `broken-silence` is the first encounter. Its intro tells who Thalbern is and gives Wollandora's note, which a squirrel brought that evening.
- Its GM Notes keep replies short, never explain the rules or the screen, and end each reply with one or two things Thalbern could do.
- A first-look tour (`Tour` in `packages/ui/src/stage/tips.tsx`) the first time the play screen opens on a device, once the stage has loaded: Welcome to D20 Adventures, then a stop at the story, who acts, the camera, the map, the journal, Scene Settings and Give Us Feedback, each lit with the rest dimmed. The narration holds while it is up. It replaced the feedback callout. A stop whose part is not on screen is taken out. The web demo's turn view (`components/adventure/turn.tsx`) has its own stops, `WEB_TOUR`: the story, who acts, the reply box, the map and the chat. It has no feedback button, so its tour ends without one. A stop below the fold is scrolled into view.
- First-time tips (`packages/ui/src/stage/tips.tsx`): Your Turn, Roll the Die, An Attack, A Reaction and Your Hero, each shown once on a device, kept in `localStorage` under `d20-tips-seen`. No More Tips hides them all. They show in `StagePlay` (desktop and hosted guests) and in the web demo’s reply box (Your Turn, Roll the Die, An Attack).

## Cut, 2026-11-25

- The owner cut the two scenes at Thalbern's home, `the-squirrels-note` and `the-woodpile-wolf` (“maybe we should just get rid of the first part and do the intro tour on the forest at midnight and the owl bear”). The squirrel was a big part of the first scene but had no figure, so it was never seen.
- The wolf's figure (`asset-library/characters/wolf`), its card and the SRD Wolf NPC stay, for any later scene. The home set stays too.

## Still to do

- A test that plays a new player through it from start to end, with the tips.
- Whether every new player starts here, whichever adventure they pick.
- Whether the owlbear is too hard a first fight. `timely-rescue` saves him if he falls.
