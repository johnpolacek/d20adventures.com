# The lead-in to March of Davos

[Plans](index.md) · [Wiki adventures](../wiki-adventures.md) · [Covert Cargo: three heroes](covert-cargo-three-heroes.md)

Status: story stitching, carry-over and story memory implemented on main 2026-10-13. Not yet played with a live model.

## Owner direction, 2026-10-13

"the point of these adventures is to lead into march of davos. midnight summons leads into covert cargo leads into Road to Kordavos, then finally into March of Davos the featured adventure. are we set up well for that"

Asked which gaps to close, the owner chose story stitching first. Carry-over in the app and story memory between adventures are later steps.

## The chain

1. The Midnight Summons. Wollandora sends Thalbern after relics taken from the elven vaults, seen on a riverboat bound for Kordavos.
2. Covert Cargo. Thalbern finds that boat at a hidden pier. The Circle, a faction of the elves of Faelendar, sells the Oath Stone of the First Clans to two men of the Blackthorn family. The boat goes on to Kordavos.
3. The Road to Kordavos. New heroes travel the Marquis Road to the Harvest Festival and reach the gates.
4. March of Davos. The same gates. The Blackthorns' traffic in Valkaran relics is the plot.

## What was stitched

- One elven name. The settlement is Faelendar everywhere. March of Davos called it Lindrathil at the docks and the ball, and its ship is now the *Star of Faelendar*. The Midnight Summons spelled it Faelandar.
- Blackthorn is named to players in Covert Cargo: the scrollcase carries the family's seal, and the premise says Lyra knows who hired her. Before, only the GM's notes and two character sheets had the name.
- Covert Cargo's cargo reaches March of Davos. Finn at the docks can tell of the river tug, its one chained crate, and Silas. The Oath Stone sits in Warehouse 14 and is on the manifest. Thaddeus's ledger records the purchase, with "No loose ends. S." beside it.
- The Road to Kordavos carries the rumor: a boat at the old smugglers' pier, elves, a fight, a woman in the river. The fortune teller may see a stone, a key and a cowl.
- Each ending points on. Both endings of The Midnight Summons turn Thalbern down the river. Covert Cargo's two endings point to the city and the Marquis Road. The Road ends at the checkpoint that opens March of Davos. Each closes on a plain line naming the next adventure.
- Thalbern no longer "followed the boat for two days". He followed the river from the Standing Stones, as The Midnight Summons has it.

## What March of Davos assumes

Nothing carries between adventures, so March of Davos takes Covert Cargo's most likely ending as what happened: the tug got away with the crate, and Silas reported the arcanist drowned. A party that won the crate in Covert Cargo will find March of Davos disagrees with them.

## Carry-over, 2026-10-13

Owner: "do carry-over".

- Each intro adventure names the next in its page's `nextAdventure`: The Midnight Summons to Covert Cargo, to The Road to Kordavos, to March of Davos. The field already existed, and the website's ending already offers "Play Next Adventure" from it.
- The desktop app's ending panel gains "Continue: <next adventure>". It opens that adventure's party setup.
- The heroes just played go on when the next adventure can seat them, on the same seats: a hero the player played stays the player's, an AI hero stays the AI's. The next adventure's suggested party fills the places left. A fresh New game is unchanged.
  - The Midnight Summons to Covert Cargo: Thalbern stays the player's, with Lyra and Poppen on the AI.
  - Covert Cargo to The Road: nobody goes on. The Road is played with heroes the player makes.
  - The Road to March of Davos: the player's own heroes go on, and March's authored companions fill the party.
- Lyra, Poppen and Thalbern are premades in March of Davos, with the ids and art they have in Covert Cargo. Their March sheets say why each has come into the city. March's suggested party is unchanged.

A hero's seat carries here. What they hold and what happened carry with story memory, below.

## Story memory, 2026-10-13

Owner: "do story memory".

In plain terms: the next adventure's GM is told what happened in the ones before. If the heroes kept the crate at the pier, March of Davos's GM knows it never reached the city.

- Continuing from an ending writes a chapter for the finished adventure into the new save: its title, the last scenes it passed through, who played, the end of the GM's own running summary, and the threads left open. No model is asked. The chapter is cut from what the save already holds.
- Chapters add up along the chain, whoever the heroes are. March of Davos is told of all three intro adventures, even when its party is new.
- The chapters reach the GM as part of the adventure's premise, under "THE STORY SO FAR", so every prompt that carries the premise carries them. The block says they are settled fact, that they win over an adventure's notes where the two disagree, and that a hero knows only a chapter that names them.
- Replies offered to a player carry only the chapters their hero lived.
- Gear carries for a hero who goes on: what they held at the end joins the next adventure's sheet. Wounds and conditions do not, since time passes between adventures.
- It applies only when the player continues from the ending panel, and only into the adventure the finished one names as next. A game started from the Adventures page is fresh.
- March of Davos's notes say what changes if the crate never reached Kordavos, at the docks, in Warehouse 14 and in the ledger. The Road's gossip follows what happened at the pier.

Decisions made without the owner: no model call for the recap, wounds do not carry, and memory needs the Continue button.

## Not done

- Story memory is local play in the desktop app only. Hosted games and the website carry nothing.
- The recap is the tail of the GM's running summary, not a written epilogue. A long adventure's early events fall off it.
- An AI hero's own turn is told every chapter, with the rule that it knows only those that name it. The rule is not enforced.
- The three premade sheets in March of Davos still tell the likely ending in their backgrounds.
- Players are not shown the story so far.
- Nobody from Covert Cargo appears in person later. Silas is named in March of Davos, not met.
- The Road's travellers do not reappear in March of Davos.
- The website's S3 copies of the adventures are not changed.

## Validation

- Bridge checks for all four adventures, the public flow check, `pnpm test:gm-core`
- Desktop tests after `pnpm prepare:runtime`, with `carry.test.ts` for the chain, the opening party and the three in March of Davos
- `story.test.ts`: a chapter cut from a finished save, the GM's prompt and a player's offered replies in the next adventure, gear carried, and the chain to The Road with a different ending. All with a stub GM. No live model has read the story so far.
- Carry-over tried in the app's browser preview on two finished games written into its scratch folder: The Midnight Summons into Covert Cargo, and The Road with a created hero into March of Davos. Not tried in the Tauri window, and no game was started from the party screen.
