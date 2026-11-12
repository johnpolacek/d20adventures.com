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
// A rules sheet of the class, from a premade. The hero creator is off, so roster heroes are put in the store directly.
const premades = packs["welcome-to-kordavos"].artifacts.characterSheets.premadeCharacters
const rulesFor = (archetype: string) => Object.values(premades).find((p) => p.sheet.sheet?.class === archetype.toLowerCase())!.sheet.sheet!
function addHero(store: LocalStore, name: string, race: string, archetype: string, figure = "human-b"): Hero {
  const hero = { ...sheet(name, race, archetype), sheet: rulesFor(archetype), figure, id: `hero-${name.toLowerCase().replace(/[^a-z]+/g, "-")}` }
  store.putHero(hero)
  return hero
}

test("the hero creator is switched off: drafting or saving a hero is refused, and a roster hero without a rules sheet cannot play", async () => {
  const { store, cleanup } = setup()
  try {
    const idea = { kind: "heroDraft", provider: "claude", race: "Dwarf", archetype: "Cleric", name: "Hilde Ashbrand" } as const
    await assert.rejects(() => heroCommand(idea, store, packs, offline), /switched off/)
    await assert.rejects(() => heroCommand({ kind: "saveHero", hero: { ...sheet("Hilde Ashbrand", "Dwarf", "Cleric"), figure: "dwarf-b" } }, store, packs, offline), /switched off/)
    assert.deepEqual(store.heroes(), [])
    const { sheet: _rules, ...old } = addHero(store, "Rosa Vell", "Human", "Fighter")
    store.putHero(old)
    await assert.rejects(() => game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "the-road-to-kordavos", party: [{ id: old.id, ai: false }] }), /no rules sheet/)
  } finally {
    cleanup()
  }
})

test("a roster hero with no arrival for Welcome to Kordavos gets one at the start, kept for the next game", async () => {
  const { store, cleanup } = setup()
  try {
    const hero = addHero(store, "Dusha", "Half-Orc", "Ranger", "half-orc-b")
    const arrival = {
      reason: "She has come to sell furs at the Festival market.",
      intro: "A half-orc shoulders a bundle of wolf pelts, counting the guards at the arch.",
      tell: "A bundle of grey wolf pelts rides on her back.",
    }
    const prompts: string[] = []
    const llm: Llm = {
      generateText: unused,
      generateObject: async ({ schema, prompt }) => {
        prompts.push(prompt)
        return { object: schema.parse(arrival) }
      },
    }
    const start = {
      kind: "start" as const,
      provider: "claude" as const,
      adventure: "welcome-to-kordavos",
      replace: true,
      party: [
        { id: hero.id, ai: false },
        { id: "branka-stoneveil", ai: true },
        { id: "milos-radan", ai: true },
      ],
    }
    await game(store, packs, llm)(start)
    assert.equal(prompts.length, 1)
    assert.match(prompts[0], /Dusha, a Female Half-Orc Ranger[\s\S]*Pick the reason that suits them best: Bringing an offering/)
    assert.deepEqual(store.heroes()[0].arrivals, { "welcome-to-kordavos": arrival })
    assert.match(storyText(store.current().story), /A half-orc shoulders a bundle of wolf pelts/)
    assert.equal(store.current().characters.find((c) => c.id === hero.id)!.appearance, `Dusha wears a travel-stained cloak. ${arrival.tell}`)

    // The next game uses the kept arrival.
    await game(store, packs, offline)(start)
    assert.equal(prompts.length, 1)
    assert.deepEqual(store.state!.adventure.arrivals, { [hero.id]: arrival.intro })
  } finally {
    cleanup()
  }
})

test("a failed arrival call still starts the game, with the hero left out of the opening paragraphs", async () => {
  const { store, cleanup } = setup()
  try {
    const hero = addHero(store, "Dusha", "Half-Orc", "Ranger", "half-orc-b")
    await game(
      store,
      packs,
      offline
    )({
      kind: "start",
      provider: "claude",
      adventure: "welcome-to-kordavos",
      party: [
        { id: hero.id, ai: false },
        { id: "branka-stoneveil", ai: true },
        { id: "milos-radan", ai: true },
      ],
    })
    assert.equal(store.state!.adventure.arrivals, undefined)
    assert.equal(store.heroes()[0].arrivals, undefined)
  } finally {
    cleanup()
  }
})

