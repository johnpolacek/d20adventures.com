# Kordavos spatial claims

[Sources](../Sources.md) · [Kordavos city map](../plans/kordavos-city-map.md)

Every claim about Kordavos geography in the source text, quoted with its location. Extracted 2026-10-31 for the city map. Each part was read by a separate pass, so claim numbers restart per part and places can repeat. Rulings on the conflicts live in the plan.

Authority: the March of Davos encounters first, then NPC files and art direction, then Covert Cargo, then the 3D set scripts, then the legacy plan JSON. Each 3D set uses its own local compass, so a set's bearings hold only inside that set.

## Part A: encounters 1 to 16 and adventure.md

File keys: adv = adventure.md. All others are `encounters/<name>.md`, shortened: gates, front, festival, clan, inn (the-dragonbone-inn), opp (an-unsolicited-opportunity), morning, library, serpent, docks (arrival-at-the-docks), cargo (mystery-cargo), beast, aftermath, invite (an-invitation), lower (welcome-to-the-lower-districts), urchins.

### Places

- Kordavos | the capital, the city | capital of the March of Davos, "bustling capital", "trade hub" | adv
- March of Davos | the March | "wild and rugged frontier" region around Kordavos | adv
- Gates of Kordavos | the gate, the land gate, the arch, gatehouse | "towering stone archways" with banners, old gate-ward sigil carved over the arch, table beneath the arch | gates
- Gate line / approach road | the road | long line of travelers outside the arch, road runs back toward the Mordava | gates
- City walls | inside the walls | implied by Garlan's order to unstring a bow "inside the walls" | front
- Mordava | the river | river the road runs back toward, crates come "down the Mordava" by river tug | gates
- Festival square | the square | square just beyond the gates holding the Harvest Festival, stage at center, altar at edge | festival
- Festival streets | the streets | streets beyond the gates filled with stalls | festival
- Music stage | stage, musicStage | stage "in the center of the square" | festival
- Game stall | gameStall | vendor's game of chance | festival
- Madam Zephyra's tent | tent | fortune teller's stall/tent | festival
- Finnian's fire ring | fire ring | fire-eater's performance ring | festival
- Karim's stall, Liora's stall | stall | jewel and spice stalls in the festival | festival
- Valkaran harvest altar | the altar | altar "at the square's edge", Asterian banner hung over it | clan
- Parade stand | | stand "across the square" from the altar | clan
- Gate street | | street the watch pushes in from to reach the square | clan
- Dragonbone Inn | the Dragonbone, the inn | "closest tavern" to the festival at sunset, common room, fireplace, backroom, beds upstairs | inn
- Old Grand Library | the Grand Library, the library | ancient building "connected to the nearby Church of Valkara", ivy-lined stone walls, stained glass | morning (named), library (scene)
- Private archives | the archives below | chamber below the library down a winding staircase | library
- Church of Valkara (building) | the Church | "nearby", connected to the library | library
- Silver Serpent Tavern | the Silver Serpent, the tavern | dim dockside tavern "by the docks" | opp
- Docks of Kordavos | the docks, the harbor, the quay, the piers | "bustling docks", ships in berths, warehouses, crane | opp (named), docks (scene)
- River pier | | pier where the river tug unloaded, where Beric works | opp
- Noble's warehouse on the quay / main Blackthorn warehouse | | intended destination of the crate | opp, docks
- Blackthorn warehouses | | "their warehouses line the docks" | library
- Warehouse 14 | the shed, private shed, storage shed | small guarded shed down the pier, behind larger buildings | docks
- Star of Faelendar (ship berth) | the elven ship | elven ship docked at the harbor, held the drake | cargo
- Nearby shops (docks) | | shops whose windows the drake's roar rattles | beast
- Lower Districts | | poor district past the docks, narrow alleys, tenements | adv (hook), serpent
- Upper city | | contrasted with the Lower Districts | lower
- Black Market | | "an area known only as the Black Market" in the Lower Districts | serpent
- Lower Districts market streets | crowded market streets | crowded narrow streets and distant market stalls | lower, urchins
- Blackthorn mansion | the estate, the mansion | Blackthorn family seat, has a balcony and cellars, hosts the Masquerade Ball | festival (riddle), adv, invite
- Grand square | | site of a state funeral in one outcome | adv
- Secret Valtor sanctuary | | hidden Valtor site in one outcome | adv
- Elara's home | home | where Joran lived with Elara | morning
- Valkarr Forest | | forest north of the docks/city, drake flies toward it | adv, cargo, beast
- Faelendar | the elven settlement | elven settlement, source of a shipment | docks
- Road north | | road travelers pass through on, north | adv

### Claims

| # | subject | relation | object | quote (short, exact) | file:line | explicit/implied |
|---|---|---|---|---|---|---|
| 1 | Kordavos | is capital of | March of Davos | "its bustling capital, Kordavos" | adv:28 | explicit |
| 2 | Kordavos | character | trade hub | "Kordavos, the capital, is a trade hub" | adv:32 | explicit |
| 3 | Silverhand | operates in | Lower Districts | "Silverhand, a smuggler of the Lower Districts" | adv:49 | explicit |
| 4 | Sister Danica | is at | Old Grand Library | "Sister Danica of the Old Grand Library" | adv:54 | explicit |
| 5 | Gates | lie on | road north (travelers pass through Kordavos going north) | "Passing through on the road north" | adv:56 | implied (city sits on a north road) |
| 6 | Blackthorn mansion | has | balcony (public-facing, a declaration is made from it) | "Joran stands at the balcony of the Blackthorn mansion" | adv:63 | explicit |
| 7 | City | has | gates (plural) and a treasury | "Securing the Gates ... the city's remaining treasury" | adv:64 | explicit |
| 8 | Grand square | exists in | Kordavos | "a high-security state funeral ... held in the grand square" | adv:67 | explicit |
| 9 | Valtor sanctuary | is | secret site in the city or March | "a secret Valtor sanctuary" | adv:68 | explicit (location unstated) |
| 10 | Old Grand Library | can host | peace negotiations (large neutral venue) | "During the peace negotiations at the Old Grand Library" | adv:72 | explicit |
| 11 | Valkarr Forest | beyond | city, holds an ancient stronghold gateway | "something deeper in the Valkarr Forest" | adv:84 | explicit |
| 12 | Gates | form | towering stone archways with Asterian and Valkaran banners | "grand gates of Kordavos, towering stone archways" | gates:16 | explicit |
| 13 | Harvest Festival | is just beyond | the gates | "carry from the Harvest Festival just beyond" | gates:16 | explicit |
| 14 | Gate line | snakes back from | table beneath the arch | "It snakes back from a table beneath the arch" | gates:18 | explicit |
| 15 | Gate | staging spots | gateArch, ledger, sergeant, lineBack | "{place: gateArch}" "{place: ledger}" "{place: lineBack}" | gates:16,18,20,22 | explicit (map anchors) |
| 16 | Heroes | stand | a few places back from the table | "a few places back from the table" | gates:22 | explicit |
| 17 | Arch | carries | old gate-ward sigil carved over it | "the old gate-ward sigil carved over the arch" | gates:24 | explicit |
| 18 | Gatehouse | has | footings with stones older than expected | "trained on the gatehouse footings ... stones are older than they should be" | gates:26 | explicit |
| 19 | Mordava | lies | back down the approach road behind the line | "glancing back down the road toward the Mordava" | gates:36 | explicit |
| 20 | Approach | crosses or follows | the river (travelers wet from it) | "River mud still cakes his boots" / "stained with river water" | gates:36,38 | implied |
| 21 | Heroes | can see | the city from the line | "darting toward the city" | gates:40 | implied (city visible from gate line) |
| 22 | Blackthorn wagons | enter by | the same land gate, past the line | "rolls past the whole line ... wave it through the gate" | gates:42 | explicit |
| 23 | Gate line | duration | barely moved in an hour, trader there since dawn | "it has barely moved in an hour" / "since dawn" | gates:18,42 | explicit |
| 24 | Table | is far from | heroes' place in line (out of earshot) | "too far up the line to hear the heroes or be heard" | gates:52 | explicit |
| 25 | Stoneveils | were | gate-wards of this gate | "The Stoneveils kept this custom when they were the gate-wards" | gates:50 | explicit |
| 26 | Garlan's table | is | beneath the arch | "At the table beneath the arch" | front:19 | explicit |
| 27 | City | has | walls | "unstring it inside the walls" | front:36 | implied |
| 28 | Garlan's gate | is | the land gate, distinct from the docks | "Garlan keeps the land gate only. River cargo comes in at the docks" | front:42 | explicit |
| 29 | Arch | guarded by | two guards | "Two guards at the arch turn back anyone" | front:44 | explicit |
| 30 | Festival | fills | the streets beyond the gates | "Beyond the gates, the annual Valkaran Harvest Festival fills the streets" | festival:27 | explicit |
| 31 | Festival | staging spots | gameStall, musicStage | "{place: gameStall}" "{place: musicStage}" | festival:29,35 | explicit (map anchors) |
| 32 | Music stage | is in | center of the square | "On a stage in the center of the square" | festival:35 | explicit |
| 33 | Festival | features | stalls, tent, fire ring, stage | "come to her tent" "his fire ring" "his stage" | festival:15,17,21 | explicit |
| 34 | Mansion | has | cellars | "The mansion casts a shadow deeper than its cellars." | festival:15 | explicit (riddle) |
| 35 | Clan quarrel | is at | edge of the square | "a furious shout from the edge of the square" | festival:46 | explicit |
| 36 | Quarrel | is on | outskirts of the festival | "On its outskirts, two groups stare each other down" | clan:21 | explicit |
| 37 | Harvest altar | is at | the square's edge | "the Valkaran harvest altar at the square's edge" | clan:31 | explicit |
| 38 | Parade stand | is | across the square from the altar | "to the parade stand across the square" | clan:52 | explicit |
| 39 | Festival | includes | an Asterian parade (route unstated) | "for the Asterian parade" | clan:43 | explicit |
| 40 | Square | is reached from | the gate street | "pushes in from the gate street" | clan:65 | explicit |
| 41 | Square | is close to | the gate (watch arrives within a round) | "at the end of that round" | clan:65 | implied |
| 42 | Square | hears | evening bells | "out of the square before the evening bells" | clan:15,50 | implied (bells audible) |
| 43 | Dragonbone Inn | is | closest tavern to the festival/square | "The closest tavern is The Dragonbone Inn" | inn:19 | explicit (closest to where they are) |
| 44 | Inn | reached by | sunset of day one | "The sun sets ... time to find lodging" | inn:19 | implied |
| 45 | Inn | has | fireplace on one wall, dark corners, corner table | "A large fireplace dominates one wall" | inn:21,23 | explicit |
| 46 | Inn | has | bar | "by the bar" | inn:31 | explicit |
| 47 | Inn | has | beds upstairs | "A bed upstairs" | inn:34 | explicit |
| 48 | Inn | patrons include | dock smugglers | "dock smugglers and card sharps" | inn:38 | implied (docks within reach of inn) |
| 49 | Inn | has | dim backroom | "lead them to a dim backroom" | opp:31 | explicit |
| 50 | Crate | came | down the Mordava by river tug to the city | "A crate came down the Mordava on a river tug" | opp:33 | explicit (river flows into or past Kordavos, city downstream) |
| 51 | Crate | unloaded at | the river pier | "was unloaded at the river pier" | opp:39 | explicit |
| 52 | Noble's warehouse | is on | the quay | "a noble's warehouse on the quay" | opp:40 | explicit |
| 53 | Silver Serpent | is | by the docks | "The Silver Serpent Tavern by the docks" | opp:43 | explicit |
| 54 | Beric | works | the river pier | "works the river pier" | opp:48 | explicit |
| 55 | Upriver | is | outside the city along the Mordava | "what became of it upriver" | opp:51 | explicit |
| 56 | Inn | has | windows, front door | "Dawn light filters through the windows" / "The door creaks open" | morning:21,23 | explicit |
| 57 | Elara's home | is within | easy reach of the inn (she arrives at dawn with orders) | "you're early today" / "drop off those supply orders" | morning:27,31 | implied |
| 58 | Joran's route | Serpent to home | via the river | "came home smelling of the river" | morning:51 | implied |
| 59 | Library and tavern | reachable from | inn on foot the same morning | "the company setting off together" | morning:63 | implied |
| 60 | Docks and library | both | leads from the inn | "lead toward the docks and the library" | morning:59 | explicit |
| 61 | Library | is connected to | the nearby Church of Valkara | "Connected to the nearby Church of Valkara" | library:21 | explicit |
| 62 | Library | look | arched ceilings, ivy-lined stone walls, stained-glass windows | "arched ceilings, ivy-lined stone walls" | library:21 | explicit |
| 63 | Library | interior | towering shelves, alcoves, cobblestone floors | "Cobblestone floors worn by centuries" | library:23 | explicit |
| 64 | Library | age | ancient, centuries old | "the ancient building" | library:21 | explicit |
| 65 | Private archives | are | below the library | "Keeps to the private archives below" / "She leads the whole party down" | library:15,37 | explicit |
| 66 | Archives | reached by | winding staircase away from the main hall | "down a winding staircase, away from the main hall" | library:59 | explicit (legacy stage) |
| 67 | Archives | have | narrow stained-glass windows | "Dim light filters through narrow stained-glass windows" | library:67 | explicit (legacy stage) |
| 68 | Blackthorns | run trade through | the harbor, warehouses line the docks | "their warehouses line the docks" | library:45 | explicit |
| 69 | Library and archives | stand on | hallowed ground of Valkara | "stand on hallowed ground of Valkara" | library:47 | explicit |
| 70 | Library to Serpent | distance | walkable before or soon after midday | "the midday bell rings ... heads for the Silver Serpent" | library:53 | implied |
| 71 | Silver Serpent | smells of | seawater, has a carved sea map | "It smells of seawater" / "A large map of the sea" | serpent:19 | explicit |
| 72 | Black Market | is in | the Lower Districts | "works the Black Market in the Lower Districts" | serpent:26 | explicit |
| 73 | Cowl-wearers | frequent | the docks at night | "sniffing round the docks at night" | serpent:28 | explicit |
| 74 | Loric | drinks | elsewhere than the Serpent | "He drinks elsewhere." | serpent:29 | explicit |
| 75 | Road to Lower Districts | runs past | the docks (from the Serpent) | "the Lower Districts, whose road runs past the docks" | serpent:60 | explicit |
| 76 | Docks | look | ships in berths, piers, waves, gulls, saltwater | "Tall ships bob in their berths" / "the waves against the piers" | docks:23 | explicit |
| 77 | Docks scene | time | golden sunlight | "in golden sunlight" | docks:23 | explicit |
| 78 | Docks | divided into | sections, Loric runs one | "foreman of this section of the docks" | docks:33 | explicit |
| 79 | Warehouse 14 | is | down the pier from Loric, smaller, guarded | "a smaller, guarded warehouse down the pier" | docks:36 | explicit |
| 80 | Main Blackthorn warehouse | exists | at the docks, separate from the shed | "rather than the main Blackthorn warehouse" | docks:37 | explicit |
| 81 | Faelendar | is | an elven settlement, ships goods to the docks | "a strange shipment from Faelendar (the elven settlement)" | docks:37 | explicit |
| 82 | Warehouse 14 | is | tucked behind larger buildings, visible by pointing | "an inconspicuous storage shed tucked away behind larger buildings" | docks:44 | explicit |
| 83 | Quay end | has | no watch patrol | "No watch patrols this end of the quay." | docks:50 | explicit |
| 84 | Street to Lower Districts | runs along | this quay | "The street to the Lower Districts runs along this quay." | docks:54 | explicit |
| 85 | Docks | crowded with | porters | "The press of porters slows them" | docks:54 | explicit |
| 86 | Warehouse 14 | reached through | a maze of warehouses and narrow alleys | "through a maze of warehouses and narrow alleys" | cargo:21 | explicit |
| 87 | Warehouse 14 | sits | in a shadowed corner, sheltered from the sea breeze | "tucked in a shadowed corner ... away from the sea breeze" | cargo:21 | explicit |
| 88 | Warehouse 14 | interior | filled with crates, chained crate at back wall | "The warehouse is filled with crates" / "Against the back wall" | cargo:35,44 | explicit |
| 89 | Star of Faelendar | docked at | the far end of the harbor | "a ship currently docked at the far end of the harbor" | cargo:46 | explicit |
| 90 | Map | shows | route through the Valkarr Forest | "a route through the Valkarr Forest" | cargo:46 | explicit |
| 91 | Crash | heard from | the docks outside Warehouse 14 | "a massive, bone-shaking crash echoes from the docks outside" | cargo:54 | explicit (ship within earshot of shed) |
| 92 | Star of Faelendar | is | nearby, in a berth, out from the warehouse | "A nearby elven ship, the Star of Faelendar, rocks violently in its berth" | beast:21 | explicit |
| 93 | Berth | is | deep water at the quay edge | "dockworkers dive into the water" | beast:21 | explicit |
| 94 | Ship berth | is near | shops with windows | "rattles the windows of nearby shops" | beast:23 | explicit |
| 95 | Ship | has | gangplank to the quay | "At the edge of the gangplank" | beast:25 | explicit |
| 96 | Lower Districts | are close to | the docks (drake could reach them) | "If that beast reaches the Lower Districts" | beast:27 | implied (adjacent) |
| 97 | Docks | have | warehouse roofs a drake can perch on | "takes to the warehouse roofs" | beast:13,39 | explicit |
| 98 | Docks | have | a crane with heavy cargo nets beside it | "Heavy cargo nets lie by the crane." | beast:45 | explicit |
| 99 | Roof | reachable from | crane or crate stack | "by the crane or a stack of crates" | beast:50 | explicit |
| 100 | Valkarr Forest | lies | north of the docks | "flies north toward the Valkarr Forest" | beast:53 | explicit |
| 101 | Docks berth | is | a quay with dockworkers working it | "Dockworkers caught on the quay" | beast:48 | explicit |
| 102 | Elven crew | spent the night at | the festival ashore | "spent the night ashore at the festival" | aftermath:49 | implied (festival walkable from docks) |
| 103 | Astrid | starts | near the party | "startNear: \"party\"" | aftermath:14 | explicit (frontmatter) |
| 104 | Docks after fight | strewn with | shattered crates, torn sails | "docks strewn with shattered crates and torn sails" | aftermath:22 | explicit |
| 105 | Ship | has | a deck above the quay | "calls from the ship's deck" / "Astrid climbs aboard" | aftermath:28,32 | explicit |
| 106 | Covenant | rumored in | the Lower Districts | "whispers of a Covenant in the Lower Districts" | aftermath:53 | explicit |
| 107 | Astrid | starts | near the party | "startNear: \"party\"" | invite:14 | explicit (frontmatter) |
| 108 | Blackthorn estate | hosts | the Masquerade Ball | "a Masquerade Ball at our estate" | invite:22 | explicit |
| 109 | Mansion | visit time | sunset on the festival's final day | "Come to the mansion at sunset on the festival's final day" | invite:30 | explicit |
| 110 | Lower Districts | unfriendly to | Blackthorns | "no one in the Lower Districts talks to a Blackthorn" | invite:36 | explicit |
| 111 | Docks | adjoin | crate stack (invite left in a crate) | "tucks it into a crate" | invite:40 | explicit |
| 112 | Lower Districts | are reached | past the docks | "Past the bustling docks, the streets of Kordavos give way to the shadowy alleys" | lower:16 | explicit |
| 113 | Lower Districts | look | narrow leaning buildings, little sun | "the sun rarely reaches between the narrow, leaning buildings" | lower:16 | explicit |
| 114 | Lower Districts | contrast with | the upper city | "The laughter and commerce of the upper city fade." | lower:16 | explicit (implies lower elevation or social split) |
| 115 | Lower Districts | layout | tenements, crooked alleys like a maze, uneven streets with refuse | "crooked alleys twist in every direction like a maze" | lower:18 | explicit |
| 116 | Lower Districts | wealth | wealthy rarely go there | "where the wealthy rarely tread" | lower:18 | explicit |
| 117 | Party | arrives from | the docks | "Players arrive from the docks." | lower:22 | explicit |
| 118 | Market streets | lie | further into the Lower Districts | "as the party presses into the crowded market streets" | lower:35 | explicit |
| 119 | Lower Districts | streets | winding, chimney smoke, distant market stalls | "Chimney smoke hangs in the air, and the clatter of distant market stalls" | urchins:21 | explicit |
| 120 | Lower Districts alleys | are | crowded and narrow, with side streets | "dash into a narrow alley" / "split up into different side streets" | urchins:23,33 | explicit |
| 121 | Black Market | lies | deeper into the Lower Districts | "the party moves on deeper into the Lower Districts" | urchins:43 | explicit |
| 122 | Day 1 route | gate, square, inn | gate to festival square to inn by sunset | transitions chain | front:52, festival:50, clan:71, inn:19 | implied (all walkable in an afternoon) |
| 123 | Day 2 route | inn, library, Serpent, docks, Lower Districts | all in one day, morning to golden sunlight | "Dawn light" / "midday bell" / "golden sunlight" | morning:21, library:53, docks:23 | implied (inn, library, Serpent, docks within walking distance) |

