/**
 * The vision: what players love most about Baldur's Gate 3, one theme each, with the features D20 Adventures builds
 * toward it and how far along each one is. /vision shows it. Progress is John's call, edited here by hand: 0 to 100,
 * and a note on where it stands today. Free Open Source leads, and with Create Your Own is what Baldur's Gate 3 doesn't do.
 */

export type VisionFeature = { name: string; pct: number; note: string }
export type VisionTheme = { id: string; name: string; why: string; features: VisionFeature[] }

export const visionUpdated = "2026-11-24"

export const visionThemes: VisionTheme[] = [
  {
    id: "open-source",
    name: "Free Open Source",
    why: "The whole platform is free, and the code is open to everyone.",
    features: [
      { name: "Open Source Code", pct: 100, note: "MIT, on Github." },
      { name: "Free to Play", pct: 100, note: "The game is free to play." },
      { name: "Open Rules", pct: 100, note: "Built on SRD 5.2.1, under CC-BY-4.0." },
    ],
  },
  {
    id: "setting",
    name: "Epic Setting",
    why: "A dense, hand-crafted world where exploring is rewarded.",
    features: [
      { name: "The Realm of Myr", pct: 40, note: "A setting with its own places, people and history." },
      { name: "Written Adventures", pct: 60, note: "Four adventures in the Realm of Myr, written as markdown." },
      { name: "Places to Explore", pct: 25, note: "Each adventure moves through a few places." },
      { name: "Secrets and Hidden Things", pct: 20, note: "Checks find what is hidden. Few secrets are written yet." },
      { name: "A Campaign Across Adventures", pct: 15, note: "Heroes carry levels over. The story does not yet." },
    ],
  },
  {
    id: "roleplaying",
    name: "Meaningful Roleplaying",
    why: "Creative and chaotic choices work, and the world answers them.",
    features: [
      { name: "Type Anything", pct: 75, note: "Players write what they do. The AI game master rules on it." },
      { name: "A Game Master at the Table", pct: 70, note: "An AI game master runs the scene and the rules." },
      { name: "Many Ways Through a Scene", pct: 60, note: "Talk, sneak or fight. Encounters allow each." },
      { name: "Different Every Time", pct: 60, note: "The game master never plays a scene the same way twice." },
      { name: "A Narrator Who Reads the Story", pct: 70, note: "A real-time voice reads every scene." },
      { name: "Consequences That Carry On", pct: 30, note: "Within an adventure. Not yet across a campaign." },
      { name: "Multiple Endings", pct: 20, note: "An adventure ends on what happened in it." },
    ],
  },
  {
    id: "multiplayer",
    name: "Engaging Multiplayer",
    why: "A whole campaign with your friends, like a real D&D night.",
    features: [
      { name: "Play With Friends", pct: 50, note: "Covert Cargo plays three heroes." },
      { name: "Split Party", pct: 40, note: "Heroes start apart and meet in the story." },
      { name: "Online Hosting", pct: 50, note: "Host from the desktop app." },
      { name: "Drop-In, Drop-Out", pct: 10, note: "Not yet." },
    ],
  },
  {
    id: "rules",
    name: "Faithful 5E Rules Implementation",
    why: "The tabletop rules, played by the engine, in tactical turn-based battles.",
    features: [
      { name: "The 5E Rules", pct: 80, note: "SRD 5.2.1 in the engine, the open 2024 core rules." },
      { name: "Rolls You Can See", pct: 85, note: "Every check rolled on screen, with sound." },
      { name: "All 12 Classes", pct: 80, note: "Every class, levels 1 to 20." },
      { name: "Level Up", pct: 85, note: "Milestones and the level-up screen." },
      { name: "Spellcasting", pct: 75, note: "Slots, concentration, lasting effects. Some spells still only told." },
      { name: "Short and Long Rests", pct: 75, note: "Both rests, on both hosts." },
      { name: "Turn-Based Combat", pct: 85, note: "Initiative, attacks, damage, death saves and conditions." },
      { name: "Reactions", pct: 70, note: "Opportunity attacks and reaction spells." },
      { name: "Positioning and Movement", pct: 40, note: "Positions in feet from real floor plans." },
      { name: "Shove, Jump and Throw", pct: 45, note: "Shove and Grapple are in. Jumping is a spell for now." },
      { name: "Light, Dark and Stealth", pct: 35, note: "Hiding works. Lighting and sight are in progress." },
      { name: "Surfaces and Hazards", pct: 15, note: "Water just landed in stage plans. No fire or grease." },
      { name: "High Ground", pct: 5, note: "No height in the floor plans yet." },
      { name: "Multiclassing", pct: 0, note: "Not started." },
    ],
  },
  {
    id: "characters",
    name: "Imaginative Characters",
    why: "Heroes, companions and villains with their own stories and voices.",
    features: [
      { name: "Character Creator", pct: 65, note: "Built on the rules. Tools and coin not fitted." },
      { name: "Origin Heroes", pct: 50, note: "Premade heroes with their own goals." },
      { name: "NPCs With Their Own Motives", pct: 55, note: "Each NPC wants something and acts on it." },
      { name: "Monsters", pct: 35, note: "SRD stat blocks play. Four-legged figures are next." },
      { name: "Your Hero’s Look", pct: 20, note: "Premade heroes have painted art and 3D figures." },
      { name: "A Voice for Every Character", pct: 15, note: "One narrator voice for now." },
      { name: "Companions Who Join the Party", pct: 10, note: "Not yet. NPCs fight beside you but do not join." },
      { name: "Approval and Banter", pct: 5, note: "Not started." },
      { name: "Romance", pct: 0, note: "Not started." },
    ],
  },
  {
    id: "graphics",
    name: "Cinematic Graphics",
    why: "Beautiful places and scenes shot like a film.",
    features: [
      { name: "3D Environments", pct: 50, note: "Eight sets across the Realm of Myr." },
      { name: "Animated Characters", pct: 50, note: "Painted art to rigged, animated figures." },
      { name: "Cinematic Camera", pct: 55, note: "A director picks shots in time with the narrator." },
      { name: "Sound and Ambience", pct: 55, note: "Effects, dice and ambience that follow the camera." },
      { name: "Spell Effects", pct: 40, note: "Missiles and effects on stage." },
      { name: "Cutscenes and Faces", pct: 5, note: "No faces or lip sync yet." },
    ],
  },
  {
    id: "create",
    name: "Create Your Own",
    why: "Write your own adventures and play them with your friends.",
    features: [
      { name: "Write Your Own Adventures", pct: 40, note: "Adventures are markdown files." },
      { name: "Share Adventure Packages", pct: 25, note: "One package per adventure, designed." },
      { name: "Make Your Own Art", pct: 20, note: "The asset pipeline, not open to players yet." },
      { name: "Bring Your Own AI", pct: 60, note: "The desktop app runs your own AI CLI." },
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

const average = (features: VisionFeature[]) => Math.round(features.reduce((sum, f) => sum + f.pct, 0) / features.length)

export const themeProgress = (theme: VisionTheme) => average(theme.features)
export const visionProgress = () => average(visionThemes.flatMap((t) => t.features))
