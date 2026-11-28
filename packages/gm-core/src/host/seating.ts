// Pure table seating policy machine for hosted games.
// Zero-import and ES2021-safe so both Convex (relative import) and Next/server code (@d20/gm-core/host/seating)
// share a single source of truth for held seats, open seats, flex seats, pick-first tables, and seat requests.

export type SeatEntry = {
  id: string
  name: string
  key?: string
}

export type SeatRequestStatus = "pending" | "rejected" | "removed"

export type SeatRequest = {
  userId: string
  player: string
  characterId: string
  name: string
  race?: string
  archetype?: string
  hook?: string
  status: SeatRequestStatus
  note?: string
  at: number
}

export type SeatRequestInput = Omit<SeatRequest, "status" | "note" | "at">

export type SeatedPlayer = {
  userId: string
  characterId: string
  controlledBy?: "ai" | "human" | string
}

export type HostedConfig = {
  userId: string
  seats?: SeatEntry[]
  open?: number
  flex?: boolean
  approve?: boolean
  pick?: boolean
  each?: number
  bring?: number
  removed?: string[]
  requests?: SeatRequest[]
}

export type SeatedAdventure = {
  host?: HostedConfig | null
  players?: SeatedPlayer[] | null
}

/**
 * Normalized seating policy for a hosted table, derived on read from the persisted `adventures.host` record:
 * - `flex`: open seats take both guests' own heroes and held heroes; `open` counts every guest seat.
 * - `pick_first`: guests choose among held heroes first; 1 held seat stays reserved for the host until seated.
 * - `fixed`: held seats are fixed invitations; `open` seats (if any) are separate seats for guests' own heroes.
 */
export type TableSeating =
  | {
      mode: "flex"
      hostUserId: string
      seats: SeatEntry[]
      open: number
      approve: boolean
      bring: number
      removed: string[]
      requests: SeatRequest[]
    }
  | {
      mode: "pick_first"
      hostUserId: string
      seats: SeatEntry[]
      open: number
      approve: boolean
      each?: number
      bring: number
      removed: string[]
      requests: SeatRequest[]
    }
  | {
      mode: "fixed"
      hostUserId: string
      seats: SeatEntry[]
      open: number
      approve: boolean
      bring: number
      removed: string[]
      requests: SeatRequest[]
    }

/** A character's sheet id, from its id or from its key in an account. */
export const sheetId = (characterId: string): string => characterId.split("/").pop()?.replace(".json", "") ?? ""

/** Normalizes a persisted `adventures.host` config into an explicit `TableSeating` union. */
export function seatingOf(host: HostedConfig | null | undefined): TableSeating | null {
  if (!host) return null
  const seats = host.seats ?? []
  const open = host.open ?? 0
  const approve = Boolean(host.approve)
  const bring = host.bring ?? 1
  const removed = host.removed ?? []
  const requests = host.requests ?? []
  if (host.flex) {
    return { mode: "flex", hostUserId: host.userId, seats, open, approve, bring, removed, requests }
  }
  if (host.pick) {
    return { mode: "pick_first", hostUserId: host.userId, seats, open, approve, each: host.each, bring, removed, requests }
  }
  return { mode: "fixed", hostUserId: host.userId, seats, open, approve, bring, removed, requests }
}

/** Whether the host plays a hero. AI heroes are filed under the host's account but are not theirs to play. */
export const hostSeated = (adventure: SeatedAdventure): boolean =>
  Boolean(adventure.players?.some((p) => p.userId === adventure.host?.userId && p.controlledBy !== "ai"))

/** Whether the host still waits for a hero: guests choose first, and the host plays a held hero they leave. */
export const hostWaits = (adventure: SeatedAdventure): boolean => {
  const seating = seatingOf(adventure.host)
  return Boolean(seating?.mode === "pick_first" && !hostSeated(adventure))
}

/** Whether the host only watches: they have no hero, and none is kept for them. */
export const hostWatches = (adventure: SeatedAdventure): boolean => {
  const seating = seatingOf(adventure.host)
  return Boolean(seating && seating.mode !== "pick_first" && !hostSeated(adventure))
}

/**
 * How many seats still take a guest's own hero. Every guest whose hero the host did not hold sits in one. Where open
 * seats also take held heroes (`flex`), every guest sits in one.
 */
