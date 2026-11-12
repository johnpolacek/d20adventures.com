import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { conditionWords } from "@d20/gm-core/sheet/conditions"
import { withDamage } from "@d20/gm-core/sheet/death"
import { placeCharacters, standingWords } from "@d20/gm-core/sheet/placement"
import { metres } from "@d20/gm-core/sheet/space"
import { storyText } from "@d20/gm-core/story/render"
import { findCurrentActor, isDying } from "@d20/gm-core/utils/turn-actors"
import { buildLocalWikiTurnCharacters } from "@d20/gm-core/wiki-adventures/characters"
import { castIdFor, partyScene, portraitFor, sceneFor } from "../src/scenes"
import { encounterFloor } from "./floor"
import { game, type Packs, suggest, transitionsOf } from "./game"
import { type HostJob, type HostPost, hostLoop } from "./host"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
const pack = packs["covert-cargo"]
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}

test("every Covert Cargo encounter has a 3D scene with a figure and a portrait for everyone in it", () => {
  const players = pack.artifacts.manifest.premadeCharacterIds.map((characterId) => ({ characterId, userId: "local-player" }))
  const encounters = Object.values(pack.artifacts.encounters)
  assert.equal(encounters.length, 10)
  for (const encounter of encounters) {
    const authored = sceneFor(encounter.id)
    assert.ok(authored, `${encounter.id} has no scene`)
    const characters = buildLocalWikiTurnCharacters({ artifacts: pack.artifacts, encounter, players })
    const scene = partyScene(authored, characters)
    assert.deepEqual(scene.staging, authored.staging, `${encounter.id}: the premade party stands in its authored places`)
    for (const c of characters) {
      assert.ok(castIdFor(scene.staging.cast, c), `${encounter.id}: ${c.name} has no figure`)
      // Thalbern, the third hero, brings his art from The Midnight Summons.
      assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/(covert-cargo|the-midnight-summons)\/[a-z-]+-portrait\.jpg$/, `${encounter.id}: ${c.name}`)
    }
  }
})

