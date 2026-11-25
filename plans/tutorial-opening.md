# Tutorial Opening

The Midnight Summons opens with a scene at Thalbern’s home that teaches the game as it is played, like Baldur’s Gate 3’s Nautiloid prologue. It is a scene inside the adventure, not a separate prologue. Chosen 2026-11-25. The milestones are “Learn by Playing” in `lib/vision.ts`.

## What is built

- `the-squirrels-note` is the adventure’s first encounter, on the home set (`realm-of-myr/thalberns-forest-home`), in late afternoon light. A red squirrel brings Wollandora’s note.
- Its GM Notes keep replies short, never explain the rules or the screen, and end each reply with one or two things Thalbern could do. The squirrel is an easy Animal Handling check, DC 10, or Speak with Animals. Either way he gets the note.
- Setting out goes to `broken-silence`, at any time. That is the skip: a player who knows the game leaves at once and reads the note on the way. `broken-silence` no longer tells the note.
- First-time tips (`packages/ui/src/stage/tips.tsx`): Your Turn, Roll the Die, An Attack, A Reaction and Your Hero, each shown once on a device, kept in `localStorage` under `d20-tips-seen`. No More Tips hides them all. They show in `StagePlay` (desktop and hosted guests) and in the web demo’s reply box (Your Turn, Roll the Die, An Attack).
- The scene teaches typing, a check and a spell. The first attack is taught by its tip at the Owlbear.
- Probe: `pnpm --dir apps/desktop scene:probe summons-squirrel`. Its first run, 2026-11-25, stayed on the rails all 4 rounds and moved on to `broken-silence`.

## Still to do

- A practice fight before the Owlbear, such as a wolf at the woodpile. It needs a beast figure, which needs a paid asset run (`plans/four-legged-beasts.md`).
- A test that plays a new player through it from start to end, with the tips.
- Whether every new player starts here, whichever adventure they pick.
- The scene’s own art. It borrows `preparing-for-the-city.png`, a morning picture.
