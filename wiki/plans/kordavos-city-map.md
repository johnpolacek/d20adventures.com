# Kordavos city map

[Plans](index.md) · [Spatial claims](../sources/kordavos-spatial-claims.md) · [Mapview](mapview.md) · [March of Davos in 3D](march-of-davos-sets.md)

Status: steps 1 to 5 built 2026-10-31. Seen in the desktop app's browser preview on a finished playtest save: the small map over the stage, the full map and a district zoom. Not yet seen in the Tauri window.

## Owner request, 2026-10-31

An overhead map of Kordavos for March of Davos, with a small view and a full screen view, accurate to the story.

## Approach

1. Extract every spatial claim from the text. Done: [Spatial claims](../sources/kordavos-spatial-claims.md), 134 places and 463 claims over four parts.
2. Rule on the conflicts, then write one gazetteer. Done: `content/settings/realm-of-myr/maps/kordavos.json`, shared with Covert Cargo and The Road to Kordavos. Every landmark cites its source lines. It sits outside the adventure folders, which the compiler reads as source.
3. Tag each encounter with a landmark. Done: every encounter of March of Davos, Covert Cargo and The Road to Kordavos has `landmark: "kordavos/{place}"`, compiled to `landmarkId`. A place is a landmark, district, road or `beyond` entry. `pnpm map:check` fails when:
   - an encounter has no landmark or names an unknown place;
   - a cited source line is missing or blank;
   - a landmark falls outside its district;
   - a `constraints` entry fails. Each is a story fact with its source, such as the Valtor chapel north of the labyrinth. Near means within 120 of 1000 map units.

   Source cites are line numbers, so editing an encounter above a cited line breaks them. The check catches it.
4. Draw the map as SVG from the map file. Done: `components/stage/city-map.tsx`, read through `lib/citymap/`.
   - Small view: replaces the compass over the location, bottom right of the play screen. It shows the streets round the party and opens the full map.
   - Full map: the Map button or the small view. It opens on the whole city with the river, the road, the sea and the Valkarr Forest. A district button or a click on a district zooms to it.
   - Zoomed out, only the current place is named. Zoomed in, every place reached is named.
   - Painted art sits underneath, with no text in it. See Painted art.
5. Show only places the party has reached, up to the turn on screen, joined by a faint trail. Tunnels show only between places reached. Districts, water, roads and forest always show.
   - `lib/citymap/encounter-places.json` maps each encounter to its place. `pnpm map:check --write` rewrites it, and `pnpm map:check` fails when it is stale.
   - Covert Cargo has no map: its forest pier is off the map.
   - The website's hosted games use the same `StagePlay`, so they get the map too.

## Painted art

Done 2026-10-31. `scripts/city-map-paint.ts` writes it, `lib/citymap/art.json` lists it, and the webp files are in `public/stage/maps/kordavos/` (about 12 MB, synced with `pnpm stage:sync`).

- The outer painting starts from a sketch of every street and block, drawn from the map file, plus a labelled copy that says what each region is. Without the labelled copy, `gemini-3-pro-image` turned the harbour into land and the Asterian Quarter into a fortress.
- Each district's close-up redraws a crop of the outer painting at more detail, so the two match. The map shows it inside the district's outline when zoomed in.
- Each painting gets a drift check: the map file's coast, river, wall and places drawn in red over it. Review it before publishing. All six passed by eye on 2026-10-31.
- A district can be repainted alone: `paint kordavos docks --force`, then `publish kordavos docks`.
- A district's painting shows inside its outline, or inside `artClip` where it reaches past it. The docks' `artClip` takes in the harbour, so its ships show up close.
- Ships copied from the outer painting stayed malformed however the district brief asked. An edit pass on the docks painting fixed them: "change only the ships and boats", sent with the painting. Use the same for a district whose small things come out wrong.
- The full map is a square frame round the square painting.
- Left: roofs get chunky at full zoom.

## The GM

Done 2026-10-31. `@d20/gm-core/citymap` holds the map logic, so the desktop runtime can use it, and `cityContext` writes the map in words for the GM: the city in brief, where the scene stands, up to six places near it with direction and distance, and which way each way on leads. Below ground it names the tunnel stops before and after instead.

