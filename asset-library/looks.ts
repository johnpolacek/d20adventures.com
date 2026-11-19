// The isometric look of a set: what to keep, what to leave out, how to light it and where to stand, so a view is asked
// for by name and not by a line of switches.
//
//   /dev/stage-lab?staging=welcome-to-kordavos/the-gates-of-kordavos&tier=high&look=play
//
// `params` are the stage lab's own switches (lab/stage-art/viewer.tsx), given to every shot. A shot adds its camera. Whatever the address
// gives itself wins over both. `materials` changes the set's materials for this view alone: the game's set is untouched.

import type { TreeSwap } from "./trees"

export interface Look {
  params: Record<string, string>
  materials?: Record<string, Record<string, unknown>>
  // Cast members shown as figures from the library: a cast id, and the character (asset-library/characters) who stands
  // there. One whose figure is not built yet stays a card.
  figures?: Record<string, string>
  // Cast members this view adds to the scene, as a staging writes them.
  cast?: Record<string, unknown>[]
  // Other sets that stand in the same world, each with where its middle falls in this one. The parts it `leaves` out
  // are its own stand-ins for what this set builds for real: its ground, its far town, its painted gate.
  join?: { set: string; at: [number, number]; leave: string[] }[]
  // Changes to this set's own parts by id, for this view alone: null leaves one out.
  edit?: Record<string, Record<string, unknown> | null>
  // Changes to the set's atmosphere, for this view alone: its sky's colours, its haze, its light from all round.
  atmosphere?: Record<string, Record<string, unknown> | number | string>
  // Modelled trees stood where the set's own are built (trees.ts).
  trees?: TreeSwap
  shots: Record<string, Record<string, string>>
  // The shot a scene with a cast opens on, if not `play`.
  open?: string
  // The game plays the set in this look, built, and not in its paintings (play.ts).
  play?: boolean
}