export function openLeft(adventure: SeatedAdventure): number {
  const seating = seatingOf(adventure.host)
  if (!seating || !seating.open) return 0
  const held = new Set(seating.seats.map((s) => s.id))
  const filled = (adventure.players ?? []).filter(
    (p) => p.userId !== seating.hostUserId && (seating.mode === "flex" || !held.has(sheetId(p.characterId)))
  ).length
  return seating.open - filled
}

/** The heroes a guest brought to open seats, seated or waiting for the host. In `flex` mode, held heroes count too. */
export function broughtBy<P extends SeatedPlayer, R extends SeatRequest>(
  adventure: { host?: (Omit<HostedConfig, "requests"> & { requests?: R[] }) | null; players?: P[] | null },
  userId: string
): { seated: P[]; pending: R[] } {
  const seating = seatingOf(adventure.host)
  const held = new Set((seating?.seats ?? []).map((s) => s.id))
  const isFlex = seating?.mode === "flex"
  const seated = (adventure.players ?? []).filter((p) => p.userId === userId && (isFlex || !held.has(sheetId(p.characterId))))
  const pending = (adventure.host?.requests ?? ([] as R[])).filter((r) => r.userId === userId && r.status === "pending")
  return { seated, pending }
}

/** The held seats nobody has taken yet. Where open seats also take held heroes, none once those seats are full. */
export function openSeats<S extends SeatEntry>(
  adventure: { host?: (Omit<HostedConfig, "seats"> & { seats?: S[] }) | null; players?: SeatedPlayer[] | null }
): S[] {
  const seating = seatingOf(adventure.host)
  if (!seating) return []
  if (seating.mode === "flex" && openLeft(adventure) < 1) return []
  return (adventure.host?.seats ?? ([] as S[])).filter((s) => !adventure.players?.some((p) => sheetId(p.characterId) === s.id))
}

/** The held seats a guest may take. While the host waits for a hero, the last one is theirs. */
export function guestSeats<S extends SeatEntry>(
  adventure: { host?: (Omit<HostedConfig, "seats"> & { seats?: S[] }) | null; players?: SeatedPlayer[] | null }
): S[] {
  const open = openSeats(adventure)
  return hostWaits(adventure) && open.length < 2 ? [] : open
}

export type GuestSeat = {
  open: number
  flex: boolean
  approve: boolean
  removed: boolean
  keep: number
  more: number
  bring: number
  pending: string[]
  request: { name: string; status: SeatRequestStatus; note?: string } | undefined
}

/**
 * What a guest sees of the seats: how many take a hero of their own, whether the host approves theirs, whether the
 * host removed them, how many held seats are kept for the host, how many more held heroes they may take, how many
 * more of their own heroes they may bring, the heroes waiting on the host, and their latest request with the host's answer.
 */
export function guestSeat(adventure: SeatedAdventure, userId: string | null | undefined): GuestSeat {
  const seating = seatingOf(adventure.host)
  const theirs = userId ? (seating?.requests ?? []).filter((r) => r.userId === userId).slice().sort((a, b) => a.at - b.at) : []
  const request = theirs[theirs.length - 1]
  const pending = theirs.filter((r) => r.status === "pending").map((r) => r.name)
  const removed = Boolean(userId && seating?.removed.includes(userId))
  const keep = hostWaits(adventure) ? 1 : 0
  const held = new Set((seating?.seats ?? []).map((s) => s.id))
  const taken = (adventure.players ?? []).filter((p) => p.userId === userId && held.has(sheetId(p.characterId))).length
  const brought = userId ? broughtBy(adventure, userId) : { seated: [], pending: [] }
  const bring = userId ? Math.max(0, (seating?.bring ?? 1) - (brought.seated.length + brought.pending.length)) : 0
  const more =
    seating?.mode === "flex"
      ? bring
      : keep && seating?.mode === "pick_first" && seating.each && userId
        ? Math.max(0, seating.each - taken)
        : 0
  return {
    open: openLeft(adventure),
    flex: seating?.mode === "flex",
    approve: Boolean(seating?.approve) || removed,
    removed,
    keep,
    more,
    bring,
    pending,
    request: request && { name: request.name, status: request.status, note: request.note },
  }
}

export type SeatTransitionError = { ok: false; error: string }

