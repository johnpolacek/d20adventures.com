/**
 * The vision: what players love most about Baldur's Gate 3, one theme each, with the features D20 Adventures builds
 * toward it. /vision shows it.
 *
 * The goal is not to match Baldur's Gate 3 feature for feature. It is to have everything players like about it. A
 * milestone names what players get from a feature, and "like Baldur's Gate 3" marks the scale, not a design to copy.
 *
 * Each feature is a list of milestones a reader could check (a file, a count, a behavior you can trigger). A milestone
 * is done only when it is true in the code on main today. An unchecked milestone is open work anyone can pick up.
 *
 * Every milestone has a size, by the work it takes: 1 small, 3 medium, 8 large. Progress is the share of that work done,
 * worked out here, never typed. Each feature ends with the milestones that would put it at Baldur's Gate 3's scale, so a
 * feature whose groundwork is done still reads as far from the game. A piece of work lives in one feature only, so the
 * totals never count it twice.
 *
 * Audited against the code twice on 2026-11-24, the second time by auditors who saw only the code and this file. Their
 * corrections to marks, sizes, duplicates and missing work are applied here.
 *
 * Free Open Source leads and, with Create Your Own, is what Baldur's Gate 3 doesn't do.
 */

export type Size = 1 | 3 | 8
export type Milestone = { text: string; done: boolean; size: Size }
export type VisionFeature = { name: string; note: string; milestones: Milestone[] }
export type VisionTheme = { id: string; name: string; why: string; features: VisionFeature[] }

export const visionUpdated = "2026-11-25"

const yes = (text: string, size: Size = 1): Milestone => ({ text, done: true, size })
const no = (text: string, size: Size = 1): Milestone => ({ text, done: false, size })

