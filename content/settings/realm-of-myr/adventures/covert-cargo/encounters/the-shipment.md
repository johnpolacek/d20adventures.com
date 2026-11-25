---
moduleOrder: 1
sceneTitle: "Quiet Pier at Dawn"
sectionTitle: "Section One"
id: "the-shipment"
type: "encounter"
title: "The Shipment"
settingId: "realm-of-myr"
adventureId: "covert-cargo"
landmark: "valkarr-woods/forest-pier"
npcs:
  - id: "npcs-1749163978757"
    behavior: "Determined to complete the mission to secure the artifact."
    side: "none"
    initialInitiative: 0
  - id: "npcs-1749181492795"
    behavior: "Silas is the brains of the mission and is tasked to make sure everything goes as planned."
    side: "none"
    initialInitiative: 0
  - id: "npcs-1749184389465"
    behavior: "Eager to have the shipment verified"
    side: "none"
    initialInitiative: 0
image: "https://d1dkwd3w4hheqw.cloudfront.net/images/settings/realm-of-myr/covert-cargo/encounters/the-shipment/dccea2c5-b22d-41e0-9467-95d8ea2301d5.png?t=1749244761507"
---

## Intro

A river boat bound for Kordavos lies moored at a hidden pier on the Mordava.

{actor: 1749159962941, private: true} Lyra stands before the crate. Her task: confirm by magic that the Valkaran artifact is genuine, then nod. She is paid well, and better for her silence.

{actor: 1749159962941, private: true} She came to see Faelendarian elves and a Valkaran relic firsthand.

{actor: 1749159962941, private: true} She barely knows her escorts. Reinhard, big and gruff, runs security. Silas, slender and quiet, recruited her at the Grand Library.

{actor: 1749307435667, private: true} Poppen Quickfoot hides in the brush above the bank. Weeks of rumors led him here. This could be the score that makes his name.

{actor: 1749307435667, private: true} He watched three board: a hulking soldier, a robed woman, a whispering shadow. A professional crew, guarding something worth stealing.

{actor: thalbern, private: true} Below the stern, Thalbern kneels in a thicket, longbow across his knee. The druid Wollandora sent him after relics stolen from the elven vaults, and this boat carries them. No one has seen him.

{actor: Aelar Moonglimmer} The cabin door opens. A tall elf in dark clothes steps out. A second elf, a spearman, watches from the stern.

{actor: Aelar Moonglimmer, target: Silas} The elf steps to the crate.

{speaker: Aelar Moonglimmer, to: Silas, delivery: low and clear} You have the arrangement?

{actor: Silas, target: Aelar Moonglimmer} Silas glides from the shadows by the door.

{speaker: Silas, to: Aelar Moonglimmer} I have it here, Aelar.

{actor: Silas, object: scrollcase} He draws a scrollcase sealed in black wax with the Blackthorn thorn.

{speaker: Aelar Moonglimmer, to: Silas} Very well.

{speaker: Aelar Moonglimmer, to: Silas} The shipment is ready for your specialist's inspection.

{actor: Reinhard, target: 1749159962941} Reinhard nods at Lyra.

{speaker: Reinhard, to: 1749159962941, delivery: eager} Ok, let's get on with it then.

The crate stays shut. Lyra must judge it by magic alone.

## GM Notes

If Lyra asks questions or stalls in any way, Reinhard and Silas will be impatient and urge her to do what she was paid for. If Lyra tries to engage Aelar in conversation he will be evasive. If she continues to delay, then Silas will nod at Reinhard who will draw his mace and threaten her. Reinhard draws only on that nod, never on his own.

Whatever Lyra says of the crate is her verdict, true or not. Inside the sealed crate is the relic, a large, heavy sitting stone of about 500 pounds, carved by the Valkarans. No one lifts it out or holds it up here: the crate stays shut. A nod to Silas is a verdict too: it is the signal he asked for, and it means the relic is genuine. No check stands between her words and the scene that follows: if she says it holds no magic, it is The Fake, and Silas weighs her word there.

If Lyra successfully casts a spell on the crate to detect magic, she will be detect an ancient potent enchantment on an object within the crate. On a highly successful roll of 18 or higher, she will determine its purpose to be related to concepts of binding promises, loyalty, and solemn vows. On a 20, she will be able to name the item as the Verodynian Oath Stone of the First Clans.

Lyra's fee is to be paid in Kordavos once the job is done. If she asks after it, Silas puts her off until then.

Silas pays only on Lyra's word. Until she gives her verdict the scrollcase stays in his hands and the elves stay aboard. Once she gives it, true or false, the scene ends on her word. For the rest of the round Silas, Reinhard and Aelar only take it in: no one pays, argues, draws or leaves. What they do about it is told in the next scene, so do not tell it here.

Aelar's sentry, the spearman, keeps watch on deck from the stern. He is the one who may spot a watcher on the bank or at the rail, and if he does he turns his spear on him and calls a warning in Elvish. A watcher who creeps closer or comes aboard unseen stays unseen until he acts in the open or someone passes a check to spot him. A noise the sentries hear and turn toward is a disturbance, as much as a watcher seen.

Poppen and Thalbern hide in different places and do not know of each other. Poppen is in the bushes at the treeline above the gangway. Thalbern is in a thicket on the bank below the stern. While one stays hidden, the other learns of him only by passing a check. Ask for a Perception check, DC 15, when one of them searches or watches the bank or the woods, or looks for where a voice or a noise came from. With no check or a failed one, he notices nothing of the other, and the narration shows nothing passing between them. A passed check shows a stranger with no name: a shape in the leaves, a bow, a small figure. One who shows himself is hidden no more, as when he shoots, shouts, steps onto the pier or the boat, or stands in the lamplight: the other sees him plainly with no check, still a stranger with no name until they speak.

Aelar and his guard are here only to trade the crate. A quarrel inside Silas's crew is none of theirs: they step back with hands near their weapons, wait to be paid, and strike only if struck. Once Silas hands over the payment they leave the boat, go up the bank trail into the woods and do not come back. They take no side in anything that happens after.

Silas and Reinhard serve the Blackthorn family of Kordavos, who are buying the relic in secret. Aelar and his guard are of the Circle, a faction of the elven settlement of Faelendar. The scrollcase is the payment.

Legacy runtime flag: skipInitialNpcTurns was true.

## Transitions

- To [[encounter:the-transaction]] when If Lyra verbally confirms the magic properties of the shipment
- To [[encounter:the-fake]] when Lyra says the shipment is fake or has no magical properties, whether or not it is true. Take this at once: Silas weighs her word in The Fake, not here.
- To [[encounter:the-disturbance]] when Poppen or Thalbern causes a distraction, anyone aboard notices either of them, or a sentry hears a noise from the bank and turns toward it, or Lyra attacks Silas, Reinhard or the elves

## Migration Context

Legacy section: Section One

Legacy scene: Quiet Pier at Dawn
