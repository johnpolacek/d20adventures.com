---
title: "Three.js Isometric Cutaway for 3D Rooms"
date: 2026-11-28
description: "How D20 Adventures slices enclosed rooms open like tabletop dioramas."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/cut-away-isometric-rooms-in-threejs/cover.webp"
---

Slice the roof off a Three.js room with `renderer.clippingPlanes` and the room goes dark. The invisible roof is still casting shadows.

In [D20 Adventures](https://d20adventures.com), rooms like The Dragonbone Inn are built with four walls and a roof. For the [Realm of Myr Asset Library](https://d20adventures.com/settings/realm-of-myr/assets) and our isometric views, I built a cutaway module (`asset-library/iso.ts`) to slice them open like tabletop dioramas, then pulled it out into a standalone MIT repo ([three-isometric-cutaway](https://github.com/johnpolacek/three-isometric-cutaway)).

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/cut-away-isometric-rooms-in-threejs/cover.webp" alt="Isometric cutaway of a warm lit tavern study in Three.js with bookshelves, a stone hearth and a dark diorama plinth" width="1280" height="800" />

### Why the Room Stayed Dark

Three.js skips global `renderer.clippingPlanes` in shadow maps, so the cut-away roof still blocks the key light. Turn on local clipping and attach the five `THREE.Plane`s to every mesh material with `clipShadows = true`:

*src/cutaway.ts*

```ts
renderer.localClippingEnabled = true
world.traverse((obj) => {
  if (!(obj instanceof THREE.Mesh)) return
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
  for (const m of mats) {
    m.clippingPlanes = planes
    m.clipShadows = true
    m.needsUpdate = true
  }
})
```

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/cut-away-isometric-rooms-in-threejs/shadow-clip-before-after.webp" alt="Tavern study with clipShadows false on the left and clipShadows true on the right" width="1600" height="600" />

### Floating Wall Trim

Clipping right on the wall line leaves wainscoting, shelves and frames floating or speckling across the opening. Cutting 16 cm inside the near walls (`wallTrim`) clears them while keeping the far walls solid out to 36 cm (`wallThickness`). My first render still had a thin sliver at the front corner because a 22 cm post stuck 1 cm past the cut.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/cut-away-isometric-rooms-in-threejs/wall-trim-before-after.webp" alt="Tavern study with wallTrim at 0.00 m on the left and 0.16 m on the right" width="1600" height="600" />

### Flipping Walls on 360° Orbit

`cutaway.update(camera)` flips which two walls clip as you orbit 360 degrees, with an 8 cm deadzone (`HYSTERESIS = 0.08`) so walls don’t flicker across the X or Z axis.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/cut-away-isometric-rooms-in-threejs/orbit-flip-before-after.webp" alt="Tavern study from the front-right on the left and orbited to the opposite corner on the right" width="1600" height="600" />

### A Plinth Without Z-Fighting

A sliced room floating in black reads like paper, so we put a dark plinth slab under the floor and a radial gradient behind it. Putting the plinth top at `y = 0` fought with the floor tiles. Dropping it 2 cm (`y0 - 0.02`) fixed it.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/cut-away-isometric-rooms-in-threejs/plinth-before-after.webp" alt="Close-up of the alchemist loft with the plinth top at y = 0 on the left and 2 cm below the floor on the right" width="1600" height="600" />

### Solid Cut Caps

Slicing through walls, chimneys and columns exposes their hollow insides. A stencil pass on the three cut planes fills every sliced face solid (back faces increment, front faces decrement, and a cap quad draws where stencil isn’t zero).

One trap: Three.js defaults `stencil` to `false` on `WebGLRenderer`. Without `stencil: true`, the cap quad turns the whole room into a black cube.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/cut-away-isometric-rooms-in-threejs/solid-caps-before-after.webp" alt="Close-up of the crypt columns hollow on the left and capped solid with stencil buffers on the right" width="1600" height="600" />

Grab the MIT module on GitHub at [three-isometric-cutaway](https://github.com/johnpolacek/three-isometric-cutaway), see it on real rooms in the [Realm of Myr Asset Library](https://d20adventures.com/settings/realm-of-myr/assets), or try the demo at [d20adventures.com](https://d20adventures.com/settings/realm-of-myr/the-midnight-summons).
