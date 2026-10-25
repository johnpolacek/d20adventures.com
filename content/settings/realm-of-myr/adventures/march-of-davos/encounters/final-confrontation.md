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
    behavior: "Defiant and certain, the Key of Ilmarin in hand. Accuses Astrid of his father's murder and urges the party to join the Covenant. Never sets down or hands over the Key, whatever a talking roll gives, except to the Church as the notes allow. Fights only if attacked, with a roll."
  - id: "astrid-blackthorn"
    behavior: "Shocked, then cold. Knows she killed Mikhail on Thaddeus's order and does not deny it. Demands the Key and urges the party to stand with House Blackthorn. If the party sides with Joran, attacks him for the Key with her sword, with a roll each turn."
    startNear: "party"
  - id: "eamon"
    behavior: "Stays near Astrid, wary of the Key's power. Speaks little. If the party sides with Joran, fights at Astrid's side with a roll each turn: Hold Person on Joran, then Magic Missile at whoever guards him."
    startNear: "party"
image: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726970504298"
---

## Intro

{actor: joran-antonov} From the alcove behind the great altar, a figure steps into the party’s torchlight. He wears the robes of the Covenant, the hood thrown back.

{speaker: astrid-blackthorn, to: joran-antonov, delivery: gasping} Joran?

{actor: astrid-blackthorn} Her sword dips in shock.

{actor: joran-antonov, object: key} Joran Antonov stands tall, the missing Key of Ilmarin in his grasp, and eyes the adventurers with defiance and hope.

{speaker: joran-antonov, to: astrid-blackthorn} I am the Champion of the Covenant of the Cowl. We answer to Seraphina Valtor and the old clans, and tonight we answered Thaddeus.

{speaker: joran-antonov, to: astrid-blackthorn} It ends today, Astrid. The Blackthorns have stolen enough from this land. My father died for this truth, and I will see it restored.

## GM Notes

The players must now choose between Joran's revolutionary cause, Astrid's imperial stability, or a neutral path mediated by the Church. Their choice will determine the aftermath of the adventure as outlined in the adventure summary.

**The truth Joran tells.** The Covenant of the Cowl is the hidden hand of the Valtor clan, and Seraphina Valtor leads it. Joran is its Champion. He said so in the intro and says it again plainly if asked.

**Mikhail's death.** Thaddeus ordered Mikhail Antonov killed, and Astrid did it with her own hand. Joran says so outright in his first turn. Astrid knows it is true and never denies it. Pressed, she answers coldly that she did what her house required. If the party carries Mikhail's journal from her quarters, it proves this, and shows she hid it even from Thaddeus. Joran knows the journal on sight and wants it back.

Let the confrontation play out. Joran makes his case: his father Mikhail found the truth of the Drakovan crimes and was killed for it, and the Key belongs to Valkara, not to an Asterian house. The Key of Ilmarin seals or opens any door, lock or ward its bearer touches it to and wills, and nothing else: it is no weapon. It answers to any bearer, Valkaran or Asterian, and no one in this scene says otherwise. Drakovan was House Blackthorn's name before it courted the Asterians, and under it the house took Valkaran lands by forgery, blackmail and murder. Astrid makes hers: the Covenant murdered her brother tonight, and only the Margrave's order keeps the March from civil war. Either may offer the party a place at their side. If asked what the Covenant will do with the Key, Joran says Seraphina means to restore the old clans' council in Kordavos. No watch or help comes this deep, whatever is called for.

**Holding the Key.** No Persuasion or Intimidation roll makes Joran give up the Key. A good roll wins a pause or an answer. The Key leaves his hand only by force, with a roll, or in one way by his consent: if the party swears to put it in the Church of Valkara's keeping and gives him Mikhail's journal or swears the Church will hear his father's proof, he lays it on the altar for the Wayfinders. Once steel is drawn, Astrid is not talked down. A good roll makes her pause, never yield. If asked how he came by the Key, Joran tells it: he rode with Silverhand's crew as Lev and took the Key from the Blackthorn shipment on the quay. Neither backs down on their own, and if steel is drawn they fight each other as much as the party.

**Siding with Joran.** Astrid does not walk away. She and Eamon try to take the Key by force. Play a short fight with rolls, a round or two: Astrid attacks with her sword, Eamon casts Hold Person on Joran and Magic Missile at his guards. Hold Person and every blow lands only on a roll, never in narration alone. It ends when Astrid is beaten down or she and Eamon are driven off up the tunnel, and the Key stays with Joran. If Joran or the hero holding the Key gets through the archway into the tunnel, they do not follow, and the fight is over.

**Keeping the Key.** If the heroes take the Key for themselves, for neither house nor the Church, Astrid demands it once. If they still refuse, she and Eamon try to take it by force, as in the fight above, until they hold it or are beaten down or driven off. The fight lasts at most three rounds. If the heroes still hold the Key at the end of the third, or its holder gets through the archway into the tunnel, Astrid breaks off with a threat. Joran never grabs or fights for it. He asks them once to swear it goes to the Church, then lets it go. If the heroes walk out with it, the ending is The Dust Settles.

**If the party falls.** Heroes can die here. If every hero is dead, they stay dead and no one revives them. The fight goes on without them until one side stands alone, and the Key goes to whoever is left standing: Joran, or Astrid and Eamon.

If the heroes split, the ending follows the side of whoever holds the Key when the fight or the talk is over.

The scene ends when the adventurers make their choice plain, by word or by deed: helping Joran keep the Key, taking it from him for Astrid, or putting it beyond both of them.

## Transitions

- To [[encounter:the-new-dawn]] when the adventurers side with Joran and the Covenant, Astrid's attempt to take the Key by force has failed, and Joran or a hero standing with him holds the Key, or when every hero is dead and Joran is left standing with the Key.
- To [[encounter:vengeance-of-the-blackthorn]] when the adventurers side with Astrid and House Blackthorn, taking the Key from Joran or defeating him, or when Astrid or Eamon takes the Key from heroes who kept it, or when every hero is dead and Astrid or Eamon is left standing with the Key.
- To [[encounter:the-dust-settles]] when the adventurers refuse both sides and give the Key to the Church of Valkara or put it out of either faction's reach.
