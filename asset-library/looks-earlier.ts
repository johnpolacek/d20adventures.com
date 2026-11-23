// A played look as it stood before a round of work on it, so the asset library can build the place both ways and
// a visitor can switch between them, live (Before and After in a place's view). The game plays the current look in
// looks.ts. Only the look is kept: what changed in a set, a staging or the engine shows on both sides.
//
// To keep one: before changing a played look, copy its entry here under the day it stood until, with what the round
// changed.

import type { Look } from "./looks"

export interface EarlierLook {
  // The last day it was played.
  made: string
  // What the round after it changed.
  note: string
  look: Look
}

const BEFORE_NOV_23: Record<string, Look> = {
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
      isolight: "1.25,0.08",
      isosky: "7f9cd0",
      isofill: "0.3",
      // Enough of the set's haze that the far wood goes into the dark, and not so much that the near one does.
      isohaze: "0.38",
      // The canopy's shadow falls with a soft, broken edge, as leaves high overhead throw it.
      isosoft: "9",
      // A faint light on each place to hide, so it is found in the dark: the great oak, the fallen log, the mossy boulders.
      isolamps: "-5.9,2.6,-1.4,3,6,8fa8c8;5.4,1.5,7.5,2.2,5,8fa8c8;-5.5,1.7,12.7,2.2,5,8fa8c8",
      // A wood seen from above is all canopy. The trees over the trail to the south are left out, one that stood
      // between that side and the clearing, and one whose leaves hung across the owlbear's face.
      isoclear: "6.5,22,5;6,4,3;3,13,6;4,22,7;5,31,8;9,-2,2.5",
      // Less of the frame's darkening at its edges: the near ground in the corners went to black.
      isovignette: "0.3",
      // A figure reflects a lit room of its own, which is warm and bright beside a wood at night.
      figenv: "0.04",
      // The moon along a figure's edges, so who stands in the canopy's shadow is still seen.
      figrim: "9db4d8,0.45",
      rings: "thalbern,wollandora",
      bloom: "on",
    },
    // Neither of the set's shafts of light: a beam read as a pane of glass.
    edit: { "oak-shaft": null, "clearing-shaft": null },
    // Under a canopy nothing is lit at the height of the eye. The set's sky is a bright blue down to the ground, which
    // showed between the trunks as a band of daylight (the owner, 2026-11-15: "it should be almost black as the forest
    // canopy blocks all the light"). Here the sky goes to black at the horizon, the haze is black, and the far wood
    // fades into it. Overhead it stays a night sky with a moon. The haze is a blue a shade off black, so a near trunk
    // stands dark against the wood behind it, and the sky meets it at the horizon in the same blue: no line shows
    // where the far ground ends.
    // The moon comes through the leaves weaker and the night sky fills more of what they shade, so the canopy's shadow
    // on the ground is a darker ground and not a black hole. The frame
    // is no brighter for it: the lit ground and the leaves lose what the shadows gain. The light the camera carries is the moon's colour, not a
    // lamp's: it lit a figure warm against the cold wood.
    atmosphere: {
      sky: { horizon: "#152742", mid: "#0a1424", gain: 0.3 },
      fog: { color: "#060c15" },
      sun: { intensity: 0.7 },
      hemisphere: { sky: "#64799c", ground: "#0e131b", intensity: 3 },
      fill: { color: "#8ea6cc" },
    },
    // An old wood: oaks, pines, a few birches, and the dead among them.
    trees: {
      files: "/stage/trees",
      near: [1, 1],
      rings: [16, 38],
      thin: [62, 0.4],
      taller: 1.45,
      kinds: { oak: 0.3, pine: 0.26, ash: 0.18, aspen: 0.1, dead: 0.11, sapling: 0.05 },
      without: ["oak5"],
      hero: { "great-oak": "oak2" },
      leaves: { aspen: "ash" },
      // Leaves seen from below at night are dark against the sky, not pale.
      tint: { "*": "#4c535d", aspen: "#c9d6a0", bark: "#6f6a64" },
      // An old deep wood and not poles on a lawn. Each leaf card is cut smaller, the near ones most, and their edges
      // are smoothed, so the crowns are fine and do not stair-step against the sky.
      play: [-14, -18, 14, 22],
      cards: [4, 1, 1],
      smooth: true,
      // Trunks of every age, some leaning, each with a faint edge of moonlight on its side and moss and roots at its
      // foot; dead branches low on them and a broken limb here and there.
      girth: [0.85, 1.6],
      lean: 0.13,
      bark: { rim: ["#9db4d8", 0.05], moss: "#24301f", roots: true, stubs: 2, limbs: 0.3 },
      // The wood goes on past the set's own into the haze, so between the trunks there is always another trunk.
      beyond: { count: 300, from: 44, to: 140, height: [11, 21], leaves: 0.4 },
      // Under the crowns, outside where the game is played: saplings, young spruce, snags.
      under: { count: 25, from: 12, to: 48, shapes: { sapling1: 0.45, pine4: 0.35, dead2: 0.2 }, height: [3, 7.5] },
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
}

const NOTES: Record<string, string> = {
  "realm-of-myr/valkarr-forest-trail": "The owlbear greyed and given less rim light, shorter grass, more moonlight on the bark",
  "realm-of-myr/old-standing-stones": "Pale weathered granite with lichen in place of dark lumps, lighter grass blades",
  "realm-of-myr/thalberns-forest-home": "Stones, shingles, boards and flags at a cottage's sizes",
}

// Newest first, by set.
export const EARLIER_LOOKS: Record<string, EarlierLook[]> = Object.fromEntries(
  Object.entries(BEFORE_NOV_23).map(([set, look]) => [set, [{ made: "2026-11-23", note: NOTES[set], look }]])
)

// A set's look as it stood on a day, or the current one.
export const earlierLook = (set: string, day: string | undefined) => (day ? EARLIER_LOOKS[set]?.find((e) => e.made === day)?.look : undefined)