### Contradictions or ambiguities

- River port or sea harbor. The crate comes "down the Mordava on a river tug" to "the river pier" (opp:33, opp:39), and Garlan says "River cargo comes in at the docks" (front:42). But the docks smell of "saltwater", with "Tall ships", "gulls and the waves" (docks:23), the Serpent "smells of seawater" with "a map of the sea" (serpent:19), and Warehouse 14 is "away from the sea breeze" (cargo:21). Fits a river mouth on the sea, but no text says so.
- Mordava's position. It lies "back down the road" behind the gate line (gates:36), outside the land gate, yet also feeds the docks (opp:33). The map must route the river past the approach road and into the harbor. No text says which side of the city the gate is on.
- Warehouse 14 location. "down the pier" (docks:36) suggests along the waterfront. "tucked away behind larger buildings" (docks:44) and "through a maze of warehouses and narrow alleys ... away from the sea breeze" (cargo:21) suggest inland of the quay.
- Star of Faelendar position. The map marks it "docked at the far end of the harbor" (cargo:46), yet it is "A nearby elven ship" right outside Warehouse 14 (beast:21) and its crash is heard from the shed (cargo:54). Either the shed is also at the far end, or one claim is loose.
- Shipment destination. "a noble's warehouse on the quay" (opp:40) vs "the main Blackthorn warehouse" (docks:37). Likely the same building, not stated.
- Two shipments or one. Loric's DC 15 line is "a strange shipment from Faelendar" (docks:37), and the DC 12 line is a river tug crate down the Mordava (docks:38). Both went to Warehouse 14. Faelendar's direction relative to the river is not given.
- Archive below ground with windows. The archives are "below" down "a winding staircase" (library:15, library:59) but have "narrow stained-glass windows" (library:67). Could be a sunken half-basement or a hillside, unstated.
- Lower Districts elevation. "upper city" (lower:16) implies the Lower Districts sit lower, but the text may mean social standing. No hill or slope is ever named.
- Grand square vs festival square. The state funeral is "in the grand square" (adv:67). The festival is in "the square" beyond the gate (festival:35, clan:31). Same square or not is unstated.
- Inn location. "The closest tavern" (inn:19) is relative to the festival square, so near the gate. Its distance to the docks and the library is never stated, only implied walkable (morning:63).
- Route Serpent to docks. The Serpent is "by the docks" (opp:43), but the party still travels "to the docks" as a separate move (serpent:60). The Serpent is near but not on the quay.
- Church of Valkara building. The library is "Connected to the nearby Church of Valkara" (library:21). "Connected" and "nearby" pull slightly apart (attached vs a short way off).
- Gates singular or plural. "the grand gates ... towering stone archways" (gates:16) and "Securing the Gates" (adv:64) vs "the land gate" (front:42). Possibly one gatehouse with several arches, or several city gates.
- Blackthorn mansion location. Never placed. Only the balcony (adv:63), the cellars (festival:15) and "the mansion" (invite:30) are given.
- Road north. The hook "Passing through on the road north" (adv:56) and the drake fleeing "north toward the Valkarr Forest" (beast:53) both point north, but nothing says whether the land gate faces north or south.

## Part B: encounters 17 to 32

Paths are relative to `content/settings/realm-of-myr/adventures/march-of-davos/encounters/`.

### Places
- Kordavos | the city | the capital, where the whole span takes place | shadowing-silverhand.md
- Lower Districts | | narrow, close-built, poor streets with leaning rickety buildings, damp and stagnant water, where Silverhand rules | finding-the-black-market.md
- Black Market | the market, the maze | an underground labyrinth of stalls and tents behind a hidden planked doorway in the Lower Districts | finding-the-black-market.md
- Black Market hidden doorway | planked doorway, makeshift entrance, the curtain | planks and a heavy cloth curtain between two crumbling buildings, off an alley, marked with snake-and-moon | finding-the-black-market.md
- Auction hall | candlelit chamber, candlelit hall, underground chamber, auction house | a candlelit hall at the market's heart, down the main lane behind a heavy curtain, with a side exit | labyrinthine-stalls.md
- Vesk's stall | shadowy corner stall | a stall in a shadowy corner of the market | labyrinthine-stalls.md
- The docks | port, pier, quay, the edge of the docks | the seafront, with ships, warehouses and a pier, where the Blackthorn shipment was opened and the earlier docks fight happened | shadowing-silverhand.md
- The harbor | | the water by the docks, named in Silverhand's threat | face-to-face-with-silverhand.md
- The sea | | mist rolls in from it over the docks | the-hideout.md
- Silverhand's hideout | the warehouse at the end of the docks, abandoned warehouse | a boarded-up wooden warehouse at the edge or end of the docks, with a loose upper window and a back entrance hidden by crates | shadowing-silverhand.md
- Dragonbone Inn | the inn | where the party lodges, with an attic, run by Bram | the-ambush.md
- Ambush street | | a narrow lane of shops with rooftops, on the way from the docks to the inn (not named) | the-ambush.md
- Asterian Quarter | | the district that holds the Blackthorn Mansion | entry-to-the-ball.md
- Blackthorn Mansion | the mansion, a Blackthorn house | towering spires, stone walls, iron gates, a cobblestone courtyard and a grand staircase, in the Asterian Quarter | the-ambush.md
- Covenant's tunnels | what lies beneath the city, sealed doors beneath the city | tunnels under the city, mentioned but not found in this span | the-ambush.md
- Valkarr Forest | Valkarr forest | outside the city, the source of elven goods and the relic map, home of the elves | labyrinthine-stalls.md
- Faelendar | | Aelindor's elven home, outside the city | a-distraction.md
- Hammerdeep | | origin of a rare whiskey, outside the city | face-to-face-with-silverhand.md

