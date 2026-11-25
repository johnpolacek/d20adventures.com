/**
 * The vision: what players love most about Baldur's Gate 3, one theme each, with the features D20 Adventures builds
 * toward it. /vision shows it.
 *
 * Each feature is a list of milestones a reader could check (a file, a count, a behavior you can trigger), and its
 * percent is worked out from them, never typed. A milestone is done only when it is true in the code on main today. The
 * list was audited against the code on 2026-11-24. An unchecked milestone is open work anyone can pick up.
 *
 * Free Open Source leads and, with Create Your Own, is what Baldur's Gate 3 doesn't do.
 */

export type Milestone = { text: string; done: boolean }
export type VisionFeature = { name: string; note: string; milestones: Milestone[] }
export type VisionTheme = { id: string; name: string; why: string; features: VisionFeature[] }

export const visionUpdated = "2026-11-24"

const yes = (text: string): Milestone => ({ text, done: true })
const no = (text: string): Milestone => ({ text, done: false })

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
        note: "Two mapped regions, 65 named NPCs and four factions.",
        milestones: [
          yes("At least 2 regions with maps of their landmarks"),
          yes("At least 50 named NPCs with sheets"),
          yes("Factions with their own look and stake in the story"),
          no("Setting lore (history, factions, faith) written in the content"),
          no("At least 3 regions played, like Baldur’s Gate 3’s three acts"),
          no("A lore book the player can open in the game"),
        ],
      },
      {
        name: "Written Adventures",
        note: "Four adventures, 69 encounters, about 46,000 words.",
        milestones: [
          yes("Every adventure builds into a complete package"),
          yes("The adventures form one chain"),
          yes("Every encounter has GM notes, or is an ending"),
          no("No leftovers from the old adventure format"),
          no("A second full-length adventure, 40 encounters or more"),
          no("150 encounters in all, about Act 1 of Baldur’s Gate 3"),
        ],
      },
      {
        name: "Places to Explore",
        note: "A 3D set for every encounter, and a map of where the party has been.",
        milestones: [
          yes("Every encounter has a 3D set"),
          yes("A map of the places the party has reached"),
          yes("A hub with 3 or more rooms to visit in any order"),
          no("Travel to any discovered place by picking it on the map"),
          no("Optional places off the main path in every adventure"),
          no("At least 3 hubs across the campaign"),
          no("Walk a hero across the floor by pointing at it"),
        ],
      },
      {
        name: "Secrets and Hidden Things",
        note: "Searches roll the right skill. About 9 secrets are written, all in one adventure.",
        milestones: [
          yes("Searching rolls Perception or Investigation"),
          no("Passive Perception notices hidden things without being asked"),
          no("At least 1 written secret in every adventure"),
          no("Loot found only by uncovering a secret"),
          no("Traps the engine can detect, disarm and spring"),
          no("A secret that opens a new route"),
        ],
      },
      {
        name: "A Campaign Across Adventures",
        note: "The story so far, levels and gear carry into the next adventure.",
        milestones: [
          yes("Adventures chain one into the next"),
          yes("Levels carry over"),
          yes("Gear carries over"),
          yes("A summary of the story so far reaches the next game master"),
          no("World state (who lived, what was delivered) carries over as facts"),
          no("A later scene that changes on an earlier result"),
          no("A campaign that spans 5 levels or more"),
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
          yes("Actions become SRD checks, attacks and spells"),
          yes("The game master runs NPCs, scene changes and who knows what"),
          yes("Suites of probe cases for the game master’s rulings and scenes"),
          no("A recorded pass rate for those probes"),
          no("A creative action can end a scene in a way the author didn’t write"),
        ],
      },
      {
        name: "Many Ways Through a Scene",
        note: "Talk, sneak or fight work anywhere, but only 21 of 69 encounters branch.",
        milestones: [
          yes("Talk, sneak and fight are possible in every scene"),
          no("Every fight has a written way to avoid it"),
          no("Half of all encounters have 2 or more exits"),
          no("How a scene is solved changes the next one, in every adventure"),
          no("A test that drives one scene to 3 different outcomes"),
        ],
      },
      {
        name: "A Narrator Who Reads the Story",
        note: "Four voices, in the desktop app. The web demo has no audio.",
        milestones: [
          yes("A narrator voice in the desktop app"),
          yes("A choice of 4 voices"),
          yes("Setting names said the same way every time"),
          yes("Stage and camera timed to the narration"),
          no("Narration in the web demo"),
          no("Delivery tags change how a line is read"),
        ],
      },
      {
        name: "Consequences That Carry On",
        note: "The game remembers what happened within an adventure.",
        milestones: [
          yes("Memory of what happened within an adventure"),
          yes("Choices reach the next adventure"),
          no("A dead NPC stays dead for the rest of the adventure"),
          no("Content that reacts to an earlier choice in 3 adventures"),
          no("NPC attitudes that change with the party’s choices"),
        ],
      },
      {
        name: "Multiple Endings",
        note: "Eight written endings. Welcome to Kordavos ends three ways.",
        milestones: [
          yes("An adventure ends at its final scene, or when every hero falls"),
          yes("An adventure with 3 or more written endings"),
          yes("The ending reached carries into the next adventure"),
          no("Every adventure has 2 endings that differ in outcome"),
          no("A campaign ending that turns on earlier choices"),
          no("An epilogue for each hero"),
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
          yes("4 or more players in one game"),
          yes("Friends join from a browser, with nothing to install"),
          yes("Text chat at the table"),
          no("Players act at the same time outside combat"),
          no("Each player’s private scenes show only on their own screen"),
        ],
      },
      {
        name: "Online Hosting",
        note: "Host from the desktop app, with invite links and seats to manage.",
        milestones: [
          yes("Host from the app with invite links"),
          yes("The host approves, removes and holds seats"),
          yes("A hosted game picks up again when the host’s app reopens"),
          no("Hosting without the host’s own AI login"),
          no("The game goes on if the host leaves"),
        ],
      },
      {
        name: "Heroes Start Apart",
        note: "Covert Cargo’s heroes start as strangers and meet in the story.",
        milestones: [
          yes("Adventures where heroes start apart"),
          yes("Private scene text for one hero"),
          no("Heroes in different scenes at the same time"),
          no("Players split up to explore, then regroup"),
        ],
      },
      {
        name: "Drop-In, Drop-Out",
        note: "A player can reconnect, but no one can join a game once it starts.",
        milestones: [
          yes("A disconnected player rejoins their own seat"),
          no("Join a game in progress"),
          no("A departing player’s hero passes to the AI"),
          no("Change who plays a seat mid-game"),
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
        note: "All of SRD 5.2.1 is typed. Half the spells and a third of monster actions run in the engine.",
        milestones: [
          yes("SRD 5.2.1 typed as data"),
          yes("The engine resolves every check"),
          yes("Every condition has typed rules"),
          no("90% of spells run in the engine, not just told (about 50% today)"),
          no("Every monster action read by the engine (56 of 146 today)"),
          no("Tool proficiencies, starting coin and equipment typed"),
        ],
      },
      {
        name: "Rolls You Can See",
        note: "A 3D die with sound in the desktop app. The web demo shows a flat die.",
        milestones: [
          yes("A 3D die that lands on the rolled face"),
          yes("A sound for the roll and the result"),
          yes("Advantage throws two dice and dims the one not kept"),
          yes("Bonuses and the number needed shown before the roll"),
          yes("NPC rolls shown too"),
          no("The same die and sound in the web demo"),
          no("The player chooses when to spend Heroic Inspiration"),
        ],
      },
      {
        name: "All 12 Classes",
        note: "Every class from level 1 to 20, with one subclass each.",
        milestones: [
          yes("All 12 classes at hero creation"),
          yes("Rules and tests for every class up to level 20"),
          no("Every class feature runs in the engine"),
          no("3 subclasses for every class"),
          no("Played above level 5 in an adventure"),
        ],
      },
      {
        name: "Level Up",
        note: "Milestone levels, on one screen shared by both hosts.",
        milestones: [
          yes("The same level-up screen on the web and the desktop"),
          yes("Pick a subclass, feat, spells and options"),
          yes("AI-played heroes level up on their own"),
          yes("Levels 2 to 20 tested"),
          no("Change a hero’s build after the fact"),
        ],
      },
      {
        name: "Spellcasting",
        note: "Slots, concentration, rituals and Counterspell. About 171 spells are still only told.",
        milestones: [
          yes("Spell slots, casting at higher levels and cantrips"),
          yes("Concentration, with saves when hurt"),
          yes("Rituals"),
          yes("Counterspell as a reaction"),
          no("90% of spells run in the engine"),
          no("A spell’s area shown on the 3D stage"),
        ],
      },
      {
        name: "Short and Long Rests",
        note: "Both rests, on both hosts.",
        milestones: [
          yes("A Short Rest spends Hit Point Dice and restores features"),
          yes("A Long Rest restores everything and lifts Exhaustion"),
          yes("No resting in the middle of a fight"),
          no("The player picks which Hit Point Dice to spend"),
          no("A limit on how often a Long Rest can be taken"),
        ],
      },
      {
        name: "Turn-Based Combat",
        note: "Initiative, attacks, death saves, and a Bonus Action each turn.",
        milestones: [
          yes("Initiative and a turn-order strip"),
          yes("Attacks, Critical Hits and damage done by the engine"),
          yes("Death saves"),
          yes("An action and a Bonus Action each turn"),
          no("Move, attack, then move again in one turn"),
          no("Surprise and the Ready action"),
        ],
      },
      {
        name: "Reactions",
        note: "Opportunity Attacks, Shield, Counterspell and more, offered with a timer.",
        milestones: [
          yes("Opportunity Attacks"),
          yes("Class and spell reactions, such as Shield and Uncanny Dodge"),
          yes("A reaction offer with a countdown"),
          yes("Standing orders for reactions in a solo game"),
          no("Standing orders in hosted games"),
          no("Hellish Rebuke and Feather Fall as reactions"),
        ],
      },
      {
        name: "Positioning and Movement",
        note: "Positions in feet, paths around walls, cover and difficult terrain.",
        milestones: [
          yes("Positions in feet, kept by the engine"),
          yes("Paths through doorways and around creatures"),
          yes("Difficult terrain and swimming cost extra movement"),
          yes("Cover worked out from the set’s walls"),
          no("Pick where to move on the map, and see how far you can go"),
        ],
      },
      {
        name: "Shove, Grapple and Throw",
        note: "Shove, Grapple and thrown weapons work. There is no jumping yet.",
        milestones: [
          yes("Shove pushes 5 feet or knocks prone"),
          yes("Grapple, with a DC to escape"),
          yes("Thrown weapons at range"),
          no("Long Jump and High Jump"),
          no("Throw objects, creatures or potions"),
          no("A shove into water or off an edge has a consequence"),
        ],
      },
      {
        name: "Light, Dark and Stealth",
        note: "Hiding works, and Fog Cloud and Darkness block sight. There is no lighting yet.",
        milestones: [
          yes("Hide, Passive Perception and Search"),
          yes("Fog Cloud and Darkness block sight"),
          no("Each encounter says how it is lit"),
          no("Darkvision changes what a creature sees"),
          no("Dim light and darkness let a creature hide"),
          no("See where NPCs are looking, and sneak outside combat"),
        ],
      },
      {
        name: "Surfaces and Hazards",
        note: "Water in 8 sets, and spell areas like Grease, Web and Wall of Fire.",
        milestones: [
          yes("Water in the floor plans, with swimming"),
          yes("Spell areas on the ground that trigger as creatures enter"),
          no("Hazards built into sets: fire, ice, rubble"),
          no("Burning, falling and suffocation rules"),
          no("Surfaces that react, like fire lighting grease"),
          no("These areas shown on the 3D stage"),
        ],
      },
      {
        name: "Elevation, Flying and Falling",
        note: "The floor plans have no height yet.",
        milestones: [
          no("Floor plans with heights and levels"),
          no("Positions with height, and distance in 3D"),
          no("Falling damage"),
          no("Flyers held at a height"),
        ],
      },
      {
        name: "Multiclassing",
        note: "The rules data is typed. A hero still has one class.",
        milestones: [
          yes("Multiclass rules typed in the SRD data"),
          no("A hero sheet with more than one class"),
          no("Hit points, proficiencies and spell slots worked out for a multiclass hero"),
          no("Take a new class at level up, with its requirements checked"),
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
        note: "Every class, built on the rules. 7 of 11 species are offered.",
        milestones: [
          yes("All 12 classes at creation"),
          yes("A rules-legal sheet, built by the engine and checked by the host"),
          no("Every species the rules know is offered"),
          no("Tool proficiencies and starting coin"),
          no("More than the SRD’s 4 backgrounds"),
        ],
      },
      {
        name: "Your Hero’s Look",
        note: "A stock figure for each species, or art painted by your own AI.",
        milestones: [
          yes("A stock figure for every offered species, in two builds"),
          yes("Custom painted art for a new hero"),
          no("New heroes play as rigged 3D figures"),
          no("An appearance editor for face, hair and body"),
        ],
      },
      {
        name: "Origin Heroes",
        note: "9 premade heroes, each with their own goals.",
        milestones: [
          yes("Every premade hero has written goals"),
          yes("An unchosen premade joins the party, played by the AI"),
          no("Scenes written for each premade in every adventure they’re in"),
          no("A personal quest that carries across adventures"),
          no("Every premade plays as a 3D figure"),
        ],
      },
      {
        name: "NPCs With Their Own Motives",
        note: "111 of 116 NPCs in encounters have written behavior that drives their turns.",
        milestones: [
          yes("Written behavior drives an NPC’s own turns"),
          yes("NPCs remember what they were told, and whose names they know"),
          no("Every NPC in an encounter has written behavior"),
          no("NPC goals that carry on across scenes"),
        ],
      },
      {
        name: "Monsters",
        note: "330 SRD stat blocks. The adventures use 3 kinds of real monster.",
        milestones: [
          yes("SRD monster stat blocks run in the engine"),
          no("More than 3 kinds of monster in the adventures"),
          no("Four-legged figures in play"),
          no("Every monster in the adventures has a 3D figure"),
        ],
      },
      {
        name: "A Voice for Every Character",
        note: "Dialogue is read in a second voice. Characters don’t have their own voices yet.",
        milestones: [
          yes("A choice of narrator voice"),
          yes("Dialogue read in a voice apart from the narration"),
          no("Every speaking character keeps a voice of their own"),
          no("Authors pick a voice for each character"),
          no("Monsters have sounds of their own"),
        ],
      },
      {
        name: "Companions Who Join the Party",
        note: "NPCs fight beside you, and AI-played heroes level with you. No NPC joins.",
        milestones: [
          yes("An NPC fights on the party’s side"),
          yes("An AI-played party member who levels with the party"),
          no("Recruit an NPC into the party"),
          no("A companion who stays across scenes and adventures"),
          no("A camp where the player swaps companions"),
        ],
      },
      {
        name: "Approval and Banter",
        note: "Not started.",
        milestones: [
          no("Each companion keeps an approval score"),
          no("Companions react to choices by their approval"),
          no("Party members talk among themselves unprompted"),
          no("Low approval has a cost"),
        ],
      },
      {
        name: "Romance",
        note: "Not started.",
        milestones: [no("Characters with romance arcs"), no("A relationship that lasts"), no("Romance scenes that depend on approval")],
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
        note: "41 sets cover 34 places. 7 are in their finished look.",
        milestones: [
          yes("Every encounter of every adventure has a 3D scene"),
          no("Every set in its finished look (7 of 41)"),
          no("Connected areas to explore, not one set per encounter"),
          no("Height in the sets"),
          no("A steady 60 frames a second"),
        ],
      },
      {
        name: "Animated Characters",
        note: "A pipeline from painted art to rigged figures. 11 of 137 characters play in 3D.",
        milestones: [
          yes("A pipeline from painted art to a rigged, animated figure"),
          yes("A combat move set on every rigged figure"),
          no("Every character in every adventure plays as a 3D figure"),
          no("New heroes play as 3D figures"),
          no("A four-legged figure in play"),
          no("Hands that grip"),
        ],
      },
      {
        name: "Cinematic Camera",
        note: "A director picks shots by film grammar, timed to the narrator in the desktop app.",
        milestones: [
          yes("A director plans shots for every kind of moment, with checks"),
          yes("Shots timed to the narration"),
          no("No shot framed from outside a wall, checked by machine"),
          no("Big moments staged: initiative, Critical Hits, a level gained"),
          no("Close-ups on faces that move"),
        ],
      },
      {
        name: "Sound and Ambience",
        note: "Cues for every effect and roll, and ambience on every set.",
        milestones: [
          yes("A sound for every stage effect and dice roll"),
          yes("An ambience bed on every set"),
          no("Sound placed left and right, or in 3D"),
          no("Mixed and approved by ear on every platform"),
        ],
      },
      {
        name: "Spell Effects",
        note: "9 kinds of effect in 7 elements, chosen by the story.",
        milestones: [
          yes("A library of effects the story triggers"),
          no("A look of its own for each spell"),
          no("Lasting areas shown for as long as they last"),
          no("Areas drawn at their true size"),
          no("A casting animation"),
        ],
      },
      {
        name: "Expressive Faces",
        note: "Sharp painted faces on the 3D figures. They don’t move yet.",
        milestones: [yes("Detailed faces on the 3D figures"), no("A face rig that moves"), no("Lip sync to the voices"), no("Heads and eyes that turn to the speaker")],
      },
      {
        name: "Cutscenes",
        note: "Not started.",
        milestones: [no("Written cutscenes for key story moments"), no("Cutscenes played on the 3D stage")],
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
        note: "Adventures are markdown, but a new one still needs code edits and a source build.",
        milestones: [
          yes("Adventures are plain text, with a compiler and validator"),
          no("The released app plays a creator’s adventure"),
          no("A new adventure needs no code edits"),
          no("A published guide to writing an adventure"),
          no("An editor for people who don’t code"),
        ],
      },
      {
        name: "Share Adventure Packages",
        note: "Every adventure builds into a package. There is no way to share one yet.",
        milestones: [
          yes("A package for every adventure, checked for missing files"),
          yes("The app loads a package from disk"),
          no("Import a package as one file"),
          no("Publish, browse and download packages on the site"),
          no("Creators’ own figures inside their packages"),
        ],
      },
      {
        name: "Make Your Own Art",
        note: "Players paint their hero with their own AI. The 3D pipeline is the owner’s only.",
        milestones: [
          yes("Paint a hero’s art in the app with your own AI"),
          no("Make a 3D figure on your own machine with one command"),
          no("A creator’s figures play from their package"),
          no("Build a set without writing JSON"),
        ],
      },
      {
        name: "Bring Your Own AI",
        note: "The desktop app runs Claude, Codex, Grok or Antigravity as the game master.",
        milestones: [
          yes("Several AI CLIs supported"),
          yes("Pick the game master’s AI when starting a game"),
          no("A full playthrough checked on every provider"),
          no("Pick a model on every provider"),
          no("A local model, with no account needed"),
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

const share = (ms: Milestone[]) => Math.round((100 * ms.filter((x) => x.done).length) / ms.length)
const allMilestones = (t: VisionTheme) => t.features.flatMap((f) => f.milestones)

/** A feature's progress: the share of its milestones done. */
export const featureProgress = (f: VisionFeature) => share(f.milestones)
/** A theme's progress: the share of all its milestones done, so a feature with more steps weighs more. */
export const themeProgress = (t: VisionTheme) => share(allMilestones(t))
export const visionProgress = () => share(visionThemes.flatMap(allMilestones))
