// What the asset library holds, as its pages read it.

export interface Figure {
  id: string
  // The cast ids its character goes by, and whether it is one of the party.
  cast?: string[]
  party?: boolean
  name: string
  role?: string
  height: number
  front: string
  // A picture of the figure itself, when one has been taken. `front` is the pose sheet it was made from.
  thumb?: string
  // `made` is the day its model was generated, and `built` the day it was last put together from that model.
  source: { generator: string; triangles: number; cost: number; made: string; built?: string }
  rig: { bones: number; weights: string }
  clips: string[]
  lods: { file: string; triangles: number; megabytes: number; texture: number }[]
  // What the library adds as it gathers the shelf (library.ts), not kept in figure.json:
  // the figure whose model it takes, for one tried on another's body (its brief's `body`);
  trial?: string
  // what sets it apart from the others of its character, in a few words;
  note?: string
  // and the adventures whose played scenes stand this figure (play.ts).
  plays?: string[]
}
export interface Character {
  id: string
  name: string
  role: string
  height: number
  // The adventure they first appear in, or the player heroes.
  group: string
  front: string
  back: string | null
  scenes: number
  // The figure that stands for them now: the one the game ships, or else the newest made.
  figure: Figure | null
  // Every figure made of them, that one first, then the earlier ones by the day they were made, then the trials.
  versions?: Figure[]
}
export interface Environment {
  key: string
  title: string
  objects: number
  shots: number
  paintings: number
  picture: string | null
  // The first room's width and depth in metres, when the set has one to cut open.
  room: [number, number] | null
  stagings: string[]
}
export interface Place {
  id: string
  location: string
  title: string
  picture: string | null
  groups: string[]
  // Where it first comes up in each adventure it is in: the encounter's order, and the chapter that encounter is in.
  story?: Record<string, { order: number; chapter: string }>
  variants: Environment[]
}
// A picture: the setting's own, an adventure's cover, a scene's art, a map, a portrait, a set's painting.
export interface Picture {
  src: string
  title: string
  kind: string
  // What it belongs to within its kind: an adventure, a map's region, a set.
  of?: string
}
// A sound the game plays: a cue and its takes, one of which the game picks each time it plays.
export interface Sound {
  id: string
  kind: "Dice" | "Effects" | "Ambience"
  takes: string[]
  // What the game plays it for, and where the recording came from (public/stage/sounds/SOURCES.md).
  use?: string
  source?: { name: string; url?: string }
  // An ambience bed plays on under a scene.
  loop?: boolean
}
export interface Library {
  setting: string
  settingName: string
  characters: Character[]
  places: Place[]
  groups: string[]
  pictures: Picture[]
  // The kinds of picture, in the order they are shown.
  kinds: string[]
  // An index published before sounds were listed has none.
  sounds?: Sound[]
}