/**
 * Checks whether a guest can join a hosted table by taking a held seat (`joinAdventure`).
 * Returns `{ ok: true, guarded: false }` when the adventure is not a seated hosted game.
 */
export function joinHeldSeat(
  adventure: SeatedAdventure,
  args: { userId: string; characterId: string }
): { ok: true; guarded: boolean } | SeatTransitionError {
  const seating = seatingOf(adventure.host)
  if (!seating || (!seating.seats.length && !seating.open)) return { ok: true, guarded: false }
  if (seating.removed.includes(args.userId)) return { ok: false, error: "The host removed you from this table" }
  const hero = sheetId(args.characterId)
  if (!seating.seats.some((s) => s.id === hero)) return { ok: false, error: "This game's seats are held for other heroes" }
  const players = adventure.players ?? []
  if (players.some((p) => sheetId(p.characterId) === hero)) return { ok: false, error: "Character is already taken" }
  if (seating.mode === "flex") {
    if (openLeft(adventure) < 1) return { ok: false, error: "Every seat at this table is taken" }
    const { seated, pending } = broughtBy(adventure, args.userId)
    if (seated.length + pending.length >= seating.bring) {
      return {
        ok: false,
        error: seating.bring === 1 ? "You are already in this game" : `You have ${seating.bring} heroes, as many as this table allows`,
      }
    }
  }
  if (seating.mode === "pick_first" && !hostSeated(adventure)) {
    const left = openSeats(adventure).length
    if (left < 2) return { ok: false, error: "Every seat at this table is taken" }
    const taken = players.filter((p) => p.userId === args.userId && seating.seats.some((s) => s.id === sheetId(p.characterId))).length
    if (seating.each && taken >= seating.each) {
      return { ok: false, error: `Each guest plays ${seating.each} ${seating.each === 1 ? "hero" : "heroes"} at this table` }
    }
  }
  return { ok: true, guarded: true }
}

export type RequestOpenSeatResult =
  | { ok: true; seated: false; requests: SeatRequest[] }
  | { ok: true; seated: true; requests: SeatRequest[]; addedPlayer: { userId: string; characterId: string } }
  | SeatTransitionError

/**
 * Pure transition for a guest requesting an open seat with a hero of their own.
 * Seats immediately unless the table requires approval or the guest was previously removed.
 */
export function requestOpenSeat(adventure: SeatedAdventure, request: SeatRequestInput, now: number): RequestOpenSeatResult {
  const seating = seatingOf(adventure.host)
  if (!seating) return { ok: false, error: "This adventure is not hosted" }
  if (openLeft(adventure) < 1) return { ok: false, error: "This game has no open seat" }
  const hero = sheetId(request.characterId)
  if (seating.seats.some((s) => s.id === hero) || adventure.players?.some((p) => sheetId(p.characterId) === hero)) {
    return { ok: false, error: "That hero is already at this table" }
  }
  const limit = seating.bring
  const { seated, pending } = broughtBy(adventure, request.userId)
  if (seated.length >= limit) {
    return {
      ok: false,
      error: limit === 1 ? "You are already in this game" : `You have brought ${limit} heroes, as many as this table allows`,
    }
  }
  const replaced = seated.length + pending.length >= limit ? pending[pending.length - 1] : undefined
  const kept = seating.requests.filter((r) => r.userId !== request.userId || (r.status === "pending" && r !== replaced && sheetId(r.characterId) !== hero))
  if (seating.approve || seating.removed.includes(request.userId)) {
    return { ok: true, seated: false, requests: [...kept, { ...request, status: "pending", at: now }] }
  }
  return { ok: true, seated: true, requests: kept, addedPlayer: { userId: request.userId, characterId: request.characterId } }
}

export type AnswerSeatRequestResult =
  | { ok: true; outcome: "rejected"; requests: SeatRequest[] }
  | { ok: true; outcome: "already_seated"; requests: SeatRequest[] }
  | { ok: true; outcome: "approved"; requests: SeatRequest[]; addedPlayer: { userId: string; characterId: string }; seated: { characterId: string; hook?: string } }
  | SeatTransitionError

