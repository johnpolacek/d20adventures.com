# March of Davos playtest

[Plans](index.md) · [Stage authoring](../stage-authoring.md) · [Stage engine](../stage-engine.md) · [Testing runbook](testing-runbook.md)

Status: played to an ending on main, 2026-10-19 to 2026-10-20. Played to an ending again 2026-10-21, after the gate split into the line and the table, reaching Vengeance of the Blackthorn for the first time.

## Owner request, 2026-10-19

An automated playtest of March of Davos. Fix gameplay issues found along the way, check every angle of the 3D scenes, and improve them until they hold up to a commercial game.

## Setup

- The desktop app in a browser, from `apps/desktop` with Vite, `D20_PREVIEW_GM=1` and a scratch `D20_PREVIEW_DATA_DIR`. Claude plays the GM at medium effort, as in the app.
- Party: Branka played by the tester, Cassia, Yeva and Milos by the AI.
- Chrome with remote debugging at DPR 2 for the 3D. A driver reads each paragraph, rolls, continues NPC and AI turns, and stops for Branka's reply.
- Long stretches run headless against the same save, through the runtime the app runs (`apps/desktop/src-tauri/resources/runtime.cjs`). The browser shows the save when it reloads.
- The preview's Vite runs with watching off during play, or every edit reloads the game. On this 8 GB Mac a second WebGL tab also gets the game tab discarded.

## Findings and fixes