### Claims
| # | subject | relation | object | quote (short, exact) | file:line | explicit/implied |
|---|---|---|---|---|---|---|
| 1 | Party route | goes deeper into | Lower Districts | "Deeper into the Lower Districts, the streets close in." | finding-the-black-market.md:16 | explicit |
| 2 | Party | was already in the Lower Districts before this scene (came from somewhere further out) | Lower Districts | "Deeper into the Lower Districts" | finding-the-black-market.md:16 | implied |
| 3 | Lower Districts | character | narrow, leaning, crowded | "Rickety buildings lean overhead, casting long shadows" | finding-the-black-market.md:16 | explicit |
| 4 | Lower Districts | terrain/smell | damp, stagnant water | "The air smells of damp stone and stagnant water." | finding-the-black-market.md:16 | explicit |
| 5 | Lower Districts | quieter than | the busier city | "The bustle of the city fades" | finding-the-black-market.md:16 | explicit |
| 6 | Lower Districts buildings | built of | stone walls and wooden beams | "carved into the stone walls and wooden beams" | finding-the-black-market.md:20 | explicit |
| 7 | Black Market | hidden, found by changing symbols | Lower Districts streets | "These symbols change daily, keeping the Black Market hidden" | finding-the-black-market.md:20 | explicit |
| 8 | Black Market doorway | lies between | two crumbling buildings | "a planked doorway between two crumbling buildings" | finding-the-black-market.md:24 | explicit |
| 9 | Black Market | is in | Lower Districts | sceneTitle "The Lower Districts" with section "The Black Market" | finding-the-black-market.md:3 | implied |
| 10 | Black Market doorway | entrance form | planks and cloth curtain | "a few old planks nailed together" ... "A heavy cloth curtain hangs over it" | the-entrance-to-the-black-market.md:19 | explicit |
| 11 | Black Market doorway | opens onto | an alley | "Downed heroes come to in the alley outside" | the-entrance-to-the-black-market.md:35 | explicit |
| 12 | Black Market entrance | is narrow | | "The narrow entrance opens into the shadowy Black Market" | labyrinthine-stalls.md:28 | explicit |
| 13 | Black Market | layout | labyrinth of stalls and tents | "a labyrinth of stalls and tents" | labyrinthine-stalls.md:28 | explicit |
| 14 | Black Market | is below | street level | "You won't find craftsmanship like this above ground, love." | labyrinthine-stalls.md:36 | implied |
| 15 | Vesk's stall | is in | a shadowy corner of the market | "a stall tucked away in a shadowy corner" | labyrinthine-stalls.md:52 | explicit |
| 16 | Elven goods | come from | Valkarr forest | "ornate wooden carvings from the Valkarr forest" | labyrinthine-stalls.md:54 | explicit |
| 17 | Auction hall | is at | the market's heart, down the main lane, behind a curtain | "the candlelit hall at the market's heart, down the main lane behind a heavy curtain" | labyrinthine-stalls.md:64 | explicit |
| 18 | Black Market | has | a main lane | "down the main lane" | labyrinthine-stalls.md:64 | explicit |
| 19 | Auction hall | is deeper than | the stalls | "a candlelit chamber deeper in the Black Market" | the-auction-begins.md:19 | explicit |
| 20 | Silverhand | controls illicit trade in | Kordavos | "the man who controls the flow of illicit goods and information in Kordavos" | the-auction-begins.md:31 | explicit |
| 21 | Relic map | recovered from | Valkarr Forest | "Recovered from the depths of the Valkarr Forest" | a-relic-of-old-valkara.md:25 | explicit |
| 22 | Auction hall | has | a back of the hall, walls with guards | "comes to on the floor at the back of the hall" | a-relic-of-old-valkara.md:64 | explicit |
| 23 | Auction hall | has | a side exit | "he slips into the shadows near the side exit" | the-winning-bid.md:29 | explicit |
| 24 | Silverhand's route out | heads into | Lower Districts streets | "heading for the labyrinthine streets of the Lower Districts" | the-winning-bid.md:31 | explicit |
| 25 | Lower Districts | street pattern | labyrinthine, winding alleys | "lose the trail in the winding alleys" | the-winning-bid.md:39 | explicit |
| 26 | Auction exit | leads out to | a lane | "Silverhand's party just turning down a lane ahead" | the-winning-bid.md:41 | explicit |
| 27 | Party | could head for | the inn (from the auction) | "questions the room or turns for the inn" | the-winning-bid.md:41 | explicit |
| 28 | Auction hall | is | an underground chamber | "the adventurers emerge from the underground chamber" | shadowing-silverhand.md:25 | explicit |
| 29 | Silverhand's route | goes through | alleys, away from nightlife | "The hum of the city's nightlife fades as the trail winds through the alleys" | shadowing-silverhand.md:27 | explicit |
| 30 | Silverhand's route | leads toward | the city's forgotten corners, away from the law | "Silverhand leads deeper into the city's forgotten corners, far from the eyes of the law" | shadowing-silverhand.md:27 | explicit |
| 31 | Route | has | several intersections, lanterns | "Every few intersections, one of his guards pauses" | shadowing-silverhand.md:27 | explicit |
| 32 | Route | includes | a narrow alley | "block their path in a narrow alley" | shadowing-silverhand.md:31 | explicit |
| 33 | Silverhand's route | ends at | the docks | "Silverhand slips away toward the docks" | shadowing-silverhand.md:33 | explicit |
| 34 | Route near docks | has | mist | "he slips off into the mist toward the docks" | shadowing-silverhand.md:37 | explicit |
| 35 | Hideout | is | the warehouse at the end of the docks | "The warehouse at the end of the docks." | shadowing-silverhand.md:41 | explicit |
| 36 | Black Market to docks | distance | walkable within one scene (three rounds) | "Move on at the end of the third round at the latest, as the trail ends at the docks." | shadowing-silverhand.md:43 | implied |
| 37 | Black Market | is within walking distance of | the docks | party follows Silverhand on foot from auction to hideout | shadowing-silverhand.md:25-43 | implied |
| 38 | Hideout route | returns to | the docks (party was at the docks before) | "The trail leads back to the docks." | the-hideout.md:21 | explicit |
| 39 | Docks | face | the sea | "Evening mist rolls in from the sea over the ships and warehouses." | the-hideout.md:21 | explicit |
| 40 | Docks | contain | ships, warehouses, a pier | "over the ships and warehouses ... waves splashing against the pier" | the-hideout.md:21 | explicit |
| 41 | Hideout | is at | the edge of the docks | "At the edge of the docks the adventurers spot their destination, an abandoned warehouse" | the-hideout.md:21 | explicit |
| 42 | Hideout | exterior | wooden, boarded windows, rusted door, lantern | "its windows boarded up and its rusted metal door" | the-hideout.md:23 | explicit |
| 43 | Hideout | has | an upper floor and a back entrance | "a loose window on the upper floor or a back entrance hidden by crates" | the-hideout.md:27 | explicit |
| 44 | Kaeleth | watches | the docks from near the hideout | "watches the docks from the shadows near the hideout" | the-hideout.md:15 | explicit |
| 45 | Hideout | is near | the harbor water | "why I shouldn't have you thrown into the harbor" | face-to-face-with-silverhand.md:41 | implied |
| 46 | Hideout | is close enough to water to threaten "swim" | | "Put it down and walk out, or swim." | face-to-face-with-silverhand.md:62 | implied |
| 47 | Blackthorn shipment | was stolen at | the docks, on the quay | "steal the Blackthorn shipment at the docks" | face-to-face-with-silverhand.md:49 | explicit |
| 48 | Docks | have | a quay | "opened the Blackthorn shipment on the quay" | face-to-face-with-silverhand.md:55 | explicit |
| 49 | Relic map | shows route | from city into Valkarr Forest | "It shows a route into the Valkarr Forest to a lost cache" | face-to-face-with-silverhand.md:60 | explicit |
| 50 | Hideout | to | Dragonbone Inn | "the night air takes them back toward the inn" | face-to-face-with-silverhand.md:68 | explicit |
| 51 | Docks/hideout | is within walking distance of | Dragonbone Inn | "make their way back to the Dragonbone Inn through eerily quiet streets" | the-ambush.md:23 | implied |
| 52 | Route docks to inn | street character | narrow roads, cobblestones, lanterns | "Lanterns flicker weakly along the narrow roads ... across the cobblestones" | the-ambush.md:23 | explicit |
| 53 | Ambush site | has | shops and rooftops | "It sinks into the wooden door of a shop" ... "On the dark rooftops" | the-ambush.md:25 | explicit |
| 54 | Ambush site | streets | narrow, stone | "booms through the narrow streets" ... "cracks form in the nearby stone" | the-ambush.md:27 | explicit |
| 55 | Ambush site | has | alleys | "leaving only the cold wind in the alleys" | the-ambush.md:37 | explicit |
| 56 | Ambush site | is close to | Dragonbone Inn | "The adventurers walk on to the Dragonbone Inn" | the-ambush.md:37 | implied |
| 57 | Ambush site | has rooftops reachable by climbing | | "If the heroes climb to the rooftops, search the lanes" | the-ambush.md:41 | explicit |
| 58 | Covenant | has | tunnels | "The Covenant's tunnels are not found tonight." | the-ambush.md:41 | explicit |
| 59 | Dragonbone Inn | has | an attic | "a trunk of \"forgotten\" costumes in the inn's attic" | the-ambush.md:50 | explicit |
| 60 | Party | travels from | Dragonbone Inn to Blackthorn Mansion | "head to the Blackthorn Mansion on the final night of the festival" | the-ambush.md:58 | explicit |
| 61 | Blackthorn Mansion | is in / approached via | Asterian Quarter | "the adventurers approach the Asterian Quarter. The Blackthorn Mansion looms ahead" | entry-to-the-ball.md:21 | explicit |
| 62 | Dragonbone Inn | is outside | Asterian Quarter | "approach the Asterian Quarter" | entry-to-the-ball.md:21 | implied |
| 63 | Blackthorn Mansion | is visible from | approach to the Asterian Quarter, against the sky | "its towering spires silhouetted against the darkening sky" | entry-to-the-ball.md:21 | explicit |
| 64 | Blackthorn Mansion | built of | stone walls | "Torchlight flickers across its imposing stone walls." | entry-to-the-ball.md:21 | explicit |
| 65 | Mansion grounds | has | wrought iron gates with Valkaran and Asterian symbols | "Wrought iron gates worked with Valkaran and Asterian symbols" | entry-to-the-ball.md:23 | explicit |
| 66 | Mansion grounds | has | cobblestone courtyard with carriages | "guide carriages through the cobblestone courtyard" | entry-to-the-ball.md:23 | explicit |
| 67 | Mansion | entrance raised above | courtyard by a grand staircase | "climb the grand staircase to the entrance" | entry-to-the-ball.md:23 | explicit |
| 68 | Mansion | has | a side door for servants | "slip in with the servants and musicians at the side door" | entry-to-the-ball.md:42 | explicit |
| 69 | Asterian Quarter | is reachable by carriage | | "Uniformed servants guide carriages" | entry-to-the-ball.md:23 | implied |
| 70 | Mansion interior | character | Asterian architecture with Valkaran carvings | "blending with the sleek Asterian architecture" | inside-the-ball.md:16 | explicit |
| 71 | Mansion | contrasts with | the city outside (Valkaran hardship) | "a world away from the hardship of the common Valkarans ... in the city outside" | inside-the-ball.md:20 | explicit |
| 72 | Mansion | is | the heart of the Blackthorns' domain | "Here, in the heart of the Blackthorns' domain" | inside-the-ball.md:20 | explicit |
| 73 | Kordavos | economic contrast | many poor | "many in the city can barely afford bread" | inside-the-ball.md:26 | explicit |
| 74 | Mansion | has | kitchens, service doors, halls beyond the ballroom | "out of the kitchens, the service doors and the halls beyond" | inside-the-ball.md:32 | explicit |
| 75 | Astrid | fought beside the party at | the docks | "the rugged ranger they fought beside in the chaos of the docks" | the-blackthorns.md:28 | explicit |
| 76 | Mansion | has | a grand rotunda | "stands prominently in the mansion's grand rotunda" | the-blackthorns.md:54 | explicit |
| 77 | Mansion | has | a basement vault | "a key to his desk and the basement vault" | the-blackthorns.md:68 | explicit |
| 78 | Kordavos | was ruled before by the Valkarans, then the Asterians came | | "the family's past before the Asterians came" | the-blackthorns.md:46 | explicit |
| 79 | Kordavos | lies within | March of Davos, ruled by the Margrave | "The March of Davos is at a turning point ... The Margrave sees the future" | the-blackthorns.md:58 | explicit |
| 80 | Kordavos | has something | beneath the city | "any plan for the Key or what lies beneath the city" | the-lady-and-the-bishop.md:63 | explicit |
| 81 | Beneath the city | has | sealed doors | "talk of sealed doors beneath the city" | the-lady-and-the-bishop.md:65 | explicit |
| 82 | Ballroom | has | a stage | "a crystal chime rings from the stage" | the-lady-and-the-bishop.md:67 | explicit |
| 83 | Ballroom | has | grand doors | "The grand doors swing open" | a-distraction.md:25 | explicit |
| 84 | Ballroom | has | a curtained area at the far side | "At the far side of the ballroom a tall velvet curtain" | a-distraction.md:39 | explicit |
| 85 | Valkarr Forest elves | allied with | Blackthorns | "our alliance with the ancient people of the Valkarr Forest" | a-distraction.md:23 | explicit |
| 86 | Mansion | has | upper floors (family rooms, master's wing) and a cellar | "Above, one passage leads to the family rooms and another to the master's wing. On the right, narrow steps descend" | through-the-halls.md:18 | explicit |
| 87 | Mansion cellar | smells of | aged wine or damp stone | "smells faintly of aged wine or damp stone" | through-the-halls.md:18 | explicit |
| 88 | Ballroom | is below | the hallway | "the last note fades below" ... "hurries back down to the ballroom" | through-the-halls.md:24 | explicit |

### Contradictions or ambiguities
- Hideout position on the docks. "The warehouse at the end of the docks" (shadowing-silverhand.md:41) vs "At the edge of the docks" (the-hideout.md:21). Both fit a warehouse at the far end of the waterfront, but "edge" could also mean the landward margin.
- "The trail leads back to the docks" (the-hideout.md:21) implies the party has already been at the docks, which matches the earlier docks fight (the-blackthorns.md:28, face-to-face-with-silverhand.md:49). Nothing here says whether the Black Market or Lower Districts touch the docks or are some way off.
- Silverhand leads "deeper into the city's forgotten corners, far from the eyes of the law" (shadowing-silverhand.md:27) yet ends at the docks (shadowing-silverhand.md:43). So the docks, or the route to them, read as lawless and forgotten. Whether the docks are part of the Lower Districts is never stated.
- Distance from the Black Market to the docks. Late evening and the walk fits in three rounds (shadowing-silverhand.md:25, 43). Rounds are pacing, not travel time, so this proves walkability, not that it is short.
- The Black Market reads as underground ("above ground", labyrinthine-stalls.md:36, "emerge from the underground chamber", shadowing-silverhand.md:25). But its doorway is a planked entrance between two buildings at street level (the-entrance-to-the-black-market.md:19) with no stair mentioned. A descent beyond the curtain is implied but never described.
- Inside the market, the hall is "at the market's heart" (labyrinthine-stalls.md:64) and "deeper in the Black Market" (the-auction-begins.md:19), yet Silverhand leaves by a "side exit" (the-winning-bid.md:29) that lets out onto a lane (the-winning-bid.md:41). So the market has at least two exits to the street.
- Time of day. "Fading light" while finding the market (finding-the-black-market.md:16), "tonight's exclusive event" at the auction (the-auction-begins.md:23), "late evening" on leaving (shadowing-silverhand.md:25). The moon is "low" (shadowing-silverhand.md:25) then "waning" (the-ambush.md:23). Not geographic, but it affects lighting.
- Mansion floors. The ballroom is reached up the grand staircase from the courtyard (entry-to-the-ball.md:23). The hallway leads off it, with stairs up and down at its end (through-the-halls.md:18). Yet the music "fades below" and the party "hurries back down to the ballroom" (through-the-halls.md:24), which suggests the hallway is above the ballroom. Interior only.
- The Asterian Quarter is the only district named besides the Lower Districts. Its position relative to the docks, the inn or the Lower Districts is never given (entry-to-the-ball.md:21).
- The Dragonbone Inn's location is never stated. It is only a walk from the hideout (face-to-face-with-silverhand.md:68, the-ambush.md:23), and Kaeleth's line implies the auction lane is also a walk from it (shadowing-silverhand.md:41).
- No river, walls, gates, bridges, squares or elevation are named anywhere in these 16 files.
- Things beneath the city: "The Covenant's tunnels" (the-ambush.md:41) and "sealed doors beneath the city" (the-lady-and-the-bishop.md:65). Neither is tied to a district or entrance here. The drain grate is not mentioned in this span. Silverhand "names no street, house, grate or tunnel" (face-to-face-with-silverhand.md:56).

## Part C: encounters 33 to 49

All paths are relative to `content/settings/realm-of-myr/adventures/march-of-davos/encounters/`. Line numbers come from `cat -n`.

### Places
- Kordavos | the city | the capital. Seen from Thaddeus's window, has foundations the tunnels run through, gate towers, a river, a grand square, lower districts | thaddeus-blackthorns-private-chambers.md
- Blackthorn mansion | the house, the estate | multi-storey house with upper floors, wings, a ballroom with a balcony, a cellar and a walled garden | the-rangers-quarters.md
- Upper floors / family wing | "this wing" | where Astrid's quarters are. Linked to the master's wing "along the upper floor" | the-rangers-quarters.md
- Master's wing / lavish corridor | | the wing "deeper in the mansion's winding halls" with Thaddeus's door | the-lavish-corridor.md
- Thaddeus's private chambers | | its large window "looks out over moonlit Kordavos" | thaddeus-blackthorns-private-chambers.md
- Stairway hall / spiral staircase | | link between the upper floors and the ground floor (named only in transitions) | the-rangers-quarters.md
- Grand ballroom | | has a stage, a curtain on the far side, side doors and a balcony | the-speech.md
- Ballroom balcony | balcony, bannister | overlooks the walled garden. The assassin goes over it by rope | death-to-the-murderer.md
- Wine cellar | basement vault, below stairs | reached by a narrow spiral stone stair, smells of damp earth. A hidden vault holds the Drakovan archives | the-wine-cellar.md
- Blackthorn garden | walled Blackthorn garden, dark garden, moonlit courtyard | walled, with hedges, flower beds, stone paths and gravel. The grate is here | death-to-the-murderer.md
- The grate | old drainage grate, hidden egress point, the entrance | disguised as a drain, warded. A stone staircase leads down from it | the-chase.md
- Estate wall | "the estate's ivy-choked wall" | the grate is near it | the-hunt-for-the-assassin.md
- Festival streets | | city streets outside the estate, which the assassin never reaches | death-to-the-murderer.md
- The tunnel / catacombs | "Into the Catacombs", the network | a long narrow tunnel "deep into the foundations of Kordavos". It has a pillared chamber where the barrels are set | into-the-catacombs.md
- The labyrinth | maze of forks | forks with east and west spurs and a center path, lined with transmission stones | through-the-labyrinth.md
- City Council chambers | | one transmission stone is "directly beneath" them | through-the-labyrinth.md
- Noble estates | | the tunnels are used to eavesdrop on them "above" | through-the-labyrinth.md
- Valtor chapel | Valtor chapels | "in the old quarter", north along the oldest line of stones | through-the-labyrinth.md
- Old quarter | | where the Valtor chapel is | through-the-labyrinth.md
- Seamless wall / sealed door | inner sanctum gateway | black iron door "tied to the city's own ley lines" | through-the-labyrinth.md
- Big Empty | vast cavernous chamber, "empty cellar", the ruins | a dusty tomb-like hall with one narrow archway at the far end | big-empty.md
- Forgotten temple | inner sanctum, hidden cathedral, "the heart of Old Valkara" | white marble, oak-carved pillars, an altar, an alcove behind the altar | forgotten-temple.md
- Gate towers / gates | | Asterian banners came down from them. "before the gates close" | the-new-dawn.md
- The square | | below the Blackthorn mansion balcony in The New Dawn | the-new-dawn.md
- River | | counting houses stand by it. River barges sail on it | the-new-dawn.md
- Counting houses | | "by the river", tied to the city's treasury | the-new-dawn.md
- Grand square | | site of Thaddeus's funeral | vengeance-of-the-blackthorn.md
- Lower districts | | curfews fall over them | vengeance-of-the-blackthorn.md
- Taverns | | general, unnamed | vengeance-of-the-blackthorn.md
- Old Grand Library | | site of the truce talks | the-dust-settles.md
- Mordava pier | the pier | where the Oath Stone was bought. Not placed relative to Kordavos | thaddeus-blackthorns-private-chambers.md
- The quay | | where Joran took the Key from the Blackthorn shipment. Not placed | final-confrontation.md
- Dragonbone Inn | the inn | named only as where Eamon was before. Not placed | the-hunt-for-the-assassin.md
- Valkarr Forest | Valkaran wilderness | outside the city. Only symbolic and trade references here | the-rangers-quarters.md
- March of Davos | the March | the region around the city | the-new-dawn.md

### Claims

| # | subject | relation | object | quote (short, exact) | file:line | explicit/implied |
|---|---|---|---|---|---|---|
| 1 | Astrid's quarters | on | upper floors, above the ballroom | "On the upper floors, the masquerade ball below is a distant echo." | the-rangers-quarters.md:16 | explicit |
| 2 | Mansion upper floors | exposed to | wind, many windows | "gusts of wind rattle the ornate windows" | the-rangers-quarters.md:16 | explicit |
| 3 | Astrid's study | does not connect to | Covenant tunnels | "the Covenant's tunnels are not found from here" | the-rangers-quarters.md:44 | explicit |
| 4 | Astrid's study draft | comes from | chimney flue | "the draft comes down an old chimney flue no wider than a hand" | the-rangers-quarters.md:44 | explicit |
| 5 | Ranger's quarters | linked to | master's wing, along the upper floor | "leaves the quarters for the master's wing along the upper floor" | the-rangers-quarters.md:56 | explicit |
| 6 | Upper floors | linked to | stairway hall by spiral staircase | "back down the spiral staircase to the stairway hall" | the-rangers-quarters.md:57 | explicit |
| 7 | Master's wing | lies | deep inside the mansion | "Deeper in the mansion's winding halls" | the-lavish-corridor.md:19 | explicit |
| 8 | Master's wing | far from | ballroom | "the ball barely audible this far into the mansion" | the-lavish-corridor.md:23 | explicit |
| 9 | Thaddeus's chambers window | looks out over | Kordavos | "a large window looks out over moonlit Kordavos" | thaddeus-blackthorns-private-chambers.md:18 | explicit |
| 10 | Blackthorn mansion | stands high or tall enough to overlook | the city | "looks out over moonlit Kordavos" | thaddeus-blackthorns-private-chambers.md:18 | implied |
| 11 | Oath Stone deal | took place at | Mordava pier | "bought of the Circle of Faelendar at the Mordava pier" | thaddeus-blackthorns-private-chambers.md:56 | explicit |
| 12 | Wine cellar | below | the mansion, reached by spiral stone stair | "narrow stone staircase spirals down into the depths of the Blackthorn mansion" | the-wine-cellar.md:21 | explicit |
| 13 | Wine cellar | terrain | damp, earth, water | "smells faintly of damp earth and aged wood" / "dripping water" | the-wine-cellar.md:21 | explicit |
| 14 | Cellar stair | ends at | corridor to the cellar | "At the bottom, a dimly lit corridor leads to the wine cellar." | the-wine-cellar.md:23 | explicit |
| 15 | Vault | behind | the far rack, against the furthest stone wall | "the ornate wooden wine rack set against the furthest stone wall" | the-wine-cellar.md:57 | explicit |
| 16 | Vault | contains | archive only, no passage | "a narrow alcove behind it with a small, but heavily fortified vault door" | the-wine-cellar.md:63 | implied (no exit described) |
| 17 | Drakovans | controlled | regional trade routes and Valkaran lands | "seize control of key trade routes in the region" | the-wine-cellar.md:81 | explicit |
| 18 | Ballroom | has | stage, curtain on the far side | "Thaddeus gestures to the far side of the ballroom" | the-speech.md:35 | explicit |
| 19 | Ballroom | has | side doors onto a crowded corridor | "leaves the ballroom by the side doors" / "loses her in the crowded corridor" | the-speech.md:43 | explicit |
| 20 | Ballroom | has | a balcony with a bannister over a drop | "races for the balcony ... vaults the bannister, a rope ready for a quick descent into the darkness below" | death-to-the-murderer.md:31 | explicit |
| 21 | Ballroom balcony | overlooks | walled garden, not the street | "The balcony overlooks the walled Blackthorn garden, not the street." | death-to-the-murderer.md:37 | explicit |
| 22 | Garden | contains | hedges below the balcony | "The assassin's rope drops him among the hedges below" | death-to-the-murderer.md:37 | explicit |
| 23 | Assassin's route | runs from | balcony to garden to grate | "making for the grate" | death-to-the-murderer.md:37 | explicit |
| 24 | Festival streets | outside | the estate, not reached | "He never reaches the festival streets." | death-to-the-murderer.md:37 | explicit |
| 25 | Ballroom | above | garden (raised floor) | "peers over the balcony ... the dark garden below" | the-chase.md:19 | explicit |
| 26 | Garden | features | greenery, flower beds, stone paths, ivy | "Among the lush greenery and manicured flower beds" | the-chase.md:21 | explicit |
| 27 | Grate | set into | garden stone paths, under ivy | "old drainage grate hidden beneath the ivy ... almost indistinguishable from the garden's stone paths" | the-chase.md:21 | explicit |
| 28 | Grate ward | is | Valkaran script, Cowl only | "Shut to all but the Cowl." | the-chase.md:33 | explicit |
| 29 | Ballroom | has | exits for guests | "Guests scream and rush toward the exits" | the-chase.md:35 | explicit |
| 30 | Garden | reached from | the house by guards (and by rope) | "sent out to the garden by the guards" | the-chase.md:37 | explicit |
| 31 | Astrid | comes down into | garden | "Lady Astrid comes down into the garden with lanterns" | the-chase.md:39 | explicit |
| 32 | Garden area | called | moonlit courtyard with stone balustrades | "crosses the moonlit courtyard" / "whistles through the stone balustrades" | the-hunt-for-the-assassin.md:21 | explicit |
| 33 | Garden ground | is | soil and gravel | "churned-up soil" / "boots crunching on gravel" | the-hunt-for-the-assassin.md:21, :27 | explicit |
| 34 | Grate | near | estate wall | "By a heavy drainage grate near the estate's ivy-choked wall" | the-hunt-for-the-assassin.md:25 | explicit |
| 35 | Grate | leads down | well-kept stone staircase | "disguised as a water drain but reveals a well-maintained stone staircase" | the-hunt-for-the-assassin.md:48 | explicit |
| 36 | Party | descends from | grate stairs into the tunnel | "when the party descends the stairs into the darkness" | the-hunt-for-the-assassin.md:58 | explicit |
| 37 | Tunnel | runs | deep under Kordavos | "A long, narrow tunnel runs deep into the foundations of Kordavos." | into-the-catacombs.md:26 | explicit |
| 38 | Tunnel | terrain | cool, damp, iron, deep stone | "smelling faintly of iron and deep stone" | into-the-catacombs.md:26 | explicit |
| 39 | Barrel chamber | distance from | grate stair: several minutes' walk | "After several minutes the walls widen." | into-the-catacombs.md:28 | explicit |
| 40 | Barrel chamber | has | support pillars, bend before it | "Torchlight flickers around a bend" / "against the support pillars" | into-the-catacombs.md:28, :30 | explicit |
| 41 | Surface wards | above | barrel chamber | "The wards at the surface are down." | into-the-catacombs.md:32 | explicit |
| 42 | Stair | behind | barrel chamber, held by soldiers | "Astrid's soldiers hold the stair behind the party" | into-the-catacombs.md:46 | explicit |
| 43 | Tunnel | continues | past the chamber | "tries to flee down the tunnel" | into-the-catacombs.md:48 | explicit |
| 44 | Tunnel network | continues | deeper beyond chamber | "the party flees deeper into the network" | into-the-catacombs.md:55 | explicit |
| 45 | Labyrinth | starts | past the barrel chamber | "Past the barrels, the tunnel splits into a maze of identical forks" | through-the-labyrinth.md:22 | explicit |
| 46 | Labyrinth | terrain | rough stone, dripping water, no light | "rough-hewn stone, dripping water, no natural light" | through-the-labyrinth.md:22 | explicit |
| 47 | Labyrinth | branches | east spur, west spur, center path | "Take the east and west spurs ... We take the center path." | through-the-labyrinth.md:28 | explicit |
| 48 | Tunnels | run beneath | noble estates | "eavesdrop on the noble estates above" | through-the-labyrinth.md:32 | explicit |
| 49 | Transmission stone | directly beneath | City Council chambers | "This one is directly beneath the City Council chambers." | through-the-labyrinth.md:32 | explicit |
| 50 | City Council chambers | near (within reach on foot of) | Blackthorn mansion | "This one is directly beneath the City Council chambers." | through-the-labyrinth.md:32 | implied (some minutes of tunnel plus the maze) |
| 51 | Oldest line of stones | runs | north | "the oldest line of stones runs north, toward the Valtor chapel in the old quarter" | through-the-labyrinth.md:41 | explicit |
| 52 | Valtor chapel | in | old quarter | "the Valtor chapel in the old quarter" | through-the-labyrinth.md:41 | explicit |
| 53 | Old quarter | north of | the labyrinth (and so likely of the mansion area) | "runs north, toward the Valtor chapel in the old quarter" | through-the-labyrinth.md:41 | implied |
| 54 | Labyrinth | ends at | seamless stone wall after a sharp turn | "After a sharp turn, the tunnel ends at a massive, seamless stone wall" | through-the-labyrinth.md:34 | explicit |
| 55 | Sealed door | tied to | the city's ley lines | "It's tied to the city's own ley lines." | the-sealed-door.md:30 | explicit |
| 56 | Sealed door | is the entry to | inner sanctum | "This is the inner sanctum." | the-sealed-door.md:26 | explicit |
| 57 | Big Empty | lies | beyond the sealed door | "the black iron door rumbles open ... Beyond lies a vast, cavernous chamber" | big-empty.md:24, :26 | explicit |
| 58 | Big Empty | is | very tall, ceiling unseen | "its ceiling lost in darkness the torches cannot reach" | big-empty.md:26 | explicit |
| 59 | Big Empty | has | one narrow archway at the far end | "At the far end, a single narrow archway leads further in." | big-empty.md:26 | explicit |
| 60 | Big Empty | called | a cellar | "All this? For an empty cellar?" | big-empty.md:30 | explicit (character speech) |
| 61 | Big Empty | part of | older ruins | "a presence far older than the ruins themselves" | big-empty.md:41 | explicit |
| 62 | Forgotten temple | through | the Big Empty archway | "Through the archway, rough stone gives way to impossible architecture." | forgotten-temple.md:26 | explicit |
| 63 | Catacombs | are | a decoy for the temple | "The catacombs were a decoy. This is the heart of Old Valkara." | forgotten-temple.md:24 | explicit (character speech) |
| 64 | Forgotten temple | beneath | Kordavos, older than the city | "a sky Kordavos hasn't seen in a thousand years" | forgotten-temple.md:26 | implied |
| 65 | Forgotten temple | layout | central altar, oak pillars, vault | "At the center of this hidden cathedral stands a grand altar" | forgotten-temple.md:28 | explicit |
| 66 | Alcove | behind | the altar, in the wall | "a narrow alcove in the wall behind the altar" | forgotten-temple.md:34 | explicit |
| 67 | Joran | reached the temple | before the party | "Joran, who has already reached the sanctum" | forgotten-temple.md:34 | explicit |
| 68 | Temple | has | a second way in (Joran's route) | "who has already reached the sanctum" | forgotten-temple.md:34 | implied, never stated |
| 69 | Temple | lies | very deep, out of reach of city help | "No watch or help comes this deep" | final-confrontation.md:44 | explicit |
| 70 | Temple exit | through | archway, then up the tunnel | "driven off up the tunnel" / "through the archway into the tunnel" | final-confrontation.md:48 | explicit |
| 71 | Tunnel | climbs | from temple toward surface | "driven off up the tunnel" | final-confrontation.md:48 | implied (temple below grate) |
| 72 | Key theft | at | the quay | "took the Key from the Blackthorn shipment on the quay" | final-confrontation.md:46 | explicit |
| 73 | Old clans' council | in | Kordavos | "restore the old clans' council in Kordavos" | final-confrontation.md:44 | explicit |
| 74 | Kordavos | has | bells | "Dawn breaks over Kordavos to the sound of bells." | the-new-dawn.md:15 | explicit |
| 75 | Kordavos | has | gate towers | "the Asterian banners came down from the gate towers" | the-new-dawn.md:15 | explicit |
| 76 | Blackthorn mansion balcony | overlooks | a square | "From the balcony of the Blackthorn mansion ... Below him the square fills" | the-new-dawn.md:17 | explicit |
| 77 | Counting houses | by | the river | "barred themselves in the counting houses by the river" | the-new-dawn.md:19 | explicit |
| 78 | City treasury | at | the counting houses by the river | "they mean to flee with the city's treasury" | the-new-dawn.md:19 | implied |
| 79 | Kordavos | has | closable gates (walled city) | "before the gates close" | the-new-dawn.md:19 | explicit (walls implied) |
| 80 | Grand square | site of | Thaddeus's funeral | "laid to rest beneath black banners in the grand square" | vengeance-of-the-blackthorn.md:15 | explicit |
| 81 | Valtor chapels | are | plural, in the city | "the Valtor chapels are searched" | vengeance-of-the-blackthorn.md:19 | explicit |
| 82 | Lower districts | exist in | Kordavos (elevation tiers) | "curfews fall over the lower districts" | vengeance-of-the-blackthorn.md:19 | explicit (lower vs upper implied) |
| 83 | Lower districts | have a Valkaran or poorer character | "the old ways that sheltered them" plus curfews on the lower districts | vengeance-of-the-blackthorn.md:17, :19 | implied |
| 84 | Kordavos | has | taverns | "In the taverns, people lower their voices" | vengeance-of-the-blackthorn.md:19 | explicit |
| 85 | Old Grand Library | site of | truce talks | "come to the table in the Old Grand Library" | the-dust-settles.md:17 | explicit |
| 86 | River | navigable | by barges | "the river barges sail again" | the-dust-settles.md:19 | explicit |
| 87 | Festival | banners in | the city | "The festival banners come down" | the-dust-settles.md:19 | explicit |

### Contradictions or ambiguities
- Balcony view. death-to-the-murderer.md:37 says the ballroom balcony "overlooks the walled Blackthorn garden, not the street". the-new-dawn.md:17 has Joran on "the balcony of the Blackthorn mansion" with "the square" filling below him. Either the mansion has two balconies (garden side and square side), or these conflict. A map with the mansion fronting a square and the ballroom balcony on the garden side satisfies both.
- Garden or courtyard. death-to-the-murderer.md:37 and the-chase.md:21 describe a walled garden with hedges, flower beds and stone paths. the-hunt-for-the-assassin.md:21 calls the same ground a "moonlit courtyard" with "stone balustrades" and gravel (:27). Probably one space, a formal garden court.
- Grate position. the-chase.md:21 puts it in the garden stone paths. the-hunt-for-the-assassin.md:25 puts it "near the estate's ivy-choked wall". These fit if the grate is in a path at the garden's edge, by the wall.
- What the underground is called. into-the-catacombs.md (title) says catacombs. The text says "tunnel" (into-the-catacombs.md:26) and "network" (:55). Astrid calls the Big Empty "an empty cellar" (big-empty.md:30), the GM notes say "ruins" (big-empty.md:41), and Astrid says "The catacombs were a decoy" (forgotten-temple.md:24). No bones or burial niches are described anywhere in these files.
- Joran's route in. forgotten-temple.md:34 says Joran "has already reached the sanctum". But the grate was warded "Shut to all but the Cowl" (the-chase.md:33), the black iron door was sealed (the-sealed-door.md:30), and the Big Empty dust shows "no footprints leading to that archway. Only scuff marks beneath the dust" (big-empty.md:36). Whether Joran used the same tunnel or another entrance is never stated.
- Main tunnel direction. No file gives a compass bearing for the grate-to-temple tunnel. The only bearing is the "oldest line of stones runs north, toward the Valtor chapel in the old quarter" (through-the-labyrinth.md:41). The east and west spurs (through-the-labyrinth.md:28) suggest the center path runs roughly north or south, but that is not stated.
- "Directly beneath the City Council chambers" (through-the-labyrinth.md:32) follows "Look at the angle". It is unclear if the stone sits under the chambers or points at them. If it sits under them, the council chambers are a short walk underground from the mansion.
- Valtor chapel count. Singular "the Valtor chapel in the old quarter" (through-the-labyrinth.md:41) vs plural "the Valtor chapels are searched" (vengeance-of-the-blackthorn.md:19).
- Squares. "the square" below the mansion balcony (the-new-dawn.md:17) and "the grand square" for the funeral (vengeance-of-the-blackthorn.md:15) may be the same place or two places. Not stated.
- Pier and quay. "the Mordava pier" (thaddeus-blackthorns-private-chambers.md:56) and "the quay" where the shipment was hit (final-confrontation.md:46) are not placed relative to Kordavos or its river (the-new-dawn.md:19, the-dust-settles.md:19). Whether Mordava is a district, a place in Kordavos, or a separate town is not in these files.
- Depth versus distance. The tunnel runs "deep into the foundations" (into-the-catacombs.md:26) and "No watch or help comes this deep" (final-confrontation.md:44). Travel time is given only once, "After several minutes" to the barrel chamber (into-the-catacombs.md:28). The maze and the Big Empty have no length.
- Mansion elevation. The view "out over moonlit Kordavos" (thaddeus-blackthorns-private-chambers.md:18) and "the lower districts" (vengeance-of-the-blackthorn.md:19) suggest the mansion is on high ground, but no file says the mansion is uphill.

## Part D: NPCs, art direction, Covert Cargo, 3D sets, legacy JSON

Paths are relative to the repo root. Abbreviations: AD = content/settings/realm-of-myr/art-direction.md, NPC = content/settings/realm-of-myr/npcs/, CC = content/settings/realm-of-myr/adventures/covert-cargo/, SS = scripts/stage-sets/, MODP = wiki/sources/adventure plans/the-march-of-davos-plan.json, RMJ = wiki/sources/adventure plans/realm-of-myr.json, RTKJ = wiki/sources/adventure plans/the_road_to_kordavos_adventure_plan.json, CCJ = wiki/sources/adventure plans/covert-cargo.json. MODP paths shorten `sections.N.scenes.N.encounters.N` to `sN.scN.eN`.

Stage-set compass: the engine frame is -z = north, +x = east. Confirmed by SS/kordavos-docks.ts:36 ("the harbour lies north (z < 0)") and :52-53 (sun "from the east-north-east" = [0.72, 0.3, -0.62]), and SS/dragonbone-inn.ts:46-48 ("south-south-east" = [0.4, 0.5, 0.76]). Each set is built in its own local frame, so directions only hold within a set. They are not proven to agree across sets. See the contradictions.

Covert Cargo: yes, its city is Kordavos. The boat is "bound for Kordavos" (CC/encounters/the-shipment.md:25), and the city is "three miles back through the forest" (CC/encounters/return-to-the-city.md:15).

### Places

- Kordavos | the capital, the city | capital of the March of Davos, a port city on the coast of the Jade Sea | RMJ locations.1
- March of Davos | Davos | frontier march in the southern regions of Thylún, ruled by Margrave Aeron Davos | RMJ locations.0
- Jade Sea | | the sea whose coast Kordavos sits on | RMJ locations.1.description
- Mordava River | the Mordava | river flowing down to Kordavos. Has a quiet fork with a smugglers' pier about 3 miles out | CC/adventure.md:20
- Discreet pier on the Mordava fork | secret dock | smugglers' pier in forest about 3 miles from the city | CC/encounters/the-shipment.md:25
- Bank trail | | trail from the pier through the forest to Kordavos | CC/encounters/overboard.md:34
- Marquis Road | the road to Kordavos | road to the festival city, through hill woods and then giant-tree woods, ending at the south gate | CC/encounters/return-to-the-city.md:19
- Standing Stones | | upstream point Thalbern followed the Mordava down from | CC/encounters/the-shipment.md:39
- Valkarr Forest | Valkarr woods | vast forest on the eastern borders of the March. Holds the elven vaults | RMJ locations.2
- South gate | the great gate, grand gates, gates of Kordavos | gatehouse in the outer walls where the Marquis Road enters | wiki/plans/road-to-kordavos-sets.md:13
- Outer walls | | aged granite with twin-towered gatehouse | AD:33
- Outer town | | buildings outside the walls by the gate (stage dressing only) | packages/stage/src/sets/realm-of-myr/kordavos-south-gate.json objects "outer-town"
- Harvest square | the square, festival square | festival square just inside the gate, with a music stage | SS/clan-conflict.ts:1-2
- Great square | the square | square closed by a great house with a balcony. Used at dawn and for the funeral | SS/kordavos-streets.ts:2-3
- Great house on the square | | stone house with a balcony at the head of the great square | SS/kits/street.ts:24
- Dragonbone Inn | the inn | tavern "in the heart of Kordavos", nearest the festival | MODP s0.sc1.e1.narrative
- Old Grand Library | Grand Library of Kordavos | library joined to the Church of Valkara, with private archives | MODP s1.sc0.description
- Old Valkaran Archives | private archives | archives at the Grand Library | CC/encounters/the-shipment.md:33
- Church of Valkara | main temple | church next to the library | MODP s1.sc0.e0.narrative
- Docks | harbour, port, quay | salt-weathered harbour quay with tall ships and warehouses | AD:36
- Warehouse 14 | storage shed | timber shed in the docks' west corner | NPC/warehouse-thug.md:12
- Harbour tower | | round tower at the far east end of the quay | SS/kordavos-docks.ts:192
- Silver Serpent Tavern | the Silver Serpent | sailors' tavern among the dock warehouses, opening north onto the quay | MODP s1.plot
- Riverfront | Kordavos riverfront, right-bank quay | river quay inside the city, houses and towers on both banks | SS/covert-cargo.ts:807-809
- Castle on its hill | castle | castle with pale towers on a hill, seen across the harbour and down the river | SS/covert-cargo.ts:879
- Lower Districts | Lower District | narrow tenement streets next to the docks | AD:37
- North End | | orderly district set against the Lower District | MODP s2.plot
- Upper district / upper city | | district set against the lower district. Spires seen from below | MODP s0.sc2.e0.narrative
- Asterian Quarter | Asterian quarter | wealthy quarter of the Blackthorn Mansion | AD:35
- Black Market | | hidden market in the Lower District, entered through a curtained arch | MODP s1.plot
- Auction house / auction chamber | | chamber deeper in the Black Market | MODP s2.sc2.e0.narrative
- Abandoned warehouse (Silverhand's hideout) | hidden den | warehouse at the edge of the docks | MODP s2.sc3.e1.narrative
- Night lanes | | lanes with a crossing and an archway house, on Silverhand's trail | SS/kordavos-streets.ts:39-41
- Waterfront lane | | lane of old stone houses down to the quay, in sea mist | SS/kordavos-streets.ts:216-217
- Blackthorn Mansion | the mansion | Blackthorn house "at the heart of Kordavos" | MODP summary
- Blackthorn garden and drain grate | | walled garden east of the mansion. The drain grate is the tunnel entrance | SS/blackthorn-mansion.ts:469-471
- Catacombs | underground tunnels | Covenant tunnel network beneath the city | AD:39
- Forgotten temple | lost temple of old Valkara, Old Valkara | hidden cathedral under the city beyond the catacombs | MODP s4.sc1.e0.narrative
- City Council chambers | | spied on through the tunnels | MODP s4.sc0.e2.notes
- Noble estates and guildhouses | | have hidden chambers on the tunnel network | MODP s4.sc0.e2.narrative
- Faelendar | | elven settlement. The drake and the Star of Faelendar come from there | CC/encounters/the-shipment.md:75
- Willowdale Dell | the Dell | halfling hill country, Poppen's home | RMJ locations.4

### Claims

| # | subject | relation | object | quote (short, exact) | file:line (or json path) | tier | explicit/implied |
|---|---|---|---|---|---|---|---|
| 1 | Kordavos | is capital of | March of Davos | "Kordavos, the capital of the March of Davos" | RMJ locations.1.description | 4 | explicit |
| 2 | Kordavos | lies on | coast of the Jade Sea | "Nestled on the coast of the Jade Sea, it is a bustling port city" | RMJ locations.1.description | 4 | explicit |
| 3 | Kordavos | lies at | edge of the wild lands of Valkara | "on the edge of the wild and untamed lands of Valkara" | RMJ locations.1.description | 4 | explicit |
| 4 | Kordavos | is | gateway to Valkaran lands | "It stands as a gateway to the untamed lands of Valkara" | RMJ locations.1.description | 4 | explicit |
| 5 | March of Davos | lies in | southern Thylún | "nestled in the southern regions of the continent of Thylún" | RMJ locations.0.description | 4 | explicit |
| 6 | Valkarr Forest | lies along | eastern borders of the March | "stretches across the eastern borders of the March of Davos" | RMJ locations.2.description | 4 | explicit |
| 7 | Asterian Empire | lies | far to the east | "far to the east, the Asterian Empire rose to prominence" | RMJ locations.0.history | 4 | explicit |
| 8 | Valkaran lands | border | northern wilds (raiders) | "raiders from the northern wilds" | RMJ locations.0.history | 4 | implied |
| 9 | Kordavos | is | a port capital on a frontier | "A prosperous port capital on a wild frontier." | AD:32 | 1 | explicit |
| 10 | Kordavos architecture | is | Valkaran stonework with Asterian dressing | "Ancient Valkaran stonework retrofitted with Asterian banners, lamps and iron." | AD:32 | 1 | explicit |
| 11 | City | has | outer walls and gatehouse with twin towers | "Outer walls and gatehouse: aged granite blocks ... twin towers with conical timber roofs" | AD:33 | 1 | explicit |
| 12 | Streets and market | are | cobbled, timber-framed, jettied | "cobbles and flagstones, timber-framed houses with jettied upper floors" | AD:34 | 1 | explicit |
| 13 | Blackthorn Mansion | lies in | Asterian Quarter | "Asterian Quarter and the Blackthorn Mansion: pale ashlar, towering spires" | AD:35 | 1 | implied (grouped under one heading) |
| 14 | Asterian Quarter | has | carriage courtyard, wrought-iron gates | "cobblestone carriage courtyard, grand exterior staircase" | AD:35 | 1 | explicit |
| 15 | Docks | are | timber piers with tall ships, salt-weathered | "salt-weathered timber piers on pilings, tall ships at berth" | AD:36 | 1 | explicit |
| 16 | Docks | have | warm low sun on the water | "warm low sun on water" | AD:36 | 1 | explicit (lighting, implies open water view) |
| 17 | Lower Districts | are | narrow leaning tenements that block the sun | "narrow leaning tenements that block the sun, dilapidated timber" | AD:37 | 1 | explicit |
| 18 | Silver Serpent | is | a sailors' den | "The Silver Serpent is a sailors' den" | AD:38 | 1 | explicit |
| 19 | Beneath the city | are | tunnels and catacombs, with Old Valkara deeper | "Beneath the city: hand-carved tunnels and catacombs ... Deeper still is Old Valkara" | AD:39 | 1 | explicit |
| 20 | Raskov Clan | dresses for | docks and black market | "Raskov Clan: smugglers. Dock and black-market dressing" | AD:45 | 1 | implied (Raskov operate at docks/black market) |
| 21 | City crest | hangs on | civic buildings | "worn by the city guard, hung on civic buildings" | AD:27 | 1 | explicit |
| 22 | Silverhand | runs smuggling in | Kordavos | "head of the Raskov Clan's smuggling operations in Kordavos" | NPC/silverhand.md:12 | 1 | explicit |
| 23 | Garlan Ironfist | is | Kordavos city guard | "the polished armor of the Kordavos city guard" | NPC/garlan-ironfist.md:12 | 1 | explicit |
| 24 | Warehouse 14 | is at | the docks | "guard Warehouse 14 at the docks" | NPC/warehouse-thug.md:12 | 1 | explicit |
| 25 | Forest drake | was released at | the docks | "shipped from Faelendar and released at the docks" | NPC/forest-drake.md:12 | 1 | explicit |
| 26 | Underground temple | has | an approach guarded by undead | "guarding the underground temple approach" | NPC/ancient-undead.md:12 | 1 | explicit |
| 27 | Black Market | has | corner stalls | "a shadowy corner stall of the Black Market" | NPC/vesk-the-fence.md:11 | 1 | explicit |
| 28 | Silas | grew up in | back alleys of the city | "grew up in the grimy back alleys of the city" | NPC/npcs-1749181492795.md:16 | 1 | explicit |
| 29 | Sister Elara's village | lies | near the capital | "grew up in a small village near the capital" | NPC/npcs-1749870721240.md:16 | 1 | explicit |
| 30 | Kordavos | has | a main temple of Valkara | "She is now returning to the main temple" | NPC/npcs-1749870721240.md:16 | 1 | implied (temple location unstated) |
| 31 | Pier | lies on | a quiet fork of the Mordava | "a discreet pier on a quiet fork of the Mordava River" | CC/adventure.md:20 | 2 | explicit |
| 32 | River boat | is bound for | Kordavos | "a river boat bearing a secret shipment bound for Kordavos" | CC/adventure.md:20 | 2 | explicit |
| 33 | Pier | lies below | a wooded treeline and bank | "the bushes at the treeline above the gangway" | CC/adventure.md:30 | 2 | explicit |
| 34 | Pier | connects by | bank trail into woods | "go up the bank trail into the woods" | CC/adventure.md:38 | 2 | explicit |
| 35 | Kordavos | is downstream of | the pier | "its light fades downstream toward Kordavos" | CC/encounters/overboard.md:16 | 2 | explicit |
| 36 | Kordavos | is about 3 miles from | the pier | "return to the city, which is about 3 miles away" | CC/encounters/the-crate.md:21 | 2 | explicit |
| 37 | Route pier to city | runs | through forest by the bank trail | "Kordavos is three miles through the forest by the bank trail" | CC/encounters/overboard.md:34 | 2 | explicit |
| 38 | Route pier to city | runs | back through the forest | "is three miles back through the forest" | CC/encounters/return-to-the-city.md:15 | 2 | explicit |
| 39 | Marquis Road | runs | beyond the trees from the pier woods, to the city | "Beyond the trees, the Marquis Road still fills with travelers bound for the festival" | CC/encounters/return-to-the-city.md:19 | 2 | explicit (implies the road passes near the Mordava woods) |
| 40 | Mordava | flows from | Standing Stones, through trees, toward Kordavos | "He has followed the Mordava down from the Standing Stones through the trees" | CC/encounters/the-shipment.md:39 | 2 | explicit |
| 41 | Elven vaults | are in | Valkarr woods, upriver | "relics taken from the elven vaults of the Valkarr woods" | CC/encounters/the-shipment.md:39 | 2 | implied (upriver) |
| 42 | Grand Library | holds | Old Valkaran Archives | "the Old Valkaran Archives at the Grand Library" | CC/encounters/the-shipment.md:33 | 2 | explicit |
| 43 | Pier site | has | bare willows, crickets, old pylons | "wind stirs the bare willows" | CC/encounters/the-shipment.md:27 | 2 | explicit |
| 44 | Thalbern | lives on | edge of Kordavos | "Lives on the edge of Kordavos" | CC/characters/thalbern.md:17 | 2 | explicit |
| 45 | Secret dock | lies | not far from the city | "a secret dock not far from the city" | CC/characters/1749307435667.md:19 | 2 | explicit |
| 46 | Harbour | lies | north of the quay | "the harbour lies north (z < 0) with its water 4 m down" | SS/kordavos-docks.ts:36 | 3 | explicit |
| 47 | Quay | runs | east-west, 22 m deep to warehouses facing the water | "the quay runs south 22 m to a row of stone warehouses facing the water" | SS/kordavos-docks.ts:37 | 3 | explicit |
| 48 | Star of Faelendar | berths along | the quay | "The Star of Faelendar lies along the quay" | SS/kordavos-docks.ts:37 | 3 | explicit |
| 49 | Warehouse 14 | stands at | west end of quay, by the harbour wall | "a timber shed at the west end ... between a tall warehouse and the harbour wall" | SS/kordavos-docks.ts:38-39 | 3 | explicit |
| 50 | Warehouses | have | a gap for a street up into the city | "with a gap for a street up into the city" | SS/kordavos-docks.ts:178 | 3 | explicit |
| 51 | Warehouses | continue | east along the harbour | "and more running on east along the harbour" | SS/kordavos-docks.ts:178-179 | 3 | explicit |
| 52 | Harbour tower | stands at | far (east) end of the quay | "A round harbour tower at the far end of the quay" | SS/kordavos-docks.ts:192 | 3 | explicit (east from x = 112) |
| 53 | City | climbs | uphill behind (south of) the docks | "Beyond the street gap, houses climbing into the city." | SS/kordavos-docks.ts:194 | 3 | explicit (south from +z) |
| 54 | Harbour | extends | east, "far end" of the harbour | "Across the harbour to the north, and down its far end to the east." | SS/kordavos-docks.ts:586 | 3 | explicit |
| 55 | Across the harbour (north) | is | far quays, city on its hill, castle | "the far quays and the city on its hill, in golden late light" | scripts/stage-backdrops.ts:67 | 3 | explicit |
| 56 | Far harbour shore | shows | houses up a hill, church spire, castle on hilltop | "houses with red tile roofs stacked up a hill behind, round and square towers, a church spire, and a castle" | scripts/stage-backdrops.ts:72 | 3 | explicit |
| 57 | Docks | have | low sun from east-north-east over water | "Golden low sun from the east-north-east over the water" | SS/kordavos-docks.ts:52 | 3 | explicit (lighting) |
| 58 | Riverfront | is | a right-bank quay with river running north | "from the right-bank quay: the river runs along -z" | SS/covert-cargo.ts:808 | 3 | explicit (north from -z. Water flow [0,-1] at :937 makes north downstream, so right bank = east) |
| 59 | River through city | has | houses and round towers on both banks | "timber-framed houses and round towers line both banks" | SS/covert-cargo.ts:809 | 3 | explicit |
| 60 | Castle | stands on | a hill beyond the riverfront, about 235 m downstream on the east side | "and the castle stands on its hill beyond" | SS/covert-cargo.ts:809, 879-880 | 3 | explicit (distance and side from coordinates [34, -235]) |
| 61 | River in city | carries | ships at moorings and under sail | "Ships at their moorings and one under sail." | SS/covert-cargo.ts:849 | 3 | explicit |
| 62 | Riverfront quay | opens onto | a wide paved square | "a painted far side of the square" | SS/covert-cargo.ts:955 | 3 | explicit |
| 63 | Square behind riverfront | shows | townhouses, round towers, castle walls on a hill in the distance | "in the far distance the walls of a castle on a hill" | scripts/stage-backdrops.ts:58 | 3 | explicit |
| 64 | Riverfront quay | connects to | the road into the city | "the road into the city" | SS/covert-cargo.ts:962 | 3 | explicit (label) |
| 65 | Riverfront | has | a riverside tower | "the riverside tower" | SS/covert-cargo.ts:963 | 3 | explicit (label) |
| 66 | Mordava at pier | flows | north (local frame), west bank steep and wooded | "The west bank climbs steeply into wooded hills behind the tug" | SS/covert-cargo.ts:92, 252 | 3 | explicit (west bank). Flow north implied by water flow [0,-1] at :552 |
| 67 | Lower Districts street | runs | north under a bridge-house | "The street runs from the camera's end (z = 14) north under the bridge-house" | SS/lower-districts.ts:31 | 3 | explicit |
| 68 | Lower Districts alley | turns off | west of the street | "The alley turns off west at z = -7.5" | SS/lower-districts.ts:32-33 | 3 | explicit |
| 69 | Lower Districts | connect | down to the docks at the near (south) end | "The way back down to the docks: another archway closing the street's near end." | SS/lower-districts.ts:98 | 3 | explicit ("down" puts the docks lower than the Lower Districts) |
| 70 | Upper city spires | rise | far up the street beyond the Lower Districts (north) | "Spires of the upper city over the roofs, far up the street." | SS/lower-districts.ts:132 | 3 | explicit |
| 71 | Party | arrives | up from the docks into the Lower Districts | "the party has come up from the docks and stands where the street narrows" | SS/lower-districts.ts:439 | 3 | explicit |
| 72 | Lower Districts | have | low evening sun far up the street (north) | "a low sun behind thin cloud far up the street" | SS/lower-districts.ts:342 | 3 | explicit (lighting) |
| 73 | Black Market court | is closed at | south by a house with a passage to the alleys | "closed at the south by a house with a passage back to the alleys" | SS/black-market.ts:32-33 | 3 | explicit |
| 74 | Black Market lane | runs | north to the auction house | "Beyond it the lane runs north ... to the auction house" | SS/black-market.ts:33-34 | 3 | explicit |
| 75 | Black Market | has | side lanes east and west | "Side lanes turn off east at z = -11 and west at z = -21" | SS/black-market.ts:34-35 | 3 | explicit |
| 76 | Auction hall | lies | behind the Black Market lane's far door | "behind the Black Market lane's far door" | wiki/plans/march-of-davos-sets.md:33 | 3 | explicit |
| 77 | Night lanes | lead | north to a crossing and an archway | "who walk on up the street toward the crossing" | SS/kordavos-streets.ts:40 | 3 | explicit |
| 78 | Night lanes | look up at | spires | "spires: ... label: \"The spires\"" | SS/kordavos-streets.ts:58 | 3 | explicit |
| 79 | Way back to the inn | runs | south down the street from the ambush lanes | "The party walks back toward the inn (down the street, +z)." | SS/kordavos-streets.ts:113 | 3 | explicit (south from +z) |
| 80 | Ambush lanes | have | stone houses taller than tenements round them | "both stone houses taller than the tenements round them" | SS/kordavos-streets.ts:114 | 3 | explicit |
| 81 | Waterfront lane | runs | down to the quay | "A lane of old stone houses down to the quay, sea mist rolling in." | SS/kordavos-streets.ts:217 | 3 | explicit |
| 82 | Abandoned warehouse | stands | on the east side of the lane near the water | "The abandoned warehouse stands on the east side near the water" | SS/kordavos-streets.ts:217-218 | 3 | explicit |
| 83 | Waterfront quay | lies | at the north end of the lane | "A lane of old stone houses ending at a quay over the harbour at z = -30." | SS/kits/street.ts:22 | 3 | explicit (north from -z) |
| 84 | Waterfront | has | a tall harbour tower to the west | "and a tall harbour tower to the west" | SS/kits/street.ts:222 | 3 | explicit |
| 85 | Great square | is | 28 m wide, closed at north by a great house | "a square 28 m wide, closed at z = -36 by a great house with a balcony" | SS/kits/street.ts:24 | 3 | explicit |
| 86 | Great square | gets | dawn sun from the east down cross streets | "a low gold sun from the east down the cross streets" | SS/kits/street.ts:342 | 3 | explicit |
| 87 | City | has | spires of the upper city beyond the roofs (every street-kit set) | "Spires of the upper city beyond the roofs." | SS/kits/street.ts:272 | 3 | explicit |
| 88 | Funeral | is held | before the great house on the square | "Thaddeus lies in state on a draped bier before the great house" | SS/kordavos-streets.ts:436 | 3 | explicit |
| 89 | Harvest square | is entered | at its south end from the gate street | "at its south end, where the street from the gate opens into it" | SS/clan-conflict.ts:2 | 3 | explicit |
| 90 | Harvest square | has | south-west houses shading it in afternoon | "the shadow the south-west houses throw across the square in the afternoon" | SS/clan-conflict.ts:22 | 3 | explicit |
| 91 | Harvest square | has | music stage at the north end, fortune tent to the north-west | "musicStage ... [-0.6,-13.6]" | packages/stage/src/sets/realm-of-myr/kordavos-harvest-square.json marks | 3 | implied (coordinates) |
| 92 | Harvest square | has | a Valkara temple dome about 165 m north-north-west | "\"id\":\"temple-valkara\",\"at\":[-34,-160]" | kordavos-harvest-square.json objects | 3 | implied (procedural backdrop) |
| 93 | Gate | is | the south gate, where the Marquis Road arrives | "The Gates Ahead | The road before the south gate" | wiki/plans/road-to-kordavos-sets.md:13 | 3 | explicit |
| 94 | Kordavos | lies | north up the Marquis Road | "Kordavos lies on up the road (-z)." | SS/marquis-road.ts:53 | 3 | explicit (north from -z) |
| 95 | Gate approach | crosses | a last rise, 80 m out | "where the party comes over the last rise and joins the end of the line" | SS/marquis-road.ts:279 | 3 | explicit |
| 96 | Gate queue | starts | 80 m out from the gate | "The party stands at the end of the line on the road, 80 m out from the gate." | wiki/plans/road-to-kordavos-sets.md:28 | 3 | explicit |
| 97 | South gate | is flanked by | drum towers about 33 m each side, walls running about 160 m east and 150 m west | "\"west-drum\",\"at\":[-33,-1]" | kordavos-south-gate.json objects | 3 | implied (coordinates) |
| 98 | Inside the south gate | rise | temple domes 210 to 300 m north, city towers beyond | "\"temple-great\",\"at\":[-8,-300]" | kordavos-south-gate.json objects | 3 | implied (procedural) |
| 99 | Outside the south gate | lies | an outer town, with a clear road corridor | "\"outer-town\",\"exclude\":[[-66,-1000,66,152],[-10,-1000,10,1000]]" | kordavos-south-gate.json objects | 3 | implied |
| 100 | Gate | faces | west-south-west afternoon sun | "\"direction\":[-0.8,0.55,0.32]" | kordavos-south-gate.json atmosphere | 3 | implied (lighting) |
| 101 | Marquis Road (Well Met) | runs | through hill woods of firs under rock peaks | "wooded hill country seen from a road in a valley ... two pale grey rock peaks" | scripts/stage-backdrops.ts:107-109 | 3 | explicit |
| 102 | Marquis Road | has | a milestone with leagues to Kordavos | "A milestone on the east verge: so many leagues to Kordavos." | SS/marquis-road.ts:83 | 3 | explicit (distance unstated) |
| 103 | Marquis Road nearer the city | runs | between giant old trees, busy both ways | "The road runs wider here between giant old trees, busy with travellers and carts both ways." | SS/marquis-road.ts:161 | 3 | explicit |
| 104 | Road paintings | show | woods, not open fields | "Both paintings are woods, not open fields." | wiki/plans/road-to-kordavos-sets.md:22 | 3 | explicit |
| 105 | Kordavos | is seen | walled, on a hill, from the road | "Far behind, on a hill, the walled city of Kordavos with its towers and banners." | scripts/adventure-covers.ts:27 | 3 | explicit (cover art prompt) |
| 106 | Road to Kordavos | passes | a crossroads in rolling green hills | "On a dusty road through rolling green hills ... meet at a crossroads" | scripts/adventure-covers.ts:27 | 3 | explicit (cover art prompt) |
| 107 | Silver Serpent | runs | north from the street door to an arch onto the quay | "A long hall running north from the street door (z = 6) to a great arch open on the quay" | SS/silver-serpent-tavern.ts:38 | 3 | explicit |
| 108 | Silver Serpent | stands | between warehouses on the quay | "Warehouses either side of the quay, beyond the arch." | SS/silver-serpent-tavern.ts:115 | 3 | explicit |
| 109 | Silver Serpent | looks onto | harbour water and ships in fog, riverfront backdrop | "a foggy quay with ships and warehouses, and the riverfront backdrop beyond" | wiki/plans/march-of-davos-sets.md:155 | 3 | explicit |
| 110 | Dragonbone Inn | fronts | a street on its south side | "South wall: the front door and leaded windows onto the street." | wiki/plans/dragonbone-inn-stage.md:26 | 3 | explicit |
| 111 | Dragonbone Inn | faces | houses across the street | "Houses across the street and at either end, seen through the windows." | SS/dragonbone-inn.ts:115 | 3 | explicit |
| 112 | Old Grand Library | is entered | from the south, archives to the north | "The reading hall runs north from the entrance (z = 10) to the archives' red door" | SS/old-grand-library.ts:36 | 3 | explicit |
| 113 | Library | has | a great south window | "Midday sun from the south, through the great window over the entrance" | SS/old-grand-library.ts:50 | 3 | explicit |
| 114 | Library archives | are | level with the hall | "The private archives sit behind the red door at the far end, level with the hall" | wiki/plans/march-of-davos-sets.md:141 | 3 | explicit |
| 115 | Blackthorn Mansion | faces | south across a court to gates on the street | "The mansion's front faces south across a cobbled court to its wrought-iron gates on the street." | SS/blackthorn-mansion.ts:469 | 3 | explicit |
| 116 | Blackthorn garden | lies | east of the house, below the ballroom balcony | "East of the house, below the ballroom's balcony, a walled garden" | SS/blackthorn-mansion.ts:470 | 3 | explicit |
| 117 | Blackthorn balcony | overlooks | garden and the city beyond | "the garden dark below, the city and the moon beyond" | SS/blackthorn-mansion.ts:166 | 3 | explicit |
| 118 | Blackthorn Mansion | faces | townhouses across the street | "Townhouses across the street outside the gates." | SS/blackthorn-mansion.ts:538 | 3 | explicit |
| 119 | Blackthorn garden | is walled | on east and south | "walled on the east and the south" | SS/blackthorn-mansion.ts:566 | 3 | explicit |
| 120 | Forgotten temple | lies | beyond the catacombs' archway | "a hidden cathedral of Old Valkara beyond the catacombs' archway" | SS/forgotten-temple.ts:2 | 3 | explicit |
| 121 | Catacombs entry | is | the grate in the mansion grounds | "The grate at 40 is the mansion's grounds" | wiki/plans/march-of-davos-sets.md:25 | 3 | explicit |
| 122 | Kordavos | is | a port | "a bustling port where cultures and ideas converge" | MODP summary | 4 | explicit |
| 123 | Kordavos | stands | on the edge of untamed lands | "stands as a beacon of civilization on the edge of the untamed lands" | MODP summary | 4 | explicit |
| 124 | Gates | are | towering stone archways with banners | "towering stone archways adorned with vibrant Asterian and Valkaran banners" | MODP s0.sc0.e0.narrative | 4 | explicit |
| 125 | Festival | lies | just beyond the gates | "the Harvest Festival just beyond the gates" | MODP s0.sc0.e0.narrative | 4 | explicit |
| 126 | Festival stalls | line | the streets | "Stalls line the streets" | MODP s0.sc0.e1.narrative | 4 | explicit |
| 127 | Festival square | has | a stage in its center | "In the center of the square, a stage has been erected" | MODP s0.sc0.e1.narrative | 4 | explicit |
| 128 | Clan standoff | is on | outskirts of the celebration area | "on the outskirts of the celebration area" | MODP s0.sc0.e2.narrative | 4 | explicit |
| 129 | Dragonbone Inn | is | the closest tavern to the festival | "The closest tavern is The Dragonbone Inn" | MODP s0.sc1.e0.narrative | 4 | explicit |
| 130 | Dragonbone Inn | lies in | the heart of Kordavos | "a popular tavern in the heart of Kordavos" | MODP s0.sc1.e1.narrative | 4 | explicit |
| 131 | Asterian quarter | is | "up" (elevated or uptown) | "meant for a noble up in the Asterian quarter" | MODP s0.sc1.e1.stages.0.narrative | 4 | implied (elevation) |
| 132 | Smugglers | operate out of | the lower district | "smugglers operating out of the lower district" | MODP s0.sc1.e1.stages.0.narrative | 4 | explicit |
| 133 | City | has | an upper district | "supply orders for the upper district" | MODP s0.sc2.e0.narrative | 4 | explicit |
| 134 | Silver Serpent | is | down by the docks | "the Silver Serpent, down by the docks" | MODP s0.sc2.e0.stages.1.narrative | 4 | explicit |
| 135 | Silver Serpent | nestles | among the dock warehouses | "nestled among the dock warehouses" | MODP s1.plot | 4 | explicit |
| 136 | Grand Library | is connected to | the nearby Church of Valkara | "Connected to the nearby Church of Valkara" | MODP s1.sc0.e0.narrative | 4 | explicit |
| 137 | Library | has | ivy-lined stone walls | "ivy-lined stone walls" | MODP s1.sc0.e0.narrative | 4 | explicit |
| 138 | Library archives | lie | down a winding staircase | "leads the adventurers down a winding staircase, away from the main hall" | MODP s1.sc0.e0.stages.0.narrative | 4 | explicit |
| 139 | Docks | have | waves crashing on piers, ships in berths | "the crashing of waves against the piers" | MODP s1.sc2.e0.narrative | 4 | explicit |
| 140 | Docks | are | a maze of warehouses and alleys | "The docks are a labyrinth of warehouses, narrow alleyways, and hidden corners" | MODP s1.sc2.e1.narrative | 4 | explicit |
| 141 | Storage shed | is tucked | behind larger warehouses | "an inconspicuous storage shed tucked away behind larger warehouses" | MODP s1.sc2.e1.narrative | 4 | explicit |
| 142 | Ship | is docked | in the harbor | "a nearby ship docked in the harbor" | MODP s1.sc2.e2.narrative | 4 | explicit |
| 143 | Lower Districts | contrast | with the orderly North End | "noting the sharp contrast from the orderly North End" | MODP s2.sc0.description | 4 | explicit (implies the party came from the North End) |
| 144 | Lower District | adjoins | the docks | "the transition from the bustling energy of the docks into the shadowy, labyrinthine alleys of the Lower District" | MODP s2.sc0.e0.narrative | 4 | explicit |
| 145 | Lower District | is set against | the upper city | "The sounds of laughter and commerce that filled the upper city fade" | MODP s2.sc0.e0.narrative | 4 | implied |
| 146 | Black Market | lies | deeper in the Lower District | "Deeper into the Lower District, the streets seem to tighten" | MODP s2.sc0.e2.narrative | 4 | explicit |
| 147 | Black Market | may be | below ground | "You won't find craftsmanship like this above ground, love." | MODP s2.sc1.e1.narrative | 4 | implied |
| 148 | Auction chamber | lies | deeper in the Black Market | "a shadowy, candlelit chamber deeper within the Black Market" | MODP s2.sc2.e0.narrative | 4 | explicit |
| 149 | Silverhand's den | lies | beneath an abandoned warehouse by the docks | "a hidden den beneath an abandoned warehouse by the docks" | MODP s2.sc3.description | 4 | explicit |
| 150 | Abandoned warehouse | stands at | the edge of the docks | "At the edge of the docks, they spot their destination—an abandoned warehouse" | MODP s2.sc3.e1.narrative | 4 | explicit |
| 151 | Docks | get | evening mist from the sea | "the evening mist rolls in from the sea" | MODP s2.sc3.e1.narrative | 4 | explicit |
| 152 | Ambush | is on | way back to the Dragonbone Inn, narrow streets with rooftops | "As the adventurers make their way back to the Dragonbone Inn" | MODP s2.sc4.e0.narrative | 4 | explicit |
| 153 | Blackthorn Mansion | stands | at the heart of Kordavos | "Their mansion stands as a symbol of opulence and power at the heart of Kordavos." | MODP summary | 4 | explicit |
| 154 | Blackthorn Mansion | has | towering spires, wrought-iron gates | "its towering spires silhouetted against the darkening sky" | MODP s3.sc0.e0.narrative | 4 | explicit |
| 155 | Assassin | escapes | down from the balcony into a basement tunnel | "escape out the balcony behind him, descending down a rope, into a secret tunnel in the basement" | MODP s3.plot | 4 | explicit |
| 156 | Assassin | vanishes | through a drainage grate in the garden below | "an old drainage grate hidden beneath the ivy" | MODP s3.sc2.e2.narrative | 4 | explicit |
| 157 | Tunnel entrance | lies | near the edge of the estate | "Near the edge of the estate, where the assassin had vanished" | MODP s4.sc0.e0.narrative | 4 | explicit |
| 158 | Tunnels | run | deep beneath the city | "its long, narrow path carved deep beneath the city" | MODP s4.sc0.e1.narrative | 4 | explicit |
| 159 | Tunnels | reach | hidden chambers beneath noble estates and guildhouses | "hidden chambers beneath noble estates and prominent guildhouses" | MODP s4.sc0.e2.narrative | 4 | explicit |
| 160 | Tunnels | reach (by spy runes) | City Council chambers | "including the City Council chambers" | MODP s4.sc0.e2.notes | 4 | explicit |
| 161 | Tunnels | are | mixed old and freshly dug | "Some tunnels seem freshly dug, while others seem very old" | MODP s4.sc0.e2.narrative | 4 | explicit |
| 162 | Forgotten temple | lies | underneath the city | "underneath the city all this time" | MODP s4.sc1.e0.narrative | 4 | explicit |
| 163 | Marquis Road | leads | toward Kordavos | "As the group progresses along the Marquis Road towards Kordavos" | RTKJ sections.0.scenes.0.encounters.1.intro | 4 | explicit |
| 164 | City gates | come | into view at the end of the road | "The gates to the city are now in view." | RTKJ sections.0.scenes.0.encounters.2.intro | 4 | explicit |
| 165 | Pier | is | about 3 miles from the city | "Suggest they return to the city, which is about 3 miles away." | CCJ sections.0.scenes.0.encounters.6.instructions | 4 | explicit |

### Contradictions or ambiguities

- Docks set vs Lower Districts set, axis of "up". The docks set puts the harbour north and the city climbing south ("houses climbing into the city", SS/kordavos-docks.ts:194, with :36). The Lower Districts set runs its street north toward the upper-city spires, with the way "down to the docks" at its south end (SS/lower-districts.ts:31, :98, :132). Taken as true compass, the docks would lie south of the Lower Districts while the harbour lies north of the docks. Each set uses its own local frame, so these are probably not meant as compass facts. The map should not lean on either for absolute bearings without an owner decision.
- Docks set, city on both sides of the harbour. The docks set has the city climbing south of the quay (SS/kordavos-docks.ts:194). Its backdrop shows "the city on its hill" and the castle across the harbour to the north (SS/kordavos-docks.ts:586, scripts/stage-backdrops.ts:67-72). So the harbour may be enclosed by city on both shores, with the castle hill on the far (north) side. No text source says which shore the castle is on.
- Castle position. The riverfront set puts the castle on a hill on the east bank, about 235 m downstream (SS/covert-cargo.ts:879-880). The docks backdrop puts it across the harbour to the north (scripts/stage-backdrops.ts:67). Both fit if the river flows north into the harbour and the castle stands near the mouth. Nothing states this. No encounter or text source in my tier names a castle at all. It is a stage invention unless the encounter agents find it.
- River vs sea. RMJ locations.1.description puts Kordavos "on the coast of the Jade Sea". Sea mist (MODP s2.sc3.e1.narrative) and "salt-weathered" docks (AD:36) agree. Covert Cargo has the Mordava running down to Kordavos (CC/encounters/overboard.md:16), and the riverfront set has a river through the city with quays on both banks (SS/covert-cargo.ts:808-809). Implied reading: the Mordava reaches the sea at Kordavos and the harbour is at or near its mouth. No source says so. Also, the Silver Serpent's harbour quay uses the "riverfront backdrop" (wiki/plans/march-of-davos-sets.md:155), and the docks set borrows the riverfront's materials (SS/kordavos-docks.ts:18). So the stage work treats river and harbour as one visual waterfront.
- Two harbour towers. The docks set has a round harbour tower at the far east end of the quay (SS/kordavos-docks.ts:192). The street kit's waterfront lane has "a tall harbour tower to the west" (SS/kits/street.ts:222). They may be different towers, or one tower seen from two places.
- Direction of the Mordava. Thalbern follows the Mordava "down from the Standing Stones" out of the Valkarr woods (CC/encounters/the-shipment.md:39), and the Valkarr lies on the March's eastern borders (RMJ locations.2.description). That suggests the river comes from the east. The pier and riverfront sets make it flow north in their local frames (SS/covert-cargo.ts:552, :937). These are local frames, so this is unresolved, not a hard conflict.
- Library archives level. Legacy says the archives are down a winding staircase (MODP s1.sc0.e0.stages.0.narrative). The stage plan has them "level with the hall" (wiki/plans/march-of-davos-sets.md:141). This is building scale. It matters only if the map shows the library's undercroft.
- Silverhand's hideout. Legacy says "a hidden den beneath an abandoned warehouse" (MODP s2.sc3.description). The cellar kit uses "the warehouse's back room" (wiki/plans/march-of-davos-sets.md:91), on a waterfront lane by the quay (SS/kordavos-streets.ts:217-218). Both agree it is at the docks' edge.
- Black Market above or below ground. Legacy hints it is below ground ("won't find craftsmanship like this above ground", MODP s2.sc1.e1.narrative). The stage set is an open lane under canvas with a "pale sky slot" (wiki/plans/march-of-davos-sets.md:215, :228). Both agree it lies deep in the Lower District.
- Assassin's escape route, inside the legacy plan. MODP s3.plot says "a secret tunnel in the basement". MODP s3.sc2.e2.narrative says a drainage grate in the garden below the balcony, and MODP s4.sc0.e0.narrative says "Near the edge of the estate". The stage follows the garden grate east of the house (SS/blackthorn-mansion.ts:470-471).
- Name and identity of districts. The legacy plan uses "North End" (MODP s2.plot), "upper district" (MODP s0.sc2.e0.narrative), "upper city" (MODP s2.sc0.e0.narrative) and "Asterian quarter" (MODP s0.sc1.e1.stages.0.narrative). Art direction names only the Asterian Quarter, Docks and Lower Districts (AD:35-37). Whether North End, upper district and Asterian Quarter are the same place is unstated. "Lower District" (singular) and "Lower Districts" are both used.
- City on a hill. The road cover prompt shows "on a hill, the walled city of Kordavos" (scripts/adventure-covers.ts:27). The stage sets give a castle on its hill (SS/covert-cargo.ts:809) and a city climbing from the docks (SS/kordavos-docks.ts:194). It is unclear whether the whole city sits on a hill or only the castle and upper city do.
- Heart of the city. The legacy plan puts both the Dragonbone Inn (MODP s0.sc1.e1.narrative) and the Blackthorn Mansion (MODP summary) "in/at the heart of Kordavos". The inn is also "the closest tavern" to a festival "just beyond the gates" (MODP s0.sc1.e0.narrative, s0.sc0.e0.narrative). So the gate, the festival square and the inn are close together, and the centre is not far from the south gate. That conflicts with the gate being on the edge, unless the city is small or "heart" is loose.
- Clan conflict placement. Legacy says "on the outskirts of the celebration area" (MODP s0.sc0.e2.narrative). The stage has it at the square's south end where the gate street enters (SS/clan-conflict.ts:2). These are compatible.
- Lighting frames. The gate and harvest square sets light from the west-south-west and south-west in the afternoon (kordavos-south-gate.json atmosphere, SS/clan-conflict.ts:22). The Lower Districts light their "day's grey end" from almost due north (SS/lower-districts.ts:342-344). An evening sun in the north is impossible in a real compass frame. This confirms that set frames are not one shared compass.
- Distance pier to city. CC says "about 3 miles" through forest (CC/encounters/the-crate.md:21, overboard.md:34). The Marquis Road lies "beyond the trees" from the pier woods (CC/encounters/return-to-the-city.md:19). So the road passes within the forest belt near the Mordava fork. No source gives the road's bearing relative to the river.