/** Pure transition for a host approving or rejecting a guest's pending open-seat request. */
export function answerSeatRequest(
  adventure: SeatedAdventure,
  args: { hostUserId: string; userId: string; characterId?: string; approve: boolean; note?: string }
): AnswerSeatRequestResult {
  const seating = seatingOf(adventure.host)
  if (!seating) return { ok: false, error: "This adventure is not hosted" }
  if (seating.hostUserId !== args.hostUserId) return { ok: false, error: "You are not hosting this adventure" }
  const request = seating.requests.find(
    (r) => r.userId === args.userId && r.status === "pending" && (!args.characterId || sheetId(r.characterId) === sheetId(args.characterId))
  )
  if (!request) return { ok: false, error: "That request is no longer waiting" }
  const others = seating.requests.filter((r) => r !== request)
  if (!args.approve) {
    const rejected: SeatRequest = { ...request, status: "rejected", note: args.note?.trim().slice(0, 300) || undefined }
    return { ok: true, outcome: "rejected", requests: [...others, rejected] }
  }
  if (adventure.players?.some((p) => sheetId(p.characterId) === sheetId(request.characterId))) {
    return { ok: true, outcome: "already_seated", requests: others }
  }
  if (openLeft(adventure) < 1) return { ok: false, error: "This game has no open seat" }
  if (broughtBy(adventure, args.userId).seated.length >= seating.bring) {
    return { ok: false, error: "This guest has brought as many heroes as the table allows" }
  }
  return {
    ok: true,
    outcome: "approved",
    requests: others,
    addedPlayer: { userId: args.userId, characterId: request.characterId },
    seated: { characterId: request.characterId, hook: request.hook },
  }
}

export type RemoveGuestResult =
  | { ok: true; removed: string[]; requests: SeatRequest[]; removedUserId: string }
  | SeatTransitionError

/** Pure transition for a host removing a seated guest before the game starts. */
export function removeGuestFromTable(
  adventure: SeatedAdventure,
  args: { hostUserId: string; userId: string; name: string; note?: string },
  now: number
): RemoveGuestResult {
  const seating = seatingOf(adventure.host)
  if (!seating) return { ok: false, error: "This adventure is not hosted" }
  if (seating.hostUserId !== args.hostUserId) return { ok: false, error: "You are not hosting this adventure" }
  const seated = adventure.players?.find((p) => p.userId === args.userId)
  if (!seated || args.userId === seating.hostUserId) return { ok: false, error: "That guest is not at this table" }
  const record: SeatRequest = {
    userId: args.userId,
    player: "",
    characterId: seated.characterId,
    name: args.name,
    status: "removed",
    note: args.note?.trim().slice(0, 300) || undefined,
    at: now,
  }
  const removed = seating.removed.includes(args.userId) ? seating.removed : [...seating.removed, args.userId]
  return {
    ok: true,
    removed,
    requests: [...seating.requests.filter((r) => r.userId !== args.userId), record],
    removedUserId: args.userId,
  }
}

export type SeatHostAtStartResult<P extends SeatedPlayer = SeatedPlayer> =
  | { ok: true; changed: false }
  | { ok: true; changed: true; players: (P | { userId: string; characterId: string; controlledBy?: "ai" })[] }
  | SeatTransitionError

/** Pure transition for seating the host (or an AI hero) into an unchosen held seat at game start. */
export function seatHostAtStart<P extends SeatedPlayer>(
  adventure: { host?: HostedConfig | null; players?: P[] | null },
  args: { userId: string; characterId: string; ai?: boolean }
): SeatHostAtStartResult<P> {
  const seating = seatingOf(adventure.host)
  if (!seating) return { ok: false, error: "This adventure is not hosted" }
  if (seating.hostUserId !== args.userId) return { ok: false, error: "You are not hosting this adventure" }
  const hero = sheetId(args.characterId)
  const players = adventure.players ?? []
  if (players.some((p) => p.userId === args.userId && sheetId(p.characterId) === hero)) {
    return { ok: true, changed: false }
  }
  if (!seating.seats.some((s) => s.id === hero) || players.some((p) => sheetId(p.characterId) === hero)) {
    return { ok: false, error: "That hero is not open" }
  }
  const nextPlayers: (P | { userId: string; characterId: string; controlledBy?: "ai" })[] = args.ai
    ? [...players, { userId: args.userId, characterId: args.characterId, controlledBy: "ai" }]
    : [{ userId: args.userId, characterId: args.characterId }, ...players]
  return { ok: true, changed: true, players: nextPlayers }
}