export const LOOKS: Record<string, Look> = {
  "realm-of-myr/kordavos-south-gate": {
    // A cool fill sets the shadows against the low sun, the brazier and the post lantern throw a pool of their own
    // about the checkpoint, and rings mark the cast out of the crowd.
    params: {
      paint: "0",
      isobox: "-46,-16,46,34",
      // The whole square under its sky, edge to edge, and not a model on a board.
      isowhole: "1",
      isohide: "awning",
      isolight: "1.06,0.22",
      isosky: "9db8e8",
      isolamps: "3.9,1.3,11.6,38,9;4.3,2.3,12.1,16,7",
      rings: "branka,cassia,yeva,milos,thalbern",
      shade: "0.42",
      bloom: "on",
    },
    // Setts a hand across, not stones a pace across, and dirtier: from above the square is mostly ground. The worn
    // tracks across it are left off: from above they read as painted lines.
    materials: { ground: { stones: 0.2, relief: 0.03, grime: 0.8, variance: 0.45, roads: false } },
    // The party of five. Lyra and Poppen stand where the scene has Cassia and Yeva, and Thalbern is added beside them.
    figures: { garlan: "garlan", branka: "branka", cassia: "lyra", yeva: "poppen", milos: "milos", thalbern: "thalbern" },
    cast: [
      {
        id: "thalbern",
        name: "Thalbern",
        role: "Ranger of the Valkarr woods",
        height: 1.82,
        art: { front: "/stage/fixtures/the-midnight-summons/thalbern-front.webp", back: "/stage/fixtures/the-midnight-summons/thalbern-back.webp" },
        at: [2.05, 13.75],
        facing: "garlan",
      },
    ],
    // The festival square lies 112 metres up the street from the gate: its own set says so, with a painted gate at
    // that distance behind it. Here the two are one place, and the plain roofs that stood in for the square give way.
    join: [{ set: "realm-of-myr/kordavos-harvest-square", at: [0, -112], leave: ["groundDisc", "archScreen", "skyline", "farTown", "dome"] }],
    // Between the two the portcullis is let most of the way down: an iron grille across the arch, with room to walk
    // under it.
    edit: { "inner-gate": null, "city-blocks": { exclude: [[-64, -172, 64, -40]] }, "great-gate": { portcullisGap: 3.4 } },
    open: "arrival",
    shots: {
      // From the back of the line, low and wide, looking up at the gate over everyone: what it is to arrive. It is
      // the game's own opening shot of the place.
      arrival: { iso: "2.7,-25.7,95.5,72", isoat: "0,0,44" },
      // The whole gatehouse on its board.
      wide: { iso: "-35,30,190,38", isoat: "0,6,17" },
      // The checkpoint and the head of the queue, where the scene is played.
      play: { iso: "-35,35,70,9", isoat: "2,16" },
      // The grille from the line.
      gate: { iso: "-10,10,75,34", isoat: "0,-3,14" },
      // The square inside the walls, seen from over the street that leads up to it from the gate.
      festival: { iso: "0,45,80,40", isoat: "0,-112" },
      // Both at once: the line outside the gate, the street through it, and the square.
      city: { iso: "-35,55,270,38", isoat: "0,-50" },
    },
  },
  // The three places of The Midnight Summons: a wood at night, twice, and the ranger's home the morning after. A night
  // set carries a light on its camera, which flattens a wide view, so most of it is put out (isofill) and the light
  // is the moon's alone: the set's own, and a second cool light from above that throws the trees' shadows. No lamps
  // and no shafts: the owner turned down pools and beams of light as spotlights, 2026-11-15, and asked for a darker
  // wood. A figure reflects less of its own lit room at night (figenv), or it glows.
  "realm-of-myr/old-standing-stones": {
    play: true,
    params: {
      paint: "0",
      isobox: "-16,-14,10,16",
      isowhole: "1",
      isolight: "0.9,0.06,0.5",
      isosky: "7f9cd0",
      isofill: "0.25",
      // More of the set's haze than a town keeps: the far bank is bare ground, and the valley wants its distance.
      isohaze: "0.7",
      figenv: "0.15",
      rings: "thalbern,wollandora",
      bloom: "on",
    },
    // Grass a shade nearer the moon's colour: lit from above it went a daylight green.
    materials: { grass: { tip: "#3f6650" }, grassTall: { tip: "#4a6c54" }, ground: { grass: "#2f4f33", moss: "#3a5c30" } },
    trees: {
      files: "/stage/trees",
      near: [-1.3, 0.4],
      rings: [18, 40],
      thin: [70, 0.45],
      taller: 1.35,
      kinds: { oak: 0.38, ash: 0.24, pine: 0.16, aspen: 0.1, dead: 0.12 },
      // No saplings and no open-grown oak about the circle: their leaves hang at the height of an eye.
      without: ["oak5"],
      leaves: { aspen: "ash" },
      tint: { "*": "#8a93a0", aspen: "#c9d6a0", bark: "#77726c" },
    },
    open: "arrival",
    shots: {
      // From the path, at the height of the grass, looking up at the tallest stone with the moon over the valley.
      arrival: { iso: "19.2,-16.9,12.7,62", isoat: "-2.5,-2,4.2" },
      // The circle between the wood and the river, the valley behind it.
      wide: { iso: "14,5,40,36", isoat: "-1.5,-1,4" },
      // The circle from above, where the two meet.
      play: { iso: "25,32,34,22", isoat: "-0.5,1.5" },
    },
  },
  "realm-of-myr/valkarr-forest-trail": {
    play: true,
    params: {
      paint: "0",
      isobox: "-14,-18,14,22",
      isowhole: "1",
      isolight: "1.34,0.24",
      isosky: "85a6dc",
      isofill: "0.22",
      // Atmospheric depth haze that separates near trunks from far wooded ridges while keeping mist & foliage readable.
      isohaze: "0.42",
      // The canopy's shadow falls with a soft edge, as leaves high overhead throw it.
      isosoft: "5",
      // The one place the moon gets through: a pool at the tree line, under the set's shaft. Then a gentle grazing
      // moonlit accent on each place to hide, so bark and moss read cleanly in the dark: great oak, fallen log, boulders.
      isolamps: "8,3.6,-8.5,24,18,b2cef4;-5.8,3.2,-1.6,9,10,9ab8dc;5.2,2.4,7.6,10,9.5,9ebce0;-5.5,2.0,12.7,6.5,8,9ab8dc",
      // Keep only the immediate sightlines clear (between clearing and trail, and across the owlbear's face) so the
      // southern treeline stays rich behind eye-level close-ups.
      isoclear: "6,4,3;9,-2,2.5",
      figenv: "0.2",
      // Directional moonlight along a figure's edges, so who stands in the canopy's shadow is still seen without glowing.
      figrim: "a8c4ea,0.52",
      rings: "thalbern,wollandora",
      bloom: "on",
    },
    // Keep only the tree-line moon shaft; replace procedural sphere bushes with real modelled 3D shrubs (understory).
    edit: { "oak-shaft": null, bushes: null },
    materials: {
      moonbeam: { opacity: 0.24 },
      mist: { color: "#3d587a", opacity: 0.21 },
    },
    // Moonlit night woods: raking northeast moonlight catches bark, ferns, and mist weaving between the trunks, while
    // cool midnight-blue shadows keep the floor readable and distant wooded ridges close the horizon.
    atmosphere: {
      sun: { direction: [0.42, 0.62, -0.66], intensity: 1.82 },
      sky: { horizon: "#1d3354", mid: "#0f1e36", gain: 0.36 },
      fog: { color: "#112035" },
      hemisphere: { sky: "#4e70a0", ground: "#1c2b3b", intensity: 0.72 },
    },
    // An old layered wood: oaks, pines (including low-branching young spruces), ash, saplings, and modelled shrubs.
    trees: {
      files: "/stage/trees",
      near: [1, 1],
      rings: [16, 38],
      thin: [75, 0.65],
      taller: 1.38,
      kinds: { oak: 0.27, pine: 0.28, ash: 0.16, aspen: 0.08, dead: 0.09, sapling: 0.12 },
      without: ["oak5", "bush2"],
      hero: { "great-oak": "oak2" },
      leaves: { aspen: "ash" },
      // Cool silvered bark catches raking moonlight while canopy foliage stays rich against the night sky.
      tint: { "*": "#5f6b7a", aspen: "#c4d2a4", bark: "#a09c98" },
      understory: {
        byTrunks: 0.58,
        height: [1.2, 2.5],
        ring: {
          count: 185,
          minR: 13,
          maxR: 54,
          clear: [
            [0.5, 30, 3.4],
            [-1.5, 20, 3.8],
            [-1.4, 15.5, 4.0],
            [-1.2, 11, 4.0],
            [1.6, 10.5, 3.8],
            [4.5, 8.2, 3.2],
            [0.2, 3, 3.6],
            [1.8, -5, 3.6],
            [1.2, -14, 3.4],
            [-1, -23, 3.2],
            [2.5, -6, 7.8],
            [2.2, 21.5, 5.2],
            [-6.5, 10.5, 4.0],
            [3.2, 4.5, 3.4],
            [8, -8.5, 3.2],
          ],
        },
      },
    },
    open: "arrival",
    shots: {
      // From the trail, low, looking up the great oak against the moon, with the clearing beyond the fallen log.
      arrival: { iso: "9,-17.6,20.2,62", isoat: "0.5,0,7" },
      // Back down the trail and above head height: the oak, the trail and the clearing.
      wide: { iso: "6,14,44,36", isoat: "0.5,1,2.5" },
      // From over the trail, looking down on where it is fought out.
      play: { iso: "8,32,36,26", isoat: "0.5,2.5" },
    },
  },
  // The morning after, so the set's own sun and sky light it, as the Gates'.
  "realm-of-myr/thalberns-forest-home": {
    play: true,
    // The trees over the path are left out, so the cottage is seen from down it.
    params: { paint: "0", isobox: "-14,-14,14,22", isowhole: "1", isolight: "1.05,0.2", isosky: "9db8e8", isoclear: "0,14,7;0.5,22,8;2,30,8", rings: "thalbern", bloom: "on" },
    // The same wood by day. The oak at the door is the set's own tallest tree.
    trees: {
      files: "/stage/trees",
      near: [0, -3],
      rings: [18, 40],
      thin: [60, 0.5],
      taller: 1.2,
      kinds: { oak: 0.3, pine: 0.26, ash: 0.2, aspen: 0.14, dead: 0.04, sapling: 0.06 },
      hero: { "front-oak": "oak5" },
      leaves: { aspen: "ash" },
      tint: { aspen: "#d4e0a4", bark: "#70757a" },
    },
    open: "arrival",
    shots: {
      // From the path, low, looking up at the cottage under its oak.
      arrival: { iso: "7.7,-16.7,13.2,62", isoat: "-0.5,-5,4.5" },
      // Down the path from the wood.
      wide: { iso: "8,12,36,38", isoat: "0,-2,3" },
      // The doorstep, from under the oak's branches.
      play: { iso: "3,22,20,30", isoat: "-1,-2.5,1" },
    },
  },
  "realm-of-myr/dragonbone-inn": {
    params: { paint: "0", isolight: "1.4,0.3,1.8" },
    shots: { wide: { iso: "45,35,40,17" }, play: { iso: "45,35,40,6", isoat: "5.2,2.6" } },
  },
}

// The lab's switches for a set's look and one of its shots, under whatever the address gave.
export function withLook(params: Record<string, string | undefined>, set: string): { params: Record<string, string | undefined>; look: Look | null } {
  const look = params.look ? LOOKS[set] : undefined
  if (!look) return { params, look: null }
  const shot = look.shots[params.look as string] ?? Object.values(look.shots)[0]
  const given = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
  const figure = Object.entries(look.figures ?? {})
    .map(([cast, character]) => `${cast}:@${character}:0:Idle`)
    .join(",")
  return { params: { ...look.params, ...(figure ? { figure } : {}), ...shot, ...given }, look }
}