export const visionThemes: VisionTheme[] = [
  {
    id: "open-source",
    name: "Free Open Source",
    why: "The whole platform is free, and the code is open to everyone.",
    features: [
      {
        name: "Open Source Code",
        note: "MIT, on Github.",
        milestones: [yes("The repo is public on Github"), yes("The code is under the MIT license")],
      },
      {
        name: "Free to Play",
        note: "Every adventure is free.",
        milestones: [yes("Every adventure costs nothing"), yes("Friends join a hosted game for free, in the browser")],
      },
      {
        name: "Open Rules",
        note: "Built on SRD 5.2.1, under CC-BY-4.0.",
        milestones: [
          yes("The SRD 5.2.1 text and data are in the repo"),
          yes("The SRD attribution shows on the site and in the app"),
          yes("House rules are kept apart from the SRD"),
        ],
      },
    ],
  },
  {
    id: "setting",
    name: "Epic Setting",
    why: "A dense, hand-crafted world where exploring is rewarded.",
    features: [
      {
        name: "The Realm of Myr",
        note: "A mapped city and a mapped wood, 46 named NPCs and four factions.",
        milestones: [
          yes("Two areas with painted maps of their landmarks", 3),
          yes("Factions with their own look and stake in the story"),
          no("At least 50 named NPCs with sheets (46 today)", 3),
          no("Setting lore (history, factions, faith) written in the content", 3),
          no("A lore book the player can open in the game", 3),
          no("Every place in the adventures has its own entry", 3),
          no("At least 3 regions played, like Baldur’s Gate 3’s three acts", 8),
          no("A world at Baldur’s Gate 3’s scale: hundreds of named people and places", 8),
        ],
      },
      {
        name: "Written Adventures",
        note: "Four adventures, 70 encounters, about 46,000 words.",
        milestones: [
          yes("4 adventures written: 70 encounters, about 46,000 words", 8),
          yes("Every encounter has GM notes, or is an ending", 3),
          no("No leftovers from the old adventure format"),
          no("150 encounters in all", 3),
          no("A second full-length adventure, 40 encounters or more", 8),
          no("About 1,000 encounters, near Baldur’s Gate 3’s scale", 8),
        ],
      },
      {
        name: "Places to Explore",
        note: "A map of where the party has been, and one hub to wander.",
        milestones: [
          yes("A map of the places the party has reached", 3),
          yes("A hub with 3 or more rooms to visit in any order"),
          no("Travel to any discovered place by picking it on the map", 3),
          no("Optional places off the main path in every adventure", 3),
          no("At least 3 hubs across the campaign", 3),
          no("Doors, chests, levers and books the engine tracks: open, loot, lock, read", 8),
          no("Large open areas to roam, not one scene at a time", 8),
        ],
      },
      {
        name: "Secrets and Hidden Things",
        note: "Hidden places stay secret until found. About 9 secrets are written, all in one adventure.",
        milestones: [
          yes("Hidden places on the map stay secret until found"),
          no("At least 1 written secret in every adventure"),
          no("A secret that opens a new route"),
          no("Loot found only by uncovering a secret"),
          no("Passive Perception notices hidden objects and secrets", 3),
          no("Traps the engine can detect, disarm and spring", 3),
          no("Puzzles the engine checks, not just narrates", 3),
          no("Hidden areas, puzzles and lore in every place, like Baldur’s Gate 3", 8),
        ],
      },
      {
        name: "A Campaign Across Adventures",
        note: "The story so far, levels and gear carry into the next adventure.",
        milestones: [
          yes("Adventures chain one into the next"),
          yes("Levels carry over"),
          yes("Gear carries over"),
          yes("A summary of the story so far reaches the next game master", 3),
          yes("Later scenes change on an earlier adventure’s result", 3),
          no("World state (who lived, what was delivered) carries over as facts", 3),
          no("A quest journal the player can read", 3),
          no("A campaign from level 1 to 12, like Baldur’s Gate 3", 8),
        ],
      },
    ],
  },
  {
    id: "roleplaying",
    name: "Meaningful Roleplaying",
    why: "Creative and chaotic choices work, and the world answers them.",
    features: [
      {
        name: "Type Anything",
        note: "Players write what they do. The AI game master rules on it, and the engine rolls it.",
        milestones: [
          yes("Free-text actions on the web and in the desktop app"),
          yes("Actions become SRD checks, attacks and spells", 8),
          yes("The game master runs NPCs, scene changes and who knows what", 8),
          yes("Suites of probe cases for the game master’s rulings and scenes"),
          no("A recorded pass rate for those probes"),
          no("An action the author didn’t list can solve a scene", 3),
          no("A full playthrough of every adventure with no ruling fault, recorded", 8),
        ],
      },
      {
        name: "Many Ways Through a Scene",
        note: "Only 21 of 70 encounters branch, and The Road to Kordavos has none.",
        milestones: [
          no("A test that drives one scene to 3 different outcomes"),
          no("Every encounter’s GM notes say what talking, sneaking and fighting each do", 3),
          no("Every fight has a written way to avoid it", 3),
          no("Half of all encounters have 2 or more exits", 3),
          no("Options only a hero’s class, species or background opens", 3),
          no("How a scene is solved changes the next one, in every adventure", 8),
          no("Every quest solvable several ways, like Baldur’s Gate 3", 8),
        ],
      },
      {
        name: "A Narrator Who Reads the Story",
        note: "Four voices, in the desktop app. The web demo has no audio.",
        milestones: [
          yes("A narrator voice in the desktop app", 3),
          yes("A choice of 4 voices"),
          yes("Setting names said the same way every time"),
          yes("Stage and camera timed to the narration", 3),
          no("Narration in the web demo", 3),
          no("Acted delivery: emotion, pace and whisper from a voice that takes direction", 8),
        ],
      },
      {
        name: "Consequences That Carry On",
        note: "The game remembers what happened within an adventure.",
        milestones: [
          yes("Memory of what happened within an adventure", 3),
          no("A dead NPC stays dead for the rest of the adventure", 3),
          no("Named flags an encounter can test, not the model’s memory", 3),
          no("Standing with a faction that opens or closes scenes", 3),
          no("NPC attitudes that change with the party’s choices", 8),
          no("Choices that change scenes hours later, like Baldur’s Gate 3", 8),
        ],
      },
      {
        name: "Multiple Endings",
        note: "Eight written endings. Welcome to Kordavos ends three ways.",
        milestones: [
          yes("An adventure ends at its final scene, or when every hero dies"),
          yes("An adventure with 3 or more written endings", 3),
          no("Every adventure has 2 endings that differ in outcome"),
          no("Each ending opens the next adventure differently", 3),
          no("An epilogue for each hero", 3),
          no("A campaign ending that turns on earlier choices", 8),
        ],
      },
    ],
  },
  {
    id: "multiplayer",
    name: "Engaging Multiplayer",
    why: "A whole campaign with your friends, like a real D&D night.",
    features: [
      {
        name: "Play With Friends",
        note: "Up to 5 heroes in one game. Friends join from the web.",
        milestones: [
          yes("4 or more players in one game", 3),
          yes("Friends join from a browser, with nothing to install", 3),
          yes("Text chat at the table"),
          no("Each player’s private scenes show only on their own screen", 3),
          no("A hosted party goes on into the next adventure", 3),
          no("Browser guests see the same 3D stage, voices and dice as the host", 8),
          no("Players act at the same time outside combat", 8),
        ],
      },
      {
        name: "Online Hosting",
        note: "Host from the desktop app, with invite links and seats to manage.",
        milestones: [
          yes("Host from the app with invite links", 8),
          yes("The host approves, removes and holds seats", 3),
          yes("A hosted game picks up again when the host’s app reopens"),
          no("The game goes on if the host leaves", 8),
          no("Hosting without the host’s own AI login", 8),
        ],
      },
      {
        name: "Heroes Start Apart",
        note: "Covert Cargo’s heroes start as strangers, and each knows only what they saw.",
        milestones: [
          yes("Adventures where heroes start apart"),
          yes("Private scene text for one hero"),
          yes("Each hero knows only what they saw or heard, names included", 3),
          no("Players split up to explore, then regroup", 3),
          no("Heroes in different scenes at the same time", 8),
        ],
      },
      {
        name: "Drop-In, Drop-Out",
        note: "A player can reconnect, but no one can join a game once it starts.",
        milestones: [
          yes("A disconnected player rejoins their own seat"),
          no("Change who plays a seat mid-game", 3),
          no("Join a game in progress", 3),
          no("A departing player’s hero passes to the AI", 3),
        ],
      },
    ],
  },
  {
    id: "rules",
    name: "Faithful 5E Rules Implementation",
    why: "The tabletop rules, played by the engine, in tactical turn-based battles.",
    features: [
      {
        name: "SRD Coverage",
        note: "SRD 5.2.1’s spells, monsters, items and classes are typed. 80 of 339 spells run fully in the engine.",
        milestones: [
          yes("SRD 5.2.1’s spells, monsters, items and classes typed as data", 8),
          yes("The engine resolves every check", 3),
          yes("Every condition has typed rules", 3),
          no("Tool proficiencies and starting coin on the hero sheet, with tool checks", 3),
          no("90% of spells run fully in the engine (80 of 339 today)", 8),
          no("Every special monster action read by the engine (56 of 146 today)", 8),
          no("Magic items run in the engine (26 of 258 today)", 8),
        ],
      },
      {
        name: "Learn by Playing",
        note: "The Midnight Summons opens at Thalbern’s home, where a squirrel brings the note, with tips the first time.",
        milestones: [
          yes("An opening scene that teaches the game as it is played, like the Nautiloid", 3),
          yes("It walks through typing an action, a check and a spell", 3),
          yes("Short tips the first time a player types, rolls, attacks, reacts or meets the sheet", 3),
          yes("Players who know the game can skip it"),
          no("A test that plays a new player through it from start to end"),
          no("A practice fight in the opening, before the Owlbear", 3),
          no("Every new player starts in it, whichever adventure they pick", 3),
        ],
      },
      {
        name: "Rolls You Can See",
        note: "A 3D die with sound in the desktop app. The web demo shows a flat die.",
        milestones: [
          yes("A 3D die that lands on the rolled face", 3),
          yes("A sound for the roll and the result"),
          yes("Advantage throws two dice and dims the one not kept"),
          yes("Bonuses and the number needed shown before the roll"),
          yes("NPC rolls shown too"),
          no("The player chooses when to spend Heroic Inspiration"),
          no("The same die and sound in the web demo", 3),
        ],
      },
      {
        name: "All 12 Classes",
        note: "Every class from level 1 to 20, with one subclass each.",
        milestones: [
          yes("All 12 classes at hero creation", 3),
          yes("Rules and tests for every class up to level 20", 8),
          no("Every class feature runs in the engine, all 8 weapon masteries included", 8),
          no("3 subclasses for every class, beyond the SRD’s one", 8),
          no("Played above level 5 in an adventure", 8),
        ],
      },
      {
        name: "Level Up",
        note: "Milestone levels, on one screen shared by both hosts.",
        milestones: [
          yes("The same level-up screen on the web and the desktop", 3),
          yes("Pick a subclass, feat, spells and options", 3),
          yes("AI-played heroes level up on their own"),
          yes("Every level-up choice tested"),
          no("Change a hero’s build after the fact", 3),
        ],
      },
      {
        name: "Spellcasting",
        note: "Slots, concentration, rituals and Counterspell. You can’t aim a spell yet.",
        milestones: [
          yes("Spell slots, casting at higher levels and cantrips", 3),
          yes("Concentration, with saves when hurt", 3),
          yes("Rituals"),
          yes("Counterspell as a reaction"),
          no("Costly and consumed material components spent", 3),
          no("Aim a spell’s area or point on the map", 8),
        ],
      },
      {
        name: "Short and Long Rests",
        note: "Both rests, on both hosts.",
        milestones: [
          yes("A Short Rest spends Hit Point Dice and restores features", 3),
          yes("A Long Rest restores everything and lowers Exhaustion", 3),
          no("The engine refuses a rest in the middle of a fight"),
          no("The player picks which Hit Point Dice to spend"),
          no("A limit on how often a Long Rest can be taken"),
          no("A Stable hero wakes after 1d4 hours"),
        ],
      },
      {
        name: "Turn-Based Combat",
        note: "Initiative, attacks, death saves, and a Bonus Action each turn.",
        milestones: [
          yes("Initiative and a turn-order strip", 3),
          yes("Attacks, Critical Hits and damage done by the engine", 3),
          yes("Death saves"),
          yes("An action and a Bonus Action each turn"),
          no("Two-Weapon Fighting and the off-hand attack", 3),
          no("Move, attack, then move again in one turn", 3),
          no("Surprise and the Ready action", 3),
          no("Hand-crafted battles with set pieces in every fight, like Baldur’s Gate 3", 8),
        ],
      },
      {
        name: "Reactions",
        note: "Opportunity Attacks, Shield, Counterspell and more, offered with a timer.",
        milestones: [
          yes("Opportunity Attacks", 3),
          yes("Class and spell reactions, such as Shield and Uncanny Dodge", 3),
          yes("A reaction offer with a countdown"),
          yes("Standing orders for reactions in a solo game"),
          no("Standing orders in hosted games"),
          no("Hellish Rebuke and Feather Fall as reactions"),
          no("Monster reactions from their stat blocks", 3),
        ],
      },
      {
        name: "Positioning and Movement",
        note: "Positions in feet, paths around walls, cover and difficult terrain.",
        milestones: [
          yes("Positions in feet, kept by the engine", 3),
          yes("Paths through doorways and around creatures", 3),
          yes("Difficult terrain and swimming cost extra movement"),
          yes("Cover worked out from the set’s walls", 3),
          no("Pick where to move on the map, and see how far you can go", 8),
        ],
      },
      {
        name: "Shove, Grapple and Throw",
        note: "Shove, Grapple and thrown weapons work. There is no jumping yet.",
        milestones: [
          yes("Shove pushes 5 feet or knocks prone"),
          yes("Grapple, with a DC to escape"),
          yes("Thrown weapons at range"),
          no("Long Jump and High Jump", 3),
          no("Throw objects, creatures or potions", 3),
          no("A shove into water or off an edge has a consequence", 3),
        ],
      },
      {
        name: "Light, Dark and Stealth",
        note: "Hiding works, and Fog Cloud and Darkness block sight. There is no lighting yet.",
        milestones: [
          yes("Hide, Passive Perception and Search", 3),
          yes("Fog Cloud and Darkness block sight"),
          no("Dim light and darkness let a creature hide"),
          no("Each encounter says how it is lit", 3),
          no("Darkvision changes what a creature sees", 3),
          no("See where NPCs are looking, and sneak outside combat", 8),
        ],
      },
      {
        name: "Surfaces and Hazards",
        note: "Water in 8 sets, and spell areas like Grease, Web and Wall of Fire.",
        milestones: [
          yes("Water in the floor plans, with swimming", 3),
          yes("Spell areas on the ground that trigger as creatures enter", 3),
          no("Hazards built into sets: fire, ice, rubble", 3),
          no("Burning and suffocation rules", 3),
          no("Surfaces that react, like fire lighting grease", 8),
        ],
      },
      {
        name: "Elevation, Flying and Falling",
        note: "The floor plans have no floor heights yet.",
        milestones: [
          no("Falling damage"),
          no("Positions with height, and distance in 3D", 3),
          no("Flyers held at a height", 3),
          no("Floor plans with heights and levels", 8),
        ],
      },
      {
        name: "Multiclassing",
        note: "The rules data is typed. A hero still has one class.",
        milestones: [
          yes("Multiclass rules typed in the SRD data"),
          no("Hit points, proficiencies and spell slots worked out for a multiclass hero", 3),
          no("Take a new class at level up, with its requirements checked", 3),
          no("A hero sheet with more than one class", 8),
        ],
      },
    ],
  },
  {
    id: "characters",
    name: "Imaginative Characters",
    why: "Heroes, companions and villains with their own stories and voices.",
    features: [
      {
        name: "Character Creator",
        note: "Built on the rules. 7 of 11 species are offered, with the Standard Array only.",
        milestones: [
          yes("A rules-legal sheet, built by the engine on the server", 3),
          yes("A hero’s chosen hook writes their arrival in the opening scene"),
          no("Point buy or rolled ability scores"),
          no("Every species the rules know is offered", 3),
          no("More than the SRD’s 4 backgrounds", 3),
          no("Backstories the story reacts to all game long, like Baldur’s Gate 3’s tags", 8),
          no("Every choice explains what it does in play as you pick it", 3),
          no("Pick your hero’s voice at creation", 3),
          no("Acting to your background earns Inspiration", 3),
          no("Rebuild a hero’s class and scores mid-campaign", 3),
        ],
      },
      {
        name: "Your Hero’s Look",
        note: "A stock figure for each species, or art painted by your own AI.",
        milestones: [
          yes("A stock figure for every offered species, in two builds"),
          yes("Custom painted art for a new hero", 3),
          no("New heroes play as rigged 3D figures", 8),
          no("An appearance editor for face, hair and body", 8),
        ],
      },
      {
        name: "Origin Heroes",
        note: "9 premade heroes, each with their own goals, who carry on from one adventure to the next.",
        milestones: [
          yes("Every premade hero has written goals"),
          yes("Origin heroes carry on into the next adventure", 3),
          no("Scenes written for each premade in every adventure they’re in", 8),
          no("A personal quest that carries across adventures", 8),
        ],
      },
      {
        name: "NPCs With Their Own Motives",
        note: "111 of 113 NPCs in encounters have written behavior that drives their turns.",
        milestones: [
          yes("Written behavior drives an NPC’s own turns", 3),
          yes("NPCs remember what they were told, and whose names they know", 3),
          no("Every NPC in an encounter has written behavior"),
          no("NPC goals that carry on across scenes", 8),
        ],
      },
      {
        name: "Monsters",
        note: "330 SRD stat blocks. The adventures use 3 kinds of real monster.",
        milestones: [
          yes("SRD monster stat blocks run in the engine", 3),
          no("More than 3 kinds of monster in the adventures", 3),
          no("30 or more kinds of monster, nearer Baldur’s Gate 3", 8),
        ],
      },
      {
        name: "A Voice for Every Character",
        note: "Lines of the other gender to the narrator get a second voice. Characters have no voice of their own yet.",
        milestones: [
          yes("Lines of the other gender read in a second voice"),
          yes("Beasts growl and cry out"),
          no("Authors pick a voice for each character"),
          no("Monsters have sounds of their own", 3),
          no("Every speaking character keeps a voice of their own", 8),
        ],
      },
      {
        name: "Companions Who Join the Party",
        note: "NPCs fight beside you, and AI-played heroes level with you. No NPC joins.",
        milestones: [
          yes("An NPC fights on the party’s side"),
          yes("An AI-played party member who levels with the party", 3),
          no("Talk with a companion one-on-one", 3),
          no("Recruit an NPC into the party", 8),
          no("A recruited NPC who stays across scenes and adventures", 8),
          no("A camp where the player swaps companions", 8),
          no("Companions with personal quests", 8),
        ],
      },
      {
        name: "Approval and Banter",
        note: "Not started.",
        milestones: [
          no("The player can see each companion’s approval"),
          no("Each companion keeps an approval score", 3),
          no("Companions react to choices by their approval", 3),
          no("A companion leaves at low approval", 3),
          no("Party members talk among themselves unprompted", 8),
        ],
      },
      {
        name: "Romance",
        note: "Not started.",
        milestones: [no("A romance carried across adventures", 3), no("Romance scenes that depend on approval", 3), no("Characters with romance arcs", 8)],
      },
    ],
  },
  {
    id: "graphics",
    name: "Cinematic Graphics",
    why: "Beautiful places and scenes shot like a film.",
    features: [
      {
        name: "3D Environments",
        note: "41 sets cover 33 places. 7 are in their finished look.",
        milestones: [
          yes("Every encounter of every adventure has a 3D scene", 8),
          no("A steady 60 frames a second on an M1 or better", 3),
          no("Light that changes with the story: torches, spells, time of day", 3),
          no("Every set in its finished look (7 of 41)", 8),
        ],
      },
      {
        name: "Animated Characters",
        note: "A pipeline from painted art to rigged figures. 10 of 137 characters play in 3D.",
        milestones: [
          yes("A pipeline from painted art to a rigged, animated figure", 8),
          yes("Sneak, walk, run and sprint on every person in play", 3),
          yes("Hands that grip swords, bows and staffs", 3),
          no("A combat move set on every figure in play"),
          no("A four-legged figure in play", 3),
          no("Feet that follow stairs and slopes", 3),
          no("Every character in every adventure plays as a 3D figure", 8),
        ],
      },
      {
        name: "Cinematic Camera",
        note: "A director picks shots by film grammar, and stages Critical Hits.",
        milestones: [
          yes("A director plans shots for every kind of moment, with checks", 3),
          yes("Critical Hits staged by the camera"),
          no("No shot framed from outside a wall, checked by machine"),
          no("Initiative and a level gained staged", 3),
          no("Every conversation directed as a scene, like Baldur’s Gate 3", 8),
        ],
      },
      {
        name: "Sound and Ambience",
        note: "Cues for every effect, and ambience on every set. No music.",
        milestones: [
          yes("A sound for every stage effect", 3),
          yes("An ambience bed on every set", 3),
          no("Mixed and approved by ear"),
          no("Sound placed left and right, or in 3D", 3),
          no("A musical score for exploring, fights and themes", 8),
        ],
      },
      {
        name: "Spell Effects",
        note: "9 kinds of effect in 7 elements, chosen by the story.",
        milestones: [
          yes("A library of effects the story triggers", 3),
          no("A casting animation"),
          no("Conditions shown on figures: burning, frozen, blessed, poisoned", 3),
          no("Spell areas drawn on the stage at true size, for as long as they last", 8),
          no("A look of its own for each spell", 8),
        ],
      },
      {
        name: "Expressive Faces",
        note: "Sharp painted faces on the 3D figures. They don’t move yet.",
        milestones: [
          yes("Detailed faces on the 3D figures", 3),
          no("Blinks and idle life in the face", 3),
          no("Heads and eyes that turn to the speaker", 3),
          no("A face rig that moves", 8),
          no("Lip sync to the voices", 8),
        ],
      },
      {
        name: "Cutscenes",
        note: "A scripted sequence player exists. No cutscenes are written yet.",
        milestones: [
          yes("A scripted sequence player for the stage", 3),
          no("Written cutscenes for key moments in the adventures", 3),
          no("Cinematics at every key moment of the campaign, like Baldur’s Gate 3", 8),
        ],
      },
    ],
  },
  {
    id: "create",
    name: "Create Your Own",
    why: "Write your own adventures and play them with your friends.",
    features: [
      {
        name: "Write Your Own Adventures",
        note: "Adventures are markdown with a compiler and an editor, but a new one still needs code edits.",
        milestones: [
          yes("Adventures are plain text, with a compiler and validator", 8),
          yes("An authoring editor with an AI assistant, for the owner", 3),
          no("The released app plays a creator’s adventure"),
          no("A new adventure needs no code edits", 3),
          no("A published guide to writing an adventure", 3),
          no("Playtest any encounter straight from the editor", 3),
          no("The editor open to every creator, stage included", 8),
          no("Homebrew monsters, items and spells in an adventure", 8),
        ],
      },
      {
        name: "Share Adventure Packages",
        note: "Every adventure builds into a package. There is no way to share one yet.",
        milestones: [
          yes("A package for every adventure, checked for missing files", 3),
          yes("The app loads a package from disk", 3),
          yes("Scene files downloaded and checked against their hashes", 3),
          no("Import a package as one file"),
          no("Creators’ own figures inside their packages", 3),
          no("Updates to an installed package", 3),
          no("Publish, browse and download packages on the site", 8),
        ],
      },
      {
        name: "Make Your Own Art",
        note: "Players paint their hero with their own AI. The 3D pipeline is the owner’s only.",
        milestones: [
          yes("Paint a hero’s art in the app with your own AI", 3),
          no("Paint encounter art and NPC portraits with your own AI", 3),
          no("Make a 3D figure on your own machine with one command", 3),
          no("Build a set without writing JSON", 8),
        ],
      },
      {
        name: "Bring Your Own AI",
        note: "The desktop app runs Claude, Codex, Grok or Antigravity as the game master.",
        milestones: [
          yes("Several AI CLIs supported", 3),
          yes("Pick the game master’s AI when starting a game"),
          no("Pick a model on every provider"),
          no("A full playthrough checked on every provider", 3),
          no("Any API key or OpenAI-compatible endpoint, not only CLIs", 3),
          no("A local model, with no account needed", 8),
        ],
      },
    ],
  },
]

export type FeatureStatus = "Done" | "Playable" | "Underway" | "Started" | "Not Started"

export function featureStatus(pct: number): FeatureStatus {
  if (pct >= 100) return "Done"
  if (pct >= 60) return "Playable"
  if (pct >= 25) return "Underway"
  if (pct > 0) return "Started"
  return "Not Started"
}

const work = (ms: Milestone[]) => ms.reduce((sum, x) => sum + x.size, 0)
/** The share of the work done: each milestone counts by its size. */
const share = (ms: Milestone[]) => Math.round((100 * work(ms.filter((x) => x.done))) / work(ms))
const allMilestones = (t: VisionTheme) => t.features.flatMap((f) => f.milestones)

/** A feature's progress: the share of its milestones' work done. */
export const featureProgress = (f: VisionFeature) => share(f.milestones)
/** A theme's progress: the share of all its milestones' work done, so bigger features weigh more. */
export const themeProgress = (t: VisionTheme) => share(allMilestones(t))
export const visionProgress = () => share(visionThemes.flatMap(allMilestones))
