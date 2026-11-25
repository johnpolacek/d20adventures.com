---
moduleOrder: 5
sceneTitle: "Path Through The Dark Forest"
sectionTitle: "Journey to the Standing Stones"
id: "meeting-at-the-stones"
type: "encounter"
title: "Meeting at the Stones"
settingId: "realm-of-myr"
location: "old-standing-stones"
adventureId: "the-midnight-summons"
landmark: "valkarr-woods/standing-stones"
npcs:
  - id: "wollandora"
    side: "party"
    behavior: "Concerned about the missing relics, focused on getting Thalbern to investigate in the city."
    initialInitiative: 1
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-midnight-summons/meeting-at-the-stones.png"
---

## Intro

{place: stones} Moonlight silvers the ancient Standing Stones.

{speaker: wollandora, to: thalbern, delivery: soft} Thalbern. The forest is grateful you are here.

{actor: wollandora, target: thalbern} The elf's green eyes are kind, but troubled.

## GM Notes

Wollandora explains the situation once. She says: "Thalbern, we have a problem. Word has come from friends in Faelendar, Eldoria, Sylvandor, and Oakhaven. Valkaran relics have gone missing from the elves' vaults. Items that should never leave these woods." She nods toward the river, where the current glides past the standing stones. "I saw a river boat, Valkaran-made, heading downstream to Kordavos. Elves of Faelendar stood on its deck, and they were no one's prisoners. Boats that would not be seen tie up at the old smugglers' pier on the quiet fork, three miles above the city, and wait there for their buyers. Watch that pier. Learn who buys, and find these relics before they disappear forever."

Once she has said this she does not say it again. After that she asks him once whether he will go, and then waits for his answer. She does not ask again.

If Thalbern asks about the relics, the boat, or Kordavos, Wollandora answers him right here, in a few lines, and tells each thing once. The relics are ancient Valkaran artifacts, deeply connected to the history and spirit of the Valkarr Forest. They could hold forgotten lore or secret untapped powers. Among them are a great seat of carved stone, too heavy for one man to lift, and a small key older than the Empire. The elves have kept them safe for centuries, to maintain the balance of the forest. She can allude to the rise of powerful figures in the human city who have little respect for the old ways or the forest. Somehow the elves have been drawn into the tangled politics and the relics have been stolen. She fears some of her own kin in Faelendar are selling them, and she does not know who. If he has not yet given his answer, she then waits for it.

Wollandora should NOT offer any transportation, boats, or assistance beyond information.

Legacy runtime flag: skipInitialNpcTurns was true.

## Transitions

- To [[encounter:preparing-for-the-city]] when If Thalbern accepts the mission
- To [[encounter:back-home]] when If Thalbern refuses the mission

## Migration Context

Legacy section: Journey to the Standing Stones

Legacy scene: Path Through The Dark Forest