- The desktop and hosted runtimes and the website server add it to the staging block the GM already reads. Each bundled pack carries its city map, written by `build-runtime`. A downloaded story pack without one gets no city text.
- A landmark marked `hidden` is a secret of the story, such as Silverhand's Hideout: it is named only when the party is there or it is the way on.
- `apps/desktop/runtime/city-map.test.ts` checks the text for every March of Davos scene.

## The catacombs

Done 2026-10-31. The tunnel stops from the drain grate to the forgotten temple have their own painted view, `underground` in the map file and art index, painted from a plan drawn along the map file's tunnel by `paint kordavos underground`. The small map shows it while the party is below ground, and the full map opens on it there and offers it as The Catacombs once the party has been down.

## The Valkarr Woods

Done 2026-10-31 for The Midnight Summons. `content/settings/realm-of-myr/maps/valkarr-woods.json` is a second map, of open country: the Mordava from the east down to Kordavos at the sea edge, the Marquis Road north of it, Covert Cargo's pier on a quiet fork three miles above the city, Thalbern's home upstream, and the Old Standing Stones further up with the owlbear's tree line between.

- Rulings are in the file. The stage set's "trailNorth" is a set label, not a bearing, so the stones are upstream to the east. "He lives on the edge of Kordavos" is loose: his home is hidden, a long walk from the city's distant spires.
- A map with no districts is sketched as country (`regionSvg` in the paint script) and painted from that. It names every place reached at any zoom, as it has few.
- A landmark marked `known`, such as Kordavos here, shows from the start.
- Covert Cargo still stands at the Kordavos map's off-map forest pier. It could move to this map.

## Settled by the text

- Kordavos is a port on the Jade Sea. The Mordava runs down to it.
- One land gate. The Marquis Road comes up to it. Garlan keeps it, and river cargo lands at the docks instead.
- The harvest square is just inside the gate. The Dragonbone Inn is the closest tavern to it.
- The docks hold the Blackthorn warehouses, Warehouse 14, the quay and the river pier. The Silver Serpent is by the docks, not on the quay.
- The Lower Districts lie past the docks along the quay. The Black Market is deeper in, behind a planked door off an alley.
- Silverhand's hideout warehouse is at the end of the docks. From there the party walks to the inn, and the ambush lane lies between.
- The Blackthorn Mansion is in the Asterian Quarter. A walled garden lies behind the ballroom balcony, with the drain grate by the estate wall.
- The grate opens on a tunnel under the noble estates, near the City Council chambers. It runs on through the maze, the sealed door and the Big Empty to the forgotten temple of Old Valkara.
- The Old Grand Library adjoins the Church of Valkara, with archives below.
- The old quarter, with the Valtor chapel, lies north of the maze.
- Covert Cargo's pier is about three miles upriver through the forest. The Marquis Road passes beyond the trees there.
- Aftermath scenes add gate towers, counting houses by the river, river barges and a grand square.

## Rulings

Owner, 2026-10-31, on the five that shape the map:

- The land gate faces south.
- Kordavos is an estuary port. The Mordava widens into the harbour on the Jade Sea.
- The Asterian Quarter holds the high ground, across the city from the docks.
- Two squares: the harvest square by the gate, the grand square before the mansion. The ballroom balcony faces the garden, a front balcony faces the square.
- The docks are their own district. The Lower Districts lie past them and climb behind.

Settled to fit, in the gazetteer's `rulings`:

- The Mordava runs west along the south wall. The Marquis Road follows its north bank to the gate.
- The city climbs from the harbour in the south-west to the Asterian heights in the north-east.
- The castle is a stage invention. It stands on the hill crown above the Asterian Quarter, marked `stageOnly`.
- Warehouse 14 is at the docks' west end, behind the quay warehouses. The Star of Faelendar is moored off it.
- The Mordava pier and the river pier are one pier, where the river meets the harbour.
- The temple gets no surface entrance. Joran's way in stays unstated.
- "The heart of Kordavos" is loose wording.
- 3D set bearings are local and do not bind the map.
