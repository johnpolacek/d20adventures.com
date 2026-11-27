---
moduleOrder: 22
sceneTitle: "The Auction"
sectionTitle: "The Black Market"
id: "the-winning-bid"
type: "encounter"
title: "The Winning Bid"
settingId: "realm-of-myr"
adventureId: "welcome-to-kordavos"
landmark: "kordavos/auction-hall"
roundBudget: 2
npcs:
  - id: "silverhand-representative"
    silent: true
    behavior: "Leaves at once with the map case by the side exit, without a word."
  - id: "silverhand"
    silent: true
    behavior: "Follows his representative out with his two silent guards, alert for anyone on his trail."
    limits:
      - "Never holds the map case."
  - id: "auctioneer"
    behavior: "Closes the sale and ends the night's auction. The map was the last lot. Pays the departing buyers no mind."
image: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726458036467"
---

## Intro

{actor: auctioneer} The gavel falls with a sharp crack.

{speaker: auctioneer, delivery: enthusiasm faltering} Sold! To the gentleman in black!

{actor: auctioneer, object: map} The auctioneer hands over the case holding the ancient map.

{actor: silverhand-representative, object: map} Silverhand’s representative takes it and slips toward the side exit.

{actor: silverhand} Silverhand rises, pulls his hood low, and follows with his two silent guards toward the Lower Districts.

## GM Notes

The representative carries the map case the whole way. Silverhand never holds it. The lectern is empty once the gavel falls. A hero who rushes the stage finds nothing to take, and the six house guards level their crossbows until they step down.

If the heroes caused a scene during the bidding, Silverhand lets it pass. He glances once at them on his way out and says nothing.

This is the moment for the players to decide how to follow. If they move too quickly, they might be spotted; if they wait too long, they'll lose the trail in the winding alleys. The focus should be on the map, which is the key to the next phase of their journey.

The auctioneer names no buyers and gives no addresses. If the party lingers, questions the room or turns for the inn, they step out at the end of the second round to see Silverhand's party just turning down a lane ahead, and the trail is still there to take.

## Transitions

- To [[encounter:shadowing-silverhand]] when the players choose to follow Silverhand and his entourage out of the auction house, or the second round has ended.

## Migration Context

Legacy section: The Black Market

Legacy scene: The Auction
