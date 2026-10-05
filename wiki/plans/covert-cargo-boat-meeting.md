# Covert Cargo: the meeting inside the boat

[Plans](index.md) · [Stage engine](../stage-engine.md) · [Stage authoring](../stage-authoring.md)

Started and implemented 2026-10-05 at owner request: "check the source and make sure we are aligned with it."

## Source review

- The Shipment puts Lyra inside the boat with the crate. Its intro also has the escorts on the pier, Aelar speaking "across the water", and Poppen in reeds at the water's edge.
- The Fake and Battle on the Boat put everyone in the cabin, with Silas by "the only exit".
- The Disturbance sends two elves, an archer and a sword fighter, to investigate.
- Art: the crate in a big timbered hold, Silas in a porthole doorway over the river, Reinhard in a cabin with the helm wheel, and Poppen in undergrowth under trees.

## Decision

Owner chose the most logical staging and matching edits to the intro:

- The crate weighs about 500 pounds, so Lyra checks it where it sits.
- Neither side trusts the other: Reinhard stays beside Lyra, Silas waits by the door.
- Aelar comes out of his cabin into the saloon on "the cabin door opened".
- Both elves guard the deck, one at the gangway end, one at the stern.
- Poppen hides in the bushes at the treeline, up the bank. Elves would spot a thief in the reeds by the gangway.

Intro edits in `the-shipment.md`: Poppen in undergrowth at the treeline, the three figures seen going aboard, Aelar stepping forward to the crate, Silas gliding from the shadows by the door.

## Work

- One larger interior for every boat scene: the tug's saloon in the pier set grows to about 7 by 4 m, with Aelar's cabin aft behind an inner door, the bow door as the only exit, the helm by it, and the crate hold between posts.
- The Fake, Battle on the Boat and The Crate move from the separate cabin set into the pier set. The cabin set is retired.
- Restage The Shipment, The Transaction, The Disturbance, The Fake, Battle on the Boat and The Crate.
- The arrival camera stays inside walls.
- Desktop scene lines for the GM follow the new staging.

## Validation

- `pnpm stage:check`, stage and desktop typechecks, scoped Biome, desktop tests.
- Every changed staging viewed in the browser, and The Shipment's narration stepped through.

## Results

- The saloon is about 7.3 by 4.2 m, with the crate between banded posts, a chain sagging between them, lanterns, stores aft, the helm and gauges by the door, and Aelar's doorway in the aft bulkhead.
- All six boat stagings play in it. The Escape stays on the trail. The cabin set is deleted.
- Desktop scene lines for the GM describe the saloon and Poppen's bushes.
- Walks route through the bow door. `stage:check` passes. Walks still blocked: onto the solid crate, to the stern around the cabin, and long walks to the trail.
- A fresh game stepped through the opening: the river, Lyra at the crate, the meeting, Poppen peeking from the leaves, Aelar walking out of his cabin, and each speaker's bubble. The Transaction, The Disturbance, The Fake, Battle on the Boat and The Crate were checked shot by shot.
- Stage and desktop typechecks, scoped Biome and 25 desktop tests pass.
- Saves from before this change keep their stored positions, which may now sit inside walls or the crate.

## Owner feedback: the interior's quality

"I feel like the interior of the ship does not meet the quality bar." Compared closely with the crate, battle and fake paintings, then rebuilt: a dark lamplit room through the new set `rooms`, finished joinery and props. Checked shot by shot on the preview page and through the opening in the app. Stage and desktop typechecks, scoped Biome, `stage:check` and 25 desktop tests pass. See [the stage engine record](../stage-engine.md#rooms-and-the-saloons-finish-2026-10-05).

## Owner feedback: wood detail and windows

"the texture of the wood is still not at the detail i was expecting. also lets do b." New interior wood textures painted from the battle, crate and Fake paintings, and see-through windows. Checked on the preview page inside and out. Stage and desktop typechecks, scoped Biome, `stage:check` and 25 desktop tests pass. See [the stage engine record](../stage-engine.md#saloon-wood-and-windows-2026-10-05).

