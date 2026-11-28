import assert from "node:assert/strict"
import { test } from "node:test"
import {
  answerSeatRequest,
  broughtBy,
  guestSeat,
  guestSeats,
  hostSeated,
  hostWaits,
  hostWatches,
  joinHeldSeat,
  openLeft,
  openSeats,
  removeGuestFromTable,
  requestOpenSeat,
  seatHostAtStart,
  seatingOf,
  sheetId,
  type SeatedAdventure,
} from "@d20/gm-core/host/seating"

const seats = [
  { id: "branka", name: "Branka" },
  { id: "milos", name: "Milos" },
  { id: "thalbern", name: "Thalbern" },
]

test("seatingOf normalizes fixed, flex, and pick_first modes on read", () => {
  assert.equal(seatingOf(null), null)
  assert.equal(seatingOf({ userId: "host", seats, open: 2 })?.mode, "fixed")
  assert.equal(seatingOf({ userId: "host", seats, open: 2, flex: true })?.mode, "flex")
  assert.equal(seatingOf({ userId: "host", seats, pick: true, each: 1 })?.mode, "pick_first")
})

test("fixed mode counts held and open seats independently", () => {
  const adv: SeatedAdventure = {
    host: { userId: "host", seats: seats.slice(0, 2), open: 2, bring: 1 },
    players: [
      { userId: "host", characterId: "characters/host/host-hero.json" },
      { userId: "g1", characterId: "characters/g1/branka.json" },
      { userId: "g2", characterId: "characters/g2/custom-a.json" },
    ],
  }
  assert.equal(sheetId("characters/g1/branka.json"), "branka")
  assert.equal(hostSeated(adv), true)
  assert.equal(hostWaits(adv), false)
  assert.equal(hostWatches(adv), false)
  // g1 sits in a held seat, so only g2 consumes an open seat.
  assert.equal(openLeft(adv), 1)
  assert.deepEqual(
    openSeats(adv).map((s) => s.id),
    ["milos"]
  )
  assert.equal(broughtBy(adv, "g1").seated.length, 0)
  assert.equal(broughtBy(adv, "g2").seated.length, 1)
  assert.deepEqual(joinHeldSeat(adv, { userId: "g3", characterId: "characters/g3/milos.json" }), { ok: true, guarded: true })
  assert.deepEqual(joinHeldSeat(adv, { userId: "g3", characterId: "characters/g3/branka.json" }), {
    ok: false,
    error: "Character is already taken",
  })
  assert.deepEqual(joinHeldSeat(adv, { userId: "g3", characterId: "characters/g3/other.json" }), {
    ok: false,
    error: "This game's seats are held for other heroes",
  })
})

test("flex mode pools held and open seats under openLeft and bring", () => {
  const adv: SeatedAdventure = {
    host: { userId: "host", seats, open: 2, flex: true, bring: 2, approve: true, requests: [
      { userId: "g1", player: "G1", characterId: "characters/g1/custom.json", name: "Custom", status: "pending", at: 10 },
    ] },
    players: [
      { userId: "host", characterId: "characters/host/host-hero.json" },
      { userId: "g1", characterId: "characters/g1/branka.json" },
    ],
  }
  // g1 took a held hero; in flex mode that consumes 1 open seat AND 1 of g1's bring allowance.
  assert.equal(openLeft(adv), 1)
  assert.equal(broughtBy(adv, "g1").seated.length, 1)
  assert.equal(broughtBy(adv, "g1").pending.length, 1)
  // g1 already has 1 seated + 1 pending = 2 (limit), so taking another held seat fails.
  assert.deepEqual(joinHeldSeat(adv, { userId: "g1", characterId: "characters/g1/milos.json" }), {
    ok: false,
    error: "You have 2 heroes, as many as this table allows",
  })
  const view = guestSeat(adv, "g1")
  assert.equal(view.flex, true)
  assert.equal(view.bring, 0)
  assert.equal(view.more, 0)
  assert.deepEqual(view.pending, ["Custom"])

  // Once open seats are full, openSeats returns [] in flex mode.
  const full: SeatedAdventure = {
    ...adv,
    players: [...(adv.players ?? []), { userId: "g2", characterId: "characters/g2/milos.json" }],
  }
  assert.equal(openLeft(full), 0)
  assert.deepEqual(openSeats(full), [])
  assert.deepEqual(joinHeldSeat(full, { userId: "g3", characterId: "characters/g3/thalbern.json" }), {
    ok: false,
    error: "Every seat at this table is taken",
  })
})

