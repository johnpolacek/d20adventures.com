---
moduleOrder: 41
sceneTitle: "Into the Underground"
sectionTitle: "The Covenant of The Cowl"
id: "into-the-catacombs"
type: "encounter"
title: "Into the Catacombs"
settingId: "realm-of-myr"
adventureId: "march-of-davos"
npcs:
  - id: "astrid-blackthorn"
    behavior: "Attacks the nearest saboteur with her sword each turn, with a roll. Leaves the fuse to others."
    startNear: "party"
  - id: "eamon"
    behavior: "Hangs back and casts Magic Missile at the rogues. Does not touch the fuse until a hero has tried to snuff it. After that, may try once a turn with his own Arcana roll, DC 14."
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

**Holding the clock:**
- The fuse burns for 3 full rounds. Only a successful check or a clear creative answer snuffs it. Killing or driving off the cultist who tends it does not.
- Once snuffed, the fuse stays out. The saboteurs have no flint or spare fuse to relight it, and no one narrates it hissing again.
- Eamon helps only after a hero has tried the fuse. He never snuffs it first.
- Astrid's soldiers hold the stair behind the party and do not join the fight. Once it is over, two may come down to guard a prisoner.
- A saboteur taken alive carries no poison and will not talk. Pinning or gagging him takes a roll like any other blow.
- No saboteur is bound, disarmed or taken without a roll. Each one still standing keeps fighting or tries to flee down the tunnel, and fleeing takes a Dexterity roll against the hero nearest him, DC 12. A saboteur is down only when an attack or a check puts him down. Once the fuse is out, a saboteur who is disarmed and wounded, or who failed to flee, may yield instead. Then the fight is over.

**Failure Scenarios:**
- If the barrels detonate, characters take 4d6 bludgeoning damage and must succeed on a **DC 15 Dexterity Save** to avoid being buried. The tunnel collapses behind the party and buries several of Astrid's soldiers. The survivors dig through and catch up.

## Transitions

- To [[encounter:through-the-labyrinth]] once the threat of the explosion is resolved or the party flees deeper into the network.