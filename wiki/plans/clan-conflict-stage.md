# Clan Conflict in 3D

[Plans](index.md) · [Stage authoring](../stage-authoring.md) · [Stage engine](../stage-engine.md) · [Harvest Festival handoff](harvest-festival-handoff.md)

Status: implemented on main 2026-10-19. Owner review and a check in the running app are next.

## Owner request, 2026-10-19

The owner reached Clan Conflict in a March of Davos game on desktop and saw a blank story view. Offered a scene on the festival set, shipping encounter art for story view, or nothing, the owner chose the scene.

## Source

- `content/settings/realm-of-myr/adventures/march-of-davos/encounters/clan-conflict.md`: on the festival's outskirts two groups stare each other down. Barok Redbeard steps forward with his followers, rough men and women in mismatched armour. Larya Halloway's people, more finely dressed, some in intricate jewelry, hold their ground. Onlookers leave a circle around the two sides, vendors glance about, parents pull children close.
- GM notes: Larya leads the Valtor clan, traditional Valkarans. Barok's people have sided with the Blackthorns and the Asterians.
- Encounter art: a sunlit market street hung with ochre banners and bunting. Barok on the left in scuffed blue-steel plate with a long red-dyed beard, scarred cheek, snarling. Larya on the right in a sleeveless ochre-gold tunic, a long brown half-up braid, a red scar across her cheek, a dark drop earring. A fur-clad follower behind Barok, a crowd down the street.
- NPC portraits: `barok-redbeard` and `larya-halloway` frontmatter images.

## Brief

- Place: the south end of the harvest square, where the street from the gate opens into it. The street recedes behind the standoff, as in the art.
- Set: `realm-of-myr/kordavos-harvest-square-conflict`, cut from the harvest square by `scripts/stage-sets/clan-conflict.ts`. It adds a clear ring and a crowd of onlookers facing it, and the labelled places below. The festival's own set does not change.
- Standoff: Barok and Larya about 2.4 m apart, face to face across the line of the street. Two followers behind each leader.
- Party: at the front of the crowd on the square's side of the ring, facing the standoff, a few metres off. The five festival vendors stay at their stalls.
- Places: `standoff` (the space between the two leaders), `barokSide` (Barok's followers), `laryaSide` (Larya's people), plus the festival's places.
- Views: The standoff (the art's framing, the street behind), Barok, Larya, Party, The crowd (the ring from above head height). The standoff opens the scene.

## Characters

New standees by `scripts/stage-standees.ts`, fronts conditioned on each NPC's portrait where one exists:

| Cast id | Name on stage | Look |
|---|---|---|
| `barok-redbeard` | Barok Redbeard | Burly, about 1.92 m. Long red-dyed beard, scar on the cheek. Scuffed blue-steel pauldrons and breastplate over leather, mismatched. Sword at the hip. |
| `larya-halloway` | Larya Halloway | Tall, about 1.8 m. Brown hair half up in a long braid, a red scar across one cheek, a dark drop earring. Fitted sleeveless ochre-gold tunic, leather bracers, fine belt, dagger. |
| `barok-bruiser` | Barok's man | A rough man in fur and battered leather with a mail shirt, an axe. |
| `barok-sellsword` | Barok's woman | A hard-faced woman in patched leather with one steel pauldron, a cudgel. |
| `larya-retainer` | Larya's retainer | A lean man in a tailored deep-green coat with silver chains, a rapier. |
| `larya-kinswoman` | Larya's kinswoman | A woman in a fine russet coat, intricate gold jewelry, a dagger at her belt. |

Followers are cast only, not encounter NPCs, so they take no turns.

## Steps

1. Standees: fronts, review against the art, backs, key.
2. Generator, variant set, staging, registration. `pnpm stage:check`.
3. Look at DPR 2 with `scripts/stage-verify.ts`, then owner review on `/dev/stage`.
4. Map `clan-conflict` in `apps/desktop/src/scenes.ts` with a `where` line, extend the desktop tests.
5. Record results here and in [the stage engine reference](../stage-engine.md).

## Results

- Six standees painted and keyed. Barok's first front came out with dwarf proportions, which would read as Branka's kin. The brief now asks for tall human proportions, and the third render is used.
- `scripts/stage-standees.ts` counted `barok-bruiser`'s renders as `barok`'s. It now counts numbered files only.
- The first layout put Larya in the shadow the south-west houses throw across the square, against a blank wall. The standoff moved to [1.2, 17.6], north-east of the street's middle, and both close-ups look across the ring so the other leader stays out of frame.
- `pnpm stage:check` passes. 403 of 405 walks are clear. The two blocked ones are the festival's own vendor walks.
- `scripts/stage-verify.ts` at ultra, DPR 2: every view passes, about 175 draw calls and 0.24M triangles, 15 to 22 fps on this Mac.
- Desktop maps `clan-conflict` with a `where` line and a spare spot for a fifth hero. The scenes test now checks the two leaders' figures and portraits, and story view one encounter later.
- Not yet seen in the running desktop app. The app copies `public/stage` when it starts, so it needs a restart.
