---
moduleOrder: 4
sceneTitle: "Path Through The Dark Forest"
sectionTitle: "Journey to the Standing Stones"
id: "meeting-at-the-stones"
type: "encounter"
title: "Meeting at the Stones"
settingId: "realm-of-myr"
location: "old-standing-stones"
adventureId: "the-midnight-summons"
npcs:
  - id: "wollandora"
    behavior: "Concerned about the missing relics, focused on getting Thalbern to investigate in the city."
    initialInitiative: 1
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-midnight-summons/meeting-at-the-stones.png"
---

## Intro

{place: stones} The ancient Standing Stones rise around Thalbern, and moonlight silvers the clearing.

{speaker: wollandora, to: thalbern, delivery: soft} Thalbern. The forest is grateful you are here.

{actor: wollandora, target: thalbern} The elf's silver hair glistens, and her deep green eyes are wise and kind, but troubled.

## GM Notes

Wollandora explains the situation once. She says: "Thalbern, we have a problem. Word has come from friends in Faelendar, Eldoria, Sylvandor, and Oakhaven. Valkaran relics have gone missing from the elves' vaults. Items that should never leave these woods." She nods toward the river, where the current glides past the standing stones. "I saw a river boat, Valkaran-made, heading downstream to Kordavos. You must go to the city and find these relics before they disappear forever."

Once she has said this she does not say it again. After that she only urges Thalbern to act, in a line or two.

Wollandora should NOT offer any transportation, boats, or assistance beyond information. If Thalbern asks for more about the relics, the boat, or Kordavos, transition to 'the-missing-relics'. When he accepts or declines the mission, transition to 'preparing-for-the-city' or 'back-home'.

Legacy runtime flag: skipInitialNpcTurns was true.

## Transitions

- To [[encounter:preparing-for-the-city]] when If Thalbern accepts the mission
- To [[encounter:back-home]] when If Thalbern refuses the mission
- To [[encounter:the-missing-relics]] when If Thalbern asks for more information

## Migration Context

Legacy section: Journey to the Standing Stones

Legacy scene: Path Through The Dark Forest