| Where | Finding | Fix |
|---|---|---|
| Gate, "Party" view | The camera sat at the edge of the watch's awning, which filled half the frame, looking down on the heroes. | Eye height from beside the queue, all four heroes in frame. |
| Every close-up | A shot on one character checked for people in the way only inside rooms. Garlan's lines were framed past the back of Oskar's head 0.4 m from the lens. | Out of doors too, a close-up weighs every view clear of walls by who stands in the sight line or right beside the lens, cast and crowd, plus a small cost for swinging far round or drawing in. The least spoiled view wins. |
| Every crowd | A passer-by close to the camera could fill the frame. | Crowd cards within 1.1 m of the camera are not drawn. |
| Encounter change | The round-end beats that close an encounter lead the next encounter's first turn, so Garlan's farewell and "pass beneath the great arch" played on the festival set. | Those paragraphs are told on the old encounter's scene, with its people, under its title. The new scene follows. Desktop and hosted games. |
| A hero's turn | The reply card covers the middle of the screen, and the hero was framed at 5 m in the strip above it: a small figure over a field of paving. | A tall card puts the subject in the column beside it, full height, and the camera comes in by the hero's height. |
| Braziers | A flat peach cone for fire, and peach slabs for coals. | A `fire` material: crossed cards of live flame that lick, sway and flicker, white-gold at the root and red at the tips. A bed of glowing and charred coals. On the gate, the square, the conflict cut and the riverfront. |
| Zephyra's stall | The crystal ball was a faceted pale-blue disc on the counter behind her, so she never "peers into" it. | An `orb` material: dark polished glass with mist turning inside and a bright rim. The ball sits on a brass stand on a draped round table in front of her. |
| Game stall | The wheel of chance was a flat yellow disc under the awning. | A `prizeWheel` builder: painted wedges, brass rim and pegs, hub and pointer, on its own post beside the stall. |
| Gate queue | The game pauses loops, and the queue loop stood the party second in line, behind a stranger at Garlan's counter. Garlan's "State your business" was framed on the stranger, and the two-shot hid Branka. | The party starts at the head of the line, where the intro has Garlan question them. The two-shot frames Garlan and the four heroes across the counter. |
| Strongboxes | Plain dark brown, a black slab from behind. | Planked wood, iron straps over the lid and a hasp. |
| Story view | Every encounter without a 3D scene played on a black screen, 42 of March of Davos's 45. NPCs with no stage art showed initials. | Each encounter's painting behind the narration, drifting slowly under a vignette, from `scripts/stage-encounter-art.ts` into `public/stage/art`. NPC portraits from their sheets into `public/stage/portraits`, listed in `apps/desktop/src/npc-portraits.ts`. 63 paintings, 9.3 MB, and 41 portraits, 1.1 MB. Desktop and hosted games. |
| AI heroes | Companions cast a visible spell almost every turn, so detection spells came round again while a door stood open. | The AI hero prompt asks them to take the way on the narrative offers and not repeat a spell or question already used. |
| Crowd speech | A line from someone with no turn, such as a masked guest at the ball, became a bare quote on its own paragraph, said by no one. | It joins the narration before it, which shows who speaks. |
| Story view | During an encounter's closing lines, the turn order already showed the next encounter's people. | The closing lines show their own encounter's turn order. |
| The Ambush | Bram had no turn, so his warning and the attic costumes came as reported speech. | Bram is in the encounter's cast, waiting up at the inn. |
| Desktop pacing | A reply or Continue played every NPC and AI hero up to the next player in one call: up to 110 seconds behind one thinking card, the card naming only the first of them. | The desktop app plays one NPC or AI hero per call (`npcTurnsPerCall: 1` on the GM core's ports). Each turn is on screen in 7 to 27 seconds and read while the next is written. A reply returns once the hero's own action is told. Hosted games keep the whole run. |
| GM story rules | Astrid's answer came inside a roll's narration, as prose with no speaker. | The rules say every word a listed character says is a line, and someone not in the list speaks in quote marks inside the narration that shows them. |
| Spells and traps | A hero's roll was read for health only when named exactly Attack, Constitution, Strength or Dexterity. Guiding Bolt "seared" the drake and left it at full health, and a ward's lightning flung Cassia into the casks unhurt. | Any attack, save or bodily check is read, and any roll whose outcome tells of harm. |
| Speech in narration | The rule above did not stop it: Clive's shout of "Thieves!" came inside a roll's narration. | When a narration names exactly one listed character who may speak, its quoted words become that character's lines. |
| Off-stage NPCs | Clive took a turn to say he stayed in the ballroom. | An NPC away from the heroes that does nothing they could perceive skips with no beats. |
| One turn per call | A slain NPC's turn, which only tells its fall, used up the call, so the NPC after it did not act and the app said the GM could not finish. | A fallen NPC's turn does not count. |
| The hunt | The labyrinth spoke of Astrid's soldiers, but none came with her, so the GM conjured them. | Her house guards follow her into the hunt. |
| The ending | Final Confrontation had no transitions, so arriving there completed the adventure on Joran's first line. The party never chose. | The confrontation is played. Siding with Joran, with Astrid or with neither leads to The New Dawn, Vengeance of the Blackthorn or The Dust Settles, from the adventure's Aftermath. They reuse the festival, Astrid and library paintings. |
| Ending screen | The last hero in initiative stayed highlighted after the adventure ended. | No hero is up once it has ended. |
| Party choice | At the finale Branka sided with Joran, and Yeva, an AI hero, tried to pocket the Key from him, so the choice never settled. | The AI hero sees which heroes are played by a person and backs a choice they make for the party. It may voice a doubt, not work against it. |
| Festival from roof height | Orbiting at 6 m put the camera among the bunting, and three pennants filled the frame as flat triangles. | Cloth thins out over the last metre before the lens. |
| Overhead orbit | A drag could reach straight overhead, where the crowd's painted cards read as pegs. | A drag stops at a look down of about 40 degrees, the overview shot's angle. Authored shots keep theirs. |

## Second pass, 2026-10-21

Owner asked again for an automated playtest with fixes as they come, and every angle of the 3D checked until it holds up to a commercial game. Same setup: Branka played by the tester, Cassia, Yeva and Milos by the AI, Claude at medium effort, Chrome at DPR 2.

| Where | Finding | Fix |
|---|---|---|
| A new scene's first paragraph | Each new stage opened on its default view after the paragraph's own shot was set, so Garlan's first line at the table played on the wide view of the gate. | The new stage's loops, opening view and saved positions are set first. The first view on a new stage is a cut, not a glide from its opening view. |
| Encounter change | When a turn opening a new encounter arrived, the new scene was built, thrown away for the old scene's closing paragraphs, then built again. | A turn not yet read keeps the old scene until the reader is set at its first paragraph. |
| Top of the screen | While a paragraph was read, the name under the portraits was the character whose turn came next, so Milos's line played under "Cassia Verane", and the festival's intro under "Finnian the Fire-Eater". | While the story is read it names whoever the paragraph's turn belongs to, and no one for an intro or the end of a round. |
| Close-ups in a crowd | In the line, the camera framed heroes past crowd figures standing in front of them, and passers-by filled the near edge of the frame. | Crowd figures between the camera and the one it frames, or in the near part of a view closer than 7 m, fade from view over a third of a second, shadow and all. Wide and high views hide no one. The camera's choice of angle no longer avoids the crowd as hard, so it shows faces more often. |
| The line's intro | The sergeant bellowing the festival law, the strangers sizing each other up, and the family turned back at the table played on views of the back of the line. | Those paragraphs name their places: the table, the sergeant, and where the party stands. A place where the heroes stand frames the heroes. |
| Paving | The square, the conflict cut and the gate were paved in big, flat, pillowy slabs that read as a prototype at eye height. The festival painting has rounded cobbles. | A `stones` option on ground masonry lays rounded cobbles with soft rims, rounded corners, a slight tilt each and per-stone colour, plus fine grain near the camera. On the square, the conflict cut and the gate. Their slope is read from neighbouring pixels: the first version cost 7 ms a frame at the app's balanced tier, this one costs what the slabs did (about 10 ms for the square's opening view on this Mac at DPR 2). |
| Characters on the ground | A card's sun shadow leaves its feet ungrounded from most angles, so heroes seemed to hover. | A soft contact shadow under every standing character, gone as they fall. |
| Encounter change | The narration's heading switched to the new encounter while the old encounter's last paragraph was still fading out. | The heading changes with its paragraph. |
| Speech bubbles | A tall speaker's bubble rose into the turn order at the top of the screen, and Barok's lines ran under the portraits. | A bubble with no room above its speaker below the top band sits beside their head. |
| Gate lamps | The gate passage's sconces and hanging lamp burned as smooth peach cones. | They burn with the braziers' live flame cards. Fire is no longer fogged, which drew a grey box round any distant flame. |
| Encounter title | A long title, such as Morning at the Dragonbone, ran under the turn order when six or more took turns. | The title keeps clear of the strip however wide it is, and wraps. |
| Story view | A line in an encounter with no 3D scene showed as a bare quote: Beric's opening words named no one. | Whoever speaks first in the paragraph gets the portrait plate a scene would give them. |
| The line | The line scene offered the table's Two-shot and Close views, on Garlan, which framed strangers while the party waited two groups back. | The line scene has neither. |
| Pronouns | Kaeleth, a woman on her sheet, became "his gaze" mid-scene. No story prompt told the GM anyone's gender. | Every prompt that writes beats lists each character's pronoun beside their name. |
| NPC sheets | Varchk's and Kaeleth's sheets called them Aldith and Kaelen, their file ids, in their own descriptions. | They use their names. |
| Shadowing Silverhand | Silverhand stopped, talked and walked the party into his warehouse himself, against the scene's notes. The Hideout then opened with him slipping away unseen. Both playtests did this. | The notes say he does not talk with them or bring them along in this scene: his guards close in and he slips away toward the docks, and the meeting comes at his hideout. |
| The Ambush | The Cowled Rogue stayed on the inn's roof after the warning, scraped tiles, left a frost trail and a scrap of hood-cloth, and led the party down a cistern shaft at night, six rounds from the ball. The notes have the shadows melt away. | The two Cowl NPCs withdraw when the voice falls silent and do not come back that night. The notes say the Cowl cannot be followed tonight and the night ends at the inn, and the scene moves on once they have rested and found costumes. In this game Branka called the party back. |
| The ball's door | The party came by the Silver Serpent's road straight to the Lower Districts, which skips the docks, Astrid and An Invitation, and Barok asked for an invitation they never got. | Entry to the Ball says how to get in without one: talk, bluff, pay, join a noble party, or the servants' door. A failure costs a delay, not the ball. Open: whether that road should skip the docks arc at all is the owner's call. |
| Going back | Caught in the wine cellar, the party was marched back to Through the Halls, and its intro was read again word for word. | An encounter the party has played before opens without its intro. The round's story has already brought them back. Desktop and hosted games. |
| Caught in the mansion | The house guard caught the party at the vault, then marched them from the cellar to the halls to Astrid's door for six rounds, the speech never reached. Only the cellar and the distraction led to it. | Caught anywhere in the mansion's rooms, the party is taken to the ballroom and arrives as Thaddeus takes the stage. The halls, Astrid's quarters, the corridor and Thaddeus's office lead to the speech, and each says so in its notes. The halls no longer lead back to the start of the ball. In this game, once Branka gave herself up, the guards took the four straight to the ballroom and the speech began. |
| Invented exits | Twice the GM opened a way out of a scene that the content does not have: a Cowl rogue who left a trail to a cistern shaft, and a secret stair from Astrid's study to a tunnel under the city. Both pulled the party toward the tunnels, which belong to the scenes after the murder. | The round prompt and the NPC turn prompt say: improvise inside the scene, but open no way out of it that the intro and notes do not give, no secret passage, trail or fleeing figure. A search or chase for something the notes do not provide finds nothing more. |
| Backing the player | At the finale Branka sided with Astrid, and Milos, an AI hero, stayed Astrid's blade and got Joran to hand the Key to him instead. | The AI hero prompt says backing a side means helping it get what it wants: not staying its blade, not pleading for its rival, not asking the prize go to anyone but whom the person named. |
| One speaker, two lines | Elara's two lines in one paragraph read as `"...something more." "A few weeks ago..."`. | One speaker's lines in a row read as one quotation. Desktop, website and Storyview. |
| Roll read aloud | A screen reader heard "20 plus -1 makes 19". | "20 minus 1 makes 19". |
| Dragging the camera | Dragged behind a gate tower, the camera showed the back of the tower. | It stops on the near side of a building, wall or tower between it and what it looks at, as a third-person camera's arm does. Stalls and tables are low, so it passes over them. |

