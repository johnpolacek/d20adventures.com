// The isometric look of a set: what to keep, what to leave out, how to light it and where to stand, so a view is asked
// for by name and not by a line of switches.
//
//   /dev/stage-lab?staging=welcome-to-kordavos/the-gates-of-kordavos&tier=high&look=play
//
// `params` are the stage lab's own switches (lab/stage-art/viewer.tsx), given to every shot. A shot adds its camera. Whatever the address
// gives itself wins over both. `materials` changes the set's materials for this view alone: the game's set is untouched.

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
  shots: Record<string, Record<string, string>>
  // The shot a scene with a cast opens on, if not `play`.
  open?: string
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
    params: {
      paint: "0",
      isobox: "-14,-18,14,22",
      isowhole: "1",
      isolight: "1.15,0.08,0.6",
      isosky: "7f9cd0",
      isofill: "0.3",
      // The set's haze is a night wood's, thick at ten paces. From farther off it is a wall.
      isohaze: "0.12",
      // A wood seen from above is all canopy. The trees over the trail to the south are left out, one that stood
      // between that side and the clearing, and one whose leaves hung across the owlbear's face.
      isoclear: "6.5,22,4;6,4,2.5;4,14,5;5,30,7;9,-2,2.5",
      figenv: "0.1",
      rings: "thalbern,wollandora",
      bloom: "on",
    },
    // The set's two shafts of light are left out.
    edit: { "clearing-shaft": null, "oak-shaft": null },
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
    // The trees over the path are left out, so the cottage is seen from down it.
    params: { paint: "0", isobox: "-14,-14,14,22", isowhole: "1", isolight: "1.05,0.2", isosky: "9db8e8", isoclear: "0,14,7;0.5,22,8;2,30,8", rings: "thalbern", bloom: "on" },
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
