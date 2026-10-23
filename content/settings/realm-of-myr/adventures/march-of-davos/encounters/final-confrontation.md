---
moduleOrder: 46
sceneTitle: "The Inner Sanctum"
sectionTitle: "The Covenant of The Cowl"
id: "final-confrontation"
type: "encounter"
title: "Final Confrontation"
settingId: "realm-of-myr"
adventureId: "march-of-davos"
npcs:
  - id: "joran-antonov"
    behavior: "Defiant and certain, the Key of Ilmarin in hand. Accuses Astrid of his father's murder and urges the party to join the Covenant. Fights only if attacked."
  - id: "astrid-blackthorn"
    behavior: "Shocked, then cold. Demands the Key and urges the party to stand with House Blackthorn. Fights Joran if he moves against her."
    startNear: "party"
  - id: "eamon"
    behavior: "Stays near Astrid, wary of the Key's power. Speaks little and fights only if a fight breaks out."
    startNear: "party"
image: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726970504298"
---

## Intro

{actor: joran-antonov} From the darkness behind the great altar, a figure steps into the party’s torchlight. He wears the robes of the Covenant, the hood thrown back.

{speaker: astrid-blackthorn, to: joran-antonov, delivery: gasping} Joran?

{actor: astrid-blackthorn} Her sword dips in shock.

{actor: joran-antonov, object: key} Joran Antonov stands tall, the missing Key of Ilmarin in his grasp, and eyes the adventurers with defiance and hope.

{speaker: joran-antonov, to: astrid-blackthorn} It ends today, Astrid. The Blackthorns have stolen enough from this land. My father died for this truth, and I will see it restored.

## GM Notes

The players must now choose between Joran's revolutionary cause, Astrid's imperial stability, or a neutral path mediated by the Church. Their choice will determine the aftermath of the adventure as outlined in the adventure summary.

Let the confrontation play out. Joran makes his case: his father Mikhail found the truth of the Drakovan crimes and was killed for it, and the Key belongs to Valkara, not to an Asterian house. Astrid makes hers: the Covenant murdered her brother tonight, and only the Margrave's order keeps the March from civil war. Either may offer the party a place at their side. If asked how he came by the Key, Joran tells it: he rode with Silverhand's crew as Lev and took the Key from the Blackthorn shipment on the quay. Neither backs down on their own, and if steel is drawn they fight each other as much as the party.

The scene ends when the adventurers make their choice plain, by word or by deed: helping Joran keep the Key, taking it from him for Astrid, or putting it beyond both of them.

## Transitions

- To [[encounter:the-new-dawn]] when the adventurers side with Joran and the Covenant, letting him keep the Key of Ilmarin or standing with him against House Blackthorn.
- To [[encounter:vengeance-of-the-blackthorn]] when the adventurers side with Astrid and House Blackthorn, taking the Key from Joran or defeating him.
- To [[encounter:the-dust-settles]] when the adventurers refuse both sides and give the Key to the Church of Valkara or put it out of either faction's reach.