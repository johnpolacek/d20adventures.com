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
  source: { generator: string; triangles: number; cost: number; made: string }
  rig: { bones: number; weights: string }
  clips: string[]
  lods: { file: string; triangles: number; megabytes: number; texture: number }[]
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
  figure: Figure | null
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
export interface Library {
  setting: string
  settingName: string
  characters: Character[]
  places: Place[]
  groups: string[]
  pictures: Picture[]
  // The kinds of picture, in the order they are shown.
  kinds: string[]
}
