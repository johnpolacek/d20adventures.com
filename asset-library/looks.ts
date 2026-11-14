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
  shots: Record<string, Record<string, string>>
}

export const LOOKS: Record<string, Look> = {
  "realm-of-myr/kordavos-south-gate": {
    // A cool fill sets the shadows against the low sun, the brazier and the post lantern throw a pool of their own
    // about the checkpoint, and rings mark the cast out of the crowd.
    params: {
      paint: "0",
      isobox: "-46,-16,46,34",
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
    shots: {
      // The whole gatehouse on its board.
      wide: { iso: "-35,30,190,38", isoat: "0,6,17" },
      // The checkpoint and the head of the queue, where the scene is played.
      play: { iso: "-35,35,70,9", isoat: "2,16" },
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