## Gameplay notes

- Gate: four heroes introduced themselves, Garlan answered in character from Branka's sheet (the gate-ward shield), the encounter moved on after one round.
- Festival: Zephyra foreshadowed the key and the mansion, Karim named the Blackthorns and the lost shipment, Liora complained of Asterian ways, all as the GM notes ask. One round, then Clan Conflict on cue.
- Clan Conflict: Yeva sneaked to Barok's side, Milos calmed Barok with a Persuasion roll, Branka faced both leaders down with Intimidation. Barok named the last place the shipment was seen, a toll bridge on the east road. Then the Dragonbone Inn on cue.
- Dragonbone Inn and the job: the heroes shared why they came, Bram named the Cowl, and Beric and Eamon offered Raskov coin for the lost cargo. Milos drew out who was paying with Persuasion.
- Morning: Elara brought Joran's scrollcase and the Key of Ilmarin. The library ran five rounds: the Archivist, Sister Danica guarding the archive, and the reveal that House Drakovan took the name Blackthorn. The AI heroes kept circling a locked cabinet until Branka led them out.
- Silver Serpent: Harron, newly a turn character, gave nothing until Cassia's roll, then named Silverhand and the Black Market. The docks tied back to Covert Cargo: the river tug, Silas, Warehouse 14.
- Mystery Cargo: a real fight. Grease, magic missiles, Bless and Shield of Faith, a pinned dwarf at 90%.
- Hideout and Silverhand: the party was walked in under guard. Milos laid down the manifest, Branka offered to deal with the hoods, Yeva traded the crate padlock, and Cassia's chart got Silverhand to name the tunnels under the city. He sails from Kordavos.
- The Ambush: arrows, the Covenant's voice and sulfur, no fight, as written. Milos cast Bless, Cassia read the arrow. Long rest at the inn and costumes from the attic.
- The ball: Barok, now a Blackthorn guard, made Branka wait after a natural 1, then let them in. Guests' whispers for and against the Blackthorns, Yeva lifted a purse, and Astrid unmasked to lead the party to Thaddeus.
- The wine cellar, in the app's own UI: the sommelier and Mira bickered over the toast, Branka kept the sommelier talking, Cassia's failed Stealth gave the hiding place away, and Cassia's "imperial survey" sent him back upstairs.
- The vault: a natural 1 on Arcana set off the ward's lightning, Yeva's lockpicks finished the onyx key's turn, and Branka took the Drakovan ledgers. Clive threatened to report them after the speech and did, when Yeva tried to lift his bottle.
- The speech and the murder: the drake was unveiled, the assassin struck, Milos kept Thaddeus breathing for a round, and he died on his own stage. The assassin escaped through the warded grate.
- Underground: Astrid and Eamon broke the ward. The catacomb saboteurs lit a two-round fuse, and Cassia tore it out with one round left. The labyrinth's creeping wall was an illusion anchored on a rune. The undead of Big Empty fell in three rounds.
- The finale, replayed after the fix: Joran and Astrid each pressed their case over the Drakovan ledgers for three rounds. Branka wrenched the Key from Joran and gave it to Milos, and the adventure ended in The Dust Settles.
- 75 rounds from the gate to the ending. Branka finished at 65%.
- A second replay of the finale: Branka sided with Joran, Cassia greased the floor under Astrid, Joran slid out under the closing slab with the Key, and the adventure ended in The New Dawn.
- Roll bonuses for the same skill vary by a point or two. By design: the ability modifier plus a situational modifier the model chooses.
- Flaws seen: AI heroes recast detection spells (prompt fixed), long AI turns of 30 to 110 seconds when several NPCs act in a row (one per call now), an NPC "back in the Silver Serpent" acting after the party had left, and the GM reusing a name (a thug called Bram).

