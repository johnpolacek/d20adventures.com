// Scene pipeline — prompt templates for authoring a bespoke 3D encounter set.
//
// Two prompts, two stages:
//
//   1. buildBriefRequestPrompt(input)  -> asks a model to write the SCENE BRIEF
//      (the format that produced d20-graphics-test/index.html) from encounter data.
//   2. buildStandaloneScenePrompt(...) -> wraps a finished brief with the fixed
//      preamble and quality bar into the prompt that generates a standalone
//      three.js index.html (pipeline Phase 0). A kit-set variant lands alongside it
//      once scene-kit exists.
//
// Pure functions, no I/O, no app types: the input shape is deliberately minimal so
// the same code runs from the CLI (scripts/scene-pipeline), from a server action at
// plan-creation time, or from a future standalone package. Mapping an AdventurePlan
// into SceneBriefInput lives in ./from-plan.ts.

export interface SceneBriefNpc {
  id: string
  name: string
  /** Physical description, if the setting has one. This is what the model dresses the figure from. */
  description?: string
  /** Behaviour in this encounter, from the plan's npc ref. */
  behavior?: string
}

export interface SceneBriefSetCandidate {
  id: string
  /** One line: what the set is and what marks/cameras it already has. */
  summary: string
}

export interface SceneBriefInput {
  settingTitle: string
  adventureTitle: string
  /** Plot-level context: the plan's teaser and overview. */
  settingLore: string
  /** The setting's art-direction entry (materials, palette, heraldry). Authoritative over inference from text. */
  artDirection?: string
  sectionTitle?: string
  sceneTitle?: string
  /** Titles of the other encounters in the same plan scene, in order, for reuse decisions. */
  siblingEncounterTitles?: string[]
  encounterId: string
  encounterTitle: string
  /** Resolved wiki location name, if any. The strongest reuse signal. */
  location?: string
  intro: string
  instructions?: string
  npcs: SceneBriefNpc[]
  /** Reference image URL. Recommended: the brief is written against it and so is the scene. */
  referenceImageUrl?: string
  /** Sets already authored for this setting, so the brief can propose reuse. */
  existingSets?: SceneBriefSetCandidate[]
}

/**
 * The brief format, verbatim from the gates session with two additions: a SET
 * section (reuse or new, with the marks the encounter needs) and a HERO
 * CHARACTERS section split out of KEY ASSETS so named NPCs are never dropped.
 */
export const SCENE_BRIEF_FORMAT = `== SET ==
set id: <kebab-case location id, e.g. kordavos-city-gate>
reuse: <"new" | id of an existing set this encounter takes place in>
marks: <named stage positions this encounter needs, e.g. queue, checkpoint, doorway — with a
  one-line description of each; for a reused set, only the marks it does not already have>

== SCENE BRIEF ==
<One paragraph: where this is, what it is made of, the cultural and material signature of the
place, and the exact moment being staged. The detail budget goes where the characters stand;
anything beyond a threshold, gate or doorway is backdrop only — light, haze, silhouettes — and
places they are traveling toward, remembering, or hearing about are not built at all.
End with a one-line mood.>

== KEY ASSETS (priority order) ==
<Numbered list, most important first. Each item: what it is, materials, wear, approximate
dimensions in meters, and how it should read. Architecture first, then set dressing, then
background population (crowds, animals, vehicles) with counts. 5-8 items.>

== HERO CHARACTERS ==
<One entry per named NPC in this encounter: build, face, hair, armour or clothing with colours
and heraldry, one characteristic pose or gesture, where they stand relative to the action.
Omit the section if there are none.>

== SPATIAL LAYOUT ==
<Axes and extents in meters. Where the main structure is, where the action is, where the camera
side is. Y-up, the action's approach runs along +Z toward the origin unless the location says
otherwise. Ground: terrain or floor, and what covers it.>

== LIGHTING / ATMOSPHERE ==
<Time of day, key light direction and colour, sky or ceiling, haze or dust, palette, and the one
lighting idea that sells the moment (god rays, a hearth glow, moonlight through a grate).>

== CAMERA (for preview renders) ==
<Primary: eye-level shot from inside the action, distance, focal length. Secondary: a high
three-quarter establishing shot. One more if the encounter has a second beat.>`

/** Fixed quality bar appended to every scene-authoring prompt, verbatim from the gates session. */
export const QUALITY_BAR = `== QUALITY BAR ==
Target AAA game quality — the fidelity of a current-generation flagship RPG cinematic
(Baldur's Gate 3, God of War, Horizon ballpark). Push geometry, materials, and lighting as
far as the pipeline allows: crisp silhouettes with rich mid-level detail (carved stone relief,
individual chain links, stitching on cloth), physically based materials with believable wear —
rain-streaked stone, burnished metal edges, sun-faded cloth — and cinematic lighting with
soft shadows, bounce light, and atmospheric depth. Every asset should hold up in a close-up
screenshot. Stylized-realistic art direction: readable painterly forms, not photoscan realism,
not cartoon. No text or lettering on any surface (emblems and heraldry only). Y-up, meters.`

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

