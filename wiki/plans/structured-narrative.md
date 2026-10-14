# Structured narrative

[Plans](index.md) · [GM core](../gm-core.md) · [Stage engine](../stage-engine.md) · [Concise narration](concise-narration.md)

Status: started 2026-10-14. The GM writes beats and every store keeps them. The Midnight Summons first, on the desktop app.

## Owner direction, 2026-10-14

After two fixes to the stage's speaker guessing: "Maybe we need to have more structured data around dialogue." Offered speakers only, turn markers, or a full structure. The owner chose the full structure: "we only have test data right now. it is easy now to throw everything away and do it right from the start". Then camera data, spell effects and objects in 3D, all in one go, "focused on Midnight Summons first".

## The idea

A turn is a script, not a page of prose. The GM writes each beat with a label saying what kind it is and whose it is. Screens turn the script back into prose, speech bubbles, camera moves, effects or voices. Nothing is guessed from the wording.

```
action  Thalbern, at Wollandora: "Thalbern meets Wollandora's gaze."
line    Thalbern, to Wollandora, quietly: "Tell me all of it."
```

## Today

- A turn holds one `narrative` string. Paragraphs join with blank lines. Dice rolls and the player's own words ride in it as `[DiceRoll:…]` and `[OriginalReply:…]` markers.
- Nine GM steps append to it: the intro, the reply rewrite, an AI hero's turn, a roll outcome, an NPC's action, an NPC's roll outcome, a skip or flight, and the round end, with the next intro on a change of encounter.
- Two readers guess the speakers. The desktop stage reads names, pronouns and speech tags (`packages/stage/src/narration.ts`). The website's Storyview pays an AI call per paragraph (`lib/ai/narration-attribution.ts`).
- The stage also guesses the camera from the words, and ties entrances and exits to phrases the text must contain.
- The stage has no effects or objects at runtime. Characters are painted cards that walk, turn and fall.

## The beat

A turn's `story` is a list of beats. Every beat records which step wrote it, and for whom.

| Kind | Fields | Read by |
|---|---|---|
| `narration` | text, place | Text views, the camera, the narrator's voice |
| `action` | text, actor, target, move, effect, object | Text views, the camera, walks, effects, objects |
| `line` | spoken words only, speaker, listener, delivery | Bubbles and plates, the camera, voices |
| `roll` | character, check, the die, modifier, total, DC, success | The dice card |
| `reply` | the player's own words, character | The journal, the website's reply toggle |

- `place` is a named place on the set, such as `clearing` or `stones`.
- `move` walks the actor to a place or a person, at a walk, a hurry or a sneak. `from` brings them on from a place off stage.
- `effect` is one of a small library: arrow, bolt, beam, burst, aura, sparkles, slash, impact, mist. An `element` colours it: fire, frost, lightning, radiant, nature, shadow, arcane.
- `object` is one of a small library: scroll, letter, map, pouch, coin, key, relic, lantern, torch, blade, bow, potion, book, gem, pack. With a listener it passes from hand to hand.
- Damage and status stay where they are, in the GM's labelled effects.

## Rules

- The GM picks from menus and never invents 3D: the cast, the set's places, the effect and object kinds.
- Anything off a menu is dropped, and the beat still reads.
- A line holds only spoken words. Narration and actions hold no quotes. A quote left in an action is split out as the actor's line.
- A step other than a hero's own never writes a line for a hero.
- Length rules count narration and action words. Spoken lines are extra, as now.
- Prompts see the history as a script, with each line under its speaker's name.

## Authored intros

An intro paragraph may open with labels in braces. Without them it is narration.

```
{actor: owlbear, from: treeLine, pace: hurry} The Owlbear crashes out of the undergrowth.
{speaker: wollandora, to: owlbear} That's enough, beast of the wood!
{actor: wollandora, target: owlbear, effect: burst, element: nature} Wollandora sends out a wave of natural energy.
```

## Work

1. The beat type in GM core: schemas, cleaning against the menus, prose and script rendering, authored intros.
2. Every GM step writes beats. The stores keep `story`, and a `narrative` string rendered from it until every reader has moved.
3. The Midnight Summons intros in beats, and the desktop's places menu from its sets.
4. Stage engine: effects, objects, a flash and a shake on a card, one light reserved for effects.
5. Desktop: the stage plays beats. Bubbles, camera, walks, effects and objects come from labels. The journal reads beats.
6. Replay The Midnight Summons with Claude, and review it in the app.
7. Website: the database keeps `story`, the turn view reads it, Storyview takes speakers from it and drops its guessing call.
8. Remove `narrative`, the markers and the guessers. Old saves and test data are thrown away, with the owner's yes.

## Done

### The beat, and the GM writing it, 2026-10-14

- `packages/gm-core/src/story/`: the beat types and stored schema, `cleanStory` against the scene's menus, prose and script rendering, authored intros, and the shared rules every prompt carries.
- Every step of the Myr adventures writes beats: a hero's reply (`writeReply`, one call where there were up to three), an AI hero's move, a hero's roll and its outcome, an NPC's action, roll and outcome, and the round end with the next intro.
- Prompts read the story as a script, every line under its speaker's name.
- Turns keep `story` beside `narrative`. The narrative is rendered from the story, so the website, Storyview and the stage read on unchanged. A turn saved before beats is read back from its narrative.
- The desktop save, the hosted game's store and the website's database keep `story`. Convex validates it.
- The desktop names each 3D set's labelled marks as places.
- The website's own reply path still writes prose, through `formatNarrativeAction`. So do the legacy round end for non-wiki plans and the first turn of a game started on the website.
- Checked: the GM core fixture re-recorded with beat replies, 62 desktop tests, the five bridge checks, the style check, typechecks. No live model has played it yet.

### The Midnight Summons intros, 2026-10-14

- Five intros carry labels. The Owlbear enters from the tree line, Wollandora steps from the shadows and casts a nature burst, Thalbern sneaks up the trail, packs his gear and leaves by the path.
- Wollandora's arrival now comes before her "That's enough" line, so the line has someone on stage to speak it. The words are unchanged.
- A game started on the website opens on the same beats (`introTurn`).
- The labels are documented in [Wiki adventures](../wiki-adventures.md).

## Decisions made without the owner

- `story` is the field name, so it does not clash with the stage's own director beats.
- The hero's movement keeps its own model call and the engine's clamping. Beats move NPCs and authored entrances.
- Wollandora enters before her first line in Timely Rescue, where the prose had her voice first.
- Until other adventures' intros are converted, their unlabelled paragraphs keep the old camera and speaker guessing.

## Not done

Everything above. Covert Cargo, The Road to Kordavos and March of Davos come after The Midnight Summons.
