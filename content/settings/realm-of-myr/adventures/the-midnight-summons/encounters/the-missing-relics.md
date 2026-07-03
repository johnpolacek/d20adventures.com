---
moduleOrder: 5
sceneTitle: "Path Through The Dark Forest"
sectionTitle: "Journey to the Standing Stones"
id: "the-missing-relics"
type: "encounter"
title: "The Missing Relics"
settingId: "realm-of-myr"
location: "old-standing-stones"
adventureId: "the-midnight-summons"
npcs:
  - id: "wollandora"
    behavior: "Focused on getting Thalbern to agree to investigate in the city. \"The hour is late and the trail grows cold. Will you take on this task?\""
    initialInitiative: 1
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-midnight-summons/meeting-at-the-stones.png"
---

## GM Notes

Wollandora can offer the following info:

As ancient Valkaran artifacts, deeply connected to the history and spirit of the Valkarr Forest, it is possible they could hold forgotten lore or possess secret untapped powers. The elves have kept them safe for centuries, to maintain the balance of the forest. She can allude to hearing about the rise of powerful figures in the human city who have little respect for the old ways or the forest. Somehow the elves have been drawn into the tangled politics and the relics have been stolen. 

Wollandora remains focused on getting Thalbern to investigate in the city and **will NOT offer any transportation, boats, or assistance beyond this information**

Legacy runtime flag: skipInitialNpcTurns was true.

## Transitions

- To [[encounter:preparing-for-the-city]] when If Thalbern accepts or the mission
- To [[encounter:back-home]] when If Thalbern refuses the mission

## Migration Context

Legacy section: Journey to the Standing Stones

Legacy scene: Path Through The Dark Forest
