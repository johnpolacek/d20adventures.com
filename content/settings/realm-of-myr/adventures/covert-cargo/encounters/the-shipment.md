---
moduleOrder: 1
sceneTitle: "Quiet Pier at Dawn"
sectionTitle: "Section One"
id: "the-shipment"
type: "encounter"
title: "The Shipment"
settingId: "realm-of-myr"
adventureId: "covert-cargo"
npcs:
  - id: "npcs-1749163978757"
    behavior: "Determined to complete the mission to secure the artifact."
    initialInitiative: 0
  - id: "npcs-1749181492795"
    behavior: "Silas is the brains of the mission and is tasked to make sure everything goes as planned."
    initialInitiative: 0
  - id: "npcs-1749184389465"
    behavior: "Eager to have the shipment verified"
    initialInitiative: 0
image: "https://d1dkwd3w4hheqw.cloudfront.net/images/settings/realm-of-myr/covert-cargo/encounters/the-shipment/dccea2c5-b22d-41e0-9467-95d8ea2301d5.png?t=1749244761507"
---

## Intro

A river boat bound for Kordavos lies moored at a discreet pier on a quiet fork of the Mordava River, still on the dark water.

The air is cool and damp and smells of wet earth. Crickets chirp, water laps at the pier's old pylons, and wind stirs the bare willows.

{actor: 1749159962941, private: true} Lyra stands aboard with the cargo crate before her. Silas's instructions are explicit: use her arcane talents to confirm the Valkaran artifact is genuine, give a simple nod, and her part is done. She will be paid well for her expertise and better for her discretion.

{actor: 1749159962941, private: true} She could not resist the chance to meet reclusive Faelendarian elves and stand near a Valkaran relic. She has studied both at length, but old tomes are not the real thing.

{actor: 1749159962941, private: true} She knows little of her two escorts. Reinhard, large and gruff, runs security for the job. Silas recruited her after noticing her visits to the Old Valkaran Archives at the Grand Library. Where Reinhard is a stone wall, Silas is a whisper, slender and moving with a grace learned in shadows.

{actor: 1749307435667, private: true} From a tangle of undergrowth at the treeline above the bank, Poppen Quickfoot watches, perfectly still, damp leaves brushing his cheek. Weeks of stakeouts and rumors of a clandestine trade have led him to this predawn hour on this quiet fork. His instinct says this is the score that will make his name in Kordavos.

{actor: 1749307435667, private: true} His keen hazel eyes followed the three figures down the pier and aboard, and now track their shapes past the lit windows: the hulking soldier, the robed woman and the whispering shadow-man. A professional crew, not sloppy thugs. Whatever they guard matters, and Poppen thinks not only of fencing it but of the connections such a coup would bring.

{actor: thalbern, private: true} Neither knows of the third watcher. Farther down the bank, in a thicket below the boat's stern, Thalbern kneels with his longbow across his knee, still as the roots around him. The druid Wollandora sent him after relics taken from the elven vaults of the Valkarr woods, and after the Valkaran-made riverboat she saw carrying them toward Kordavos. He has followed the Mordava down from the Standing Stones through the trees, and here is the boat, moored where no honest boat would stop, lamps lit, strangers aboard. No one has seen him, and he has seen no one else on the bank. Whatever the boat carries is about to change hands.

{actor: Aelar Moonglimmer} Wood creaks as the cabin door opens. A tall, lithe elf in dark leather armor steps out with silent, deliberate grace. Two more elves with bows keep watch on deck, one near the bow and one by the stern.

{actor: Aelar Moonglimmer, target: Silas} The lead elf steps to the crate and looks to Lyra's escorts. His voice is low and clear.

{speaker: Aelar Moonglimmer, to: Silas, delivery: low and clear} You have the arrangement?

{actor: Silas, target: Aelar Moonglimmer} Silas glides from the shadows by the door.

{speaker: Silas, to: Aelar Moonglimmer} I have it here, Aelar.

{actor: Silas, object: scroll} He draws a heavy scrollcase from its oilskin wrapping. Black wax seals its cap, pressed with the thorned branch of the Blackthorn family.

{speaker: Aelar Moonglimmer, to: Silas} Very well.

{actor: Aelar Moonglimmer} Aelar gives an order in Elvish to one of his crew.

{speaker: Aelar Moonglimmer, to: Silas} The shipment is ready for your specialist's inspection.

{actor: Reinhard, target: 1749159962941} Reinhard nods at Lyra, eager to have the matter done.

{speaker: Reinhard, to: 1749159962941, delivery: eager} Ok, let's get on with it then.

The crate stays closed. No one may see inside, so Lyra must judge it by magecraft alone.

## GM Notes

If Lyra asks questions or stalls in any way, Reinhard and Silas will be impatient and urge her to do what she was paid for. If Lyra tries to engage Aelar in conversation he will be evasive. If she continues to delay, then Silas will nod at Reinhard who will draw his sword and threaten her.

If Lyra successfully casts a spell on the crate to detect magic, she will be detect an ancient potent enchantment on an object within the crate. On a highly successful roll of 18 or higher, she will determine its purpose to be related to concepts of binding promises, loyalty, and solemn vows. On a 20, she will be able to name the item as the Verodynian Oath Stone of the First Clans.

Poppen and Thalbern hide in different places and do not know of each other. Poppen is in the bushes at the treeline above the gangway. Thalbern is in a thicket on the bank below the stern. Each learns of the other only by passing a check. Ask for a Perception check, DC 15, when one of them searches or watches the bank or the woods, or looks for where an arrow, a voice or a noise came from. Use DC 10 once the other has acted in the open, with a shot, a shout or a step onto the pier. With no check or a failed one, he notices nothing of the other, and the narration shows nothing passing between them. A passed check shows a stranger with no name: a shape in the leaves, a bow, a small figure.

Aelar and his elves are here only to trade the crate. Once Silas hands over the payment they leave the boat, go up the bank trail into the woods and do not come back. They take no side in anything that happens after.

Silas and Reinhard serve the Blackthorn family of Kordavos, who are buying the relic in secret. Aelar and his elves are of the Circle, a faction of the elven settlement of Faelendar. The scrollcase is the payment.

Legacy runtime flag: skipInitialNpcTurns was true.

## Transitions

- To [[encounter:the-transaction]] when If Lyra verbally confirms the magic properties of the shipment
- To [[encounter:the-fake]] when If Lyra says the shipment has no magical properties
- To [[encounter:the-disturbance]] when If Poppen or Thalbern causes a distraction or anyone aboard notices either of them

## Migration Context

Legacy section: Section One

Legacy scene: Quiet Pier at Dawn
