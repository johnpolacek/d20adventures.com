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
export interface Library {
  setting: string
  settingName: string
  characters: Character[]
  places: Place[]
  groups: string[]
}