### Second run, 2026-10-21

- The gate in the app: the line round had every hero speak to another hero. At the table Garlan read the names back and wrote "The Wayfinder's Word", an AI hero's name, over Branka's offer. A side game took "Stoneveil Company" from the player.
- Festival and Clan Conflict in 3D: Zephyra hinted at the mansion's cellars, Karim named the Blackthorn masquerade, and Cassia's Grease and Larya's people ended the standoff with the magistrates.
- The Black Market road: Silver Serpent, Lower Districts, urchins, the passphrase door, Milos's Persuasion at Garrick, masks from Mizrith, the torc won at auction, Silverhand's gauntlet on Yeva's wrist, Dmitri Volk's name at his table. It skips the docks arc.
- The Ambush derailed into a cistern chase until Branka called the party back. Costumes from the attic, then in through the musicians' door with no invitation.
- The ball: Astrid and Thaddeus in the rotunda, Seraphina and the bishop, Aelindor's song, the cellar's hidden vault found, the party caught by the sommelier, Mikhail's journal in Astrid's study. A GM-invented stair to a tunnel cost three rounds before the caught-party route took them to the speech.
- The murder: Milos held Thaddeus, who confessed the order and gave him the onyx key. The chase, the hunt with Astrid and Eamon, the fuse cut in the catacombs, the labyrinth's illusion wall, the sealed door, the undead of Big Empty.
- The finale: Branka sided with Astrid. Cassia greased Joran down, Milos took the Key and Branka had it given to Astrid. Vengeance of the Blackthorn.
- 86 rounds. Branka finished at 100%, the others at 85 to 95%.
- Faults left to the GM, not fixed: a repeated phrase ("Astrid's shock hardens into something cold") and a long Wine Cellar of eight rounds. The long scene led to a [round budget](round-budget.md), 2026-10-22.

