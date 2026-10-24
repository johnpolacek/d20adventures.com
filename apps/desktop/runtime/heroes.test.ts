import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { storyText } from "@d20/gm-core/story/render"
import { createStubLibrary } from "@d20/stage/materials/library"
import { buildSetGeometry, parseSet } from "@d20/stage/spec/build"
import { stagingSpecSchema } from "@d20/stage/spec/staging"
import { onFootprint, standingRoom } from "@d20/stage/spec/walk"
import { STOCK_FIGURES } from "../src/figures"
import { partyScene, portraitFor, SCENES, spatialContext } from "../src/scenes"
import { game, type Packs, transitionsOf } from "./game"
import { type Hero, heroCommand } from "./heroes"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
const offline: Llm = { generateText: unused, generateObject: unused }
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "d20-heroes-"))
  const path = join(dir, "save.sqlite")
  const store = new LocalStore(path, transitionsOf(packs))
  const cleanup = () => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
  return { store, path, cleanup }
}
const sheet = (name: string, race: string, archetype: string) => ({
  name,
  race,
  archetype,
  gender: "Female",
  image: "",
  appearance: `${name} wears a travel-stained cloak.`,
  personality: "Steady.",
  background: "A farm near the road.",
  motivation: "Coin and honour.",
  behavior: "Leads from the front.",
  healthPercent: 100,
  type: "pc" as const,
  attributes: { strength: 14, dexterity: 12, constitution: 13, intelligence: 10, wisdom: 11, charisma: 10 },
  equipment: [{ name: "Longsword", description: "Well kept." }],
  skills: ["Athletics"],
  spells: [],
  specialAbilities: ["Second Wind"],
  effects: [],
})
async function addHero(store: LocalStore, name: string, race: string, archetype: string, figure = "human-b") {
  await heroCommand({ kind: "saveHero", hero: { ...sheet(name, race, archetype), figure } }, store, packs, offline)
  return store.heroes().find((h) => h.name === name)!
}

test("one model call drafts a hero from race, class, name and idea, and the roster saves, edits and deletes heroes", async () => {
  const { store, cleanup } = setup()
  try {
    const prompts: string[] = []
    const llm: Llm = {
      generateText: unused,
      generateObject: async ({ schema, prompt }) => {
        prompts.push(prompt)
        return { object: schema.parse({ ...sheet("Someone Else", "Elf", "Bard"), spells: [{ name: "Light", description: "A glow.", isUsed: true }] }) }
      },
    }
    const { draft } = await heroCommand(
      {
        kind: "heroDraft",
        provider: "claude",
        race: "Dwarf",
        archetype: "Cleric",
        name: "Hilde Ashbrand",
        gender: "Female",
        idea: "A smith who found faith in the forge",
        adventure: "the-road-to-kordavos",
      },
      store,
      packs,
      llm
    )
    assert.equal(prompts.length, 1)
    assert.match(prompts[0], /Hilde Ashbrand, a Female Dwarf Cleric/)
    assert.match(prompts[0], /found faith in the forge/)
    assert.match(prompts[0], /The Road to Kordavos/)
    // The player's choices win over the model's, and spells start unused.
    assert.deepEqual([draft!.name, draft!.race, draft!.archetype], ["Hilde Ashbrand", "Dwarf", "Cleric"])
    assert.deepEqual(draft!.spells, [{ name: "Light", description: "A glow." }])
    // The Road has no hooks, so the hero arrives as before.
    assert.equal(draft!.arrivals, undefined)
    assert.doesNotMatch(prompts[0], /arrival/)
    assert.deepEqual(store.heroes(), [])

    await heroCommand({ kind: "saveHero", hero: { ...draft!, figure: "dwarf-b" } }, store, packs, offline)
    const [hero] = store.heroes()
    assert.match(hero.id, /^hero-[a-z0-9]{8}$/)
    assert.equal(hero.figure, "dwarf-b")
    await heroCommand({ kind: "saveHero", hero: { ...hero, appearance: "Soot on her hands." } }, store, packs, offline)
    assert.equal(store.heroes().length, 1)
    assert.equal(store.heroes()[0].appearance, "Soot on her hands.")

    await assert.rejects(() => heroCommand({ kind: "saveHero", hero: { ...hero, race: "Dragon" } }, store, packs, offline), /listed races/)
    await assert.rejects(() => heroCommand({ kind: "saveHero", hero: { ...hero, id: "hero-missing" } }, store, packs, offline), /no longer/)
    await assert.rejects(() => heroCommand({ kind: "saveHero", hero: { ...hero, figure: "dragon-a" } }, store, packs, offline))
    await heroCommand({ kind: "deleteHero", id: hero.id }, store, packs, offline)
    assert.deepEqual(store.heroes(), [])
  } finally {
    cleanup()
  }
})

