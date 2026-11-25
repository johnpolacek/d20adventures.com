---
moduleOrder: 40
sceneTitle: "Into the Underground"
sectionTitle: "The Covenant of The Cowl"
id: "the-hunt-for-the-assassin"
type: "encounter"
title: "The Hunt for the Assassin"
settingId: "realm-of-myr"
adventureId: "welcome-to-kordavos"
landmark: "kordavos/drain-grate"
npcs:
  - id: "astrid-blackthorn"
    behavior: "Cold fury. Leads the hunt and pushes the party on. Offers 500 gold each and a Blackthorn favor if they bargain."
  - id: "eamon"
    behavior: "Focused and quiet. Unravels the ward on the grate and warns that the Cowl will feel it break."
loot:
  - id: "potions-of-healing"
    variant: "Potion of Healing (greater)"
    each: true
    on: "leave"
image: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726868134486"
---

## Intro

{actor: astrid-blackthorn} Lady Astrid, now in dark ranger leathers, leads the adventurers across the moonlit courtyard along the assassin's trail. A discarded glove glows faintly green with poison.

A handful of Blackthorn house guards follow with lanterns and drawn swords.

{actor: eamon} At a drainage grate by the ivy-choked wall waits Eamon, the scholar from the Dragonbone Inn, his hands glowing as he studies runes on the grate.

{actor: astrid-blackthorn, target: eamon} Astrid strides forward.

{speaker: astrid-blackthorn, to: eamon, delivery: low and intense} Eamon. The ward. Break it.

{actor: eamon, effect: aura, element: arcane} Eamon begins to unravel the seal.

{actor: astrid-blackthorn} Astrid turns to the adventurers.

{speaker: astrid-blackthorn} This assassin and the Covenant think they can hide behind magic and shadows. But they have murdered my brother, and they have underestimated me. Thaddeus will not die without vengeance.

{actor: astrid-blackthorn} The grate grinds open.

{speaker: astrid-blackthorn} We hunt together.

## GM Notes

Astrid is driven by cold fury. If the players negotiate for a higher reward, she offers at once 500 gold per person, paid when they climb back out, plus a favor from the Blackthorn family in the future. She carries no purse to pay it here. As the hunt goes down the stair she hands each hero a greater Potion of Healing from the Blackthorn stores, her reward begun.

**What they know.** Astrid knows no names in the Covenant and does not know who waits below. She says so. Eamon is a wizard as well as a scholar. The Blackthorns hired him to judge Valkaran relics, and he kept his spellcraft quiet at the inn because a mild scholar hears more. He says no more of himself than that.

**The Grate:**
The entrance is a hidden egress point. The mechanism is disguised as a water drain but reveals a well-maintained stone staircase once the magic is dispelled. The stair carries no trap and no other magic.

### Unsealing the Entrance

Eamon steps forward, his fingers weaving through the air. The sound of his voice echoes faintly off the stone walls as a shimmer of blue energy ripples across the sealed grate. A moment later, a sharp, metallic click reverberates through the air. Behind him, Astrid’s remaining loyal soldiers stand at attention, their faces etched with grief and resolve.

The warded seal fades, leaving the grate unprotected. Eamon glances at the party, his expression tense. "It’s done. But be warned: the Cowl likely felt the seal break. They know we're coming."

## Transitions

- To [[encounter:into-the-catacombs]] when the party descends the stairs into the darkness.
