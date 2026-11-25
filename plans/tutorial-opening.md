# Tutorial Opening

The Midnight Summons opens with a scene at Thalbern’s home that teaches the game as it is played, like Baldur’s Gate 3’s Nautiloid prologue. It is a scene inside the adventure, not a separate prologue. Chosen 2026-11-25. The milestones are “Learn by Playing” in `lib/vision.ts`.

## What is built

- `the-squirrels-note` is the adventure’s first encounter, on the home set (`realm-of-myr/thalberns-forest-home`), in late afternoon light. A red squirrel brings Wollandora’s note.
- Its GM Notes keep replies short, never explain the rules or the screen, and end each reply with one or two things Thalbern could do. The squirrel is an easy Animal Handling check, DC 10, or Speak with Animals. Either way he gets the note.
- Setting out before reading the note goes straight to `broken-silence`, with no wolf. That is the skip: a player who knows the game leaves at once and reads the note on the way. `broken-silence` no longer tells the note.
- First-time tips (`packages/ui/src/stage/tips.tsx`): Your Turn, Roll the Die, An Attack, A Reaction and Your Hero, each shown once on a device, kept in `localStorage` under `d20-tips-seen`. No More Tips hides them all. They show in `StagePlay` (desktop and hosted guests) and in the web demo’s reply box (Your Turn, Roll the Die, An Attack).
- `the-woodpile-wolf` follows once Thalbern has read the note: a lone hungry wolf (SRD Wolf), the first fight. It fights until it is down to 3 hit points, so the player sees it take a turn and bite, then runs. Intimidation or Animal Handling, DC 13, sends it off. If Thalbern falls, it takes his supplies and he wakes, since `broken-silence` is marked `revive`.
- The wolf stands as its painted card (`public/stage/fixtures/the-midnight-summons/wolf-*`) until its figure is made: `asset-library/characters/wolf`, sheets painted, picks in `pilot-picks.json` from Hyper3D's canine stock.
- Probes: `scene:probe summons-squirrel` and `summons-wolf` in `apps/desktop`. On 2026-11-25 every run stayed on the rails.

## Still to do

- The wolf's figure: the owner runs `pnpm assets:pilot wolf --pay` ($0.40), then it is named in `stagings/the-midnight-summons/figures.json` with its `motion`, and synced.
- A test that plays a new player through it from start to end, with the tips.
- Whether every new player starts here, whichever adventure they pick.
- The scene’s own art. It borrows `preparing-for-the-city.png`, a morning picture.
