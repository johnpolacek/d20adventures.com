---
moduleOrder: 2
sceneTitle: "Path Through The Dark Forest"
sectionTitle: "Journey to the Standing Stones"
id: "the-owlbear-prowls"
type: "encounter"
title: "The Owlbear Prowls"
settingId: "realm-of-myr"
location: "valkarr-forest"
adventureId: "the-midnight-summons"
landmark: "valkarr-woods/tree-line"
npcs:
  - id: "owlbear"
    behavior: "Has not noticed Thalbern. Prowls the trail sniffing for what it heard, and moves on into the woods if nothing gives him away. If it finds him or is attacked, it attacks and fights until heavily wounded or driven off."
    initialInitiative: 0
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-midnight-summons/owlbear-confrontation.png"
---

## Intro

{place: treeLine} Eyes shine in the shadows of the tree line, where the sound came from.

{actor: owlbear, from: treeLine, pace: walk} A hulking monster shoulders out of the undergrowth, fifteen feet tall, with the body of a giant bear and the head of an owl. It comes on at an unhurried pace.

{actor: owlbear} It stops on the trail, lifts its great beaked head and tastes the air.

{actor: thalbern} Thalbern holds still where he has hidden, close enough to hear it breathe.

## GM Notes

The Owlbear does not know Thalbern is there. If he stays still or waits, it sniffs about the trail and then moves off into the woods. Moving off past it without being noticed is a medium Stealth check, DC 15. If he shows himself, a hard Animal Handling check, DC 20, calms it and it wanders away.

If he attacks it, calls out, or fails a check, the Owlbear finds him and attacks. The fight happens here, in this encounter. If he defeats it or drives it off, say in a sentence how the fight ends. If he falls to 0 hit points, Wollandora appears and drives off the Owlbear.

## Transitions

- To [[encounter:meeting-at-the-stones]] when the Owlbear moves on without finding Thalbern, he slips past it with a successful Stealth check, he calms it with a successful Animal Handling check, or he defeats it or drives it off.
- To [[encounter:timely-rescue]] when Thalbern falls to 0 hit points: Wollandora appears and drives off the Owlbear.
