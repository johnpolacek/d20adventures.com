import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { openingParty, partyOf, type Seat, seatCreated } from "../src/carry"
import { PREMADE_FIGURES } from "../src/figures"
import { partyScene, portraitFor, SCENES } from "../src/scenes"
import { adventureList, game, type Packs, transitionsOf } from "./game"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
const offline: Llm = { generateText: unused, generateObject: unused }
const list = adventureList(packs)
const info = (id: string) => list.find((a) => a.id === id)!
const [THALBERN, LYRA, POPPEN] = ["thalbern", "1749159962941", "1749307435667"]
const you = (id: string) => ({ id, ai: false })
const ai = (id: string) => ({ id, ai: true })

test("the three intro adventures lead into March of Davos, in order", () => {
  const chain = ["the-midnight-summons"]
  for (let next = info(chain[0]).next; next; next = info(next).next) chain.push(next)
  assert.deepEqual(chain, ["the-midnight-summons", "covert-cargo", "the-road-to-kordavos", "march-of-davos"])
  // Every adventure named as next is one the app bundles.
  for (const a of list) assert.ok(!a.next || packs[a.next], `${a.id} leads to ${a.next}`)
})

test("continuing the story keeps the heroes who can go on, on the seats they had", () => {
  // A fresh game is the suggested party, the player on its first hero.
  assert.deepEqual(openingParty(info("covert-cargo"), []), [you(LYRA), ai(POPPEN), ai(THALBERN)])
  assert.deepEqual(openingParty(info("covert-cargo"), [], []), [you(LYRA), ai(POPPEN), ai(THALBERN)])

  // The Midnight Summons into Covert Cargo: Thalbern stays the player's, and the others join on the AI.
  assert.deepEqual(openingParty(info("covert-cargo"), [], [you(THALBERN)]), [you(THALBERN), ai(LYRA), ai(POPPEN)])

  // Covert Cargo into The Road: the Road is played with heroes the player makes, so nobody goes on.
  assert.deepEqual(openingParty(info("the-road-to-kordavos"), [], [you(LYRA), you(POPPEN), ai(THALBERN)]), [])

  // The Road into March of Davos: the player's own heroes go on, and the authored companions fill the party.
  const roster = [
    { id: "hero-a", race: "Elf", archetype: "Wizard" },
    { id: "hero-b", race: "Dwarf", archetype: "Cleric" },
    { id: "hero-c", race: "Dragonborn", archetype: "Fighter" },
  ]
  assert.deepEqual(openingParty(info("march-of-davos"), roster, [you("hero-a")]), [you("hero-a"), ai("branka-stoneveil"), ai("cassia-verane"), ai("yeva-softstep")])
  assert.deepEqual(openingParty(info("march-of-davos"), roster, [ai("hero-b"), you("hero-a")]), [ai("hero-b"), you("hero-a"), ai("branka-stoneveil"), ai("cassia-verane")])
  // A hero the adventure does not accept, or one no longer in the roster, stays behind.
  assert.deepEqual(openingParty(info("march-of-davos"), roster, [you("hero-c"), ai("hero-gone")]), openingParty(info("march-of-davos"), roster))
  // The three from the pier can go straight on too, and a party the AI ran gives its first hero to the player.
  assert.deepEqual(openingParty(info("march-of-davos"), [], [ai(THALBERN), ai(LYRA), ai(POPPEN)]), [you(THALBERN), ai(LYRA), ai(POPPEN), ai("branka-stoneveil")])
  // Never more than the adventure seats.
  assert.equal(openingParty(info("march-of-davos"), [], [...info("march-of-davos").premades.map((p) => you(p.id))]).length, info("march-of-davos").players[1])
  assert.deepEqual(openingParty(undefined, roster, [you("hero-a")]), [])
})

test("a hero made on the party screen is the player's, and the hero they had goes to the AI", () => {
  const seat = (id: string, who: Seat["who"], open?: boolean): Seat => (open ? { id, who, open } : { id, who })
  const davos = openingParty(info("march-of-davos"), []).map((c) => seat(c.id, c.ai ? "ai" : "you"))
  assert.deepEqual(
    davos.map((c) => c.who),
    ["you", "ai", "ai", "ai"]
  )
  assert.deepEqual(seatCreated(davos, "hero-a", 5), [seat("branka-stoneveil", "ai"), ...davos.slice(1), seat("hero-a", "you")])
  // A full party: the new hero takes the player's seat.
  const full = [...davos, seat("wrenna-faelendar", "ai")]
  assert.deepEqual(seatCreated(full, "hero-a", 5), [seat("hero-a", "you"), ...full.slice(1)])
  // An invited game has no AI heroes, so the player's old hero leaves.
  const invited = [seat("branka-stoneveil", "you"), seat("cassia-verane", "invite"), seat("open-1", "invite", true)]
  assert.deepEqual(seatCreated(invited, "hero-a", 5), [seat("hero-a", "you"), ...invited.slice(1)])
  // With no hero of the player's, the new hero joins as any other, while there is room.
  const guests = [seat("branka-stoneveil", "invite"), seat("cassia-verane", "invite")]
  assert.deepEqual(seatCreated(guests, "hero-a", 3), [...guests, seat("hero-a", "you")])
  assert.deepEqual(seatCreated(guests, "hero-a", 2), guests)
  // Seated already: nothing changes.
  assert.deepEqual(seatCreated([seat("hero-a", "ai")], "hero-a", 5), [seat("hero-a", "ai")])
})

test("Lyra, Poppen and Thalbern can be played in March of Davos, and stand at the gate as themselves", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-carry-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "march-of-davos", party: [you(THALBERN), ai(LYRA), ai(POPPEN)] })
    // A round lists its characters in turn order, which the dice set.
    const pcs = store.current().characters.filter((c) => c.type === "pc")
    const pc = (id: string) => pcs.find((c) => c.id === id)!
    assert.deepEqual(pcs.map((c) => [c.name, c.controlledBy ?? "you"]).sort(), [
      ["Lyra Silvanus", "ai"],
      ["Poppen Quickfoot", "ai"],
      ["Thalbern", "you"],
    ])
    // Each sheet says why they have come into the city.
    assert.match(pc(THALBERN).background ?? "", /He has come to the city gates after it\./)
    assert.match(pc(LYRA).background ?? "", /thrown in the river/)
    assert.match(pc(POPPEN).background ?? "", /carried off downriver to Kordavos/)
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
    assert.deepEqual(partyOf(store.state!).sort(byId), [you(THALBERN), ai(LYRA), ai(POPPEN)].sort(byId))

    const scene = partyScene(SCENES["the-gates-of-kordavos"], store.current().characters)
    for (const pc of pcs) {
      const member = scene.staging.cast.find((m) => m.id === pc.id)
      assert.ok(member, `${pc.name} has no place at the gate`)
      assert.deepEqual(member.art, PREMADE_FIGURES[pc.id].art, pc.name)
      assert.equal(portraitFor(scene, pc), PREMADE_FIGURES[pc.id].art.portrait)
    }
    // The authored four they replaced are gone from the line.
    assert.ok(!scene.staging.cast.some((m) => ["branka", "cassia", "yeva", "milos"].includes(m.id)))
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
