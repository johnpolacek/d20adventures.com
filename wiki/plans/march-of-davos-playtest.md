# March of Davos playtest

[Plans](index.md) · [Stage authoring](../stage-authoring.md) · [Stage engine](../stage-engine.md) · [Testing runbook](testing-runbook.md)

Status: in progress on main, started 2026-10-19.

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

## Gameplay notes

- Gate: four heroes introduced themselves, Garlan answered in character from Branka's sheet (the gate-ward shield), the encounter moved on after one round.
- Festival: Zephyra foreshadowed the key and the mansion, Karim named the Blackthorns and the lost shipment, Liora complained of Asterian ways, all as the GM notes ask. One round, then Clan Conflict on cue.
- Clan Conflict: Yeva sneaked to Barok's side, Milos calmed Barok with a Persuasion roll, Branka faced both leaders down with Intimidation. Barok named the last place the shipment was seen, a toll bridge on the east road. Then the Dragonbone Inn on cue.

## Open

- The rest of the adventure in story view, to an ending.
- The festival's party view looks down from above. The view back through the gate shows flat grey blocks.
- The black strongbox on the sergeant's table is an untextured box.