## Content pass, 2026-10-20

The live GM found three content faults in the later encounters: named characters with no turn, spoken words inside narration, and intros that call the players "you". Fixed in the encounter files and NPC sheets.

- NPCs. 31 encounters gained or filled in `npcs`, each with a one-line behavior. New casts: Bram in the morning at the inn, the Archivist in the library, Harron at the Silver Serpent, Astrid and Petra after the drake, Astrid with the invitation, the auctioneer, Silverhand and his representative through the auction, Silverhand's guards at the hideout, Thaddeus in the rotunda and on the stage, Astrid and Aelindor before the song, the corridor guards, the sommelier and servant in the cellar, the assassin at the murder and the chase, and Astrid and Eamon with the party from the grate to the inner sanctum, where Joran waits. Combatants: Alaric's thugs, the catacomb saboteurs, the ancient undead in Big Empty.
- New sheets: `warehouse-thug`, `auctioneer`, `aelindor`, `blackthorn-guard`, `covenant-assassin`, `covenant-rogue`, `covenant-cultist`. A group of like foes is one sheet whose behavior says how many.
- March of Davos reads its NPC sheets from `migration-report.json`. `forest-drake` was not listed, so The Beast Escapes threw "Missing NPC sheet". It and seven other existing sheets (Harron, the Archivist, Thaddeus, the sommelier, the servant, Joran, the undead) are now listed. 49 sheets.
- Lines. Quotes by Bram, Astrid, Petra, Eamon, Thaddeus, Joran, Aelindor, the auctioneer, the assassin and a saboteur are now speaker lines, with actor beats for what they do.
- Point of view. Docks, Mystery Cargo, The Beast Escapes, The Aftermath, An Invitation, Shadowing Silverhand, the hunt, the catacombs, the labyrinth, the sealed door, Big Empty and the final confrontation now speak of the adventurers in the third person.
- Big Empty's notes say the undead rise there, as Forgotten Temple's intro assumes.
- Left as is: the Covenant's disembodied voice in The Ambush and the festival's unnamed vendor stay narration.
- Text under a `##` heading other than Intro, GM Notes, Checks, Summary and Transitions reaches no prompt. "The Meeting", "The Missing Brother" and "The Final Night Approaches" are now the first GM note of their encounters.
- Joran's murdered father was Milos Antonov, while the party's cleric premade is Milos Radan, so "Death to the murderer of Milos" named a hero at the table. The father is now Mikhail Antonov in the content. A decision made without the owner, one commit to revert. The migration source in `wiki/sources` keeps the old name.
- NPC portraits: 19 sheets had only the stock avatar, among them Astrid, Thaddeus, Joran and Silverhand. `scripts/stage-npc-portraits.ts` painted them with Gemini 3 Pro Image in the finish of the painted NPC portraits.

## Open

- The Kordavos riverfront set, Covert Cargo's quay, is well below the gate and festival: box-hulled ships, an empty quay, flat facades. March of Davos's docks scenes could use it once it is rebuilt.
- A party that picks the Party view while the reply card is open sees the heroes cropped into the narrow column.
- The Silver Serpent's road straight to the Lower Districts skips the docks, the drake, Astrid and her invitation. Keep it as a short road, or send every party by the docks?

- The three endings reuse other encounters' paintings. Each could have its own.
- All three endings have now been reached in play.
- The sheets' `image` still points at the stock avatar for the 19 painted NPCs, so the website's own views show the avatar. Uploading the portraits to the art bucket needs the owner.
- `test:gm-core` was failing since 2026-10-13. It has a refresh mode now (`GM_FIXTURE_UPDATE=1`) and passes.