/**
 * Stage 1: the prompt that asks a model to write the SCENE BRIEF for one encounter.
 * Send the reference image alongside it when the caller's model client supports
 * image input; the prompt tells the model to treat it as the north star.
 */
export function buildBriefRequestPrompt(input: SceneBriefInput): string {
  const npcs = input.npcs.length
    ? input.npcs
        .map((npc) => `  - ${npc.name} (${npc.id})${npc.description ? `: ${truncate(npc.description, 400)}` : ""}${npc.behavior ? ` — in this encounter: ${truncate(npc.behavior, 300)}` : ""}`)
        .join("\n")
    : "  (none)"
  const sets = input.existingSets?.length ? input.existingSets.map((set) => `  - ${set.id}: ${set.summary}`).join("\n") : "  (none yet)"
  const siblings = input.siblingEncounterTitles?.length ? input.siblingEncounterTitles.join(" → ") : "(none)"

  return `You are the art director for a 3D fantasy adventure game. Write the SCENE BRIEF for one encounter: the spec a graphics engineer will build a bespoke real-time three.js scene from. Be concrete and physical — materials, dimensions, counts, colours, heraldry — not literary. Everything you write must be buildable, and it will be built to AAA cinematic quality: never specify low-poly, silhouette, placeholder or billboard assets.

${input.referenceImageUrl ? "A reference image is attached. It is the north star: match its composition, architecture, palette and mood, and describe what is in it. Where the image and the text disagree, the image wins for look and the text wins for what is happening." : "No reference image is available; derive the look from the setting lore and the encounter text."}

Setting: ${input.settingTitle}
Adventure: ${input.adventureTitle}
${input.artDirection ? `\nArt direction for this setting (authoritative for materials, palette and heraldry — use these emblems and colours exactly):\n${truncate(input.artDirection, 6000)}\n` : ""}
Story context:
${truncate(input.settingLore, 1500)}

${input.sectionTitle || input.sceneTitle ? `Plan position: ${input.sectionTitle ?? ""} › ${input.sceneTitle ?? ""}\n` : ""}Neighbouring encounters (this one in brackets): ${siblings}

Encounter: ${input.encounterTitle} (${input.encounterId})
Location: ${input.location ?? "(not resolved — infer it from the intro)"}
Intro:
${truncate(input.intro, 3000)}
${input.instructions ? `\nGM instructions:\n${truncate(input.instructions, 1500)}\n` : ""}
Named NPCs present:
${npcs}

Sets already authored in this setting:
${sets}

Reuse rule: if this encounter takes place in a location that already has a set, say so in the SET section and list only the marks and cameras the existing set is missing. A set is a location, not a story beat — a tavern at night and the same tavern the next morning are one set with a time-of-day toggle. Only propose "new" when the location is physically different.

Output the brief in EXACTLY this format, filling every section. No preamble, no commentary after it.

${SCENE_BRIEF_FORMAT}`
}

/**
 * Stage 2 (Phase 0): the standalone-scene prompt, which is the gates prompt with
 * the brief substituted in. Generates a single self-contained three.js page.
 */
export function buildStandaloneScenePrompt(args: { encounterTitle: string; brief: string; referenceImagePath?: string }): string {
  const reference = args.referenceImagePath ? `Use the image reference at ${args.referenceImagePath} as the north star.` : "No reference image; the brief is the north star."
  return `This is a graphics generation test for achieving the best quality we can. Use three.js in a single html page to create this environment. I want to be able to zoom and move around the environment (orbit, wheel zoom, WASD fly, and numbered keys for the preview cameras in the brief). ${reference}

Generate a 3D scene: "${args.encounterTitle}".

${args.brief.trim()}

${QUALITY_BAR}

This file will be revised in later passes from feedback, so organize it in clearly labelled sections (utils, textures, materials, terrain, each structure, figures and props, atmosphere, camera and post) and expose the brief's preview cameras as numbered views.

Build everything procedurally in code: geometry from primitives, extrusions and lathes; textures generated on canvas with height-derived normal maps and roughness maps; cloth, grass and foliage animated in vertex shaders; crowds and vegetation instanced. No external model or texture files. Load three from a CDN importmap.`
}

/**
 * Revision prompt: one round of feedback on an existing scene file. Notes come from
 * a person now and from the critique stage later; the optional image is a second
 * reference for what the notes describe. The caller copies the previous version
 * aside before applying this.
 */
export function buildRevisionPrompt(args: { sceneFile: string; notes: string; referenceImagePath?: string }): string {
  const reference = args.referenceImagePath
    ? ` A new reference image is attached at ${args.referenceImagePath}; it shows what the notes describe and takes priority over the earlier reference where they differ.`
    : ""
  return `Revise ${args.sceneFile} in place. Keep its section structure, its numbered preview views, and everything the notes do not mention.${reference}

Notes:
${args.notes.trim()}

Where a note conflicts with the original brief, the note wins. Spend any freed budget on detail in the area the notes point at.`
}