test("a hero made for March of Davos says why they came, and arrives at the gate with it", async () => {
  const { store, cleanup } = setup()
  try {
    const prompts: string[] = []
    const arrival = {
      reason: "She has come to deliver a sealed letter.",
      intro: "A half-orc in a ranger's cloak turns a wax-sealed letter over in her hands.",
      tell: "A letter sealed in black wax hangs at her belt.",
    }
    const llm: Llm = {
      generateText: unused,
      generateObject: async ({ schema, prompt }) => {
        prompts.push(prompt)
        return { object: schema.parse({ ...sheet("Dusha", "Half-Orc", "Ranger"), arrival }) }
      },
    }
    const hook = "Carrying a sealed letter for someone in the city, and told not to read it."
    const idea = { kind: "heroDraft", provider: "claude", race: "Half-Orc", archetype: "Ranger", name: "Dusha", adventure: "march-of-davos" } as const
    const { draft } = await heroCommand({ ...idea, hook }, store, packs, llm)
    assert.equal(prompts.length, 1)
    assert.match(prompts[0], /The player's reason for them: Carrying a sealed letter/)
    // The opening scene, with its labels taken off, shows how the premades arrive.
    assert.match(prompts[0], /A broad dwarf with copper braids/)
    assert.doesNotMatch(prompts[0], /\{hero:/)
    assert.deepEqual(draft!.arrivals, { "march-of-davos": arrival })
    // Without a reason, the GM picks one of the adventure's hooks.
    await heroCommand(idea, store, packs, llm)
    assert.match(prompts[1], /Pick the reason that suits them best: Bringing an offering/)

    await heroCommand({ kind: "saveHero", hero: { ...draft!, figure: "half-orc-b" } }, store, packs, offline)
    const [hero] = store.heroes()
    assert.deepEqual(hero.arrivals, { "march-of-davos": arrival })
    await game(
      store,
      packs,
      offline
    )({
      kind: "start",
      provider: "claude",
      adventure: "march-of-davos",
      party: [
        { id: hero.id, ai: false },
        { id: "branka-stoneveil", ai: true },
        { id: "milos-radan", ai: true },
      ],
    })
    // The running adventure's sheet carries the arrival. The roster hero's own sheet does not.
    const pc = store.current().characters.find((c) => c.id === hero.id)!
    assert.equal(pc.background, `A farm near the road. ${arrival.reason}`)
    assert.equal(pc.appearance, `Dusha wears a travel-stained cloak. ${arrival.tell}`)
    assert.equal("arrivals" in pc, false)
    assert.equal(store.heroes()[0].background, "A farm near the road.")

    // She arrives in the gate line after the premades who came, before the line moves on.
    const opening = store.current().story.map((b) => (b.kind === "action" ? b.actor : b.kind === "narration" && b.place) || "")
    assert.deepEqual(opening.slice(4, 8), ["branka-stoneveil", "milos-radan", hero.id, "ledger"])
    assert.match(storyText(store.current().story), /A half-orc in a ranger's cloak turns a wax-sealed letter over in her hands\./)
    assert.deepEqual(store.state!.adventure.arrivals, { [hero.id]: arrival.intro })

    // The GM reads it in the scene's intro too.
    store.current().characters.forEach((c) => {
      c.isComplete = true
      c.hasReplied = true
    })
    store.save()
    const gm: string[] = []
    const advance: Llm = {
      generateText: unused,
      generateObject: async ({ schema, prompt }) => {
        gm.push(prompt)
        return { object: schema.parse({ nextEncounterId: "the-gates-of-kordavos", beats: [{ kind: "narration", text: "The line shuffles forward." }], adventurePatch: {} }) }
      },
    }
    await game(store, packs, advance)({ kind: "continue", turnId: store.current()._id })
    assert.match(gm.at(-1) ?? "", /A broad dwarf with copper braids[\s\S]*A half-orc in a ranger's cloak turns a wax-sealed letter[\s\S]*Up at the table/)
  } finally {
    cleanup()
  }
})

test("a new game checks the party against the adventure's player range, premades and allowed heroes", async () => {
  const { store, cleanup } = setup()
  try {
    const run = game(store, packs, offline)
    const gnome = await addHero(store, "Tibble Fernwhistle", "Gnome", "Bard", "gnome-a")
    const fighter = await addHero(store, "Rosa Vell", "Human", "Fighter")
    const start = (adventure: string, party: { id: string; ai: boolean }[]) => run({ kind: "start", provider: "claude", adventure, party, replace: true })
    await assert.rejects(() => start("the-road-to-kordavos", []), /Too small|>=1|too_small/i)
    await assert.rejects(() => start("the-road-to-kordavos", [{ id: gnome.id, ai: false }]), /cannot join The Road to Kordavos/)
    await assert.rejects(
      () =>
        start("covert-cargo", [
          { id: fighter.id, ai: false },
          { id: "1749159962941", ai: true },
          { id: "thalbern", ai: true },
        ]),
      /own heroes/
    )
    await assert.rejects(() => start("covert-cargo", [{ id: "1749159962941", ai: false }]), /needs 3 heroes/)
    await assert.rejects(
      () =>
        start("march-of-davos", [
          { id: "branka-stoneveil", ai: true },
          { id: "milos-radan", ai: true },
          { id: "yeva-softstep", ai: true },
        ]),
      /yourself/
    )
    await assert.rejects(
      () =>
        start("march-of-davos", [
          { id: "branka-stoneveil", ai: false },
          { id: "branka-stoneveil", ai: true },
          { id: "yeva-softstep", ai: true },
        ]),
      /only once/
    )
    await assert.rejects(
      () =>
        start("march-of-davos", [
          { id: "hero-unknown", ai: false },
          { id: "milos-radan", ai: true },
          { id: "yeva-softstep", ai: true },
        ]),
      /not in your roster/
    )
    assert.equal(store.state, null)

    await start("covert-cargo", [
      { id: "1749307435667", ai: false },
      { id: "1749159962941", ai: true },
      { id: "thalbern", ai: true },
    ])
    const pcs = store.current().characters.filter((c) => c.type === "pc")
    assert.deepEqual(pcs.map((c) => [c.name, c.controlledBy ?? "you"]).sort(), [
      ["Lyra Silvanus", "ai"],
      ["Poppen Quickfoot", "you"],
      ["Thalbern", "ai"],
    ])
    assert.deepEqual(store.state!.figures, {})
  } finally {
    cleanup()
  }
})

test("created heroes and AI companions start, take turns, and carry through an encounter change and a reopen", async () => {
  const { store, path, cleanup } = setup()
  try {
    const rosa = await addHero(store, "Rosa Vell", "Human", "Fighter", "human-b")
    const bram = await addHero(store, "Bram Underhill", "Halfling", "Rogue", "halfling-a")
    await game(
      store,
      packs,
      offline
    )({
      kind: "start",
      provider: "claude",
      adventure: "the-road-to-kordavos",
      party: [
        { id: rosa.id, ai: false },
        { id: bram.id, ai: true },
      ],
    })
    assert.deepEqual(store.state!.figures, { [rosa.id]: "human-b", [bram.id]: "halfling-a" })
    // The save holds its own copies: a roster change does not reach a running adventure.
    await heroCommand({ kind: "deleteHero", id: bram.id }, store, packs, offline)
    const turn = store.current()
    const ai = turn.characters.find((c) => c.id === bram.id)!
    assert.equal(ai.type === "pc" && ai.controlledBy, "ai")
    const you = turn.characters.find((c) => c.id === rosa.id)!
    assert.equal(you.type === "pc" && you.controlledBy, undefined)
    assert.equal(ai.name, "Bram Underhill")

    // Bram leads the round. The player cannot act for him, and Continue plays his turn.
    turn.characters.forEach((c) => {
      c.isComplete = c.type === "npc"
      c.hasReplied = c.type === "npc"
      c.initiative = c.id === bram.id ? 20 : c.id === rosa.id ? 10 : 1
    })
    store.save()
    await assert.rejects(() => game(store, packs, offline)({ kind: "reply", turnId: turn._id, characterId: bram.id, text: "I sneak." }), /another character/)
    const calls: string[] = []
    const llm: Llm = {
      generateText: unused,
      generateObject: async ({ schema }) => {
        // The AI hero's move as beats, then its roll check.
        const roll = schema.safeParse({ rollType: "none", difficulty: 0 })
        calls.push(roll.success ? "roll" : "intent")
        return { object: roll.success ? roll.data : schema.parse({ beats: [{ kind: "action", who: bram.id, text: "Bram scans the treeline, one hand on his dagger." }] }) }
      },
    }
    await game(store, packs, llm)({ kind: "continue", turnId: turn._id })
    assert.deepEqual(calls, ["intent", "roll"])
    const after = store.current().characters
    assert.equal(after.find((c) => c.id === bram.id)!.isComplete, true)
    assert.match(storyText(store.current().story), /Bram scans the treeline/)
    await assert.rejects(() => game(store, packs, offline)({ kind: "continue", turnId: turn._id }), /player character still needs to act/)

    // An encounter change keeps both heroes, who plays them, and their figures.
    after.forEach((c) => {
      c.isComplete = true
      c.hasReplied = true
    })
    store.save()
    const next = packs["the-road-to-kordavos"].artifacts.graph.encounterTransitions.find((t) => t.fromEncounterId === "well-met")!.toEncounterId
    const advance: Llm = {
      generateText: unused,
      generateObject: async ({ schema }) => ({ object: schema.parse({ nextEncounterId: next, beats: [{ kind: "narration", text: "The road goes on." }], adventurePatch: {} }) }),
    }
    await game(store, packs, advance)({ kind: "continue", turnId: turn._id })
    assert.equal(store.current().encounterId, next)
    const moved = store.current().characters.filter((c) => c.type === "pc")
    assert.deepEqual(
      moved.map((c) => [c.id, c.controlledBy ?? "you"]).sort(),
      [
        [bram.id, "ai"],
        [rosa.id, "you"],
      ].sort()
    )
    const reopened = new LocalStore(path)
    assert.deepEqual(reopened.state!.figures, { [rosa.id]: "human-b", [bram.id]: "halfling-a" })
    reopened.db.close()
  } finally {
    cleanup()
  }
})

test("an AI hero last in the round is read before the round ends, on a Continue of its own", async () => {
  const { store, cleanup } = setup()
  try {
    const rosa = await addHero(store, "Rosa Vell", "Human", "Fighter", "human-b")
    const bram = await addHero(store, "Bram Underhill", "Halfling", "Rogue", "halfling-a")
    const party = [
      { id: rosa.id, ai: false },
      { id: bram.id, ai: true },
    ]
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "the-road-to-kordavos", party })
    const turn = store.current()
    turn.characters.forEach((c) => {
      c.isComplete = c.hasReplied = c.id !== bram.id
      c.initiative = c.id === bram.id ? 1 : 10
    })
    store.save()
    const next = packs["the-road-to-kordavos"].artifacts.graph.encounterTransitions.find((t) => t.fromEncounterId === "well-met")!.toEncounterId
    const llm: Llm = {
      generateText: unused,
      generateObject: async ({ schema }) => {
        for (const answer of [
          { rollType: "none", difficulty: 0 },
          { beats: [{ kind: "action", who: bram.id, text: "Bram falls in at the back." }] },
          { nextEncounterId: next, beats: [{ kind: "narration", text: "The road goes on." }], adventurePatch: {} },
        ]) {
          const parsed = schema.safeParse(answer)
          if (parsed.success) return { object: parsed.data }
        }
        throw new Error("Unexpected model request")
      },
    }
    await game(store, packs, llm)({ kind: "continue", turnId: turn._id })
    assert.equal(store.current()._id, turn._id)
    assert.match(storyText(store.current().story), /Bram falls in at the back/)
    await game(store, packs, llm)({ kind: "continue", turnId: turn._id })
    assert.notEqual(store.current()._id, turn._id)
  } finally {
    cleanup()
  }
})

const who = (id: string, name: string, race = "Human", archetype = "Fighter", gender = "Male") => ({ id, name, race, archetype, gender, type: "pc" })
const premade = (pack: string, id: string) => {
  const s = packs[pack].artifacts.characterSheets.premadeCharacters[id].sheet
  return who(s.id, s.name, s.race, s.archetype, s.gender)
}

test("the party fills a scene's slots: premades keep theirs, created heroes take the rest and spare spots", () => {
  const gate = SCENES["the-front-of-the-line"]
  const authored = ["branka-stoneveil", "cassia-verane", "yeva-softstep", "milos-radan"].map((id) => premade("march-of-davos", id))
  assert.deepEqual(partyScene(gate, authored).staging, gate.staging)

  // A created hero who shares Milos's first name does not take his slot or his art.
  const milos = who("hero-aaaa1111", "Milos Hardcastle", "Dwarf", "Fighter")
  const vex = who("hero-bbbb2222", "Vex", "Half-Orc", "Barbarian", "Female")
  const last = who("hero-cccc3333", "Ann Tew", "Gnome", "Wizard", "Female")
  const party = [premade("march-of-davos", "branka-stoneveil"), milos, vex, premade("march-of-davos", "wrenna-faelendar"), last]
  const chosen = { [milos.id]: "dwarf-a", [vex.id]: "half-orc-b", [last.id]: "gnome-b" }
  const { staging } = partyScene(gate, party, chosen)
  const cast = (id: string) => staging.cast.find((m) => m.id === id)!
  assert.deepEqual(
    staging.cast.map((m) => m.id),
    ["garlan", "branka", milos.id, vex.id, "wrenna-faelendar", "oskar", last.id]
  )
  assert.equal(cast(milos.id).at, "front2")
  assert.deepEqual(cast(milos.id).art, STOCK_FIGURES["dwarf-a"].art)
  assert.equal(cast(milos.id).height, STOCK_FIGURES["dwarf-a"].height)
  assert.equal(cast(milos.id).role, "Dwarf fighter")
  assert.equal(cast("wrenna-faelendar").art.front, "/stage/fixtures/march-of-davos/wrenna-front.webp")
  assert.deepEqual(cast(last.id).at, [0.82, 14.5])
  assert.deepEqual(staging.loops!["gate-line"].party!.members, ["branka", milos.id, vex.id, "wrenna-faelendar", last.id])
  assert.deepEqual(staging.shots!.party.subjects, ["branka", milos.id, vex.id, "wrenna-faelendar", last.id])
  assert.deepEqual(staging.shots!.twoshot.subjects, ["garlan", "branka", milos.id])
  assert.equal(portraitFor(partyScene(gate, party, chosen), milos, chosen), STOCK_FIGURES["dwarf-a"].art.portrait)
  // Story view still shows a created hero's own figure, never a premade's.
  assert.equal(portraitFor(undefined, milos, chosen), STOCK_FIGURES["dwarf-a"].art.portrait)

  // Three heroes at the festival: the unused slot leaves the scene and its shots.
  const festival = partyScene(SCENES["the-harvest-festival"], [milos, vex, premade("march-of-davos", "yeva-softstep")], chosen).staging
  assert.ok(!festival.cast.some((m) => ["branka-stoneveil", "cassia-verane", "milos-radan"].includes(m.id)))
  assert.equal(festival.cast.filter((m) => [milos.id, vex.id, "yeva-softstep"].includes(m.id)).length, 3)
  assert.deepEqual(festival.shots!.party.subjects!.length, 3)

  const context = spatialContext("the-harvest-festival", [milos, vex], {}, chosen)!
  assert.match(context, /Milos Hardcastle \(-1\.6, 17\.6\); Vex \(-0\.3, 18\.1\)/)

  // In the line, the party waits two groups back from the table, and a spare hero stands at its end.
  const line = spatialContext("the-gates-of-kordavos", [premade("march-of-davos", "branka-stoneveil"), milos, vex], {}, chosen)!
  assert.match(line, /two groups back/)
  assert.match(line, /Branka Stoneveil \(-0\.5, 16\.1\); Milos Hardcastle \(-0\.5, 14\.9\); Vex \(-1\.4, 15\.5\)/)
})

test("heroes from other adventures with numeric website ids stand in the gate's staging", () => {
  const gate = SCENES["the-gates-of-kordavos"]
  const party = [
    premade("march-of-davos", "branka-stoneveil"),
    who("thalbern", "Thalbern", "Half-Elf", "Ranger"),
    who("1749159962941", "Lyra Silvanus", "Human", "Rogue", "Female"),
    premade("march-of-davos", "milos-radan"),
    who("1749307435667", "Poppen Quickfoot", "Halfling", "Bard"),
  ]
  const { staging } = partyScene(gate, party)
  const parsed = stagingSpecSchema.parse(staging)
  assert.deepEqual(parsed.loops["gate-line"].party!.members, ["branka", "thalbern", "1749159962941", "milos", "1749307435667"])
})

test("spare spots for extra heroes stand clear of anything solid", () => {
  for (const [encounter, scene] of Object.entries(SCENES)) {
    const set = parseSet(scene.set)
    const { footprints } = buildSetGeometry(set, createStubLibrary(set.materials))
    for (const [x, z] of scene.spare ?? []) assert.equal(onFootprint(footprints, x, z), false, `${encounter} spare (${x}, ${z})`)
    for (const id of scene.party)
      assert.ok(
        scene.staging.cast.some((m) => m.id === id),
        `${encounter} slot ${id}`
      )
  }
  const max = Math.max(...Object.values(packs).map((p) => p.artifacts.manifest.maxPlayers ?? 1))
  assert.equal(max, 5)
  for (const scene of [SCENES["the-gates-of-kordavos"], SCENES["the-front-of-the-line"], SCENES["the-harvest-festival"]]) assert.ok(scene.party.length + (scene.spare?.length ?? 0) >= max)
})

test("heroes who walk to the same place stand beside each other, clear of anything solid", () => {
  const set = parseSet(SCENES["the-gates-of-kordavos"].set)
  const { footprints } = buildSetGeometry(set, createStubLibrary(set.materials))
  const [x, z] = set.marks.queueHead.at
  const standing = [{ x, z }]
  for (const from of ["front2", "front3", "front4"]) {
    const [fx, fz] = set.marks[from].at
    const spot = standingRoom(footprints, standing, { x: fx, z: fz }, { x, z })
    assert.ok(
      standing.every((p) => Math.hypot(p.x - spot.x, p.z - spot.z) > 0.79),
      from
    )
    assert.equal(onFootprint(footprints, spot.x, spot.z), false, from)
    standing.push(spot)
  }
})

test("created heroes show their figure and premades without stage art get theirs", () => {
  const hero = { id: "hero-dddd4444", name: "Thalbern Nobody", race: "Elf", gender: "Male", type: "pc" } as const
  assert.equal(portraitFor(undefined, hero, { [hero.id]: "elf-a" }), STOCK_FIGURES["elf-a"].art.portrait)
  assert.equal(portraitFor(undefined, premade("covert-cargo", "1749159962941")), "/stage/fixtures/covert-cargo/lyra-portrait.jpg")
  assert.equal(portraitFor(undefined, premade("march-of-davos", "ilya-veles")), "/stage/fixtures/march-of-davos/ilya-portrait.jpg")
  assert.equal(portraitFor(undefined, { id: "x", name: "Nobody", race: "Gnome", gender: "Female", type: "pc" }), STOCK_FIGURES["gnome-b"].art.portrait)
  const hero2: Hero["figure"] = "half-elf-a"
  assert.ok(STOCK_FIGURES[hero2])
})