test("pick_first mode keeps the last held hero for the waiting host and enforces each", () => {
  const adv: SeatedAdventure = {
    host: { userId: "host", seats, pick: true, each: 1 },
    players: [
      { userId: "host", characterId: "characters/host/ai.json", controlledBy: "ai" },
      { userId: "g1", characterId: "characters/g1/branka.json" },
    ],
  }
  assert.equal(hostSeated(adv), false)
  assert.equal(hostWaits(adv), true)
  assert.equal(hostWatches(adv), false)
  assert.deepEqual(
    guestSeats(adv).map((s) => s.id),
    ["milos", "thalbern"]
  )
  // g1 already took 1 held hero, hitting each = 1.
  assert.deepEqual(joinHeldSeat(adv, { userId: "g1", characterId: "characters/g1/milos.json" }), {
    ok: false,
    error: "Each guest plays 1 hero at this table",
  })
  assert.equal(guestSeat(adv, "g1").keep, 1)
  assert.equal(guestSeat(adv, "g1").more, 0)
  assert.equal(guestSeat(adv, "g2").more, 1)

  // Once a second guest takes milos, only 1 held hero remains — reserved for host.
  const oneLeft: SeatedAdventure = {
    ...adv,
    players: [...(adv.players ?? []), { userId: "g2", characterId: "characters/g2/milos.json" }],
  }
  assert.deepEqual(guestSeats(oneLeft), [])
  assert.deepEqual(joinHeldSeat(oneLeft, { userId: "g3", characterId: "characters/g3/thalbern.json" }), {
    ok: false,
    error: "Every seat at this table is taken",
  })

  // Host takes the remaining seat at start: host leads the party.
  const seated = seatHostAtStart(oneLeft, { userId: "host", characterId: "characters/host/thalbern.json" })
  assert.equal(seated.ok, true)
  assert.equal(seated.changed, true)
  if (seated.ok && seated.changed) {
    assert.equal(seated.players[0].characterId, "characters/host/thalbern.json")
  }
  // Calling again for same hero is an idempotent no-op.
  const afterStart: SeatedAdventure = { ...oneLeft, players: seated.ok && seated.changed ? seated.players : oneLeft.players }
  assert.equal(hostWaits(afterStart), false)
  assert.deepEqual(seatHostAtStart(afterStart, { userId: "host", characterId: "characters/host/thalbern.json" }), {
    ok: true,
    changed: false,
  })
})

test("requestOpenSeat, answerSeatRequest, and removeGuestFromTable enforce approval, replacement, and removal", () => {
  const base: SeatedAdventure = {
    host: { userId: "host", open: 2, bring: 1, approve: false },
    players: [{ userId: "host", characterId: "characters/host/h.json" }],
  }
  // Immediate seat when approve is false.
  const direct = requestOpenSeat(base, { userId: "g1", player: "Alice", characterId: "characters/g1/a.json", name: "Aria" }, 100)
  assert.equal(direct.ok, true)
  assert.equal(direct.ok && direct.seated, true)

  // Host removes g1.
  const withG1: SeatedAdventure = {
    ...base,
    players: [...(base.players ?? []), { userId: "g1", characterId: "characters/g1/a.json" }],
  }
  const removed = removeGuestFromTable(withG1, { hostUserId: "host", userId: "g1", name: "Aria", note: "Wrong level" }, 200)
  assert.equal(removed.ok, true)
  assert.deepEqual(removed.ok && removed.removed, ["g1"])

  // Removed guest cannot take a held seat and their next open-seat request requires approval even when approve=false.
  const afterRemove: SeatedAdventure = {
    host: { ...base.host!, seats, removed: removed.ok ? removed.removed : [], requests: removed.ok ? removed.requests : [] },
    players: base.players,
  }
  assert.deepEqual(joinHeldSeat(afterRemove, { userId: "g1", characterId: "characters/g1/branka.json" }), {
    ok: false,
    error: "The host removed you from this table",
  })
  const pendingReq = requestOpenSeat(afterRemove, { userId: "g1", player: "Alice", characterId: "characters/g1/b.json", name: "Bram", hook: "Debt" }, 300)
  assert.equal(pendingReq.ok, true)
  assert.equal(pendingReq.ok && pendingReq.seated, false)

  // Another request past limit=1 replaces their latest pending request.
  const withPending: SeatedAdventure = {
    ...afterRemove,
    host: { ...afterRemove.host!, requests: pendingReq.ok ? pendingReq.requests : [] },
  }
  const replaced = requestOpenSeat(withPending, { userId: "g1", player: "Alice", characterId: "characters/g1/c.json", name: "Cora", hook: "Oath" }, 400)
  assert.equal(replaced.ok, true)
  if (replaced.ok) {
    assert.deepEqual(
      replaced.requests.map((r) => r.name),
      ["Cora"]
    )
  }

  // Host approves Cora.
  const withReplaced: SeatedAdventure = {
    ...withPending,
    host: { ...withPending.host!, requests: replaced.ok ? replaced.requests : [] },
  }
  const approved = answerSeatRequest(withReplaced, { hostUserId: "host", userId: "g1", approve: true })
  assert.equal(approved.ok, true)
  assert.equal(approved.ok && approved.outcome, "approved")
  if (approved.ok && approved.outcome === "approved") {
    assert.deepEqual(approved.seated, { characterId: "characters/g1/c.json", hook: "Oath" })
  }

  // Rejecting records the trimmed note.
  const rejected = answerSeatRequest(withReplaced, { hostUserId: "host", userId: "g1", approve: false, note: "  Too stealthy  " })
  assert.equal(rejected.ok, true)
  if (rejected.ok && rejected.outcome === "rejected") {
    assert.equal(rejected.requests[0].status, "rejected")
    assert.equal(rejected.requests[0].note, "Too stealthy")
  }
})
