# Tutorial Opening

The Midnight Summons gets a new first scene at Thalbern’s home that teaches the game as it is played, like Baldur’s Gate 3’s Nautiloid prologue. It is a scene inside the adventure, not a separate prologue or a layer of tips over the current opening. Chosen 2026-11-25. Nothing is built yet. The milestones are “Learn by Playing” in `lib/vision.ts`.

## Where it stands

- The adventure starts at `broken-silence`, on the dark trail, with the squirrel’s note told in its intro.
- The Midnight Summons is the site’s demo (`LOCAL_WIKI_ADVENTURES` in `lib/wiki-adventures/local-runtime.ts`), so the new scene is the first thing a new player on the web sees.
- Thalbern’s home already has a set, `valkarr-woods/thalberns-home`, used by `back-home` and `preparing-for-the-city`.
- The game has no tutorial or first-time tips.

## The scene

1. Thalbern at home in the evening. A red squirrel scratches at the door with a note. The player types what Thalbern does, the first free-text action.
2. Coaxing the squirrel calls for an Animal Handling check, the first roll. A failure still gets the note, more slowly. Thalbern can cast Speak with Animals instead, the first spell, and hear what the squirrel saw.
3. The note, from Wollandora: meet at the Old Standing Stones at midnight.
4. Thalbern readies his gear, which shows his sheet and weapons.
5. A small fight before the Owlbear, such as a wolf or giant rats at the woodpile, teaches initiative, moving and an attack.
6. Thalbern sets out. The scene goes to `broken-silence`, whose intro drops the note it no longer needs to tell.

## Open questions

- What teaches each step: the narration, the GM Notes, short tips on screen, or a mix.
- Whether tips live in the stage UI for both hosts, and how the game knows a player has seen one.
- How a player who knows the game skips the scene: a choice at the start, or starting at `broken-silence`.
- How long it runs. Aim for five minutes or less.
- A test that plays a new player through it from start to end.