test("a new game checks the party against the adventure's player range, premades and allowed heroes", async () => {
  const { store, cleanup } = setup()
  try {
    const run = game(store, packs, offline)
    const gnome = addHero(store, "Tibble Fernwhistle", "Gnome", "Bard", "gnome-a")
    const fighter = addHero(store, "Rosa Vell", "Human", "Fighter")
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
        start("welcome-to-kordavos", [
          { id: "branka-stoneveil", ai: true },
          { id: "milos-radan", ai: true },
          { id: "yeva-softstep", ai: true },
        ]),
      /yourself/
    )
    await assert.rejects(
      () =>
        start("welcome-to-kordavos", [
          { id: "branka-stoneveil", ai: false },
          { id: "branka-stoneveil", ai: true },
          { id: "yeva-softstep", ai: true },
        ]),
      /only once/
    )
    await assert.rejects(
      () =>
        start("welcome-to-kordavos", [
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
    const rosa = addHero(store, "Rosa Vell", "Human", "Fighter", "human-b")
    const bram = addHero(store, "Bram Underhill", "Halfling", "Rogue", "halfling-a")
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
        const roll = schema.safeParse({ check: "none" })
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
    const rosa = addHero(store, "Rosa Vell", "Human", "Fighter", "human-b")
    const bram = addHero(store, "Bram Underhill", "Halfling", "Rogue", "halfling-a")
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
          { check: "none" },
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
  const authored = ["branka-stoneveil", "cassia-verane", "yeva-softstep", "milos-radan"].map((id) => premade("welcome-to-kordavos", id))
  assert.deepEqual(partyScene(gate, authored).staging, gate.staging)

  // A created hero who shares Milos's first name does not take his slot or his art.
  const milos = who("hero-aaaa1111", "Milos Hardcastle", "Dwarf", "Fighter")
  const vex = who("hero-bbbb2222", "Vex", "Half-Orc", "Barbarian", "Female")
  const last = who("hero-cccc3333", "Ann Tew", "Gnome", "Wizard", "Female")
  const party = [premade("welcome-to-kordavos", "branka-stoneveil"), milos, vex, premade("welcome-to-kordavos", "wrenna-faelendar"), last]
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
  assert.equal(cast("wrenna-faelendar").art.front, "/stage/fixtures/welcome-to-kordavos/wrenna-front.webp")
  assert.deepEqual(cast(last.id).at, [0.82, 14.5])
  assert.deepEqual(staging.loops!["gate-line"].party!.members, ["branka", milos.id, vex.id, "wrenna-faelendar", last.id])
  assert.deepEqual(staging.shots!.party.subjects, ["branka", milos.id, vex.id, "wrenna-faelendar", last.id])
  assert.deepEqual(staging.shots!.twoshot.subjects, ["garlan", "branka", milos.id])
  // The portrait is the created hero's own figure, painted or photographed, never a premade's.
  assert.match(portraitFor(partyScene(gate, party, chosen), milos, chosen) ?? "", /dwarf-a-portrait\.jpg$/)
  assert.match(portraitFor(undefined, milos, chosen) ?? "", /dwarf-a-portrait\.jpg$/)

  // Three heroes at the festival: the unused slot leaves the scene and its shots.
  const festival = partyScene(SCENES["the-harvest-festival"], [milos, vex, premade("welcome-to-kordavos", "yeva-softstep")], chosen).staging
  assert.ok(!festival.cast.some((m) => ["branka-stoneveil", "cassia-verane", "milos-radan"].includes(m.id)))
  assert.equal(festival.cast.filter((m) => [milos.id, vex.id, "yeva-softstep"].includes(m.id)).length, 3)
  assert.deepEqual(festival.shots!.party.subjects!.length, 3)

  const context = spatialContext("the-harvest-festival", [milos, vex], {}, chosen)!
  assert.match(context, /Milos Hardcastle \(-1\.6, 17\.6\); Vex \(-0\.3, 18\.1\)/)

  // In the line, the party waits two groups back from the table, and a spare hero stands at its end.
  const line = spatialContext("the-gates-of-kordavos", [premade("welcome-to-kordavos", "branka-stoneveil"), milos, vex], {}, chosen)!
  assert.match(line, /two groups back/)
  assert.match(line, /Branka Stoneveil \(-0\.5, 16\.1\); Milos Hardcastle \(-0\.5, 14\.9\); Vex \(-1\.4, 15\.5\)/)
})

test("heroes from other adventures with numeric website ids stand in the gate's staging", () => {
  const gate = SCENES["the-gates-of-kordavos"]
  const party = [
    premade("welcome-to-kordavos", "branka-stoneveil"),
    who("thalbern", "Thalbern", "Half-Elf", "Ranger"),
    who("1749159962941", "Lyra Silvanus", "Human", "Rogue", "Female"),
    premade("welcome-to-kordavos", "milos-radan"),
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
  assert.equal(portraitFor(undefined, premade("welcome-to-kordavos", "ilya-veles")), "/stage/fixtures/welcome-to-kordavos/ilya-portrait.jpg")
  assert.equal(portraitFor(undefined, { id: "x", name: "Nobody", race: "Gnome", gender: "Female", type: "pc" }), STOCK_FIGURES["gnome-b"].art.portrait)
  const hero2: Hero["figure"] = "half-elf-a"
  assert.ok(STOCK_FIGURES[hero2])
})
