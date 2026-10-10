import assert from "node:assert/strict"
import { test } from "node:test"
import { openSeats, seatHero, sheetId } from "./seats"

const seats = [
  { id: "poppen-quickfoot", name: "Poppen Quickfoot" },
  { id: "brakka", name: "Brakka", key: "characters/host/brakka.json" },
]
const host = { userId: "host", deviceId: "d" as never, seats }

test("a sheet id is read from a premade id or an account key", () => {
  assert.equal(sheetId("poppen-quickfoot"), "poppen-quickfoot")
  assert.equal(sheetId("characters/user_1/poppen-quickfoot.json"), "poppen-quickfoot")
})

test("a held seat is open until any player takes that hero", () => {
  const players = [{ userId: "host", characterId: "characters/host/lyra-silvanus.json" }]
  assert.deepEqual(openSeats({ host, players }), seats)
  const joined = [...players, { userId: "guest", characterId: "characters/guest/poppen-quickfoot.json" }]
  assert.deepEqual(openSeats({ host, players: joined }), [seats[1]])
  assert.deepEqual(openSeats({ host: undefined, players }), [])
})

test("a premade seat's hero comes from the adventure", async () => {
  const poppen = { id: "poppen-quickfoot", name: "Poppen Quickfoot" } as never
  assert.equal(await seatHero(seats[0], [poppen]), poppen)
  assert.equal(await seatHero(seats[0], []), null)
})
