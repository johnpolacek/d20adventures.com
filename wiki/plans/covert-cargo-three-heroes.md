# Covert Cargo: three heroes

[Plans](index.md) · [Wiki adventures](../wiki-adventures.md) · [Stage authoring](../stage-authoring.md) · [The rescue it replaces](covert-cargo-rescue.md)

Status: implemented on main 2026-10-13. Not yet played with a live model.

## Owner request, 2026-10-13

"let's make this a three player adventure, with thalbern tracking the ship in a different area than Poppen and they don't know about each other unless they pass d20 checks. The elves that are trading the crate will leave once they have payment."

## What changes

- Thalbern is a third hero, not an NPC. Covert Cargo seats exactly three: Lyra, Poppen and Thalbern.
- Thalbern starts in a thicket on the bank below the tug's stern. Poppen stays in the bushes at the treeline above the gangway. The two hides are about eleven metres apart with the bank's bushes between them.
- Neither watcher knows of the other. The premise says so, and each pier encounter's GM notes say how that changes: a Perception check, DC 15, when one of them searches or watches the bank or looks for the source of a shot, a voice or a noise, and DC 10 once the other has acted in the open. A passed check shows a stranger with no name.
- The elves leave once Silas has paid. The premise states it for every prompt, and The Transaction's staging walks Aelar and his two elves off the boat and up the bank trail on the line that says so.

## What it replaces

Thalbern cannot be both a hero and the GM's rescuer, so the 2026-10-12 rescue is removed from this adventure.

- The `rescue` rule, The Ranger, The Ranger's Aid, their two stagings, and the `thalbern-npc` sheet are deleted.
- `playerDeath: false` stays. A hero is still floored at 1% health.
- The engine keeps what the rescue added: the `rescue` rule itself, the `flee` action, standees that lie down, and staging `exits`. Battle on the Boat now uses exits with no cue, so Reinhard falls on the open boards and Silas runs for the bow whenever the game takes them out.
- No bundled adventure authors a `rescue` now. The bridge check exercises the rule on a copy of the artifacts with one added.

## Overboard, 2026-10-13

Owner, the same day: "Maybe we favor tossing Lyra overboard and they get away. That should be the most likely outcome."

Read as: Silas and Reinhard throw Lyra in the river and get away on the tug with the crate. The other reading, that the heroes get away, was not checked with the owner.

- Battle on the Boat no longer aims at a kill. Reinhard's and Silas's behavior, the GM notes and the first transition all say the same thing: overpower Lyra, put her over the rail, cut the lines and go, in about three rounds. The notes call it the most likely end and tell the GM not to drag the fight out.
- A new encounter, Overboard, follows. Lyra hauls herself out by the gangway, the tug is gone, and a watcher who comes out to help her is seen with no check. This is where the three most likely meet. Thalbern's herbs heal to about three quarters. It leads to Return to the City or The End.
- The heroes can still win the boat, which leads to The Crate, or Lyra can flee on foot, which leads to The Escape.
- The stage has a second pier set, `mordava-river-pier-empty`, cut from the first by the generator: no tug, nothing that was aboard, no mooring lines, no lamplight but the gangway's lantern and the bank lamp, and only the places and views that are still there. Overboard is staged on it.

## Decisions made without the owner

- Removing the rescue, as above. The alternative is a different rescuer, which nobody asked for.
- Three heroes exactly, not two to three. The intro and the premise name all three.
- Thalbern's hero id is `thalbern`, the same as in The Midnight Summons. Each adventure compiles on its own, and the stage cast, figure and portrait already use that id.
- The check is content, not engine. The game asks for a roll only when a hero acts, so a watcher who never looks never rolls.
- Overboard is likely, not forced. Nothing in the engine makes it happen. If the GM does not steer there, a rule that fires after a set number of rounds is the next step.

## Known gaps

- Not played with a live model. Whether the GM calls for the check, and holds the two apart until it passes, is untested.
- The Disturbance is still staged around Poppen's bushes. If Thalbern is the one noticed, the elves search the wrong spot on stage.
- A body does not carry into The Crate, since the staging cannot know who died.
- Lyra is not seen going over the rail. She stands in the saloon until the scene changes to the empty pier.
- Overboard's intro has Lyra thrown, fallen or jumped into the river. It does not fit a tug that leaves with her still aboard.
- The giant tree by the gangway blocks Poppen's straight walk from his bushes to the gangway and the bank, as it did before. Lyra stands south of it in Overboard so he can reach her.
- The website's S3 copy of the adventure is not changed.

## Validation

- `pnpm exec tsx scripts/stage-sets/covert-cargo.ts && pnpm stage:check`
- Covert Cargo bridge check, public flow check, `pnpm test:gm-core`
- Desktop tests and typechecks
- Thalbern's hide and the elves' exit looked at in the stage preview
