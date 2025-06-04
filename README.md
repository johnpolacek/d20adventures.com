# d20adventures.com

A new narrative-driven RPG platform that blends play-by-post gameplay and real-time updates facilitated by an AI Game Master.

--

### Work in Progress

Doing test play throughs and tweaking the prompts:

- 1: `/realm-of-myr/the-midnight-summons/jh74yx5mqjw0f9tbfh6q24nr5d7h4npr/1` (gemini-2.0-flash-lite)
- 2: `/realm-of-myr/the-midnight-summons/jh7da623rz0wd328p8pnkcpgz57h4j6q/1` (gemini-2.0-flash-lite)
- 3: `/realm-of-myr/the-midnight-summons/jh7b2xsg8w0jcsyvzxqjzpkpf57h5cch/1` (gemini-2.5-flash-preview-05-20)


#### Test Responses

Response 1 (test rewrite)
Try to figure out what it is and draw my bow

Response 2 (better response, should not be overwritten, prompt animal handling roll)
“Easy there big guy,” says Thalbern, trying to keep his voice steady. “I have no quarrel with you. Why don’t you just move alone”

Using the skills he had learned from the elves as a youth, the ranger used his body and voice to calm the wild beast and direct him to move onward.

Response 3 (if forced to attack)

“Violence it is then!” the ranger exclaims as he draws his sword and attacks the wild beast.

Reponse 4 (unclear action, attack or intimidation)

“Begone wild beast!” the ranger shouted through gritted teeth, hoping to drive the thing away into the woods as he brandished his blade in defense.

Responses (brief should be rewritten)

attack more aggressively now

try a different tactic in attacking

##### Alt Path, avoiding Owlbear

Response 2
Thalbern bows slightly in deference to the druid, then straightens. "Wollandora. It is great to see you again old friend," he replies. "Now please tell me what urgent matter caused you to summon me out here at this late hour. I had a near miss encounter on the way here with an owlbear, you should know."

Response 3
Try to hide and let it pass

Response 4
“This is troubling indeed,” says Thalbern, his brow furrowing as he considers the implications. “Is there anything else you can tell me about who might be behind this?”


---

### Overview

The prototype for D20 Adventures is a proof of concept for a turn based narrative driven RPG platform where players work their way through an adventure module run by an AI game master.

Each turn begins with an introduction and a character response order randomly determined by a D20 initiative roll. When it is the player’s turn, they can reply to update the narrative of the adventure with their character’s actions and dialogue. 

If it is determined that a dice role is needed, the player can roll their D20 and the result will determine the direction of the story.

The AI is trained to choose an appopriate dice roll check and the target for success, then will update the narrative based on the roll result and the instructions for the encounter in the adventure module.

At the end of each turn, the AI decides whether to move to a new encounter or continue with the current scenario.

Each encounter has its own image, intro, title, NPCs and instructions for the AI Game Master.

If the player enters well written prose, it will be preserved as as, otherwise it will be enhanced to fit the story’s narrative, cleaning up spelling and grammar while preserving the intent of the original response.

Similarly each NPC will have an opportunity to respond and make dice rolls, all coordinated against an overall adventure plan linking one encounter to another.

This initial D20 Adventures prototype is a simple one shot single player character adventure inspired by Deborah Ann Woll’s appearance on the Real Ones with Jon Bernthal podcast where she spontaneously invented an adventure scenario to demonstrate the fun of D and D gameplay.

The simple confrontation she concocted between a ranger and an owlbear in the forest at night could also be a good test of whether a game can be led by an AI game master and actually be fun.

When you are working with AI, it is best to avoid lots of complicated game mechanics, so I tried to keep it simple. Just roll a D20. If you roll high, good things happen. Roll low, not so much.

We keep track of the characters turn over turn, including adjusting status and health percentage.

With a name like D20 Adventures, of course we have to pay special attention to natural twenties and ones. Hopefully more twenties for the players but sometimes that's not how it goes.

Hopefully Jon Bernthal and Deborah Ann Woll don't object to my homage! 

In the future, I want to build true multiplayer, where you can form a group of friends and play through an adventure together. 

Eventually I would like to allow anyone create their own settings and adventure modules for a community of players to discover.

D20 Adventures is a fun project for me to see if I can create a cool new multiplayer narrative rpg experience with AI. 

Head over to D20 Adventures.com to join the discord, sign up for the wait list or find the source code on Github.

You can also follow me on X, Bluesky and Medium for project updates.