test("the real core walks Covert Cargo from the pier into the cabin and back to Kordavos, with map staging for the GM", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-cargo-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    await game(store, packs, { generateText: unused, generateObject: unused })({ kind: "start", provider: "claude", adventure: "covert-cargo" })
    assert.equal(store.current().encounterId, "the-shipment")
    // Everyone starts where the pier's floor stages them, in feet: Poppen's bushes are at (-5, 4.3) metres.
    const feet = (name: string) => {
      const at = store.current().characters.find((c) => c.name === name)?.position
      return at && [Math.round(at.x * 10) / 10, Math.round(at.y * 10) / 10]
    }
    assert.deepEqual(feet("Poppen Quickfoot"), [-16.4, 14.1])
    assert.ok(
      store.current().characters.every((c) => c.position),
      "someone on the pier has no position"
    )
    const prompts: string[] = []
    for (const next of ["the-fake", "battle-on-the-boat", "the-crate", "return-to-the-city"]) {
      store.current().characters.forEach((c) => {
        c.hasReplied = true
        c.isComplete = true
      })
      store.save()
      const llm: Llm = {
        generateText: unused,
        generateObject: async ({ schema, prompt }) => {
          prompts.push(prompt)
          return { object: schema.parse({ nextEncounterId: next, beats: [{ kind: "narration", text: `On to ${next}.` }], adventurePatch: {} }) }
        },
      }
      await game(store, packs, llm)({ kind: "continue", turnId: store.current()._id })
      assert.equal(store.current().encounterId, next)
      // A new encounter stages everyone afresh: in the cabin fight Thalbern's thicket is at (-1.4, -6.4) metres.
      assert.ok(
        store.current().characters.every((c) => c.position),
        `${next}: someone has no position`
      )
      if (next === "battle-on-the-boat") assert.deepEqual(feet("Thalbern"), [-4.6, -21])
      const floor = await encounterFloor(next)
      assert.ok(floor, next)
      const where = standingWords(placeCharacters(store.current().characters, floor), floor) ?? ""
      assert.match(where, /- Lyra Silvanus, /)
      assert.match(where, /- Poppen Quickfoot, /)
      assert.match(where, /- Thalbern, /)
    }
    // The GM saw the pier's places while deciding the first move.
    assert.match(prompts[0], /the cabin door/)
    // And who knows whom: the rule every adventure gets, and this adventure's premise.
    assert.match(prompts[0], /WHO KNOWS WHAT:/)
    assert.match(prompts[0], /ADVENTURE PREMISE[^\n]*\nLyra, Poppen and Thalbern have never met/)
    // The two watchers are apart, each unknown to the other until a check passes, and the elves leave when paid.
    assert.match(prompts[0], /Poppen and Thalbern do not know of each other/)
    assert.match(prompts[0], /Perception check, DC 15/)
    assert.match(prompts[0], /Once Silas hands over the payment they leave the boat/)
    // Where everyone stands is the engine's, in feet: Poppen's bushes are 5 metres west of the origin and Reinhard
    // stands in the saloon, so the two are tens of feet apart.
    assert.match(prompts[0], /- Poppen Quickfoot, [^\n]*Reinhard \d\d/)
    assert.match(prompts[0], /- Thalbern, /)
    assert.match(prompts[0], /the thicket on the bank below the stern/)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the premise that the three heroes are strangers reaches the replies offered to a player", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-cargo-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    await game(store, packs, { generateText: unused, generateObject: unused })({ kind: "start", provider: "claude", adventure: "covert-cargo" })
    const turn = store.current()
    const actor = findCurrentActor(turn.characters)!
    let prompt = ""
    const llm: Llm = {
      generateText: unused,
      generateObject: async (args) => {
        prompt = args.prompt
        return { object: args.schema.parse({ suggestions: [{ label: "Wait", text: `${actor.name} waits.` }] }) }
      },
    }
    await suggest(store.state, packs, llm, { kind: "suggest", turnId: turn._id, characterId: actor.id })
    assert.match(prompt, /ADVENTURE PREMISE[^\n]*\nLyra, Poppen and Thalbern have never met/)
    assert.match(prompt, /does not say a stranger's name/)
    // Still nothing from the GM's own notes.
    assert.ok(!prompt.includes("Verodynian Oath Stone"))
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// A model that answers each of the core's requests by its schema. `advance` is the GM's answer on turn advance.
function stubLlm(
  advance: () => Record<string, unknown>,
  npcAction: Record<string, unknown> = { actionSummary: "Cuts at the mage.", beats: [{ kind: "narration", text: "The blade comes down." }], actionType: "attack" }
): Llm {
  return {
    generateText: async () => ({ text: "Steel rings in the saloon." }),
    generateObject: async ({ schema }) => {
      const answers = [
        advance(),
        npcAction,
        { beats: [{ kind: "narration", text: "The blade bites deep." }], effects: [] },
        // A plain Strength check, with nothing at stake, so nothing the model says can touch Lyra.
        { check: "strength", difficulty: "very-easy" },
      ]
      for (const answer of answers) {
        const parsed = schema.safeParse(answer)
        if (parsed.success) return { object: parsed.data }
      }
      throw new Error("Unexpected model request")
    },
  }
}

async function inTheBattle(run: (store: LocalStore, play: (llm: Llm) => Promise<unknown>) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "d20-cargo-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  const done = (ids: (c: { type: string }) => boolean) => {
    for (const c of store.current().characters) if (ids(c)) c.hasReplied = c.isComplete = true
    store.save()
  }
  const play = (llm: Llm) => game(store, packs, llm)({ kind: "continue", turnId: store.current()._id })
  try {
    await game(store, packs, { generateText: unused, generateObject: unused })({ kind: "start", provider: "claude", adventure: "covert-cargo" })
    for (const next of ["the-fake", "battle-on-the-boat"]) {
      done(() => true)
      await play(stubLlm(() => ({ nextEncounterId: next, beats: [{ kind: "narration", text: `On to ${next}.` }], adventurePatch: {} })))
    }
    done((c) => c.type === "pc")
    await run(store, play)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
const lyra = (store: LocalStore) => store.current().characters.find((c) => c.name === "Lyra Silvanus")!

test("a killing blow leaves a hero alive, and nobody comes to the rescue: Thalbern is one of the heroes", async () => {
  await inTheBattle(async (store, play) => {
    assert.deepEqual(
      store
        .current()
        .characters.filter((c) => c.type === "pc")
        .map((c) => c.name)
        .sort(),
      ["Lyra Silvanus", "Poppen Quickfoot", "Thalbern"]
    )
    const fightGoesOn = () => ({ nextEncounterId: "battle-on-the-boat", beats: [{ kind: "narration", text: "Reinhard raises his sword again." }], adventurePatch: {} })
    // The engine's blow takes Lyra to 0, and nothing the model says that round kills her.
    Object.assign(lyra(store), withDamage(lyra(store), lyra(store).hitPoints!).character)
    store.save()
    await play(stubLlm(fightGoesOn))
    assert.equal(store.current().encounterId, "battle-on-the-boat")
    // She is Unconscious and dying.
    assert.deepEqual([lyra(store).hitPoints, lyra(store).healthPercent, lyra(store).dead, conditionWords(lyra(store)).includes("Unconscious")], [0, 0, undefined, true])
    assert.equal(isDying(lyra(store)), true)
    assert.deepEqual(
      store
        .current()
        .characters.filter((c) => c.type === "npc")
        .map((c) => c.name)
        .sort(),
      ["Reinhard", "Silas"]
    )

    // Nor can a patch end the Unconscious of 0 hit points: only healing does.
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
    const dying = () => ({
      nextEncounterId: "battle-on-the-boat",
      beats: [{ kind: "narration", text: "Lyra goes down on one knee." }],
      adventurePatch: { characterUpdates: [{ characterId: lyra(store).id, conditionsEnded: ["unconscious"] }] },
    })
    await play(stubLlm(dying))
    assert.equal(store.current().encounterId, "battle-on-the-boat")
    assert.deepEqual([lyra(store).hitPoints, lyra(store).dead, conditionWords(lyra(store)).includes("Unconscious")], [0, undefined, true])
    assert.equal(isDying(lyra(store)), true)

    // Silas runs on his turn and is out of the encounter, and the fight ends at the crate.
    for (const c of store.current().characters) if (c.name !== "Silas") c.hasReplied = c.isComplete = true
    store.save()
    const runs = { actionSummary: "Silas runs.", beats: [{ kind: "narration", text: "Silas goes over the bow rail." }], actionType: "flee" }
    const round = store.current()._id
    const toTheCrate = stubLlm(() => ({ nextEncounterId: "the-crate", beats: [{ kind: "narration", text: "The river takes him." }], adventurePatch: {} }), runs)
    await play(toTheCrate)
    assert.equal(store.state!.turns.find((t) => t._id === round)!.characters.find((c) => c.name === "Silas")!.fled, true)
    // His run is read before the round ends, on a Continue of its own.
    assert.equal(store.current()._id, round)
    await play(toTheCrate)
    assert.equal(store.current().encounterId, "the-crate")
  })
})

// The model for a round where each NPC walks to the saloon door and does nothing else there.
const walksOff = (): Llm => ({
  generateText: async () => ({ text: "Boots ring on the boards." }),
  generateObject: async ({ schema }) => {
    for (const answer of [
      { nextEncounterId: "battle-on-the-boat", beats: [{ kind: "narration", text: "The fight goes on." }], adventurePatch: {} },
      { actionSummary: "Walks to the saloon door.", beats: [{ kind: "narration", text: "He turns for the door." }], actionType: "other" },
      { beats: [{ kind: "narration", text: "He reaches the door." }], effects: [] },
      { check: "none", moveTo: "cabinDoor" },
    ]) {
      const parsed = schema.safeParse(answer)
      if (parsed.success) return { object: parsed.data }
    }
    throw new Error("Unexpected model request")
  },
})

test("a hero is offered a reaction, the round waits, and the answer plays the NPC's turn on", async () => {
  await inTheBattle(async (store, play) => {
    // Lyra stands 5 feet south of Reinhard, with no one else near. He walks off to the saloon door.
    const reinhard = () => store.current().characters.find((c) => c.name === "Reinhard")!
    const silas = () => store.current().characters.find((c) => c.name === "Silas")!
    lyra(store).position = { x: reinhard().position!.x, y: reinhard().position!.y + 5 }
    silas().hasReplied = silas().isComplete = true
    store.save()
    const was = { at: reinhard().position, story: store.current().story.length, hitPoints: reinhard().hitPoints }
    await play(walksOff())
    // His turn has stopped on the offer and written nothing: he has not moved, and the story is as it was.
    const offered = store.current().reaction
    assert.deepEqual([offered?.offer.id, offered?.offer.to, offered?.npc, offered?.answer], ["opportunity-attack", lyra(store).id, reinhard().id, undefined])
    assert.match(offered?.text ?? "", /Reinhard is leaving Lyra Silvanus's reach/)
    assert.deepEqual([reinhard().position, store.current().story.length, reinhard().isComplete], [was.at, was.story, false])
    // The round waits: playing on changes nothing while the offer stands.
    await play(walksOff())
    assert.ok(store.current().reaction)
    assert.equal(store.current().story.length, was.story)
    // She takes it. His turn is played on with the same reading: she strikes, he walks on, and she has reacted.
    await game(store, packs, walksOff())({ kind: "react", turnId: store.current()._id, characterId: lyra(store).id, take: true })
    assert.equal(store.current().reaction, undefined)
    const told = store.current().story.slice(was.story)
    assert.deepEqual(
      told.flatMap((beat) => (beat.kind === "feature" ? [[beat.name, beat.character]] : [])),
      [["Opportunity Attack", lyra(store).id]]
    )
    assert.equal(told.filter((beat) => beat.kind === "roll").length, 1)
    assert.notDeepEqual(reinhard().position, was.at)
    assert.equal(reinhard().isComplete, true)
    assert.ok(lyra(store).turnEffects?.some((effect) => effect.id === "reacted"))
  })
})

test("a hero who walks out of an NPC's reach is struck at, and one who Disengages is not", async () => {
  const walk = async (check: "none" | "disengage") => {
    let told: { features: string[]; rolls: number } | undefined
    await inTheBattle(async (store) => {
      const reinhard = () => store.current().characters.find((c) => c.name === "Reinhard")!
      lyra(store).position = { x: reinhard().position!.x, y: reinhard().position!.y + 5 }
      // Silas stands by the door she walks to: he is sent off, so only Reinhard's reach is left.
      store.current().characters.find((c) => c.name === "Silas")!.position = { x: 100, y: 100 }
      Object.assign(lyra(store), { hasReplied: false, isComplete: false })
      store.save()
      const was = store.current().story.length
      const llm = walksOff()
      const picks: Llm = {
        ...llm,
        generateObject: async (request) =>
          request.schema.safeParse({ check, moveTo: "cabinDoor" }).success ? { object: request.schema.parse({ check, moveTo: "cabinDoor" }) } : llm.generateObject(request),
      }
      await game(store, packs, picks)({ kind: "reply", turnId: store.current()._id, characterId: lyra(store).id, text: "Lyra walks to the saloon door." })
      const after = store.current().story.slice(was)
      told = {
        features: after.flatMap((beat) => (beat.kind === "feature" ? [`${beat.name} by ${beat.character === reinhard().id ? "Reinhard" : beat.character}`] : [])),
        rolls: after.filter((beat) => beat.kind === "roll").length,
      }
      assert.equal(!!reinhard().turnEffects?.some((effect) => effect.id === "reacted"), check === "none")
    })
    return told
  }
  // Reinhard takes his Opportunity Attack at once: an NPC follows its standing order with no wait.
  assert.deepEqual(await walk("none"), { features: ["Opportunity Attack by Reinhard"], rolls: 1 })
  assert.deepEqual(await walk("disengage"), { features: [], rolls: 0 })
})

test("an offer no one answers follows the hero's standing order when it runs out", async () => {
  await inTheBattle(async (store, play) => {
    const reinhard = () => store.current().characters.find((c) => c.name === "Reinhard")!
    const silas = () => store.current().characters.find((c) => c.name === "Silas")!
    lyra(store).position = { x: reinhard().position!.x, y: reinhard().position!.y + 5 }
    silas().hasReplied = silas().isComplete = true
    store.save()
    const was = store.current().story.length
    await play(walksOff())
    assert.ok(store.current().reaction)
    // The wait runs out. By default she takes every Opportunity Attack.
    store.current().reaction!.expiresAt = 0
    store.save()
    await play(walksOff())
    assert.equal(store.current().reaction, undefined)
    assert.equal(
      store
        .current()
        .story.slice(was)
        .filter((beat) => beat.kind === "feature" && beat.name === "Opportunity Attack").length,
      1
    )
  })
  // Told never to take one, she is not asked, and he walks off untroubled.
  await inTheBattle(async (store, play) => {
    const reinhard = () => store.current().characters.find((c) => c.name === "Reinhard")!
    const silas = () => store.current().characters.find((c) => c.name === "Silas")!
    lyra(store).position = { x: reinhard().position!.x, y: reinhard().position!.y + 5 }
    silas().hasReplied = silas().isComplete = true
    store.save()
    await game(store, packs, walksOff())({ kind: "orders", turnId: store.current()._id, characterId: lyra(store).id, orders: { "opportunity-attack": "never" } })
    const was = store.current().story.length
    await play(walksOff())
    assert.equal(store.current().reaction, undefined)
    assert.equal(reinhard().isComplete, true)
    assert.equal(
      store
        .current()
        .story.slice(was)
        .filter((beat) => beat.kind === "feature").length,
      0
    )
  })
})

// The host's worker on a hosted game, with the local save as the website's store. It claims `jobs`, then a Continue it
// queues itself, the first only. `waits` is how many times it goes idle before it stops, sleeping `sleep` ms each time.
async function hostRun(store: LocalStore, jobs: HostJob[], llm: Llm, waits = 1, sleep = 0) {
  const queued: string[] = []
  const finished: { jobId: string; error?: string }[] = []
  const post: HostPost = async (_path, body) => {
    const b = body as { op: string; jobId: string; error?: string; turnId: string; kind: HostJob["kind"] }
    if (b.op === "claim") return { job: jobs.shift() ?? null }
    if (b.op === "queue") {
      queued.push(b.kind)
      if (queued.length === 1) jobs.push({ _id: "auto", adventureId: store.state!.adventure._id, turnId: b.turnId, kind: b.kind, userId: "local-player" })
      return { jobId: "auto" }
    }
    finished.push({ jobId: b.jobId, error: b.error })
    return { ok: true }
  }
  let left = waits
  await hostLoop({
    adventureId: store.state!.adventure._id,
    post,
    store,
    packs,
    llm,
    emit: () => {},
    stopped: () => left <= 0,
    wait: async () => {
      left--
      if (sleep) await new Promise((resolve) => setTimeout(resolve, sleep))
    },
  })
  return { queued, finished }
}

test("hosted: the worker waits on an offer, a guest's answer plays the turn on, and one that runs out is continued once", async () => {
  const offerLyra = async (store: LocalStore, play: (llm: Llm) => Promise<unknown>) => {
    const reinhard = store.current().characters.find((c) => c.name === "Reinhard")!
    lyra(store).position = { x: reinhard.position!.x, y: reinhard.position!.y + 5 }
    const silas = store.current().characters.find((c) => c.name === "Silas")!
    silas.hasReplied = silas.isComplete = true
    store.save()
    await play(walksOff())
    assert.ok(store.current().reaction)
  }
  // The round the offer stopped, which the host's GM may have ended since.
  const round = (store: LocalStore, id: string) => store.state!.turns.find((t) => t._id === id)!
  const struck = (store: LocalStore, id: string, from: number) =>
    round(store, id)
      .story.slice(from)
      .filter((beat) => beat.kind === "feature" && beat.name === "Opportunity Attack").length
  // The offer stands: the idle worker queues nothing. Lyra's player lets it pass, and Reinhard walks off unstruck.
  await inTheBattle(async (store, play) => {
    await offerLyra(store, play)
    const id = store.current()._id
    const was = store.current().story.length
    assert.deepEqual((await hostRun(store, [], walksOff())).queued, [])
    const userId = (lyra(store) as { userId?: string }).userId ?? "local-player"
    const answer: HostJob = { _id: "react", adventureId: store.state!.adventure._id, turnId: store.current()._id, kind: "react", userId, characterId: lyra(store).id, take: false }
    const { finished } = await hostRun(store, [answer], walksOff())
    assert.deepEqual(finished[0], { jobId: "react", error: undefined })
    assert.equal(round(store, id).reaction, undefined)
    assert.equal(round(store, id).characters.find((c) => c.name === "Reinhard")!.isComplete, true)
    assert.equal(struck(store, id, was), 0)
  })
  // No one answers. Once the wait runs out the idle worker queues one Continue, and her standing order strikes.
  await inTheBattle(async (store, play) => {
    await offerLyra(store, play)
    const id = store.current()._id
    const was = store.current().story.length
    store.current().reaction!.expiresAt = Date.now() + 30
    store.save()
    const { queued, finished } = await hostRun(store, [], walksOff(), 2, 60)
    assert.equal(queued[0], "continue")
    assert.equal(finished[0].error, undefined)
    assert.equal(round(store, id).reaction, undefined)
    assert.equal(struck(store, id, was), 1)
  })
})

test("the stage sends the elves off when they are paid, and lays out the fight's losers", () => {
  const exits = (id: string) => (sceneFor(id)!.staging as { exits?: { cast: string; when?: string; to?: string; via?: unknown[]; lands?: unknown; shot?: string }[] }).exits ?? []
  const paid = exits("the-transaction")
  assert.deepEqual(paid.map((e) => e.cast).sort(), ["npcs-1749184389465", "npcs-1749243735467", "npcs-1749243869357"])
  const intro = pack.artifacts.encounters["the-transaction"].sections.intro ?? ""
  for (const e of paid) {
    assert.ok(intro.includes(e.when!), "the cue is a line of the intro")
    assert.equal(e.to, "trail")
    assert.ok(e.via?.length, "by the gangway, not through the hull")
  }
  assert.deepEqual(
    exits("battle-on-the-boat").map((e) => [e.cast, e.when, e.to]),
    [
      ["npcs-1749163978757", undefined, undefined],
      ["npcs-1749181492795", undefined, "bow"],
    ]
  )
})

test("the fight is written to end with Lyra in the river, on a pier the tug has left", async () => {
  await inTheBattle(async (store, play) => {
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
    const stub = stubLlm(() => ({ nextEncounterId: "overboard", beats: [{ kind: "narration", text: "Reinhard heaves her over the rail." }], adventurePatch: {} }))
    const prompts: string[] = []
    await play({
      ...stub,
      generateObject: async (args) => {
        prompts.push(args.prompt)
        return stub.generateObject(args)
      },
    })
    const asked = prompts.find((p) => p.includes("most likely")) ?? ""
    assert.match(asked, /throw her over the side into the river and cast off with the crate for Kordavos\. This is the most likely way the fight ends/)
    assert.equal(store.current().encounterId, "overboard")
    assert.match(storyText(store.current().story), /The river closes over Lyra/)
    assert.deepEqual(
      store.current().characters.map((c) => c.type),
      ["pc", "pc", "pc"]
    )
    const scene = sceneFor("overboard")!
    assert.equal(scene.set.title, "The pier after the tug has gone")
    for (const gone of ["saloon", "crate", "cabinDoor", "bow", "stern"]) assert.equal(gone in scene.set.marks, false, gone)
    // On the pier Lyra stands at (-0.9, 5.6) metres and Thalbern at (-1.4, -6.4).
    const floor = await encounterFloor("overboard")
    assert.ok(floor)
    const placed = placeCharacters(store.current().characters, floor)
    const metresOf = (name: string) => {
      const at = placed.find((c) => c.name === name)?.position
      return at && [Math.round(metres(at.x) * 10) / 10, Math.round(metres(at.y) * 10) / 10]
    }
    assert.deepEqual(metresOf("Lyra Silvanus"), [-0.9, 5.6])
    assert.deepEqual(metresOf("Thalbern"), [-1.4, -6.4])
    const where = standingWords(placed, floor) ?? ""
    assert.match(where, /- Lyra Silvanus, /)
    assert.doesNotMatch(where, /the tug's saloon/)
  })
})

test("a fight the heroes win follows its own transition, however hurt they are", async () => {
  await inTheBattle(async (store, play) => {
    // Lyra takes 3 from the engine, short of 0.
    Object.assign(lyra(store), withDamage(lyra(store), 3).character)
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
    await play(stubLlm(() => ({ nextEncounterId: "the-crate", beats: [{ kind: "narration", text: "Reinhard falls." }], adventurePatch: {} })))
    assert.equal(store.current().encounterId, "the-crate")
  })
})
