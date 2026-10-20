---
moduleOrder: 40
sceneTitle: "Into the Underground"
sectionTitle: "The Covenant of The Cowl"
id: "into-the-catacombs"
type: "encounter"
title: "Into the Catacombs"
settingId: "realm-of-myr"
adventureId: "march-of-davos"
npcs:
  - id: "astrid-blackthorn"
    behavior: "Fights beside the party, cutting toward the saboteurs."
    startNear: "party"
  - id: "eamon"
    behavior: "Hangs back and casts. Can try to snuff the fuse with magic."
    startNear: "party"
  - id: "covenant-rogue"
    behavior: "Two rogues, acting as one. Guard the fuse-lighter from behind the pillars with crossbows and short blades."
  - id: "covenant-cultist"
    behavior: "Two cultists, acting as one. One kneels to light and tend the fuse while the other shields him. They keep it burning at any cost."
image: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726873268984"
---

## Intro

A long, narrow tunnel runs deep into the foundations of Kordavos. The air is cool and damp, smelling faintly of iron and deep stone. For a while, only the echo of the party’s footsteps breaks the silence.

After several minutes the walls widen. Torchlight flickers around a bend, and low, urgent voices echo from the chamber ahead.

{actor: covenant-cultist} Around the last corner, four hooded figures of the Covenant are feverishly setting six heavy wooden barrels against the support pillars. One kneels by a long alchemical fuse that snakes across the floor.

{speaker: covenant-rogue, delivery: muttering} Hurry. The wards at the surface are down. Light it now! We’ll collapse the tunnel and bury the Blackthorn bitch with her guards.

## GM Notes

This is a "Ticking Clock" encounter. The primary goal is to stop the explosion.

- **The Fuse:** The fuse will detonate at the end of the 3rd round. 
- **The Saboteurs:** 2 Covenant Rogues and 2 Cultists. They will prioritize defending the fuse-lighter.
- **Disarming:** A character can use an action to make a **DC 14 Sleight of Hand** or **Arcana** check to snuff the fuse. Using water or *Mage Hand* can also work creatively.

**Failure Scenarios:**
- If the barrels detonate, characters take 4d6 bludgeoning damage and must succeed on a **DC 15 Dexterity Save** to avoid being buried. The tunnel collapses behind the party and buries several of Astrid's soldiers. The survivors dig through and catch up.

## Transitions

- To [[encounter:through-the-labyrinth]] once the threat of the explosion is resolved or the party flees deeper into the network.